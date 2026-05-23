import { fetchSupportedChainsThunk } from "./chainSlice";
import { store } from "./index";

let supportedChainsPromise = null;

export async function ensureSupportedChainsReady(dispatch, { force = false } = {}) {
  const state = store.getState();

  if (!force && state.chain.hasFetched) {
    return state.chain.supported;
  }

  if (!force && supportedChainsPromise) {
    return supportedChainsPromise;
  }

  supportedChainsPromise = dispatch(fetchSupportedChainsThunk())
    .unwrap()
    .finally(() => {
      supportedChainsPromise = null;
    });

  return supportedChainsPromise;
}
