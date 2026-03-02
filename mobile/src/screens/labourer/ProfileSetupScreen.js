import React, { useState, useEffect } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, ScrollView,
  StyleSheet, SafeAreaView, Alert, ActivityIndicator, Image,
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import api from '../../services/api';

const ALL_SKILLS = [
  'Plumbing', 'Electrical', 'Painting', 'Building', 'Tiling',
  'Carpentry', 'Cleaning', 'Garden', 'Welding', 'Plastering',
  'Roofing', 'Paving', 'Glazing', 'Security', 'Moving',
];

export default function ProfileSetupScreen({ navigation }) {
  const [skills, setSkills] = useState([]);
  const [hourlyRate, setHourlyRate] = useState('');
  const [bio, setBio] = useState('');
  const [emergencyContact, setEmergencyContact] = useState('');
  const [idNumber, setIdNumber] = useState('');
  const [avatarUri, setAvatarUri] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    async function loadProfile() {
      try {
        const res = await api.get('/labourers/profile');
        const p = res.data.profile;
        setSkills(p.skills || []);
        setHourlyRate(String(p.hourly_rate || ''));
        setBio(p.bio || '');
        setEmergencyContact(p.emergency_contact || '');
        setIdNumber(p.id_number || '');
      } finally {
        setLoading(false);
      }
    }
    loadProfile();
  }, []);

  function toggleSkill(skill) {
    setSkills((prev) =>
      prev.includes(skill) ? prev.filter((s) => s !== skill) : [...prev, skill]
    );
  }

  async function pickImage() {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.7,
    });
    if (!result.canceled) {
      setAvatarUri(result.assets[0].uri);
    }
  }

  async function handleSave() {
    if (skills.length === 0) {
      Alert.alert('Skills required', 'Please select at least one skill.');
      return;
    }
    if (!hourlyRate || isNaN(parseFloat(hourlyRate))) {
      Alert.alert('Rate required', 'Please enter a valid hourly rate.');
      return;
    }

    setSaving(true);
    try {
      await api.put('/labourers/profile', {
        skills,
        hourly_rate: parseFloat(hourlyRate),
        bio: bio.trim() || undefined,
        emergency_contact: emergencyContact.trim() || undefined,
        id_number: idNumber.trim() || undefined,
      });

      if (avatarUri) {
        // In production, upload to storage first; for now pass URI directly
        await api.put('/labourers/avatar', { avatar_url: avatarUri });
      }

      Alert.alert('Saved!', 'Profile updated successfully.');
      navigation.goBack();
    } catch (err) {
      Alert.alert('Error', err.response?.data?.error || 'Could not save profile.');
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <ActivityIndicator style={{ flex: 1 }} color="#1A6B3A" />;

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">

        {/* Avatar */}
        <TouchableOpacity style={styles.avatarContainer} onPress={pickImage}>
          {avatarUri ? (
            <Image source={{ uri: avatarUri }} style={styles.avatar} />
          ) : (
            <View style={styles.avatarPlaceholder}>
              <Text style={styles.avatarPlaceholderText}>Add Photo</Text>
            </View>
          )}
        </TouchableOpacity>

        {/* Skills */}
        <Text style={styles.label}>Your Skills *</Text>
        <Text style={styles.sublabel}>Select all that apply</Text>
        <View style={styles.skillsGrid}>
          {ALL_SKILLS.map((s) => (
            <TouchableOpacity
              key={s}
              style={[styles.skillChip, skills.includes(s) && styles.skillChipActive]}
              onPress={() => toggleSkill(s)}
            >
              <Text style={[styles.skillChipText, skills.includes(s) && styles.skillChipTextActive]}>
                {s}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* Hourly Rate */}
        <Text style={styles.label}>Hourly Rate (ZAR) *</Text>
        <View style={styles.rateRow}>
          <Text style={styles.ratePrefix}>R</Text>
          <TextInput
            style={styles.rateInput}
            value={hourlyRate}
            onChangeText={setHourlyRate}
            keyboardType="decimal-pad"
            placeholder="e.g. 150"
          />
          <Text style={styles.rateSuffix}>/hour</Text>
        </View>

        {/* Bio */}
        <Text style={styles.label}>About Me</Text>
        <TextInput
          style={[styles.input, styles.textArea]}
          value={bio}
          onChangeText={setBio}
          placeholder="Tell customers about your experience, specialties, and how long you've been working..."
          multiline
          numberOfLines={4}
        />

        {/* SA ID */}
        <Text style={styles.label}>SA ID Number</Text>
        <TextInput
          style={styles.input}
          value={idNumber}
          onChangeText={setIdNumber}
          placeholder="For identity verification"
          keyboardType="number-pad"
          maxLength={13}
        />

        <Text style={styles.label}>Emergency Contact (optional)</Text>
        <TextInput
          style={styles.input}
          value={emergencyContact}
          onChangeText={setEmergencyContact}
          placeholder="e.g. 082 123 4567"
          placeholderTextColor="#6b7280"
          keyboardType="phone-pad"
        />

        <TouchableOpacity style={styles.saveBtn} onPress={handleSave} disabled={saving}>
          {saving ? <ActivityIndicator color="#fff" /> : <Text style={styles.saveBtnText}>Save Profile</Text>}
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F9FAFB' },
  scroll: { padding: 20, paddingBottom: 40 },
  avatarContainer: { alignSelf: 'center', marginBottom: 24 },
  avatar: { width: 100, height: 100, borderRadius: 50 },
  avatarPlaceholder: {
    width: 100, height: 100, borderRadius: 50,
    backgroundColor: '#E5E7EB', justifyContent: 'center', alignItems: 'center',
    borderWidth: 2, borderColor: '#1A6B3A', borderStyle: 'dashed',
  },
  avatarPlaceholderText: { color: '#1A6B3A', fontWeight: '600', fontSize: 13 },
  label: { fontSize: 14, fontWeight: '700', color: '#374151', marginTop: 16, marginBottom: 6 },
  sublabel: { fontSize: 12, color: '#9CA3AF', marginBottom: 10, marginTop: -4 },
  skillsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  skillChip: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20, backgroundColor: '#fff', borderWidth: 1, borderColor: '#E5E7EB' },
  skillChipActive: { backgroundColor: '#1A6B3A', borderColor: '#1A6B3A' },
  skillChipText: { fontSize: 13, color: '#374151', fontWeight: '500' },
  skillChipTextActive: { color: '#fff' },
  rateRow: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#fff', borderWidth: 1, borderColor: '#E5E7EB', borderRadius: 10, overflow: 'hidden' },
  ratePrefix: { paddingHorizontal: 12, fontSize: 16, color: '#374151', fontWeight: '700' },
  rateInput: { flex: 1, padding: 13, fontSize: 16 },
  rateSuffix: { paddingHorizontal: 12, fontSize: 14, color: '#9CA3AF' },
  input: {
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#E5E7EB',
    borderRadius: 10,
    padding: 13,
    fontSize: 15,
  },
  textArea: { height: 100, textAlignVertical: 'top' },
  saveBtn: { backgroundColor: '#1A6B3A', borderRadius: 12, padding: 16, alignItems: 'center', marginTop: 24 },
  saveBtnText: { color: '#fff', fontSize: 16, fontWeight: '700' },
});
