import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  fetchSuperadminRuntimeCompactLists,
  fetchSuperadminRuntimeOverviewSummary,
  fetchSuperadminRuntimeSettings,
  normalizeRuntimeTimestamp,
} from "../services/runtime";
import { createRequestState, getErrorMessage } from "../utils/common";

const WIDGET_FETCHERS = Object.freeze({
  settings: fetchSuperadminRuntimeSettings,
  overview: fetchSuperadminRuntimeOverviewSummary,
  compactLists: fetchSuperadminRuntimeCompactLists,
});

const WIDGET_KEYS = Object.freeze(Object.keys(WIDGET_FETCHERS));

function createWidgetState() {
  return Object.fromEntries(WIDGET_KEYS.map((key) => [key, createRequestState()]));
}

export function useSuperadminRuntimeStatus() {
  const mountedRef = useRef(false);
  const requestIdsRef = useRef(Object.fromEntries(WIDGET_KEYS.map((key) => [key, 0])));
  const [widgets, setWidgets] = useState(createWidgetState);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
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
          lastUpdatedAt: normalizeRuntimeTimestamp(new Date().toISOString()),
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
          error: getErrorMessage(error, "Unable to load this runtime panel."),
        },
      }));
    }
  }, []);

  const refreshAll = useCallback(() => {
    WIDGET_KEYS.forEach((key) => {
      void loadWidget(key);
    });
  }, [loadWidget]);

  useEffect(() => {
    refreshAll();
  }, [refreshAll]);

  const isRefreshing = useMemo(
    () => WIDGET_KEYS.some((key) => widgets[key]?.loading),
    [widgets],
  );

  return {
    widgets,
    loadWidget,
    refreshAll,
    isRefreshing,
  };
}
