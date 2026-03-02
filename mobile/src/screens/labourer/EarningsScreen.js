import React, { useEffect, useState } from 'react';
import {
  View, Text, StyleSheet, SafeAreaView, ActivityIndicator,
  TouchableOpacity, TextInput, FlatList, Alert, Modal,
} from 'react-native';
import { useDispatch, useSelector } from 'react-redux';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { fetchMyBookings } from '../../store/bookingSlice';
import BookingStatusBadge from '../../components/BookingStatusBadge';
import { formatZAR, formatDateTime } from '../../utils/formatters';
import { colors, typography, spacing, borderRadius, shadows } from '../../theme';

const GOAL_KEY = 'labourer:weekly_goal';

function ProgressBar({ progress, color = colors.accent }) {
  const pct = Math.min(Math.max(progress, 0), 1);
  return (
    <View style={pbStyles.track}>
      <View style={[pbStyles.fill, { width: `${Math.round(pct * 100)}%`, backgroundColor: color }]} />
    </View>
  );
}
const pbStyles = StyleSheet.create({
  track: {
    height: 12, backgroundColor: '#f3f4f6',
    borderRadius: borderRadius.full, overflow: 'hidden',
  },
  fill: { height: '100%', borderRadius: borderRadius.full },
});

export default function EarningsScreen() {
  const dispatch = useDispatch();
  const { bookings, loading } = useSelector((s) => s.booking);

  const [weeklyGoal, setWeeklyGoal] = useState(null);
  const [goalInput, setGoalInput] = useState('');
  const [showGoalModal, setShowGoalModal] = useState(false);

  useEffect(() => {
    dispatch(fetchMyBookings());
    loadGoal();
  }, []);

  async function loadGoal() {
    try {
      const raw = await AsyncStorage.getItem(GOAL_KEY);
      if (raw) setWeeklyGoal(parseFloat(raw));
    } catch {}
  }

  async function saveGoal() {
    const val = parseFloat(goalInput);
    if (!val || val <= 0) {
      Alert.alert('Invalid', 'Please enter a positive amount.');
      return;
    }
    await AsyncStorage.setItem(GOAL_KEY, String(val));
    setWeeklyGoal(val);
    setShowGoalModal(false);
    setGoalInput('');
  }

  const completedBookings = bookings.filter((b) => b.status === 'completed');
  const totalEarned = completedBookings.reduce(
    (sum, b) => sum + (parseFloat(b.total_amount) || 0), 0
  );

  // Weekly earnings (last 7 days)
  const oneWeekAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
  const weeklyBookings = completedBookings.filter(
    (b) => new Date(b.completed_at || b.scheduled_at).getTime() >= oneWeekAgo
  );
  const weeklyEarned = weeklyBookings.reduce(
    (sum, b) => sum + (parseFloat(b.total_amount) || 0), 0
  );
  const weeklyHours = weeklyBookings.reduce(
    (sum, b) => sum + (parseFloat(b.hours_est) || 0), 0
  );

  // Average rating (from bookings that have a rating)
  const rated = completedBookings.filter((b) => b.rating);
  const avgRating = rated.length
    ? (rated.reduce((s, b) => s + b.rating, 0) / rated.length).toFixed(1)
    : null;

  const goalProgress = weeklyGoal ? weeklyEarned / weeklyGoal : 0;
  const goalReached = weeklyGoal && weeklyEarned >= weeklyGoal;

  if (loading) return <ActivityIndicator style={{ flex: 1 }} color={colors.accent} />;

  return (
    <SafeAreaView style={styles.container}>
      <FlatList
        data={completedBookings}
        keyExtractor={(b) => b.id}
        contentContainerStyle={styles.list}
        ListHeaderComponent={
          <View>
            {/* Weekly Goal Banner */}
            <View style={styles.goalBanner}>
              <View style={styles.goalHeader}>
                <View>
                  <Text style={styles.goalLabel}>This week</Text>
                  <Text style={styles.goalAmount}>{formatZAR(weeklyEarned)}</Text>
                  {weeklyGoal && (
                    <Text style={styles.goalTarget}>of {formatZAR(weeklyGoal)} goal</Text>
                  )}
                </View>
                <TouchableOpacity
                  style={styles.setGoalBtn}
                  onPress={() => { setGoalInput(weeklyGoal ? String(weeklyGoal) : ''); setShowGoalModal(true); }}
                >
                  <Text style={styles.setGoalBtnText}>🎯 Set Goal</Text>
                </TouchableOpacity>
              </View>

              {weeklyGoal && (
                <View style={{ marginTop: spacing.sm }}>
                  <ProgressBar progress={goalProgress} />
                  <Text style={styles.progressPct}>
                    {Math.round(goalProgress * 100)}% of goal
                  </Text>
                </View>
              )}

              {goalReached && (
                <View style={styles.goalReachedBanner}>
                  <Text style={styles.goalReachedText}>🎉 You hit your target!</Text>
                </View>
              )}
            </View>

            {/* Stats row */}
            <View style={styles.statsRow}>
              <View style={styles.statCard}>
                <Text style={styles.statValue}>{weeklyBookings.length}</Text>
                <Text style={styles.statLabel}>Jobs this week</Text>
              </View>
              <View style={styles.statCard}>
                <Text style={styles.statValue}>{weeklyHours}h</Text>
                <Text style={styles.statLabel}>Hours worked</Text>
              </View>
              <View style={styles.statCard}>
                <Text style={styles.statValue}>{avgRating ? `⭐ ${avgRating}` : '—'}</Text>
                <Text style={styles.statLabel}>Avg rating</Text>
              </View>
            </View>

            {/* All-time banner */}
            <View style={styles.allTimeBanner}>
              <Text style={styles.allTimeLabel}>Total Earned (all time)</Text>
              <Text style={styles.allTimeAmount}>{formatZAR(totalEarned)}</Text>
              <Text style={styles.allTimeSub}>{completedBookings.length} completed jobs</Text>
            </View>

            <Text style={styles.sectionTitle}>Recent Jobs</Text>
          </View>
        }
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
            {item.hours_est && <Text style={styles.hours}>{item.hours_est} hrs</Text>}
          </View>
        )}
      />

      {/* Set Goal Modal */}
      <Modal visible={showGoalModal} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>🎯 Set Weekly Goal</Text>
            <Text style={styles.modalSub}>How much do you want to earn this week?</Text>
            <View style={styles.modalInputRow}>
              <Text style={styles.modalCurrency}>R</Text>
              <TextInput
                style={styles.modalInput}
                value={goalInput}
                onChangeText={setGoalInput}
                keyboardType="numeric"
                placeholder="e.g. 5000"
                placeholderTextColor={colors.textMuted}
                autoFocus
              />
            </View>
            <View style={styles.modalActions}>
              <TouchableOpacity
                style={styles.modalCancel}
                onPress={() => setShowGoalModal(false)}
              >
                <Text style={styles.modalCancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.modalSave} onPress={saveGoal}>
                <Text style={styles.modalSaveText}>Save Goal</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f3f4f6' },
  list: { padding: spacing.md, paddingBottom: spacing.xl },

  goalBanner: {
    backgroundColor: colors.primary,
    borderRadius: borderRadius.md,
    padding: spacing.md,
    marginBottom: spacing.sm,
    ...shadows.card,
  },
  goalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  goalLabel: { color: 'rgba(255,255,255,0.7)', fontSize: typography.xs, fontWeight: '600', textTransform: 'uppercase' },
  goalAmount: { color: '#fff', fontSize: typography.xxl, fontWeight: '900', marginVertical: 2 },
  goalTarget: { color: 'rgba(255,255,255,0.6)', fontSize: typography.sm },
  setGoalBtn: {
    backgroundColor: colors.accent,
    borderRadius: borderRadius.full,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs + 2,
  },
  setGoalBtnText: { color: colors.primary, fontSize: typography.sm, fontWeight: '700' },
  progressPct: { color: 'rgba(255,255,255,0.6)', fontSize: typography.xs, marginTop: 4, textAlign: 'right' },
  goalReachedBanner: {
    marginTop: spacing.sm,
    backgroundColor: colors.accent,
    borderRadius: borderRadius.sm,
    padding: spacing.sm,
    alignItems: 'center',
  },
  goalReachedText: { color: colors.primary, fontWeight: '900', fontSize: typography.md },

  statsRow: { flexDirection: 'row', gap: spacing.sm, marginBottom: spacing.sm },
  statCard: {
    flex: 1, backgroundColor: '#fff', borderRadius: borderRadius.md,
    padding: spacing.sm, alignItems: 'center', ...shadows.card,
  },
  statValue: { fontSize: typography.lg, fontWeight: '800', color: colors.textPrimary },
  statLabel: { fontSize: typography.xs, color: colors.textMuted, textAlign: 'center', marginTop: 2 },

  allTimeBanner: {
    backgroundColor: colors.success,
    borderRadius: borderRadius.md,
    padding: spacing.md,
    alignItems: 'center',
    marginBottom: spacing.md,
    ...shadows.card,
  },
  allTimeLabel: { color: 'rgba(255,255,255,0.8)', fontSize: typography.xs, fontWeight: '600', textTransform: 'uppercase' },
  allTimeAmount: { color: '#fff', fontSize: 40, fontWeight: '900', marginVertical: 4 },
  allTimeSub: { color: 'rgba(255,255,255,0.7)', fontSize: typography.sm },

  sectionTitle: { fontSize: typography.md, fontWeight: '800', color: colors.textPrimary, marginBottom: spacing.sm },

  card: {
    backgroundColor: '#fff', borderRadius: borderRadius.md,
    padding: spacing.sm + 4, marginBottom: spacing.xs, ...shadows.card,
  },
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 },
  customerName: { fontSize: typography.md, fontWeight: '700', color: colors.textPrimary },
  amount: { fontSize: typography.md, fontWeight: '800', color: colors.success },
  skill: { fontSize: typography.sm, color: colors.textSecondary, marginBottom: 2 },
  time: { fontSize: typography.xs, color: colors.textMuted },
  hours: { fontSize: typography.xs, color: colors.textMuted },
  empty: { alignItems: 'center', marginTop: 40 },
  emptyText: { color: colors.textMuted, fontSize: typography.md },

  modalOverlay: {
    flex: 1, backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  modalCard: {
    backgroundColor: '#fff', borderTopLeftRadius: borderRadius.lg,
    borderTopRightRadius: borderRadius.lg, padding: spacing.lg,
    ...shadows.heavy,
  },
  modalTitle: { fontSize: typography.xl, fontWeight: '900', color: colors.textPrimary, marginBottom: spacing.xs },
  modalSub: { fontSize: typography.sm, color: colors.textMuted, marginBottom: spacing.md },
  modalInputRow: {
    flexDirection: 'row', alignItems: 'center',
    borderWidth: 2, borderColor: colors.accent,
    borderRadius: borderRadius.md, padding: spacing.sm + 2,
    marginBottom: spacing.md,
  },
  modalCurrency: { fontSize: typography.xl, fontWeight: '800', color: colors.textSecondary, marginRight: spacing.xs },
  modalInput: { flex: 1, fontSize: typography.xl, fontWeight: '700', color: colors.textPrimary },
  modalActions: { flexDirection: 'row', gap: spacing.sm },
  modalCancel: {
    flex: 1, borderWidth: 1.5, borderColor: colors.border,
    borderRadius: borderRadius.md, paddingVertical: spacing.sm + 2, alignItems: 'center',
  },
  modalCancelText: { color: colors.textSecondary, fontWeight: '600' },
  modalSave: {
    flex: 2, backgroundColor: colors.accent,
    borderRadius: borderRadius.md, paddingVertical: spacing.sm + 2, alignItems: 'center',
  },
  modalSaveText: { color: colors.primary, fontWeight: '800', fontSize: typography.md },
});
