const WORDS = [
  "amber",
  "ocean",
  "vault",
  "copper",
  "matrix",
  "secure",
  "ledger",
  "orbit",
  "vertex",
  "ember",
];

module.exports = function randomWords(count = 3) {
  return Array.from({ length: count }, (_, index) => WORDS[index % WORDS.length]).join("-");
};
