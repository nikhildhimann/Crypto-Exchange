const { Contract, getAddress } = require("ethers");

const { AppError } = require("../../../helpers/errors");

const ERC721_ABI = Object.freeze([
  "function ownerOf(uint256 tokenId) view returns (address)",
  "function safeTransferFrom(address from, address to, uint256 tokenId)",
]);
const ERC1155_ABI = Object.freeze([
  "function safeTransferFrom(address from, address to, uint256 id, uint256 amount, bytes data)",
  "function balanceOf(address account, uint256 id) view returns (uint256)",
]);

function normalizeEvmAddress(value, label = "address") {
  const normalized = String(value || "").trim();

  if (!normalized) {
    throw AppError.validation(`${label} is required`);
  }

  try {
    return getAddress(normalized);
  } catch (_error) {
    throw AppError.validation(`Invalid ${label}`);
  }
}

function normalizeContractAddress(value) {
  return normalizeEvmAddress(value, "NFT contract address");
}

function normalizeTokenId(value) {
  if (value === undefined || value === null || value === "") {
    throw AppError.validation("NFT token id is required");
  }

  const normalized = String(value).trim();
  if (!normalized) {
    throw AppError.validation("NFT token id is required");
  }

  try {
    if (/^0x[0-9a-fA-F]+$/.test(normalized)) {
      return BigInt(normalized);
    }

    if (/^\d+$/.test(normalized)) {
      return BigInt(normalized);
    }
  } catch (_error) {
    throw AppError.validation("Invalid NFT token id");
  }

  throw AppError.validation("Invalid NFT token id");
}

function createErc721Contract({ contractAddress, signerOrProvider }) {
  if (!signerOrProvider) {
    throw AppError.validation("Signer or provider is required for NFT contract access");
  }

  const normalizedContractAddress = normalizeContractAddress(contractAddress);

  return new Contract(
    normalizedContractAddress,
    ERC721_ABI,
    signerOrProvider,
  );
}

function createErc1155Contract({ contractAddress, signerOrProvider }) {
  if (!signerOrProvider) {
    throw AppError.validation("Signer or provider is required for NFT contract access");
  }

  const normalizedContractAddress = normalizeContractAddress(contractAddress);

  return new Contract(
    normalizedContractAddress,
    ERC1155_ABI,
    signerOrProvider,
  );
}

async function executeSafeErc721Transfer({
  contractAddress,
  signer,
  fromAddress,
  toAddress,
  tokenId,
}) {
  const normalizedContractAddress = normalizeContractAddress(contractAddress);
  const normalizedTokenId = normalizeTokenId(tokenId);
  const contract = createErc721Contract({
    contractAddress: normalizedContractAddress,
    signerOrProvider: signer,
  });

  const txResponse = await contract[
    "safeTransferFrom(address,address,uint256)"
  ](fromAddress, toAddress, normalizedTokenId);

  return {
    contractAddress: normalizedContractAddress,
    tokenId: normalizedTokenId.toString(),
    txResponse,
  };
}

async function getErc721Owner({
  contractAddress,
  signerOrProvider,
  tokenId,
}) {
  const normalizedContractAddress = normalizeContractAddress(contractAddress);
  const normalizedTokenId = normalizeTokenId(tokenId);
  const contract = createErc721Contract({
    contractAddress: normalizedContractAddress,
    signerOrProvider,
  });

  const ownerAddress = await contract.ownerOf(normalizedTokenId);

  return {
    contractAddress: normalizedContractAddress,
    tokenId: normalizedTokenId.toString(),
    ownerAddress: normalizeEvmAddress(ownerAddress, "ERC-721 owner address"),
  };
}

async function assertErc721Owner({
  contractAddress,
  signerOrProvider,
  tokenId,
  expectedOwnerAddress,
  mismatchMessage = "NFT is no longer owned by the selected wallet on-chain",
}) {
  const expectedOwner = normalizeEvmAddress(
    expectedOwnerAddress,
    "expected ERC-721 owner address",
  );
  const ownership = await getErc721Owner({
    contractAddress,
    signerOrProvider,
    tokenId,
  });

  if (ownership.ownerAddress !== expectedOwner) {
    throw AppError.validation(mismatchMessage, {
      currentOwnerAddress: ownership.ownerAddress,
      expectedOwnerAddress: expectedOwner,
      contractAddress: ownership.contractAddress,
      tokenId: ownership.tokenId,
    });
  }

  return ownership;
}

async function assertErc1155Balance({
  contractAddress,
  signerOrProvider,
  tokenId,
  ownerAddress,
  requiredAmount = "1",
}) {
  const normalizedContractAddress = normalizeContractAddress(contractAddress);
  const normalizedTokenId = normalizeTokenId(tokenId);
  const normalizedOwnerAddress = normalizeEvmAddress(
    ownerAddress,
    "ERC-1155 owner address",
  );
  const contract = createErc1155Contract({
    contractAddress: normalizedContractAddress,
    signerOrProvider,
  });
  const balance = await contract.balanceOf(
    normalizedOwnerAddress,
    normalizedTokenId,
  );

  if (BigInt(balance.toString()) < BigInt(requiredAmount)) {
    throw AppError.validation(
      "NFT is no longer owned by the selected wallet on-chain",
    );
  }

  return {
    contractAddress: normalizedContractAddress,
    tokenId: normalizedTokenId.toString(),
    ownerAddress: normalizedOwnerAddress,
    balance: balance.toString(),
  };
}

async function executeSafeErc1155Transfer({
  contractAddress,
  signer,
  fromAddress,
  toAddress,
  tokenId,
  amount = "1",
}) {
  const normalizedContractAddress = normalizeContractAddress(contractAddress);
  const normalizedTokenId = normalizeTokenId(tokenId);
  const contract = createErc1155Contract({
    contractAddress: normalizedContractAddress,
    signerOrProvider: signer,
  });

  const txResponse = await contract.safeTransferFrom(
    fromAddress,
    toAddress,
    normalizedTokenId,
    BigInt(amount),
    "0x",
  );

  return {
    contractAddress: normalizedContractAddress,
    tokenId: normalizedTokenId.toString(),
    txResponse,
  };
}

module.exports = {
  ERC721_ABI,
  ERC1155_ABI,
  normalizeEvmAddress,
  normalizeContractAddress,
  normalizeTokenId,
  createErc721Contract,
  createErc1155Contract,
  getErc721Owner,
  assertErc721Owner,
  assertErc1155Balance,
  executeSafeErc721Transfer,
  executeSafeErc1155Transfer,
};
