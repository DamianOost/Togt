import React, { useEffect, useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
  SafeAreaView,
  TextInput,
} from 'react-native';
import api from '../../services/api';
import { colors, typography, spacing, borderRadius, shadows } from '../../theme';

const SKILL_FILTERS = [
  { label: 'All', value: '' },
  { label: 'Plumbing', value: 'Plumbing' },
  { label: 'Electrical', value: 'Electrical' },
  { label: 'Cleaning', value: 'Cleaning' },
  { label: 'Painting', value: 'Painting' },
  { label: 'Carpentry', value: 'Carpentry' },
  { label: 'Garden', value: 'Garden' },
  { label: 'Tiling', value: 'Tiling' },
  { label: 'Moving', value: 'Moving' },
];

function StarRating({ rating, count }) {
  const stars = Math.round(rating || 0);
  return (
    <View style={ratingStyles.row}>
      {[1, 2, 3, 4, 5].map((i) => (
        <Text key={i} style={[ratingStyles.star, i <= stars && ratingStyles.starFilled]}>
          ★
        </Text>
      ))}
      {count > 0 && (
        <Text style={ratingStyles.count}>({count})</Text>
      )}
    </View>
  );
}

const ratingStyles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 1 },
  star: { fontSize: 12, color: colors.border },
  starFilled: { color: colors.accent },
  count: { fontSize: 11, color: colors.textMuted, marginLeft: 3 },
});

function LabourerCard({ service, onPress }) {
  return (
    <TouchableOpacity style={cardStyles.card} onPress={onPress} activeOpacity={0.85}>
      <View style={cardStyles.avatarCol}>
        <View style={cardStyles.avatar}>
          <Text style={cardStyles.avatarText}>
            {service.labourer_name?.[0]?.toUpperCase() || '👷'}
          </Text>
        </View>
        <View style={[cardStyles.availDot, service.is_available && cardStyles.availDotActive]} />
      </View>

      <View style={cardStyles.info}>
        <Text style={cardStyles.name} numberOfLines={1}>{service.labourer_name}</Text>

        <View style={cardStyles.badgeRow}>
          <View style={cardStyles.skillBadge}>
            <Text style={cardStyles.skillBadgeText}>{service.skill}</Text>
          </View>
        </View>

        <StarRating rating={service.rating_avg} count={service.rating_count} />

        <Text style={cardStyles.title} numberOfLines={1}>{service.title}</Text>
      </View>

      <View style={cardStyles.rateCol}>
        {service.rate_per_hour ? (
          <>
            <Text style={cardStyles.rateAmount}>R{service.rate_per_hour}</Text>
            <Text style={cardStyles.rateUnit}>/hr</Text>
          </>
        ) : (
          <Text style={cardStyles.rateNeg}>Negotiate</Text>
        )}
        <Text style={cardStyles.arrow}>›</Text>
      </View>
    </TouchableOpacity>
  );
}

