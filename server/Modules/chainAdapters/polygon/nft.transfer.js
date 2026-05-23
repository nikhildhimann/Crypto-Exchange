const { Contract } = require("ethers");

const client = require("./client");
const polygonAmount = require("./amount");
const walletAdapter = require("./wallet");
const {
  ERC721_ABI,
  ERC1155_ABI,
  normalizeEvmAddress,
  normalizeTokenId,
  assertErc721Owner,
  executeSafeErc721Transfer,
  assertErc1155Balance,
  executeSafeErc1155Transfer,
} = require("../common/evmNft");
const { AppError } = require("../../../helpers/errors");

const MAINNET_NETWORK = "mainnet";

function extractErrorMessage(error, fallback = "Polygon NFT transfer failed") {
  const candidates = [
    error?.shortMessage,
    error?.info?.error?.message,
    error?.info?.payload?.error?.message,
    error?.error?.message,
    error?.reason,
    error?.message,
  ];

  for (const candidate of candidates) {
    if (typeof candidate === "string" && candidate.trim()) {
      return candidate.trim();
    }
  }

  return fallback;
}

function buildTransferRpcError(error) {
  if (error instanceof AppError) {
    return error;
  }

  const reason = extractErrorMessage(error);
  const normalizedReason = reason.toLowerCase();

  if (normalizedReason.includes("insufficient funds")) {
    return AppError.validation(
      "Insufficient POL balance to cover the NFT transfer network fee",
    );
  }

  if (
    normalizedReason.includes("caller is not token owner or approved") ||
    normalizedReason.includes("caller is not owner or approved") ||
    normalizedReason.includes("transfer caller is not owner nor approved") ||
    normalizedReason.includes("not owner nor approved")
  ) {
    return AppError.validation(
      "Wallet is not authorized to transfer this NFT token",
    );
  }

  if (normalizedReason.includes("erc1155: insufficient balance")) {
    return AppError.validation(
      "Insufficient token balance for this ERC-1155 transfer",
    );
  }

  if (normalizedReason.includes("nonce too low")) {
    return AppError.conflict(
      "Polygon NFT transfer nonce is no longer valid. Please try again",
    );
  }

  if (
    normalizedReason.includes("replacement transaction underpriced") ||
    normalizedReason.includes("replacement underpriced")
  ) {
    return AppError.conflict(
      "A conflicting Polygon NFT transfer is already pending for this wallet",
    );
  }

  if (normalizedReason.includes("already known")) {
    return AppError.conflict(
      "This Polygon NFT transfer is already known by the network",
    );
  }

  if (
    normalizedReason.includes("network error") ||
    normalizedReason.includes("timeout") ||
    normalizedReason.includes("socket") ||
    normalizedReason.includes("econn") ||
    normalizedReason.includes("failed to fetch") ||
    normalizedReason.includes("rpc")
  ) {
    return new AppError("Polygon RPC is currently unavailable", {
      status: 502,
      errors: { reason },
    });
  }

  return new AppError("Polygon NFT transfer failed", {
    status: 502,
    errors: { reason },
  });
}

function serializeTransactionResponse(txResponse = {}) {
  return {
    hash: txResponse.hash || "",
    nonce: typeof txResponse.nonce === "number" ? txResponse.nonce : null,
    type:
      txResponse.type === undefined || txResponse.type === null
        ? null
        : Number(txResponse.type),
    gasLimit: txResponse.gasLimit ? txResponse.gasLimit.toString() : null,
    gasPrice: txResponse.gasPrice ? txResponse.gasPrice.toString() : null,
    maxFeePerGas: txResponse.maxFeePerGas
      ? txResponse.maxFeePerGas.toString()
      : null,
    maxPriorityFeePerGas: txResponse.maxPriorityFeePerGas
      ? txResponse.maxPriorityFeePerGas.toString()
      : null,
    chainId:
      txResponse.chainId === undefined || txResponse.chainId === null
        ? null
        : Number(txResponse.chainId),
  };
}

