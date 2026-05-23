const WalletAddress = require("../../wallet/address.model");
const logger = require("../../../common/utils/logger");
const {
  isDatabaseAvailable,
  resolveWalletRecord,
  upsertManagedAddress,
} = require("./addressDiscovery.service");

async function getNextChangeAddress({
  chain,
  network,
  walletAddress,
  walletRecord = null,
  mnemonic = "",
  persist = false,
  validateAddress = null,
  changeBranch = 1,
  changeAddressIndex = 0,
  purpose = "change",
  isChange = true,
  deriveChangeAddressFromWallet = null,
  deriveChangeAddressFromMnemonic = null,
  logLabel = "UTXO",
} = {}) {
  const resolvedWallet =
    walletRecord ||
    (await resolveWalletRecord({
      chain,
      network,
      walletAddress,
    }));

  if (isDatabaseAvailable() && resolvedWallet?._id) {
    const existingAddress = await WalletAddress.findOne({
      walletId: resolvedWallet._id,
      chain,
      network,
      branch: changeBranch,
      addressIndex: changeAddressIndex,
      isActive: true,
      isChange: true,
    }).lean();

    if (existingAddress?.address) {
      return String(existingAddress.address).trim();
    }
  }

  let derived = null;
  if (typeof deriveChangeAddressFromWallet === "function" && resolvedWallet) {
    try {
      derived = await Promise.resolve(
        deriveChangeAddressFromWallet({
          chain,
          network,
          walletAddress: String(walletAddress || "").trim(),
          walletRecord: resolvedWallet,
          branch: changeBranch,
          addressIndex: changeAddressIndex,
          purpose,
          isChange,
        }),
      );
    } catch (_error) {
      derived = null;
    }
  }

  if (
    !String(derived?.address || derived?.managedAddress?.address || "").trim() &&
    mnemonic &&
    typeof deriveChangeAddressFromMnemonic === "function"
  ) {
    derived = await Promise.resolve(
      deriveChangeAddressFromMnemonic({
        chain,
        network,
        walletAddress: String(walletAddress || "").trim(),
        walletRecord: resolvedWallet,
        mnemonic,
        branch: changeBranch,
        addressIndex: changeAddressIndex,
        purpose,
        isChange,
      }),
    );
  }

  const changeAddress = String(
    derived?.address || derived?.managedAddress?.address || "",
  ).trim();
  if (!changeAddress) {
    return null;
  }

  if (typeof validateAddress === "function" && !validateAddress(changeAddress, network)) {
    return null;
  }

  if (persist && resolvedWallet?._id) {
    const persisted = await upsertManagedAddress({
      walletRecord: resolvedWallet,
      chain,
      network,
      managedAddress: {
        ...(derived?.managedAddress && typeof derived.managedAddress === "object"
          ? derived.managedAddress
          : {}),
        address: changeAddress,
        derivationPath:
          derived?.managedAddress?.derivationPath || derived?.derivationPath || "",
        branch: changeBranch,
        addressIndex: changeAddressIndex,
        addressType: derived?.managedAddress?.addressType || derived?.addressType || "",
        purpose,
        isActive: true,
        isChange,
        metadata:
          derived?.managedAddress?.metadata &&
          typeof derived.managedAddress.metadata === "object"
            ? derived.managedAddress.metadata
            : {},
        status: "active",
      },
    });

    if (persisted) {
      logger.info(`Created ${logLabel} change address`, {
        walletId: String(resolvedWallet._id),
        chain,
        network,
        address: changeAddress,
        branch: changeBranch,
        addressIndex: changeAddressIndex,
      });
    }
  }

  return changeAddress;
}

module.exports = {
  getNextChangeAddress,
};