const cardStyles = StyleSheet.create({
  card: {
    backgroundColor: '#fff',
    borderRadius: borderRadius.md,
    padding: spacing.md,
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.sm,
    marginBottom: spacing.sm,
    ...shadows.card,
  },
  avatarCol: { alignItems: 'center', gap: 4 },
  avatar: {
    width: 52,
    height: 52,
    borderRadius: borderRadius.full,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: {
    color: colors.accent,
    fontSize: typography.xl,
    fontWeight: '800',
  },
  availDot: {
    width: 8,
    height: 8,
    borderRadius: borderRadius.full,
    backgroundColor: colors.border,
  },
  availDotActive: { backgroundColor: colors.success },
  info: { flex: 1 },
  name: {
    fontSize: typography.md,
    fontWeight: '800',
    color: colors.textPrimary,
    marginBottom: 3,
  },
  badgeRow: { flexDirection: 'row', marginBottom: 4 },
  skillBadge: {
    backgroundColor: colors.accentLight,
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    borderRadius: borderRadius.full,
  },
  skillBadgeText: {
    fontSize: 10,
    color: colors.accentDark,
    fontWeight: '700',
  },
  title: {
    fontSize: typography.xs,
    color: colors.textMuted,
    marginTop: 4,
  },
  rateCol: { alignItems: 'flex-end', justifyContent: 'space-between', minWidth: 60, gap: spacing.xs },
  rateAmount: {
    fontSize: typography.md,
    fontWeight: '800',
    color: colors.success,
  },
  rateUnit: { fontSize: 10, color: colors.textMuted, marginTop: -4 },
  rateNeg: { fontSize: 10, color: colors.textMuted, textAlign: 'center' },
  arrow: { fontSize: typography.xl, color: colors.textMuted, marginTop: spacing.xs },
});

export default function DiscoverScreen({ navigation }) {
  const [services, setServices] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedSkill, setSelectedSkill] = useState('');
  const [searchText, setSearchText] = useState('');

  useEffect(() => {
    loadServices(selectedSkill);
  }, [selectedSkill]);

  async function loadServices(skill) {
    setLoading(true);
    try {
      const params = skill ? `?skill=${encodeURIComponent(skill)}` : '';
      const res = await api.get(`/api/services${params}`);
      setServices(res.data.services || []);
    } catch (err) {
      console.warn('Failed to load services:', err);
    } finally {
      setLoading(false);
    }
  }

  function handleSelectSkill(skill) {
    setSelectedSkill(skill);
    setSearchText('');
  }

  function handleCardPress(service) {
    navigation.navigate('LabourerProfile', { labourerId: service.labourer_id });
  }

  const filteredServices = searchText.trim()
    ? services.filter(
        (s) =>
          s.labourer_name?.toLowerCase().includes(searchText.toLowerCase()) ||
          s.title?.toLowerCase().includes(searchText.toLowerCase()) ||
          s.skill?.toLowerCase().includes(searchText.toLowerCase())
      )
    : services;

  return (
    <SafeAreaView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Discover Labourers</Text>
        <Text style={styles.headerSub}>Find skilled workers near you</Text>
      </View>

      {/* Search bar */}
      <View style={styles.searchRow}>
        <View style={styles.searchBar}>
          <Text style={styles.searchIcon}>🔍</Text>
          <TextInput
            style={styles.searchInput}
            placeholder="Search by name or skill..."
            placeholderTextColor={colors.textMuted}
            value={searchText}
            onChangeText={setSearchText}
          />
          {searchText ? (
            <TouchableOpacity onPress={() => setSearchText('')}>
              <Text style={styles.clearBtn}>✕</Text>
            </TouchableOpacity>
          ) : null}
        </View>
      </View>

      {/* Filter chips */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={styles.filterScroll}
        contentContainerStyle={styles.filterContent}
      >
        {SKILL_FILTERS.map((f) => (
          <TouchableOpacity
            key={f.value}
            style={[styles.chip, selectedSkill === f.value && styles.chipActive]}
            onPress={() => handleSelectSkill(f.value)}
          >
            <Text style={[styles.chipText, selectedSkill === f.value && styles.chipTextActive]}>
              {f.label}
            </Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      {/* Results count */}
      {!loading && (
        <Text style={styles.resultCount}>
          {filteredServices.length} {filteredServices.length === 1 ? 'labourer' : 'labourers'} available
        </Text>
      )}

      {/* List */}
      {loading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={colors.accent} />
        </View>
      ) : filteredServices.length === 0 ? (
        <View style={styles.emptyContainer}>
          <Text style={styles.emptyIcon}>🔧</Text>
          <Text style={styles.emptyTitle}>No labourers found</Text>
          <Text style={styles.emptySubtext}>
            {selectedSkill
              ? `No ${selectedSkill} specialists available right now`
              : 'No services available yet'}
          </Text>
        </View>
      ) : (
        <FlatList
          data={filteredServices}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => (
            <LabourerCard service={item} onPress={() => handleCardPress(item)} />
          )}
          contentContainerStyle={styles.list}
          showsVerticalScrollIndicator={false}
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f8f9fa' },

  header: {
    backgroundColor: colors.primary,
    paddingHorizontal: spacing.md,
    paddingTop: spacing.md,
    paddingBottom: spacing.md,
  },
  headerTitle: {
    fontSize: typography.xl,
    fontWeight: '900',
    color: '#fff',
  },
  headerSub: {
    fontSize: typography.sm,
    color: colors.textMuted,
    marginTop: 2,
  },

  searchRow: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    backgroundColor: colors.primary,
  },
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    borderRadius: borderRadius.full,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs + 2,
    gap: spacing.xs,
  },
  searchIcon: { fontSize: 14 },
  searchInput: {
    flex: 1,
    fontSize: typography.sm,
    color: colors.textPrimary,
  },
  clearBtn: {
    fontSize: 14,
    color: colors.textMuted,
    paddingHorizontal: spacing.xs,
  },

  filterScroll: { backgroundColor: '#fff', maxHeight: 52 },
  filterContent: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    gap: spacing.xs,
  },
  chip: {
    paddingHorizontal: spacing.sm + 4,
    paddingVertical: spacing.xs + 2,
    borderRadius: borderRadius.full,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: '#fff',
    marginRight: spacing.xs,
  },
  chipActive: {
    backgroundColor: colors.accent,
    borderColor: colors.accent,
  },
  chipText: {
    fontSize: typography.xs,
    color: colors.textSecondary,
    fontWeight: '600',
  },
  chipTextActive: {
    color: colors.primary,
    fontWeight: '800',
  },

  resultCount: {
    fontSize: typography.xs,
    color: colors.textMuted,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    backgroundColor: '#f8f9fa',
  },

  list: {
    padding: spacing.md,
  },

  loadingContainer: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  emptyContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.xl,
    gap: spacing.sm,
  },
  emptyIcon: { fontSize: 56 },
  emptyTitle: {
    fontSize: typography.lg,
    fontWeight: '800',
    color: colors.textPrimary,
  },
  emptySubtext: {
    fontSize: typography.sm,
    color: colors.textMuted,
    textAlign: 'center',
  },
});
