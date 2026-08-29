import React, { useState } from 'react';
import type { PressableProps, StyleProp, ViewStyle } from 'react-native';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useTogtTheme } from '../design';

export type ChipTone = 'neutral' | 'brand' | 'attention' | 'danger';

export type ChipProps = {
  label: string;
  tone?: ChipTone;
  selected?: boolean;
  disabled?: boolean;
  onPress?: PressableProps['onPress'];
  accessibilityHint?: string;
  accessibilityRole?: PressableProps['accessibilityRole'];
  style?: StyleProp<ViewStyle>;
  testID?: string;
};

export function Chip({
  label,
  tone = 'neutral',
  selected = false,
  disabled = false,
  onPress,
  accessibilityHint,
  accessibilityRole = 'button',
  style,
  testID,
}: ChipProps) {
  const theme = useTogtTheme();
  const [focused, setFocused] = useState(false);
  const toneStyle = {
    neutral: { background: theme.colors.surface, text: theme.colors.text, border: theme.colors.border },
    brand: { background: theme.colors.surfacePositive, text: theme.colors.actionPrimaryPressed, border: theme.colors.actionPrimary },
    attention: { background: theme.colors.surfaceAttention, text: theme.colors.textOnAttention, border: theme.colors.attention },
    danger: { background: theme.colors.surfaceDanger, text: theme.colors.error, border: theme.colors.error },
  }[tone];
  const containerStyle: StyleProp<ViewStyle> = [
    styles.chip,
    {
      backgroundColor: selected ? theme.colors.actionPrimary : toneStyle.background,
      borderColor: focused
        ? theme.colors.text
        : selected
          ? theme.colors.actionPrimary
          : toneStyle.border,
      borderRadius: theme.radius.pill,
      borderWidth: focused ? theme.border.strong : theme.border.thin,
      minHeight: onPress ? theme.sizing.touchTarget : theme.sizing.chipHeight,
      opacity: disabled ? theme.opacity.disabled : theme.opacity.solid,
      paddingHorizontal: theme.spacing.sm,
    },
    style,
  ];
  const content = (
    <Text
      allowFontScaling
      style={[
        theme.typography.label,
        { color: selected ? theme.colors.textInverse : toneStyle.text },
      ]}
    >
      {label}
    </Text>
  );

  if (!onPress) {
    return (
      <View accessible accessibilityLabel={label} style={containerStyle} testID={testID}>
        {content}
      </View>
    );
  }

  return (
    <Pressable
      accessibilityHint={accessibilityHint}
      accessibilityLabel={label}
      accessibilityRole={accessibilityRole}
      accessibilityState={{ disabled, selected }}
      disabled={disabled}
      onBlur={() => setFocused(false)}
      onFocus={() => setFocused(true)}
      onPress={onPress}
      style={({ pressed }) => [
        containerStyle,
        pressed && { opacity: theme.opacity.pressed },
      ]}
      testID={testID}
    >
      {content}
    </Pressable>
  );
}

export type StatusTone = 'available' | 'pending' | 'inProgress' | 'complete' | 'error' | 'emergency' | 'offline';

export type StatusPillProps = {
  label: string;
  tone: StatusTone;
  style?: StyleProp<ViewStyle>;
  testID?: string;
};

export function StatusPill({ label, tone, style, testID }: StatusPillProps) {
  const theme = useTogtTheme();
  const toneStyle = {
    available: { background: theme.colors.surfacePositive, indicator: theme.colors.success, text: theme.colors.actionPrimaryPressed },
    pending: { background: theme.colors.surfaceAttention, indicator: theme.colors.attention, text: theme.colors.textOnAttention },
    inProgress: { background: theme.colors.surfacePositive, indicator: theme.colors.actionPrimary, text: theme.colors.actionPrimaryPressed },
    complete: { background: theme.colors.surfacePositive, indicator: theme.colors.success, text: theme.colors.actionPrimaryPressed },
    error: { background: theme.colors.surfaceDanger, indicator: theme.colors.error, text: theme.colors.error },
    emergency: { background: theme.colors.surfaceDanger, indicator: theme.colors.emergency, text: theme.colors.emergency },
    offline: { background: theme.colors.surfaceSubtle, indicator: theme.colors.offline, text: theme.colors.textSecondary },
  }[tone];

  return (
    <View
      accessible
      accessibilityLabel={`${label} status`}
      style={[
        styles.status,
        {
          backgroundColor: toneStyle.background,
          borderRadius: theme.radius.pill,
          columnGap: theme.spacing.xs,
          minHeight: theme.sizing.chipHeight,
          paddingHorizontal: theme.spacing.sm,
        },
        style,
      ]}
      testID={testID}
    >
      <View
        importantForAccessibility="no"
        style={[
          styles.dot,
          {
            backgroundColor: toneStyle.indicator,
            borderRadius: theme.radius.pill,
            height: theme.sizing.statusDot,
            width: theme.sizing.statusDot,
          },
        ]}
      />
      <Text allowFontScaling style={[theme.typography.caption, { color: toneStyle.text }]}>
        {label}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  chip: {
    alignItems: 'center',
    alignSelf: 'flex-start',
    justifyContent: 'center',
  },
  status: {
    alignItems: 'center',
    alignSelf: 'flex-start',
    flexDirection: 'row',
  },
  dot: {
    flexShrink: 0,
  },
});

export default Chip;
