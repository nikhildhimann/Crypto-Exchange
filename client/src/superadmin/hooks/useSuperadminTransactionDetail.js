import { useEffect, useRef, useState } from "react";
import { fetchSuperadminTransactionDetail } from "../services/transactions";

function createState() {
  return {
    data: null,
    loading: false,
    error: "",
    lastUpdatedAt: "",
  };
}

function getErrorMessage(error) {
  return error instanceof Error && error.message
    ? error.message
    : "Unable to load this transaction right now.";
}

export function useSuperadminTransactionDetail(transactionId) {
  const mountedRef = useRef(false);
  const requestIdRef = useRef(0);
  const [refreshNonce, setRefreshNonce] = useState(0);
  const [state, setState] = useState(createState);

  useEffect(() => {
    mountedRef.current = true;

    return () => {
      mountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    if (!transactionId) {
      setState(createState());
      return;
    }

    const requestId = requestIdRef.current + 1;
    requestIdRef.current = requestId;

    setState((current) => ({
      ...current,
      loading: true,
      error: "",
    }));

    void fetchSuperadminTransactionDetail(transactionId)
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

        setState({
          data: null,
          loading: false,
          error: getErrorMessage(error),
          lastUpdatedAt: "",
        });
      });
  }, [transactionId, refreshNonce]);

  return {
    ...state,
    refresh: () => setRefreshNonce((current) => current + 1),
  };
}
