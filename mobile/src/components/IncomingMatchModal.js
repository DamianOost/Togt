import React, { useEffect, useRef, useState } from 'react';
import {
  Modal, View, Text, TouchableOpacity, StyleSheet, ActivityIndicator, Alert,
} from 'react-native';
import { useSelector } from 'react-redux';
import { useNavigation } from '@react-navigation/native';
import { matchSocket } from '../services/matchSocket';
import { matchService } from '../services/matchService';
import { colors, typography, spacing, borderRadius, shadows } from '../theme';

const DEFAULT_TIMEOUT_MS = 30000;

export default function IncomingMatchModal() {
  const { user, accessToken } = useSelector((s) => s.auth);
  const navigation = useNavigation();
  const [request, setRequest] = useState(null);
  const [secondsLeft, setSecondsLeft] = useState(0);
  const [busy, setBusy] = useState(false);
  const tickRef = useRef(null);
  const startRef = useRef(null);

  // Connect socket on mount (labourer only); disconnect on logout
  useEffect(() => {
    if (!accessToken || user?.role !== 'labourer') {
      matchSocket.disconnect();
      return;
    }
    matchSocket.connect(accessToken);
    const handler = (payload) => {
      // payload = { matchId, attemptId, skill_needed, address, scheduled_at,
      //              hours_est, hourly_rate, timeout_ms }
      if (request) return; // already showing one
      setRequest(payload);
      const window = payload.timeout_ms || DEFAULT_TIMEOUT_MS;
      startRef.current = Date.now();
      setSecondsLeft(Math.ceil(window / 1000));
      tickRef.current = setInterval(() => {
        const elapsed = Date.now() - startRef.current;
        const remaining = Math.max(0, Math.ceil((window - elapsed) / 1000));
        setSecondsLeft(remaining);
        if (remaining <= 0) {
          clearInterval(tickRef.current);
          setRequest(null); // server-side timeout will fire — we just close UI
        }
      }, 250);
    };
    matchSocket.on('match:incoming', handler);
    return () => {
      matchSocket.off('match:incoming', handler);
      if (tickRef.current) clearInterval(tickRef.current);
    };
  }, [accessToken, user?.role]);

  function dismiss() {
    if (tickRef.current) clearInterval(tickRef.current);
    setRequest(null);
    setBusy(false);
  }

  async function onAccept() {
    if (!request) return;
    setBusy(true);
    try {
      const r = await matchService.accept(request.matchId);
      dismiss();
      navigation.navigate('ActiveJob', { bookingId: r.booking.id });
    } catch (err) {
      const msg = err.response?.data?.error || 'Could not accept job.';
      Alert.alert('Accept failed', msg);
      dismiss();
    }
  }

  async function onDecline() {
    if (!request) return;
    setBusy(true);
    try {
      await matchService.decline(request.matchId);
    } catch {}
    dismiss();
  }

  if (!request) return null;

  const pay = request.hours_est && request.hourly_rate
    ? `R${(Number(request.hourly_rate) * Number(request.hours_est)).toFixed(0)}`
    : null;

  return (
    <Modal visible={true} animationType="slide" transparent={false}>
      <View style={styles.container}>
        <View style={styles.timerCircle}>
          <Text style={styles.timerText}>{secondsLeft}</Text>
          <Text style={styles.timerLabel}>seconds</Text>
        </View>
        <Text style={styles.headline}>New job</Text>
        <Text style={styles.skill}>{request.skill_needed}</Text>
        <View style={styles.detailRow}>
          <Text style={styles.detailLabel}>Address</Text>
          <Text style={styles.detailValue}>{request.address}</Text>
        </View>
        <View style={styles.detailRow}>
          <Text style={styles.detailLabel}>Hours</Text>
          <Text style={styles.detailValue}>{request.hours_est || '?'}</Text>
        </View>
        {pay && (
          <View style={styles.detailRow}>
            <Text style={styles.detailLabel}>Pay (est)</Text>
            <Text style={styles.detailValuePay}>{pay}</Text>
          </View>
        )}

        <View style={styles.buttons}>
          <TouchableOpacity style={[styles.btn, styles.declineBtn]} onPress={onDecline} disabled={busy}>
            <Text style={styles.declineText}>Decline</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[styles.btn, styles.acceptBtn]} onPress={onAccept} disabled={busy}>
            {busy ? <ActivityIndicator color={colors.primary} /> : <Text style={styles.acceptText}>Accept</Text>}
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.primary, padding: spacing.xl, justifyContent: 'center' },
  timerCircle: {
    alignSelf: 'center', width: 110, height: 110, borderRadius: 55,
    borderWidth: 4, borderColor: colors.accent,
    alignItems: 'center', justifyContent: 'center', marginBottom: spacing.lg,
  },
  timerText: { color: colors.accent, fontSize: 40, fontWeight: '800' },
  timerLabel: { color: colors.textMuted, fontSize: typography.xs, textTransform: 'uppercase' },
  headline: { fontSize: typography.lg, color: colors.textMuted, textAlign: 'center', textTransform: 'uppercase', letterSpacing: 2 },
  skill: { fontSize: typography.xxl, fontWeight: '900', color: colors.textInverse, textAlign: 'center', marginVertical: spacing.md },
  detailRow: {
    flexDirection: 'row', justifyContent: 'space-between',
    paddingVertical: spacing.sm, borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.1)',
  },
  detailLabel: { color: colors.textMuted, fontSize: typography.sm, fontWeight: '600' },
  detailValue: { color: colors.textInverse, fontSize: typography.md, flex: 1, textAlign: 'right', marginLeft: spacing.md },
  detailValuePay: { color: colors.accent, fontSize: typography.lg, fontWeight: '800' },
  buttons: { flexDirection: 'row', gap: spacing.md, marginTop: spacing.xl },
  btn: { flex: 1, padding: spacing.md, borderRadius: borderRadius.md, alignItems: 'center' },
  declineBtn: { backgroundColor: 'rgba(239,68,68,0.2)', borderWidth: 1, borderColor: colors.danger },
  declineText: { color: colors.danger, fontSize: typography.md, fontWeight: '700' },
  acceptBtn: { backgroundColor: colors.accent, ...shadows.card },
  acceptText: { color: colors.primary, fontSize: typography.md, fontWeight: '800' },
});
