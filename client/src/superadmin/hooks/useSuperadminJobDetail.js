import { useEffect, useRef, useState } from "react";
import { fetchSuperadminJobDetail } from "../services/jobs";

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
    : "Unable to load this job right now.";
}

export function useSuperadminJobDetail(jobName) {
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
    if (!jobName) {
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

    void fetchSuperadminJobDetail(jobName)
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
  }, [jobName, refreshNonce]);

  return {
    ...state,
    refresh: () => setRefreshNonce((current) => current + 1),
  };
}
