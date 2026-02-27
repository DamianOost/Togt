import { createSlice, createAsyncThunk } from '@reduxjs/toolkit';
import { authService } from '../services/authService';

export const loginThunk = createAsyncThunk('auth/login', async (credentials, { rejectWithValue }) => {
  try {
    return await authService.login(credentials);
  } catch (err) {
    return rejectWithValue(err.response?.data?.error || 'Login failed');
  }
});

export const registerThunk = createAsyncThunk('auth/register', async (data, { rejectWithValue }) => {
  try {
    return await authService.register(data);
  } catch (err) {
    return rejectWithValue(err.response?.data?.error || 'Registration failed');
  }
});

const authSlice = createSlice({
  name: 'auth',
  initialState: {
    user: null,
    accessToken: null,
    refreshToken: null,
    loading: false,
    error: null,
  },
  reducers: {
    logout(state) {
      state.user = null;
      state.accessToken = null;
      state.refreshToken = null;
    },
    setTokens(state, action) {
      state.accessToken = action.payload.accessToken;
      state.refreshToken = action.payload.refreshToken;
    },
    clearError(state) {
      state.error = null;
    },
  },
  extraReducers: (builder) => {
    const handlePending = (state) => { state.loading = true; state.error = null; };
    const handleFulfilled = (state, action) => {
      state.loading = false;
      state.user = action.payload.user;
      state.accessToken = action.payload.accessToken;
      state.refreshToken = action.payload.refreshToken;
    };
    const handleRejected = (state, action) => {
      state.loading = false;
      state.error = action.payload;
    };

    builder
      .addCase(loginThunk.pending, handlePending)
      .addCase(loginThunk.fulfilled, handleFulfilled)
      .addCase(loginThunk.rejected, handleRejected)
      .addCase(registerThunk.pending, handlePending)
      .addCase(registerThunk.fulfilled, handleFulfilled)
      .addCase(registerThunk.rejected, handleRejected);
  },
});

export const { logout, setTokens, clearError } = authSlice.actions;
export default authSlice.reducer;
