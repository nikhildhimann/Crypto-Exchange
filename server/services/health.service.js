const appConfig = require("../config/app");
const runtimeState = require("./runtimeState");

function getHealthPayload() {
  const snapshot = runtimeState.getHealthSnapshot();

  return {
    status:
      snapshot.server.status === "running" && snapshot.database.status === "connected"
        ? "ok"
        : "degraded",
    appName: appConfig.appName,
    environment: appConfig.nodeEnv,
    demoMode: appConfig.demoMode,
    server: snapshot.server,
    database: snapshot.database,
    jobs: snapshot.jobs,
    activeChains: snapshot.activeChains,
    chains: snapshot.chains,
  };
}

module.exports = {
  getHealthPayload,
};
