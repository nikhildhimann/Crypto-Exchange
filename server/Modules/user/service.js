const User = require("./model");
const { AppError } = require("../../helpers/errors");
const paginate = require("../../helpers/pagination");
const { sanitizeUser } = require("../../helpers/sanitize");

async function getCurrentUser(userId) {
  const user = await User.findById(userId).select("-seedCipherText");
  if (!user) {
    throw AppError.notFound("User not found");
  }

  return sanitizeUser(user);
}

async function listUsers(query) {
  const result = await paginate(User, {}, {
    page: query.page,
    limit: query.limit,
    searchFields: ["publicAddress", "publicKey", "seedFingerprint"],
    searchTerm: query.search,
    sort: { createdAt: -1 },
  });

  result.data = result.data.map(sanitizeUser);
  return result;
}

async function updateUserById(userId, payload) {
  const user = await User.findById(userId);
  if (!user) {
    throw AppError.notFound("User not found");
  }

  const normalizeOptionalString = (value) => {
    if (value === null || value === undefined) {
      return undefined;
    }

    const normalized = String(value).trim();
    return normalized ? normalized : undefined;
  };

  if (payload.primaryChain !== undefined) user.primaryChain = payload.primaryChain;
  if (payload.status !== undefined) user.status = payload.status;
  if (payload.publicAddress !== undefined) user.publicAddress = normalizeOptionalString(payload.publicAddress);
  if (payload.publicKey !== undefined) user.publicKey = normalizeOptionalString(payload.publicKey) || null;
  if (payload.qrCodeUri !== undefined) user.qrCodeUri = normalizeOptionalString(payload.qrCodeUri) || null;
  if (payload.metadata !== undefined) user.metadata = payload.metadata;
  await user.save();
  return sanitizeUser(user);
}

async function deleteUserById(userId) {
  const user = await User.findById(userId);
  if (!user) {
    throw AppError.notFound("User not found");
  }

  await user.deleteOne();
  return true;
}

module.exports = {
  getCurrentUser,
  listUsers,
  updateUserById,
  deleteUserById,
};
