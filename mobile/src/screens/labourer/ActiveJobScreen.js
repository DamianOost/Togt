import React, { useEffect, useRef, useState } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, ActivityIndicator,
  Alert, ScrollView, StatusBar, Linking, Share, TextInput, Modal,
} from 'react-native';
import MapView, { Marker } from 'react-native-maps';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useSelector } from 'react-redux';
import { bookingService } from '../../services/bookingService';
import { locationService } from '../../services/locationService';
import { socketService } from '../../services/socketService';
import { formatDateTime, formatZAR } from '../../utils/formatters';
import { colors, typography, spacing, borderRadius, shadows, darkMapStyle } from '../../theme';
import api from '../../services/api';
import {
  capabilityEnabled,
  failClosedCapabilities,
  getEffectiveCapabilities,
} from '../../services/capabilityService';

const STATUS_STEPS = [
  { key: 'accepted', label: 'Accepted', icon: '✅' },
  { key: 'en_route', label: 'En Route', icon: '🚶' },
  { key: 'arrived', label: 'Arrived', icon: '📍' },
  { key: 'in_progress', label: 'Working', icon: '🔧' },
  { key: 'completed', label: 'Complete', icon: '🎉' },
];

const BACKEND_STATUS_MAP = {
  accepted: 0, in_progress: 3, completed: 4,
};

function formatApproxArea(item) {
  const lat = Number(item?.approx_lat);
  const lng = Number(item?.approx_lng);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  const label = item.location_precision === 'approximate' ? 'Approx. area' : 'Area';
  return `${label}: ${lat.toFixed(2)}, ${lng.toFixed(2)}`;
}

function StatusTimeline({ currentStatus }) {
  const currentIdx = BACKEND_STATUS_MAP[currentStatus] ?? 0;
  return (
    <View style={timelineStyles.container}>
      {STATUS_STEPS.map((step, i) => {
        const done = i < currentIdx;
        const active = i === currentIdx;
        return (
          <View key={step.key} style={timelineStyles.step}>
            <View style={[
              timelineStyles.dot,
              done && timelineStyles.dotDone,
              active && timelineStyles.dotActive,
            ]}>
              <Text style={timelineStyles.dotIcon}>{done ? '✓' : step.icon}</Text>
            </View>
            {i < STATUS_STEPS.length - 1 && (
              <View style={[timelineStyles.line, done && timelineStyles.lineDone]} />
            )}
            <Text style={[timelineStyles.label, active && timelineStyles.labelActive]}>
              {step.label}
            </Text>
          </View>
        );
      })}
    </View>
  );
}

const timelineStyles = StyleSheet.create({
  container: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: spacing.sm },
  step: { alignItems: 'center', flex: 1, position: 'relative' },
  dot: {
    width: 32, height: 32, borderRadius: borderRadius.full,
    backgroundColor: colors.border, alignItems: 'center', justifyContent: 'center', marginBottom: 4,
  },
  dotDone: { backgroundColor: colors.success },
  dotActive: { backgroundColor: colors.accent, ...shadows.card },
  dotIcon: { fontSize: 12 },
  line: {
    position: 'absolute', top: 15, left: '60%', right: '-60%',
    height: 2, backgroundColor: colors.border, zIndex: -1,
  },
  lineDone: { backgroundColor: colors.success },
  label: { fontSize: 9, color: colors.textMuted, textAlign: 'center' },
  labelActive: { color: colors.accent, fontWeight: '700', fontSize: 10 },
});

function EmergencyHelpButton({ onPress }) {
  return (
    <TouchableOpacity
      style={sosStyles.btn}
      onPress={onPress}
    >
      <Text style={sosStyles.text}>Emergency help</Text>
      <Text style={sosStyles.subtext}>Direct call only — TOGT does not dispatch emergencies</Text>
    </TouchableOpacity>
  );
}
const sosStyles = StyleSheet.create({
  btn: {
    backgroundColor: colors.dangerLight, borderRadius: borderRadius.sm,
    paddingVertical: spacing.sm, alignItems: 'center', overflow: 'hidden',
    borderWidth: 1.5, borderColor: colors.danger,
  },
  text: { color: colors.danger, fontWeight: '800', fontSize: typography.sm },
  subtext: { color: colors.dangerDark, fontSize: typography.xs, marginTop: 2, textAlign: 'center' },
});

