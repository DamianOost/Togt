import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import api from '../../services/api';
import {
  capabilityEnabled,
  failClosedCapabilities,
  getEffectiveCapabilities,
} from '../../services/capabilityService';

const CREAM = '#F7F4EF';
const INK = '#0F1F1B';
const EMERALD = '#12844E';
const AMBER = '#F0A500';

function formatStatus(value) {
  if (!value || value === 'unverified') return 'Not verified';
  if (value === 'pending') return 'Pending review';
  if (value === 'failed') return 'Check unsuccessful';
  if (value === 'verified') return 'Verified';
  return 'Status unavailable';
}

export default function KYCScreen({ navigation }) {
  const [loading, setLoading] = useState(true);
  const [verification, setVerification] = useState(null);
  const [capabilities, setCapabilities] = useState(() => failClosedCapabilities('not_loaded'));

  useEffect(() => {
    let active = true;
    Promise.allSettled([
      getEffectiveCapabilities({ forceRefresh: true }),
      api.get('/api/kyc/status'),
    ]).then(([capabilityResult, statusResult]) => {
      if (!active) return;
      if (capabilityResult.status === 'fulfilled') setCapabilities(capabilityResult.value);
      if (statusResult.status === 'fulfilled') {
        const body = statusResult.value.data;
        setVerification(body.verification || { status: body.kyc_status });
      }
      setLoading(false);
    });
    return () => { active = false; };
  }, []);

  const identityAvailable = capabilityEnabled(capabilities, 'identity_verification');
  const status = formatStatus(verification?.status);

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView contentContainerStyle={styles.content}>
        <TouchableOpacity style={styles.backButton} onPress={() => navigation.goBack()}>
          <Text style={styles.backText}>← Back</Text>
        </TouchableOpacity>

        <Text style={styles.eyebrow}>TRUST STATUS</Text>
        <Text style={styles.title}>Identity checks</Text>
        <Text style={styles.subtitle}>
          Your account shows only verification outcomes backed by a supported provider.
        </Text>

        <View style={styles.statusCard}>
          <Text style={styles.statusLabel}>Current status</Text>
          {loading ? (
            <ActivityIndicator color={EMERALD} style={styles.spinner} />
          ) : (
            <Text style={styles.statusValue}>{status}</Text>
          )}
          {verification?.id_last4 ? (
            <Text style={styles.detail}>Submitted ID ending •••• {verification.id_last4}</Text>
          ) : null}
        </View>

        <View style={styles.noticeCard}>
          <Text style={styles.noticeMark}>{identityAvailable ? 'i' : '!'}</Text>
          <View style={styles.noticeCopy}>
            <Text style={styles.noticeTitle}>
              {identityAvailable ? 'Provider available' : 'Identity verification is unavailable'}
            </Text>
            <Text style={styles.noticeText}>
              {identityAvailable
                ? 'Verification can begin when the approved provider flow is connected to this screen.'
                : 'This internal build cannot complete a production identity or selfie check. No verified badge will be issued here.'}
            </Text>
          </View>
        </View>

        <Text style={styles.footnote}>
          Identity, skills, background checks and insurance are separate trust signals.
        </Text>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: CREAM },
  content: { padding: 24, paddingTop: 20 },
  backButton: { alignSelf: 'flex-start', paddingVertical: 10, marginBottom: 30 },
  backText: { color: EMERALD, fontSize: 15, fontWeight: '700' },
  eyebrow: { color: EMERALD, fontSize: 12, fontWeight: '800', letterSpacing: 1.6, marginBottom: 10 },
  title: { color: INK, fontSize: 32, fontWeight: '800', letterSpacing: -0.7 },
  subtitle: { color: '#50605B', fontSize: 16, lineHeight: 24, marginTop: 10, marginBottom: 28 },
  statusCard: {
    backgroundColor: '#FFFFFF', borderColor: '#E2DED5', borderWidth: 1,
    borderRadius: 20, padding: 20, minHeight: 116,
  },
  statusLabel: { color: '#66736F', fontSize: 12, fontWeight: '700', letterSpacing: 0.8, textTransform: 'uppercase' },
  statusValue: { color: INK, fontSize: 22, fontWeight: '800', marginTop: 10 },
  spinner: { alignSelf: 'flex-start', marginTop: 14 },
  detail: { color: '#66736F', fontSize: 13, marginTop: 8 },
  noticeCard: {
    flexDirection: 'row', backgroundColor: '#FFF8E8', borderColor: '#F3D490',
    borderWidth: 1, borderRadius: 20, padding: 18, marginTop: 16,
  },
  noticeMark: {
    width: 30, height: 30, borderRadius: 15, backgroundColor: AMBER,
    color: INK, textAlign: 'center', lineHeight: 30, fontWeight: '900', marginRight: 12,
  },
  noticeCopy: { flex: 1 },
  noticeTitle: { color: INK, fontSize: 16, fontWeight: '800', marginBottom: 6 },
  noticeText: { color: '#59635F', fontSize: 14, lineHeight: 21 },
  footnote: { color: '#6D7773', fontSize: 13, lineHeight: 20, marginTop: 24 },
});
