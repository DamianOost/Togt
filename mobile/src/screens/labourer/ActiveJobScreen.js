import React, { useEffect, useRef, useState } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, ActivityIndicator,
  Alert, ScrollView, StatusBar, Linking,
} from 'react-native';
import MapView, { Marker } from 'react-native-maps';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useSelector } from 'react-redux';
import { bookingService } from '../../services/bookingService';
import { locationService } from '../../services/locationService';
import { socketService } from '../../services/socketService';
import { formatDateTime, formatZAR } from '../../utils/formatters';
import { colors, typography, spacing, borderRadius, shadows, darkMapStyle } from '../../theme';

const STATUS_STEPS = [
  { key: 'accepted', label: 'Accepted', icon: '✅' },
  { key: 'en_route', label: 'En Route', icon: '🚶' },
  { key: 'arrived', label: 'Arrived', icon: '📍' },
  { key: 'in_progress', label: 'Working', icon: '🔧' },
  { key: 'completed', label: 'Complete', icon: '🎉' },
];

// Simplified for backend: accepted → in_progress → completed
const BACKEND_STATUS_MAP = {
  accepted: 0,
  in_progress: 3,
  completed: 4,
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
    width: 32,
    height: 32,
    borderRadius: borderRadius.full,
    backgroundColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 4,
  },
  dotDone: { backgroundColor: colors.success },
  dotActive: { backgroundColor: colors.accent, ...shadows.card },
  dotIcon: { fontSize: 12 },
  line: {
    position: 'absolute',
    top: 15,
    left: '60%',
    right: '-60%',
    height: 2,
    backgroundColor: colors.border,
    zIndex: -1,
  },
  lineDone: { backgroundColor: colors.success },
  label: { fontSize: 9, color: colors.textMuted, textAlign: 'center' },
  labelActive: { color: colors.accent, fontWeight: '700', fontSize: 10 },
});

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
              <View style={styles.jobMarker}>
                <Text style={{ fontSize: 20 }}>📍</Text>
              </View>
            </Marker>
          )}
          {myLocation && (
            <Marker
              coordinate={{ latitude: myLocation.lat, longitude: myLocation.lng }}
              title="You"
            >
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

      {/* Bottom card */}
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
              onPress={() =>
                navigation.navigate('Chat', {
                  bookingId: booking.id,
                  otherPartyName: booking.customer_name,
                  bookingStatus: booking.status,
                })
              }
            >
              <Text style={styles.callBtnText}>💬</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.callBtn} onPress={callCustomer}>
              <Text style={styles.callBtnText}>📞</Text>
            </TouchableOpacity>
          </View>

          {/* Status timeline */}
          <StatusTimeline currentStatus={booking.status} />

          {/* Details */}
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
            {booking.status === 'accepted' && (
              <TouchableOpacity style={styles.startBtn} onPress={handleStart}>
                <Text style={styles.startBtnText}>🚀  Start Job</Text>
              </TouchableOpacity>
            )}
            {booking.status === 'in_progress' && (
              <TouchableOpacity style={styles.completeBtn} onPress={handleComplete}>
                <Text style={styles.completeBtnText}>✅  Mark as Complete</Text>
              </TouchableOpacity>
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
  loadingContainer: {
    flex: 1,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  map: { flex: 1 },
  mapPlaceholder: {
    flex: 1,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  mapPlaceholderText: { color: colors.textMuted, fontSize: typography.md },
  jobMarker: { alignItems: 'center' },
  meMarker: {
    backgroundColor: colors.accent,
    borderRadius: borderRadius.full,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  meMarkerText: { color: colors.primary, fontSize: 10, fontWeight: '900' },
  card: {
    backgroundColor: '#fff',
    borderTopLeftRadius: borderRadius.lg,
    borderTopRightRadius: borderRadius.lg,
    paddingHorizontal: spacing.md,
    paddingTop: spacing.md,
    maxHeight: '55%',
    ...shadows.upward,
  },
  jobHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.sm,
    marginBottom: spacing.sm,
  },
  customerName: { fontSize: typography.lg, fontWeight: '800', color: colors.textPrimary, marginBottom: 2 },
  jobSkill: { fontSize: typography.sm, color: colors.accent, fontWeight: '600', marginBottom: 2 },
  jobAddress: { fontSize: typography.sm, color: colors.textMuted },
  callBtn: {
    width: 44,
    height: 44,
    borderRadius: borderRadius.full,
    backgroundColor: colors.successLight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  chatBtn: {
    width: 44,
    height: 44,
    borderRadius: borderRadius.full,
    backgroundColor: colors.infoLight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  callBtnText: { fontSize: 22 },
  detailsRow: { flexDirection: 'row', gap: spacing.sm, marginBottom: spacing.md, flexWrap: 'wrap' },
  detailChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#f3f4f6',
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
    borderRadius: borderRadius.full,
  },
  detailChipGreen: { backgroundColor: colors.successLight },
  detailChipIcon: { fontSize: 12 },
  detailChipText: { fontSize: typography.xs, color: colors.textSecondary, fontWeight: '500' },
  actions: { paddingBottom: spacing.lg },
  startBtn: {
    backgroundColor: colors.info,
    borderRadius: borderRadius.lg,
    paddingVertical: spacing.md,
    alignItems: 'center',
    ...shadows.card,
  },
  startBtnText: { color: '#fff', fontWeight: '800', fontSize: typography.lg },
  completeBtn: {
    backgroundColor: colors.success,
    borderRadius: borderRadius.lg,
    paddingVertical: spacing.md + 4,
    alignItems: 'center',
    ...shadows.heavy,
  },
  completeBtnText: { color: '#fff', fontWeight: '800', fontSize: typography.xl },
  completedBanner: {
    backgroundColor: colors.successLight,
    borderRadius: borderRadius.md,
    paddingVertical: spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
  },
  completedIcon: { fontSize: 24 },
  completedText: { color: colors.successDark, fontWeight: '700', fontSize: typography.md },
});
