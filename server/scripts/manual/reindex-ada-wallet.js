const mongoose = require("mongoose");

const { requireEnv } = require("./utils");
const Wallet = require("../../Modules/wallet/model");
const adaWallet = require("../../Modules/chainAdapters/ada/wallet");
const adaClient = require("../../Modules/chainAdapters/ada/client");
const utxo = require("../../Modules/chainAdapters/utxo");

const DEFAULT_START_INDEX = 0;
const DEFAULT_END_INDEX = 20;

function parseArgs(argv = process.argv.slice(2)) {
  const args = {};

  for (let index = 0; index < argv.length; index += 1) {
    const token = String(argv[index] || "").trim();
    if (!token.startsWith("--")) {
      continue;
    }

    const key = token.slice(2);
    const next = argv[index + 1];
    if (!next || String(next).startsWith("--")) {
      args[key] = true;
      continue;
    }

    args[key] = next;
    index += 1;
  }

  return args;
}

function readStringArg(args, name, envName = "") {
  const cliValue = String(args[name] || "").trim();
  if (cliValue) {
    return cliValue;
  }

  return envName ? String(process.env[envName] || "").trim() : "";
}

function requireStringArg(args, name, envName = "") {
  const value = readStringArg(args, name, envName);
  if (!value) {
    throw new Error(`--${name} is required${envName ? ` (or ${envName})` : ""}`);
  }

  return value;
}

function readIntegerArg(args, name, defaultValue) {
  const raw = String(args[name] ?? "").trim();
  if (!raw) {
    return defaultValue;
  }

  const parsed = Number.parseInt(raw, 10);
  if (!Number.isFinite(parsed) || parsed < 0) {
    throw new Error(`--${name} must be a non-negative integer`);
  }

  return parsed;
}

function resolveLovelaceBalance(amounts = []) {
  if (!Array.isArray(amounts)) {
    return "0";
  }

  const lovelaceEntry = amounts.find(
    (entry) =>
      String(entry?.unit || "")
        .trim()
        .toLowerCase() === "lovelace",
  );

  return /^\d+$/.test(String(lovelaceEntry?.quantity ?? "").trim())
    ? String(lovelaceEntry.quantity).trim()
    : "0";
}

async function probeAddressState(client, address) {
  const [addressInfo, utxos] = await Promise.all([
    client.fetchAddressInfo(address).catch(() => null),
    client.fetchAddressUtxos(address).catch(() => []),
  ]);

  return {
    exists: Boolean(addressInfo),
    balance: addressInfo ? resolveLovelaceBalance(addressInfo.amount) : "0",
    utxoCount: Array.isArray(utxos) ? utxos.length : 0,
  };
}

async function run() {
  const args = parseArgs();
  const dbUri = requireEnv("DB_URI");
  const walletId = requireStringArg(args, "walletId", "MANUAL_WALLET_ID");
  const mnemonic = requireStringArg(args, "mnemonic", "MANUAL_MNEMONIC");
  const receiveStart = readIntegerArg(
    args,
    "receiveStart",
    DEFAULT_START_INDEX,
  );
  const receiveEnd = readIntegerArg(args, "receiveEnd", DEFAULT_END_INDEX);
  const changeStart = readIntegerArg(args, "changeStart", DEFAULT_START_INDEX);
  const changeEnd = readIntegerArg(args, "changeEnd", DEFAULT_END_INDEX);
  const shouldProbeChain = args["probe-chain"] === true;

  if (receiveEnd < receiveStart) {
    throw new Error("--receiveEnd must be greater than or equal to --receiveStart");
  }

  if (changeEnd < changeStart) {
    throw new Error("--changeEnd must be greater than or equal to --changeStart");
  }

  await mongoose.connect(dbUri);

  try {
    const walletRecord = await Wallet.findOne({
      _id: walletId,
      chain: "ada",
    })
      .select("_id userId accountId chain network address label")
      .lean();

    if (!walletRecord) {
      throw new Error(`ADA wallet not found for walletId ${walletId}`);
    }

    const network = adaClient.normalizeNetwork(
      readStringArg(args, "network", "MANUAL_ADA_NETWORK") || walletRecord.network,
    );

    if (walletRecord.network !== network) {
      throw new Error(
        `Wallet network mismatch: wallet is "${walletRecord.network}", requested "${network}"`,
      );
    }

    const chainProbeClient = shouldProbeChain
      ? adaClient.getClient(network)
      : null;
    const branchPlans = [
      {
        branch: adaWallet.EXTERNAL_BRANCH,
        start: receiveStart,
        end: receiveEnd,
        purpose: "receive",
        isChange: false,
      },
      {
        branch: adaWallet.CHANGE_BRANCH,
        start: changeStart,
        end: changeEnd,
        purpose: "change",
        isChange: true,
      },
    ];

    const rebuild = await utxo.rebuildWalletState({
      chain: "ada",
      network,
      walletRecord,
      branchPlans: branchPlans.map((plan) => ({
        branch: plan.branch,
        startIndex: plan.start,
        endIndex: plan.end,
        purpose: plan.purpose,
        isChange: plan.isChange,
        addressType: adaWallet.ADDRESS_TYPE,
      })),
      validateAddress: adaWallet.validateAddress,
      deriveManagedAddress: ({ branch, addressIndex, plan }) =>
        adaWallet.deriveManagedAddressFromMnemonic(mnemonic, network, {
          branch,
          addressIndex,
          purpose: plan.purpose,
          isChange: plan.isChange,
        }),
      probeAddressState: chainProbeClient
        ? ({ address }) => probeAddressState(chainProbeClient, address)
        : null,
    });

    const rows = rebuild.rows;
    const upsertedCount = rebuild.upsertedCount;

    for (const row of rows) {
      console.log(JSON.stringify(row));
    }

    const foundOnChainCount = rows.filter((entry) => entry.existsOnChain === true).length;

    console.log(
      JSON.stringify(
        {
          success: true,
          walletId: String(walletRecord._id),
          chain: "ada",
          network,
          walletAddress: walletRecord.address,
          receiveRange: [receiveStart, receiveEnd],
          changeRange: [changeStart, changeEnd],
          probedChain: shouldProbeChain,
          upsertedCount,
          foundOnChainCount,
        },
        null,
        2,
      ),
    );
  } finally {
    await mongoose.disconnect();
  }
}

run().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
