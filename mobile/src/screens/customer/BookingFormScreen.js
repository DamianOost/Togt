import React, { useState, useEffect } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, ScrollView,
  StyleSheet, SafeAreaView, Alert, ActivityIndicator, Platform,
} from 'react-native';
import DateTimePicker from '@react-native-community/datetimepicker';
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

  const [scheduledDate, setScheduledDate] = useState(new Date(Date.now() + 60 * 60 * 1000));
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [showTimePicker, setShowTimePicker] = useState(false);

  useEffect(() => {
    // Pre-fill GPS location
    locationService.getCurrentPosition().then((pos) => {
      setForm((f) => ({ ...f, location_lat: pos.lat, location_lng: pos.lng }));
    }).catch(() => {});
  }, []);

  function set(key) {
    return (val) => setForm((f) => ({ ...f, [key]: val }));
  }

  function onDateChange(event, selected) {
    if (Platform.OS === 'android') setShowDatePicker(false);
    if (selected) {
      const updated = new Date(scheduledDate);
      updated.setFullYear(selected.getFullYear(), selected.getMonth(), selected.getDate());
      setScheduledDate(updated);
      setForm((f) => ({ ...f, scheduled_at: updated.toISOString() }));
      // On Android, open time picker next
      if (Platform.OS === 'android') setTimeout(() => setShowTimePicker(true), 100);
    }
  }

  function onTimeChange(event, selected) {
    if (Platform.OS === 'android') setShowTimePicker(false);
    if (selected) {
      const updated = new Date(scheduledDate);
      updated.setHours(selected.getHours(), selected.getMinutes(), 0, 0);
      setScheduledDate(updated);
      setForm((f) => ({ ...f, scheduled_at: updated.toISOString() }));
    }
  }

  function formatDisplayDate(date) {
    return date.toLocaleDateString('en-ZA', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });
  }

  function formatDisplayTime(date) {
    return date.toLocaleTimeString('en-ZA', { hour: '2-digit', minute: '2-digit' });
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

    // Confirm before booking
    Alert.alert(
      'Confirm Booking',
      `Book ${labourer.name} for ${form.skill_needed}?\n\n📍 ${form.address}\n📅 ${formatDisplayDate(scheduledDate)} at ${formatDisplayTime(scheduledDate)}\n⏱️ ${form.hours_est || '?'} hours\n💰 ${estimatedTotal ? formatZAR(estimatedTotal) : 'TBD'}`,
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Confirm', onPress: submitBooking },
      ]
    );
  }

  async function submitBooking() {
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
        <View style={styles.skillChips}>
          {(labourer.skills || ['Plumbing', 'Painting', 'Electrical', 'Building', 'Cleaning', 'Tiling', 'Garden']).map((s) => (
            <TouchableOpacity
              key={s}
              style={[styles.skillChip, form.skill_needed === s && styles.skillChipActive]}
              onPress={() => set('skill_needed')(s)}
            >
              <Text style={[styles.skillChipText, form.skill_needed === s && styles.skillChipTextActive]}>{s}</Text>
            </TouchableOpacity>
          ))}
        </View>

        <Text style={styles.label}>Job Address *</Text>
        <TextInput
          style={styles.input}
          value={form.address}
          onChangeText={set('address')}
          placeholder="Full address where work is needed"
          multiline
        />

        <Text style={styles.label}>Scheduled Date & Time *</Text>
        <View style={styles.dateRow}>
          <TouchableOpacity style={[styles.dateButton, { flex: 1.5 }]} onPress={() => setShowDatePicker(true)}>
            <Text style={styles.dateButtonText}>📅 {formatDisplayDate(scheduledDate)}</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[styles.dateButton, { flex: 1 }]} onPress={() => setShowTimePicker(true)}>
            <Text style={styles.dateButtonText}>🕐 {formatDisplayTime(scheduledDate)}</Text>
          </TouchableOpacity>
        </View>
        {showDatePicker && (
          <DateTimePicker
            value={scheduledDate}
            mode="date"
            display={Platform.OS === 'ios' ? 'inline' : 'default'}
            minimumDate={new Date()}
            onChange={onDateChange}
          />
        )}
        {showTimePicker && (
          <DateTimePicker
            value={scheduledDate}
            mode="time"
            display={Platform.OS === 'ios' ? 'spinner' : 'default'}
            onChange={onTimeChange}
          />
        )}

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
  skillChips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  skillChip: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20, backgroundColor: '#fff', borderWidth: 1, borderColor: '#E5E7EB' },
  skillChipActive: { backgroundColor: '#1A6B3A', borderColor: '#1A6B3A' },
  skillChipText: { fontSize: 13, color: '#374151', fontWeight: '500' },
  skillChipTextActive: { color: '#fff' },
  dateRow: { flexDirection: 'row', gap: 8 },
  dateButton: {
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#E5E7EB',
    borderRadius: 10,
    padding: 13,
    alignItems: 'center',
  },
  dateButtonText: { fontSize: 14, color: '#374151', fontWeight: '500' },
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
