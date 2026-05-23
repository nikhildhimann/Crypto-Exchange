import { createSlice } from "@reduxjs/toolkit";

export const AUTO_LOCK_OPTIONS = [0, 1, 3, 5, 10];

const initialState = {
  method: "none",
  quickUnlockEnabled: false,
  biometricEnabled: false,
  pinHash: "",
  pinSalt: "",
  pinAlgorithm: "",
  pinConfiguredAt: "",
  autoLockMinutes: 5,
  lastInactiveAt: 0,
  locallyUnlocked: false,
  failedUnlockAttempts: 0,
};

const unlockSlice = createSlice({
  name: "unlock",
  initialState,
  reducers: {
    configureQuickUnlock(state, action) {
      if (typeof action.payload?.biometricEnabled === "boolean") {
        state.biometricEnabled = action.payload.biometricEnabled;
      }
    },
    setPinCredential(state, action) {
      state.method = "pin";
      state.quickUnlockEnabled = true;
      state.pinHash = action.payload?.pinHash || "";
      state.pinSalt = action.payload?.pinSalt || "";
      state.pinAlgorithm = action.payload?.pinAlgorithm || state.pinAlgorithm || "";
      state.pinConfiguredAt = action.payload?.pinConfiguredAt || new Date().toISOString();
      state.locallyUnlocked = true;
      state.lastInactiveAt = 0;
      state.failedUnlockAttempts = 0;
    },
    clearPinCredential(state) {
      Object.assign(state, {
        ...initialState,
        biometricEnabled: state.biometricEnabled,
      });
    },
    setBiometricPreference(state, action) {
      state.biometricEnabled = Boolean(action.payload);
    },
    setAutoLockMinutes(state, action) {
      const minutes = Number(action.payload);
      state.autoLockMinutes = AUTO_LOCK_OPTIONS.includes(minutes) ? minutes : initialState.autoLockMinutes;
    },
    recordAppInactive(state, action) {
      state.lastInactiveAt = Number(action.payload) || Date.now();
    },
    clearAppInactive(state) {
      state.lastInactiveAt = 0;
    },
    setLocalUnlockState(state, action) {
      state.locallyUnlocked = Boolean(action.payload);
      if (state.locallyUnlocked) {
        state.lastInactiveAt = 0;
        state.failedUnlockAttempts = 0;
      }
    },
    registerUnlockFailure(state) {
      state.failedUnlockAttempts += 1;
    },
    clearUnlockState(state) {
      Object.assign(state, initialState);
    },
  },
});

export const {
  clearUnlockState,
  clearAppInactive,
  clearPinCredential,
  configureQuickUnlock,
  recordAppInactive,
  registerUnlockFailure,
  setAutoLockMinutes,
  setBiometricPreference,
  setLocalUnlockState,
  setPinCredential,
} = unlockSlice.actions;

export default unlockSlice.reducer;
