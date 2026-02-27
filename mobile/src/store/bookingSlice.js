import { createSlice, createAsyncThunk } from '@reduxjs/toolkit';
import { bookingService } from '../services/bookingService';

export const fetchMyBookings = createAsyncThunk('booking/fetchMy', async (_, { rejectWithValue }) => {
  try {
    return await bookingService.getMyBookings();
  } catch (err) {
    return rejectWithValue(err.response?.data?.error || 'Failed to load bookings');
  }
});

export const createBookingThunk = createAsyncThunk('booking/create', async (data, { rejectWithValue }) => {
  try {
    return await bookingService.createBooking(data);
  } catch (err) {
    return rejectWithValue(err.response?.data?.error || 'Failed to create booking');
  }
});

const bookingSlice = createSlice({
  name: 'booking',
  initialState: {
    bookings: [],
    activeBooking: null,
    labourerLocation: null,
    loading: false,
    error: null,
  },
  reducers: {
    setActiveBooking(state, action) {
      state.activeBooking = action.payload;
    },
    updateLabourerLocation(state, action) {
      state.labourerLocation = action.payload;
    },
    clearBookingError(state) {
      state.error = null;
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(fetchMyBookings.pending, (state) => { state.loading = true; })
      .addCase(fetchMyBookings.fulfilled, (state, action) => {
        state.loading = false;
        state.bookings = action.payload.bookings;
      })
      .addCase(fetchMyBookings.rejected, (state, action) => {
        state.loading = false;
        state.error = action.payload;
      })
      .addCase(createBookingThunk.pending, (state) => { state.loading = true; })
      .addCase(createBookingThunk.fulfilled, (state, action) => {
        state.loading = false;
        state.bookings.unshift(action.payload.booking);
        state.activeBooking = action.payload.booking;
      })
      .addCase(createBookingThunk.rejected, (state, action) => {
        state.loading = false;
        state.error = action.payload;
      });
  },
});

export const { setActiveBooking, updateLabourerLocation, clearBookingError } = bookingSlice.actions;
export default bookingSlice.reducer;
