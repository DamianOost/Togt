import React, { useEffect, useState } from 'react';
import {
  View, Text, Switch, TouchableOpacity, StyleSheet,
  SafeAreaView, ActivityIndicator, Alert, FlatList,
} from 'react-native';
import { useSelector, useDispatch } from 'react-redux';
import { logout } from '../../store/authSlice';
import { fetchMyBookings } from '../../store/bookingSlice';
import api from '../../services/api';
import BookingStatusBadge from '../../components/BookingStatusBadge';
import { formatDateTime, formatZAR } from '../../utils/formatters';

export default function DashboardScreen({ navigation }) {
  const dispatch = useDispatch();
  const { user } = useSelector((s) => s.auth);
  const { bookings, loading } = useSelector((s) => s.booking);
  const [available, setAvailable] = useState(false);
  const [toggling, setToggling] = useState(false);

  useEffect(() => {
    dispatch(fetchMyBookings());
    loadProfile();
  }, []);

  async function loadProfile() {
    try {
      const res = await api.get(`/labourers/${user.id}`);
      setAvailable(res.data.labourer.is_available);
    } catch {}
  }

  async function toggleAvailability(value) {
    setToggling(true);
    try {
      // If going available, also update GPS location
      if (value) {
        try {
          const { locationService } = require('../../services/locationService');
          const granted = await locationService.requestPermission();
          if (granted) {
            const pos = await locationService.getCurrentPosition();
            await api.put('/labourers/location', { lat: pos.lat, lng: pos.lng });
          }
        } catch (locErr) {
          console.log('[location] Could not update:', locErr.message);
        }
      }
      await api.put('/labourers/availability', { is_available: value });
      setAvailable(value);
    } catch {
      Alert.alert('Error', 'Could not update availability.');
    } finally {
      setToggling(false);
    }
  }

  const pendingBookings = bookings.filter((b) => b.status === 'pending');
  const activeBookings = bookings.filter((b) => ['accepted', 'in_progress'].includes(b.status));

  return (
    <SafeAreaView style={styles.container}>
      <FlatList
        data={[]}
        ListHeaderComponent={() => (
          <>
            {/* Profile header */}
            <View style={styles.header}>
              <View>
                <Text style={styles.greeting}>Hey {user?.name?.split(' ')[0]} 👷</Text>
                <Text style={styles.phone}>{user?.phone}</Text>
              </View>
              <View style={{ flexDirection: 'row', gap: 8 }}>
                <TouchableOpacity
                  style={styles.profileBtn}
                  onPress={() => navigation.getParent()?.navigate('Profile')}
                >
                  <Text style={styles.profileBtnText}>Edit Profile</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.profileBtn, { backgroundColor: '#FEF2F2' }]}
                  onPress={() => dispatch(logout())}
                >
                  <Text style={[styles.profileBtnText, { color: '#EF4444' }]}>Logout</Text>
                </TouchableOpacity>
              </View>
            </View>

            {/* Availability toggle */}
            <View style={styles.availCard}>
              <View>
                <Text style={styles.availTitle}>Available for work</Text>
                <Text style={styles.availSub}>
                  {available ? 'Customers can find and book you' : 'You are hidden from customers'}
                </Text>
              </View>
              {toggling ? (
                <ActivityIndicator color="#1A6B3A" />
              ) : (
                <Switch
                  value={available}
                  onValueChange={toggleAvailability}
                  trackColor={{ true: '#1A6B3A', false: '#D1D5DB' }}
                  thumbColor="#fff"
                />
              )}
            </View>

            {/* Quick stats */}
            <View style={styles.statsRow}>
              <TouchableOpacity
                style={styles.statCard}
                onPress={() => navigation.getParent()?.navigate('Jobs')}
              >
                <Text style={styles.statNum}>{pendingBookings.length}</Text>
                <Text style={styles.statLabel}>Pending Jobs</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.statCard}
                onPress={() => navigation.getParent()?.navigate('Earnings')}
              >
                <Text style={styles.statNum}>
                  {bookings.filter((b) => b.status === 'completed').length}
                </Text>
                <Text style={styles.statLabel}>Completed</Text>
              </TouchableOpacity>
            </View>

            {/* Active jobs */}
            {activeBookings.length > 0 && (
              <View style={styles.section}>
                <Text style={styles.sectionTitle}>Active Jobs</Text>
                {activeBookings.map((b) => (
                  <TouchableOpacity
                    key={b.id}
                    style={styles.bookingCard}
                    onPress={() => navigation.navigate('ActiveJob', { bookingId: b.id })}
                  >
                    <View style={styles.bRow}>
                      <Text style={styles.bCustomer}>{b.customer_name}</Text>
                      <BookingStatusBadge status={b.status} />
                    </View>
                    <Text style={styles.bSkill}>{b.skill_needed}</Text>
                    <Text style={styles.bTime}>{formatDateTime(b.scheduled_at)}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            )}

            {/* Pending requests */}
            {pendingBookings.length > 0 && (
              <View style={styles.section}>
                <View style={styles.sectionRow}>
                  <Text style={styles.sectionTitle}>New Requests</Text>
                  <TouchableOpacity onPress={() => navigation.getParent()?.navigate('Jobs')}>
                    <Text style={styles.seeAll}>See all</Text>
                  </TouchableOpacity>
                </View>
                {pendingBookings.slice(0, 2).map((b) => (
                  <TouchableOpacity
                    key={b.id}
                    style={styles.bookingCard}
                    onPress={() => navigation.getParent()?.navigate('Jobs')}
                  >
                    <Text style={styles.bCustomer}>{b.customer_name}</Text>
                    <Text style={styles.bSkill}>{b.skill_needed} — {b.address}</Text>
                    <Text style={styles.bTime}>{formatDateTime(b.scheduled_at)}</Text>
                    {b.total_amount && <Text style={styles.bAmount}>{formatZAR(b.total_amount)}</Text>}
                  </TouchableOpacity>
                ))}
              </View>
            )}
          </>
        )}
        renderItem={null}
        contentContainerStyle={{ paddingBottom: 32 }}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F9FAFB' },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 16 },
  greeting: { fontSize: 20, fontWeight: '800', color: '#111827' },
  phone: { fontSize: 13, color: '#9CA3AF', marginTop: 2 },
  profileBtn: { backgroundColor: '#EEF2FF', paddingHorizontal: 14, paddingVertical: 8, borderRadius: 8 },
  profileBtnText: { color: '#4338CA', fontWeight: '600', fontSize: 13 },
  availCard: {
    backgroundColor: '#fff', margin: 16, borderRadius: 14, padding: 16,
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.07, shadowRadius: 4, elevation: 2,
  },
  availTitle: { fontSize: 15, fontWeight: '700', color: '#111827', marginBottom: 2 },
  availSub: { fontSize: 12, color: '#6B7280', maxWidth: 220 },
  statsRow: { flexDirection: 'row', paddingHorizontal: 16, gap: 12, marginBottom: 8 },
  statCard: {
    flex: 1, backgroundColor: '#fff', borderRadius: 12, padding: 16, alignItems: 'center',
    shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.06, shadowRadius: 3, elevation: 1,
  },
  statNum: { fontSize: 32, fontWeight: '900', color: '#1A6B3A' },
  statLabel: { fontSize: 12, color: '#6B7280', marginTop: 4 },
  section: { paddingHorizontal: 16, marginTop: 8 },
  sectionRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
  sectionTitle: { fontSize: 16, fontWeight: '700', color: '#111827', marginBottom: 8 },
  seeAll: { color: '#1A6B3A', fontWeight: '600', fontSize: 13 },
  bookingCard: {
    backgroundColor: '#fff', borderRadius: 12, padding: 14, marginBottom: 10,
    shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.06, shadowRadius: 3, elevation: 1,
  },
  bRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 },
  bCustomer: { fontSize: 15, fontWeight: '700', color: '#111827' },
  bSkill: { fontSize: 13, color: '#4B5563', marginBottom: 2 },
  bTime: { fontSize: 12, color: '#9CA3AF' },
  bAmount: { fontSize: 14, fontWeight: '700', color: '#1A6B3A', marginTop: 4 },
});
