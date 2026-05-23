import { useEffect, useRef, useState } from "react";
import { fetchSuperadminWithdrawalDetail } from "../services/withdrawals";

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
    : "Unable to load withdrawal details right now.";
}

export function useSuperadminWithdrawalDetail(withdrawalId) {
  const mountedRef = useRef(false);
  const requestIdRef = useRef(0);
  const [state, setState] = useState(createState);
  const [refreshNonce, setRefreshNonce] = useState(0);

  useEffect(() => {
    mountedRef.current = true;

    return () => {
      mountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    if (!withdrawalId) {
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

    void fetchSuperadminWithdrawalDetail(withdrawalId)
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
          data: null,
          loading: false,
          error: getErrorMessage(error),
          lastUpdatedAt: "",
        }));
      });
  }, [withdrawalId, refreshNonce]);

  return {
    ...state,
    refresh: () => setRefreshNonce((current) => current + 1),
  };
}
