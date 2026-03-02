import React, { useState, useEffect } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  ActivityIndicator, Alert, StatusBar,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useSelector } from 'react-redux';
import api from '../../services/api';
import { bookingService } from '../../services/bookingService';
import { colors, typography, spacing, borderRadius, shadows } from '../../theme';

const DEFAULT_SCOPE_ITEMS = [
  'Assess the site and confirm requirements',
  'Obtain all necessary materials/tools',
  'Complete the agreed work to specification',
  'Clean up work area on completion',
  'Customer inspection and sign-off',
];

function CheckItem({ item, checked, onToggle, disabled }) {
  return (
    <TouchableOpacity
      style={[styles.checkItem, checked && styles.checkItemChecked, disabled && styles.checkItemDisabled]}
      onPress={onToggle}
      disabled={disabled}
      activeOpacity={0.7}
    >
      <View style={[styles.checkbox, checked && styles.checkboxChecked]}>
        {checked && <Text style={styles.checkmark}>✓</Text>}
      </View>
      <Text style={[styles.checkItemText, checked && styles.checkItemTextChecked]}>{item}</Text>
    </TouchableOpacity>
  );
}

export default function ScopeConfirmScreen({ route, navigation }) {
  const { bookingId } = route.params;
  const { user } = useSelector((s) => s.auth);

  const [booking, setBooking] = useState(null);
  const [loading, setLoading] = useState(true);
  const [confirming, setConfirming] = useState(false);
  const [checkedItems, setCheckedItems] = useState({});

  useEffect(() => {
    loadBooking();
  }, [bookingId]);

  async function loadBooking() {
    try {
      const res = await bookingService.getBooking(bookingId);
      setBooking(res.booking);
      // Initialise all items checked
      const scopeItems = res.booking.scope_items?.length
        ? res.booking.scope_items
        : DEFAULT_SCOPE_ITEMS;
      const init = {};
      scopeItems.forEach((_, i) => { init[i] = true; });
      setCheckedItems(init);
    } catch {
      Alert.alert('Error', 'Could not load booking details.');
    } finally {
      setLoading(false);
    }
  }

  const isCustomer = user?.role === 'customer';
  const isLabourer = user?.role === 'labourer';

  const hasConfirmed = isCustomer
    ? booking?.scope_confirmed_by_customer
    : booking?.scope_confirmed_by_labourer;

  const otherConfirmed = isCustomer
    ? booking?.scope_confirmed_by_labourer
    : booking?.scope_confirmed_by_customer;

  const scopeItems = booking?.scope_items?.length
    ? booking.scope_items
    : DEFAULT_SCOPE_ITEMS;

  const allChecked = scopeItems.every((_, i) => checkedItems[i]);

  async function handleConfirm() {
    if (!allChecked) {
      Alert.alert('Check all items', 'Please tick each scope item before confirming.');
      return;
    }
    setConfirming(true);
    try {
      const res = await api.patch(`/api/bookings/${bookingId}/confirm-scope`);
      setBooking(res.data.booking);
      if (res.data.booking.status === 'in_progress') {
        Alert.alert(
          '🚀 Job Started!',
          'Both parties confirmed. The job is now in progress.',
          [{
            text: 'Go to Job',
            onPress: () => {
              if (isLabourer) {
                navigation.replace('ActiveJob', { bookingId });
              } else {
                navigation.replace('ActiveBooking', { bookingId });
              }
            },
          }]
        );
      } else {
        Alert.alert(
          '✅ Confirmed!',
          `You've confirmed the scope. Waiting for ${isCustomer ? 'the worker' : 'the customer'} to confirm.`
        );
      }
    } catch (err) {
      Alert.alert('Error', err.response?.data?.error || 'Could not confirm scope.');
    } finally {
      setConfirming(false);
    }
  }

  async function handleRequestChange() {
    Alert.prompt(
      '📝 Request Scope Change',
      'Describe what needs to change:',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Send Request',
          onPress: (text) => {
            if (!text?.trim()) return;
            navigation.navigate('Chat', {
              bookingId,
              otherPartyName: isCustomer ? booking?.labourer_name : booking?.customer_name,
              bookingStatus: booking?.status,
              prefillMessage: `📝 Scope Change Request: ${text.trim()}`,
            });
          },
        },
      ],
      'plain-text'
    );
  }

  if (loading || !booking) {
    return (
      <View style={styles.loading}>
        <ActivityIndicator color={colors.accent} size="large" />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" />
      <SafeAreaView style={{ flex: 1 }}>
        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
            <Text style={styles.backBtnText}>←</Text>
          </TouchableOpacity>
          <View style={{ flex: 1 }}>
            <Text style={styles.headerTitle}>Confirm Job Scope</Text>
            <Text style={styles.headerSub}>{booking.skill_needed}</Text>
          </View>
        </View>

        <ScrollView contentContainerStyle={styles.scroll}>
          {/* Confirmation status banner */}
          <View style={styles.statusBanner}>
            <View style={styles.statusRow}>
              <View style={[styles.statusDot, booking.scope_confirmed_by_customer && styles.statusDotDone]} />
              <Text style={styles.statusLabel}>Customer confirmed</Text>
              <Text style={styles.statusValue}>
                {booking.scope_confirmed_by_customer ? '✅' : '⏳'}
              </Text>
            </View>
            <View style={styles.statusRow}>
              <View style={[styles.statusDot, booking.scope_confirmed_by_labourer && styles.statusDotDone]} />
              <Text style={styles.statusLabel}>Worker confirmed</Text>
              <Text style={styles.statusValue}>
                {booking.scope_confirmed_by_labourer ? '✅' : '⏳'}
              </Text>
            </View>
          </View>

          {/* Job details card */}
          <View style={styles.card}>
            <Text style={styles.cardTitle}>📋 Agreed Work</Text>
            <View style={styles.jobMeta}>
              <Text style={styles.metaLabel}>With: </Text>
              <Text style={styles.metaValue}>
                {isCustomer ? booking.labourer_name : booking.customer_name}
              </Text>
            </View>
            <View style={styles.jobMeta}>
              <Text style={styles.metaLabel}>📍 </Text>
              <Text style={styles.metaValue}>{booking.address}</Text>
            </View>
            {booking.notes ? (
              <View style={styles.noteBox}>
                <Text style={styles.noteText}>{booking.notes}</Text>
              </View>
            ) : null}
          </View>

          {/* Scope checklist */}
          <View style={styles.card}>
            <Text style={styles.cardTitle}>✅ Scope Checklist</Text>
            <Text style={styles.cardSubtitle}>
              Tick each item to confirm what was agreed
            </Text>
            {scopeItems.map((item, i) => (
              <CheckItem
                key={i}
                item={item}
                checked={!!checkedItems[i]}
                onToggle={() => {
                  if (hasConfirmed) return;
                  setCheckedItems((prev) => ({ ...prev, [i]: !prev[i] }));
                }}
                disabled={!!hasConfirmed}
              />
            ))}
          </View>

          {/* Action area */}
          <View style={styles.actions}>
            {hasConfirmed ? (
              <View style={styles.confirmedBanner}>
                <Text style={styles.confirmedText}>
                  ✅ You've confirmed. {otherConfirmed ? 'Job started!' : 'Waiting for the other party…'}
                </Text>
              </View>
            ) : (
              <TouchableOpacity
                style={[styles.confirmBtn, !allChecked && styles.confirmBtnDisabled]}
                onPress={handleConfirm}
                disabled={confirming || !allChecked}
              >
                {confirming
                  ? <ActivityIndicator color={colors.primary} />
                  : <Text style={styles.confirmBtnText}>✅  Confirm & Start Job</Text>
                }
              </TouchableOpacity>
            )}

            <TouchableOpacity style={styles.changeBtn} onPress={handleRequestChange}>
              <Text style={styles.changeBtnText}>📝  Request Scope Change</Text>
            </TouchableOpacity>
          </View>

          <View style={{ height: 32 }} />
        </ScrollView>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f3f4f6' },
  loading: { flex: 1, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center' },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    backgroundColor: colors.primary,
    gap: spacing.sm,
  },
  backBtn: {
    width: 36, height: 36,
    borderRadius: borderRadius.full,
    backgroundColor: 'rgba(255,255,255,0.1)',
    alignItems: 'center', justifyContent: 'center',
  },
  backBtnText: { fontSize: typography.xl, color: '#fff' },
  headerTitle: { fontSize: typography.md, fontWeight: '800', color: '#fff' },
  headerSub: { fontSize: typography.sm, color: colors.accent },
  scroll: { padding: spacing.md },

  statusBanner: {
    backgroundColor: colors.primary,
    borderRadius: borderRadius.md,
    padding: spacing.md,
    marginBottom: spacing.sm,
    gap: spacing.sm,
  },
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  statusDot: {
    width: 10, height: 10,
    borderRadius: borderRadius.full,
    backgroundColor: colors.border,
  },
  statusDotDone: { backgroundColor: colors.success },
  statusLabel: { flex: 1, color: '#fff', fontSize: typography.sm },
  statusValue: { fontSize: typography.md },

  card: {
    backgroundColor: '#fff',
    borderRadius: borderRadius.md,
    padding: spacing.md,
    marginBottom: spacing.sm,
    ...shadows.card,
  },
  cardTitle: { fontSize: typography.md, fontWeight: '800', color: colors.textPrimary, marginBottom: spacing.xs },
  cardSubtitle: { fontSize: typography.sm, color: colors.textMuted, marginBottom: spacing.sm },
  jobMeta: { flexDirection: 'row', marginBottom: spacing.xs },
  metaLabel: { fontSize: typography.sm, color: colors.textMuted, fontWeight: '600' },
  metaValue: { flex: 1, fontSize: typography.sm, color: colors.textPrimary },
  noteBox: {
    backgroundColor: '#f9fafb',
    borderRadius: borderRadius.sm,
    padding: spacing.sm,
    marginTop: spacing.xs,
  },
  noteText: { fontSize: typography.sm, color: colors.textSecondary, lineHeight: 20 },

  checkItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.sm,
    borderRadius: borderRadius.sm,
    marginBottom: spacing.xs,
    backgroundColor: '#f9fafb',
    borderWidth: 1,
    borderColor: colors.border,
    gap: spacing.sm,
  },
  checkItemChecked: {
    backgroundColor: colors.successLight,
    borderColor: colors.success,
  },
  checkItemDisabled: { opacity: 0.7 },
  checkbox: {
    width: 24, height: 24,
    borderRadius: 6,
    borderWidth: 2,
    borderColor: colors.border,
    alignItems: 'center', justifyContent: 'center',
    backgroundColor: '#fff',
  },
  checkboxChecked: {
    backgroundColor: colors.success,
    borderColor: colors.success,
  },
  checkmark: { color: '#fff', fontSize: 14, fontWeight: '900' },
  checkItemText: { flex: 1, fontSize: typography.sm, color: colors.textSecondary, lineHeight: 20 },
  checkItemTextChecked: { color: colors.successDark },

  actions: { gap: spacing.sm, marginTop: spacing.sm },
  confirmBtn: {
    backgroundColor: colors.accent,
    borderRadius: borderRadius.lg,
    paddingVertical: spacing.md,
    alignItems: 'center',
    ...shadows.card,
  },
  confirmBtnDisabled: { backgroundColor: colors.border },
  confirmBtnText: { color: colors.primary, fontWeight: '800', fontSize: typography.lg },
  confirmedBanner: {
    backgroundColor: colors.successLight,
    borderRadius: borderRadius.md,
    padding: spacing.md,
    alignItems: 'center',
  },
  confirmedText: { color: colors.successDark, fontWeight: '700', fontSize: typography.sm, textAlign: 'center' },
  changeBtn: {
    borderWidth: 1.5,
    borderColor: colors.textMuted,
    borderRadius: borderRadius.md,
    paddingVertical: spacing.sm + 2,
    alignItems: 'center',
  },
  changeBtnText: { color: colors.textSecondary, fontWeight: '600', fontSize: typography.sm },
});
