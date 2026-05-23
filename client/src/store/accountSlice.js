import { createAsyncThunk, createSelector, createSlice } from "@reduxjs/toolkit";

import {
  archiveAccount,
  createAccount,
  fetchAccounts,
  importAccount,
  updateAccount,
} from "../api/account";

const initialState = {
  items: [],
  activeAccountId: null,
  status: "idle",
  requestStatus: {
    fetch: "idle",
    create: "idle",
    import: "idle",
    rename: "idle",
    archive: "idle",
  },
  error: null,
};

function serializeRequestError(error, fallbackMessage) {
  const message =
    error instanceof Error && error.message
      ? error.message
      : typeof error?.message === "string" && error.message.trim()
        ? error.message.trim()
        : fallbackMessage;

  return {
    message,
    status: Number(error?.status || 0) || 0,
    payload: error?.payload && typeof error.payload === "object" ? error.payload : null,
  };
}

function normalizeAccountId(value) {
  if (value === undefined || value === null || value === "") {
    return null;
  }

  return String(value);
}

function dedupeAccounts(accounts = []) {
  const uniqueAccounts = new Map();

  for (const account of accounts) {
    const accountId = normalizeAccountId(account?.id || account?.accountId || account?._id);

    if (!accountId || uniqueAccounts.has(accountId)) {
      continue;
    }

    uniqueAccounts.set(accountId, {
      ...account,
      id: accountId,
    });
  }

  return Array.from(uniqueAccounts.values());
}

function resolveFallbackAccountId(accounts = []) {
  const firstActiveAccount = accounts.find((account) => account?.status === "active" && account?.id);

  if (firstActiveAccount?.id) {
    return firstActiveAccount.id;
  }

  return accounts.find((account) => account?.id)?.id || null;
}

function resolveActiveAccountId(accounts = [], requestedAccountId = null) {
  const normalizedRequestedId = normalizeAccountId(requestedAccountId);

  if (normalizedRequestedId && accounts.some((account) => account?.id === normalizedRequestedId)) {
    return normalizedRequestedId;
  }

  return resolveFallbackAccountId(accounts);
}

function mergeAccounts(currentAccounts = [], incomingAccounts = []) {
  return dedupeAccounts([
    ...incomingAccounts,
    ...currentAccounts,
  ]);
}

export const fetchAccountsThunk = createAsyncThunk(
  "account/fetchAccounts",
  async (params = {}, { getState, rejectWithValue }) => {
    try {
      const token = getState().auth.accessToken || getState().auth.token;
      return await fetchAccounts(token, params);
    } catch (error) {
      return rejectWithValue(serializeRequestError(error, "Failed to load accounts"));
    }
  },
  {
    condition: (_params, { getState }) => getState().account?.requestStatus?.fetch !== "loading",
  },
);

export const createAccountThunk = createAsyncThunk(
  "account/createAccount",
  async (payload = {}, { getState, rejectWithValue }) => {
    try {
      const token = getState().auth.accessToken || getState().auth.token;
      return await createAccount(token, payload);
    } catch (error) {
      return rejectWithValue(serializeRequestError(error, "Failed to create account"));
    }
  },
  {
    condition: (_payload, { getState }) => getState().account?.requestStatus?.create !== "loading",
  },
);

export const importAccountThunk = createAsyncThunk(
  "account/importAccount",
  async (payload = {}, { getState, rejectWithValue }) => {
    try {
      const token = getState().auth.accessToken || getState().auth.token;
      return await importAccount(token, payload);
    } catch (error) {
      return rejectWithValue(serializeRequestError(error, "Failed to import account"));
    }
  },
  {
    condition: (_payload, { getState }) => getState().account?.requestStatus?.import !== "loading",
  },
);

export const renameAccountThunk = createAsyncThunk(
  "account/renameAccount",
  async ({ accountId, ...payload }, { getState, rejectWithValue }) => {
    try {
      const token = getState().auth.accessToken || getState().auth.token;
      return await updateAccount(token, accountId, payload);
    } catch (error) {
      return rejectWithValue(serializeRequestError(error, "Failed to rename account"));
    }
  },
  {
    condition: (_payload, { getState }) => getState().account?.requestStatus?.rename !== "loading",
  },
);

export const archiveAccountThunk = createAsyncThunk(
  "account/archiveAccount",
  async (accountId, { getState, rejectWithValue }) => {
    try {
      const token = getState().auth.accessToken || getState().auth.token;
      return await archiveAccount(token, accountId);
    } catch (error) {
      return rejectWithValue(serializeRequestError(error, "Failed to archive account"));
    }
  },
  {
    condition: (accountId, { getState }) => {
      const state = getState().account;
      if (state.requestStatus.archive === "loading") return false;
      // Guard: Cannot archive the last remaining account
      const activeAccounts = state.items.filter(a => a.status !== "archived");
      if (activeAccounts.length <= 1 && activeAccounts.some(a => a.id === normalizeAccountId(accountId))) {
        return false;
      }
      return true;
    },
  },
);