function buildEstimateFeeRpcError(error) {
  if (error instanceof AppError) {
    return error;
  }

  const reason = extractErrorMessage(error, "Polygon NFT fee estimation failed");
  const normalizedReason = reason.toLowerCase();

  if (
    normalizedReason.includes("network error") ||
    normalizedReason.includes("timeout") ||
    normalizedReason.includes("socket") ||
    normalizedReason.includes("econn") ||
    normalizedReason.includes("failed to fetch") ||
    normalizedReason.includes("rpc")
  ) {
    return new AppError("Polygon RPC is currently unavailable", {
      status: 502,
      errors: { reason },
    });
  }

  return new AppError("Polygon NFT fee estimation failed", {
    status: 502,
    errors: { reason },
  });
}

async function estimateTransferFee({
  network = "mainnet",
  fromAddress,
  toAddress,
  contractAddress,
  tokenId,
  standard = "ERC721",
  amount = "1",
}) {
  const normalizedStandard = String(standard || "ERC721").toUpperCase();

  if (
    normalizedStandard !== "ERC721" &&
    normalizedStandard !== "ERC1155"
  ) {
    throw AppError.validation("Unsupported NFT standard");
  }

  const normalizedNetwork = client.normalizeNetwork(network);
  const normalizedFromAddress = normalizeEvmAddress(
    fromAddress,
    "Polygon sender address",
  );
  const normalizedToAddress = normalizeEvmAddress(
    toAddress,
    "Polygon recipient address",
  );
  const normalizedContractAddress = normalizeEvmAddress(
    contractAddress,
    "NFT contract address",
  );
  const normalizedTokenId = normalizeTokenId(tokenId);

  let normalizedAmount = "1";
  if (normalizedStandard === "ERC1155") {
    try {
      normalizedAmount = BigInt(amount).toString();
    } catch (_error) {
      throw AppError.validation("Invalid ERC-1155 transfer amount");
    }
  }

  try {
    const { provider } = await client.assertProviderReady(normalizedNetwork);
    let populatedTx;

    if (normalizedStandard === "ERC721") {
      const contract = new Contract(
        normalizedContractAddress,
        ERC721_ABI,
        provider,
      );
      populatedTx = await contract[
        "safeTransferFrom(address,address,uint256)"
      ].populateTransaction(
        normalizedFromAddress,
        normalizedToAddress,
        normalizedTokenId,
      );
    } else {
      const contract = new Contract(
        normalizedContractAddress,
        ERC1155_ABI,
        provider,
      );
      populatedTx = await contract[
        "safeTransferFrom(address,address,uint256,uint256,bytes)"
      ].populateTransaction(
        normalizedFromAddress,
        normalizedToAddress,
        normalizedTokenId,
        BigInt(normalizedAmount),
        "0x",
      );
    }

    const estimatedGas = await provider.estimateGas({
      from: normalizedFromAddress,
      to: normalizedContractAddress,
      data: populatedTx.data,
    });
    const gasWithBuffer = (estimatedGas * 120n) / 100n;
    const feeData = await provider.getFeeData();
    const effectiveGasPrice = feeData.maxFeePerGas ?? feeData.gasPrice ?? 0n;
    const estimatedFeeBaseUnits = (gasWithBuffer * effectiveGasPrice).toString();

    return {
      standard: normalizedStandard,
      contractAddress: normalizedContractAddress,
      tokenId: String(tokenId),
      gasLimit: gasWithBuffer.toString(),
      gasPriceBaseUnits: effectiveGasPrice.toString(),
      maxFeePerGasBaseUnits: (feeData.maxFeePerGas ?? 0n).toString(),
      maxPriorityFeePerGasBaseUnits: (
        feeData.maxPriorityFeePerGas ?? 0n
      ).toString(),
      estimatedFeeBaseUnits,
      estimatedFee: polygonAmount.fromBaseUnits(estimatedFeeBaseUnits),
      feeAsset: "POL",
      feeCurrency: "POL",
      isEip1559: Boolean(feeData.maxFeePerGas),
    };
  } catch (error) {
    throw buildEstimateFeeRpcError(error);
  }
}

