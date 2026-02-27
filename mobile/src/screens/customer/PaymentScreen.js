import React, { useEffect, useState } from 'react';
import {
  View, Text, StyleSheet, ActivityIndicator, SafeAreaView, Alert,
} from 'react-native';
import { WebView } from 'react-native-webview';
import api from '../../services/api';
import { formatZAR } from '../../utils/formatters';

export default function PaymentScreen({ route, navigation }) {
  const { booking } = route.params;
  const [checkoutData, setCheckoutData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function initPayment() {
      try {
        const res = await api.post('/payments/initiate', { booking_id: booking.id });
        setCheckoutData(res.data);
      } catch (err) {
        Alert.alert('Payment Error', err.response?.data?.error || 'Could not initiate payment.');
        navigation.goBack();
      } finally {
        setLoading(false);
      }
    }
    initPayment();
  }, []);

  function handleNavigationChange(navState) {
    // Peach Payments redirects to a success/failure URL
    const url = navState.url;
    if (url.includes('result=success') || url.includes('paymentStatus=COMPLETED')) {
      Alert.alert('Payment Successful', 'Your payment has been processed!', [
        {
          text: 'OK',
          onPress: () =>
            navigation.replace('Rate', { booking }),
        },
      ]);
    } else if (url.includes('result=error') || url.includes('paymentStatus=FAILED')) {
      Alert.alert('Payment Failed', 'Your payment could not be processed. Please try again.', [
        { text: 'OK', onPress: () => navigation.goBack() },
      ]);
    }
  }

  if (loading) {
    return (
      <SafeAreaView style={styles.loading}>
        <ActivityIndicator size="large" color="#1A6B3A" />
        <Text style={styles.loadingText}>Setting up payment...</Text>
      </SafeAreaView>
    );
  }

  // Peach Payments hosted checkout HTML
  const checkoutHtml = `
    <!DOCTYPE html>
    <html>
      <head>
        <meta name="viewport" content="width=device-width, initial-scale=1">
        <style>
          body { font-family: sans-serif; padding: 20px; background: #f9fafb; }
          .amount { font-size: 24px; font-weight: bold; color: #1A6B3A; text-align: center; margin: 20px 0; }
        </style>
      </head>
      <body>
        <p class="amount">Pay ${formatZAR(booking.total_amount)}</p>
        <form action="${checkoutData?.checkoutUrl || ''}" class="paymentWidgets" data-brands="VISA MASTER AMEX"></form>
        <script async src="${checkoutData?.checkoutUrl}"></script>
      </body>
    </html>
  `;

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Complete Payment</Text>
        <Text style={styles.amount}>{formatZAR(booking.total_amount)}</Text>
      </View>
      <WebView
        source={{ html: checkoutHtml }}
        onNavigationStateChange={handleNavigationChange}
        style={styles.webview}
        startInLoadingState
        renderLoading={() => <ActivityIndicator style={styles.webviewLoading} color="#1A6B3A" />}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F9FAFB' },
  loading: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  loadingText: { marginTop: 12, color: '#6B7280', fontSize: 15 },
  header: { padding: 16, backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: '#E5E7EB', alignItems: 'center' },
  title: { fontSize: 16, fontWeight: '700', color: '#111827' },
  amount: { fontSize: 24, fontWeight: '800', color: '#1A6B3A', marginTop: 4 },
  webview: { flex: 1 },
  webviewLoading: { flex: 1 },
});
