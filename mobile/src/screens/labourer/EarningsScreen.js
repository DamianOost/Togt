import React, { useEffect } from 'react';
import {
  View, Text, FlatList, StyleSheet, SafeAreaView, ActivityIndicator,
} from 'react-native';
import { useDispatch, useSelector } from 'react-redux';
import { fetchMyBookings } from '../../store/bookingSlice';
import BookingStatusBadge from '../../components/BookingStatusBadge';
import { formatZAR, formatDateTime } from '../../utils/formatters';

export default function EarningsScreen() {
  const dispatch = useDispatch();
  const { bookings, loading } = useSelector((s) => s.booking);

  useEffect(() => {
    dispatch(fetchMyBookings());
  }, []);

  const completedBookings = bookings.filter((b) => b.status === 'completed');
  const totalEarned = completedBookings.reduce(
    (sum, b) => sum + (parseFloat(b.total_amount) || 0), 0
  );

  if (loading) return <ActivityIndicator style={{ flex: 1 }} color="#1A6B3A" />;

  return (
    <SafeAreaView style={styles.container}>
      {/* Total earnings banner */}
      <View style={styles.banner}>
        <Text style={styles.bannerLabel}>Total Earned</Text>
        <Text style={styles.bannerAmount}>{formatZAR(totalEarned)}</Text>
        <Text style={styles.bannerSub}>{completedBookings.length} completed jobs</Text>
      </View>

      <FlatList
        data={completedBookings}
        keyExtractor={(b) => b.id}
        contentContainerStyle={styles.list}
        ListEmptyComponent={
          <View style={styles.empty}>
            <Text style={styles.emptyText}>No completed jobs yet.</Text>
          </View>
        }
        renderItem={({ item }) => (
          <View style={styles.card}>
            <View style={styles.row}>
              <Text style={styles.customerName}>{item.customer_name}</Text>
              {item.total_amount && (
                <Text style={styles.amount}>{formatZAR(item.total_amount)}</Text>
              )}
            </View>
            <Text style={styles.skill}>{item.skill_needed}</Text>
            <Text style={styles.time}>{formatDateTime(item.scheduled_at)}</Text>
            {item.hours_est && (
              <Text style={styles.hours}>{item.hours_est} hrs</Text>
            )}
          </View>
        )}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F9FAFB' },
  banner: {
    backgroundColor: '#1A6B3A',
    padding: 28,
    alignItems: 'center',
  },
  bannerLabel: { color: 'rgba(255,255,255,0.8)', fontSize: 13, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 1 },
  bannerAmount: { color: '#fff', fontSize: 44, fontWeight: '900', marginVertical: 4 },
  bannerSub: { color: 'rgba(255,255,255,0.7)', fontSize: 14 },
  list: { padding: 16 },
  card: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 14,
    marginBottom: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 3,
    elevation: 1,
  },
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 },
  customerName: { fontSize: 15, fontWeight: '700', color: '#111827' },
  amount: { fontSize: 16, fontWeight: '800', color: '#1A6B3A' },
  skill: { fontSize: 13, color: '#4B5563', marginBottom: 2 },
  time: { fontSize: 12, color: '#9CA3AF' },
  hours: { fontSize: 12, color: '#9CA3AF' },
  empty: { alignItems: 'center', marginTop: 40 },
  emptyText: { color: '#9CA3AF', fontSize: 15 },
});
