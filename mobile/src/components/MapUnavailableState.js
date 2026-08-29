import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { colors, typography, spacing, borderRadius } from '../theme';

export default function MapUnavailableState({ detail, style }) {
  return (
    <View style={[styles.container, style]} accessibilityRole="summary">
      <View style={styles.iconShell}>
        <Text style={styles.icon}>⌖</Text>
      </View>
      <Text style={styles.title}>Map unavailable in this internal build</Text>
      <Text style={styles.detail}>{detail}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.xl,
  },
  iconShell: {
    width: 68,
    height: 68,
    borderRadius: borderRadius.full,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(245, 158, 11, 0.14)',
    borderWidth: 1,
    borderColor: 'rgba(245, 158, 11, 0.38)',
    marginBottom: spacing.md,
  },
  icon: {
    color: colors.accent,
    fontSize: 34,
    fontWeight: '700',
  },
  title: {
    color: colors.textInverse,
    fontSize: typography.lg,
    fontWeight: '800',
    textAlign: 'center',
  },
  detail: {
    color: colors.textMuted,
    fontSize: typography.sm,
    lineHeight: 20,
    textAlign: 'center',
    marginTop: spacing.xs,
    maxWidth: 420,
  },
});
