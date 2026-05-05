import React, { useEffect, useRef, useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  StatusBar, ActivityIndicator, Alert, ScrollView, KeyboardAvoidingView, Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as Location from 'expo-location';
import { matchService } from '../../services/matchService';
import { colors, typography, spacing, borderRadius, shadows } from '../../theme';

const SKILLS = [
  'Plumbing', 'Electrical', 'Painting', 'Building', 'Tiling',
  'Carpentry', 'Cleaning', 'Garden', 'General Labour',
];

const POLL_MS = 2500;

export default function RequestMatchScreen({ navigation }) {
  const [skill, setSkill] = useState('Plumbing');
  const [address, setAddress] = useState('');
  const [coords, setCoords] = useState(null);
  const [hoursEst, setHoursEst] = useState('2');
  const [notes, setNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [matching, setMatching] = useState(false);
  const [matchId, setMatchId] = useState(null);
  const [matchStatus, setMatchStatus] = useState(null);
  const pollRef = useRef(null);

  useEffect(() => {
    (async () => {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('Location needed', 'We need your location to find labourers nearby.');
        return;
      }
      const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
      setCoords({ lat: loc.coords.latitude, lng: loc.coords.longitude });
    })();
  }, []);

  useEffect(() => {
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, []);

  async function onSubmit() {
    if (!coords) {
      Alert.alert('Location not ready', 'Waiting for GPS — try again in a sec.');
      return;
    }
    if (!address.trim()) {
      Alert.alert('Address required', 'Please enter the job address.');
      return;
    }
    const hrs = parseFloat(hoursEst);
    if (Number.isNaN(hrs) || hrs <= 0) {
      Alert.alert('Hours invalid', 'Please enter a positive number of hours.');
      return;
    }
    setSubmitting(true);
    try {
      const scheduled_at = new Date(Date.now() + 30 * 60 * 1000).toISOString(); // 30 min from now
      const match = await matchService.create({
        skill_needed: skill,
        address: address.trim(),
        location_lat: coords.lat,
        location_lng: coords.lng,
        scheduled_at,
        hours_est: hrs,
        notes: notes.trim() || undefined,
      });
      setMatchId(match.id);
      setMatchStatus('pending');
      setMatching(true);

      pollRef.current = setInterval(async () => {
        try {
          const r = await matchService.get(match.id);
          setMatchStatus(r.match.status);
          if (r.match.status === 'matched') {
            clearInterval(pollRef.current);
            navigation.replace('ActiveBooking', { bookingId: r.match.matched_booking_id });
          } else if (r.match.status === 'expired' || r.match.status === 'cancelled') {
            clearInterval(pollRef.current);
            setMatching(false);
            Alert.alert(
              r.match.status === 'expired' ? 'No labourer available' : 'Cancelled',
              r.match.expire_reason === 'no_candidates'
                ? 'No verified labourers available right now. Try a different skill or try again in a bit.'
                : r.match.expire_reason === 'all_declined'
                ? 'All nearby labourers declined. Try again.'
                : r.match.expire_reason === 'all_timeout'
                ? 'No labourer responded in time. Try again.'
                : 'The request was cancelled.'
            );
          }
        } catch (err) {
          console.warn('[match] poll failed', err.message);
        }
      }, POLL_MS);
    } catch (err) {
      const msg = err.response?.data?.error || 'Could not create match. Try again.';
      Alert.alert('Match failed', msg);
    } finally {
      setSubmitting(false);
    }
  }

  async function onCancel() {
    if (!matchId) return;
    try {
      await matchService.cancel(matchId);
    } catch (err) {
      if (err.response?.status === 409) {
        // Already matched — let the poll discover and navigate
        return;
      }
    }
    clearInterval(pollRef.current);
    setMatching(false);
    setMatchId(null);
    navigation.goBack();
  }

  if (matching) {
    return (
      <View style={styles.container}>
        <StatusBar barStyle="light-content" backgroundColor={colors.primary} />
        <SafeAreaView style={styles.matchingPane} edges={['top']}>
          <ActivityIndicator size="large" color={colors.accent} />
          <Text style={styles.matchingTitle}>Finding {skill.toLowerCase()} near you…</Text>
          <Text style={styles.matchingSub}>
            We're pinging the highest-rated labourers in your area. This usually
            takes under 2 minutes.
          </Text>
          <TouchableOpacity style={styles.cancelBtn} onPress={onCancel}>
            <Text style={styles.cancelBtnText}>Cancel</Text>
          </TouchableOpacity>
        </SafeAreaView>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor={colors.primary} />
      <SafeAreaView style={{ flex: 1 }} edges={['top']}>
        <KeyboardAvoidingView
          style={{ flex: 1 }}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >
          <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
            <Text style={styles.title}>Request now</Text>
            <Text style={styles.sub}>
              Tap one button — we ping the closest, highest-rated, verified labourer.
            </Text>

            <Text style={styles.label}>What do you need?</Text>
            <View style={styles.skillsGrid}>
              {SKILLS.map((s) => (
                <TouchableOpacity
                  key={s}
                  style={[styles.skillChip, skill === s && styles.skillChipActive]}
                  onPress={() => setSkill(s)}
                >
                  <Text style={[styles.skillText, skill === s && styles.skillTextActive]}>{s}</Text>
                </TouchableOpacity>
              ))}
            </View>

            <Text style={styles.label}>Address</Text>
            <TextInput
              style={styles.input}
              value={address}
              onChangeText={setAddress}
              placeholder="e.g. 16 Beach Road, Ballito"
              placeholderTextColor={colors.textMuted}
              editable={!submitting}
            />

            <Text style={styles.label}>Estimated hours</Text>
            <TextInput
              style={styles.input}
              value={hoursEst}
              onChangeText={setHoursEst}
              keyboardType="decimal-pad"
              placeholder="2"
              placeholderTextColor={colors.textMuted}
              editable={!submitting}
            />

            <Text style={styles.label}>Notes (optional)</Text>
            <TextInput
              style={[styles.input, styles.textarea]}
              value={notes}
              onChangeText={setNotes}
              multiline
              placeholder="Anything the labourer should know"
              placeholderTextColor={colors.textMuted}
              editable={!submitting}
            />

            <TouchableOpacity style={styles.submitBtn} onPress={onSubmit} disabled={submitting || !coords}>
              {submitting ? (
                <ActivityIndicator color={colors.primary} />
              ) : (
                <Text style={styles.submitBtnText}>
                  {coords ? 'Find a ' + skill.toLowerCase() : 'Locating you…'}
                </Text>
              )}
            </TouchableOpacity>
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.primary },
  scroll: { padding: spacing.lg, paddingBottom: spacing.xl },
  title: { fontSize: typography.xxl, fontWeight: '800', color: colors.textInverse, marginBottom: spacing.xs },
  sub: { fontSize: typography.sm, color: colors.textMuted, marginBottom: spacing.lg, lineHeight: 20 },
  label: { fontSize: typography.sm, fontWeight: '700', color: colors.textInverse, marginTop: spacing.md, marginBottom: spacing.sm },
  skillsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  skillChip: {
    backgroundColor: 'rgba(255,255,255,0.1)',
    paddingHorizontal: spacing.md, paddingVertical: spacing.sm,
    borderRadius: borderRadius.full,
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.2)',
  },
  skillChipActive: { backgroundColor: colors.accent, borderColor: colors.accent },
  skillText: { color: colors.textMuted, fontSize: typography.sm, fontWeight: '600' },
  skillTextActive: { color: colors.primary, fontWeight: '700' },
  input: {
    backgroundColor: '#fff', borderRadius: borderRadius.sm,
    paddingHorizontal: spacing.md, paddingVertical: spacing.sm + 4,
    fontSize: typography.md, color: colors.textPrimary,
  },
  textarea: { minHeight: 90, textAlignVertical: 'top' },
  submitBtn: {
    backgroundColor: colors.accent, borderRadius: borderRadius.md,
    paddingVertical: spacing.md, alignItems: 'center',
    marginTop: spacing.lg, ...shadows.card,
  },
  submitBtnText: { color: colors.primary, fontSize: typography.lg, fontWeight: '800' },
  matchingPane: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: spacing.xl },
  matchingTitle: { fontSize: typography.xl, fontWeight: '800', color: colors.textInverse, marginTop: spacing.lg, textAlign: 'center' },
  matchingSub: { fontSize: typography.sm, color: colors.textMuted, marginTop: spacing.md, textAlign: 'center', lineHeight: 20, paddingHorizontal: spacing.lg },
  cancelBtn: {
    marginTop: spacing.xl, paddingHorizontal: spacing.lg, paddingVertical: spacing.md,
    borderRadius: borderRadius.md, borderWidth: 1, borderColor: colors.textMuted,
  },
  cancelBtnText: { color: colors.textMuted, fontWeight: '600' },
});
