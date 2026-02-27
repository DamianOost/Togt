import React, { useEffect, useState } from 'react';
import {
  View, Text, Image, ScrollView, TouchableOpacity,
  StyleSheet, ActivityIndicator, SafeAreaView,
} from 'react-native';
import StarRating from '../../components/StarRating';
import { formatZAR, formatDate } from '../../utils/formatters';
import api from '../../services/api';

export default function LabourerProfileScreen({ route, navigation }) {
  const { labourer: initialLabourer } = route.params;
  const [labourer, setLabourer] = useState(initialLabourer);
  const [reviews, setReviews] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      try {
        const res = await api.get(`/labourers/${initialLabourer.id}`);
        setLabourer(res.data.labourer);
        setReviews(res.data.reviews);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  if (loading) {
    return <ActivityIndicator style={{ flex: 1 }} color="#1A6B3A" />;
  }

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView>
        {/* Profile Header */}
        <View style={styles.header}>
          <Image
            source={
              labourer.avatar_url
                ? { uri: labourer.avatar_url }
                : require('../../../assets/default-avatar.png')
            }
            style={styles.avatar}
          />
          <Text style={styles.name}>{labourer.name}</Text>
          <View style={styles.ratingRow}>
            <StarRating rating={labourer.rating_avg || 0} size={18} />
            <Text style={styles.ratingText}>
              {parseFloat(labourer.rating_avg || 0).toFixed(1)} ({labourer.rating_count || 0} reviews)
            </Text>
          </View>
          <View style={[styles.availBadge, { backgroundColor: labourer.is_available ? '#D1FAE5' : '#F3F4F6' }]}>
            <Text style={[styles.availText, { color: labourer.is_available ? '#059669' : '#6B7280' }]}>
              {labourer.is_available ? '● Available now' : '● Not available'}
            </Text>
          </View>
        </View>

        {/* Rate */}
        <View style={styles.section}>
          <Text style={styles.rateLabel}>Hourly Rate</Text>
          <Text style={styles.rate}>{formatZAR(labourer.hourly_rate)}/hr</Text>
        </View>

        {/* Skills */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Skills</Text>
          <View style={styles.skillsWrap}>
            {(labourer.skills || []).map((s) => (
              <View key={s} style={styles.skillChip}>
                <Text style={styles.skillText}>{s}</Text>
              </View>
            ))}
          </View>
        </View>

        {/* Bio */}
        {labourer.bio && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>About</Text>
            <Text style={styles.bio}>{labourer.bio}</Text>
          </View>
        )}

        {/* Reviews */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Reviews</Text>
          {reviews.length === 0 ? (
            <Text style={styles.noReviews}>No reviews yet</Text>
          ) : (
            reviews.map((r, i) => (
              <View key={i} style={styles.reviewCard}>
                <View style={styles.reviewHeader}>
                  <Text style={styles.reviewerName}>{r.reviewer_name}</Text>
                  <StarRating rating={r.score} size={13} />
                </View>
                {r.comment && <Text style={styles.reviewComment}>{r.comment}</Text>}
                <Text style={styles.reviewDate}>{formatDate(r.created_at)}</Text>
              </View>
            ))
          )}
        </View>
      </ScrollView>

      {/* Book Button */}
      {labourer.is_available && (
        <View style={styles.footer}>
          <TouchableOpacity
            style={styles.bookBtn}
            onPress={() => navigation.navigate('BookingForm', { labourer })}
          >
            <Text style={styles.bookBtnText}>Book {labourer.name.split(' ')[0]}</Text>
          </TouchableOpacity>
        </View>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F9FAFB' },
  header: { backgroundColor: '#fff', alignItems: 'center', padding: 24, borderBottomWidth: 1, borderBottomColor: '#F3F4F6' },
  avatar: { width: 90, height: 90, borderRadius: 45, backgroundColor: '#E5E7EB', marginBottom: 12 },
  name: { fontSize: 22, fontWeight: '800', color: '#111827', marginBottom: 6 },
  ratingRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 8 },
  ratingText: { fontSize: 14, color: '#6B7280' },
  availBadge: { paddingHorizontal: 12, paddingVertical: 4, borderRadius: 12 },
  availText: { fontSize: 13, fontWeight: '600' },
  section: { backgroundColor: '#fff', marginTop: 12, padding: 16 },
  rateLabel: { fontSize: 13, color: '#9CA3AF', textTransform: 'uppercase', letterSpacing: 0.5 },
  rate: { fontSize: 28, fontWeight: '800', color: '#1A6B3A', marginTop: 2 },
  sectionTitle: { fontSize: 15, fontWeight: '700', color: '#374151', marginBottom: 10 },
  skillsWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  skillChip: { backgroundColor: '#EEF2FF', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 8 },
  skillText: { color: '#4338CA', fontSize: 13, fontWeight: '600' },
  bio: { fontSize: 15, color: '#374151', lineHeight: 22 },
  noReviews: { color: '#9CA3AF', fontSize: 14 },
  reviewCard: { borderTopWidth: 1, borderTopColor: '#F3F4F6', paddingTop: 12, marginTop: 12 },
  reviewHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 },
  reviewerName: { fontWeight: '600', color: '#111827', fontSize: 14 },
  reviewComment: { color: '#374151', fontSize: 14, marginTop: 4 },
  reviewDate: { color: '#9CA3AF', fontSize: 12, marginTop: 4 },
  footer: { padding: 16, backgroundColor: '#fff', borderTopWidth: 1, borderTopColor: '#E5E7EB' },
  bookBtn: { backgroundColor: '#1A6B3A', borderRadius: 12, padding: 16, alignItems: 'center' },
  bookBtnText: { color: '#fff', fontSize: 16, fontWeight: '700' },
});
