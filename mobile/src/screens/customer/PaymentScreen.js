import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  SafeAreaView,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
} from 'react-native';
import api from '../../services/api';
import { formatZAR } from '../../utils/formatters';
import { colors, typography, spacing, borderRadius, shadows } from '../../theme';

export default function PaymentScreen({ route, navigation }) {
  const { booking } = route.params;
  const [configured, setConfigured] = useState(null); // null = loading
  const [marking, setMarking] = useState(false);

  useEffect(() => {
    checkPaymentConfig();
  }, []);

  async function checkPaymentConfig() {
    try {
      const res = await api.post('/api/payments/initiate', { booking_id: booking.id });
      // If we get a checkout URL back, Peach is configured
      if (res.data?.checkoutUrl) {
        setConfigured(true);
        // NOTE: Full WebView flow could be added here; for now just show configured state
      } else {
        setConfigured(false);
      }
    } catch (err) {
      // 500/config error = not configured; 402/etc = some other issue
      const errMsg = err.response?.data?.error || '';
      const notConfigured =
        errMsg.toLowerCase().includes('not configured') ||
        errMsg.toLowerCase().includes('peach') ||
        err.response?.status === 500;
      setConfigured(!notConfigured);
    }
  }

  async function handleCashPayment() {
    Alert.alert(
      'Mark as Cash Payment?',
      'This will mark the booking as paid via cash. The labourer will be notified.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Confirm Cash',
          onPress: async () => {
            setMarking(true);
            try {
              await api.post('/api/payments/cash', { booking_id: booking.id });
              Alert.alert('✅ Payment Recorded', 'Cash payment marked successfully.', [
                {
                  text: 'Rate Labourer',
                  onPress: () => navigation.replace('Rate', { booking }),
                },
              ]);
            } catch (err) {
              Alert.alert('Error', err.response?.data?.error || 'Could not record payment.');
            } finally {
              setMarking(false);
            }
          },
        },
      ]
    );
  }

  if (configured === null) {
    return (
      <SafeAreaView style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={colors.accent} />
        <Text style={styles.loadingText}>Checking payment options...</Text>
      </SafeAreaView>
    );
  }

  if (!configured) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.header}>
          <Text style={styles.headerTitle}>Complete Payment</Text>
          <Text style={styles.headerAmount}>{formatZAR(booking.total_amount)}</Text>
        </View>

        <View style={styles.body}>
          <View style={styles.comingSoonCard}>
            <Text style={styles.comingSoonIcon}>💳</Text>
            <Text style={styles.comingSoonTitle}>Online Payment Coming Soon</Text>
            <Text style={styles.comingSoonText}>
              Card and EFT payment integration is being set up. In the meantime, you can pay
              in cash directly to the labourer.
            </Text>
          </View>

          <View style={styles.amountRow}>
            <Text style={styles.amountLabel}>Amount due</Text>
            <Text style={styles.amountValue}>{formatZAR(booking.total_amount)}</Text>
          </View>

          <TouchableOpacity
            style={styles.cashBtn}
            onPress={handleCashPayment}
            disabled={marking}
          >
            {marking ? (
              <ActivityIndicator color={colors.primary} />
            ) : (
              <>
                <Text style={styles.cashBtnIcon}>💵</Text>
                <Text style={styles.cashBtnText}>Mark as Cash Payment</Text>
              </>
            )}
          </TouchableOpacity>

          <Text style={styles.cashNote}>
            Tap above once you've paid in cash to complete the booking.
          </Text>
        </View>
      </SafeAreaView>
    );
  }

  // Configured state — payment integration available
  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Complete Payment</Text>
        <Text style={styles.headerAmount}>{formatZAR(booking.total_amount)}</Text>
      </View>
      <View style={styles.body}>
        <View style={styles.comingSoonCard}>
          <Text style={styles.comingSoonIcon}>✅</Text>
          <Text style={styles.comingSoonTitle}>Payment Ready</Text>
          <Text style={styles.comingSoonText}>
            Proceed to complete your payment securely.
          </Text>
        </View>
        <TouchableOpacity
          style={styles.cashBtn}
          onPress={handleCashPayment}
          disabled={marking}
        >
          <Text style={styles.cashBtnIcon}>💵</Text>
          <Text style={styles.cashBtnText}>Pay in Cash Instead</Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f8f9fa' },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    gap: spacing.sm,
  },
  loadingText: { color: colors.textMuted, fontSize: typography.sm },

  header: {
    backgroundColor: colors.primary,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.lg,
    alignItems: 'center',
  },
  headerTitle: {
    color: '#fff',
    fontSize: typography.md,
    fontWeight: '700',
    marginBottom: spacing.xs,
  },
  headerAmount: {
    color: colors.accent,
    fontSize: typography.xxl,
    fontWeight: '900',
  },

  body: {
    flex: 1,
    padding: spacing.lg,
    gap: spacing.md,
  },

  comingSoonCard: {
    backgroundColor: '#fff',
    borderRadius: borderRadius.lg,
    padding: spacing.lg,
    alignItems: 'center',
    gap: spacing.sm,
    ...shadows.card,
  },
  comingSoonIcon: { fontSize: 48 },
  comingSoonTitle: {
    fontSize: typography.lg,
    fontWeight: '800',
    color: colors.textPrimary,
    textAlign: 'center',
  },
  comingSoonText: {
    fontSize: typography.sm,
    color: colors.textMuted,
    textAlign: 'center',
    lineHeight: 20,
  },

  amountRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#fff',
    borderRadius: borderRadius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    ...shadows.card,
  },
  amountLabel: {
    fontSize: typography.sm,
    color: colors.textSecondary,
    fontWeight: '600',
  },
  amountValue: {
    fontSize: typography.lg,
    fontWeight: '800',
    color: colors.textPrimary,
  },

  cashBtn: {
    backgroundColor: colors.accent,
    borderRadius: borderRadius.lg,
    paddingVertical: spacing.md + 4,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    ...shadows.heavy,
  },
  cashBtnIcon: { fontSize: 22 },
  cashBtnText: {
    color: colors.primary,
    fontWeight: '800',
    fontSize: typography.lg,
  },

  cashNote: {
    fontSize: typography.xs,
    color: colors.textMuted,
    textAlign: 'center',
    lineHeight: 18,
  },
});
