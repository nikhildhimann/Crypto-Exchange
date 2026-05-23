function nowIso() {
  return new Date().toISOString();
}

function addMinutes(date, minutes) {
  return new Date(new Date(date).getTime() + minutes * 60 * 1000);
}

module.exports = {
  nowIso,
  addMinutes,
};
