const Wallet = require("../wallet/model");
const NFTAsset = require("./model");
const NFTCollection = require("./nftCollection.model");
const NFTSyncState = require("./nftSyncState.model");
const Transaction = require("../transaction/model");
const { Types } = require("mongoose");
const polygonNftAdapter = require("../chainAdapters/polygon/nft");
const transferService = require("./transfer.service");
const {
  normalizeAddress,
  mapAlchemyNFTToAsset,
  mapAlchemyCollection,
  parseCompositeId,
} = require("./mapper");
const {
  getNftStandardStorageVariants,
  normalizeNftContractAddress,
  normalizeNftStandard,
  normalizeNftTokenId,
} = require("./history.utils");
const logger = require("../../common/utils/logger");
const { AppError } = require("../../helpers/errors");

const SUPPORTED_CHAIN = "polygon";
const DEFAULT_LIST_LIMIT = 24;
const MAX_LIST_LIMIT = 50;
const MAX_SEARCH_LENGTH = 120;
const DEFAULT_SYNC_TTL_SECONDS = 600;
const DEFAULT_PROVIDER_PAGE_SIZE = 100;
const DEFAULT_MAX_PROVIDER_PAGES = 50;
const MAX_PROVIDER_PAGES = 250;

function getSyncTtlSeconds() {
  const parsed = Number.parseInt(
    String(process.env.NFT_SYNC_TTL_SECONDS || DEFAULT_SYNC_TTL_SECONDS),
    10,
  );
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return DEFAULT_SYNC_TTL_SECONDS;
  }

  return parsed;
}

function getProviderPageSize() {
  const parsed = Number.parseInt(
    String(process.env.NFT_PAGE_SIZE || DEFAULT_PROVIDER_PAGE_SIZE),
    10,
  );
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return DEFAULT_PROVIDER_PAGE_SIZE;
  }

  return Math.min(parsed, 100);
}

function getProviderMaxPages() {
  const parsed = Number.parseInt(
    String(process.env.ALCHEMY_NFT_MAX_PAGES || DEFAULT_MAX_PROVIDER_PAGES),
    10,
  );

  if (!Number.isFinite(parsed) || parsed <= 0) {
    return DEFAULT_MAX_PROVIDER_PAGES;
  }

  return Math.min(parsed, MAX_PROVIDER_PAGES);
}

function normalizeChain(chain = SUPPORTED_CHAIN) {
  const normalized = String(chain || SUPPORTED_CHAIN)
    .trim()
    .toLowerCase();

  if (normalized !== SUPPORTED_CHAIN) {
    throw AppError.validation(`Unsupported NFT chain "${chain}"`);
  }

  return normalized;
}

function normalizeListPage(page) {
  const parsed = Number.parseInt(String(page || 1).trim(), 10);

  if (!Number.isFinite(parsed) || parsed <= 0) {
    return 1;
  }

  return parsed;
}

function normalizeListLimit(limit) {
  const parsed = Number.parseInt(
    String(limit || DEFAULT_LIST_LIMIT).trim(),
    10,
  );

  if (!Number.isFinite(parsed) || parsed <= 0) {
    return DEFAULT_LIST_LIMIT;
  }

  return Math.min(parsed, MAX_LIST_LIMIT);
}

