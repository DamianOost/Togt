import { createSlice, createAsyncThunk } from '@reduxjs/toolkit';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { authService } from '../services/authService';

const STORAGE_KEY = '@togt_auth';

export const loginThunk = createAsyncThunk('auth/login', async (credentials, { rejectWithValue }) => {
  try {
    const data = await authService.login(credentials);
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    return data;
  } catch (err) {
    return rejectWithValue(err.response?.data?.error || 'Login failed');
  }
});

export const registerThunk = createAsyncThunk('auth/register', async (data, { rejectWithValue }) => {
  try {
    const result = await authService.register(data);
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(result));
    return result;
  } catch (err) {
    return rejectWithValue(err.response?.data?.error || 'Registration failed');
  }
});

// Restore session from AsyncStorage on app launch
export const restoreSessionThunk = createAsyncThunk('auth/restore', async (_, { rejectWithValue }) => {
  try {
    const stored = await AsyncStorage.getItem(STORAGE_KEY);
    if (!stored) return rejectWithValue('No session');
    return JSON.parse(stored);
  } catch {
    return rejectWithValue('Failed to restore');
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
    restored: false,
  },
  reducers: {
    logout(state) {
      state.user = null;
      state.accessToken = null;
      state.refreshToken = null;
      AsyncStorage.removeItem(STORAGE_KEY).catch(() => {});
    },
    setTokens(state, action) {
      state.accessToken = action.payload.accessToken;
      state.refreshToken = action.payload.refreshToken;
    },
    clearError(state) {
      state.error = null;
    },
    updateUser(state, action) {
      state.user = { ...state.user, ...action.payload };
      // Persist updated user to AsyncStorage
      const stored = {
        user: state.user,
        accessToken: state.accessToken,
        refreshToken: state.refreshToken,
      };
      AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(stored)).catch(() => {});
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
      .addCase(registerThunk.rejected, handleRejected)
      .addCase(restoreSessionThunk.fulfilled, (state, action) => {
        state.user = action.payload.user;
        state.accessToken = action.payload.accessToken;
        state.refreshToken = action.payload.refreshToken;
        state.restored = true;
      })
      .addCase(restoreSessionThunk.rejected, (state) => {
        state.restored = true;
      });
  },
});

export const { logout, setTokens, clearError, updateUser } = authSlice.actions;
export default authSlice.reducer;
