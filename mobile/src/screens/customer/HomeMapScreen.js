import React, { useEffect, useState, useRef, useCallback } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet,
  FlatList, ActivityIndicator, Alert, StatusBar,
  Animated, Dimensions, ScrollView, PanResponder,
} from 'react-native';
import MapView, { Marker } from 'react-native-maps';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useSelector, useDispatch } from 'react-redux';
import { logoutThunk } from '../../store/authSlice';
import { locationService } from '../../services/locationService';
import api from '../../services/api';
import { formatZAR } from '../../utils/formatters';
import { colors, typography, spacing, borderRadius, shadows, darkMapStyle } from '../../theme';

const { width, height } = Dimensions.get('window');
const BOTTOM_SHEET_MIN = 140;
const BOTTOM_SHEET_MAX = height * 0.55;

const SKILL_ICONS = {
  All: '🔍',
  Plumbing: '🔧',
  Painting: '🎨',
  Electrical: '⚡',
  Building: '🧱',
  Cleaning: '🧹',
  Tiling: '⬜',
  Garden: '🌱',
  Carpentry: '🪚',
  Welding: '🔥',
};

const SKILLS = Object.keys(SKILL_ICONS);

function StarRow({ rating, size = 14 }) {
  const filled = Math.round(rating || 0);
  return (
    <View style={{ flexDirection: 'row', gap: 2 }}>
      {[1, 2, 3, 4, 5].map((i) => (
        <Text key={i} style={{ fontSize: size, color: i <= filled ? colors.accent : colors.border }}>
          ★
        </Text>
      ))}
    </View>
  );
}

