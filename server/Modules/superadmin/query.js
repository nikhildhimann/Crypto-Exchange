const { mongoose } = require("../../common/classes/Model");

const DEFAULT_PAGE = 1;
const DEFAULT_LIMIT = 25;
const MAX_LIMIT = 100;
const MAX_QUERY_STRING_LENGTH = 2000;

function normalizeString(value) {
  return typeof value === "string" ? value.trim() : value == null ? "" : String(value).trim();
}

function normalizeLowerString(value) {
  return normalizeString(value).toLowerCase();
}

function normalizeBoolean(value) {
  if (typeof value === "boolean") {
    return value;
  }

  const normalized = normalizeLowerString(value);
  if (normalized === "true") {
    return true;
  }

  if (normalized === "false") {
    return false;
  }

  return null;
}

function isValidObjectId(value) {
  return mongoose.Types.ObjectId.isValid(String(value || ""));
}

function toObjectId(value) {
  return new mongoose.Types.ObjectId(String(value));
}

function escapeRegex(value) {
  return String(value || "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function buildRegex(value) {
  const normalized = normalizeString(value);
  if (!normalized) {
    return null;
  }

  return new RegExp(escapeRegex(normalized), "i");
}

function parsePagination(query = {}) {
  const requestedPage = Number.parseInt(query.page, 10);
  const requestedLimit = Number.parseInt(query.limit, 10);
  const page = Number.isInteger(requestedPage) && requestedPage > 0 ? requestedPage : DEFAULT_PAGE;
  const limit = Number.isInteger(requestedLimit) && requestedLimit > 0
    ? Math.min(requestedLimit, MAX_LIMIT)
    : DEFAULT_LIMIT;

  return {
    page,
    limit,
    skip: (page - 1) * limit,
  };
}

function resolveSort(query = {}, allowedSorts = [], fallback = { sortBy: "createdAt", sortOrder: "desc" }) {
  const allowedSortSet = new Set(allowedSorts);
  const requestedSortBy = normalizeString(query.sortBy);
  const requestedSortOrder = normalizeLowerString(query.sortOrder) === "asc" ? "asc" : "desc";
  const sortBy = allowedSortSet.has(requestedSortBy) ? requestedSortBy : fallback.sortBy;
  const sortOrder = requestedSortBy && allowedSortSet.has(requestedSortBy)
    ? requestedSortOrder
    : fallback.sortOrder;
  const direction = sortOrder === "asc" ? 1 : -1;

  return {
    sortBy,
    sortOrder,
    sort: {
      [sortBy]: direction,
      _id: direction,
    },
  };
}

function appendDateRangeFilter(filter, field, fromValue, toValue) {
  const from = normalizeString(fromValue);
  const to = normalizeString(toValue);
  const range = {};

  if (from) {
    const parsedFrom = new Date(from);
    if (!Number.isNaN(parsedFrom.getTime())) {
      range.$gte = parsedFrom;
    }
  }

  if (to) {
    const parsedTo = new Date(to);
    if (!Number.isNaN(parsedTo.getTime())) {
      range.$lte = parsedTo;
    }
  }

  if (Object.keys(range).length > 0) {
    filter[field] = range;
  }
}

function appendObjectIdFilter(filter, field, value) {
  if (!value) {
    return;
  }

  if (isValidObjectId(value)) {
    filter[field] = toObjectId(value);
  }
}

function appendStringFilter(filter, field, value) {
  const normalized = normalizeString(value);
  if (normalized) {
    filter[field] = normalized;
  }
}

function appendLowerStringFilter(filter, field, value) {
  const normalized = normalizeLowerString(value);
  if (normalized) {
    filter[field] = normalized;
  }
}

function appendBooleanFilter(filter, field, value) {
  const normalized = normalizeBoolean(value);
  if (normalized !== null) {
    filter[field] = normalized;
  }
}

function appendSearchFilter(filter, fields = [], value) {
  const regex = buildRegex(value);
  if (!regex || !Array.isArray(fields) || !fields.length) {
    return;
  }

  filter.$or = fields.map((field) => ({
    [field]: regex,
  }));
}

function buildAppliedFilters(filters = {}) {
  return Object.fromEntries(
    Object.entries(filters).filter(([, value]) => {
      if (value === undefined || value === null) {
        return false;
      }

      if (typeof value === "string") {
        return value.trim().length > 0;
      }

      return true;
    }),
  );
}

function buildListResponse({
  items,
  page,
  limit,
  total,
  appliedFilters = {},
  sortBy,
  sortOrder,
}) {
  const totalPages = total > 0 ? Math.ceil(total / limit) : 0;

  return {
    items,
    page,
    limit,
    total,
    totalPages,
    hasNextPage: totalPages > 0 && page < totalPages,
    hasPrevPage: page > 1 && totalPages > 0,
    appliedFilters,
    sort: {
      sortBy,
      sortOrder,
    },
  };
}

async function runPaginatedQuery({
  model,
  filter,
  projection,
  sort,
  page,
  limit,
  populate = [],
}) {
  let finder = model.find(filter, projection).sort(sort).skip((page - 1) * limit).limit(limit).lean();

  for (const entry of populate) {
    finder = finder.populate(entry);
  }

  const [items, total] = await Promise.all([
    finder,
    model.countDocuments(filter),
  ]);

  return {
    items,
    total,
  };
}

function paginateItems(items = [], query = {}, allowedSorts = [], fallbackSort = { sortBy: "createdAt", sortOrder: "desc" }) {
  const { page, limit, skip } = parsePagination(query);
  const { sortBy, sortOrder } = resolveSort(query, allowedSorts, fallbackSort);
  const sorted = [...items].sort((left, right) => {
    const leftValue = left?.[sortBy];
    const rightValue = right?.[sortBy];

    if (leftValue === rightValue) {
      return 0;
    }

    if (leftValue === undefined || leftValue === null) {
      return sortOrder === "asc" ? -1 : 1;
    }

    if (rightValue === undefined || rightValue === null) {
      return sortOrder === "asc" ? 1 : -1;
    }

    if (leftValue instanceof Date || rightValue instanceof Date) {
      const leftTime = new Date(leftValue).getTime();
      const rightTime = new Date(rightValue).getTime();
      return sortOrder === "asc" ? leftTime - rightTime : rightTime - leftTime;
    }

    if (typeof leftValue === "number" && typeof rightValue === "number") {
      return sortOrder === "asc" ? leftValue - rightValue : rightValue - leftValue;
    }

    const comparison = String(leftValue).localeCompare(String(rightValue));
    return sortOrder === "asc" ? comparison : comparison * -1;
  });

  return {
    items: sorted.slice(skip, skip + limit),
    total: sorted.length,
    page,
    limit,
    sortBy,
    sortOrder,
  };
}


function validateQueryStringLength(queryString = "") {
  const length = JSON.stringify(queryString).length;
  if (length > MAX_QUERY_STRING_LENGTH) {
    throw new Error(`Query string exceeds maximum length of ${MAX_QUERY_STRING_LENGTH}`);
  }
}


module.exports = {
  buildAppliedFilters,
  buildListResponse,
  buildRegex,
  escapeRegex,
  isValidObjectId,
  normalizeBoolean,
  normalizeLowerString,
  normalizeString,
  parsePagination,
  paginateItems,
  resolveSort,
  runPaginatedQuery,
  toObjectId,
  appendBooleanFilter,
  appendDateRangeFilter,
  appendLowerStringFilter,
  appendObjectIdFilter,
  appendSearchFilter,
  appendStringFilter,
  validateQueryStringLength,
};
