import React, { useState, useEffect } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, ScrollView,
  StyleSheet, SafeAreaView, Alert, ActivityIndicator, Platform, StatusBar,
} from 'react-native';
import DateTimePicker from '@react-native-community/datetimepicker';
import { useDispatch, useSelector } from 'react-redux';
import { createBookingThunk } from '../../store/bookingSlice';
import { locationService } from '../../services/locationService';
import { formatZAR } from '../../utils/formatters';
import { colors, typography, spacing, borderRadius, shadows } from '../../theme';

const DURATION_OPTIONS = [
  { label: '2h', hours: 2 },
  { label: '4h', hours: 4 },
  { label: '8h', hours: 8 },
  { label: 'Full day', hours: 10 },
];

export default function BookingFormScreen({ route, navigation }) {
  const { labourer } = route.params;
  const dispatch = useDispatch();
  const { loading, error } = useSelector((s) => s.booking);

  const [form, setForm] = useState({
    skill_needed: labourer.skills?.[0] || '',
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

  useEffect(() => {
    locationService.getCurrentPosition().then((pos) => {
      setForm((f) => ({ ...f, location_lat: pos.lat, location_lng: pos.lng }));
    }).catch(() => {});
  }, []);

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
      navigation.replace('ActiveBooking', { bookingId: result.payload.booking.id });
    }
  }

  return (
    <View style={styles.container}>
      <StatusBar barStyle="dark-content" />
      <SafeAreaView style={{ flex: 1 }}>
        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
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
          <TouchableOpacity style={styles.confirmBtn} onPress={handleBook} disabled={loading}>
            {loading ? (
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
});
