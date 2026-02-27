import React, { useEffect, useState } from 'react';
import {
  View, Text, StyleSheet, ActivityIndicator, SafeAreaView, TouchableOpacity, Alert,
} from 'react-native';
import MapView, { Marker } from 'react-native-maps';
import { useSelector, useDispatch } from 'react-redux';
import { updateLabourerLocation } from '../../store/bookingSlice';
import { socketService } from '../../services/socketService';
import { bookingService } from '../../services/bookingService';
import BookingStatusBadge from '../../components/BookingStatusBadge';
import { formatZAR, formatDateTime } from '../../utils/formatters';

export default function ActiveBookingScreen({ route, navigation }) {
  const { bookingId } = route.params;
  const dispatch = useDispatch();
  const { accessToken } = useSelector((s) => s.auth);
  const labourerLocation = useSelector((s) => s.booking.labourerLocation);

  const [booking, setBooking] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadBooking();
    // Connect socket and listen for labourer location
    socketService.connect(accessToken);
    socketService.joinBooking(bookingId);
    socketService.onLocationUpdate((data) => {
      dispatch(updateLabourerLocation({ lat: data.lat, lng: data.lng }));
    });

    // Poll booking status every 15s
    const interval = setInterval(loadBooking, 15000);

    return () => {
      socketService.offLocationUpdate();
      clearInterval(interval);
    };
  }, [bookingId]);

  async function loadBooking() {
    try {
      const res = await bookingService.getBooking(bookingId);
      setBooking(res.booking);
    } catch {
      // ignore polling errors
    } finally {
      setLoading(false);
    }
  }

  async function handleCancel() {
    Alert.alert('Cancel Booking', 'Are you sure you want to cancel?', [
      { text: 'No' },
      {
        text: 'Yes, Cancel',
        style: 'destructive',
        onPress: async () => {
          await bookingService.cancel(bookingId);
          navigation.goBack();
        },
      },
    ]);
  }

  if (loading || !booking) {
    return <ActivityIndicator style={{ flex: 1 }} color="#1A6B3A" />;
  }

  const mapCenter = labourerLocation || {
    lat: booking.location_lat,
    lng: booking.location_lng,
  };

  const isCompleted = booking.status === 'completed';
  const isCancellable = ['pending', 'accepted'].includes(booking.status);

  return (
    <SafeAreaView style={styles.container}>
      <MapView
        style={styles.map}
        region={{
          latitude: mapCenter.lat,
          longitude: mapCenter.lng,
          latitudeDelta: 0.05,
          longitudeDelta: 0.05,
        }}
      >
        {/* Job location */}
        <Marker
          coordinate={{ latitude: booking.location_lat, longitude: booking.location_lng }}
          title="Job Location"
          pinColor="red"
        />
        {/* Labourer live location */}
        {labourerLocation && (
          <Marker
            coordinate={{ latitude: labourerLocation.lat, longitude: labourerLocation.lng }}
            title={booking.labourer_name}
            pinColor="green"
          />
        )}
      </MapView>

      <View style={styles.card}>
        <View style={styles.row}>
          <Text style={styles.labourerName}>{booking.labourer_name}</Text>
          <BookingStatusBadge status={booking.status} />
        </View>

        <Text style={styles.skill}>{booking.skill_needed}</Text>
        <Text style={styles.address}>{booking.address}</Text>
        <Text style={styles.time}>{formatDateTime(booking.scheduled_at)}</Text>

        {booking.total_amount && (
          <Text style={styles.amount}>{formatZAR(booking.total_amount)} estimated</Text>
        )}

        {isCompleted && (
          <TouchableOpacity
            style={styles.payBtn}
            onPress={() => navigation.navigate('Payment', { booking })}
          >
            <Text style={styles.payBtnText}>Proceed to Payment</Text>
          </TouchableOpacity>
        )}

        {isCancellable && (
          <TouchableOpacity style={styles.cancelBtn} onPress={handleCancel}>
            <Text style={styles.cancelBtnText}>Cancel Booking</Text>
          </TouchableOpacity>
        )}

        {isCompleted && booking.payment_status === 'paid' && (
          <TouchableOpacity
            style={styles.rateBtn}
            onPress={() => navigation.navigate('Rate', { booking })}
          >
            <Text style={styles.rateBtnText}>Rate {booking.labourer_name.split(' ')[0]}</Text>
          </TouchableOpacity>
        )}
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
    shadowOffset: { width: 0, height: -2 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 8,
  },
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
  labourerName: { fontSize: 18, fontWeight: '800', color: '#111827' },
  skill: { fontSize: 14, color: '#4B5563', marginBottom: 4 },
  address: { fontSize: 13, color: '#6B7280', marginBottom: 4 },
  time: { fontSize: 13, color: '#6B7280', marginBottom: 8 },
  amount: { fontSize: 16, fontWeight: '700', color: '#1A6B3A', marginBottom: 12 },
  payBtn: { backgroundColor: '#1A6B3A', borderRadius: 12, padding: 14, alignItems: 'center', marginBottom: 8 },
  payBtnText: { color: '#fff', fontWeight: '700', fontSize: 15 },
  cancelBtn: { borderWidth: 1, borderColor: '#EF4444', borderRadius: 12, padding: 12, alignItems: 'center' },
  cancelBtnText: { color: '#EF4444', fontWeight: '600' },
  rateBtn: { backgroundColor: '#F59E0B', borderRadius: 12, padding: 14, alignItems: 'center', marginBottom: 8 },
  rateBtnText: { color: '#fff', fontWeight: '700', fontSize: 15 },
});
