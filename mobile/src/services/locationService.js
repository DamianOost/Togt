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
      capturedAt: location.timestamp,
    };
  },

  /**
   * Requests foreground permission only when invoked by an explicit customer
   * action and returns a one-shot camera seed. It never starts a watcher or
   * upgrades the coordinate to verified address evidence.
   */
  async requestForegroundPosition() {
    let permission;
    try {
      permission = await Location.requestForegroundPermissionsAsync();
    } catch {
      return {
        ok: false,
        reasonCode: 'location_unavailable',
        explanation: 'The device could not check location permission. You can still place the pin manually.',
      };
    }
    if (permission.status !== 'granted') {
      return {
        ok: false,
        reasonCode: permission.canAskAgain
          ? 'location_permission_denied'
          : 'location_permission_blocked',
        explanation: permission.canAskAgain
          ? 'Location permission was not allowed. You can still place the pin manually.'
          : 'Location permission is blocked in device settings. You can still place the pin manually.',
      };
    }

    try {
      const location = await Location.getCurrentPositionAsync({
        accuracy: permission.android?.accuracy === 'coarse'
          ? Location.Accuracy.Balanced
          : Location.Accuracy.High,
      });
      return {
        ok: true,
        coordinates: {
          latitude: location.coords.latitude,
          longitude: location.coords.longitude,
        },
        permission: permission.android?.accuracy === 'coarse'
          ? 'granted_approximate'
          : 'granted_precise',
      };
    } catch {
      return {
        ok: false,
        reasonCode: 'location_unavailable',
        explanation: 'The device could not provide a current position. Move the map and place the pin manually.',
      };
    }
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
