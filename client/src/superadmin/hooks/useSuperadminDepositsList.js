import { useEffect, useMemo, useRef, useState } from "react";
import { fetchSuperadminDeposits } from "../services/deposits";
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
    : "Unable to load deposits right now.";
}

export function useSuperadminDepositsList(query) {
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

    void fetchSuperadminDeposits(parsedQuery)
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

  // Real-time updates listener for Deposits
  useEffect(() => {
    const handleNewDeposit = (newTx) => {
      // Only care about incoming transactions on this page
      if (newTx.direction !== "incoming") {
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

    const handleUpdateDeposit = (updatedTx) => {
      // Only care about incoming transactions on this page
      if (updatedTx.direction !== "incoming") {
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
          // Fallen out of sync or arrived out of order - insert
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

    socket.on("transaction:new", handleNewDeposit);
    socket.on("transaction:update", handleUpdateDeposit);
    socket.on("connect", handleReconnect);

    return () => {
      socket.off("transaction:new", handleNewDeposit);
      socket.off("transaction:update", handleUpdateDeposit);
      socket.off("connect", handleReconnect);
    };
  }, []);

  return {
    ...state,
    refresh: () => setRefreshNonce((current) => current + 1),
  };
}
