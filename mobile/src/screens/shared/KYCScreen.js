import React, { useState, useRef } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  SafeAreaView,
  ScrollView,
  ActivityIndicator,
  Alert,
  Platform,
} from 'react-native';
import { useDispatch, useSelector } from 'react-redux';
import Constants from 'expo-constants';
import api from '../../services/api';
import { updateUser } from '../../store/authSlice';

// ─── SA ID validation (Luhn check) ────────────────────────────────────────────
function validateSAID(id) {
  if (!/^\d{13}$/.test(id)) return false;
  let sum = 0;
  for (let i = 0; i < 12; i++) {
    let digit = parseInt(id[i], 10);
    if (i % 2 === 1) {
      digit *= 2;
      if (digit > 9) digit -= 9;
    }
    sum += digit;
  }
  return (10 - (sum % 10)) % 10 === parseInt(id[12], 10);
}

const STEPS = {
  INTRO: 'intro',
  ID_ENTRY: 'id_entry',
  SELFIE: 'selfie',
  SUCCESS: 'success',
};

export default function KYCScreen({ navigation }) {
  const dispatch = useDispatch();
  const { user } = useSelector((s) => s.auth);

  const [step, setStep] = useState(STEPS.INTRO);
  const [idNumber, setIdNumber] = useState('');
  const [idError, setIdError] = useState('');
  const [loading, setLoading] = useState(false);
  const [verifiedName, setVerifiedName] = useState('');

  // ─── Step handlers ────────────────────────────────────────────────────────

  function handleIDChange(text) {
    const digits = text.replace(/\D/g, '').slice(0, 13);
    setIdNumber(digits);
    if (idError && digits.length < 13) setIdError('');
  }

  async function handleVerifyID() {
    if (!validateSAID(idNumber)) {
      setIdError('Please enter a valid 13-digit South African ID number.');
      return;
    }
    setIdError('');
    setLoading(true);

    try {
      const nameParts = (user?.name || 'User').split(' ');
      const firstName = nameParts[0];
      const lastName = nameParts.slice(1).join(' ') || nameParts[0];

      const res = await api.post('/api/kyc/verify-id', {
        idNumber,
        firstName,
        lastName,
        country: 'ZA',
        idType: 'NATIONAL_ID',
      });

      if (res.data.verified) {
        setVerifiedName(res.data.name || user?.name || '');
        setStep(STEPS.SELFIE);
      } else {
        Alert.alert(
          'ID Not Verified',
          'We could not verify your ID number. Please check and try again.',
          [{ text: 'Try Again' }]
        );
      }
    } catch (err) {
      Alert.alert(
        'Error',
        err.response?.data?.error || 'Could not verify ID. Please try again.',
        [{ text: 'OK' }]
      );
    } finally {
      setLoading(false);
    }
  }

  async function handleSelfieCapture() {
    // In Expo Go / managed workflow: use expo-image-picker
    setLoading(true);
    try {
      const ImagePicker = await import('expo-image-picker');

      const permission = await ImagePicker.requestCameraPermissionsAsync();
      if (!permission.granted) {
        Alert.alert(
          'Camera Permission Required',
          'Please allow camera access to take a selfie.',
          [{ text: 'OK' }]
        );
        setLoading(false);
        return;
      }

      const result = await ImagePicker.launchCameraAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: true,
        aspect: [1, 1],
        quality: 0.6,
        base64: true,
        cameraType: ImagePicker.CameraType.front,
      });

      if (result.canceled) {
        setLoading(false);
        return;
      }

      const base64 = result.assets?.[0]?.base64;
      if (!base64) {
        Alert.alert('Error', 'Could not capture selfie image. Please try again.');
        setLoading(false);
        return;
      }

      await submitSelfie(base64);
    } catch (err) {
      console.error('[KYC] selfie error:', err);
      Alert.alert('Error', 'Camera is not available. Try the demo mode instead.', [
        { text: 'Use Demo Mode', onPress: () => handleSimulateSelfie() },
        { text: 'Cancel' },
      ]);
      setLoading(false);
    }
  }

  async function handleSimulateSelfie() {
    // Sandbox / demo mode — sends a placeholder base64 image
    setLoading(true);
    try {
      // Tiny 1x1 pixel PNG as placeholder
      const demoBase64 =
        'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';
      await submitSelfie(demoBase64);
    } catch (err) {
      Alert.alert('Error', 'Simulation failed. Please try again.');
      setLoading(false);
    }
  }

  async function submitSelfie(base64) {
    try {
      const res = await api.post('/api/kyc/selfie-enroll', {
        selfieBase64: base64,
        idNumber,
      });

      if (res.data.enrolled) {
        // Refresh user in Redux store
        try {
          const meRes = await api.get('/api/auth/me');
          if (meRes.data.user) {
            dispatch(updateUser(meRes.data.user));
          }
        } catch (_) {
          // non-fatal
        }
        setStep(STEPS.SUCCESS);
      } else {
        Alert.alert(
          'Selfie Check Failed',
          'We could not match your selfie. Please try again.',
          [{ text: 'Retry' }]
        );
      }
    } catch (err) {
      Alert.alert(
        'Error',
        err.response?.data?.error || 'Could not submit selfie. Please try again.',
        [{ text: 'OK' }]
      );
    } finally {
      setLoading(false);
    }
  }

  function handleDone() {
    if (navigation.canGoBack()) {
      navigation.goBack();
    } else {
      navigation.navigate('Home');
    }
  }

  // ─── Render steps ─────────────────────────────────────────────────────────

  if (step === STEPS.INTRO) {
    return (
      <SafeAreaView style={styles.container}>
        <ScrollView contentContainerStyle={styles.scroll}>
          <View style={styles.iconWrap}>
            <Text style={styles.icon}>🪪</Text>
          </View>

          <Text style={styles.title}>Verify Your Identity</Text>
          <Text style={styles.subtitle}>Takes about 2 minutes</Text>

          <View style={styles.card}>
            <Text style={styles.cardTitle}>Why we verify</Text>
            {[
              '🔒  Safety — protect all users on the platform',
              '🤝  Trust — customers know who they are hiring',
              '📋  Compliance — required by South African law',
            ].map((item) => (
              <Text key={item} style={styles.bullet}>
                {item}
              </Text>
            ))}
          </View>

          <View style={styles.stepsCard}>
            <Text style={styles.cardTitle}>What you'll need</Text>
            <Text style={styles.bullet}>📋  Your 13-digit SA ID number</Text>
            <Text style={styles.bullet}>🤳  A selfie (we'll use your camera)</Text>
          </View>

          <TouchableOpacity style={styles.goldBtn} onPress={() => setStep(STEPS.ID_ENTRY)}>
            <Text style={styles.goldBtnText}>Start Verification →</Text>
          </TouchableOpacity>

          {navigation.canGoBack() && (
            <TouchableOpacity style={styles.skipBtn} onPress={() => navigation.goBack()}>
              <Text style={styles.skipText}>Skip for now</Text>
            </TouchableOpacity>
          )}
        </ScrollView>
      </SafeAreaView>
    );
  }

  if (step === STEPS.ID_ENTRY) {
    const idValid = validateSAID(idNumber);
    return (
      <SafeAreaView style={styles.container}>
        <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
          <TouchableOpacity style={styles.backBtn} onPress={() => setStep(STEPS.INTRO)}>
            <Text style={styles.backText}>← Back</Text>
          </TouchableOpacity>

          <View style={styles.stepIndicator}>
            <Text style={styles.stepText}>Step 1 of 2</Text>
          </View>

          <Text style={styles.title}>Enter Your ID Number</Text>
          <Text style={styles.subtitle}>Your 13-digit South African ID number</Text>

          <TextInput
            style={[styles.idInput, idError ? styles.inputError : null]}
            placeholder="e.g. 9001015009087"
            value={idNumber}
            onChangeText={handleIDChange}
            keyboardType="number-pad"
            maxLength={13}
            autoFocus
          />

          <View style={styles.idStatus}>
            {idNumber.length > 0 && (
              <Text style={[styles.idStatusText, idNumber.length < 13 ? styles.textMuted : idValid ? styles.textGreen : styles.textRed]}>
                {idNumber.length < 13
                  ? `${idNumber.length}/13 digits`
                  : idValid
                  ? '✓ Valid format'
                  : '✗ Invalid ID number'}
              </Text>
            )}
          </View>

          {idError ? <Text style={styles.errorText}>{idError}</Text> : null}

          <TouchableOpacity
            style={[styles.goldBtn, (!idValid || loading) && styles.btnDisabled]}
            onPress={handleVerifyID}
            disabled={!idValid || loading}
          >
            {loading ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.goldBtnText}>Verify ID →</Text>
            )}
          </TouchableOpacity>

          <Text style={styles.privacyNote}>
            🔐 Your ID number is encrypted and only used for verification. We do not store it in plain text.
          </Text>
        </ScrollView>
      </SafeAreaView>
    );
  }

  if (step === STEPS.SELFIE) {
    return (
      <SafeAreaView style={styles.container}>
        <ScrollView contentContainerStyle={styles.scroll}>
          <View style={styles.stepIndicator}>
            <Text style={styles.stepText}>Step 2 of 2</Text>
          </View>

          <Text style={styles.title}>Take a Selfie</Text>
          <Text style={styles.subtitle}>Look straight at the camera in good lighting</Text>

          {/* Oval face guide */}
          <View style={styles.ovalWrap}>
            <View style={styles.oval}>
              <Text style={styles.ovalText}>👤</Text>
            </View>
            <Text style={styles.ovalHint}>Position your face in the oval</Text>
          </View>

          <TouchableOpacity
            style={[styles.goldBtn, loading && styles.btnDisabled]}
            onPress={handleSelfieCapture}
            disabled={loading}
          >
            {loading ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.goldBtnText}>📸 Take Selfie</Text>
            )}
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.outlineBtn, loading && styles.btnDisabled]}
            onPress={handleSimulateSelfie}
            disabled={loading}
          >
            <Text style={styles.outlineBtnText}>🧪 Simulate Selfie (Demo Mode)</Text>
          </TouchableOpacity>

          <Text style={styles.privacyNote}>
            🔐 Your selfie is used only for identity matching and is not stored on our servers.
          </Text>
        </ScrollView>
      </SafeAreaView>
    );
  }

  if (step === STEPS.SUCCESS) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.successWrap}>
          <Text style={styles.successIcon}>✅</Text>
          <Text style={styles.successTitle}>Identity Verified!</Text>
          {verifiedName ? (
            <Text style={styles.successName}>{verifiedName}</Text>
          ) : null}
          <Text style={styles.successSub}>
            Your account is now verified. You can book and work with confidence.
          </Text>

          <TouchableOpacity style={styles.goldBtn} onPress={handleDone}>
            <Text style={styles.goldBtnText}>Continue →</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  return null;
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const GOLD = '#C9A84C';
const GREEN = '#1A6B3A';
const BG = '#F9FAFB';

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: BG },
  scroll: { padding: 24, paddingTop: 40 },

  backBtn: { marginBottom: 16 },
  backText: { color: GREEN, fontWeight: '600', fontSize: 15 },

  stepIndicator: {
    alignSelf: 'flex-start',
    backgroundColor: '#E8F5EC',
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 4,
    marginBottom: 16,
  },
  stepText: { color: GREEN, fontWeight: '600', fontSize: 13 },

  iconWrap: { alignItems: 'center', marginBottom: 16 },
  icon: { fontSize: 64 },

  title: { fontSize: 26, fontWeight: '800', color: '#111827', marginBottom: 6 },
  subtitle: { fontSize: 15, color: '#6B7280', marginBottom: 24 },

  card: {
    backgroundColor: '#fff',
    borderRadius: 14,
    padding: 18,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  stepsCard: {
    backgroundColor: '#fff',
    borderRadius: 14,
    padding: 18,
    marginBottom: 24,
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  cardTitle: { fontSize: 16, fontWeight: '700', color: '#111827', marginBottom: 10 },
  bullet: { fontSize: 14, color: '#374151', marginBottom: 6, lineHeight: 20 },

  idInput: {
    backgroundColor: '#fff',
    borderWidth: 1.5,
    borderColor: '#E5E7EB',
    borderRadius: 12,
    padding: 16,
    fontSize: 22,
    fontWeight: '700',
    letterSpacing: 3,
    color: '#111827',
    textAlign: 'center',
    marginBottom: 8,
  },
  inputError: { borderColor: '#EF4444' },

  idStatus: { alignItems: 'center', marginBottom: 8 },
  idStatusText: { fontSize: 14, fontWeight: '600' },
  textMuted: { color: '#9CA3AF' },
  textGreen: { color: '#059669' },
  textRed: { color: '#EF4444' },

  errorText: { color: '#EF4444', fontSize: 14, marginBottom: 12, textAlign: 'center' },

  goldBtn: {
    backgroundColor: GOLD,
    borderRadius: 14,
    paddingVertical: 16,
    alignItems: 'center',
    marginTop: 8,
    marginBottom: 12,
    shadowColor: GOLD,
    shadowOpacity: 0.3,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
    elevation: 4,
  },
  goldBtnText: { color: '#fff', fontSize: 16, fontWeight: '800' },
  btnDisabled: { opacity: 0.5 },

  outlineBtn: {
    borderWidth: 1.5,
    borderColor: '#D1D5DB',
    borderRadius: 14,
    paddingVertical: 14,
    alignItems: 'center',
    marginBottom: 12,
    backgroundColor: '#fff',
  },
  outlineBtnText: { color: '#374151', fontSize: 15, fontWeight: '600' },

  skipBtn: { alignItems: 'center', marginTop: 8 },
  skipText: { color: '#9CA3AF', fontSize: 14 },

  privacyNote: {
    fontSize: 12,
    color: '#9CA3AF',
    textAlign: 'center',
    marginTop: 8,
    lineHeight: 18,
  },

  ovalWrap: { alignItems: 'center', marginVertical: 24 },
  oval: {
    width: 180,
    height: 220,
    borderRadius: 90,
    borderWidth: 3,
    borderColor: GOLD,
    borderStyle: 'dashed',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FFFBF0',
  },
  ovalText: { fontSize: 80 },
  ovalHint: { color: '#9CA3AF', fontSize: 13, marginTop: 12 },

  successWrap: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 32,
  },
  successIcon: { fontSize: 80, marginBottom: 20 },
  successTitle: { fontSize: 28, fontWeight: '800', color: '#111827', marginBottom: 8 },
  successName: { fontSize: 18, fontWeight: '700', color: GREEN, marginBottom: 8 },
  successSub: { fontSize: 15, color: '#6B7280', textAlign: 'center', marginBottom: 32, lineHeight: 22 },
});
