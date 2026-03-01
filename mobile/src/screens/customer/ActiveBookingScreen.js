import React, { useEffect, useState } from 'react';
import {
  View, Text, StyleSheet, ActivityIndicator, TouchableOpacity,
  Alert, ScrollView, StatusBar, Linking,
} from 'react-native';
import MapView, { Marker } from 'react-native-maps';
import { useSelector, useDispatch } from 'react-redux';
import { updateLabourerLocation } from '../../store/bookingSlice';
import { socketService } from '../../services/socketService';
import { bookingService } from '../../services/bookingService';
import BookingStatusBadge from '../../components/BookingStatusBadge';
import { formatZAR, formatDateTime } from '../../utils/formatters';
import { colors, typography, spacing, borderRadius, shadows, darkMapStyle } from '../../theme';

const STATUS_STEPS = [
  { key: 'pending', label: 'Requested', icon: '📋' },
  { key: 'accepted', label: 'Accepted', icon: '✅' },
  { key: 'in_progress', label: 'Working', icon: '🔧' },
  { key: 'completed', label: 'Done', icon: '🎉' },
];

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

export default function ActiveBookingScreen({ route, navigation }) {
  const { bookingId } = route.params;
  const dispatch = useDispatch();
  const { accessToken } = useSelector((s) => s.auth);
  const labourerLocation = useSelector((s) => s.booking.labourerLocation);

  const [booking, setBooking] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadBooking();
    socketService.connect(accessToken);
    socketService.joinBooking(bookingId);
    socketService.onLocationUpdate((data) => {
      dispatch(updateLabourerLocation({ lat: data.lat, lng: data.lng }));
    });

    const interval = setInterval(loadBooking, 15000);
    return () => {
      socketService.offLocationUpdate();
      clearInterval(interval);
    };
  }, [bookingId]);

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
        text: 'Yes, Cancel',
        style: 'destructive',
        onPress: async () => {
          await bookingService.cancel(bookingId);
          navigation.goBack();
        },
      },
    ]);
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

  const mapCenter = labourerLocation || {
    lat: booking.location_lat,
    lng: booking.location_lng,
  };

  const isCompleted = booking.status === 'completed';
  const isCancellable = ['pending', 'accepted'].includes(booking.status);
  const isPaid = booking.payment_status === 'paid';

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
          {booking.location_lat && (
            <Marker
              coordinate={{ latitude: parseFloat(booking.location_lat), longitude: parseFloat(booking.location_lng) }}
              title="Job Location"
            >
              <View>
                <Text style={{ fontSize: 24 }}>📍</Text>
              </View>
            </Marker>
          )}
          {labourerLocation && (
            <Marker
              coordinate={{ latitude: labourerLocation.lat, longitude: labourerLocation.lng }}
              title={booking.labourer_name}
            >
              <View style={styles.labourerMarker}>
                <Text style={styles.labourerMarkerText}>👷</Text>
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
            <TouchableOpacity style={styles.callBtn} onPress={callLabourer}>
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
              <View style={[styles.detailChip, styles.detailChipGold]}>
                <Text style={styles.detailChipIcon}>💰</Text>
                <Text style={[styles.detailChipText, { color: colors.accentDark, fontWeight: '700' }]}>
                  {formatZAR(booking.total_amount)}
                </Text>
              </View>
            )}
          </View>

          {booking.address && (
            <View style={styles.addressRow}>
              <Text style={styles.addressIcon}>📍</Text>
              <Text style={styles.addressText}>{booking.address}</Text>
            </View>
          )}

          {/* Actions */}
          <View style={styles.actions}>
            {isCompleted && !isPaid && (
              <TouchableOpacity
                style={styles.payBtn}
                onPress={() => navigation.navigate('Payment', { booking })}
              >
                <Text style={styles.payBtnText}>💳  Proceed to Payment</Text>
              </TouchableOpacity>
            )}

            {isCompleted && isPaid && (
              <TouchableOpacity
                style={styles.rateBtn}
                onPress={() => navigation.navigate('Rate', { booking })}
              >
                <Text style={styles.rateBtnText}>⭐  Rate {booking.labourer_name?.split(' ')[0]}</Text>
              </TouchableOpacity>
            )}

            {isCancellable && (
              <TouchableOpacity style={styles.cancelBtn} onPress={handleCancel}>
                <Text style={styles.cancelBtnText}>Cancel Booking</Text>
              </TouchableOpacity>
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
  labourerMarker: {
    backgroundColor: colors.accent,
    borderRadius: borderRadius.full,
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: '#fff',
  },
  labourerMarkerText: { fontSize: 20 },
  card: {
    backgroundColor: '#fff',
    borderTopLeftRadius: borderRadius.lg,
    borderTopRightRadius: borderRadius.lg,
    paddingHorizontal: spacing.md,
    paddingTop: spacing.md,
    maxHeight: '55%',
    ...shadows.upward,
  },
  labourerHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginBottom: spacing.sm,
  },
  labourerAvatar: {
    width: 48,
    height: 48,
    borderRadius: borderRadius.full,
    backgroundColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  labourerAvatarText: { color: colors.primary, fontSize: typography.xl, fontWeight: '800' },
  labourerName: { fontSize: typography.md, fontWeight: '800', color: colors.textPrimary, marginBottom: 2 },
  jobSkill: { fontSize: typography.sm, color: colors.textMuted, marginBottom: 4 },
  callBtn: {
    width: 44,
    height: 44,
    borderRadius: borderRadius.full,
    backgroundColor: colors.successLight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  callBtnText: { fontSize: 22 },
  detailsRow: { flexDirection: 'row', gap: spacing.sm, marginBottom: spacing.sm, flexWrap: 'wrap' },
  detailChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#f3f4f6',
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
    borderRadius: borderRadius.full,
  },
  detailChipGold: { backgroundColor: colors.accentLight },
  detailChipIcon: { fontSize: 12 },
  detailChipText: { fontSize: typography.xs, color: colors.textSecondary, fontWeight: '500' },
  addressRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.xs,
    marginBottom: spacing.md,
  },
  addressIcon: { fontSize: 14 },
  addressText: { flex: 1, fontSize: typography.sm, color: colors.textMuted, lineHeight: 20 },
  actions: { paddingBottom: spacing.lg, gap: spacing.sm },
  payBtn: {
    backgroundColor: colors.accent,
    borderRadius: borderRadius.lg,
    paddingVertical: spacing.md,
    alignItems: 'center',
    ...shadows.card,
  },
  payBtnText: { color: colors.primary, fontWeight: '800', fontSize: typography.lg },
  rateBtn: {
    backgroundColor: colors.primary,
    borderRadius: borderRadius.lg,
    paddingVertical: spacing.md,
    alignItems: 'center',
    ...shadows.card,
  },
  rateBtnText: { color: colors.accent, fontWeight: '800', fontSize: typography.md },
  cancelBtn: {
    borderWidth: 1.5,
    borderColor: colors.danger,
    borderRadius: borderRadius.md,
    paddingVertical: spacing.sm + 4,
    alignItems: 'center',
  },
  cancelBtnText: { color: colors.danger, fontWeight: '700' },
});
