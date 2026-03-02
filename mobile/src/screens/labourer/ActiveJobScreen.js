import React, { useEffect, useRef, useState } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, ActivityIndicator,
  Alert, ScrollView, StatusBar, Linking, Share, Animated, TextInput, Modal,
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

// SOS hold-button (3-second press)
function SOSButton({ onSOS }) {
  const progress = useRef(new Animated.Value(0)).current;
  const anim = useRef(null);
  const fired = useRef(false);

  function onPressIn() {
    fired.current = false;
    anim.current = Animated.timing(progress, {
      toValue: 1, duration: 3000, useNativeDriver: false,
    });
    anim.current.start(({ finished }) => {
      if (finished && !fired.current) {
        fired.current = true;
        onSOS();
        progress.setValue(0);
      }
    });
  }
  function onPressOut() {
    anim.current?.stop();
    progress.setValue(0);
  }
  const width = progress.interpolate({ inputRange: [0, 1], outputRange: ['0%', '100%'] });
  return (
    <TouchableOpacity
      style={sosStyles.btn}
      onPressIn={onPressIn}
      onPressOut={onPressOut}
      activeOpacity={0.9}
    >
      <Animated.View style={[sosStyles.fill, { width }]} />
      <Text style={sosStyles.text}>🆘 SOS  (hold 3s)</Text>
    </TouchableOpacity>
  );
}
const sosStyles = StyleSheet.create({
  btn: {
    backgroundColor: colors.dangerLight, borderRadius: borderRadius.sm,
    paddingVertical: spacing.sm, alignItems: 'center', overflow: 'hidden',
    position: 'relative', borderWidth: 1.5, borderColor: colors.danger,
  },
  fill: {
    position: 'absolute', top: 0, left: 0, bottom: 0,
    backgroundColor: colors.danger, opacity: 0.3,
  },
  text: { color: colors.danger, fontWeight: '800', fontSize: typography.sm },
});

// Change Order modal (simplified inline)
function ChangeOrderRequest({ bookingId, onDone }) {
  const [desc, setDesc] = useState('');
  const [hours, setHours] = useState('');
  const [submitting, setSubmitting] = useState(false);

  async function submit() {
    if (!desc.trim()) {
      Alert.alert('Describe the change', 'Please describe what extra work is needed.');
      return;
    }
    setSubmitting(true);
    try {
      const extra_hours = parseFloat(hours) || null;
      // Approximate price: show to customer based on booking rate
      await api.post(`/api/bookings/${bookingId}/change-order`, {
        description: desc,
        extra_hours,
        extra_amount: null, // customer and labourer can negotiate
      });
      Alert.alert('✅ Sent', 'Change request sent to the customer.');
      onDone();
    } catch (err) {
      Alert.alert('Error', err.response?.data?.error || 'Could not send change order.');
    } finally {
      setSubmitting(false);
    }
  }

  return null; // Triggers Alert.prompt below in parent — see handleChangeOrder
}

export default function ActiveJobScreen({ route, navigation }) {
  const { bookingId } = route.params;
  const { accessToken, user } = useSelector((s) => s.auth);
  const [booking, setBooking] = useState(null);
  const [loading, setLoading] = useState(true);
  const [myLocation, setMyLocation] = useState(null);
  const watchRef = useRef(null);

  useEffect(() => {
    loadBooking();
    startLocationSharing();
    const poll = setInterval(loadBooking, 15000);
    return () => {
      stopLocationSharing();
      clearInterval(poll);
    };
  }, [bookingId]);

  async function loadBooking() {
    try {
      const res = await bookingService.getBooking(bookingId);
      setBooking(res.booking);
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
    socketService.disconnect();
  }

  async function handleStart() {
    try {
      const res = await bookingService.start(bookingId);
      setBooking(res.booking);
    } catch (err) {
      Alert.alert('Error', err.response?.data?.error || 'Could not start job.');
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
    try {
      const res = await api.post(`/api/bookings/${bookingId}/share-trip`);
      await Share.share({ message: res.data.shareText });
    } catch {
      Alert.alert('Share', 'Could not generate share link.');
    }
  }

  async function handleSOS() {
    Alert.alert(
      '🆘 SOS Triggered',
      'Your location is being shared. Do you need emergency services?',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: '📞 Call 10111', onPress: () => Linking.openURL('tel:10111') },
      ]
    );
    try {
      const loc = myLocation || {};
      await api.post('/api/safety/sos', { booking_id: bookingId, lat: loc.lat, lng: loc.lng });
    } catch {}
  }

  function handleChangeOrder() {
    setChangeOrderText('');
    setChangeOrderModal(true);
  }

  async function submitChangeOrder() {
    if (!changeOrderText.trim()) return;
    try {
      await api.post(`/api/bookings/${bookingId}/change-order`, {
        description: changeOrderText.trim(),
      });
      setChangeOrderModal(false);
      Alert.alert('✅ Sent', 'Change request sent to the customer.');
    } catch (err) {
      Alert.alert('Error', err.response?.data?.error || 'Could not send request.');
    }
  }

  function callCustomer() {
    if (booking?.customer_phone) {
      Linking.openURL(`tel:${booking.customer_phone}`);
    } else {
      Alert.alert('Contact', 'Customer phone not available.');
    }
  }

  if (loading || !booking) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator color={colors.accent} size="large" />
      </View>
    );
  }

  const mapLat = myLocation?.lat || booking.location_lat;
  const mapLng = myLocation?.lng || booking.location_lng;

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
          {booking.location_lat && (
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
              <Text style={styles.jobAddress}>{booking.address}</Text>
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

            {booking.status === 'accepted' && !booking.scope_confirmed_by_labourer && (
              <TouchableOpacity style={styles.startBtn} onPress={handleStart}>
                <Text style={styles.startBtnText}>🚀  Start Job (skip scope)</Text>
              </TouchableOpacity>
            )}

            {booking.status === 'in_progress' && (
              <>
                <TouchableOpacity style={styles.changeOrderBtn} onPress={handleChangeOrder}>
                  <Text style={styles.changeOrderBtnText}>➕  Request Extra Work</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.completeBtn} onPress={handleComplete}>
                  <Text style={styles.completeBtnText}>✅  Mark as Complete</Text>
                </TouchableOpacity>
              </>
            )}

            {/* Share trip */}
            {['accepted', 'in_progress'].includes(booking.status) && (
              <TouchableOpacity style={styles.shareBtn} onPress={handleShareTrip}>
                <Text style={styles.shareBtnText}>🔗  Share Trip</Text>
              </TouchableOpacity>
            )}

            {/* SOS */}
            {['accepted', 'in_progress'].includes(booking.status) && (
              <SOSButton onSOS={handleSOS} />
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
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  loadingContainer: { flex: 1, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center' },
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
    backgroundColor: '#fff', borderTopLeftRadius: borderRadius.lg,
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
    backgroundColor: colors.info, borderRadius: borderRadius.lg,
    paddingVertical: spacing.md, alignItems: 'center', ...shadows.card,
  },
  startBtnText: { color: '#fff', fontWeight: '800', fontSize: typography.lg },
  completeBtn: {
    backgroundColor: colors.success, borderRadius: borderRadius.lg,
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
});
