import { useEffect, useMemo, useRef, useState } from "react";
import { fetchSuperadminTreasuryWallets } from "../services/treasury";

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
    : "Unable to load treasury wallets right now.";
}

export function useSuperadminTreasuryList(query) {
  const requestIdRef = useRef(0);
  const mountedRef = useRef(false);
  const [refreshNonce, setRefreshNonce] = useState(0);
  const [state, setState] = useState(createState);
  const requestKey = useMemo(() => JSON.stringify(query), [query]);

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

    void fetchSuperadminTreasuryWallets(JSON.parse(requestKey))
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

  return {
    ...state,
    refresh: () => setRefreshNonce((current) => current + 1),
  };
}
