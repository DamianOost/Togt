import React, { useEffect } from 'react';
import {
  View, Text, FlatList, TouchableOpacity, StyleSheet,
  SafeAreaView, ActivityIndicator,
} from 'react-native';
import { useDispatch, useSelector } from 'react-redux';
import { fetchMyBookings } from '../../store/bookingSlice';
import BookingStatusBadge from '../../components/BookingStatusBadge';
import { formatZAR, formatDateTime } from '../../utils/formatters';

export default function MyBookingsScreen({ navigation }) {
  const dispatch = useDispatch();
  const { bookings, loading } = useSelector((s) => s.booking);

  useEffect(() => {
    dispatch(fetchMyBookings());
  }, []);

  if (loading) return <ActivityIndicator style={{ flex: 1 }} color="#1A6B3A" />;

  return (
    <SafeAreaView style={styles.container}>
      {bookings.length === 0 ? (
        <View style={styles.empty}>
          <Text style={styles.emptyText}>No bookings yet.</Text>
          <Text style={styles.emptySubText}>Find a labourer to get started!</Text>
        </View>
      ) : (
        <FlatList
          data={bookings}
          keyExtractor={(b) => b.id}
          contentContainerStyle={styles.list}
          renderItem={({ item }) => (
            <TouchableOpacity
              style={styles.card}
              onPress={() => navigation.navigate('ActiveBooking', { bookingId: item.id })}
            >
              <View style={styles.cardHeader}>
                <Text style={styles.labourerName}>{item.labourer_name}</Text>
                <BookingStatusBadge status={item.status} />
              </View>
              <Text style={styles.skill}>{item.skill_needed}</Text>
              <Text style={styles.time}>{formatDateTime(item.scheduled_at)}</Text>
              {item.total_amount && (
                <Text style={styles.amount}>{formatZAR(item.total_amount)}</Text>
              )}
            </TouchableOpacity>
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
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.07,
    shadowRadius: 4,
    elevation: 2,
  },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 },
  labourerName: { fontSize: 16, fontWeight: '700', color: '#111827' },
  skill: { fontSize: 14, color: '#4B5563', marginBottom: 4 },
  time: { fontSize: 13, color: '#6B7280', marginBottom: 4 },
  amount: { fontSize: 15, fontWeight: '700', color: '#1A6B3A' },
  empty: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  emptyText: { fontSize: 18, fontWeight: '700', color: '#374151' },
  emptySubText: { fontSize: 14, color: '#9CA3AF', marginTop: 8 },
});