export default function HomeMapScreen({ navigation }) {
  const dispatch = useDispatch();
  const { user } = useSelector((s) => s.auth);
  const insets = useSafeAreaInsets();

  const [location, setLocation] = useState(null);
  const [labourers, setLabourers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [selectedSkill, setSelectedSkill] = useState('All');
  const [selectedLabourer, setSelectedLabourer] = useState(null);
  const mapRef = useRef(null);

  const sheetHeight = useRef(new Animated.Value(BOTTOM_SHEET_MIN)).current;
  const lastHeight = useRef(BOTTOM_SHEET_MIN);

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderMove: (_, gs) => {
        const newH = Math.max(
          BOTTOM_SHEET_MIN,
          Math.min(BOTTOM_SHEET_MAX, lastHeight.current - gs.dy)
        );
        sheetHeight.setValue(newH);
      },
      onPanResponderRelease: (_, gs) => {
        const newH = lastHeight.current - gs.dy;
        const snapped = newH > (BOTTOM_SHEET_MIN + BOTTOM_SHEET_MAX) / 2
          ? BOTTOM_SHEET_MAX
          : BOTTOM_SHEET_MIN;
        lastHeight.current = snapped;
        Animated.spring(sheetHeight, { toValue: snapped, useNativeDriver: false }).start();
      },
    })
  ).current;

  useEffect(() => {
    async function init() {
      const granted = await locationService.requestPermission();
      if (!granted) {
        Alert.alert('Location needed', 'Please allow location to find nearby labourers.');
        return;
      }
      const pos = await locationService.getCurrentPosition();
      setLocation(pos);
      fetchLabourers(pos, null);
    }
    init();
  }, []);

  async function fetchLabourers(pos, skill) {
    setLoading(true);
    try {
      const params = { lat: pos.lat, lng: pos.lng, radius: 50 };
      if (skill && skill !== 'All') params.skill = skill;
      const res = await api.get('/labourers', { params });
      setLabourers(res.data.labourers || []);
    } catch {
      Alert.alert('Error', 'Could not load labourers');
    } finally {
      setLoading(false);
    }
  }

  const onRefresh = useCallback(async () => {
    if (!location) return;
    setRefreshing(true);
    await fetchLabourers(location, selectedSkill);
    setRefreshing(false);
  }, [location, selectedSkill]);

  function selectSkill(skill) {
    setSelectedSkill(skill);
    setSelectedLabourer(null);
    if (location) fetchLabourers(location, skill);
  }

  function onMarkerPress(labourer) {
    setSelectedLabourer(labourer);
    lastHeight.current = BOTTOM_SHEET_MAX;
    Animated.spring(sheetHeight, { toValue: BOTTOM_SHEET_MAX, useNativeDriver: false }).start();
  }

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor={colors.primary} />

      {/* Map */}
      {location ? (
        <MapView
          ref={mapRef}
          style={StyleSheet.absoluteFill}
          customMapStyle={darkMapStyle}
          initialRegion={{
            latitude: location.lat,
            longitude: location.lng,
            latitudeDelta: 0.12,
            longitudeDelta: 0.12,
          }}
          showsUserLocation
          showsMyLocationButton={false}
        >
          {labourers.map((l) =>
            l.current_lat && l.current_lng ? (
              <Marker
                key={l.id}
                coordinate={{
                  latitude: parseFloat(l.current_lat),
                  longitude: parseFloat(l.current_lng),
                }}
                onPress={() => onMarkerPress(l)}
              >
                <View style={styles.markerContainer}>
                  <View style={styles.markerDot}>
                    <Text style={styles.markerIcon}>
                      {SKILL_ICONS[(l.skills || [])[0]] || '👷'}
                    </Text>
                  </View>
                  <View style={styles.markerTail} />
                </View>
              </Marker>
            ) : null
          )}
        </MapView>
      ) : (
        <View style={styles.loadingMap}>
          <ActivityIndicator color={colors.accent} size="large" />
          <Text style={styles.loadingText}>Finding your location...</Text>
        </View>
      )}

      {/* Top bar */}
      <SafeAreaView style={styles.topBar} edges={['top']}>
        <View style={styles.searchBar}>
          <Text style={styles.searchIcon}>📍</Text>
          <Text style={styles.searchText}>
            {user?.name?.split(' ')[0]}'s location
          </Text>
          <TouchableOpacity style={styles.avatarBtn} onPress={() => dispatch(logoutThunk())}>
            <Text style={styles.avatarText}>{user?.name?.[0] || 'U'}</Text>
          </TouchableOpacity>
        </View>

        {/* KYC badge */}
        {user?.kyc_status !== 'verified' ? (
          <TouchableOpacity
            onPress={() => navigation.navigate('KYC')}
            style={{ paddingHorizontal: 16, paddingVertical: 6, backgroundColor: 'rgba(245,158,11,0.15)', marginHorizontal: 16, borderRadius: 8, marginBottom: 4 }}
          >
            <Text style={{ fontSize: 12, color: '#F59E0B', fontWeight: '600', textAlign: 'center' }}>⚠️ Identity unverified — tap here to verify and unlock bookings</Text>
          </TouchableOpacity>
        ) : null}

        {/* Skill filter chips */}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.chips}
        >
          {SKILLS.map((skill) => (
            <TouchableOpacity
              key={skill}
              style={[styles.chip, selectedSkill === skill && styles.chipActive]}
              onPress={() => selectSkill(skill)}
            >
              <Text style={styles.chipIcon}>{SKILL_ICONS[skill]}</Text>
              <Text style={[styles.chipText, selectedSkill === skill && styles.chipTextActive]}>
                {skill}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      </SafeAreaView>

      {/* Bottom sheet */}
      <Animated.View style={[styles.bottomSheet, { height: sheetHeight }]}>
        <View {...panResponder.panHandlers} style={styles.sheetHandle}>
          <View style={styles.handle} />
        </View>

        {selectedLabourer ? (
          /* Selected labourer detail */
          <View style={styles.labourerDetail}>
            <View style={styles.labourerDetailRow}>
              <View style={styles.labourerAvatar}>
                <Text style={styles.labourerAvatarText}>
                  {selectedLabourer.name?.[0] || 'L'}
                </Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.labourerName}>{selectedLabourer.name}</Text>
                <View style={styles.ratingRow}>
                  <StarRow rating={selectedLabourer.rating_avg} size={13} />
                  <Text style={styles.ratingText}>
                    {parseFloat(selectedLabourer.rating_avg || 0).toFixed(1)} ({selectedLabourer.rating_count || 0})
                  </Text>
                </View>
                <Text style={styles.labourerSkill}>
                  {(selectedLabourer.skills || []).join(' · ')}
                </Text>
              </View>
              <View style={styles.rateBox}>
                <Text style={styles.rateAmount}>{formatZAR(selectedLabourer.hourly_rate)}</Text>
                <Text style={styles.rateLabel}>/hr</Text>
              </View>
            </View>

            {selectedLabourer.distance_km != null && (
              <View style={styles.distancePill}>
                <Text style={styles.distanceText}>
                  📍 {parseFloat(selectedLabourer.distance_km).toFixed(1)} km away
                </Text>
              </View>
            )}

            <TouchableOpacity
              style={styles.bookNowBtn}
              onPress={() => navigation.navigate('LabourerProfile', { labourer: selectedLabourer })}
            >
              <Text style={styles.bookNowBtnText}>Book Now</Text>
            </TouchableOpacity>
          </View>
        ) : (
          /* Default: worker list */
          <View style={styles.sheetContent}>
            <View style={styles.sheetHeader}>
              <Text style={styles.sheetTitle}>Find a Worker</Text>
              <View style={styles.countBadge}>
                <Text style={styles.countBadgeText}>{labourers.length} nearby</Text>
              </View>
            </View>

            {loading ? (
              <ActivityIndicator color={colors.accent} style={{ marginTop: spacing.md }} />
            ) : labourers.length === 0 ? (
              <Text style={styles.emptyText}>
                No workers found. Try a different skill or expand your area.
              </Text>
            ) : (
              <FlatList
                data={labourers}
                keyExtractor={(l) => l.id}
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.workerList}
                renderItem={({ item }) => (
                  <TouchableOpacity
                    style={styles.workerCard}
                    onPress={() => navigation.navigate('LabourerProfile', { labourer: item })}
                  >
                    <View style={styles.workerCardAvatar}>
                      <Text style={styles.workerCardAvatarText}>{item.name?.[0]}</Text>
                    </View>
                    <Text style={styles.workerCardName} numberOfLines={1}>
                      {item.name?.split(' ')[0]}
                    </Text>
                    <Text style={styles.workerCardSkill} numberOfLines={1}>
                      {(item.skills || [])[0]}
                    </Text>
                    <View style={styles.workerCardRating}>
                      <Text style={styles.workerCardStar}>★</Text>
                      <Text style={styles.workerCardRatingText}>
                        {parseFloat(item.rating_avg || 0).toFixed(1)}
                      </Text>
                    </View>
                    <Text style={styles.workerCardRate}>
                      {formatZAR(item.hourly_rate)}/hr
                    </Text>
                  </TouchableOpacity>
                )}
              />
            )}
          </View>
        )}
      </Animated.View>
      <TouchableOpacity
        style={requestNowStyles.fab}
        onPress={() => navigation.navigate('RequestMatch')}
      >
        <Text style={requestNowStyles.fabIcon}>⚡</Text>
        <Text style={requestNowStyles.fabText}>Request now</Text>
      </TouchableOpacity>
    </View>
  );
}

