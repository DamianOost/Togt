import React, { useEffect, useState } from 'react';
import {
  View, Text, Switch, TouchableOpacity, StyleSheet,
  ActivityIndicator, Alert, FlatList, StatusBar,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useSelector, useDispatch } from 'react-redux';
import { logoutThunk } from '../../store/authSlice';
import { fetchMyBookings } from '../../store/bookingSlice';
import api from '../../services/api';
import BookingStatusBadge from '../../components/BookingStatusBadge';
import { formatDateTime, formatZAR } from '../../utils/formatters';
import { colors, typography, spacing, borderRadius, shadows } from '../../theme';

export default function DashboardScreen({ navigation }) {
  const dispatch = useDispatch();
  const { user } = useSelector((s) => s.auth);
  const { bookings, loading } = useSelector((s) => s.booking);
  const [available, setAvailable] = useState(false);
  const [toggling, setToggling] = useState(false);
  const [earnings, setEarnings] = useState({ today: 0, week: 0, month: 0 });

  useEffect(() => {
    dispatch(fetchMyBookings());
    loadProfile();
  }, []);

  useEffect(() => {
    // Calculate earnings from completed bookings
    if (bookings.length > 0) {
      const now = new Date();
      const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      const weekStart = new Date(todayStart);
      weekStart.setDate(weekStart.getDate() - weekStart.getDay());
      const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

      const completed = bookings.filter((b) => b.status === 'completed' && b.payment_status === 'paid');
      const sum = (from) => completed
        .filter((b) => new Date(b.completed_at || b.updated_at) >= from)
        .reduce((acc, b) => acc + (parseFloat(b.total_amount) || 0), 0);

      setEarnings({
        today: sum(todayStart),
        week: sum(weekStart),
        month: sum(monthStart),
      });
    }
  }, [bookings]);

  async function loadProfile() {
    try {
      const res = await api.get(`/labourers/${user.id}`);
      setAvailable(res.data.labourer.is_available);
    } catch {}
  }

  async function toggleAvailability(value) {
    setToggling(true);
    try {
      if (value) {
        try {
          const { locationService } = await import('../../services/locationService');
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
  const recentCompleted = bookings
    .filter((b) => b.status === 'completed')
    .slice(0, 5);

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor={colors.primary} />
      <SafeAreaView style={{ flex: 1 }} edges={['top']}>
        <FlatList
          data={[]}
          ListHeaderComponent={() => (
            <>
              {/* Header */}
              <View style={styles.header}>
                <View>
                  <Text style={styles.greeting}>Hey {user?.name?.split(' ')[0]} 👷</Text>
                  <Text style={styles.subGreeting}>Ready to earn today?</Text>
                  {/* KYC badge */}
                  {user?.kyc_status !== 'verified' ? (
                    <TouchableOpacity onPress={() => navigation.navigate('KYC')} style={{ marginTop: 4 }}>
                      <Text style={{ fontSize: 12, color: '#F59E0B', fontWeight: '600' }}>⚠️ Unverified — Tap to verify</Text>
                    </TouchableOpacity>
                  ) : (
                    <Text style={{ fontSize: 12, color: '#10B981', fontWeight: '600', marginTop: 4 }}>✅ Verified</Text>
                  )}
                </View>
                <View style={styles.headerActions}>
                  <TouchableOpacity
                    style={styles.profileBtn}
                    onPress={() => navigation.getParent()?.navigate('Profile')}
                  >
                    <Text style={styles.profileBtnText}>✏️</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.profileBtn, styles.logoutBtn]}
                    onPress={() => dispatch(logoutThunk())}
                  >
                    <Text style={styles.profileBtnText}>🚪</Text>
                  </TouchableOpacity>
                </View>
              </View>

              {/* Availability toggle — prominent */}
              <TouchableOpacity
                activeOpacity={0.9}
                style={[styles.availCard, available && styles.availCardOn]}
                onPress={() => !toggling && toggleAvailability(!available)}
              >
                <View style={styles.availLeft}>
                  <Text style={styles.availStatus}>
                    {available ? '🟢 Online' : '⭕ Offline'}
                  </Text>
                  <Text style={styles.availDesc}>
                    {available
                      ? 'Customers can find and book you'
                      : 'Tap to go online and start earning'}
                  </Text>
                </View>
                {toggling ? (
                  <ActivityIndicator color={available ? '#fff' : colors.textMuted} />
                ) : (
                  <Switch
                    value={available}
                    onValueChange={toggleAvailability}
                    trackColor={{ true: 'rgba(255,255,255,0.4)', false: colors.borderDark }}
                    thumbColor={available ? '#fff' : colors.textMuted}
                  />
                )}
              </TouchableOpacity>

              {/* Earnings cards */}
              <View style={styles.earningsSection}>
                <Text style={styles.sectionTitle}>Earnings</Text>
                <View style={styles.earningsRow}>
                  <View style={[styles.earningsCard, styles.earningsCardPrimary]}>
                    <Text style={styles.earningsCardLabel}>Today</Text>
                    <Text style={styles.earningsCardAmount}>{formatZAR(earnings.today)}</Text>
                  </View>
                  <View style={styles.earningsCard}>
                    <Text style={styles.earningsCardLabel}>This Week</Text>
                    <Text style={styles.earningsCardAmountSecondary}>{formatZAR(earnings.week)}</Text>
                  </View>
                  <View style={styles.earningsCard}>
                    <Text style={styles.earningsCardLabel}>This Month</Text>
                    <Text style={styles.earningsCardAmountSecondary}>{formatZAR(earnings.month)}</Text>
                  </View>
                </View>
              </View>

              {/* Stats row */}
              <View style={styles.statsRow}>
                <TouchableOpacity
                  style={styles.statCard}
                  onPress={() => navigation.getParent()?.navigate('Jobs')}
                >
                  <View style={styles.statBadge}>
                    {pendingBookings.length > 0 && (
                      <View style={styles.notifDot}>
                        <Text style={styles.notifDotText}>{pendingBookings.length}</Text>
                      </View>
                    )}
                    <Text style={styles.statIcon}>📋</Text>
                  </View>
                  <Text style={styles.statNum}>{pendingBookings.length}</Text>
                  <Text style={styles.statLabel}>Pending Jobs</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={styles.statCard}
                  onPress={() => navigation.getParent()?.navigate('Earnings')}
                >
                  <Text style={styles.statIcon}>✅</Text>
                  <Text style={styles.statNum}>
                    {bookings.filter((b) => b.status === 'completed').length}
                  </Text>
                  <Text style={styles.statLabel}>Completed</Text>
                </TouchableOpacity>

                <View style={styles.statCard}>
                  <Text style={styles.statIcon}>⭐</Text>
                  <Text style={styles.statNum}>
                    {bookings.length > 0
                      ? (bookings.reduce((a, b) => a + (b.rating || 0), 0) / Math.max(1, bookings.filter((b) => b.rating).length)).toFixed(1)
                      : '—'}
                  </Text>
                  <Text style={styles.statLabel}>Avg Rating</Text>
                </View>
              </View>

              {/* Active jobs */}
              {activeBookings.length > 0 && (
                <View style={styles.section}>
                  <Text style={styles.sectionTitle}>🔥 Active Jobs</Text>
                  {activeBookings.map((b) => (
                    <TouchableOpacity
                      key={b.id}
                      style={[styles.bookingCard, styles.activeBookingCard]}
                      onPress={() => navigation.navigate('ActiveJob', { bookingId: b.id })}
                    >
                      <View style={styles.cardRow}>
                        <Text style={styles.cardCustomer}>{b.customer_name}</Text>
                        <BookingStatusBadge status={b.status} />
                      </View>
                      <Text style={styles.cardSkill}>{b.skill_needed}</Text>
                      <Text style={styles.cardTime}>{formatDateTime(b.scheduled_at)}</Text>
                      <Text style={styles.cardAction}>Tap to view active job →</Text>
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
                      <Text style={styles.seeAll}>See all →</Text>
                    </TouchableOpacity>
                  </View>
                  {pendingBookings.slice(0, 2).map((b) => (
                    <TouchableOpacity
                      key={b.id}
                      style={styles.bookingCard}
                      onPress={() => navigation.getParent()?.navigate('Jobs')}
                    >
                      <Text style={styles.cardCustomer}>{b.customer_name}</Text>
                      <Text style={styles.cardSkill}>{b.skill_needed}</Text>
                      <Text style={styles.cardAddress}>{b.address}</Text>
                      {b.total_amount && (
                        <Text style={styles.cardAmount}>{formatZAR(b.total_amount)} est.</Text>
                      )}
                    </TouchableOpacity>
                  ))}
                </View>
              )}

              {/* Recent completed */}
              {recentCompleted.length > 0 && (
                <View style={styles.section}>
                  <Text style={styles.sectionTitle}>Recent Jobs</Text>
                  {recentCompleted.map((b) => (
                    <View key={b.id} style={styles.recentCard}>
                      <View style={styles.cardRow}>
                        <Text style={styles.cardCustomer}>{b.customer_name}</Text>
                        <Text style={styles.cardAmountGreen}>
                          {b.total_amount ? formatZAR(b.total_amount) : '—'}
                        </Text>
                      </View>
                      <Text style={styles.cardSkill}>{b.skill_needed}</Text>
                      <Text style={styles.cardTime}>{formatDateTime(b.scheduled_at)}</Text>
                    </View>
                  ))}
                </View>
              )}
            </>
          )}
          renderItem={null}
          contentContainerStyle={styles.listContent}
        />
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f3f4f6' },
  listContent: { paddingBottom: 40 },

  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: colors.primary,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    paddingBottom: spacing.lg,
  },
  greeting: { fontSize: typography.xl, fontWeight: '800', color: '#fff' },
  subGreeting: { fontSize: typography.sm, color: colors.textMuted, marginTop: 2 },
  headerActions: { flexDirection: 'row', gap: spacing.sm },
  profileBtn: {
    width: 36,
    height: 36,
    borderRadius: borderRadius.full,
    backgroundColor: 'rgba(255,255,255,0.12)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  logoutBtn: { backgroundColor: 'rgba(239,68,68,0.2)' },
  profileBtnText: { fontSize: 16 },

  // Availability
  availCard: {
    backgroundColor: colors.cardDark,
    marginHorizontal: spacing.md,
    marginTop: -spacing.lg,
    borderRadius: borderRadius.md,
    padding: spacing.md,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    ...shadows.card,
    borderWidth: 2,
    borderColor: colors.borderDark,
  },
  availCardOn: {
    backgroundColor: colors.success,
    borderColor: colors.success,
  },
  availLeft: { flex: 1 },
  availStatus: {
    fontSize: typography.md,
    fontWeight: '800',
    color: '#fff',
    marginBottom: 3,
  },
  availDesc: { fontSize: typography.xs, color: 'rgba(255,255,255,0.75)', maxWidth: 200 },

  // Earnings
  earningsSection: {
    paddingHorizontal: spacing.md,
    marginTop: spacing.md,
  },
  earningsRow: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.sm },
  earningsCard: {
    flex: 1,
    backgroundColor: '#fff',
    borderRadius: borderRadius.md,
    padding: spacing.sm + 4,
    ...shadows.card,
  },
  earningsCardPrimary: {
    backgroundColor: colors.primary,
  },
  earningsCardLabel: {
    fontSize: typography.xs,
    color: colors.textMuted,
    fontWeight: '600',
    marginBottom: 4,
  },
  earningsCardAmount: {
    fontSize: typography.lg,
    fontWeight: '900',
    color: colors.accent,
  },
  earningsCardAmountSecondary: {
    fontSize: typography.md,
    fontWeight: '800',
    color: colors.success,
  },

  // Stats
  statsRow: {
    flexDirection: 'row',
    paddingHorizontal: spacing.md,
    gap: spacing.sm,
    marginTop: spacing.md,
  },
  statCard: {
    flex: 1,
    backgroundColor: '#fff',
    borderRadius: borderRadius.md,
    padding: spacing.sm + 4,
    alignItems: 'center',
    ...shadows.card,
  },
  statBadge: { position: 'relative', marginBottom: 4 },
  notifDot: {
    position: 'absolute',
    top: -4,
    right: -8,
    backgroundColor: colors.danger,
    borderRadius: borderRadius.full,
    width: 18,
    height: 18,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 1,
  },
  notifDotText: { color: '#fff', fontSize: 10, fontWeight: '800' },
  statIcon: { fontSize: 22 },
  statNum: { fontSize: typography.xl, fontWeight: '900', color: colors.primary, marginTop: 2 },
  statLabel: { fontSize: typography.xs, color: colors.textMuted, marginTop: 2, textAlign: 'center' },

  // Sections
  section: { paddingHorizontal: spacing.md, marginTop: spacing.md },
  sectionRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: spacing.sm },
  sectionTitle: { fontSize: typography.md, fontWeight: '700', color: colors.textPrimary, marginBottom: spacing.sm },
  seeAll: { color: colors.accent, fontWeight: '600', fontSize: typography.sm },

  bookingCard: {
    backgroundColor: '#fff',
    borderRadius: borderRadius.md,
    padding: spacing.md,
    marginBottom: spacing.sm,
    ...shadows.card,
  },
  activeBookingCard: {
    borderLeftWidth: 3,
    borderLeftColor: colors.success,
  },
  recentCard: {
    backgroundColor: '#fff',
    borderRadius: borderRadius.md,
    padding: spacing.md,
    marginBottom: spacing.sm,
    ...shadows.card,
    borderLeftWidth: 3,
    borderLeftColor: colors.border,
  },
  cardRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 },
  cardCustomer: { fontSize: typography.md, fontWeight: '700', color: colors.textPrimary },
  cardSkill: { fontSize: typography.sm, color: colors.textSecondary, marginBottom: 2, fontWeight: '500' },
  cardAddress: { fontSize: typography.xs, color: colors.textMuted, marginBottom: 2 },
  cardTime: { fontSize: typography.xs, color: colors.textMuted },
  cardAmount: { fontSize: typography.sm, fontWeight: '700', color: colors.accent },
  cardAmountGreen: { fontSize: typography.sm, fontWeight: '700', color: colors.success },
  cardAction: { fontSize: typography.xs, color: colors.success, fontWeight: '600', marginTop: spacing.xs },
});
