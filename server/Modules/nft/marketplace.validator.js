const getListingsRules = {
  contractAddress: "required|string|min:10|max:100",
  chain: "string|in:polygon,ethereum,base",
  page: "integer",
  limit: "integer",
  minPrice: "numeric",
  maxPrice: "numeric",
  sortBy: "in:price_asc,price_desc,newest",
};

const getUserListingsRules = {
  status: "in:active,sold,cancelled,expired,all",
  chain: "string|in:polygon,ethereum,base",
  page: "integer",
  limit: "integer",
};

const listForSaleRules = {
  walletId: "required|mongoid",
  nftId: "required|mongoid",
  priceInMatic: "required|numeric",
  expirationDays: "integer",
  chain: "string|in:polygon,ethereum,base",
};

const buyNFTRules = {
  walletId: "required|mongoid",
  orderId: "required|string|min:1|max:200",
  chain: "string|in:polygon,ethereum,base",
};

const cancelListingRules = {
  walletId: "required|mongoid",
  listingId: "required|mongoid",
};

const getOrdersRules = {
  type: "in:buy,sell",
  status: "in:pending,confirmed,failed",
  chain: "string|in:polygon,ethereum,base",
  page: "integer",
  limit: "integer",
};

module.exports = {
  getListingsRules,
  getUserListingsRules,
  listForSaleRules,
  buyNFTRules,
  cancelListingRules,
  getOrdersRules,
};
