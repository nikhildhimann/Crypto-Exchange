function pick(source = {}, fields = []) {
  return fields.reduce((acc, field) => {
    if (Object.prototype.hasOwnProperty.call(source, field)) {
      acc[field] = source[field];
    }
    return acc;
  }, {});
}

function omit(source = {}, fields = []) {
  const clone = { ...source };
  fields.forEach((field) => delete clone[field]);
  return clone;
}

function removeUndefined(source = {}) {
  return Object.fromEntries(
    Object.entries(source).filter(([, value]) => value !== undefined),
  );
}

module.exports = {
  pick,
  omit,
  removeUndefined,
};
