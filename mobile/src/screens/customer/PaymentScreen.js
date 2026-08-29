import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  SafeAreaView,
  TouchableOpacity,
  ActivityIndicator,
} from 'react-native';
import api from '../../services/api';
import { bookingService } from '../../services/bookingService';
import {
  capabilityEnabled,
  failClosedCapabilities,
  getEffectiveCapabilities,
} from '../../services/capabilityService';
import { formatZAR } from '../../utils/formatters';
import { typography, spacing, borderRadius, shadows } from '../../theme';

const PALETTE = {
  cream: '#F7F4EF',
  surface: '#FFFCF7',
  ink: '#0F1F1B',
  muted: '#64706B',
  border: '#DDD8CF',
  emerald: '#12844E',
  emeraldSoft: '#E5F2EA',
  amber: '#F0A500',
  amberSoft: '#FFF3D5',
};

export default function PaymentScreen({ route }) {
  const routeBooking = route.params?.booking || null;
  const bookingId = route.params?.bookingId || routeBooking?.id;
  const [booking, setBooking] = useState(routeBooking);
  const [payment, setPayment] = useState(null);
  const [capabilities, setCapabilities] = useState(
    failClosedCapabilities('capability_check_pending')
  );
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    readPaymentState();
  }, [bookingId]);

  async function readPaymentState() {
    if (!bookingId) {
      setError('Payment details are unavailable because this booking has no ID.');
      setLoading(false);
      return;
    }

    setLoading(true);
    setError('');
    try {
      const capabilityResult = await getEffectiveCapabilities({ forceRefresh: true });
      setCapabilities(capabilityResult);

      if (!routeBooking) {
        const bookingResult = await bookingService.getBooking(bookingId);
        setBooking(bookingResult.booking);
      }

      try {
        const paymentResult = await api.get(`/api/payments/status/${bookingId}`, { timeout: 5000 });
        setPayment(paymentResult.data.payment || null);
      } catch (paymentError) {
        if (paymentError.response?.status === 404) {
          setPayment(null);
        } else {
          throw paymentError;
        }
      }
    } catch {
      setCapabilities(failClosedCapabilities('capability_data_unavailable'));
      setError('We could not refresh payment status. No payment was started or recorded.');
    } finally {
      setLoading(false);
    }
  }

  const amount = booking?.total_amount;
  const isPaid = payment?.status === 'paid' || booking?.payment_status === 'paid';
  const peachEnabled = capabilityEnabled(capabilities, 'peach_checkout');
  const cashSettlementEnabled = capabilityEnabled(capabilities, 'cash_settlement');

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.eyebrow}>PAYMENT</Text>
        <Text style={styles.headerTitle}>Clear, confirmed money</Text>
        <Text style={styles.headerAmount}>{formatZAR(amount || 0)}</Text>
      </View>

      <View style={styles.body}>
        {loading ? (
          <View style={styles.stateCard}>
            <ActivityIndicator size="small" color={PALETTE.emerald} />
            <Text style={styles.stateTitle}>Checking the server record</Text>
            <Text style={styles.stateText}>This read does not start checkout or change payment state.</Text>
          </View>
        ) : isPaid ? (
          <View style={[styles.stateCard, styles.confirmedCard]}>
            <Text style={styles.confirmedMark}>✓</Text>
            <Text style={styles.stateTitle}>Payment confirmed</Text>
            <Text style={styles.stateText}>
              TOGT's server record shows this payment as paid.
            </Text>
          </View>
        ) : (
          <View style={[styles.stateCard, styles.holdCard]}>
            <Text style={styles.holdMark}>i</Text>
            <Text style={styles.stateTitle}>Payment stays unpaid for now</Text>
            <Text style={styles.stateText}>
              Online checkout is not enabled in this internal build. Opening this screen did not create a charge.
            </Text>
          </View>
        )}

        <View style={styles.amountCard}>
          <View>
            <Text style={styles.amountLabel}>Amount shown on the job</Text>
            <Text style={styles.amountSupport}>Read-only booking total</Text>
          </View>
          <Text style={styles.amountValue}>{formatZAR(amount || 0)}</Text>
        </View>

        {!loading && !isPaid && (
          <View style={styles.optionsCard}>
            <Text style={styles.optionsTitle}>Available payment options</Text>
            <View style={styles.optionRow}>
              <Text style={styles.optionName}>Peach online checkout</Text>
              <Text style={styles.optionState}>{peachEnabled ? 'Available' : 'Not enabled'}</Text>
            </View>
            <View style={styles.divider} />
            <View style={styles.optionRow}>
              <Text style={styles.optionName}>Cash settlement in TOGT</Text>
              <Text style={styles.optionState}>{cashSettlementEnabled ? 'Available' : 'Not recorded'}</Text>
            </View>
            <Text style={styles.cashNote}>
              If you arrange cash directly, TOGT will not mark it settled until both-party confirmation and dispute handling are implemented.
            </Text>
          </View>
        )}

        {error ? (
          <View style={styles.errorCard}>
            <Text style={styles.errorText}>{error}</Text>
            <TouchableOpacity style={styles.retryButton} onPress={readPaymentState}>
              <Text style={styles.retryText}>Retry read</Text>
            </TouchableOpacity>
          </View>
        ) : null}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: PALETTE.cream },
  header: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.lg,
    paddingBottom: spacing.md,
  },
  eyebrow: {
    color: PALETTE.emerald,
    fontSize: typography.xs,
    fontWeight: '800',
    letterSpacing: 1.6,
    marginBottom: spacing.sm,
  },
  headerTitle: { color: PALETTE.ink, fontSize: typography.xl, fontWeight: '800' },
  headerAmount: {
    color: PALETTE.ink,
    fontSize: typography.xxl,
    fontWeight: '900',
    marginTop: spacing.xs,
  },
  body: { flex: 1, padding: spacing.lg, paddingTop: spacing.sm, gap: spacing.md },
  stateCard: {
    backgroundColor: PALETTE.surface,
    borderRadius: borderRadius.lg,
    padding: spacing.lg,
    alignItems: 'flex-start',
    borderWidth: 1,
    borderColor: PALETTE.border,
    gap: spacing.sm,
    ...shadows.card,
  },
  confirmedCard: { backgroundColor: PALETTE.emeraldSoft, borderColor: '#BFDCC9' },
  holdCard: { backgroundColor: PALETTE.amberSoft, borderColor: '#E9CF8F' },
  confirmedMark: {
    width: 32,
    height: 32,
    borderRadius: 16,
    textAlign: 'center',
    textAlignVertical: 'center',
    backgroundColor: PALETTE.emerald,
    color: '#FFFFFF',
    fontSize: typography.lg,
    fontWeight: '900',
  },
  holdMark: {
    width: 32,
    height: 32,
    borderRadius: 16,
    textAlign: 'center',
    textAlignVertical: 'center',
    backgroundColor: PALETTE.amber,
    color: PALETTE.ink,
    fontSize: typography.lg,
    fontWeight: '900',
  },
  stateTitle: { color: PALETTE.ink, fontSize: typography.lg, fontWeight: '800' },
  stateText: { color: PALETTE.muted, fontSize: typography.sm, lineHeight: 21 },
  amountCard: {
    backgroundColor: PALETTE.surface,
    borderRadius: borderRadius.md,
    padding: spacing.md,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: PALETTE.border,
  },
  amountLabel: { color: PALETTE.ink, fontSize: typography.sm, fontWeight: '700' },
  amountSupport: { color: PALETTE.muted, fontSize: typography.xs, marginTop: 3 },
  amountValue: { color: PALETTE.ink, fontSize: typography.lg, fontWeight: '900' },
  optionsCard: {
    backgroundColor: PALETTE.surface,
    borderRadius: borderRadius.md,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: PALETTE.border,
  },
  optionsTitle: { color: PALETTE.ink, fontSize: typography.md, fontWeight: '800', marginBottom: spacing.sm },
  optionRow: { flexDirection: 'row', justifyContent: 'space-between', gap: spacing.md, paddingVertical: spacing.sm },
  optionName: { color: PALETTE.ink, fontSize: typography.sm, flex: 1 },
  optionState: { color: PALETTE.muted, fontSize: typography.sm, fontWeight: '700' },
  divider: { height: 1, backgroundColor: PALETTE.border },
  cashNote: { color: PALETTE.muted, fontSize: typography.xs, lineHeight: 18, marginTop: spacing.sm },
  errorCard: { borderLeftWidth: 3, borderLeftColor: PALETTE.amber, paddingLeft: spacing.md, gap: spacing.sm },
  errorText: { color: PALETTE.ink, fontSize: typography.sm, lineHeight: 20 },
  retryButton: { alignSelf: 'flex-start', paddingVertical: spacing.sm, paddingHorizontal: spacing.md },
  retryText: { color: PALETTE.emerald, fontSize: typography.sm, fontWeight: '800' },
});
