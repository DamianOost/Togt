import React, { useEffect, useRef, useState } from 'react';
import {
  View, Text, FlatList, TouchableOpacity, StyleSheet,
  ActivityIndicator, Alert, Animated,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useDispatch, useSelector } from 'react-redux';
import { fetchMyBookings } from '../../store/bookingSlice';
import { bookingService } from '../../services/bookingService';
import { formatZAR, formatDateTime } from '../../utils/formatters';
import { colors, typography, spacing, borderRadius, shadows } from '../../theme';

const EXPIRE_SECONDS = 30;

function CountdownTimer({ createdAt, onExpire }) {
  const [remaining, setRemaining] = useState(EXPIRE_SECONDS);

  useEffect(() => {
    const elapsed = Math.floor((Date.now() - new Date(createdAt).getTime()) / 1000);
    const initial = Math.max(0, EXPIRE_SECONDS - elapsed);
    setRemaining(initial);

    if (initial === 0) { onExpire?.(); return; }

    const interval = setInterval(() => {
      setRemaining((prev) => {
        if (prev <= 1) {
          clearInterval(interval);
          onExpire?.();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(interval);
  }, [createdAt]);

  const urgent = remaining <= 10;
  const progress = remaining / EXPIRE_SECONDS;

  return (
    <View style={timerStyles.container}>
      <View style={timerStyles.track}>
        <View style={[timerStyles.fill, {
          width: `${progress * 100}%`,
          backgroundColor: urgent ? colors.danger : colors.accent,
        }]} />
      </View>
      <Text style={[timerStyles.text, urgent && timerStyles.textUrgent]}>
        {remaining}s
      </Text>
    </View>
  );
}

const timerStyles = StyleSheet.create({
  container: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginBottom: spacing.sm },
  track: {
    flex: 1,
    height: 4,
    backgroundColor: colors.border,
    borderRadius: borderRadius.full,
    overflow: 'hidden',
  },
  fill: { height: '100%', borderRadius: borderRadius.full },
  text: { fontSize: typography.sm, fontWeight: '700', color: colors.textMuted, width: 32, textAlign: 'right' },
  textUrgent: { color: colors.danger },
});

function JobRequestCard({ item, onAccept, onDecline, onExpire }) {
  const scaleAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.spring(scaleAnim, {
      toValue: 1,
      tension: 50,
      friction: 8,
      useNativeDriver: true,
    }).start();
  }, []);

  return (
    <Animated.View style={[styles.card, { transform: [{ scale: scaleAnim }] }]}>
      <CountdownTimer createdAt={item.created_at || new Date().toISOString()} onExpire={() => onExpire(item.id)} />

      <View style={styles.cardHeader}>
        <View style={styles.customerAvatar}>
          <Text style={styles.customerAvatarText}>{item.customer_name?.[0] || 'C'}</Text>
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.customerName}>{item.customer_name}</Text>
          <Text style={styles.cardSkill}>{item.skill_needed}</Text>
        </View>
        {item.total_amount && (
          <Text style={styles.earningsAmount}>{formatZAR(item.total_amount)}</Text>
        )}
      </View>

      <View style={styles.detailsGrid}>
        {item.address && (
          <View style={styles.detailItem}>
            <Text style={styles.detailIcon}>📍</Text>
            <Text style={styles.detailText} numberOfLines={2}>{item.address}</Text>
          </View>
        )}
        {item.scheduled_at && (
          <View style={styles.detailItem}>
            <Text style={styles.detailIcon}>📅</Text>
            <Text style={styles.detailText}>{formatDateTime(item.scheduled_at)}</Text>
          </View>
        )}
        {item.hours_est && (
          <View style={styles.detailItem}>
            <Text style={styles.detailIcon}>⏱️</Text>
            <Text style={styles.detailText}>{item.hours_est}h estimated</Text>
          </View>
        )}
        {item.distance_km != null && (
          <View style={styles.detailItem}>
            <Text style={styles.detailIcon}>🗺️</Text>
            <Text style={styles.detailText}>{parseFloat(item.distance_km).toFixed(1)} km away</Text>
          </View>
        )}
      </View>

      {item.notes && (
        <View style={styles.notesBox}>
          <Text style={styles.notesText}>"{item.notes}"</Text>
        </View>
      )}

      <View style={styles.actions}>
        <TouchableOpacity
          style={styles.declineBtn}
          onPress={() => onDecline(item.id)}
        >
          <Text style={styles.declineBtnText}>✕  Decline</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.acceptBtn}
          onPress={() => onAccept(item.id)}
        >
          <Text style={styles.acceptBtnText}>✓  Accept Job</Text>
        </TouchableOpacity>
      </View>
    </Animated.View>
  );
}