const requestNowStyles = StyleSheet.create({
  fab: {
    position: 'absolute',
    bottom: 28,
    alignSelf: 'center',
    backgroundColor: '#f59e0b',
    paddingHorizontal: 20,
    paddingVertical: 14,
    borderRadius: 999,
    flexDirection: 'row',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.25,
    shadowRadius: 16,
    elevation: 10,
  },
  fabIcon: { fontSize: 18, marginRight: 8 },
  fabText: { color: '#1a1a2e', fontWeight: '800', fontSize: 16 },
});

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  loadingMap: {
    flex: 1,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.md,
  },
  loadingText: {
    color: colors.textMuted,
    fontSize: typography.sm,
  },

  // Top bar
  topBar: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
  },
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.primary,
    marginHorizontal: spacing.md,
    marginBottom: spacing.sm,
    borderRadius: borderRadius.lg,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm + 2,
    ...shadows.card,
  },
  searchIcon: { fontSize: 16, marginRight: spacing.sm },
  searchText: {
    flex: 1,
    color: colors.textInverse,
    fontSize: typography.md,
    fontWeight: '600',
  },
  avatarBtn: {
    width: 32,
    height: 32,
    borderRadius: borderRadius.full,
    backgroundColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: {
    color: colors.primary,
    fontWeight: '800',
    fontSize: typography.sm,
  },
  chips: {
    paddingHorizontal: spacing.md,
    gap: spacing.sm,
    paddingBottom: spacing.sm,
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs + 2,
    borderRadius: borderRadius.full,
    backgroundColor: colors.primary,
    borderWidth: 1,
    borderColor: colors.borderDark,
    ...shadows.card,
  },
  chipActive: {
    backgroundColor: colors.accent,
    borderColor: colors.accent,
  },
  chipIcon: { fontSize: 13 },
  chipText: {
    fontSize: typography.sm,
    color: colors.textMuted,
    fontWeight: '500',
  },
  chipTextActive: { color: colors.primary, fontWeight: '700' },

  // Markers
  markerContainer: { alignItems: 'center' },
  markerDot: {
    width: 42,
    height: 42,
    borderRadius: borderRadius.full,
    backgroundColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 3,
    borderColor: '#fff',
    ...shadows.card,
  },
  markerIcon: { fontSize: 18 },
  markerTail: {
    width: 0,
    height: 0,
    borderLeftWidth: 6,
    borderRightWidth: 6,
    borderTopWidth: 8,
    borderLeftColor: 'transparent',
    borderRightColor: 'transparent',
    borderTopColor: colors.accent,
    marginTop: -1,
  },

  // Bottom sheet
  bottomSheet: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: '#fff',
    borderTopLeftRadius: borderRadius.lg,
    borderTopRightRadius: borderRadius.lg,
    ...shadows.upward,
  },
  sheetHandle: {
    alignItems: 'center',
    paddingVertical: spacing.sm,
  },
  handle: {
    width: 40,
    height: 4,
    borderRadius: borderRadius.full,
    backgroundColor: colors.border,
  },

  sheetContent: {
    flex: 1,
    paddingHorizontal: spacing.md,
  },
  sheetHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginBottom: spacing.sm,
  },
  sheetTitle: {
    fontSize: typography.lg,
    fontWeight: '800',
    color: colors.textPrimary,
  },
  countBadge: {
    backgroundColor: colors.accentLight,
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    borderRadius: borderRadius.full,
  },
  countBadgeText: {
    color: colors.accentDark,
    fontSize: typography.xs,
    fontWeight: '700',
  },
  emptyText: {
    color: colors.textMuted,
    fontSize: typography.sm,
    textAlign: 'center',
    marginTop: spacing.lg,
  },
  workerList: {
    paddingVertical: spacing.xs,
    gap: spacing.sm,
  },
  workerCard: {
    backgroundColor: colors.background,
    borderRadius: borderRadius.md,
    padding: spacing.md,
    alignItems: 'center',
    width: 110,
    borderWidth: 1,
    borderColor: colors.border,
  },
  workerCardAvatar: {
    width: 48,
    height: 48,
    borderRadius: borderRadius.full,
    backgroundColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.xs,
  },
  workerCardAvatarText: {
    color: colors.primary,
    fontWeight: '800',
    fontSize: typography.lg,
  },
  workerCardName: {
    fontSize: typography.sm,
    fontWeight: '700',
    color: colors.textPrimary,
    marginBottom: 2,
  },
  workerCardSkill: {
    fontSize: typography.xs,
    color: colors.textMuted,
    marginBottom: spacing.xs,
  },
  workerCardRating: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    marginBottom: 2,
  },
  workerCardStar: { color: colors.accent, fontSize: typography.sm },
  workerCardRatingText: {
    fontSize: typography.xs,
    color: colors.textSecondary,
    fontWeight: '600',
  },
  workerCardRate: {
    fontSize: typography.xs,
    color: colors.success,
    fontWeight: '700',
  },

  // Labourer detail
  labourerDetail: {
    paddingHorizontal: spacing.md,
    paddingTop: spacing.xs,
  },
  labourerDetailRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.md,
    marginBottom: spacing.sm,
  },
  labourerAvatar: {
    width: 56,
    height: 56,
    borderRadius: borderRadius.full,
    backgroundColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  labourerAvatarText: {
    color: colors.primary,
    fontWeight: '800',
    fontSize: typography.xl,
  },
  labourerName: {
    fontSize: typography.lg,
    fontWeight: '800',
    color: colors.textPrimary,
    marginBottom: 3,
  },
  ratingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    marginBottom: 3,
  },
  ratingText: {
    fontSize: typography.xs,
    color: colors.textMuted,
  },
  labourerSkill: {
    fontSize: typography.xs,
    color: colors.textMuted,
    fontWeight: '500',
  },
  rateBox: { alignItems: 'flex-end' },
  rateAmount: {
    fontSize: typography.xl,
    fontWeight: '900',
    color: colors.success,
  },
  rateLabel: {
    fontSize: typography.xs,
    color: colors.textMuted,
  },
  distancePill: {
    alignSelf: 'flex-start',
    backgroundColor: colors.infoLight,
    paddingHorizontal: spacing.sm,
    paddingVertical: 3,
    borderRadius: borderRadius.full,
    marginBottom: spacing.md,
  },
  distanceText: {
    fontSize: typography.xs,
    color: colors.info,
    fontWeight: '600',
  },
  bookNowBtn: {
    backgroundColor: colors.accent,
    borderRadius: borderRadius.lg,
    paddingVertical: spacing.md,
    alignItems: 'center',
    ...shadows.card,
  },
  bookNowBtnText: {
    color: colors.primary,
    fontSize: typography.lg,
    fontWeight: '800',
  },
});
