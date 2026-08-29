import React from 'react';
import type { StyleProp, ViewStyle } from 'react-native';
import { Image, StyleSheet, Text, View } from 'react-native';
import { useTogtTheme } from '../design';

export type BrandMarkProps = {
  compact?: boolean;
  showDescriptor?: boolean;
  tone?: 'brand' | 'ink' | 'inverse';
  style?: StyleProp<ViewStyle>;
  testID?: string;
};

export function BrandMark({
  compact = false,
  showDescriptor = false,
  tone = 'brand',
  style,
  testID,
}: BrandMarkProps) {
  const theme = useTogtTheme();
  const color = tone === 'inverse'
    ? theme.colors.textInverse
    : tone === 'ink'
      ? theme.colors.text
      : theme.colors.actionPrimary;

  return (
    <View
      accessible
      accessibilityRole="image"
      accessibilityLabel="TOGT"
      style={[styles.row, style]}
      testID={testID}
    >
      <Image
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
        resizeMode="contain"
        source={require('../../assets/adaptive-icon.png')}
        style={compact ? styles.compactMark : styles.mark}
      />
      <Text
        allowFontScaling
        style={[
          compact ? theme.typography.h3 : theme.typography.h2,
          styles.wordmark,
          { color, marginLeft: theme.spacing.xs },
        ]}
      >
        TOGT
      </Text>
      {showDescriptor ? (
        <>
          <View
            style={[
              styles.rule,
              {
                backgroundColor: color,
                marginHorizontal: theme.spacing.xs,
                width: theme.border.thin,
              },
            ]}
          />
          <Text
            allowFontScaling
            style={[theme.typography.caption, styles.descriptor, { color }]}
          >
            Grounded Momentum
          </Text>
        </>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    alignItems: 'center',
    flexDirection: 'row',
    flexShrink: 1,
  },
  wordmark: {
    letterSpacing: 0.8,
  },
  mark: {
    height: 36,
    width: 36,
  },
  compactMark: {
    height: 28,
    width: 28,
  },
  rule: {
    alignSelf: 'stretch',
  },
  descriptor: {
    flexShrink: 1,
  },
});

export default BrandMark;
