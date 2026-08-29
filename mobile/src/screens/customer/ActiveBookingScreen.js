import React, { useEffect, useState, useRef } from 'react';
import {
  View, Text, StyleSheet, ActivityIndicator, TouchableOpacity,
  Alert, ScrollView, StatusBar, Linking, Share, Animated,
} from 'react-native';
import MapView, { Marker } from 'react-native-maps';
import { useSelector, useDispatch } from 'react-redux';
import { updateLabourerLocation } from '../../store/bookingSlice';
import { socketService } from '../../services/socketService';
import { bookingService } from '../../services/bookingService';
import BookingStatusBadge from '../../components/BookingStatusBadge';
import { formatZAR, formatDateTime } from '../../utils/formatters';
import { colors, typography, spacing, borderRadius, shadows, darkMapStyle } from '../../theme';
import api from '../../services/api';
import {
  capabilityEnabled,
  failClosedCapabilities,
  getEffectiveCapabilities,
} from '../../services/capabilityService';

const STATUS_STEPS = [
  { key: 'pending', label: 'Requested', icon: '📋' },
  { key: 'accepted', label: 'Accepted', icon: '✅' },
  { key: 'in_progress', label: 'Working', icon: '🔧' },
  { key: 'completed', label: 'Done', icon: '🎉' },
];

function formatApproxArea(item) {
  const lat = Number(item?.approx_lat);
  const lng = Number(item?.approx_lng);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  const label = item.location_precision === 'approximate' ? 'Approx. area' : 'Area';
  return `${label}: ${lat.toFixed(2)}, ${lng.toFixed(2)}`;
}

function StatusTimeline({ currentStatus }) {
  const currentIdx = STATUS_STEPS.findIndex((s) => s.key === currentStatus);
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

// Pulsing circle for "worker arrived" animation
function PulseMarker({ children }) {
  const pulse = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1.4, duration: 700, useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 1, duration: 700, useNativeDriver: true }),
      ])
    ).start();
  }, []);
  return (
    <View style={{ alignItems: 'center', justifyContent: 'center' }}>
      <Animated.View style={[pulseStyles.ring, { transform: [{ scale: pulse }] }]} />
      {children}
    </View>
  );
}
const pulseStyles = StyleSheet.create({
  ring: {
    position: 'absolute', width: 60, height: 60,
    borderRadius: 30, borderWidth: 2.5,
    borderColor: colors.accent, opacity: 0.45,
  },
});

function EmergencyHelpButton({ onPress }) {
  return (
    <TouchableOpacity style={sosStyles.btn} onPress={onPress}>
      <Text style={sosStyles.text}>Emergency help</Text>
      <Text style={sosStyles.subtext}>Direct call only — TOGT does not dispatch emergencies</Text>
    </TouchableOpacity>
  );
}
const sosStyles = StyleSheet.create({
  btn: {
    backgroundColor: colors.dangerLight,
    borderRadius: borderRadius.sm,
    paddingVertical: spacing.sm,
    alignItems: 'center',
    borderWidth: 1.5,
    borderColor: colors.danger,
  },
  text: { color: colors.danger, fontWeight: '800', fontSize: typography.sm },
  subtext: { color: colors.dangerDark, fontSize: typography.xs, marginTop: 2, textAlign: 'center' },
});