async function submitTransfer({
  network = MAINNET_NETWORK,
  mnemonic,
  fromAddress,
  toAddress,
  contractAddress,
  tokenId,
  standard = "ERC721",
  amount = "1",
}) {
  const normalizedStandard = String(standard || "ERC721").toUpperCase();

  if (
    normalizedStandard !== "ERC721" &&
    normalizedStandard !== "ERC1155"
  ) {
    throw AppError.validation(`Unsupported NFT standard: ${standard}`);
  }

  const normalizedNetwork = client.normalizeNetwork(network);
  const normalizedFromAddress = normalizeEvmAddress(
    fromAddress,
    "Polygon sender address",
  );
  const normalizedToAddress = normalizeEvmAddress(
    toAddress,
    "Polygon recipient address",
  );

  if (normalizedFromAddress === normalizedToAddress) {
    throw AppError.validation(
      "Cannot transfer an NFT to the same Polygon wallet address",
    );
  }

  const { provider, chainId } =
    await client.assertProviderReady(normalizedNetwork);
  const { wallet: derivedWallet } =
    walletAdapter.deriveWalletFromMnemonic(mnemonic);
  const derivedAddress = normalizeEvmAddress(
    derivedWallet.address,
    "derived Polygon wallet address",
  );

  if (derivedAddress !== normalizedFromAddress) {
    throw AppError.conflict("Derived Polygon wallet address mismatch");
  }

  const signer = derivedWallet.connect(provider);
  const submittedAt = new Date();

  try {
    if (normalizedStandard === "ERC721") {
      const ownership = await assertErc721Owner({
        contractAddress,
        signerOrProvider: signer,
        tokenId,
        expectedOwnerAddress: normalizedFromAddress,
        mismatchMessage: "NFT is no longer owned by the selected wallet on-chain",
      });

      const transfer = await executeSafeErc721Transfer({
        contractAddress,
        signer,
        fromAddress: normalizedFromAddress,
        toAddress: normalizedToAddress,
        tokenId,
      });

      return {
        chain: "polygon",
        network: normalizedNetwork,
        chainId,
        standard: normalizedStandard,
        fromAddress: normalizedFromAddress,
        toAddress: normalizedToAddress,
        contractAddress: transfer.contractAddress,
        tokenId: transfer.tokenId,
        txHash: transfer.txResponse.hash,
        chainStatus: "submitted",
        submittedAt,
        rawRequest: {
          standard: normalizedStandard,
          fromAddress: normalizedFromAddress,
          toAddress: normalizedToAddress,
          contractAddress: transfer.contractAddress,
          tokenId: transfer.tokenId,
          ownerAddress: ownership.ownerAddress,
        },
        rawResponse: serializeTransactionResponse(transfer.txResponse),
      };
    }

    let normalizedAmount;
    try {
      normalizedAmount = BigInt(amount).toString();
    } catch (_error) {
      throw AppError.validation("Invalid ERC-1155 transfer amount");
    }

    if (BigInt(normalizedAmount) <= 0n) {
      throw AppError.validation("Invalid ERC-1155 transfer amount");
    }

    const ownership = await assertErc1155Balance({
      contractAddress,
      signerOrProvider: signer,
      tokenId,
      ownerAddress: normalizedFromAddress,
      requiredAmount: normalizedAmount,
    });

    const transfer = await executeSafeErc1155Transfer({
      contractAddress,
      signer,
      fromAddress: normalizedFromAddress,
      toAddress: normalizedToAddress,
      tokenId,
      amount: normalizedAmount,
    });

    return {
      chain: "polygon",
      network: normalizedNetwork,
      chainId,
      standard: normalizedStandard,
      amount: normalizedAmount,
      fromAddress: normalizedFromAddress,
      toAddress: normalizedToAddress,
      contractAddress: transfer.contractAddress,
      tokenId: transfer.tokenId,
      txHash: transfer.txResponse.hash,
      chainStatus: "submitted",
      submittedAt,
      rawRequest: {
        standard: normalizedStandard,
        amount: normalizedAmount,
        fromAddress: normalizedFromAddress,
        toAddress: normalizedToAddress,
        contractAddress: transfer.contractAddress,
        tokenId: transfer.tokenId,
        ownerAddress: ownership.ownerAddress,
        balance: ownership.balance,
      },
      rawResponse: serializeTransactionResponse(transfer.txResponse),
    };
  } catch (error) {
    throw buildTransferRpcError(error);
  }
}

module.exports = {
  estimateTransferFee,
  submitTransfer,
};
