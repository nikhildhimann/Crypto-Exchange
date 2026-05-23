const logger = require("../common/utils/logger");
const queueConfig = require("../config/queue");
const runtimeState = require("../services/runtimeState");

// Job configuration from environment. Global JOBS_ENABLED/QUEUE_ENABLED and
// DEMO_MODE are resolved in config/queue so all workers share one kill switch.
const JOB_CONFIG = queueConfig.jobs;

// In-memory job locks to prevent overlapping runs
const jobLocks = new Map();

// Shared job helpers
function getJobLockKey(jobName) {
  return `job_${jobName}`;
}

async function withJobLock(jobName, jobFunction) {
  const lockKey = getJobLockKey(jobName);

  const existingLock = jobLocks.get(lockKey);
  if (existingLock) {
    logger.info(`Job ${jobName} is already running, skipping`, {
      job: jobName,
      lockAgeMs: Math.max(Date.now() - Number(existingLock.startedAtMs || 0), 0),
      startedAt: existingLock.startedAt || null,
      pid: existingLock.pid || process.pid,
    });
    return { status: 'skipped', reason: 'already_running' };
  }

  const lockState = {
    startedAt: new Date().toISOString(),
    startedAtMs: Date.now(),
    pid: process.pid,
  };

  jobLocks.set(lockKey, lockState);
  const startTime = Date.now();

  try {
    logger.info(`Starting job ${jobName}`, {
      job: jobName,
      enabled: JOB_CONFIG[jobName]?.enabled,
      enabledSource: JOB_CONFIG[jobName]?.enabledSource || "",
      intervalMs: Number(JOB_CONFIG[jobName]?.intervalMs || 0),
      intervalSource: JOB_CONFIG[jobName]?.intervalSource || "",
      ...lockState,
    });
    const result = await jobFunction();
    const duration = Date.now() - startTime;

    logger.info(`Job ${jobName} completed`, {
      duration: `${duration}ms`,
      status: result?.status || "completed",
      ...result
    });

    return result;
  } catch (error) {
    const duration = Date.now() - startTime;
    logger.error(`Job ${jobName} failed`, {
      duration: `${duration}ms`,
      error: error.message,
      stack: error.stack
    });
    
    return { 
      status: 'failed', 
      error: error.message, 
      duration: `${duration}ms` 
    };
  } finally {
    jobLocks.delete(lockKey);
  }
}

function isJobEnabled(jobName) {
  return JOB_CONFIG[jobName]?.enabled !== false;
}

function getJobInterval(jobName) {
  return JOB_CONFIG[jobName]?.intervalMs;
}

function getActiveJobLock(jobName) {
  return jobLocks.get(getJobLockKey(jobName)) || null;
}

async function executeJobRunner(jobName, jobRunner, trigger = "scheduled") {
  try {
    return await jobRunner();
  } catch (error) {
    logger.error(`Unhandled error while executing job ${jobName}`, {
      job: jobName,
      trigger,
      error: error.message,
      stack: error.stack,
    });

    return {
      job: jobName,
      status: "failed",
      trigger,
      error: error.message,
    };
  }
}

// Job runners
const jobRunners = {
  depositWatcher: () => require('./depositWatcher.job')(),
  withdrawalStatus: () => require('./withdrawalStatus.job')(),
  transactionStatus: () => require('./transactionStatus.job')(),
  balanceSync: () => require('./balanceSync.job')(),
  sessionCleanup: () => require('./sessionCleanup.job')(),
  treasuryReconcile: () => require('./treasuryReconcile.job')(),
  utxoWalletSync: () => require('./utxoWalletSync.job')(),
  syncQueueWorker: () => require('./syncQueueWorker.job')(),
  nftListingExpiry: () => require('./nftListingExpiry.job')(),
};

function buildResolvedJobLogPayload() {
  return Object.fromEntries(
    Object.entries(JOB_CONFIG).map(([jobName, config]) => [
      jobName,
      {
        enabled: Boolean(config.enabled),
        enabledSource: config.enabledSource || "",
        intervalMs: Number(config.intervalMs || 0),
        intervalSource: config.intervalSource || "",
      },
    ]),
  );
}

// Main job scheduler
class JobScheduler {
  constructor() {
    this.intervals = new Map();
    this.started = false;
  }

