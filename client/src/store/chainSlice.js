import { createAsyncThunk, createSlice } from "@reduxjs/toolkit";

import { getSupportedChains } from "../api/wallet";

const initialState = {
  supported: [],
  hasFetched: false,
  status: "idle",
  error: "",
};

export const fetchSupportedChainsThunk = createAsyncThunk(
  "chain/fetchSupportedChains",
  async (_, { getState, rejectWithValue }) => {
    try {
      const token = getState().auth.accessToken || getState().auth.token;
      return await getSupportedChains(token);
    } catch (error) {
      return rejectWithValue(error instanceof Error ? error.message : "Failed to load supported chains");
    }
  },
);

const chainSlice = createSlice({
  name: "chain",
  initialState,
  reducers: {
    clearChainState(state) {
      state.supported = [];
      state.hasFetched = false;
      state.status = "idle";
      state.error = "";
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(fetchSupportedChainsThunk.pending, (state) => {
        state.status = "loading";
        state.error = "";
      })
      .addCase(fetchSupportedChainsThunk.fulfilled, (state, action) => {
        state.status = "idle";
        state.hasFetched = true;
        state.supported = action.payload;
      })
      .addCase(fetchSupportedChainsThunk.rejected, (state, action) => {
        state.status = "error";
        state.hasFetched = false;
        state.error = action.payload || "Failed to load supported chains";
        state.supported = [];
      });
  },
});

export const { clearChainState } = chainSlice.actions;

export default chainSlice.reducer;