export default function ActiveBookingScreen({ route, navigation }) {
  const { bookingId } = route.params;
  const dispatch = useDispatch();
  const { accessToken } = useSelector((s) => s.auth);
  const labourerLocation = useSelector((s) => s.booking.labourerLocation);

  const [booking, setBooking] = useState(null);
  const [loading, setLoading] = useState(true);
  const [workerEta, setWorkerEta] = useState(null);
  const [workerArrived, setWorkerArrived] = useState(false);
  const [locationUpdatedAt, setLocationUpdatedAt] = useState(null);
  const [capabilities, setCapabilities] = useState(
    failClosedCapabilities('capability_check_pending')
  );

  useEffect(() => {
    loadBooking();
    const interval = setInterval(loadBooking, 15000);
    return () => clearInterval(interval);
  }, [bookingId]);

  useEffect(() => {
    let active = true;
    getEffectiveCapabilities().then((result) => {
      if (active) setCapabilities(result);
    });
    return () => { active = false; };
  }, []);

  const canReceiveForegroundLocation = capabilityEnabled(
    capabilities,
    'foreground_location_updates'
  );

  useEffect(() => {
    if (!canReceiveForegroundLocation || !accessToken) return undefined;
    socketService.connect(accessToken);
    socketService.joinBooking(bookingId);

    const handleWorkerLocation = (data) => {
      dispatch(updateLabourerLocation({ lat: data.lat, lng: data.lng }));
      setWorkerEta(data.etaMinutes);
      setLocationUpdatedAt(new Date());
    };
    const handleLegacyLocation = (data) => {
      dispatch(updateLabourerLocation({ lat: data.lat, lng: data.lng }));
      setLocationUpdatedAt(new Date());
    };
    const handleWorkerArrived = () => {
      setWorkerArrived(true);
      setWorkerEta(0);
    };

    // New worker_location event (with ETA)
    socketService.on('worker_location', handleWorkerLocation);

    // Legacy event
    socketService.onLocationUpdate(handleLegacyLocation);

    // Worker arrived
    socketService.on('worker_arrived', handleWorkerArrived);

    return () => {
      socketService.offLocationUpdate(handleLegacyLocation);
      socketService.off('worker_location', handleWorkerLocation);
      socketService.off('worker_arrived', handleWorkerArrived);
      socketService.disconnect();
    };
  }, [bookingId, accessToken, canReceiveForegroundLocation, dispatch]);

  async function loadBooking() {
    try {
      const res = await bookingService.getBooking(bookingId);
      setBooking(res.booking);
    } catch {
      // ignore polling errors
    } finally {
      setLoading(false);
    }
  }

  async function handleCancel() {
    Alert.alert('Cancel Booking', 'Are you sure you want to cancel?', [
      { text: 'No' },
      {
        text: 'Yes, Cancel', style: 'destructive',
        onPress: async () => {
          await bookingService.cancel(bookingId);
          navigation.goBack();
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
      Alert.alert('Share', 'Could not prepare the booking summary.');
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

  function callLabourer() {
    if (booking?.labourer_phone) {
      Linking.openURL(`tel:${booking.labourer_phone}`);
    } else {
      Alert.alert('Contact', 'Labourer phone not available yet.');
    }
  }

  if (loading || !booking) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator color={colors.accent} size="large" />
      </View>
    );
  }

  const visibleLabourerLocation = canReceiveForegroundLocation ? labourerLocation : null;
  const mapCenter = visibleLabourerLocation || { lat: booking.location_lat, lng: booking.location_lng };
  const isCompleted = booking.status === 'completed';
  const isCancellable = ['pending', 'accepted'].includes(booking.status);
  const isPaid = booking.payment_status === 'paid';
  const isEnRoute = booking.status === 'accepted' && !!visibleLabourerLocation;
  const locationText = booking.address || formatApproxArea(booking);
  const canShareDetails = capabilityEnabled(capabilities, 'booking_details_share');
  const canCallEmergency = capabilityEnabled(capabilities, 'emergency_call');

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" />

      {mapCenter?.lat && mapCenter?.lng ? (
        <MapView
          style={styles.map}
          customMapStyle={darkMapStyle}
          region={{
            latitude: parseFloat(mapCenter.lat),
            longitude: parseFloat(mapCenter.lng),
            latitudeDelta: 0.05,
            longitudeDelta: 0.05,
          }}
        >
          {booking.location_lat && booking.location_lng && (
            <Marker
              coordinate={{ latitude: parseFloat(booking.location_lat), longitude: parseFloat(booking.location_lng) }}
              title="Job Location"
            >
              <View><Text style={{ fontSize: 24 }}>📍</Text></View>
            </Marker>
          )}
          {visibleLabourerLocation && (
            <Marker
              coordinate={{ latitude: visibleLabourerLocation.lat, longitude: visibleLabourerLocation.lng }}
              title={booking.labourer_name}
            >
              {workerArrived ? (
                <PulseMarker>
                  <View style={styles.labourerMarker}>
                    <Text style={styles.labourerMarkerText}>👷</Text>
                  </View>
                </PulseMarker>
              ) : (
                <View style={styles.labourerMarker}>
                  <Text style={styles.labourerMarkerText}>👷</Text>
                </View>
              )}
            </Marker>
          )}
        </MapView>
      ) : (
        <View style={styles.mapPlaceholder}>
          <Text style={styles.mapPlaceholderText}>🗺️ Map loading...</Text>
        </View>
      )}

      {/* ETA banner */}
      {isEnRoute && (
        <View style={styles.etaBanner}>
          {workerArrived ? (
            <Text style={styles.etaText}>Worker is within about 100 m of the job location</Text>
          ) : workerEta !== null ? (
            <Text style={styles.etaText}>Rough walking estimate: ~{workerEta} min (straight-line)</Text>
          ) : (
            <Text style={styles.etaText}>Waiting for an in-app location update…</Text>
          )}
          <Text style={styles.etaSubtext}>
            Updates only while the worker has TOGT open
            {locationUpdatedAt ? ` • ${locationUpdatedAt.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}` : ''}
          </Text>
        </View>
      )}

      <View style={styles.card}>
        <ScrollView showsVerticalScrollIndicator={false}>
          {/* Labourer info */}
          <View style={styles.labourerHeader}>
            <View style={styles.labourerAvatar}>
              <Text style={styles.labourerAvatarText}>{booking.labourer_name?.[0] || 'L'}</Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.labourerName}>{booking.labourer_name}</Text>
              <Text style={styles.jobSkill}>{booking.skill_needed}</Text>
              <BookingStatusBadge status={booking.status} />
            </View>
            <TouchableOpacity
              style={styles.chatBtn}
              onPress={() => navigation.navigate('Chat', {
                bookingId: booking.id,
                otherPartyName: booking.labourer_name,
                bookingStatus: booking.status,
              })}
            >
              <Text style={styles.callBtnText}>💬</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.callBtn} onPress={callLabourer}>
              <Text style={styles.callBtnText}>📞</Text>
            </TouchableOpacity>
          </View>

          <StatusTimeline currentStatus={booking.status} />

          {booking.status === 'accepted' && booking.start_pin ? (
            <View style={styles.startPinCard}>
              <Text style={styles.startPinLabel}>JOB START PIN</Text>
              <Text style={styles.startPin}>{booking.start_pin}</Text>
              <Text style={styles.startPinHint}>Share this only after both of you confirm the scope.</Text>
            </View>
          ) : null}

          {/* Details */}
          <View style={styles.detailsRow}>
            <View style={styles.detailChip}>
              <Text style={styles.detailChipIcon}>📅</Text>
              <Text style={styles.detailChipText}>{formatDateTime(booking.scheduled_at)}</Text>
            </View>
            {booking.total_amount && (
              <View style={[styles.detailChip, styles.detailChipGold]}>
                <Text style={styles.detailChipIcon}>💰</Text>
                <Text style={[styles.detailChipText, { color: colors.accentDark, fontWeight: '700' }]}>
                  {formatZAR(booking.total_amount)}
                </Text>
              </View>
            )}
          </View>

          {locationText && (
            <View style={styles.addressRow}>
              <Text style={styles.addressIcon}>📍</Text>
              <Text style={styles.addressText}>{locationText}</Text>
            </View>
          )}

          {/* Actions */}
          <View style={styles.actions}>
            {/* Scope confirm button (before in_progress) */}
            {['accepted', 'pending'].includes(booking.status) &&
              !booking.scope_confirmed_by_customer && (
              <TouchableOpacity
                style={styles.scopeBtn}
                onPress={() => navigation.navigate('ScopeConfirm', { bookingId: booking.id })}
              >
                <Text style={styles.scopeBtnText}>📋  Confirm Job Scope</Text>
              </TouchableOpacity>
            )}

            {/* Share trip */}
            {canShareDetails && ['accepted', 'in_progress'].includes(booking.status) && (
              <TouchableOpacity style={styles.shareBtn} onPress={handleShareTrip}>
                <Text style={styles.shareBtnText}>Share booking details</Text>
              </TouchableOpacity>
            )}

            {isCompleted && !isPaid && (
              <TouchableOpacity style={styles.payBtn} onPress={() => navigation.navigate('Payment', { booking })}>
                <Text style={styles.payBtnText}>View payment status</Text>
              </TouchableOpacity>
            )}
            {isCompleted && isPaid && (
              <TouchableOpacity style={styles.rateBtn} onPress={() => navigation.navigate('Rate', { booking })}>
                <Text style={styles.rateBtnText}>⭐  Rate {booking.labourer_name?.split(' ')[0]}</Text>
              </TouchableOpacity>
            )}
            {isCancellable && (
              <TouchableOpacity style={styles.cancelBtn} onPress={handleCancel}>
                <Text style={styles.cancelBtnText}>Cancel Booking</Text>
              </TouchableOpacity>
            )}

            {canCallEmergency && ['accepted', 'in_progress'].includes(booking.status) && (
              <EmergencyHelpButton onPress={handleEmergencyHelp} />
            )}
          </View>
        </ScrollView>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  loadingContainer: { flex: 1, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center' },
  map: { flex: 1 },
  mapPlaceholder: { flex: 1, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center' },
  mapPlaceholderText: { color: colors.textMuted, fontSize: typography.md },
  labourerMarker: {
    backgroundColor: colors.accent, borderRadius: borderRadius.full,
    width: 40, height: 40, alignItems: 'center', justifyContent: 'center',
    borderWidth: 2, borderColor: '#fff',
  },
  labourerMarkerText: { fontSize: 20 },
  etaBanner: {
    position: 'absolute', top: 0, left: 0, right: 0,
    backgroundColor: 'rgba(26,26,46,0.9)',
    paddingVertical: spacing.xs + 2,
    paddingHorizontal: spacing.md,
    alignItems: 'center',
  },
  etaText: { color: colors.accent, fontSize: typography.sm, fontWeight: '700' },
  etaSubtext: { color: colors.textInverse, opacity: 0.78, fontSize: typography.xs, marginTop: 2 },
  card: {
    backgroundColor: '#fff',
    borderTopLeftRadius: borderRadius.lg,
    borderTopRightRadius: borderRadius.lg,
    paddingHorizontal: spacing.md,
    paddingTop: spacing.md,
    maxHeight: '60%',
    ...shadows.upward,
  },
  labourerHeader: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginBottom: spacing.sm },
  labourerAvatar: {
    width: 48, height: 48, borderRadius: borderRadius.full,
    backgroundColor: colors.accent, alignItems: 'center', justifyContent: 'center',
  },
  labourerAvatarText: { color: colors.primary, fontSize: typography.xl, fontWeight: '800' },
  labourerName: { fontSize: typography.md, fontWeight: '800', color: colors.textPrimary, marginBottom: 2 },
  jobSkill: { fontSize: typography.sm, color: colors.textMuted, marginBottom: 4 },
  callBtn: {
    width: 44, height: 44, borderRadius: borderRadius.full,
    backgroundColor: colors.successLight, alignItems: 'center', justifyContent: 'center',
  },
  chatBtn: {
    width: 44, height: 44, borderRadius: borderRadius.full,
    backgroundColor: colors.infoLight, alignItems: 'center', justifyContent: 'center',
  },
  callBtnText: { fontSize: 22 },
  detailsRow: { flexDirection: 'row', gap: spacing.sm, marginBottom: spacing.sm, flexWrap: 'wrap' },
  detailChip: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    backgroundColor: '#f3f4f6', paddingHorizontal: spacing.sm,
    paddingVertical: 4, borderRadius: borderRadius.full,
  },
  detailChipGold: { backgroundColor: colors.accentLight },
  detailChipIcon: { fontSize: 12 },
  detailChipText: { fontSize: typography.xs, color: colors.textSecondary, fontWeight: '500' },
  addressRow: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.xs, marginBottom: spacing.md },
  addressIcon: { fontSize: 14 },
  addressText: { flex: 1, fontSize: typography.sm, color: colors.textMuted, lineHeight: 20 },
  startPinCard: {
    backgroundColor: '#F7F4EF', borderRadius: borderRadius.md, padding: spacing.md,
    borderWidth: 1, borderColor: '#D8D2C7', alignItems: 'center', marginBottom: spacing.md,
  },
  startPinLabel: { color: '#12844E', fontSize: typography.xs, fontWeight: '800', letterSpacing: 1.3 },
  startPin: { color: '#0F1F1B', fontSize: 30, fontWeight: '900', letterSpacing: 8, marginVertical: 5 },
  startPinHint: { color: colors.textMuted, fontSize: typography.xs, textAlign: 'center' },
  actions: { paddingBottom: spacing.lg, gap: spacing.sm },
  scopeBtn: {
    backgroundColor: colors.infoLight, borderRadius: borderRadius.md,
    paddingVertical: spacing.sm + 2, alignItems: 'center',
    borderWidth: 1, borderColor: colors.info,
  },
  scopeBtnText: { color: colors.info, fontWeight: '700', fontSize: typography.sm },
  shareBtn: {
    backgroundColor: '#f3f4f6', borderRadius: borderRadius.md,
    paddingVertical: spacing.sm + 2, alignItems: 'center',
    borderWidth: 1, borderColor: colors.border,
  },
  shareBtnText: { color: colors.textSecondary, fontWeight: '600', fontSize: typography.sm },
  payBtn: {
    backgroundColor: colors.accent, borderRadius: borderRadius.lg,
    paddingVertical: spacing.md, alignItems: 'center', ...shadows.card,
  },
  payBtnText: { color: colors.primary, fontWeight: '800', fontSize: typography.lg },
  rateBtn: {
    backgroundColor: colors.primary, borderRadius: borderRadius.lg,
    paddingVertical: spacing.md, alignItems: 'center', ...shadows.card,
  },
  rateBtnText: { color: colors.accent, fontWeight: '800', fontSize: typography.md },
  cancelBtn: {
    borderWidth: 1.5, borderColor: colors.danger,
    borderRadius: borderRadius.md, paddingVertical: spacing.sm + 4, alignItems: 'center',
  },
  cancelBtnText: { color: colors.danger, fontWeight: '700' },
});
