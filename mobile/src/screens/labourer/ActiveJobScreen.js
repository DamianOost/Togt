import React, { useEffect, useRef, useState } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, SafeAreaView,
  ActivityIndicator, Alert,
} from 'react-native';
import MapView, { Marker } from 'react-native-maps';
import { useSelector } from 'react-redux';
import { bookingService } from '../../services/bookingService';
import { locationService } from '../../services/locationService';
import { socketService } from '../../services/socketService';
import BookingStatusBadge from '../../components/BookingStatusBadge';
import { formatDateTime, formatZAR } from '../../utils/formatters';

export default function ActiveJobScreen({ route, navigation }) {
  const { bookingId } = route.params;
  const { accessToken } = useSelector((s) => s.auth);
  const [booking, setBooking] = useState(null);
  const [loading, setLoading] = useState(true);
  const [myLocation, setMyLocation] = useState(null);
  const watchRef = useRef(null);

  useEffect(() => {
    loadBooking();
    startLocationSharing();

    return () => {
      stopLocationSharing();
    };
  }, [bookingId]);

  async function loadBooking() {
    try {
      const res = await bookingService.getBooking(bookingId);
      setBooking(res.booking);
    } finally {
      setLoading(false);
    }
  }

  async function startLocationSharing() {
    const granted = await locationService.requestPermission();
    if (!granted) return;

    socketService.connect(accessToken);
    socketService.joinBooking(bookingId);

    // Start watching position and emit to socket
    const sub = await locationService.watchPosition(({ lat, lng }) => {
      setMyLocation({ lat, lng });
      socketService.sendLocation(bookingId, lat, lng);
    });
    watchRef.current = sub;
  }

  function stopLocationSharing() {
    watchRef.current?.remove?.();
    socketService.disconnect();
  }

  async function handleStart() {
    try {
      const res = await bookingService.start(bookingId);
      setBooking(res.booking);
    } catch (err) {
      Alert.alert('Error', err.response?.data?.error || 'Could not start job.');
    }
  }

  async function handleComplete() {
    Alert.alert('Complete Job', 'Mark this job as complete?', [
      { text: 'No' },
      {
        text: 'Yes, Complete',
        onPress: async () => {
          try {
            const res = await bookingService.complete(bookingId);
            setBooking(res.booking);
            Alert.alert('Job Complete', 'Great work! The customer will be notified to pay.');
          } catch (err) {
            Alert.alert('Error', err.response?.data?.error || 'Could not complete job.');
          }
        },
      },
    ]);
  }

  if (loading || !booking) return <ActivityIndicator style={{ flex: 1 }} color="#1A6B3A" />;

  const mapLat = myLocation?.lat || booking.location_lat;
  const mapLng = myLocation?.lng || booking.location_lng;

  return (
    <SafeAreaView style={styles.container}>
      <MapView
        style={styles.map}
        region={{
          latitude: mapLat,
          longitude: mapLng,
          latitudeDelta: 0.04,
          longitudeDelta: 0.04,
        }}
      >
        <Marker
          coordinate={{ latitude: booking.location_lat, longitude: booking.location_lng }}
          title="Job Location"
          pinColor="red"
        />
        {myLocation && (
          <Marker
            coordinate={{ latitude: myLocation.lat, longitude: myLocation.lng }}
            title="You"
            pinColor="blue"
          />
        )}
      </MapView>

      <View style={styles.card}>
        <View style={styles.row}>
          <Text style={styles.customerName}>{booking.customer_name}</Text>
          <BookingStatusBadge status={booking.status} />
        </View>

        <Text style={styles.skill}>{booking.skill_needed}</Text>
        <Text style={styles.address}>{booking.address}</Text>
        <Text style={styles.time}>{formatDateTime(booking.scheduled_at)}</Text>
        {booking.total_amount && (
          <Text style={styles.amount}>{formatZAR(booking.total_amount)} expected</Text>
        )}

        <View style={styles.actions}>
          {booking.status === 'accepted' && (
            <TouchableOpacity style={styles.startBtn} onPress={handleStart}>
              <Text style={styles.startBtnText}>Start Job</Text>
            </TouchableOpacity>
          )}
          {booking.status === 'in_progress' && (
            <TouchableOpacity style={styles.completeBtn} onPress={handleComplete}>
              <Text style={styles.completeBtnText}>Mark as Complete</Text>
            </TouchableOpacity>
          )}
          {booking.status === 'completed' && (
            <View style={styles.completedBanner}>
              <Text style={styles.completedText}>Job completed — awaiting payment</Text>
            </View>
          )}
        </View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  map: { flex: 1 },
  card: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -3 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 8,
  },
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 },
  customerName: { fontSize: 18, fontWeight: '800', color: '#111827' },
  skill: { fontSize: 14, color: '#4B5563', marginBottom: 4, fontWeight: '600' },
  address: { fontSize: 13, color: '#6B7280', marginBottom: 2 },
  time: { fontSize: 13, color: '#6B7280', marginBottom: 8 },
  amount: { fontSize: 16, fontWeight: '700', color: '#1A6B3A', marginBottom: 12 },
  actions: { marginTop: 4 },
  startBtn: { backgroundColor: '#3B82F6', borderRadius: 12, padding: 14, alignItems: 'center' },
  startBtnText: { color: '#fff', fontWeight: '700', fontSize: 15 },
  completeBtn: { backgroundColor: '#10B981', borderRadius: 12, padding: 14, alignItems: 'center' },
  completeBtnText: { color: '#fff', fontWeight: '700', fontSize: 15 },
  completedBanner: { backgroundColor: '#D1FAE5', borderRadius: 10, padding: 14, alignItems: 'center' },
  completedText: { color: '#065F46', fontWeight: '600', fontSize: 14 },
});