export default function JobRequestsScreen({ navigation }) {
  const dispatch = useDispatch();
  const { bookings, loading } = useSelector((s) => s.booking);

  const pendingBookings = bookings.filter((b) => b.status === 'pending');

  useEffect(() => {
    dispatch(fetchMyBookings());
    // Poll every 20s for new requests
    const interval = setInterval(() => dispatch(fetchMyBookings()), 20000);
    return () => clearInterval(interval);
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
    Alert.alert('Decline Job', 'Are you sure?', [
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

  async function handleExpire(bookingId) {
    // Auto-decline on timer expiry
    try {
      await bookingService.decline(bookingId);
      dispatch(fetchMyBookings());
    } catch {}
  }

  if (loading && pendingBookings.length === 0) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator color={colors.accent} size="large" />
        <Text style={styles.loadingText}>Loading job requests...</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <SafeAreaView style={{ flex: 1 }} edges={['top']}>
        <View style={styles.header}>
          <Text style={styles.headerTitle}>Job Requests</Text>
          {pendingBookings.length > 0 && (
            <View style={styles.countBadge}>
              <Text style={styles.countBadgeText}>{pendingBookings.length}</Text>
            </View>
          )}
        </View>

        {pendingBookings.length === 0 ? (
          <View style={styles.empty}>
            <Text style={styles.emptyIcon}>🔔</Text>
            <Text style={styles.emptyTitle}>No new requests</Text>
            <Text style={styles.emptySubText}>
              Make sure you're set as available to receive job requests.
            </Text>
          </View>
        ) : (
          <FlatList
            data={pendingBookings}
            keyExtractor={(b) => b.id}
            contentContainerStyle={styles.list}
            showsVerticalScrollIndicator={false}
            renderItem={({ item }) => (
              <JobRequestCard
                item={item}
                onAccept={handleAccept}
                onDecline={handleDecline}
                onExpire={handleExpire}
              />
            )}
          />
        )}
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f3f4f6' },
  loadingContainer: {
    flex: 1,
    backgroundColor: '#f3f4f6',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
  },
  loadingText: { color: colors.textMuted, fontSize: typography.sm },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    backgroundColor: colors.primary,
  },
  headerTitle: {
    fontSize: typography.xl,
    fontWeight: '800',
    color: '#fff',
  },
  countBadge: {
    backgroundColor: colors.danger,
    borderRadius: borderRadius.full,
    minWidth: 24,
    height: 24,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 6,
  },
  countBadgeText: { color: '#fff', fontSize: typography.xs, fontWeight: '800' },
  list: { padding: spacing.md },
  card: {
    backgroundColor: '#fff',
    borderRadius: borderRadius.md + 4,
    padding: spacing.md,
    marginBottom: spacing.md,
    ...shadows.card,
    borderLeftWidth: 4,
    borderLeftColor: colors.accent,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginBottom: spacing.sm,
  },
  customerAvatar: {
    width: 44,
    height: 44,
    borderRadius: borderRadius.full,
    backgroundColor: colors.primaryLight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  customerAvatarText: { color: colors.accent, fontSize: typography.lg, fontWeight: '800' },
  customerName: { fontSize: typography.md, fontWeight: '800', color: colors.textPrimary },
  cardSkill: { fontSize: typography.sm, color: colors.accent, fontWeight: '600' },
  earningsAmount: { fontSize: typography.xl, fontWeight: '900', color: colors.success },
  detailsGrid: { gap: 5, marginBottom: spacing.sm },
  detailItem: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.xs },
  detailIcon: { fontSize: 13, marginTop: 1 },
  detailText: { fontSize: typography.sm, color: colors.textSecondary, flex: 1 },
  notesBox: {
    backgroundColor: '#f9fafb',
    borderRadius: borderRadius.sm,
    padding: spacing.sm,
    marginBottom: spacing.sm,
    borderLeftWidth: 2,
    borderLeftColor: colors.border,
  },
  notesText: { fontSize: typography.sm, color: colors.textMuted, fontStyle: 'italic' },
  actions: { flexDirection: 'row', gap: spacing.sm },
  declineBtn: {
    flex: 1,
    borderWidth: 1.5,
    borderColor: colors.danger,
    borderRadius: borderRadius.md,
    paddingVertical: spacing.sm + 4,
    alignItems: 'center',
  },
  declineBtnText: { color: colors.danger, fontWeight: '700', fontSize: typography.sm },
  acceptBtn: {
    flex: 2,
    backgroundColor: colors.success,
    borderRadius: borderRadius.md,
    paddingVertical: spacing.sm + 4,
    alignItems: 'center',
    ...shadows.card,
  },
  acceptBtnText: { color: '#fff', fontWeight: '800', fontSize: typography.md },
  empty: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: spacing.xl },
  emptyIcon: { fontSize: 56, marginBottom: spacing.md },
  emptyTitle: { fontSize: typography.xl, fontWeight: '700', color: colors.textPrimary, marginBottom: spacing.sm },
  emptySubText: { fontSize: typography.sm, color: colors.textMuted, textAlign: 'center', lineHeight: 22 },
});
