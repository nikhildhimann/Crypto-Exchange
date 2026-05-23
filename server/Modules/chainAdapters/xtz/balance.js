const clientInfo = require("./client");
const amountInfo = require("./amount");
const { AppError } = require("../../../helpers/errors");
const logger = require("../../../common/utils/logger");

async function fetchBalance({ network, address }) {
  const client = clientInfo.getClient(network);
  
  try {
    const rawBalance = await client.getBalance(address);
    const baseUnitBalance = String(
      rawBalance && typeof rawBalance === "object"
        ? rawBalance.baseUnitBalance ?? "0"
        : rawBalance || "0",
    );
    
    return {
      baseUnitBalance,
      availableBaseUnits: baseUnitBalance,
      rentExemptMinimumBaseUnits: "0",
      exists:
        rawBalance && typeof rawBalance === "object"
          ? rawBalance.exists !== false
          : true,
      confirmed:
        rawBalance && typeof rawBalance === "object"
          ? rawBalance.confirmed !== false
          : true,
      raw:
        rawBalance && typeof rawBalance === "object"
          ? rawBalance.raw || { balance: baseUnitBalance }
          : {
              balance: baseUnitBalance
            }
    };
  } catch (error) {
    logger.error("XTZ balance adapter failed", {
      network,
      address,
      error: error instanceof Error ? error.message : String(error),
      errorDetails:
        error?.errors && typeof error.errors === "object" ? error.errors : null,
    });

    if (error instanceof AppError) {
      throw error;
    }

    throw new AppError("Failed to fetch Tezos balance", {
      status: 502,
      errors: {
        stage: "fetch_balance",
        reason: error instanceof Error ? error.message : String(error),
      },
    });
  }
}

module.exports = {
  fetchBalance
};
