// Refactor: persists rotating auth tokens plus active wallet/account selection while keeping live chain, balance, and transaction data ephemeral.
import { combineReducers, configureStore } from "@reduxjs/toolkit";
import { persistReducer, persistStore } from "redux-persist";
import storage from "redux-persist/lib/storage";

import accountReducer from "./accountSlice";
import authReducer from "./authSlice";
import chainReducer from "./chainSlice";
import walletReducer from "./walletSlice";
import balanceReducer from "./balanceSlice";
import notificationReducer from "./notificationSlice";
import transactionReducer from "./transactionSlice";
import unlockReducer from "./unlockSlice";
import superadminAuthReducer from "../superadmin/store/authSlice";
import nftReducer from "./nftSlice";

const authPersistConfig = {
  key: "aura_token",
  storage,
  whitelist: [
    "refreshToken",
    "userId",
    "sessionId",
    "sessionStatus",
    "refreshTokenExpiresAt",
    "sessionExpiresAt",
    "deviceId",
    "sessionState",
    "logoutReason",
  ],
};

const walletPersistConfig = {
  key: "aura_active_wallet",
  storage,
  whitelist: ["activeWalletId"], // ,  "selectedNetwork"
};

const accountPersistConfig = {
  key: "aura_active_account",
  storage,
  whitelist: ["activeAccountId"],
};

const unlockPersistConfig = {
  key: "aura_unlock",
  storage,
  whitelist: [
    "method",
    "quickUnlockEnabled",
    "biometricEnabled",
    "pinHash",
    "pinSalt",
    "pinAlgorithm",
    "pinConfiguredAt",
    "autoLockMinutes",
    "lastInactiveAt",
  ],
};

const superadminAuthPersistConfig = {
  key: "aura_superadmin_auth",
  storage,
  whitelist: [
    "token",
    "accessToken",
    "refreshToken",
    "superadminId",
    "email",
    "profile",
    "role",
    "roles",
    "permissions",
    "sessionId",
    "sessionStatus",
    "accessTokenExpiresAt",
    "refreshTokenExpiresAt",
    "sessionExpiresAt",
    "sessionState",
    "logoutReason",
  ],
};

const rootReducer = combineReducers({
  auth: persistReducer(authPersistConfig, authReducer),
  superadminAuth: persistReducer(superadminAuthPersistConfig, superadminAuthReducer),
  account: persistReducer(accountPersistConfig, accountReducer),
  chain: chainReducer,
  wallet: persistReducer(walletPersistConfig, walletReducer),
  balance: balanceReducer,
  notification: notificationReducer,
  transaction: transactionReducer,
  nft: nftReducer,
  unlock: persistReducer(unlockPersistConfig, unlockReducer),
});

export const store = configureStore({
  reducer: rootReducer,
  middleware: (getDefaultMiddleware) =>
    getDefaultMiddleware({
      serializableCheck: {
        ignoredActions: [
          "persist/PERSIST",
          "persist/REHYDRATE",
          "persist/PAUSE",
          "persist/PURGE",
          "persist/REGISTER",
          "persist/FLUSH",
        ],
      },
    }),
  devTools: import.meta.env.DEV,
});

export const persistor = persistStore(store);

export default store;
