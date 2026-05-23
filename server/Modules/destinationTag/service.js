const DestinationTag = require("./model");
const { AppError } = require("../../helpers/errors");
const logger = require("../../common/utils/logger");
const Wallet = require("../wallet/model");

const TAG_MIN = 100000; // Start from higher range to avoid conflicts
const TAG_MAX = 4294967295; // 32-bit unsigned integer max
const MAX_RETRIES = 10;

const tagAllocationInFlight = new Map();

function getTagAllocationKey(walletId) {
  return `wallet:${String(walletId)}`;
}

async function generateUniqueTag() {
  // Generate random tag in the valid range
  return Math.floor(Math.random() * (TAG_MAX - TAG_MIN + 1)) + TAG_MIN;
}

async function isTagAvailable(chain, network, tag) {
  const existing = await DestinationTag.findOne({
    chain,
    network,
    tag,
    status: "active",
  }).lean();
  
  return !existing;
}

async function generateUniqueTagWithRetry(chain, network, maxRetries = MAX_RETRIES) {
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    const tag = await generateUniqueTag();
    const available = await isTagAvailable(chain, network, tag);
    
    if (available) {
      return tag;
    }
    
    logger.warn(`Tag collision detected, retrying...`, {
      attempt: attempt + 1,
      tag,
      chain,
      network,
    });
  }
  
  throw AppError.conflict("Unable to generate unique destination tag after multiple attempts");
}

async function assignTagToWallet(userId, accountId, walletId, chain = "xrp", network = "mainnet") {
  const key = getTagAllocationKey(walletId);
  
  // Check if allocation is already in progress
  if (tagAllocationInFlight.has(key)) {
    return tagAllocationInFlight.get(key);
  }
  
  const allocationPromise = (async () => {
    try {
      const ownedWallet = await Wallet.findOne({
        _id: walletId,
        userId,
        ...(accountId ? { accountId } : {}),
      })
        .select("_id accountId chain network")
        .lean();

      if (!ownedWallet) {
        throw AppError.notFound("Wallet not found");
      }

      // Check if wallet already has a tag
      const existingTag = await DestinationTag.findOne({
        walletId: ownedWallet._id,
        chain: ownedWallet.chain || chain,
        network: ownedWallet.network || network,
        status: "active",
      }).lean();
      
      if (existingTag) {
        logger.info("Wallet already has destination tag", {
          walletId: String(walletId),
          tag: existingTag.tag,
        });
        return existingTag;
      }
      
      // Generate new unique tag
      const resolvedChain = ownedWallet.chain || chain;
      const resolvedNetwork = ownedWallet.network || network;
      const tag = await generateUniqueTagWithRetry(resolvedChain, resolvedNetwork);
      
      // Create destination tag record
      const destinationTag = await DestinationTag.create({
        userId,
        accountId: ownedWallet.accountId || accountId || null,
        walletId: ownedWallet._id,
        chain: resolvedChain,
        network: resolvedNetwork,
        tag,
        status: "active",
      });
      
      logger.info("Assigned new destination tag to wallet", {
        userId: String(userId),
        accountId: ownedWallet.accountId ? String(ownedWallet.accountId) : null,
        walletId: String(ownedWallet._id),
        tag,
        chain: resolvedChain,
        network: resolvedNetwork,
      });
      
      return destinationTag.toObject ? destinationTag.toObject() : destinationTag;
    } catch (error) {
      logger.error("Failed to assign destination tag to wallet", {
        userId: String(userId),
        walletId: String(walletId),
        error: error.message,
      });
      throw error;
    }
  })();
  
  tagAllocationInFlight.set(key, allocationPromise);
  
  try {
    return await allocationPromise;
  } finally {
    tagAllocationInFlight.delete(key);
  }
}

async function getOrCreateTag(userId, accountId, walletId, chain = "xrp", network = "mainnet") {
  // First try to find existing active tag
  const existingTag = await DestinationTag.findOne({
    userId,
    walletId,
    chain,
    network,
    status: "active",
  }).lean();
  
  if (existingTag) {
    return existingTag;
  }
  
  // If no existing tag, assign a new one
  return assignTagToWallet(userId, accountId, walletId, chain, network);
}

async function getTagByWallet(walletId, chain = "xrp", network = "mainnet") {
  return DestinationTag.findOne({
    walletId,
    chain,
    network,
    status: "active",
  }).lean();
}

async function getTagByValue(chain, network, tag) {
  return DestinationTag.findOne({
    chain,
    network,
    tag,
    status: "active",
  }).populate('walletId')
  .lean();
}

async function updateLastUsed(tagId) {
  await DestinationTag.findByIdAndUpdate(tagId, {
    lastUsedAt: new Date(),
  });
}

async function getTagsByUser(userId, options = {}) {
  const filters = {
    userId,
    status: "active",
    ...options.filters,
  };
  
  return DestinationTag.find(filters)
    .populate('walletId')
    .populate('accountId')
    .sort({ createdAt: -1 })
    .lean();
}

async function deactivateTag(tagId) {
  await DestinationTag.findByIdAndUpdate(tagId, {
    status: "inactive",
  });
}

module.exports = {
  generateUniqueTag,
  assignTagToWallet,
  getOrCreateTag,
  getTagByWallet,
  getTagByValue,
  updateLastUsed,
  getTagsByUser,
  deactivateTag,
};
