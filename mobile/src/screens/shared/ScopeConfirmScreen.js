import React, { useState, useEffect } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TextInput, Modal, TouchableOpacity,
  ActivityIndicator, Alert, StatusBar,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useSelector } from 'react-redux';
import api from '../../services/api';
import { bookingService } from '../../services/bookingService';
import { colors, typography, spacing, borderRadius, shadows } from '../../theme';

const DEFAULT_SCOPE_ITEMS = [
  'The work location and access requirements are understood',
  'Who supplies materials and tools has been agreed',
  'Included work and exclusions have been agreed',
  'Cleanup expectations have been agreed',
  'Completion and sign-off expectations have been agreed',
];

function formatApproxArea(item) {
  const lat = Number(item?.approx_lat);
  const lng = Number(item?.approx_lng);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  const label = item.location_precision === 'approximate' ? 'Approx. area' : 'Area';
  return `${label}: ${lat.toFixed(2)}, ${lng.toFixed(2)}`;
}

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
  const [loadError, setLoadError] = useState('');
  const [confirming, setConfirming] = useState(false);
  const [checkedItems, setCheckedItems] = useState({});
  const [changeModal, setChangeModal] = useState(false);
  const [changeText, setChangeText] = useState('');

  useEffect(() => {
    loadBooking();
  }, [bookingId]);

  async function loadBooking() {
    try {
      const res = await bookingService.getBooking(bookingId);
      setBooking(res.booking);
      setLoadError('');
      // A green check must reflect an explicit user choice. Never infer
      // agreement from loading the screen or from fallback prompts.
      const scopeItems = res.booking.scope_items?.length
        ? res.booking.scope_items
        : DEFAULT_SCOPE_ITEMS;
      const init = {};
      scopeItems.forEach((_, i) => { init[i] = false; });
      setCheckedItems(init);
    } catch (err) {
      setLoadError(err.message || 'Could not load booking details.');
    } finally {
      setLoading(false);
    }
  }

  const isCustomer = user?.role === 'customer';
  const hasConfirmed = isCustomer
    ? booking?.scope_confirmed_by_customer
    : booking?.scope_confirmed_by_labourer;

  const otherConfirmed = isCustomer
    ? booking?.scope_confirmed_by_labourer
    : booking?.scope_confirmed_by_customer;

  const scopeItems = booking?.scope_items?.length
    ? booking.scope_items
    : DEFAULT_SCOPE_ITEMS;
  const hasServerScopeItems = !!booking?.scope_items?.length;
  const locationText = booking?.address || formatApproxArea(booking) || 'Location hidden until accepted';
  const bothConfirmed = booking?.scope_confirmed_by_customer
    && booking?.scope_confirmed_by_labourer;

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
      const scopeReady = res.data.booking.scope_confirmed_by_customer
        && res.data.booking.scope_confirmed_by_labourer;
      if (scopeReady) {
        Alert.alert(
          'Scope confirmed',
          isCustomer
            ? 'Both parties agreed. Share the start PIN only when you are ready for work to begin.'
            : 'Both parties agreed. Return to the job and enter the PIN shown to the customer.',
          [{
            text: 'OK',
          }]
        );
      } else {
        Alert.alert(
          'Scope confirmed',
          `You've confirmed the scope. Waiting for ${isCustomer ? 'the worker' : 'the customer'} to confirm.`
        );
      }
    } catch (err) {
      Alert.alert('Error', err.response?.data?.error || 'Could not confirm scope.');
    } finally {
      setConfirming(false);
    }
  }

  function handleRequestChange() {
    setChangeText('');
    setChangeModal(true);
  }

  function submitScopeChange() {
    if (!changeText.trim()) return;
    setChangeModal(false);
    navigation.navigate('Chat', {
      bookingId,
      otherPartyName: isCustomer ? booking?.labourer_name : booking?.customer_name,
      bookingStatus: booking?.status,
      prefillMessage: `📝 Scope Change Request: ${changeText.trim()}`,
    });
    setChangeText('');
  }

  if (loading) {
    return (
      <View style={styles.loading}>
        <ActivityIndicator color={colors.accent} size="large" />
      </View>
    );
  }

  if (!booking) {
    return (
      <View style={styles.loadErrorContainer}>
        <Text style={styles.loadErrorTitle}>Scope unavailable</Text>
        <Text style={styles.loadErrorText}>{loadError || 'Reconnect and try again.'}</Text>
        <TouchableOpacity style={styles.retryBtn} onPress={loadBooking}>
          <Text style={styles.retryBtnText}>Retry</Text>
        </TouchableOpacity>
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

          {booking._offline && (
            <View style={styles.offlineBanner}>
              <Text style={styles.offlineTitle}>Cached scope</Text>
              <Text style={styles.offlineText}>Reconnect and refresh before confirming anything.</Text>
            </View>
          )}

          {bothConfirmed && (
            <View style={styles.startCard}>
              <Text style={styles.startCardEyebrow}>READY TO START</Text>
              {isCustomer && booking.start_pin ? (
                <>
                  <Text style={styles.startPin}>{booking.start_pin}</Text>
                  <Text style={styles.startCardText}>
                    Share this PIN with the worker only when the agreed work is ready to begin.
                  </Text>
                </>
              ) : (
                <Text style={styles.startCardText}>
                  Ask the customer for the 6-digit start PIN, then enter it from the job screen.
                </Text>
              )}
            </View>
          )}

          {/* Job details card */}
          <View style={styles.card}>
            <Text style={styles.cardTitle}>Booking details</Text>
            <View style={styles.jobMeta}>
              <Text style={styles.metaLabel}>With: </Text>
              <Text style={styles.metaValue}>
                {isCustomer ? booking.labourer_name : booking.customer_name}
              </Text>
            </View>
            <View style={styles.jobMeta}>
              <Text style={styles.metaLabel}>📍 </Text>
              <Text style={styles.metaValue}>{locationText}</Text>
            </View>
            {booking.notes ? (
              <View style={styles.noteBox}>
                <Text style={styles.noteText}>{booking.notes}</Text>
              </View>
            ) : null}
          </View>

          {/* Scope checklist */}
          <View style={styles.card}>
            <Text style={styles.cardTitle}>
              {hasServerScopeItems ? 'Scope items to confirm' : 'Scope prompts to review together'}
            </Text>
            <Text style={styles.cardSubtitle}>
              {hasServerScopeItems
                ? 'Tick each item only after you have actually agreed it.'
                : 'These are prompts, not an agreed scope. Discuss them, then tick only what you both agree.'}
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
                  You've confirmed. {otherConfirmed ? 'Both parties agree; the start PIN is now required.' : 'Waiting for the other party…'}
                </Text>
              </View>
            ) : (
              <TouchableOpacity
                style={[styles.confirmBtn, (!allChecked || booking._offline) && styles.confirmBtnDisabled]}
                onPress={handleConfirm}
                disabled={confirming || !allChecked || booking._offline}
              >
                {confirming
                  ? <ActivityIndicator color={colors.primary} />
                  : <Text style={styles.confirmBtnText}>Confirm agreed scope</Text>
                }
              </TouchableOpacity>
            )}

            <TouchableOpacity style={styles.changeBtn} onPress={handleRequestChange}>
              <Text style={styles.changeBtnText}>📝  Request Scope Change</Text>
            </TouchableOpacity>
          </View>

          <View style={{ height: 32 }} />
        </ScrollView>

        <Modal
          visible={changeModal}
          transparent
          animationType="fade"
          onRequestClose={() => setChangeModal(false)}
        >
          <View style={styles.modalBackdrop}>
            <View style={styles.modalCard}>
              <Text style={styles.modalTitle}>Request a scope change</Text>
              <Text style={styles.modalText}>
                Describe the change clearly. It will open in chat for the other person to review.
              </Text>
              <TextInput
                style={styles.changeInput}
                value={changeText}
                onChangeText={setChangeText}
                placeholder="What needs to change?"
                placeholderTextColor="#7B827E"
                multiline
                autoFocus
              />
              <View style={styles.modalActions}>
                <TouchableOpacity style={styles.modalCancel} onPress={() => setChangeModal(false)}>
                  <Text style={styles.modalCancelText}>Keep current scope</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.modalSubmit, !changeText.trim() && styles.confirmBtnDisabled]}
                  onPress={submitScopeChange}
                  disabled={!changeText.trim()}
                >
                  <Text style={styles.modalSubmitText}>Open in chat</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </Modal>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F7F4EF' },
  loading: { flex: 1, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center' },
  loadErrorContainer: {
    flex: 1,
    backgroundColor: '#F7F4EF',
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.xl,
  },
  loadErrorTitle: { color: '#0F1F1B', fontSize: typography.xl, fontWeight: '900' },
  loadErrorText: { color: '#64706B', fontSize: typography.sm, lineHeight: 20, textAlign: 'center', marginTop: spacing.sm },
  retryBtn: { backgroundColor: '#12844E', borderRadius: borderRadius.md, paddingHorizontal: spacing.lg, paddingVertical: spacing.sm + 4, marginTop: spacing.lg },
  retryBtnText: { color: '#FFFFFF', fontSize: typography.sm, fontWeight: '800' },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    backgroundColor: '#0F1F1B',
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
    backgroundColor: '#0F1F1B',
    borderRadius: borderRadius.md,
    padding: spacing.md,
    marginBottom: spacing.sm,
    gap: spacing.sm,
  },
  startCard: {
    backgroundColor: '#FFF3D5',
    borderRadius: borderRadius.md,
    padding: spacing.md,
    marginBottom: spacing.sm,
    borderWidth: 1,
    borderColor: '#E9CF8F',
  },
  startCardEyebrow: { color: '#12844E', fontSize: typography.xs, fontWeight: '900', letterSpacing: 1.2 },
  startPin: { color: '#0F1F1B', fontSize: 34, fontWeight: '900', letterSpacing: 8, marginVertical: spacing.sm },
  startCardText: { color: '#495650', fontSize: typography.sm, lineHeight: 20 },
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
  offlineBanner: {
    backgroundColor: '#FFF3D5',
    borderRadius: borderRadius.md,
    padding: spacing.sm,
    borderWidth: 1,
    borderColor: '#E9CF8F',
    marginBottom: spacing.sm,
  },
  offlineTitle: { color: '#0F1F1B', fontSize: typography.sm, fontWeight: '800' },
  offlineText: { color: '#64706B', fontSize: typography.xs, marginTop: 2 },

  card: {
    backgroundColor: '#FFFCF7',
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
    backgroundColor: '#12844E',
    borderRadius: borderRadius.lg,
    paddingVertical: spacing.md,
    alignItems: 'center',
    ...shadows.card,
  },
  confirmBtnDisabled: { backgroundColor: colors.border },
  confirmBtnText: { color: '#FFFFFF', fontWeight: '800', fontSize: typography.lg },
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
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(15,31,27,0.55)',
    justifyContent: 'center',
    padding: spacing.lg,
  },
  modalCard: {
    backgroundColor: '#FFFCF7',
    borderRadius: borderRadius.lg,
    padding: spacing.lg,
    ...shadows.heavy,
  },
  modalTitle: { color: '#0F1F1B', fontSize: typography.lg, fontWeight: '900' },
  modalText: { color: '#64706B', fontSize: typography.sm, lineHeight: 20, marginTop: spacing.xs },
  changeInput: {
    minHeight: 112,
    backgroundColor: '#F7F4EF',
    borderRadius: borderRadius.md,
    borderWidth: 1,
    borderColor: '#DDD8CF',
    color: '#0F1F1B',
    padding: spacing.md,
    marginTop: spacing.md,
    textAlignVertical: 'top',
  },
  modalActions: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.md },
  modalCancel: { flex: 1, paddingVertical: spacing.sm + 4, alignItems: 'center' },
  modalCancelText: { color: '#64706B', fontSize: typography.sm, fontWeight: '700' },
  modalSubmit: {
    flex: 1,
    backgroundColor: '#12844E',
    borderRadius: borderRadius.md,
    paddingVertical: spacing.sm + 4,
    alignItems: 'center',
  },
  modalSubmitText: { color: '#FFFFFF', fontSize: typography.sm, fontWeight: '800' },
});
