import { markLoggedOut, revokeSessionThunk } from "./authSlice";
import { resetAccountState } from "./accountSlice";
import { clearBalanceState } from "./balanceSlice";
import { clearChainState } from "./chainSlice";
import { clearNotificationState } from "./notificationSlice";
import { clearTransactionState } from "./transactionSlice";
import { clearUnlockState } from "./unlockSlice";
import { clearWalletState } from "./walletSlice";

async function resetClientState(dispatch, reason) {
  dispatch(clearTransactionState());
  dispatch(clearBalanceState());
  dispatch(clearNotificationState());
  dispatch(resetAccountState());
  dispatch(clearWalletState());
  dispatch(clearChainState());
  dispatch(clearUnlockState());
  dispatch(markLoggedOut({ reason }));
}

export async function logoutAndClearSession({
  dispatch,
  persistor,
  accessToken,
  refreshToken,
  revokeSession = true,
  revokeAll = false,
  reason = "manual",
}) {
  try {
    if (revokeSession) {
      await dispatch(
        revokeSessionThunk({
          accessToken,
          refreshToken,
          revokeAll,
        }),
      ).unwrap();
    }
  } catch {
    // Ignore revoke failures and always clear local session state.
  } finally {
    await resetClientState(dispatch, reason);
    await persistor.flush().catch(() => null);
    await persistor.purge().catch(() => null);
    dispatch(markLoggedOut({ reason }));
  }
}
