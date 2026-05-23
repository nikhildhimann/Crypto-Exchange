const nftService = require("./service");
const transferService = require("./transfer.service");
const { success } = require("../../common/utils/apiResponse");
const logger = require("../../common/utils/logger");

async function list(req, res, next) {
  try {
    const data = await nftService.listWalletNFTs({
      userId: req.user._id,
      ...req.query,
    });
    return success(res, { data: data.items, meta: { ...data, items: undefined } });
  } catch (error) {
    next(error);
  }
}

async function sync(req, res, next) {
  try {
    const data = await nftService.syncWalletNFTs({
      userId: req.user._id,
      ...req.body,
    });
    return success(res, { data });
  } catch (error) {
    next(error);
  }
}

async function refresh(req, res, next) {
  try {
    logger.warn("NFT REFRESH TRIGGERED", {
      walletId: req.body?.walletId || req.query?.walletId,
      userId: req.user?._id,
      source: req.headers["x-refresh-source"] || "unknown",
      userAgent: req.headers["user-agent"],
      timestamp: new Date().toISOString(),
      stack: new Error().stack,
    });

    const data = await nftService.requestWalletNftRefresh({
      userId: req.user._id,
      walletId: req.body.walletId,
      chain: req.body.chain || "polygon",
      source: req.headers["x-refresh-source"] || "manual_refresh",
    });
    return success(res, {
      message: "NFT refresh scheduled successfully",
      data,
    });
  } catch (error) {
    next(error);
  }
}

async function hide(req, res, next) {
  try {
    const data = await nftService.hideNFT({
      userId: req.user._id,
      ...req.body,
    });
    return success(res, { data });
  } catch (error) {
    next(error);
  }
}

async function detail(req, res, next) {
  try {
    const data = await nftService.getNFTByCompositeId({
      userId: req.user._id,
      id: req.params.id,
    });
    return success(res, { data });
  } catch (error) {
    next(error);
  }
}

async function collections(req, res, next) {
  try {
    const data = await nftService.listWalletCollections({
      userId: req.user._id,
      ...req.query,
    });
    return success(res, { data: data.items, meta: { ...data, items: undefined } });
  } catch (error) {
    next(error);
  }
}

async function collectionDetail(req, res, next) {
  try {
    const data = await nftService.getWalletCollectionDetail({
      userId: req.user._id,
      ...req.query,
    });
    return success(res, { data });
  } catch (error) {
    next(error);
  }
}

async function activityFeed(req, res, next) {
  try {
    const data = await nftService.getNFTActivityFeed({
      userId: req.user._id,
      nftId: req.params.id,
      ...req.query,
    });
    return success(res, { data: data.items, meta: { ...data, items: undefined } });
  } catch (error) {
    next(error);
  }
}

async function estimateFee(req, res, next) {
  try {
    const data = await transferService.estimateNFTTransferFee({
      userId: req.user._id,
      ...req.body,
    });
    return success(res, { data });
  } catch (error) {
    next(error);
  }
}

async function transfer(req, res, next) {
  try {
    const data = await transferService.transferNFT({
      userId: req.user._id,
      ...req.body,
    });
    return success(res, { status: "submitted", data });
  } catch (error) {
    next(error);
  }
}

async function getSyncStatus(req, res, next) {
  try {
    const walletId = req.params.walletId;
    const chain = req.query.chain || "polygon";
    
    // Pass everything needed to calculate sync metadata
    // Note: service.getWalletSyncState returns the raw state from DB
    const syncState = await nftService.getWalletSyncState({
      userId: req.user._id,
      walletId,
      chain
    });

    // We also need the wallet record to check provisioning status
    const wallet = await require("../wallet/model").findOne({ _id: walletId, userId: req.user._id }).lean();
    
    const data = nftService.buildWalletNftSyncMeta({
      wallet,
      syncState
    });

    return success(res, { data });
  } catch (error) {
    next(error);
  }
}

module.exports = {
  list,
  sync,
  refresh,
  hide,
  detail,
  collections,
  collectionDetail,
  activityFeed,
  estimateFee,
  transfer,
  getSyncStatus,
};
