import React, { useEffect } from 'react';
import {
  View, Text, FlatList, TouchableOpacity, StyleSheet,
  SafeAreaView, ActivityIndicator, Alert,
} from 'react-native';
import { useDispatch, useSelector } from 'react-redux';
import { fetchMyBookings } from '../../store/bookingSlice';
import { bookingService } from '../../services/bookingService';
import { formatZAR, formatDateTime } from '../../utils/formatters';

export default function JobRequestsScreen({ navigation }) {
  const dispatch = useDispatch();
  const { bookings, loading } = useSelector((s) => s.booking);

  const pendingBookings = bookings.filter((b) => b.status === 'pending');

  useEffect(() => {
    dispatch(fetchMyBookings());
  }, []);

  async function handleAccept(bookingId) {
    try {
      await bookingService.accept(bookingId);
      dispatch(fetchMyBookings());
      navigation.navigate('ActiveJob', { bookingId });
    } catch (err) {
      Alert.alert('Error', err.response?.data?.error || 'Could not accept booking.');
    }
  }

  async function handleDecline(bookingId) {
    Alert.alert('Decline Job', 'Are you sure you want to decline this job request?', [
      { text: 'No' },
      {
        text: 'Yes, Decline',
        style: 'destructive',
        onPress: async () => {
          try {
            await bookingService.decline(bookingId);
            dispatch(fetchMyBookings());
          } catch {
            Alert.alert('Error', 'Could not decline booking.');
          }
        },
      },
    ]);
  }

  if (loading) return <ActivityIndicator style={{ flex: 1 }} color="#1A6B3A" />;

  return (
    <SafeAreaView style={styles.container}>
      {pendingBookings.length === 0 ? (
        <View style={styles.empty}>
          <Text style={styles.emptyTitle}>No new job requests</Text>
          <Text style={styles.emptySubText}>Make sure you're set as available to receive requests.</Text>
        </View>
      ) : (
        <FlatList
          data={pendingBookings}
          keyExtractor={(b) => b.id}
          contentContainerStyle={styles.list}
          renderItem={({ item }) => (
            <View style={styles.card}>
              <Text style={styles.customerName}>{item.customer_name}</Text>
              <Text style={styles.skill}>{item.skill_needed}</Text>
              <Text style={styles.address}>{item.address}</Text>
              <Text style={styles.time}>{formatDateTime(item.scheduled_at)}</Text>

              {item.hours_est && (
                <Text style={styles.hours}>{item.hours_est} hrs estimated</Text>
              )}
              {item.total_amount && (
                <Text style={styles.amount}>{formatZAR(item.total_amount)} est. earnings</Text>
              )}
              {item.notes && (
                <Text style={styles.notes}>"{item.notes}"</Text>
              )}

              <View style={styles.actions}>
                <TouchableOpacity
                  style={styles.declineBtn}
                  onPress={() => handleDecline(item.id)}
                >
                  <Text style={styles.declineBtnText}>Decline</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.acceptBtn}
                  onPress={() => handleAccept(item.id)}
                >
                  <Text style={styles.acceptBtnText}>Accept Job</Text>
                </TouchableOpacity>
              </View>
            </View>
          )}
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F9FAFB' },
  list: { padding: 16 },
  card: {
    backgroundColor: '#fff',
    borderRadius: 14,
    padding: 16,
    marginBottom: 14,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 6,
    elevation: 3,
  },
  customerName: { fontSize: 17, fontWeight: '800', color: '#111827', marginBottom: 4 },
  skill: { fontSize: 15, fontWeight: '600', color: '#1A6B3A', marginBottom: 4 },
  address: { fontSize: 13, color: '#6B7280', marginBottom: 2 },
  time: { fontSize: 13, color: '#6B7280', marginBottom: 4 },
  hours: { fontSize: 13, color: '#4B5563', marginBottom: 2 },
  amount: { fontSize: 16, fontWeight: '700', color: '#1A6B3A', marginBottom: 4 },
  notes: { fontSize: 13, color: '#6B7280', fontStyle: 'italic', marginBottom: 8 },
  actions: { flexDirection: 'row', gap: 10, marginTop: 8 },
  declineBtn: {
    flex: 1, borderWidth: 1, borderColor: '#EF4444',
    borderRadius: 10, paddingVertical: 12, alignItems: 'center',
  },
  declineBtnText: { color: '#EF4444', fontWeight: '600' },
  acceptBtn: {
    flex: 2, backgroundColor: '#1A6B3A',
    borderRadius: 10, paddingVertical: 12, alignItems: 'center',
  },
  acceptBtnText: { color: '#fff', fontWeight: '700' },
  empty: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 32 },
  emptyTitle: { fontSize: 18, fontWeight: '700', color: '#374151', marginBottom: 8 },
  emptySubText: { fontSize: 14, color: '#9CA3AF', textAlign: 'center' },
});