export default function ActiveJobScreen({ route, navigation }) {
  const { bookingId } = route.params;
  const { accessToken } = useSelector((s) => s.auth);
  const [booking, setBooking] = useState(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [myLocation, setMyLocation] = useState(null);
  const [capabilities, setCapabilities] = useState(
    failClosedCapabilities('capability_check_pending')
  );
  const [changeOrderText, setChangeOrderText] = useState('');
  const [changeOrderHours, setChangeOrderHours] = useState('');
  const [changeOrderModal, setChangeOrderModal] = useState(false);
  const [changeOrderSubmitting, setChangeOrderSubmitting] = useState(false);
  const [startPin, setStartPin] = useState('');
  const [startPinModal, setStartPinModal] = useState(false);
  const [starting, setStarting] = useState(false);
  const watchRef = useRef(null);

  useEffect(() => {
    loadBooking();
    const poll = setInterval(loadBooking, 15000);
    return () => {
      clearInterval(poll);
    };
  }, [bookingId]);

  useEffect(() => {
    let active = true;
    getEffectiveCapabilities().then((result) => {
      if (active) setCapabilities(result);
    });
    return () => { active = false; };
  }, []);

  const canShareForegroundLocation = capabilityEnabled(capabilities, 'foreground_location_updates');

  useEffect(() => {
    if (!canShareForegroundLocation || !accessToken) {
      stopLocationSharing();
      return undefined;
    }
    startLocationSharing();
    return stopLocationSharing;
  }, [bookingId, accessToken, canShareForegroundLocation]);

  async function loadBooking() {
    try {
      const res = await bookingService.getBooking(bookingId);
      setBooking(res.booking);
      setLoadError('');
    } catch (err) {
      if (!booking) setLoadError(err.message || 'Could not load this job.');
    } finally {
      setLoading(false);
    }
  }

  async function startLocationSharing() {
    const granted = await locationService.requestPermission();
    if (!granted) return;
    socketService.connect(accessToken);
    socketService.joinBooking(bookingId);
    const sub = await locationService.watchPosition(({ lat, lng }) => {
      setMyLocation({ lat, lng });
      socketService.sendLocation(bookingId, lat, lng);
    });
    watchRef.current = sub;
  }

  function stopLocationSharing() {
    watchRef.current?.remove?.();
    watchRef.current = null;
    socketService.disconnect();
  }

  async function handleStart() {
    if (!/^\d{6}$/.test(startPin)) {
      Alert.alert('Start PIN required', 'Enter the 6-digit PIN shown to the customer.');
      return;
    }
    setStarting(true);
    try {
      const res = await bookingService.start(bookingId, startPin);
      setBooking(res.booking);
      setStartPin('');
      setStartPinModal(false);
    } catch (err) {
      Alert.alert('Could not start job', err.response?.data?.detail || err.message || 'Please try again.');
    } finally {
      setStarting(false);
    }
  }

  async function handleComplete() {
    Alert.alert('Complete Job', 'Confirm that the work is done?', [
      { text: 'Not yet' },
      {
        text: 'Yes, Complete!',
        onPress: async () => {
          try {
            const res = await bookingService.complete(bookingId);
            setBooking(res.booking);
          } catch (err) {
            Alert.alert('Error', err.response?.data?.error || 'Could not complete job.');
          }
        },
      },
    ]);
  }

  async function handleShareTrip() {
    if (!capabilityEnabled(capabilities, 'booking_details_share')) return;
    try {
      const res = await api.post(`/api/bookings/${bookingId}/share-trip`);
      await Share.share({ message: res.data.shareText });
    } catch {
      Alert.alert('Share', 'Could not generate share link.');
    }
  }

  function handleEmergencyHelp() {
    Alert.alert(
      'Emergency help',
      'TOGT does not monitor or dispatch emergencies in this build. Call emergency services directly if you are in danger.',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Call 112', onPress: () => Linking.openURL('tel:112') },
        { text: 'Call SAPS 10111', onPress: () => Linking.openURL('tel:10111') },
      ]
    );
  }

  function handleChangeOrder() {
    setChangeOrderText('');
    setChangeOrderHours('');
    setChangeOrderModal(true);
  }

  async function submitChangeOrder() {
    if (!changeOrderText.trim()) return;
    setChangeOrderSubmitting(true);
    try {
      await api.post(`/api/bookings/${bookingId}/change-order`, {
        description: changeOrderText.trim(),
        extra_hours: parseFloat(changeOrderHours) || null,
      });
      setChangeOrderModal(false);
      Alert.alert('Change requested', 'The customer can now review the additional work.');
    } catch (err) {
      Alert.alert('Error', err.response?.data?.error || 'Could not send request.');
    } finally {
      setChangeOrderSubmitting(false);
    }
  }

  function callCustomer() {
    if (booking?.customer_phone) {
      Linking.openURL(`tel:${booking.customer_phone}`);
    } else {
      Alert.alert('Contact', 'Customer phone not available.');
    }
  }

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator color={colors.accent} size="large" />
      </View>
    );
  }

  if (!booking) {
    return (
      <View style={styles.loadErrorContainer}>
        <Text style={styles.loadErrorTitle}>Job details unavailable</Text>
        <Text style={styles.loadErrorText}>{loadError || 'Reconnect and try again.'}</Text>
        <TouchableOpacity style={styles.retryBtn} onPress={loadBooking}>
          <Text style={styles.retryBtnText}>Retry</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const mapLat = myLocation?.lat || booking.location_lat;
  const mapLng = myLocation?.lng || booking.location_lng;
  const locationText = booking.address || formatApproxArea(booking) || 'Location hidden until accepted';
  const isOffline = booking._offline === true;
  const bothScopeConfirmed = booking.scope_confirmed_by_customer
    && booking.scope_confirmed_by_labourer;
  const canShareDetails = capabilityEnabled(capabilities, 'booking_details_share');
  const canCallEmergency = capabilityEnabled(capabilities, 'emergency_call');

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" />

      {mapLat && mapLng ? (
        <MapView
          style={styles.map}
          customMapStyle={darkMapStyle}
          region={{
            latitude: parseFloat(mapLat),
            longitude: parseFloat(mapLng),
            latitudeDelta: 0.04,
            longitudeDelta: 0.04,
          }}
        >
          {booking.location_lat && booking.location_lng && (
            <Marker
              coordinate={{ latitude: parseFloat(booking.location_lat), longitude: parseFloat(booking.location_lng) }}
              title="Job Location"
            >
              <View style={styles.jobMarker}><Text style={{ fontSize: 20 }}>📍</Text></View>
            </Marker>
          )}
          {myLocation && (
            <Marker coordinate={{ latitude: myLocation.lat, longitude: myLocation.lng }} title="You">
              <View style={styles.meMarker}>
                <Text style={styles.meMarkerText}>ME</Text>
              </View>
            </Marker>
          )}
        </MapView>
      ) : (
        <View style={styles.mapPlaceholder}>
          <Text style={styles.mapPlaceholderText}>🗺️ Map loading...</Text>
        </View>
      )}

      <View style={styles.card}>
        <ScrollView showsVerticalScrollIndicator={false}>
          {/* Job info row */}
          <View style={styles.jobHeader}>
            <View style={{ flex: 1 }}>
              <Text style={styles.customerName}>{booking.customer_name}</Text>
              <Text style={styles.jobSkill}>{booking.skill_needed}</Text>
              <Text style={styles.jobAddress}>{locationText}</Text>
            </View>
            <TouchableOpacity
              style={styles.chatBtn}
              onPress={() => navigation.navigate('Chat', {
                bookingId: booking.id,
                otherPartyName: booking.customer_name,
                bookingStatus: booking.status,
              })}
            >
              <Text style={styles.callBtnText}>💬</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.callBtn} onPress={callCustomer}>
              <Text style={styles.callBtnText}>📞</Text>
            </TouchableOpacity>
          </View>

          <StatusTimeline currentStatus={booking.status} />

          {isOffline && (
            <View style={styles.offlineBanner}>
              <Text style={styles.offlineTitle}>Cached job details</Text>
              <Text style={styles.offlineText}>
                Reconnect and refresh before accepting, starting, changing, or completing work.
              </Text>
            </View>
          )}

          <View style={styles.detailsRow}>
            <View style={styles.detailChip}>
              <Text style={styles.detailChipIcon}>📅</Text>
              <Text style={styles.detailChipText}>{formatDateTime(booking.scheduled_at)}</Text>
            </View>
            {booking.total_amount && (
              <View style={[styles.detailChip, styles.detailChipGreen]}>
                <Text style={styles.detailChipIcon}>💰</Text>
                <Text style={[styles.detailChipText, { color: colors.success, fontWeight: '700' }]}>
                  {formatZAR(booking.total_amount)}
                </Text>
              </View>
            )}
          </View>

          {/* Action buttons */}
          <View style={styles.actions}>
            {/* Scope confirm */}
            {booking.status === 'accepted' && !booking.scope_confirmed_by_labourer && (
              <TouchableOpacity
                style={styles.scopeBtn}
                onPress={() => navigation.navigate('ScopeConfirm', { bookingId: booking.id })}
              >
                <Text style={styles.scopeBtnText}>📋  Confirm Job Scope</Text>
              </TouchableOpacity>
            )}

            {booking.status === 'accepted' && booking.scope_confirmed_by_labourer
              && !booking.scope_confirmed_by_customer && (
              <View style={styles.waitingBanner}>
                <Text style={styles.waitingText}>⏳ Waiting for customer to confirm scope…</Text>
              </View>
            )}

            {booking.status === 'accepted' && bothScopeConfirmed && (
              <TouchableOpacity
                style={[styles.startBtn, isOffline && styles.actionDisabled]}
                onPress={() => setStartPinModal(true)}
                disabled={isOffline}
              >
                <Text style={styles.startBtnText}>Enter start PIN</Text>
              </TouchableOpacity>
            )}

            {booking.status === 'in_progress' && (
              <>
                <TouchableOpacity
                  style={[styles.changeOrderBtn, isOffline && styles.actionDisabled]}
                  onPress={handleChangeOrder}
                  disabled={isOffline}
                >
                  <Text style={styles.changeOrderBtnText}>Request additional work</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.completeBtn, isOffline && styles.actionDisabled]}
                  onPress={handleComplete}
                  disabled={isOffline}
                >
                  <Text style={styles.completeBtnText}>Mark work complete</Text>
                </TouchableOpacity>
              </>
            )}

            {/* Share trip */}
            {canShareDetails && ['accepted', 'in_progress'].includes(booking.status) && (
              <TouchableOpacity style={styles.shareBtn} onPress={handleShareTrip}>
                <Text style={styles.shareBtnText}>Share booking details</Text>
              </TouchableOpacity>
            )}

            {/* Direct emergency-call fallback; no dispatch claim. */}
            {canCallEmergency && ['accepted', 'in_progress'].includes(booking.status) && (
              <EmergencyHelpButton onPress={handleEmergencyHelp} />
            )}

            {booking.status === 'completed' && (
              <View style={styles.completedBanner}>
                <Text style={styles.completedIcon}>🎉</Text>
                <Text style={styles.completedText}>Job complete! Awaiting payment.</Text>
              </View>
            )}
          </View>
        </ScrollView>
      </View>

      <Modal
        visible={startPinModal}
        transparent
        animationType="fade"
        onRequestClose={() => setStartPinModal(false)}
      >
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Start with the customer's PIN</Text>
            <Text style={styles.modalText}>
              Both parties have confirmed scope. Ask the customer for the 6-digit code before work begins.
            </Text>
            <TextInput
              style={styles.pinInput}
              value={startPin}
              onChangeText={(value) => setStartPin(value.replace(/\D/g, '').slice(0, 6))}
              keyboardType="number-pad"
              maxLength={6}
              placeholder="000000"
              placeholderTextColor="#8A928E"
              autoFocus
            />
            <View style={styles.modalActions}>
              <TouchableOpacity style={styles.modalCancel} onPress={() => setStartPinModal(false)}>
                <Text style={styles.modalCancelText}>Not yet</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modalSubmit, (!/^\d{6}$/.test(startPin) || starting) && styles.actionDisabled]}
                onPress={handleStart}
                disabled={!/^\d{6}$/.test(startPin) || starting}
              >
                {starting
                  ? <ActivityIndicator color="#FFFFFF" />
                  : <Text style={styles.modalSubmitText}>Start job</Text>
                }
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      <Modal
        visible={changeOrderModal}
        transparent
        animationType="fade"
        onRequestClose={() => setChangeOrderModal(false)}
      >
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Request additional work</Text>
            <Text style={styles.modalText}>
              Describe only work outside the agreed scope. The customer must approve it before you continue.
            </Text>
            <TextInput
              style={styles.descriptionInput}
              value={changeOrderText}
              onChangeText={setChangeOrderText}
              placeholder="Describe the additional work"
              placeholderTextColor="#8A928E"
              multiline
              autoFocus
            />
            <TextInput
              style={styles.hoursInput}
              value={changeOrderHours}
              onChangeText={setChangeOrderHours}
              placeholder="Extra hours (optional)"
              placeholderTextColor="#8A928E"
              keyboardType="decimal-pad"
            />
            <View style={styles.modalActions}>
              <TouchableOpacity style={styles.modalCancel} onPress={() => setChangeOrderModal(false)}>
                <Text style={styles.modalCancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modalSubmit, (!changeOrderText.trim() || changeOrderSubmitting) && styles.actionDisabled]}
                onPress={submitChangeOrder}
                disabled={!changeOrderText.trim() || changeOrderSubmitting}
              >
                {changeOrderSubmitting
                  ? <ActivityIndicator color="#FFFFFF" />
                  : <Text style={styles.modalSubmitText}>Send request</Text>
                }
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F7F4EF' },
  loadingContainer: { flex: 1, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center' },
  loadErrorContainer: {
    flex: 1,
    backgroundColor: '#F7F4EF',
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.xl,
  },
  loadErrorTitle: { color: '#0F1F1B', fontSize: typography.xl, fontWeight: '900', textAlign: 'center' },
  loadErrorText: { color: '#64706B', fontSize: typography.sm, lineHeight: 20, textAlign: 'center', marginTop: spacing.sm },
  retryBtn: { backgroundColor: '#12844E', borderRadius: borderRadius.md, paddingHorizontal: spacing.lg, paddingVertical: spacing.sm + 4, marginTop: spacing.lg },
  retryBtnText: { color: '#FFFFFF', fontSize: typography.sm, fontWeight: '800' },
  map: { flex: 1 },
  mapPlaceholder: { flex: 1, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center' },
  mapPlaceholderText: { color: colors.textMuted, fontSize: typography.md },
  jobMarker: { alignItems: 'center' },
  meMarker: {
    backgroundColor: colors.accent, borderRadius: borderRadius.full,
    paddingHorizontal: 8, paddingVertical: 3,
  },
  meMarkerText: { color: colors.primary, fontSize: 10, fontWeight: '900' },
  card: {
    backgroundColor: '#FFFCF7', borderTopLeftRadius: borderRadius.lg,
    borderTopRightRadius: borderRadius.lg, paddingHorizontal: spacing.md,
    paddingTop: spacing.md, maxHeight: '60%', ...shadows.upward,
  },
  jobHeader: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm, marginBottom: spacing.sm },
  customerName: { fontSize: typography.lg, fontWeight: '800', color: colors.textPrimary, marginBottom: 2 },
  jobSkill: { fontSize: typography.sm, color: colors.accent, fontWeight: '600', marginBottom: 2 },
  jobAddress: { fontSize: typography.sm, color: colors.textMuted },
  callBtn: {
    width: 44, height: 44, borderRadius: borderRadius.full,
    backgroundColor: colors.successLight, alignItems: 'center', justifyContent: 'center',
  },
  chatBtn: {
    width: 44, height: 44, borderRadius: borderRadius.full,
    backgroundColor: colors.infoLight, alignItems: 'center', justifyContent: 'center',
  },
  callBtnText: { fontSize: 22 },
  detailsRow: { flexDirection: 'row', gap: spacing.sm, marginBottom: spacing.md, flexWrap: 'wrap' },
  detailChip: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    backgroundColor: '#f3f4f6', paddingHorizontal: spacing.sm,
    paddingVertical: 4, borderRadius: borderRadius.full,
  },
  detailChipGreen: { backgroundColor: colors.successLight },
  detailChipIcon: { fontSize: 12 },
  detailChipText: { fontSize: typography.xs, color: colors.textSecondary, fontWeight: '500' },
  offlineBanner: {
    backgroundColor: '#FFF3D5',
    borderRadius: borderRadius.md,
    borderWidth: 1,
    borderColor: '#E9CF8F',
    padding: spacing.sm,
    marginBottom: spacing.md,
  },
  offlineTitle: { color: '#0F1F1B', fontSize: typography.sm, fontWeight: '800' },
  offlineText: { color: '#64706B', fontSize: typography.xs, lineHeight: 18, marginTop: 2 },
  actions: { paddingBottom: spacing.lg, gap: spacing.sm },
  scopeBtn: {
    backgroundColor: colors.infoLight, borderRadius: borderRadius.md,
    paddingVertical: spacing.sm + 2, alignItems: 'center',
    borderWidth: 1, borderColor: colors.info,
  },
  scopeBtnText: { color: colors.info, fontWeight: '700', fontSize: typography.sm },
  waitingBanner: {
    backgroundColor: colors.accentLight, borderRadius: borderRadius.sm,
    padding: spacing.sm, alignItems: 'center',
  },
  waitingText: { color: colors.accentDark, fontSize: typography.sm, fontWeight: '600' },
  startBtn: {
    backgroundColor: '#12844E', borderRadius: borderRadius.lg,
    paddingVertical: spacing.md, alignItems: 'center', ...shadows.card,
  },
  startBtnText: { color: '#fff', fontWeight: '800', fontSize: typography.lg },
  completeBtn: {
    backgroundColor: '#12844E', borderRadius: borderRadius.lg,
    paddingVertical: spacing.md + 4, alignItems: 'center', ...shadows.heavy,
  },
  completeBtnText: { color: '#fff', fontWeight: '800', fontSize: typography.xl },
  changeOrderBtn: {
    backgroundColor: colors.accentLight, borderRadius: borderRadius.md,
    paddingVertical: spacing.sm + 2, alignItems: 'center',
    borderWidth: 1, borderColor: colors.accent,
  },
  changeOrderBtnText: { color: colors.accentDark, fontWeight: '700', fontSize: typography.sm },
  shareBtn: {
    backgroundColor: '#f3f4f6', borderRadius: borderRadius.md,
    paddingVertical: spacing.sm + 2, alignItems: 'center',
    borderWidth: 1, borderColor: colors.border,
  },
  shareBtnText: { color: colors.textSecondary, fontWeight: '600', fontSize: typography.sm },
  completedBanner: {
    backgroundColor: colors.successLight, borderRadius: borderRadius.md,
    paddingVertical: spacing.md, flexDirection: 'row',
    alignItems: 'center', justifyContent: 'center', gap: spacing.sm,
  },
  completedIcon: { fontSize: 24 },
  completedText: { color: colors.successDark, fontWeight: '700', fontSize: typography.md },
  actionDisabled: { opacity: 0.45 },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(15,31,27,0.58)',
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
  pinInput: {
    backgroundColor: '#F7F4EF',
    color: '#0F1F1B',
    borderRadius: borderRadius.md,
    borderWidth: 1,
    borderColor: '#DDD8CF',
    padding: spacing.md,
    marginTop: spacing.md,
    fontSize: 30,
    fontWeight: '900',
    letterSpacing: 8,
    textAlign: 'center',
  },
  descriptionInput: {
    minHeight: 110,
    backgroundColor: '#F7F4EF',
    color: '#0F1F1B',
    borderRadius: borderRadius.md,
    borderWidth: 1,
    borderColor: '#DDD8CF',
    padding: spacing.md,
    marginTop: spacing.md,
    textAlignVertical: 'top',
  },
  hoursInput: {
    backgroundColor: '#F7F4EF',
    color: '#0F1F1B',
    borderRadius: borderRadius.md,
    borderWidth: 1,
    borderColor: '#DDD8CF',
    padding: spacing.md,
    marginTop: spacing.sm,
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
