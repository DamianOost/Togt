import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { getStatusColor, getStatusLabel } from '../utils/formatters';

export default function BookingStatusBadge({ status }) {
  return (
    <View style={[styles.badge, { backgroundColor: getStatusColor(status) + '20' }]}>
      <Text style={[styles.text, { color: getStatusColor(status) }]}>
        {getStatusLabel(status)}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 20,
    alignSelf: 'flex-start',
  },
  text: {
    fontSize: 12,
    fontWeight: '600',
  },
});
