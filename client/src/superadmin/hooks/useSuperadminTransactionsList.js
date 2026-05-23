import { useEffect, useMemo, useRef, useState } from "react";
import { fetchSuperadminTransactions } from "../services/transactions";
import { socket } from "../../lib/socket";
import { getErrorMessage } from "../utils/common";
import {
  isVisibleInSuperadminTransaction,
  normalizeTransactionSort,
  shouldApplyRealtimeTransactions,
  upsertTransactionItems,
} from "../utils/transactionsList";

const RECONNECT_REFRESH_DEBOUNCE_MS = 600;
const RECONNECT_REFRESH_COOLDOWN_MS = 5000;

function createState() {
  return {
    data: null,
    loading: true,
    error: "",
    lastUpdatedAt: "",
  };
}

function buildPaginationMeta(data, total) {
  const limit = Number.isInteger(data?.limit) && data.limit > 0 ? data.limit : 1;
  const page = Number.isInteger(data?.page) && data.page > 0 ? data.page : 1;
  const totalPages = total > 0 ? Math.ceil(total / limit) : 0;

  return {
    totalPages,
    hasNextPage: totalPages > 0 && page < totalPages,
    hasPrevPage: page > 1 && totalPages > 0,
  };
}

export function useSuperadminTransactionsList(query) {
  const requestIdRef = useRef(0);
  const mountedRef = useRef(false);
  const reconnectTimerRef = useRef(null);
  const reconnectStateRef = useRef({
    hasConnected: false,
    sawDisconnect: false,
    lastRefreshAt: 0,
  });
  const [refreshNonce, setRefreshNonce] = useState(0);
  const [state, setState] = useState(createState);

  const requestKey = useMemo(() => JSON.stringify(query), [query]);
  const parsedQuery = useMemo(() => JSON.parse(requestKey), [requestKey]);
  const realtimeEnabled = useMemo(
    () => shouldApplyRealtimeTransactions(parsedQuery),
    [parsedQuery],
  );

  useEffect(() => {
    mountedRef.current = true;

    return () => {
      mountedRef.current = false;
      if (reconnectTimerRef.current) {
        window.clearTimeout(reconnectTimerRef.current);
        reconnectTimerRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    const requestId = requestIdRef.current + 1;
    requestIdRef.current = requestId;

    setState((current) => ({
      ...current,
      loading: true,
      error: "",
    }));

    void fetchSuperadminTransactions(parsedQuery)
      .then((data) => {
        if (!mountedRef.current || requestIdRef.current !== requestId) {
          return;
        }

        setState({
          data,
          loading: false,
          error: "",
          lastUpdatedAt: new Date().toISOString(),
        });
      })
      .catch((error) => {
        if (!mountedRef.current || requestIdRef.current !== requestId) {
          return;
        }

        setState((current) => ({
          ...current,
          loading: false,
          error: getErrorMessage(error),
        }));
      });
  }, [parsedQuery, refreshNonce]);

  useEffect(() => {
    const scheduleReconnectRefresh = () => {
      if (!realtimeEnabled) {
        return;
      }

      const reconnectState = reconnectStateRef.current;
      const now = Date.now();
      if (!reconnectState.sawDisconnect) {
        return;
      }

      if (now - reconnectState.lastRefreshAt < RECONNECT_REFRESH_COOLDOWN_MS) {
        reconnectState.sawDisconnect = false;
        return;
      }

      if (reconnectTimerRef.current) {
        window.clearTimeout(reconnectTimerRef.current);
      }

      reconnectTimerRef.current = window.setTimeout(() => {
        reconnectTimerRef.current = null;
        reconnectState.lastRefreshAt = Date.now();
        reconnectState.sawDisconnect = false;
        setRefreshNonce((current) => current + 1);
      }, RECONNECT_REFRESH_DEBOUNCE_MS);
    };

    const handleConnect = () => {
      const reconnectState = reconnectStateRef.current;
      if (!reconnectState.hasConnected) {
        reconnectState.hasConnected = true;
        reconnectState.sawDisconnect = false;
        return;
      }

      scheduleReconnectRefresh();
    };

    const handleDisconnect = () => {
      reconnectStateRef.current.sawDisconnect = true;
    };

    const handleNewTransaction = (incomingTransaction) => {
      if (!realtimeEnabled) {
        return;
      }

      if (!isVisibleInSuperadminTransaction(incomingTransaction)) {
        return;
      }

      setState((current) => {
        if (!current.data?.items) {
          return current;
        }

        const sort = normalizeTransactionSort(current.data.sort || parsedQuery);
        const result = upsertTransactionItems(current.data.items, incomingTransaction, {
          sort,
          limit: current.data.limit,
          insertIfMissing: true,
        });

        if (!result.changed) {
          return current;
        }

        const nextTotal = result.inserted ? (current.data.total || 0) + 1 : current.data.total || 0;

        return {
          ...current,
          data: {
            ...current.data,
            items: result.items,
            total: nextTotal,
            ...buildPaginationMeta(current.data, nextTotal),
          },
          lastUpdatedAt: new Date().toISOString(),
        };
      });
    };

    const handleUpdateTransaction = (incomingTransaction) => {
      if (!realtimeEnabled) {
        return;
      }

      if (!isVisibleInSuperadminTransaction(incomingTransaction)) {
        return;
      }

      setState((current) => {
        if (!current.data?.items) {
          return current;
        }

        const sort = normalizeTransactionSort(current.data.sort || parsedQuery);
        const result = upsertTransactionItems(current.data.items, incomingTransaction, {
          sort,
          limit: current.data.limit,
          insertIfMissing: false,
        });

        if (!result.changed) {
          return current;
        }

        return {
          ...current,
          data: {
            ...current.data,
            items: result.items,
          },
          lastUpdatedAt: new Date().toISOString(),
        };
      });
    };

    socket.on("transaction:new", handleNewTransaction);
    socket.on("transaction:update", handleUpdateTransaction);
    socket.on("connect", handleConnect);
    socket.on("disconnect", handleDisconnect);

    return () => {
      if (reconnectTimerRef.current) {
        window.clearTimeout(reconnectTimerRef.current);
        reconnectTimerRef.current = null;
      }

      socket.off("transaction:new", handleNewTransaction);
      socket.off("transaction:update", handleUpdateTransaction);
      socket.off("connect", handleConnect);
      socket.off("disconnect", handleDisconnect);
    };
  }, [parsedQuery, realtimeEnabled]);

  return {
    ...state,
    refresh: () => setRefreshNonce((current) => current + 1),
  };
}
