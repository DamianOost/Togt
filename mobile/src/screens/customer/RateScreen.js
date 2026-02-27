import React, { useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  SafeAreaView, ActivityIndicator, Alert,
} from 'react-native';
import StarRating from '../../components/StarRating';
import api from '../../services/api';

export default function RateScreen({ route, navigation }) {
  const { booking } = route.params;
  const [score, setScore] = useState(0);
  const [comment, setComment] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleSubmit() {
    if (score === 0) {
      Alert.alert('Rating required', 'Please select a star rating.');
      return;
    }
    setLoading(true);
    try {
      await api.post('/ratings', {
        booking_id: booking.id,
        score,
        comment: comment.trim() || undefined,
      });
      Alert.alert('Thank you!', 'Your review has been submitted.', [
        { text: 'OK', onPress: () => navigation.navigate('HomeMap') },
      ]);
    } catch (err) {
      Alert.alert('Error', err.response?.data?.error || 'Could not submit review.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.content}>
        <Text style={styles.title}>Rate {booking.labourer_name}</Text>
        <Text style={styles.subtitle}>How was your experience?</Text>

        <StarRating
          rating={score}
          size={48}
          interactive
          onRate={setScore}
        />

        <Text style={styles.scoreLabel}>
          {['', 'Poor', 'Fair', 'Good', 'Very Good', 'Excellent'][score] || ''}
        </Text>

        <TextInput
          style={styles.commentInput}
          placeholder="Write a comment (optional)..."
          value={comment}
          onChangeText={setComment}
          multiline
          numberOfLines={4}
        />

        <TouchableOpacity style={styles.button} onPress={handleSubmit} disabled={loading || score === 0}>
          {loading ? <ActivityIndicator color="#fff" /> : <Text style={styles.buttonText}>Submit Review</Text>}
        </TouchableOpacity>

        <TouchableOpacity style={styles.skipBtn} onPress={() => navigation.navigate('HomeMap')}>
          <Text style={styles.skipText}>Skip for now</Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F9FAFB' },
  content: { flex: 1, padding: 32, alignItems: 'center', justifyContent: 'center' },
  title: { fontSize: 24, fontWeight: '800', color: '#111827', marginBottom: 8, textAlign: 'center' },
  subtitle: { fontSize: 16, color: '#6B7280', marginBottom: 28, textAlign: 'center' },
  scoreLabel: { fontSize: 18, fontWeight: '700', color: '#1A6B3A', height: 28, marginTop: 8 },
  commentInput: {
    width: '100%',
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#E5E7EB',
    borderRadius: 12,
    padding: 14,
    fontSize: 15,
    height: 100,
    textAlignVertical: 'top',
    marginTop: 20,
    marginBottom: 24,
  },
  button: {
    width: '100%',
    backgroundColor: '#1A6B3A',
    borderRadius: 12,
    padding: 16,
    alignItems: 'center',
  },
  buttonText: { color: '#fff', fontSize: 16, fontWeight: '700' },
  skipBtn: { marginTop: 16 },
  skipText: { color: '#9CA3AF', fontSize: 14 },
});
