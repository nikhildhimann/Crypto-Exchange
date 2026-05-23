import { useEffect, useMemo, useRef, useState } from "react";
import { fetchSuperadminWithdrawals } from "../services/withdrawals";
import { socket } from "../../lib/socket";

function createState() {
  return {
    data: null,
    loading: true,
    error: "",
    lastUpdatedAt: "",
  };
}

function getErrorMessage(error) {
  return error instanceof Error && error.message
    ? error.message
    : "Unable to load withdrawals right now.";
}

export function useSuperadminWithdrawalsList(query) {
  const requestIdRef = useRef(0);
  const mountedRef = useRef(false);
  const [refreshNonce, setRefreshNonce] = useState(0);
  const [state, setState] = useState(createState);

  const requestKey = useMemo(
    () => JSON.stringify(query),
    [query],
  );

  useEffect(() => {
    mountedRef.current = true;

    return () => {
      mountedRef.current = false;
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

    const parsedQuery = JSON.parse(requestKey);

    void fetchSuperadminWithdrawals(parsedQuery)
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
  }, [refreshNonce, requestKey]);

  // Real-time updates listener for Withdrawals
  useEffect(() => {
    const handleNewWithdrawal = (newTx) => {
      // Only care about outgoing transactions on this page
      if (newTx.direction !== "outgoing") {
        return;
      }

      setState((current) => {
        if (!current.data || !current.data.items) {
          return current;
        }

        const exists = current.data.items.some(
          (item) => item._id === newTx._id || (item.txHash && item.txHash === newTx.txHash),
        );

        if (exists) {
          return current;
        }

        let newItems = [newTx, ...current.data.items].sort((a, b) => {
          const timeA = new Date(a.createdAt || 0).getTime();
          const timeB = new Date(b.createdAt || 0).getTime();
          return timeB - timeA;
        });

        if (newItems.length > 100) {
          newItems = newItems.slice(0, 100);
        }

        return {
          ...current,
          data: {
            ...current.data,
            items: newItems,
            total: (current.data.total || 0) + 1,
          },
          lastUpdatedAt: new Date().toISOString(),
        };
      });
    };

    const handleUpdateWithdrawal = (updatedTx) => {
      // Only care about outgoing transactions on this page
      if (updatedTx.direction !== "outgoing") {
        return;
      }

      setState((current) => {
        if (!current.data || !current.data.items) {
          return current;
        }

        const index = current.data.items.findIndex(
          (item) => item._id === updatedTx._id || (item.txHash && item.txHash === updatedTx.txHash),
        );

        let newItems = [...current.data.items];

        if (index === -1) {
          // Falle out of sync - insert
          newItems = [updatedTx, ...newItems].sort((a, b) => {
            const timeA = new Date(a.createdAt || 0).getTime();
            const timeB = new Date(b.createdAt || 0).getTime();
            return timeB - timeA;
          });
        } else {
          newItems[index] = { ...newItems[index], ...updatedTx };
        }

        if (newItems.length > 100) {
          newItems = newItems.slice(0, 100);
        }

        return {
          ...current,
          data: {
            ...current.data,
            items: newItems,
          },
          lastUpdatedAt: new Date().toISOString(),
        };
      });
    };

    const handleReconnect = () => {
      setRefreshNonce((n) => n + 1);
    };

    socket.on("transaction:new", handleNewWithdrawal);
    socket.on("transaction:update", handleUpdateWithdrawal);
    socket.on("connect", handleReconnect);

    return () => {
      socket.off("transaction:new", handleNewWithdrawal);
      socket.off("transaction:update", handleUpdateWithdrawal);
      socket.off("connect", handleReconnect);
    };
  }, []);

  return {
    ...state,
    refresh: () => setRefreshNonce((current) => current + 1),
  };
}
