import * as Location from 'expo-location';

export const locationService = {
  async requestPermission() {
    const { status } = await Location.requestForegroundPermissionsAsync();
    return status === 'granted';
  },

  async getCurrentPosition() {
    const location = await Location.getCurrentPositionAsync({
      accuracy: Location.Accuracy.High,
    });
    return {
      lat: location.coords.latitude,
      lng: location.coords.longitude,
    };
  },

  watchPosition(callback) {
    return Location.watchPositionAsync(
      { accuracy: Location.Accuracy.High, timeInterval: 5000, distanceInterval: 10 },
      (location) => {
        callback({
          lat: location.coords.latitude,
          lng: location.coords.longitude,
        });
      }
    );
  },
};
