import React, { useState, useEffect } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, ScrollView,
  StyleSheet, SafeAreaView, Alert, ActivityIndicator, Platform, StatusBar,
} from 'react-native';
import DateTimePicker from '@react-native-community/datetimepicker';
import { useDispatch, useSelector } from 'react-redux';
import { createBookingThunk } from '../../store/bookingSlice';
import { locationService } from '../../services/locationService';
import { formatZAR, formatDateTime } from '../../utils/formatters';
import { colors, typography, spacing, borderRadius, shadows } from '../../theme';
import api from '../../services/api';

const { createCustomerHomeIntent, createRouteParams } = require('../../navigation/routeContracts');

const RECURRENCE_OPTIONS = [
  { label: 'Weekly', value: 'weekly', days: 7 },
  { label: 'Fortnightly', value: 'fortnightly', days: 14 },
  { label: 'Monthly', value: 'monthly', days: 30 },
];

const DURATION_OPTIONS = [
  { label: '2h', hours: 2 },
  { label: '4h', hours: 4 },
  { label: '8h', hours: 8 },
  { label: 'Full day', hours: 10 },
];

export default function BookingFormScreen({ route, navigation }) {
  let parsedParams = null;
  let routeIssue = null;
  try {
    parsedParams = createRouteParams('BookingForm', route.params);
  } catch {
    routeIssue = 'This booking link is incomplete. Return to the worker profile and try again.';
  }

  const workerId = parsedParams?.workerId;
  const dispatch = useDispatch();
  const { loading, error } = useSelector((s) => s.booking);
  const [labourer, setLabourer] = useState(null);
  const [profileLoading, setProfileLoading] = useState(Boolean(workerId));
  const [profileIssue, setProfileIssue] = useState(routeIssue);
  const [profileReloadKey, setProfileReloadKey] = useState(0);

  const [form, setForm] = useState({
    skill_needed: '',
    address: '',
    location_lat: null,
    location_lng: null,
    scheduled_at: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
    hours_est: '2',
    notes: '',
  });

  const [scheduledDate, setScheduledDate] = useState(new Date(Date.now() + 60 * 60 * 1000));
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [showTimePicker, setShowTimePicker] = useState(false);
  const [recurPattern, setRecurPattern] = useState(null); // null | 'weekly' | 'fortnightly' | 'monthly'
  const [recurLoading, setRecurLoading] = useState(false);

  function goBackSafely() {
    if (navigation.canGoBack()) {
      navigation.goBack();
      return;
    }
    const intent = createCustomerHomeIntent();
    navigation.navigate(intent.name, intent.params);
  }

  useEffect(() => {
    if (!workerId) {
      setProfileLoading(false);
      return undefined;
    }

    let active = true;
    async function loadWorker() {
      setProfileLoading(true);
      setLabourer(null);
      setProfileIssue(null);
      try {
        const response = await api.get(`/api/labourers/${encodeURIComponent(workerId)}`);
        if (!active) return;
        const worker = response.data.labourer;
        if (!worker) throw new Error('Worker profile missing');
        setLabourer(worker);
        setForm((current) => ({
          ...current,
          skill_needed: current.skill_needed || worker.skills?.[0] || '',
        }));
      } catch (loadError) {
        if (!active) return;
        setLabourer(null);
        setProfileIssue(loadError.response?.status === 404
          ? 'This worker profile is no longer available.'
          : 'We could not load this worker profile. Check your connection and try again.');
      } finally {
        if (active) setProfileLoading(false);
      }
    }
    loadWorker();
    return () => {
      active = false;
    };
  }, [workerId, profileReloadKey]);

  useEffect(() => {
    locationService.getCurrentPosition().then((pos) => {
      setForm((f) => ({ ...f, location_lat: pos.lat, location_lng: pos.lng }));
    }).catch(() => {});
  }, []);

  if (profileLoading) {
    return (
      <View style={styles.profileStateContainer}>
        <ActivityIndicator color="#12844E" size="large" accessibilityLabel="Loading worker booking details" />
        <Text style={styles.profileLoadingText}>Preparing booking details…</Text>
      </View>
    );
  }

  if (profileIssue || !labourer) {
    return (
      <View style={styles.profileStateContainer}>
        <View style={styles.profileStateCard} accessibilityLiveRegion="assertive">
          <Text style={styles.profileStateLabel}>BOOKING</Text>
          <Text style={styles.profileStateTitle}>Profile unavailable</Text>
          <Text style={styles.profileStateDetail}>
            {profileIssue || 'Return to the worker profile and try again.'}
          </Text>
          {!routeIssue && (
            <TouchableOpacity
              style={styles.profileRetryButton}
              onPress={() => setProfileReloadKey((value) => value + 1)}
              accessibilityRole="button"
            >
              <Text style={styles.profileRetryButtonText}>Try again</Text>
            </TouchableOpacity>
          )}
          <TouchableOpacity
            style={styles.profileBackButton}
            onPress={goBackSafely}
            accessibilityRole="button"
          >
            <Text style={styles.profileBackButtonText}>Back to worker</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  function set(key) {
    return (val) => setForm((f) => ({ ...f, [key]: val }));
  }

  function onDateChange(event, selected) {
    if (Platform.OS === 'android') setShowDatePicker(false);
    if (selected) {
      const updated = new Date(scheduledDate);
      updated.setFullYear(selected.getFullYear(), selected.getMonth(), selected.getDate());
      setScheduledDate(updated);
      setForm((f) => ({ ...f, scheduled_at: updated.toISOString() }));
      if (Platform.OS === 'android') setTimeout(() => setShowTimePicker(true), 100);
    }
  }

  function onTimeChange(event, selected) {
    if (Platform.OS === 'android') setShowTimePicker(false);
    if (selected) {
      const updated = new Date(scheduledDate);
      updated.setHours(selected.getHours(), selected.getMinutes(), 0, 0);
      setScheduledDate(updated);
      setForm((f) => ({ ...f, scheduled_at: updated.toISOString() }));
    }
  }

  function formatDisplayDate(date) {
    return date.toLocaleDateString('en-ZA', { weekday: 'short', day: 'numeric', month: 'short' });
  }

  function formatDisplayTime(date) {
    return date.toLocaleTimeString('en-ZA', { hour: '2-digit', minute: '2-digit' });
  }

  const hours = parseFloat(form.hours_est) || 0;
  const estimatedTotal = hours > 0 ? labourer.hourly_rate * hours : null;

  async function handleBook() {
    if (!form.skill_needed || !form.address || !form.scheduled_at) {
      Alert.alert('Missing fields', 'Please fill in all required fields.');
      return;
    }
    if (!form.location_lat) {
      Alert.alert('Location needed', 'Could not get your location. Please try again.');
      return;
    }

    Alert.alert(
      'Confirm Booking',
      `Book ${labourer.name} for ${form.skill_needed}?\n\n📍 ${form.address}\n📅 ${formatDisplayDate(scheduledDate)} at ${formatDisplayTime(scheduledDate)}\n⏱️ ${form.hours_est} hours\n💰 ${estimatedTotal ? formatZAR(estimatedTotal) : 'TBD'}`,
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Confirm', onPress: submitBooking },
      ]
    );
  }

  async function submitBooking() {
    const result = await dispatch(createBookingThunk({
      labourer_id: labourer.id,
      ...form,
      hours_est: parseFloat(form.hours_est) || null,
    }));

    if (createBookingThunk.fulfilled.match(result)) {
      const bookingId = result.payload.booking.id;

      // If user selected recurrence, create future bookings
      if (recurPattern) {
        setRecurLoading(true);
        try {
          await api.post(`/api/bookings/${bookingId}/make-recurring`, { pattern: recurPattern });
        } catch {}
        setRecurLoading(false);
      }

      navigation.replace('ActiveBooking', { bookingId });
    }
  }

  return (
    <View style={styles.container}>
      <StatusBar barStyle="dark-content" />
      <SafeAreaView style={{ flex: 1 }}>
        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity
            onPress={goBackSafely}
            style={styles.backBtn}
            accessibilityRole="button"
            accessibilityLabel="Back to worker profile"
          >
            <Text style={styles.backBtnText}>←</Text>
          </TouchableOpacity>
          <View style={{ flex: 1 }}>
            <Text style={styles.headerTitle}>Book {labourer.name.split(' ')[0]}</Text>
            <Text style={styles.headerSub}>{formatZAR(labourer.hourly_rate)}/hr</Text>
          </View>
        </View>

        <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
          {error && (
            <View style={styles.errorBanner}>
              <Text style={styles.errorText}>⚠️ {error}</Text>
            </View>
          )}

          {/* Skill section */}
          <View style={styles.card}>
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionIcon}>🔧</Text>
              <Text style={styles.sectionTitle}>Skill Needed</Text>
            </View>
            <View style={styles.chips}>
              {(labourer.skills || ['Plumbing', 'Painting', 'Electrical', 'Building', 'Cleaning']).map((s) => (
                <TouchableOpacity
                  key={s}
                  style={[styles.chip, form.skill_needed === s && styles.chipActive]}
                  onPress={() => set('skill_needed')(s)}
                >
                  <Text style={[styles.chipText, form.skill_needed === s && styles.chipTextActive]}>{s}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>

          {/* Location */}
          <View style={styles.card}>
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionIcon}>📍</Text>
              <Text style={styles.sectionTitle}>Job Location</Text>
            </View>
            <TextInput
              style={styles.input}
              value={form.address}
              onChangeText={set('address')}
              placeholder="Full address where work is needed"
              placeholderTextColor={colors.textMuted}
              multiline
            />
          </View>

          {/* Date & time */}
          <View style={styles.card}>
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionIcon}>📅</Text>
              <Text style={styles.sectionTitle}>Schedule</Text>
            </View>
            <View style={styles.dateRow}>
              <TouchableOpacity style={[styles.dateButton, { flex: 1.5 }]} onPress={() => setShowDatePicker(true)}>
                <Text style={styles.dateButtonLabel}>Date</Text>
                <Text style={styles.dateButtonValue}>{formatDisplayDate(scheduledDate)}</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.dateButton, { flex: 1 }]} onPress={() => setShowTimePicker(true)}>
                <Text style={styles.dateButtonLabel}>Time</Text>
                <Text style={styles.dateButtonValue}>{formatDisplayTime(scheduledDate)}</Text>
              </TouchableOpacity>
            </View>
            {showDatePicker && (
              <DateTimePicker
                value={scheduledDate}
                mode="date"
                display={Platform.OS === 'ios' ? 'inline' : 'default'}
                minimumDate={new Date()}
                onChange={onDateChange}
              />
            )}
            {showTimePicker && (
              <DateTimePicker
                value={scheduledDate}
                mode="time"
                display={Platform.OS === 'ios' ? 'spinner' : 'default'}
                onChange={onTimeChange}
              />
            )}
          </View>

          {/* Duration */}
          <View style={styles.card}>
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionIcon}>⏱️</Text>
              <Text style={styles.sectionTitle}>Duration</Text>
            </View>
            <View style={styles.durationRow}>
              {DURATION_OPTIONS.map((opt) => (
                <TouchableOpacity
                  key={opt.label}
                  style={[
                    styles.durationChip,
                    form.hours_est === String(opt.hours) && styles.durationChipActive,
                  ]}
                  onPress={() => set('hours_est')(String(opt.hours))}
                >
                  <Text
                    style={[
                      styles.durationChipText,
                      form.hours_est === String(opt.hours) && styles.durationChipTextActive,
                    ]}
                  >
                    {opt.label}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>

          {/* Notes */}
          <View style={styles.card}>
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionIcon}>📝</Text>
              <Text style={styles.sectionTitle}>Job Description</Text>
            </View>
            <TextInput
              style={[styles.input, styles.textArea]}
              value={form.notes}
              onChangeText={set('notes')}
              placeholder="Describe the work in detail — materials needed, access info, etc."
              placeholderTextColor={colors.textMuted}
              multiline
              numberOfLines={4}
            />
          </View>

          {/* Recurring booking */}
          <View style={styles.card}>
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionIcon}>🔄</Text>
              <Text style={styles.sectionTitle}>Make this recurring?</Text>
            </View>
            <Text style={styles.recurSub}>Saves you rebooking every time</Text>
            <View style={styles.durationRow}>
              {RECURRENCE_OPTIONS.map((opt) => (
                <TouchableOpacity
                  key={opt.value}
                  style={[styles.durationChip, recurPattern === opt.value && styles.durationChipActive]}
                  onPress={() => setRecurPattern(recurPattern === opt.value ? null : opt.value)}
                >
                  <Text style={[styles.durationChipText, recurPattern === opt.value && styles.durationChipTextActive]}>
                    {opt.label}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
            {recurPattern && (
              <View style={styles.recurPreview}>
                <Text style={styles.recurPreviewTitle}>📅 Next 4 scheduled dates:</Text>
                {RECURRENCE_OPTIONS.find((o) => o.value === recurPattern) &&
                  Array.from({ length: 4 }).map((_, i) => {
                    const days = RECURRENCE_OPTIONS.find((o) => o.value === recurPattern).days;
                    const d = new Date(scheduledDate);
                    d.setDate(d.getDate() + days * (i + 1));
                    return (
                      <Text key={i} style={styles.recurDate}>
                        {i + 1}. {d.toLocaleDateString('en-ZA', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' })}
                      </Text>
                    );
                  })
                }
              </View>
            )}
          </View>

          {/* Price estimate */}
          {estimatedTotal != null && (
            <View style={styles.estimateCard}>
              <View>
                <Text style={styles.estimateLabel}>Price Estimate</Text>
                <Text style={styles.estimateSub}>
                  {hours}h × {formatZAR(labourer.hourly_rate)}/hr
                </Text>
              </View>
              <Text style={styles.estimateAmount}>{formatZAR(estimatedTotal)}</Text>
            </View>
          )}

          {/* Spacer for fixed button */}
          <View style={{ height: 100 }} />
        </ScrollView>

        {/* Fixed CTA */}
        <View style={styles.footer}>
          <TouchableOpacity style={styles.confirmBtn} onPress={handleBook} disabled={loading || recurLoading}>
            {loading || recurLoading ? (
              <ActivityIndicator color={colors.primary} />
            ) : (
              <Text style={styles.confirmBtnText}>
                Confirm Booking{estimatedTotal ? ` · ${formatZAR(estimatedTotal)}` : ''}
              </Text>
            )}
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f3f4f6' },
  profileStateContainer: {
    flex: 1,
    backgroundColor: '#F7F4EF',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  profileLoadingText: { color: '#4E5C57', fontSize: 14, lineHeight: 20, marginTop: 12 },
  profileStateCard: {
    width: '100%',
    maxWidth: 420,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#D6DED9',
    borderRadius: 24,
    padding: 24,
  },
  profileStateLabel: {
    color: '#12844E',
    fontSize: 12,
    lineHeight: 16,
    fontWeight: '800',
    letterSpacing: 1,
  },
  profileStateTitle: {
    color: '#0F1F1B',
    fontSize: 24,
    lineHeight: 30,
    fontWeight: '800',
    marginTop: 8,
  },
  profileStateDetail: {
    color: '#4E5C57',
    fontSize: 16,
    lineHeight: 24,
    marginTop: 12,
    marginBottom: 24,
  },
  profileRetryButton: {
    minHeight: 48,
    borderRadius: 12,
    backgroundColor: '#12844E',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 16,
  },
  profileRetryButtonText: { color: '#FFFFFF', fontSize: 16, lineHeight: 24, fontWeight: '700' },
  profileBackButton: {
    minHeight: 48,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#D6DED9',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 16,
    marginTop: 12,
  },
  profileBackButtonText: { color: '#0F1F1B', fontSize: 16, lineHeight: 24, fontWeight: '700' },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  backBtn: {
    width: 40,
    height: 40,
    borderRadius: borderRadius.full,
    backgroundColor: '#f3f4f6',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: spacing.sm,
  },
  backBtnText: { fontSize: typography.xl, color: colors.textPrimary },
  headerTitle: { fontSize: typography.lg, fontWeight: '800', color: colors.textPrimary },
  headerSub: { fontSize: typography.sm, color: colors.success, fontWeight: '600' },
  scroll: { padding: spacing.md },
  errorBanner: {
    backgroundColor: colors.dangerLight,
    borderRadius: borderRadius.sm,
    padding: spacing.sm,
    marginBottom: spacing.md,
  },
  errorText: { color: colors.danger, fontSize: typography.sm },
  card: {
    backgroundColor: '#fff',
    borderRadius: borderRadius.md,
    padding: spacing.md,
    marginBottom: spacing.sm,
    ...shadows.card,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginBottom: spacing.sm,
  },
  sectionIcon: { fontSize: 18 },
  sectionTitle: {
    fontSize: typography.md,
    fontWeight: '700',
    color: colors.textPrimary,
  },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  chip: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs + 2,
    borderRadius: borderRadius.full,
    backgroundColor: '#f3f4f6',
    borderWidth: 1,
    borderColor: colors.border,
  },
  chipActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  chipText: { fontSize: typography.sm, color: colors.textSecondary, fontWeight: '500' },
  chipTextActive: { color: '#fff' },
  input: {
    backgroundColor: '#f9fafb',
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: borderRadius.sm,
    padding: spacing.sm + 4,
    fontSize: typography.md,
    color: colors.textPrimary,
  },
  textArea: { height: 90, textAlignVertical: 'top' },
  dateRow: { flexDirection: 'row', gap: spacing.sm },
  dateButton: {
    backgroundColor: '#f9fafb',
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: borderRadius.sm,
    padding: spacing.sm + 4,
  },
  dateButtonLabel: {
    fontSize: typography.xs,
    color: colors.textMuted,
    fontWeight: '600',
    textTransform: 'uppercase',
    marginBottom: 2,
  },
  dateButtonValue: { fontSize: typography.sm, color: colors.textPrimary, fontWeight: '600' },
  durationRow: { flexDirection: 'row', gap: spacing.sm },
  durationChip: {
    flex: 1,
    paddingVertical: spacing.sm + 2,
    borderRadius: borderRadius.sm,
    backgroundColor: '#f3f4f6',
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
  },
  durationChipActive: { backgroundColor: colors.accent, borderColor: colors.accent },
  durationChipText: { fontSize: typography.sm, fontWeight: '700', color: colors.textSecondary },
  durationChipTextActive: { color: colors.primary },
  estimateCard: {
    backgroundColor: colors.primary,
    borderRadius: borderRadius.md,
    padding: spacing.md,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.sm,
    ...shadows.card,
  },
  estimateLabel: { fontSize: typography.md, fontWeight: '700', color: '#fff' },
  estimateSub: { fontSize: typography.xs, color: colors.textMuted, marginTop: 2 },
  estimateAmount: { fontSize: typography.xxl, fontWeight: '900', color: colors.accent },
  footer: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: '#fff',
    padding: spacing.md,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    ...shadows.upward,
  },
  confirmBtn: {
    backgroundColor: colors.accent,
    borderRadius: borderRadius.lg,
    paddingVertical: spacing.md,
    alignItems: 'center',
    ...shadows.card,
  },
  confirmBtnText: { color: colors.primary, fontSize: typography.lg, fontWeight: '800' },
  recurSub: { fontSize: typography.sm, color: colors.textMuted, marginBottom: spacing.sm },
  recurPreview: {
    marginTop: spacing.sm,
    backgroundColor: '#f9fafb',
    borderRadius: borderRadius.sm,
    padding: spacing.sm,
  },
  recurPreviewTitle: { fontSize: typography.xs, fontWeight: '700', color: colors.textSecondary, marginBottom: 4 },
  recurDate: { fontSize: typography.xs, color: colors.textMuted, paddingVertical: 2 },
});
