import React, { useState, useEffect } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, ScrollView,
  StyleSheet, SafeAreaView, Alert, ActivityIndicator,
} from 'react-native';
import { useDispatch, useSelector } from 'react-redux';
import { createBookingThunk } from '../../store/bookingSlice';
import { locationService } from '../../services/locationService';
import { formatZAR } from '../../utils/formatters';

export default function BookingFormScreen({ route, navigation }) {
  const { labourer } = route.params;
  const dispatch = useDispatch();
  const { loading, error } = useSelector((s) => s.booking);

  const [form, setForm] = useState({
    skill_needed: labourer.skills?.[0] || '',
    address: '',
    location_lat: null,
    location_lng: null,
    scheduled_at: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
    hours_est: '2',
    notes: '',
  });

  useEffect(() => {
    // Pre-fill GPS location
    locationService.getCurrentPosition().then((pos) => {
      setForm((f) => ({ ...f, location_lat: pos.lat, location_lng: pos.lng }));
    }).catch(() => {});
  }, []);

  function set(key) {
    return (val) => setForm((f) => ({ ...f, [key]: val }));
  }

  const estimatedTotal = form.hours_est
    ? labourer.hourly_rate * parseFloat(form.hours_est || 0)
    : null;

  async function handleBook() {
    if (!form.skill_needed || !form.address || !form.scheduled_at) {
      Alert.alert('Missing fields', 'Please fill in all required fields.');
      return;
    }
    if (!form.location_lat) {
      Alert.alert('Location needed', 'Could not get your location. Please try again.');
      return;
    }

    const result = await dispatch(createBookingThunk({
      labourer_id: labourer.id,
      ...form,
      hours_est: parseFloat(form.hours_est) || null,
    }));

    if (createBookingThunk.fulfilled.match(result)) {
      navigation.replace('ActiveBooking', { bookingId: result.payload.booking.id });
    }
  }

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
        <Text style={styles.labourerName}>Booking {labourer.name}</Text>
        <Text style={styles.rate}>{formatZAR(labourer.hourly_rate)}/hr</Text>

        {error && <Text style={styles.error}>{error}</Text>}

        <Text style={styles.label}>Skill Needed *</Text>
        <TextInput
          style={styles.input}
          value={form.skill_needed}
          onChangeText={set('skill_needed')}
          placeholder="e.g. Plumbing, Painting..."
        />

        <Text style={styles.label}>Job Address *</Text>
        <TextInput
          style={styles.input}
          value={form.address}
          onChangeText={set('address')}
          placeholder="Full address where work is needed"
          multiline
        />

        <Text style={styles.label}>Scheduled Date & Time *</Text>
        <TextInput
          style={styles.input}
          value={form.scheduled_at}
          onChangeText={set('scheduled_at')}
          placeholder="YYYY-MM-DDTHH:MM:SS"
        />

        <Text style={styles.label}>Estimated Hours</Text>
        <TextInput
          style={styles.input}
          value={form.hours_est}
          onChangeText={set('hours_est')}
          keyboardType="decimal-pad"
          placeholder="e.g. 3"
        />

        <Text style={styles.label}>Notes (optional)</Text>
        <TextInput
          style={[styles.input, styles.textArea]}
          value={form.notes}
          onChangeText={set('notes')}
          placeholder="Describe the job in detail..."
          multiline
          numberOfLines={4}
        />

        {estimatedTotal != null && (
          <View style={styles.estimate}>
            <Text style={styles.estimateLabel}>Estimated Total</Text>
            <Text style={styles.estimateAmount}>{formatZAR(estimatedTotal)}</Text>
          </View>
        )}

        <TouchableOpacity style={styles.button} onPress={handleBook} disabled={loading}>
          {loading ? <ActivityIndicator color="#fff" /> : <Text style={styles.buttonText}>Send Booking Request</Text>}
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F9FAFB' },
  scroll: { padding: 20 },
  labourerName: { fontSize: 20, fontWeight: '800', color: '#111827', marginBottom: 2 },
  rate: { fontSize: 15, color: '#1A6B3A', fontWeight: '600', marginBottom: 20 },
  error: { color: '#EF4444', marginBottom: 12, fontSize: 14 },
  label: { fontSize: 13, fontWeight: '600', color: '#374151', marginBottom: 6, marginTop: 12 },
  input: {
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#E5E7EB',
    borderRadius: 10,
    padding: 13,
    fontSize: 15,
  },
  textArea: { height: 90, textAlignVertical: 'top' },
  estimate: {
    backgroundColor: '#D1FAE5',
    borderRadius: 12,
    padding: 16,
    marginTop: 20,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  estimateLabel: { fontSize: 14, color: '#065F46', fontWeight: '600' },
  estimateAmount: { fontSize: 20, fontWeight: '800', color: '#065F46' },
  button: {
    backgroundColor: '#1A6B3A',
    borderRadius: 12,
    padding: 16,
    alignItems: 'center',
    marginTop: 20,
  },
  buttonText: { color: '#fff', fontSize: 16, fontWeight: '700' },
});
