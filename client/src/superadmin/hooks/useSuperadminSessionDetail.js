import { useEffect, useRef, useState } from "react";
import { fetchSuperadminSessionDetail } from "../services/sessions";

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
    : "Unable to load this session right now.";
}

export function useSuperadminSessionDetail(sessionId, scope = "") {
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
    if (!sessionId) {
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

    void fetchSuperadminSessionDetail(sessionId, scope)
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
  }, [sessionId, scope, refreshNonce]);

  return {
    ...state,
    refresh: () => setRefreshNonce((current) => current + 1),
  };
}
