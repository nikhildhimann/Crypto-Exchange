import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  fetchSuperadminFailedTransactions,
  fetchSuperadminOverviewMetrics,
  fetchSuperadminRecentAuditEvents,
  fetchSuperadminRecentUsers,
  fetchSuperadminRecentWithdrawals,
  fetchSuperadminRuntimeSnapshot,
  normalizeOverviewTimestamp,
} from "../services/overview";
import { socket } from "../../lib/socket";
import { createRequestState, getErrorMessage } from "../utils/common";

const WIDGET_FETCHERS = Object.freeze({});

const WIDGET_KEYS = Object.freeze(Object.keys(WIDGET_FETCHERS));

function createWidgetState() {
  return Object.fromEntries(WIDGET_KEYS.map((key) => [key, createRequestState()]));
}

export function useSuperadminOverview() {
  const mountedRef = useRef(false);
  const requestIdsRef = useRef({
    summary: 0,
    ...Object.fromEntries(WIDGET_KEYS.map((key) => [key, 0])),
  });
  const [summary, setSummary] = useState(createRequestState);
  const [widgets, setWidgets] = useState(createWidgetState);

  useEffect(() => {
    mountedRef.current = true;

    return () => {
      mountedRef.current = false;
    };
  }, []);

  const loadSummary = useCallback(async () => {
    const requestId = requestIdsRef.current.summary + 1;
    requestIdsRef.current.summary = requestId;

    setSummary((current) => ({
      ...current,
      loading: true,
      error: "",
    }));

    try {
      const data = await fetchSuperadminOverviewMetrics();

      if (!mountedRef.current || requestIdsRef.current.summary !== requestId) {
        return;
      }

      setSummary({
        data,
        loading: false,
        error: "",
        lastUpdatedAt: normalizeOverviewTimestamp(new Date().toISOString()),
      });
    } catch (error) {
      if (!mountedRef.current || requestIdsRef.current.summary !== requestId) {
        return;
      }

      setSummary((current) => ({
        ...current,
        loading: false,
        error: getErrorMessage(error, "Unable to load overview metrics right now."),
      }));
    }
  }, []);

  const loadWidget = useCallback(async (key) => {
    const fetcher = WIDGET_FETCHERS[key];

    if (!fetcher) {
      return;
    }

    const requestId = requestIdsRef.current[key] + 1;
    requestIdsRef.current[key] = requestId;

    setWidgets((current) => ({
      ...current,
      [key]: {
        ...current[key],
        loading: true,
        error: "",
      },
    }));

    try {
      const data = await fetcher();

      if (!mountedRef.current || requestIdsRef.current[key] !== requestId) {
        return;
      }

      setWidgets((current) => ({
        ...current,
        [key]: {
          data,
          loading: false,
          error: "",
          lastUpdatedAt: normalizeOverviewTimestamp(new Date().toISOString()),
        },
      }));
    } catch (error) {
      if (!mountedRef.current || requestIdsRef.current[key] !== requestId) {
        return;
      }

      setWidgets((current) => ({
        ...current,
        [key]: {
          ...current[key],
          loading: false,
          error: getErrorMessage(error, "Unable to load this overview panel."),
        },
      }));
    }
  }, []);

  const refreshAll = useCallback(() => {
    void loadSummary();
    WIDGET_KEYS.forEach((key) => {
      void loadWidget(key);
    });
  }, [loadSummary, loadWidget]);

  useEffect(() => {
    refreshAll();
  }, [refreshAll]);

  useEffect(() => {
    const handleUpdate = () => {
      refreshAll();
    };

    socket.on("transaction:new", handleUpdate);
    socket.on("transaction:update", handleUpdate);

    return () => {
      socket.off("transaction:new", handleUpdate);
      socket.off("transaction:update", handleUpdate);
    };
  }, [refreshAll]);

  const isRefreshing = useMemo(
    () => summary.loading || WIDGET_KEYS.some((key) => widgets[key]?.loading),
    [summary.loading, widgets],
  );

  return {
    summary,
    widgets,
    loadSummary,
    loadWidget,
    refreshAll,
    isRefreshing,
  };
}
