import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Image } from 'react-native';
import StarRating from './StarRating';
import { formatZAR } from '../utils/formatters';

export default function LabourerCard({ labourer, onPress, distance }) {
  return (
    <TouchableOpacity style={styles.card} onPress={onPress}>
      <Image
        source={
          labourer.avatar_url
            ? { uri: labourer.avatar_url }
            : require('../../assets/default-avatar.png')
        }
        style={styles.avatar}
      />
      <View style={styles.info}>
        <Text style={styles.name}>{labourer.name}</Text>
        <Text style={styles.skills} numberOfLines={1}>
          {(labourer.skills || []).join(', ')}
        </Text>
        <View style={styles.row}>
          <StarRating rating={labourer.rating_avg || 0} size={14} />
          <Text style={styles.ratingCount}>({labourer.rating_count || 0})</Text>
        </View>
      </View>
      <View style={styles.right}>
        <Text style={styles.rate}>{formatZAR(labourer.hourly_rate)}/hr</Text>
        {distance != null && (
          <Text style={styles.distance}>{distance.toFixed(1)} km</Text>
        )}
        <View style={[styles.dot, { backgroundColor: labourer.is_available ? '#10B981' : '#6B7280' }]} />
      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 12,
    marginBottom: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.08,
    shadowRadius: 4,
    elevation: 2,
    alignItems: 'center',
  },
  avatar: { width: 52, height: 52, borderRadius: 26, backgroundColor: '#E5E7EB' },
  info: { flex: 1, marginLeft: 12 },
  name: { fontSize: 15, fontWeight: '700', color: '#111827' },
  skills: { fontSize: 13, color: '#6B7280', marginTop: 2 },
  row: { flexDirection: 'row', alignItems: 'center', marginTop: 4 },
  ratingCount: { fontSize: 12, color: '#9CA3AF', marginLeft: 4 },
  right: { alignItems: 'flex-end', gap: 4 },
  rate: { fontSize: 14, fontWeight: '700', color: '#1A6B3A' },
  distance: { fontSize: 12, color: '#6B7280' },
  dot: { width: 8, height: 8, borderRadius: 4 },
});