function escapeRegex(value) {
  return String(value || "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function normalizeOptionalString(value, maxLength = MAX_SEARCH_LENGTH) {
  if (value === undefined || value === null) {
    return "";
  }

  const normalized = String(value).trim();
  if (!normalized) {
    return "";
  }

  return normalized.slice(0, maxLength);
}

function normalizeSyncStatus(value, fallback = "") {
  return normalizeOptionalString(value, 32).toLowerCase() || fallback;
}

function isTokenIdSearchCandidate(value) {
  const normalized = normalizeOptionalString(value, 256);

  return /^\d+$/.test(normalized) || /^0x[0-9a-f]+$/i.test(normalized);
}

function normalizeSearchTokenId(value) {
  if (!isTokenIdSearchCandidate(value)) {
    return null;
  }

  return normalizeNftTokenId(value);
}

function buildExactCaseInsensitiveMatch(value) {
  return {
    $regex: `^${escapeRegex(value)}$`,
    $options: "i",
  };
}

function buildNftSearchConditions(search, { includeCollectionName = true } = {}) {
  if (!search) {
    return [];
  }

  const escapedSearch = escapeRegex(search);
  const tokenIdSearch = normalizeSearchTokenId(search);
  const conditions = [
    {
      name: {
        $regex: escapedSearch,
        $options: "i",
      },
    },
  ];

  if (includeCollectionName) {
    conditions.push({
      collectionName: {
        $regex: escapedSearch,
        $options: "i",
      },
    });
  }

  if (tokenIdSearch) {
    conditions.push({
      tokenId: tokenIdSearch,
    });
  }

  return conditions;
}

function resolveListSort({ sortBy, sortOrder }) {
  const normalizedSortBy = normalizeOptionalString(sortBy, 32);
  const normalizedSortOrder = normalizeOptionalString(sortOrder, 8).toLowerCase();
  const direction = normalizedSortOrder === "asc" ? 1 : -1;

  if (!normalizedSortBy) {
    return {
      sort: {
        isVerified: -1,
        isSpam: 1,
        lastSyncedAt: -1,
        createdAt: -1,
        _id: -1,
      },
      collation: null,
    };
  }

  if (normalizedSortBy === "createdAt") {
    return {
      sort: {
        createdAt: direction,
        _id: direction,
      },
      collation: null,
    };
  }

  if (normalizedSortBy === "lastTransferAt") {
    return {
      sort: {
        lastTransferAt: direction,
        createdAt: -1,
        _id: direction,
      },
      collation: null,
    };
  }

  return {
    sort: {
      name: direction,
      createdAt: -1,
      _id: direction,
    },
    collation: {
      locale: "en",
      strength: 1,
    },
  };
}

function buildListWalletNftsQuery({
  userId,
  walletId,
  chain,
  showHidden,
  showSpam,
  search,
  contractAddress,
  collectionName,
  standard,
}) {
  const query = {
    userId,
    walletId,
    chain,
  };

  if (!showHidden) {
    query.isHidden = { $ne: true };
  }

  if (!showSpam) {
    query.isSpam = { $ne: true };
  }

  if (contractAddress) {
    query.contractAddress = normalizeNftContractAddress(contractAddress);
  }

  if (collectionName) {
    // Keep structured collection filtering exact; broader collection discovery
    // belongs to the shared `search` parameter.
    query.collectionName = buildExactCaseInsensitiveMatch(collectionName);
  }

  if (standard) {
    query.standard = {
      $in: getNftStandardStorageVariants(normalizeNftStandard(standard)),
    };
  }

  if (search) {
    query.$or = buildNftSearchConditions(search, {
      includeCollectionName: true,
    });
  }

  return query;
}

function buildCollectionDetailItemsQuery({
  userId,
  walletId,
  chain,
  showHidden,
  showSpam,
  contractAddress,
  standard,
  search,
}) {
  const query = {
    userId,
    walletId,
    chain,
    contractAddress: normalizeNftContractAddress(contractAddress),
  };

  if (!showHidden) {
    query.isHidden = { $ne: true };
  }

  if (!showSpam) {
    query.isSpam = { $ne: true };
  }

  if (standard) {
    query.standard = {
      $in: getNftStandardStorageVariants(normalizeNftStandard(standard)),
    };
  }

  if (search) {
    query.$or = buildNftSearchConditions(search, {
      includeCollectionName: false,
    });
  }

  return query;
}

function buildCollectionSummaryQuery({
  userId,
  walletId,
  chain,
  showHidden,
  showSpam,
  search,
  contractAddress,
  collectionName,
  standard,
}) {
  const query = {
    userId,
    walletId,
    chain,
  };

  if (!showHidden) {
    query.isHidden = { $ne: true };
  }

  if (!showSpam) {
    query.isSpam = { $ne: true };
  }

  if (contractAddress) {
    query.contractAddress = normalizeNftContractAddress(contractAddress);
  }

  if (collectionName) {
    query.collectionName = buildExactCaseInsensitiveMatch(collectionName);
  }

  if (standard) {
    query.standard = {
      $in: getNftStandardStorageVariants(normalizeNftStandard(standard)),
    };
  }

  if (search) {
    const escapedSearch = escapeRegex(search);
    query.$or = [
      {
        collectionName: {
          $regex: escapedSearch,
          $options: "i",
        },
      },
      {
        contractAddress: {
          $regex: escapedSearch,
          $options: "i",
        },
      },
    ];
  }

  return query;
}

function buildCollectionSortStages({ sortBy, sortOrder }) {
  const normalizedSortBy = normalizeOptionalString(sortBy, 32);
  const normalizedSortOrder = normalizeOptionalString(sortOrder, 8).toLowerCase();
  const direction = normalizedSortOrder === "asc" ? 1 : -1;

  if (!normalizedSortBy) {
    return {
      groupSort: {
        lastTransferAt: -1,
        createdAt: -1,
        contractAddress: 1,
      },
    };
  }

  if (normalizedSortBy === "createdAt") {
    return {
      groupSort: {
        createdAt: direction,
        contractAddress: 1,
      },
    };
  }

  if (normalizedSortBy === "count") {
    return {
      groupSort: {
        count: direction,
        lastTransferAt: -1,
        createdAt: -1,
        contractAddress: 1,
      },
    };
  }

  if (normalizedSortBy === "collectionName") {
    return {
      groupSort: {
        collectionNameSortKey: direction,
        count: -1,
        contractAddress: 1,
      },
    };
  }

  return {
    groupSort: {
      lastTransferAt: direction,
      createdAt: -1,
      contractAddress: 1,
    },
  };
}

function resolveCollectionName(primary, fallback = "") {
  const normalizedPrimary = normalizeOptionalString(primary, 255);
  if (normalizedPrimary) {
    return normalizedPrimary;
  }

  return normalizeOptionalString(fallback, 255);
}

function resolveCollectionImage(primary, fallback = null) {
  const normalizedPrimary = normalizeOptionalString(primary, 2048);
  if (normalizedPrimary) {
    return normalizedPrimary;
  }

  const normalizedFallback = normalizeOptionalString(fallback, 2048);
  return normalizedFallback || null;
}

function mapCollectionSummary(item = {}, collectionDoc = null) {
  const standards = Array.isArray(item.standards)
    ? item.standards
        .map((value) => normalizeOptionalString(value, 32))
        .filter(Boolean)
        .sort()
    : [];
  const collectionName = resolveCollectionName(
    collectionDoc?.name,
    item.collectionName || item.collectionSymbol || "",
  );
  const symbol = resolveCollectionName(
    collectionDoc?.symbol,
    item.collectionSymbol || "",
  );
  const previewImageUrl = resolveCollectionImage(
    collectionDoc?.logoUrl,
    item.previewImageUrl || item.previewOriginalImageUrl || null,
  );

  return {
    id: `${String(item.chain || "").toLowerCase()}:${String(item.contractAddress || "").toLowerCase()}`,
    chain: String(item.chain || "").toLowerCase(),
    contractAddress: String(item.contractAddress || "").toLowerCase(),
    standard: standards.length === 1 ? standards[0] : null,
    standards,
    name: collectionName,
    collectionName,
    symbol,
    count: Number(item.count || 0),
    previewImageUrl,
    previewOriginalImageUrl:
      resolveCollectionImage(item.previewOriginalImageUrl) || previewImageUrl,
    logoUrl: previewImageUrl,
    bannerUrl: resolveCollectionImage(collectionDoc?.bannerUrl),
    description: resolveCollectionName(collectionDoc?.description, ""),
    isVerified: Boolean(collectionDoc?.isVerified),
    isSpam: Boolean(collectionDoc?.isSpam),
    isHidden: Boolean(collectionDoc?.isHidden),
    lastTransferAt: item.lastTransferAt || null,
    createdAt: item.createdAt || null,
    updatedAt: item.updatedAt || null,
    lastSyncedAt: item.latestSyncedAt || collectionDoc?.lastSyncedAt || null,
  };
}

function buildWalletNftSyncMeta({ wallet, syncState }) {
  const provisioningSync =
    wallet?.metadata?.provisioning?.sync &&
    typeof wallet.metadata.provisioning.sync === "object"
      ? wallet.metadata.provisioning.sync
      : {};
  const lastSyncedAt = syncState?.lastSyncedAt || null;
  const isSyncing = syncState?.isSyncing === true;
  const needsRefresh = syncState?.needsRefresh === true;
  const hydrationPending = provisioningSync.hydrationPending === true;
  let status = "idle";

  if (isSyncing) {
    status = "syncing";
  } else if (needsRefresh) {
    status = "stale";
  } else if (hydrationPending && !lastSyncedAt) {
    status = "pending";
  } else if (lastSyncedAt) {
    status = "success";
  }

  const provisioningStatus = normalizeSyncStatus(provisioningSync.status);
  if (status === "idle" && provisioningStatus === "failed") {
    status = "pending";
  }

  return {
    status,
    lastSyncedAt,
    needsRefresh,
    isSyncing,
    hydrationPending,
  };
}

async function aggregateCollectionSummaries({
  matchQuery,
  groupSort,
  skip,
  limit,
}) {
  const result = await NFTAsset.aggregate([
    {
      $match: matchQuery,
    },
    {
      $addFields: {
        _hasCollectionName: {
          $cond: [
            {
              $gt: [
                {
                  $strLenCP: {
                    $ifNull: ["$collectionName", ""],
                  },
                },
                0,
              ],
            },
            1,
            0,
          ],
        },
        _hasPreviewImage: {
          $cond: [
            {
              $gt: [
                {
                  $strLenCP: {
                    $ifNull: [
                      {
                        $ifNull: ["$thumbnailUrl", "$imageUrl"],
                      },
                      "",
                    ],
                  },
                },
                0,
              ],
            },
            1,
            0,
          ],
        },
      },
    },
    {
      $sort: {
        _hasCollectionName: -1,
        _hasPreviewImage: -1,
        lastTransferAt: -1,
        createdAt: -1,
        _id: 1,
      },
    },
    {
      $group: {
        _id: {
          chain: "$chain",
          contractAddress: "$contractAddress",
        },
        chain: { $first: "$chain" },
        contractAddress: { $first: "$contractAddress" },
        standards: { $addToSet: "$standard" },
        collectionName: { $first: "$collectionName" },
        collectionSymbol: { $first: "$collectionSymbol" },
        previewImageUrl: { $first: "$thumbnailUrl" },
        previewOriginalImageUrl: { $first: "$imageUrl" },
        count: { $sum: 1 },
        lastTransferAt: { $max: "$lastTransferAt" },
        latestSyncedAt: { $max: "$lastSyncedAt" },
        createdAt: { $min: "$createdAt" },
        updatedAt: { $max: "$updatedAt" },
      },
    },
    {
      $addFields: {
        collectionNameSortKey: {
          $toLower: {
            $ifNull: ["$collectionName", ""],
          },
        },
      },
    },
    {
      $facet: {
        items: [
          { $sort: groupSort },
          { $skip: skip },
          { $limit: limit },
        ],
        total: [{ $count: "count" }],
      },
    },
  ]);

  return {
    items: result?.[0]?.items || [],
    total: Number(result?.[0]?.total?.[0]?.count || 0),
  };
}

async function hydrateCollectionSummaries(chain, grouped) {
  if (!Array.isArray(grouped) || grouped.length === 0) {
    return [];
  }

  const contractAddresses = grouped.map((item) => item.contractAddress);
  const collections = await NFTCollection.find({
    chain,
    contractAddress: { $in: contractAddresses },
  }).lean();

  const collectionMap = new Map(
    collections.map((item) => [
      String(item.contractAddress || "").toLowerCase(),
      item,
    ]),
  );

  return grouped.map((item) => {
    const collectionDoc =
      collectionMap.get(String(item.contractAddress || "").toLowerCase()) ||
      null;

    return mapCollectionSummary(item, collectionDoc);
  });
}

async function findWalletCollectionSummary({
  userId,
  walletId,
  chain,
  showHidden,
  showSpam,
  contractAddress,
  standard = "",
}) {
  const matchQuery = buildCollectionSummaryQuery({
    userId,
    walletId,
    chain,
    showHidden,
    showSpam,
    search: "",
    contractAddress,
    collectionName: "",
    standard,
  });
  const { groupSort } = buildCollectionSortStages({
    sortBy: "",
    sortOrder: "desc",
  });
  const aggregated = await aggregateCollectionSummaries({
    matchQuery,
    groupSort,
    skip: 0,
    limit: 1,
  });
  const hydrated = await hydrateCollectionSummaries(chain, aggregated.items);

  return hydrated[0] || null;
}

function isSyncFresh(syncState, ttlSeconds = getSyncTtlSeconds()) {
  if (!syncState) {
    return false;
  }

  if (
    syncState.needsRefresh === true ||
    String(syncState.status || "")
      .trim()
      .toLowerCase() === "stale"
  ) {
    return false;
  }

  const lastSyncedAt = syncState.lastSyncedAt;
  if (!lastSyncedAt) {
    return false;
  }

  const value = new Date(lastSyncedAt);
  if (Number.isNaN(value.getTime())) {
    return false;
  }

  return Date.now() - value.getTime() < ttlSeconds * 1000;
}

function toObjectIdString(value) {
  return value ? String(value) : null;
}

function mapAssetResponse(doc) {
  return {
    _id: String(doc._id),
    id: doc.appId,
    nftId: String(doc._id),
    walletId: toObjectIdString(doc.walletId),
    accountId: toObjectIdString(doc.accountId),
    chain: doc.chain,
    contractAddress: doc.contractAddress,
    tokenId: doc.tokenId,
    standard: doc.standard,
    balance: doc.balance,
    ownerAddress: doc.ownerAddress,
    collectionName: doc.collectionName || "",
    collectionSymbol: doc.collectionSymbol || "",
    name: doc.name || "",
    description: doc.description || "",
    imageUrl: doc.imageUrl || null,
    thumbnailUrl: doc.thumbnailUrl || null,
    imageOriginalUrl: doc.imageOriginalUrl || null,
    metadataUrl: doc.metadataUrl || null,
    attributes: Array.isArray(doc.attributes) ? doc.attributes : [],
    isVerified: Boolean(doc.isVerified),
    isSpam: Boolean(doc.isSpam),
    isHidden: Boolean(doc.isHidden),
    mintedAt: doc.mintedAt || null,
    lastTransferAt: doc.lastTransferAt || null,
    lastSyncedAt: doc.lastSyncedAt || null,
    createdAt: doc.createdAt || null,
    updatedAt: doc.updatedAt || null,
  };
}

function mapActivityEvent(tx) {
  return {
    transactionId: String(tx._id),
    txHash: tx.txHash || null,
    direction: tx.direction,
    fromAddress: tx.fromAddress,
    toAddress: tx.toAddress,
    status: tx.status,
    chainStatus: tx.chainStatus,
    standard: tx.standard || tx.metadata?.nft?.standard || null,
    contractAddress: tx.contractAddress,
    tokenId: tx.metadata?.nft?.tokenId || null,
    amount: tx.amount || "1",
    transactionType: tx.transactionType,
    chain: tx.chain,
    network: tx.network,
    chainTimestamp: tx.chainTimestamp
      ? new Date(tx.chainTimestamp).toISOString()
      : null,
    confirmedAt: tx.confirmedAt ? new Date(tx.confirmedAt).toISOString() : null,
    createdAt: tx.createdAt ? new Date(tx.createdAt).toISOString() : null,
    displayTimestamp:
      tx.chainTimestamp || tx.confirmedAt || tx.createdAt
        ? new Date(
            tx.chainTimestamp || tx.confirmedAt || tx.createdAt,
          ).toISOString()
        : null,
    explorerUrl: null,
  };
}

async function resolveOwnedWallet({ userId, walletId }) {
  const wallet = await Wallet.findOne({
    _id: walletId,
    userId,
  }).lean();

  if (!wallet) {
    throw AppError.notFound("Wallet not found");
  }

  if (String(wallet.chain || "").toLowerCase() !== SUPPORTED_CHAIN) {
    throw AppError.validation(
      "NFT viewer currently supports Polygon wallets only",
    );
  }

  if (!wallet.address) {
    throw AppError.validation("Wallet address is missing");
  }

  return wallet;
}

async function getWalletSyncState({ userId, walletId, chain }) {
  const syncState = await NFTSyncState.findOne({
    userId,
    walletId,
    chain,
  })
    .select({
      lastSyncedAt: 1,
      isSyncing: 1,
      needsRefresh: 1,
      lastAttemptAt: 1,
      lastError: 1,
      assetCount: 1,
      collectionCount: 1,
      ownerAddress: 1,
      accountId: 1,
      status: 1,
    })
    .lean();

  if (syncState) {
    return syncState;
  }

  const latest = await NFTAsset.findOne({
    walletId,
    chain,
  })
    .sort({ lastSyncedAt: -1 })
    .select({ lastSyncedAt: 1 })
    .lean();

  return latest?.lastSyncedAt
    ? {
        lastSyncedAt: latest.lastSyncedAt,
        isSyncing: false,
        needsRefresh: false,
        lastAttemptAt: null,
        lastError: null,
        assetCount: 0,
        collectionCount: 0,
        ownerAddress: null,
        accountId: null,
        status: "success",
      }
    : null;
}

function normalizeSyncComparableValue(value) {
  if (value === undefined || value === null) {
    return null;
  }

  if (value instanceof Date) {
    return value.toISOString();
  }

  if (value && typeof value.toString === "function") {
    return value.toString();
  }

  return value;
}

function hasSyncStateChanges(existing, nextFields) {
  if (!existing) {
    return true;
  }

  return Object.entries(nextFields).some(([key, value]) => {
    const current = normalizeSyncComparableValue(existing[key]);
    const next = normalizeSyncComparableValue(value);
    return current !== next;
  });
}

async function updateSyncStateIfChanged(filter, nextFields, options = {}) {
  const existing = await NFTSyncState.findOne(filter).lean();

  if (!hasSyncStateChanges(existing, nextFields)) {
    return {
      matchedCount: existing ? 1 : 0,
      modifiedCount: 0,
      skipped: true,
    };
  }

  return await NFTSyncState.updateOne(
    filter,
    {
      $set: nextFields,
      ...(options.setOnInsert ? { $setOnInsert: options.setOnInsert } : {}),
    },
    { upsert: options.upsert !== false },
  );
}

function buildCollectionUpsertOperations(items, chain, syncTimestamp) {
  const uniqueByCollection = new Map();

  for (const item of items) {
    const contractAddress = String(item.contractAddress || "")
      .trim()
      .toLowerCase();
    if (!contractAddress) {
      continue;
    }

    if (!uniqueByCollection.has(contractAddress)) {
      uniqueByCollection.set(contractAddress, item);
    }
  }

  return Array.from(uniqueByCollection.values()).map((raw) => {
    const mapped = mapAlchemyCollection(raw, chain);

    return {
      updateOne: {
        filter: {
          chain: mapped.chain,
          contractAddress: mapped.contractAddress,
        },
        update: {
          $set: {
            name: mapped.name,
            symbol: mapped.symbol,
            logoUrl: mapped.logoUrl,
            bannerUrl: mapped.bannerUrl,
            description: mapped.description,
            provider: mapped.provider,
            isSpam: mapped.isSpam,
            rawProviderData: mapped.rawProviderData,
            lastSyncedAt: syncTimestamp,
          },
          $setOnInsert: {
            isVerified: false,
            isHidden: false,
          },
        },
        upsert: true,
      },
    };
  });
}

async function syncWalletNFTs({
  userId,
  walletId,
  force = false,
  trigger = "manual_refresh",
}) {
  const chain = SUPPORTED_CHAIN;
  const wallet = await resolveOwnedWallet({ userId, walletId });
  const ownerAddress = normalizeAddress(wallet.address);
  const syncState = await getWalletSyncState({
    userId,
    walletId: wallet._id,
    chain,
  });
  const lastSyncedAt = syncState?.lastSyncedAt || null;

  if (!force && isSyncFresh(syncState)) {
    const [totalVisible, totalCollections] = await Promise.all([
      NFTAsset.countDocuments({
        userId,
        walletId: wallet._id,
        chain,
        isHidden: { $ne: true },
      }),
      NFTAsset.distinct("contractAddress", {
        userId,
        walletId: wallet._id,
        chain,
        isHidden: { $ne: true },
      }).then((items) => items.length),
    ]);

    return {
      walletId: String(wallet._id),
      accountId: wallet.accountId ? String(wallet.accountId) : null,
      chain,
      ownerAddress,
      synced: totalVisible,
      updatedCollections: totalCollections,
      lastSyncedAt,
      skipped: true,
      reason: "cache_fresh",
      sync: buildWalletNftSyncMeta({
        wallet,
        syncState,
      }),
    };
  }

  const syncTimestamp = new Date();
  const syncStartedAt = new Date();
  const pageSize = getProviderPageSize();
  const maxPages = getProviderMaxPages();

  let pageKey = null;
  let pageCount = 0;
  let fetchedCount = 0;

  const rawItems = [];

  logger.info("NFT sync started", {
    event: "nft_sync_started",
    userId: String(userId),
    walletId: String(wallet._id),
    chain,
    ownerAddress,
    force: Boolean(force),
    trigger,
  });

  await updateSyncStateIfChanged(
    {
      userId,
      walletId: wallet._id,
      chain,
    },
    {
      accountId: wallet.accountId || null,
      ownerAddress,
      provider: "alchemy",
      needsRefresh: true,
      status: "stale",
      isSyncing: true,
      lastAttemptAt: syncStartedAt,
      lastError: null,
    },
    {
      setOnInsert: {
        assetCount: 0,
        collectionCount: 0,
        lastSyncedAt: lastSyncedAt || null,
      },
    },
  );

  try {
    do {
      if (pageCount >= maxPages) {
        throw new AppError("NFT sync exceeded provider pagination safety limit", {
          status: 502,
          errors: {
            provider: "alchemy",
            maxPages,
          },
        });
      }

      const page = await polygonNftAdapter.getOwnedNFTs({
        ownerAddress,
        pageKey,
        pageSize,
        network: "mainnet",
      });

      const items = Array.isArray(page.items) ? page.items : [];
      rawItems.push(...items);
      fetchedCount += items.length;
      pageKey = page.pageKey;
      pageCount += 1;
    } while (pageKey);

    const mappedAssets = rawItems
      .map((raw) => {
        const mapped = mapAlchemyNFTToAsset(raw, {
          userId,
          walletId: wallet._id,
          accountId: wallet.accountId || null,
          ownerAddress,
          chain,
          debug: true,
        });

        if (!mapped.contractAddress || !mapped.tokenId || !mapped.ownerAddress) {
          logger.warn("NFT filtered: Missing required fields after mapping", {
            event: "nft_filtered_missing_fields",
            appId: mapped.appId,
            contractAddress: mapped.contractAddress,
            tokenId: mapped.tokenId,
            ownerAddress: mapped.ownerAddress,
          });
        }

        return mapped;
      })
      .filter((item) => {
        const isValid = Boolean(
          item.contractAddress && item.tokenId && item.ownerAddress,
        );
        return isValid;
      });

    const spamCount = (rawItems || []).filter(
      (raw) => raw.spamInfo?.isSpam,
    ).length;
    if (spamCount > 0) {
      logger.info("Some NFTs were flagged as SPAM by provider", {
        event: "nft_sync_spam_detected",
        walletId: String(wallet._id),
        spamCount,
      });
    }

    const seenAppIds = new Set(mappedAssets.map((item) => item.appId));

    const assetOps = mappedAssets.map((item) => ({
      updateOne: {
        filter: {
          chain: item.chain,
          contractAddress: item.contractAddress,
          tokenId: item.tokenId,
          ownerAddress: item.ownerAddress,
        },
        update: {
          $set: {
            userId: item.userId,
            walletId: item.walletId,
            accountId: item.accountId,
            appId: item.appId,
            chain: item.chain,
            contractAddress: item.contractAddress,
            tokenId: item.tokenId,
            standard: item.standard,
            balance: item.balance,
            ownerAddress: item.ownerAddress,
            collectionName: item.collectionName,
            collectionSymbol: item.collectionSymbol,
            name: item.name,
            description: item.description,
            imageUrl: item.imageUrl,
            thumbnailUrl: item.thumbnailUrl,
            imageOriginalUrl: item.imageOriginalUrl,
            metadataUrl: item.metadataUrl,
            attributes: item.attributes,
            rawMetadata: item.rawMetadata,
            rawProviderData: item.rawProviderData,
            provider: item.provider,
            isSpam: item.isSpam,
            ...(item.isSpam === true ? { isHidden: true } : {}),
            mintedAt: item.mintedAt,
            lastTransferAt: item.lastTransferAt,
            lastSyncedAt: syncTimestamp,
          },
          $setOnInsert: {
            isVerified: false,
          },
        },
        upsert: true,
      },
    }));

    const collectionOps = buildCollectionUpsertOperations(
      rawItems,
      chain,
      syncTimestamp,
    );

    if (assetOps.length) {
      await NFTAsset.bulkWrite(assetOps, { ordered: false });
    }

    if (collectionOps.length) {
      await NFTCollection.bulkWrite(collectionOps, { ordered: false });
    }

    if (seenAppIds.size > 0) {
      await NFTAsset.deleteMany({
        userId,
        walletId: wallet._id,
        chain,
        ownerAddress,
        appId: { $nin: Array.from(seenAppIds) },
      });
    } else {
      await NFTAsset.deleteMany({
        userId,
        walletId: wallet._id,
        chain,
        ownerAddress,
      });
    }

    await updateSyncStateIfChanged(
      {
        userId,
        walletId: wallet._id,
        chain,
      },
      {
        accountId: wallet.accountId || null,
        ownerAddress,
        provider: "alchemy",
        assetCount: mappedAssets.length,
        collectionCount: collectionOps.length,
        lastSyncedAt: syncTimestamp,
        needsRefresh: false,
        status: "success",
        isSyncing: false,
        lastAttemptAt: syncStartedAt,
        lastError: null,
      },
    );

    logger.info("NFT sync finished", {
      event: "nft_sync_finished",
      userId: String(userId),
      walletId: String(wallet._id),
      chain,
      ownerAddress,
      pages: pageCount,
      fetchedCount,
      syncedCount: mappedAssets.length,
      collectionCount: collectionOps.length,
      trigger,
    });

    return {
      walletId: String(wallet._id),
      accountId: wallet.accountId ? String(wallet.accountId) : null,
      chain,
      ownerAddress,
      synced: mappedAssets.length,
      updatedCollections: collectionOps.length,
      pages: pageCount,
      fetchedCount,
      lastSyncedAt: syncTimestamp,
      skipped: false,
      sync: buildWalletNftSyncMeta({
        wallet,
        syncState: {
          lastSyncedAt: syncTimestamp,
          needsRefresh: false,
          isSyncing: false,
        },
      }),
    };
  } catch (error) {
    await updateSyncStateIfChanged(
      {
        userId,
        walletId: wallet._id,
        chain,
      },
      {
        accountId: wallet.accountId || null,
        ownerAddress,
        provider: "alchemy",
        needsRefresh: true,
        status: "stale",
        isSyncing: false,
        lastAttemptAt: syncStartedAt,
        lastError: error instanceof Error ? error.message : String(error),
      },
    );

    logger.error("NFT sync failed", {
      event: "nft_sync_failed",
      userId: String(userId),
      walletId: String(wallet._id),
      chain,
      ownerAddress,
      force: Boolean(force),
      trigger,
      error: error instanceof Error ? error.message : String(error),
    });

    throw error;
  }
}

async function listWalletNFTs({
  userId,
  walletId,
  chain = SUPPORTED_CHAIN,
  page = 1,
  limit = DEFAULT_LIST_LIMIT,
  showHidden = false,
  showSpam = false,
  search = "",
  contractAddress = "",
  collectionName = "",
  standard = "",
  sortBy = "",
  sortOrder = "desc",
}) {
  const normalizedChain = normalizeChain(chain);
  const normalizedPage = normalizeListPage(page);
  const normalizedLimit = normalizeListLimit(limit);
  const normalizedSearch = normalizeOptionalString(search);
  const normalizedContractAddress = normalizeOptionalString(contractAddress, 64);
  const normalizedCollectionName = normalizeOptionalString(collectionName);
  const normalizedStandard = normalizeOptionalString(standard, 16);
  const wallet = await resolveOwnedWallet({ userId, walletId });
  const query = buildListWalletNftsQuery({
    userId,
    walletId: wallet._id,
    chain: normalizedChain,
    showHidden,
    showSpam,
    search: normalizedSearch,
    contractAddress: normalizedContractAddress,
    collectionName: normalizedCollectionName,
    standard: normalizedStandard,
  });
  const { sort, collation } = resolveListSort({
    sortBy,
    sortOrder,
  });

  const skip = (normalizedPage - 1) * normalizedLimit;
  const itemsQuery = NFTAsset.find(query)
    .sort(sort)
    .skip(skip)
    .limit(normalizedLimit);

  if (collation) {
    itemsQuery.collation(collation);
  }

  const [items, total, syncState] = await Promise.all([
    itemsQuery.lean(),
    NFTAsset.countDocuments(query),
    getWalletSyncState({
      userId,
      walletId: wallet._id,
      chain: normalizedChain,
    }),
  ]);

  return {
    items: items.map(mapAssetResponse),
    page: normalizedPage,
    limit: normalizedLimit,
    total,
    hasMore: skip + items.length < total,
    lastSyncedAt: syncState?.lastSyncedAt || null,
    sync: buildWalletNftSyncMeta({
      wallet,
      syncState,
    }),
  };
}

async function hideNFT({ userId, nftId, hidden }) {
  const nft = await NFTAsset.findOne({
    _id: nftId,
    userId,
  }).lean();

  if (!nft) {
    throw AppError.notFound("NFT not found");
  }

  if (hidden === false && nft.isSpam === true) {
    throw AppError.validation("Spam NFTs cannot be unhidden");
  }

  await NFTAsset.updateOne(
    { _id: nft._id },
    {
      $set: {
        isHidden: hidden,
      },
    },
  );

  return {
    nftId: String(nft._id),
    isHidden: hidden,
  };
}

async function getNFTByCompositeId({ userId, id }) {
  const normalizedId = String(id || "").trim();

  if (!normalizedId || !userId) {
    throw AppError.notFound("NFT not found");
  }

  // 1. Try Mongo ObjectId lookup first (most reliable if we have it)
  if (Types.ObjectId.isValid(normalizedId)) {
    const directDoc = await NFTAsset.findOne({
      _id: normalizedId,
      userId,
    }).lean();

    if (directDoc) {
      return mapAssetResponse(directDoc);
    }
  }

  // 2. Try Exact appId lookup (fast, indexed)
  const appIdDoc = await NFTAsset.findOne({
    userId,
    appId: normalizedId,
  }).lean();

  if (appIdDoc) {
    return mapAssetResponse(appIdDoc);
  }

  // 3. Try parsing as Composite ID and lookup by components
  const parsed = parseCompositeId(normalizedId);
  if (parsed) {
    // Attempt match by computed appId if it differs from input
    if (parsed.appId && parsed.appId !== normalizedId) {
      const computedAppIdDoc = await NFTAsset.findOne({
        userId,
        appId: parsed.appId,
      }).lean();

      if (computedAppIdDoc) {
        return mapAssetResponse(computedAppIdDoc);
      }
    }

    // Fallback: Component match (Chain + Contract + Token)
    const query = {
      userId,
      chain: parsed.chain,
      contractAddress: parsed.contractAddress,
      tokenId: parsed.tokenId,
    };

    const docs = await NFTAsset.find(query)
      .sort({ lastSyncedAt: -1, createdAt: -1 })
      .limit(2)
      .lean();

    if (docs.length > 0) {
      if (!parsed.ownerAddress && docs.length > 1) {
        throw AppError.conflict("NFT id is ambiguous for multiple owners");
      }
      return mapAssetResponse(docs[0]);
    }
  }

  throw AppError.notFound("NFT not found");
}

async function getNFTActivityFeed({ userId, nftId, page, limit }) {
  const nft = await NFTAsset.findOne({
    _id: nftId,
    userId,
  }).lean();

  if (!nft) {
    throw AppError.notFound("NFT not found");
  }

  const normalizedPage = normalizeListPage(page);
  const normalizedLimit = normalizeListLimit(limit);
  const normalizedContractAddress = normalizeNftContractAddress(
    nft.contractAddress,
  );
  const normalizedTokenId = normalizeNftTokenId(nft.tokenId);

  const filter = {
    userId,
    assetType: "nft",
    contractAddress: {
      $regex: `^${String(normalizedContractAddress).replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`,
      $options: "i",
    },
    "metadata.nft.tokenId": normalizedTokenId,
    chain: nft.chain,
  };

  const skip = (normalizedPage - 1) * normalizedLimit;
  const [items, total] = await Promise.all([
    Transaction.find(filter)
      .sort({ chainTimestamp: -1, confirmedAt: -1, createdAt: -1 })
      .skip(skip)
      .limit(normalizedLimit)
      .lean(),
    Transaction.countDocuments(filter),
  ]);

  return {
    nft: {
      nftId: String(nft._id),
      contractAddress: nft.contractAddress,
      tokenId: nft.tokenId,
      standard: nft.standard,
      chain: nft.chain,
      name: nft.name || null,
      imageUrl: nft.imageUrl || nft.thumbnailUrl || null,
      collectionName: nft.collectionName || null,
    },
    items: items.map(mapActivityEvent),
    page: normalizedPage,
    limit: normalizedLimit,
    total,
    hasMore: skip + items.length < total,
  };
}

async function listWalletCollections({
  userId,
  walletId,
  chain = SUPPORTED_CHAIN,
  page = 1,
  limit = DEFAULT_LIST_LIMIT,
  showHidden = false,
  showSpam = false,
  search = "",
  contractAddress = "",
  collectionName = "",
  standard = "",
  sortBy = "",
  sortOrder = "desc",
}) {
  const normalizedChain = normalizeChain(chain);
  const normalizedPage = normalizeListPage(page);
  const normalizedLimit = normalizeListLimit(limit);
  const normalizedSearch = normalizeOptionalString(search);
  const normalizedContractAddress = normalizeOptionalString(contractAddress, 64);
  const normalizedCollectionName = normalizeOptionalString(collectionName);
  const normalizedStandard = normalizeOptionalString(standard, 16);
  const wallet = await resolveOwnedWallet({ userId, walletId });
  const matchQuery = buildCollectionSummaryQuery({
    userId,
    walletId: wallet._id,
    chain: normalizedChain,
    showHidden,
    showSpam,
    search: normalizedSearch,
    contractAddress: normalizedContractAddress,
    collectionName: normalizedCollectionName,
    standard: normalizedStandard,
  });
  const { groupSort } = buildCollectionSortStages({
    sortBy,
    sortOrder,
  });
  const skip = (normalizedPage - 1) * normalizedLimit;

  const [aggregationResult, walletSyncState] = await Promise.all([
    aggregateCollectionSummaries({
      matchQuery,
      groupSort,
      skip,
      limit: normalizedLimit,
    }),
    getWalletSyncState({
      userId,
      walletId: wallet._id,
      chain: normalizedChain,
    }),
  ]);

  const items = await hydrateCollectionSummaries(
    normalizedChain,
    aggregationResult.items,
  );

  return {
    items,
    page: normalizedPage,
    limit: normalizedLimit,
    total: aggregationResult.total,
    totalPages:
      aggregationResult.total === 0
        ? 0
        : Math.ceil(aggregationResult.total / normalizedLimit),
    hasMore: skip + items.length < aggregationResult.total,
    lastSyncedAt: walletSyncState?.lastSyncedAt || null,
    sync: buildWalletNftSyncMeta({
      wallet,
      syncState: walletSyncState,
    }),
  };
}

async function getWalletCollectionDetail({
  userId,
  walletId,
  contractAddress,
  chain = SUPPORTED_CHAIN,
  page = 1,
  limit = DEFAULT_LIST_LIMIT,
  showHidden = false,
  showSpam = false,
  search = "",
  standard = "",
  sortBy = "",
  sortOrder = "desc",
}) {
  const normalizedChain = normalizeChain(chain);
  const normalizedPage = normalizeListPage(page);
  const normalizedLimit = normalizeListLimit(limit);
  const normalizedSearch = normalizeOptionalString(search);
  const normalizedStandard = normalizeOptionalString(standard, 16);
  const normalizedContractAddress = normalizeNftContractAddress(contractAddress);
  const wallet = await resolveOwnedWallet({ userId, walletId });

  const baseCollectionExists = await NFTAsset.exists({
    userId,
    walletId: wallet._id,
    chain: normalizedChain,
    contractAddress: normalizedContractAddress,
  });

  if (!baseCollectionExists) {
    throw AppError.notFound("NFT collection not found");
  }

  const [filteredCollection, fallbackCollection] = await Promise.all([
    findWalletCollectionSummary({
      userId,
      walletId: wallet._id,
      chain: normalizedChain,
      showHidden,
      showSpam,
      contractAddress: normalizedContractAddress,
      standard: normalizedStandard,
    }),
    findWalletCollectionSummary({
      userId,
      walletId: wallet._id,
      chain: normalizedChain,
      showHidden: true,
      showSpam: true,
      contractAddress: normalizedContractAddress,
      standard: "",
    }),
  ]);

  const collection = filteredCollection || fallbackCollection;

  if (!collection) {
    throw AppError.notFound("NFT collection not found");
  }

  const query = buildCollectionDetailItemsQuery({
    userId,
    walletId: wallet._id,
    chain: normalizedChain,
    showHidden,
    showSpam,
    contractAddress: normalizedContractAddress,
    standard: normalizedStandard,
    search: normalizedSearch,
  });
  const { sort, collation } = resolveListSort({
    sortBy,
    sortOrder,
  });
  const skip = (normalizedPage - 1) * normalizedLimit;
  const itemsQuery = NFTAsset.find(query)
    .sort(sort)
    .skip(skip)
    .limit(normalizedLimit);

  if (collation) {
    itemsQuery.collation(collation);
  }

  const [items, total, walletSyncState] = await Promise.all([
    itemsQuery.lean(),
    NFTAsset.countDocuments(query),
    getWalletSyncState({
      userId,
      walletId: wallet._id,
      chain: normalizedChain,
    }),
  ]);

  return {
    collection,
    items: items.map(mapAssetResponse),
    meta: {
      page: normalizedPage,
      limit: normalizedLimit,
      total,
      totalPages: total === 0 ? 0 : Math.ceil(total / normalizedLimit),
      hasMore: skip + items.length < total,
      lastSyncedAt: walletSyncState?.lastSyncedAt || collection.lastSyncedAt || null,
      sync: buildWalletNftSyncMeta({
        wallet,
        syncState: walletSyncState,
      }),
    },
  };
}

async function getWalletSyncState({ userId, walletId, chain = SUPPORTED_CHAIN }) {
  return await NFTSyncState.findOne({
    userId,
    walletId,
    chain: normalizeChain(chain),
  }).lean();
}

function buildWalletNftSyncMeta({ wallet, syncState }) {
  if (!syncState) {
    return {
      status: wallet?.isProvisioned === false ? "provisioning" : "idle",
      needsRefresh: false,
      lastSyncedAt: null,
      isSyncing: false,
      hydrationPending: false,
    };
  }

  let status = "idle";
  let hydrationPending = false;

  if (syncState.isSyncing) {
    status = "syncing";
  } else if (syncState.needsRefresh) {
    status = "stale";
  } else if (!syncState.lastSyncedAt) {
    status = "pending";
    hydrationPending = true;
  }

  return {
    status,
    needsRefresh: Boolean(syncState.needsRefresh),
    lastSyncedAt: syncState.lastSyncedAt || null,
    isSyncing: Boolean(syncState.isSyncing),
    hydrationPending,
  };
}

async function requestWalletNftRefresh({
  userId,
  walletId,
  chain = SUPPORTED_CHAIN,
  source = "manual_refresh",
}) {
  const normalizedChain = normalizeChain(chain);
  const wallet = await resolveOwnedWallet({ userId, walletId });
  const refreshService = require("./refresh.service");
  const gateState = refreshService.getWalletRefreshGateState
    ? refreshService.getWalletRefreshGateState({
        userId,
        walletId: wallet._id,
        chain: normalizedChain,
      })
    : {
        inFlight: false,
        cooldownRemainingMs: 0,
      };
  const initialSyncState = await getWalletSyncState({
    userId,
    walletId: wallet._id,
    chain: normalizedChain,
  });

  if (!gateState.inFlight && gateState.cooldownRemainingMs <= 0) {
    await updateSyncStateIfChanged(
      {
        userId,
        walletId: wallet._id,
        chain: normalizedChain,
      },
      {
        accountId: wallet.accountId || null,
        ownerAddress: normalizeAddress(wallet.address),
        provider: "alchemy",
        needsRefresh: true,
        status: "stale",
        isSyncing: false,
        lastError: null,
      },
      {
        setOnInsert: {
          assetCount: 0,
          collectionCount: 0,
          lastSyncedAt: initialSyncState?.lastSyncedAt || null,
        },
      },
    );
  }

  const alreadyInFlight = refreshService.isWalletRefreshInFlight
    ? refreshService.isWalletRefreshInFlight({
        userId,
        walletId: wallet._id,
        chain: normalizedChain,
      })
    : false;

  // Fire and forget - the refresh service handles its own logging and error reporting,
  // but we add a safety catch here to ensure the endpoint remains resilient.
  const schedulePromise = refreshService.scheduleWalletNftRefresh({
    userId,
    walletId: wallet._id,
    chain: normalizedChain,
    reason: source || "manual_refresh",
    force: true,
  });
  const refreshSchedule = schedulePromise.refreshSchedule || {
    scheduled: true,
    alreadyInFlight,
    skipped: false,
  };

  schedulePromise.catch((err) => {
    logger.error("Failed to schedule manual NFT refresh", {
      event: "nft_manual_refresh_schedule_failed",
      userId: String(userId),
      walletId: String(wallet._id),
      chain: normalizedChain,
      error: err.message,
    });
  });

  // Return current state immediately so the client can begin polling or show status.
  const responseSyncState = await getWalletSyncState({
    userId,
    walletId: wallet._id,
    chain: normalizedChain,
  });

  return {
    walletId: String(wallet._id),
    chain: normalizedChain,
    scheduled: Boolean(refreshSchedule.scheduled),
    alreadyInFlight: Boolean(refreshSchedule.alreadyInFlight || alreadyInFlight),
    skipped: Boolean(refreshSchedule.skipped),
    reason: refreshSchedule.reason || null,
    cooldownRemainingMs: refreshSchedule.cooldownRemainingMs || 0,
    sync: buildWalletNftSyncMeta({
      wallet,
      syncState: responseSyncState,
    }),
  };
}

async function getWalletNftSyncStatus({ userId, walletId, chain = SUPPORTED_CHAIN }) {
  const normalizedChain = normalizeChain(chain);
  const wallet = await resolveOwnedWallet({ userId, walletId });

  const syncState = await NFTSyncState.findOne({
    userId,
    walletId: wallet._id,
    chain: normalizedChain,
  }).lean();

  if (!syncState) {
    return {
      status: "idle",
      needsRefresh: false,
      lastSyncedAt: null,
      inProgress: false,
    };
  }

  let status = "idle";
  if (syncState.isSyncing) {
    status = "syncing";
  } else if (syncState.needsRefresh) {
    status = "stale";
  }

  return {
    status,
    needsRefresh: Boolean(syncState.needsRefresh),
    lastSyncedAt: syncState.lastSyncedAt || null,
    inProgress: Boolean(syncState.isSyncing),
  };
}

module.exports = {
  syncWalletNFTs,
  listWalletNFTs,
  hideNFT,
  getNFTByCompositeId,
  getNFTActivityFeed,
  listWalletCollections,
  getWalletCollectionDetail,
  transferNFT: transferService.transferNFT,
  estimateNFTTransferFee: transferService.estimateNFTTransferFee,
  requestWalletNftRefresh,
  getWalletNftSyncStatus,
  getWalletSyncState,
  buildWalletNftSyncMeta,
};
