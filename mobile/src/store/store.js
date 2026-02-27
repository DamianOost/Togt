const { configureStore } = require('@reduxjs/toolkit');
const authReducer = require('./authSlice');
const bookingReducer = require('./bookingSlice');

const store = configureStore({
  reducer: {
    auth: authReducer,
    booking: bookingReducer,
  },
});

module.exports = store;