  async startJob(jobName, jobRunner) {
    if (!isJobEnabled(jobName)) {
      logger.info(`Job ${jobName} is disabled, skipping`);
      return;
    }

    if (this.intervals.has(jobName)) {
      logger.warn(`Job ${jobName} is already scheduled, skipping duplicate schedule request`, {
        job: jobName,
      });
      return;
    }

    const intervalMs = getJobInterval(jobName);
    if (!intervalMs || intervalMs <= 0) {
      logger.warn(`Job ${jobName} has invalid interval: ${intervalMs}`);
      return;
    }

    // Run immediately on start, then schedule.
    // Individual job files already own the lock lifecycle via withJobLock.
    executeJobRunner(jobName, jobRunner, "startup");

    const intervalId = setInterval(() => {
      void executeJobRunner(jobName, jobRunner, "interval");
    }, intervalMs);

    this.intervals.set(jobName, intervalId);
    logger.info(`Job ${jobName} scheduled with interval ${intervalMs}ms`, {
      job: jobName,
      enabled: Boolean(JOB_CONFIG[jobName]?.enabled),
      enabledSource: JOB_CONFIG[jobName]?.enabledSource || "",
      intervalSource: JOB_CONFIG[jobName]?.intervalSource || "",
    });
  }

  stopJob(jobName) {
    const intervalId = this.intervals.get(jobName);
    if (intervalId) {
      clearInterval(intervalId);
      this.intervals.delete(jobName);
      logger.info(`Job ${jobName} stopped`);
    }
  }

  async startAll() {
    const resolvedJobConfig = buildResolvedJobLogPayload();

    if (!queueConfig.enabled) {
      runtimeState.markJobsState({ enabled: false, status: "disabled" });
      logger.info("Job scheduler is disabled by configuration", {
        event: "jobs_disabled",
        queueEnabled: Boolean(queueConfig.enabled),
        queueEnabledSource: queueConfig.enabledSource,
        jobsEnabled: Boolean(queueConfig.jobsEnabled),
        resolvedJobs: resolvedJobConfig,
      });
      return;
    }

    if (this.started) {
      logger.warn("Job scheduler start requested while already running", {
        event: "jobs_already_running",
      });
      return;
    }

    runtimeState.markJobsState({ enabled: true, status: "starting" });
    logger.info("Starting job scheduler...", {
      event: "jobs_starting",
      queueEnabled: Boolean(queueConfig.enabled),
      queueEnabledSource: queueConfig.enabledSource,
      jobsEnabled: Boolean(queueConfig.jobsEnabled),
      resolvedJobs: resolvedJobConfig,
    });
    
    const jobPromises = Object.entries(jobRunners).map(async ([jobName, jobRunner]) => {
      try {
        await this.startJob(jobName, jobRunner);
      } catch (error) {
        logger.error(`Failed to start job ${jobName}`, { error: error.message });
      }
    });

    await Promise.allSettled(jobPromises);
    this.started = true;
    runtimeState.markJobsState({ enabled: true, status: "active" });
    logger.info("Job scheduler started", {
      event: "jobs_started",
      scheduledJobs: Array.from(this.intervals.keys()),
      queueEnabled: Boolean(queueConfig.enabled),
      queueEnabledSource: queueConfig.enabledSource,
    });
  }

  stopAll() {
    if (!this.started && !this.intervals.size) {
      runtimeState.markJobsState({
        enabled: queueConfig.enabled,
        status: queueConfig.enabled ? "idle" : "disabled",
      });
      return;
    }

    runtimeState.markJobsState({ enabled: queueConfig.enabled, status: "stopping" });
    logger.info("Stopping job scheduler...", {
      event: "jobs_stopping",
      scheduledJobs: Array.from(this.intervals.keys()),
    });
    
    for (const jobName of this.intervals.keys()) {
      this.stopJob(jobName);
    }
    
    this.started = false;
    runtimeState.markJobsState({
      enabled: queueConfig.enabled,
      status: queueConfig.enabled ? "stopped" : "disabled",
    });
    logger.info("Job scheduler stopped", {
      event: "jobs_stopped",
    });
  }

  getStatus() {
    const status = {};
    for (const [jobName, runner] of Object.entries(jobRunners)) {
      status[jobName] = {
        enabled: isJobEnabled(jobName),
        interval: getJobInterval(jobName),
        running: jobLocks.has(getJobLockKey(jobName)),
        runningSince: getActiveJobLock(jobName)?.startedAt || null,
        scheduled: this.intervals.has(jobName),
        enabledSource: JOB_CONFIG[jobName]?.enabledSource || "",
        intervalSource: JOB_CONFIG[jobName]?.intervalSource || "",
      };
    }
    return status;
  }
}

// Global scheduler instance
const scheduler = new JobScheduler();

module.exports = {
  scheduler,
  withJobLock,
  isJobEnabled,
  getJobInterval,
  JOB_CONFIG,
};
