function toPlainObject(document) {
  return typeof document?.toObject === "function" ? document.toObject() : document;
}

function toPublicCollection(items = [], transformer = (value) => value) {
  return items.map((item) => transformer(toPlainObject(item)));
}

module.exports = {
  toPlainObject,
  toPublicCollection,
};
