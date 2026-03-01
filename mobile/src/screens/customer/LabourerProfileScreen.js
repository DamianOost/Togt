import React, { useEffect, useState } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity,
  StyleSheet, ActivityIndicator, StatusBar,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { formatZAR, formatDate } from '../../utils/formatters';
import api from '../../services/api';
import { colors, typography, spacing, borderRadius, shadows } from '../../theme';

function StarRow({ rating, size = 16 }) {
  const filled = Math.round(rating || 0);
  return (
    <View style={{ flexDirection: 'row', gap: 3 }}>
      {[1, 2, 3, 4, 5].map((i) => (
        <Text key={i} style={{ fontSize: size, color: i <= filled ? colors.accent : colors.border }}>
          ★
        </Text>
      ))}
    </View>
  );
}

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
        setReviews(res.data.reviews || []);
      } catch {
        // Use initial data if fetch fails
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator color={colors.accent} size="large" />
      </View>
    );
  }

  const primarySkill = (labourer.skills || [])[0] || 'Worker';

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor={colors.primary} />

      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        {/* Hero section */}
        <View style={styles.hero}>
          <TouchableOpacity style={styles.backBtn} onPress={() => navigation.goBack()}>
            <Text style={styles.backBtnText}>←</Text>
          </TouchableOpacity>

          <View style={styles.avatarContainer}>
            <View style={styles.avatar}>
              <Text style={styles.avatarText}>{labourer.name?.[0] || 'L'}</Text>
            </View>
            <View style={styles.skillBadge}>
              <Text style={styles.skillBadgeText}>{primarySkill}</Text>
            </View>
          </View>

          <Text style={styles.name}>{labourer.name}</Text>

          <View style={styles.ratingRow}>
            <StarRow rating={labourer.rating_avg} size={18} />
            <Text style={styles.ratingText}>
              {parseFloat(labourer.rating_avg || 0).toFixed(1)}
            </Text>
            <Text style={styles.reviewCount}>
              ({labourer.rating_count || 0} reviews)
            </Text>
          </View>

          <View style={[styles.availBadge, { backgroundColor: labourer.is_available ? colors.successLight : '#f3f4f6' }]}>
            <Text style={[styles.availText, { color: labourer.is_available ? colors.success : colors.textMuted }]}>
              {labourer.is_available ? '● Available now' : '● Not available'}
            </Text>
          </View>
        </View>

        {/* Rate card */}
        <View style={styles.rateCard}>
          <View>
            <Text style={styles.rateLabel}>HOURLY RATE</Text>
            <Text style={styles.rate}>{formatZAR(labourer.hourly_rate)}</Text>
            <Text style={styles.rateUnit}>per hour</Text>
          </View>
          {labourer.distance_km != null && (
            <View style={styles.distanceBox}>
              <Text style={styles.distanceValue}>
                {parseFloat(labourer.distance_km).toFixed(1)} km
              </Text>
              <Text style={styles.distanceLabel}>away</Text>
            </View>
          )}
        </View>

        {/* Skills */}
        {(labourer.skills || []).length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Skills</Text>
            <View style={styles.skillsRow}>
              {(labourer.skills || []).map((s) => (
                <View key={s} style={styles.skillChip}>
                  <Text style={styles.skillChipText}>{s}</Text>
                </View>
              ))}
            </View>
          </View>
        )}

        {/* About */}
        {labourer.bio ? (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>About</Text>
            <Text style={styles.bio}>{labourer.bio}</Text>
          </View>
        ) : (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>About</Text>
            <Text style={styles.bio}>
              Experienced {primarySkill.toLowerCase()} professional available for jobs in your area.
            </Text>
          </View>
        )}

        {/* Reviews */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>
            Reviews {reviews.length > 0 ? `(${reviews.length})` : ''}
          </Text>
          {reviews.length === 0 ? (
            <Text style={styles.noReviews}>No reviews yet — be the first to book!</Text>
          ) : (
            reviews.map((r, i) => (
              <View key={i} style={styles.reviewCard}>
                <View style={styles.reviewHeader}>
                  <View style={styles.reviewerAvatar}>
                    <Text style={styles.reviewerAvatarText}>{r.reviewer_name?.[0] || 'C'}</Text>
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.reviewerName}>{r.reviewer_name}</Text>
                    <StarRow rating={r.score} size={12} />
                  </View>
                  <Text style={styles.reviewDate}>{formatDate(r.created_at)}</Text>
                </View>
                {r.comment && <Text style={styles.reviewComment}>{r.comment}</Text>}
              </View>
            ))
          )}
        </View>

        {/* Spacer for CTA */}
        <View style={{ height: 90 }} />
      </ScrollView>

      {/* Book button */}
      {labourer.is_available && (
        <View style={styles.footer}>
          <TouchableOpacity
            style={styles.bookBtn}
            onPress={() => navigation.navigate('BookingForm', { labourer })}
          >
            <Text style={styles.bookBtnText}>
              Book {labourer.name.split(' ')[0]}
            </Text>
          </TouchableOpacity>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f3f4f6' },
  loadingContainer: {
    flex: 1,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  scroll: { paddingBottom: 32 },

  // Hero
  hero: {
    backgroundColor: colors.primary,
    alignItems: 'center',
    paddingTop: 48,
    paddingBottom: spacing.xl,
    paddingHorizontal: spacing.lg,
  },
  backBtn: {
    position: 'absolute',
    top: 48,
    left: spacing.md,
    width: 40,
    height: 40,
    borderRadius: borderRadius.full,
    backgroundColor: 'rgba(255,255,255,0.15)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  backBtnText: { fontSize: typography.xl, color: '#fff' },
  avatarContainer: {
    alignItems: 'center',
    marginBottom: spacing.md,
  },
  avatar: {
    width: 100,
    height: 100,
    borderRadius: borderRadius.full,
    backgroundColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 3,
    borderColor: 'rgba(255,255,255,0.3)',
  },
  avatarText: {
    fontSize: typography.xxl,
    fontWeight: '900',
    color: colors.primary,
  },
  skillBadge: {
    backgroundColor: colors.accent,
    paddingHorizontal: spacing.md,
    paddingVertical: 3,
    borderRadius: borderRadius.full,
    marginTop: -12,
  },
  skillBadgeText: {
    color: colors.primary,
    fontSize: typography.xs,
    fontWeight: '800',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  name: {
    fontSize: typography.xl + 2,
    fontWeight: '800',
    color: '#fff',
    marginBottom: spacing.sm,
  },
  ratingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    marginBottom: spacing.sm,
  },
  ratingText: {
    fontSize: typography.md,
    fontWeight: '700',
    color: colors.accent,
  },
  reviewCount: {
    fontSize: typography.sm,
    color: colors.textMuted,
  },
  availBadge: {
    paddingHorizontal: spacing.md,
    paddingVertical: 4,
    borderRadius: borderRadius.full,
  },
  availText: { fontSize: typography.sm, fontWeight: '600' },

  // Rate card
  rateCard: {
    backgroundColor: '#fff',
    marginHorizontal: spacing.md,
    marginTop: spacing.md,
    borderRadius: borderRadius.md,
    padding: spacing.md + 4,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    ...shadows.card,
  },
  rateLabel: {
    fontSize: typography.xs,
    color: colors.textMuted,
    fontWeight: '700',
    letterSpacing: 1,
    textTransform: 'uppercase',
    marginBottom: 2,
  },
  rate: {
    fontSize: typography.xxl + 4,
    fontWeight: '900',
    color: colors.success,
  },
  rateUnit: {
    fontSize: typography.sm,
    color: colors.textMuted,
  },
  distanceBox: { alignItems: 'center' },
  distanceValue: {
    fontSize: typography.xl,
    fontWeight: '800',
    color: colors.info,
  },
  distanceLabel: {
    fontSize: typography.xs,
    color: colors.textMuted,
  },

  // Sections
  section: {
    backgroundColor: '#fff',
    marginHorizontal: spacing.md,
    marginTop: spacing.sm,
    borderRadius: borderRadius.md,
    padding: spacing.md,
    ...shadows.card,
  },
  sectionTitle: {
    fontSize: typography.md,
    fontWeight: '700',
    color: colors.textPrimary,
    marginBottom: spacing.sm,
  },
  skillsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  skillChip: {
    backgroundColor: colors.primaryLight,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs + 2,
    borderRadius: borderRadius.full,
  },
  skillChipText: { color: colors.accent, fontSize: typography.sm, fontWeight: '600' },
  bio: { fontSize: typography.md, color: colors.textSecondary, lineHeight: 22 },
  noReviews: { color: colors.textMuted, fontSize: typography.sm },

  // Reviews
  reviewCard: {
    borderTopWidth: 1,
    borderTopColor: colors.border,
    paddingTop: spacing.sm,
    marginTop: spacing.sm,
  },
  reviewHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginBottom: spacing.xs,
  },
  reviewerAvatar: {
    width: 32,
    height: 32,
    borderRadius: borderRadius.full,
    backgroundColor: colors.primaryLight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  reviewerAvatarText: { color: colors.accent, fontSize: typography.sm, fontWeight: '700' },
  reviewerName: { fontWeight: '600', color: colors.textPrimary, fontSize: typography.sm },
  reviewDate: { fontSize: typography.xs, color: colors.textMuted },
  reviewComment: {
    color: colors.textSecondary,
    fontSize: typography.sm,
    lineHeight: 20,
    marginTop: 4,
  },

  // Footer
  footer: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: '#fff',
    padding: spacing.md,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    ...shadows.upward,
  },
  bookBtn: {
    backgroundColor: colors.accent,
    borderRadius: borderRadius.lg,
    paddingVertical: spacing.md,
    alignItems: 'center',
    ...shadows.card,
  },
  bookBtnText: {
    color: colors.primary,
    fontSize: typography.lg,
    fontWeight: '800',
  },
});
