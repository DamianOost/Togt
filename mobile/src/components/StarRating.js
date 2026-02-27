import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';

export default function StarRating({ rating, maxStars = 5, size = 20, interactive = false, onRate }) {
  return (
    <View style={styles.row}>
      {Array.from({ length: maxStars }).map((_, i) => {
        const filled = i < Math.round(rating);
        return (
          <TouchableOpacity
            key={i}
            disabled={!interactive}
            onPress={() => onRate?.(i + 1)}
          >
            <Text style={[styles.star, { fontSize: size, color: filled ? '#F59E0B' : '#D1D5DB' }]}>
              ★
            </Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row' },
});
