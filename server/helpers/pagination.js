function escapeSearchRegex(value) {
  return String(value || "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

async function paginate(
  model,
  query = {},
  { page = 0, limit = 10, populate = [], searchFields = [], searchTerm = "", sort = { createdAt: -1 } } = {},
) {
  const parsedPage = Math.max(parseInt(page, 10) || 0, 0);
  const parsedLimit = Math.max(parseInt(limit, 10) || 10, 1);
  const skip = parsedPage * parsedLimit;
  const mongoQuery = { ...query };

  if (searchTerm && searchFields.length) {
    const normalizedSearchTerm = String(searchTerm).trim();
    const regex = normalizedSearchTerm
      ? new RegExp(escapeSearchRegex(normalizedSearchTerm), "i")
      : null;
    const searchableFields = searchFields.filter(
      (field) => model.schema.paths[field]?.instance === "String",
    );

    if (regex && searchableFields.length) {
      mongoQuery.$or = searchableFields.map((field) => ({
        [field]: { $regex: regex },
      }));
    }
  }

  let finder = model.find(mongoQuery).skip(skip).limit(parsedLimit).sort(sort);
  populate.forEach((field) => {
    finder = finder.populate(field);
  });

  const [data, totalRecords] = await Promise.all([
    finder,
    model.countDocuments(mongoQuery),
  ]);

  return {
    data,
    meta: {
      totalRecords,
      currentPage: parsedPage,
      totalPages: Math.ceil(totalRecords / parsedLimit),
      limit: parsedLimit,
    },
  };
}

module.exports = paginate;
