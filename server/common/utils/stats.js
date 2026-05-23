const logger = require("./logger");

/**
 * Lightweight in-memory stats tracker for production observability.
 * Provides visibility into cache efficiency and system behavioral patterns
 * without the overhead of an external metrics collector.
 */
class StatsTracker {
  constructor() {
    this.counters = new Map();
    this.timers = new Map();
    this.lastReportedAt = Date.now();
  }

  /**
   * Increments a named counter.
   */
  increment(key, delta = 1) {
    const current = this.counters.get(key) || 0;
    this.counters.set(key, current + delta);
  }

  /**
   * Tracks a hit/miss ratio for a specific category.
   */
  trackCache(category, hit = false) {
    this.increment(`${category}_${hit ? "hit" : "miss"}`);
  }

  /**
   * Captures the duration of an operation.
   */
  setGauge(key, value) {
    this.counters.set(key, value);
  }

  /**
   * Summarizes and logs all captured metrics, then resets them.
   */
  flush(context = "system") {
    const now = Date.now();
    const durationSec = (now - this.lastReportedAt) / 1000;
    
    if (this.counters.size === 0) {
      this.lastReportedAt = now;
      return;
    }

    const stats = Object.fromEntries(this.counters);
    logger.info(`Production Performance Metrics [${context}]`, {
      event: "observability_stats_flush",
      context,
      durationSec: Math.round(durationSec),
      stats,
    });

    this.counters.clear();
    this.lastReportedAt = now;
  }
}

module.exports = new StatsTracker();