const accountSlice = createSlice({
  name: "account",
  initialState,
  reducers: {
    upsertAccount(state, action) {
      const nextAccount = action.payload;
      state.items = nextAccount ? mergeAccounts(state.items, [nextAccount]) : state.items;
    },
    setActiveAccount(state, action) {
      state.activeAccountId = resolveActiveAccountId(state.items, action.payload);
    },
    clearActiveAccount(state) {
      state.activeAccountId = null;
    },
    resetAccountState(state) {
      Object.assign(state, initialState);
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(fetchAccountsThunk.pending, (state) => {
        state.status = "loading";
        state.requestStatus.fetch = "loading";
        state.error = null;
      })
      .addCase(fetchAccountsThunk.fulfilled, (state, action) => {
        const nextAccounts = dedupeAccounts(action.payload || []);

        state.items = nextAccounts;
        state.activeAccountId = resolveActiveAccountId(nextAccounts, state.activeAccountId);
        state.status = "idle";
        state.requestStatus.fetch = "idle";
        state.error = null;
      })
      .addCase(fetchAccountsThunk.rejected, (state, action) => {
        state.status = "error";
        state.requestStatus.fetch = "error";
        state.error = action.payload || serializeRequestError(null, "Failed to load accounts");
      })
      .addCase(createAccountThunk.pending, (state) => {
        state.status = "loading";
        state.requestStatus.create = "loading";
        state.error = null;
      })
      .addCase(createAccountThunk.fulfilled, (state, action) => {
        const nextAccount = action.payload?.account;
        const nextAccounts = nextAccount ? mergeAccounts(state.items, [nextAccount]) : state.items;

        state.items = nextAccounts;
        state.activeAccountId = resolveActiveAccountId(
          nextAccounts,
          nextAccount?.id || state.activeAccountId,
        );
        state.status = "idle";
        state.requestStatus.create = "idle";
        state.error = null;
      })
      .addCase(createAccountThunk.rejected, (state, action) => {
        state.status = "error";
        state.requestStatus.create = "error";
        state.error = action.payload || serializeRequestError(null, "Failed to create account");
      })
      .addCase(importAccountThunk.pending, (state) => {
        state.status = "loading";
        state.requestStatus.import = "loading";
        state.error = null;
      })
      .addCase(importAccountThunk.fulfilled, (state, action) => {
        const nextAccount = action.payload?.account;
        const nextAccounts = nextAccount ? mergeAccounts(state.items, [nextAccount]) : state.items;

        state.items = nextAccounts;
        state.activeAccountId = resolveActiveAccountId(
          nextAccounts,
          nextAccount?.id || state.activeAccountId,
        );
        state.status = "idle";
        state.requestStatus.import = "idle";
        state.error = null;
      })
      .addCase(importAccountThunk.rejected, (state, action) => {
        state.status = "error";
        state.requestStatus.import = "error";
        state.error = action.payload || serializeRequestError(null, "Failed to import account");
      })
      .addCase(renameAccountThunk.pending, (state) => {
        state.status = "loading";
        state.requestStatus.rename = "loading";
        state.error = null;
      })
      .addCase(renameAccountThunk.fulfilled, (state, action) => {
        const updatedAccount = action.payload;
        const updatedAccountId = normalizeAccountId(updatedAccount?.id);

        if (updatedAccountId) {
          const existingIndex = state.items.findIndex(item => item.id === updatedAccountId);
          if (existingIndex !== -1) {
            state.items[existingIndex] = {
              ...state.items[existingIndex],
              ...updatedAccount,
              id: updatedAccountId,
            };
          } else {
            state.items = mergeAccounts(state.items, [updatedAccount]);
          }
        }

        state.activeAccountId = resolveActiveAccountId(state.items, state.activeAccountId);
        state.status = "idle";
        state.requestStatus.rename = "idle";
        state.error = null;
      })
      .addCase(renameAccountThunk.rejected, (state, action) => {
        state.status = "error";
        state.requestStatus.rename = "error";
        state.error = action.payload || serializeRequestError(null, "Failed to rename account");
      })
      .addCase(archiveAccountThunk.pending, (state) => {
        state.status = "loading";
        state.requestStatus.archive = "loading";
        state.error = null;
      })
      .addCase(archiveAccountThunk.fulfilled, (state, action) => {
        const archivedAccount = action.payload?.account || action.payload;
        const archivedAccountId = normalizeAccountId(archivedAccount?.id);

        if (archivedAccountId) {
          // If the account was removed (archived), filter it out
          state.items = state.items.filter(account => account.id !== archivedAccountId);
        }

        state.activeAccountId = resolveActiveAccountId(state.items, state.activeAccountId);
        state.status = "idle";
        state.requestStatus.archive = "idle";
        state.error = null;
      })
      .addCase(archiveAccountThunk.rejected, (state, action) => {
        state.status = "error";
        state.requestStatus.archive = "error";
        state.error = action.payload || serializeRequestError(null, "Failed to archive account");
      });
  },
});

const selectAccountState = (state) => state.account || initialState;

export const selectAccounts = createSelector(
  [selectAccountState],
  (accountState) => accountState.items,
);

export const selectActiveAccountId = createSelector(
  [selectAccountState],
  (accountState) => accountState.activeAccountId,
);

export const selectActiveAccount = createSelector(
  [selectAccounts, selectActiveAccountId],
  (accounts, activeAccountId) =>
    accounts.find((account) => account.id === activeAccountId) ||
    accounts.find((account) => account.status === "active") ||
    accounts[0] ||
    null,
);

export const selectAccountStatus = createSelector(
  [selectAccountState],
  (accountState) => accountState.status,
);

export const selectAccountError = createSelector(
  [selectAccountState],
  (accountState) => accountState.error,
);

export const selectAccountRequestStatus = createSelector(
  [selectAccountState],
  (accountState) => accountState.requestStatus,
);

export const { clearActiveAccount, resetAccountState, setActiveAccount, upsertAccount } = accountSlice.actions;

export default accountSlice.reducer;
