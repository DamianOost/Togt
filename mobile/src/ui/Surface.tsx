import React, { useState } from 'react';
import type { PropsWithChildren } from 'react';
import type { PressableProps, StyleProp, ViewStyle } from 'react-native';
import { Pressable, StyleSheet, View } from 'react-native';
import { useTogtTheme } from '../design';

export type SurfaceVariant = 'default' | 'subtle' | 'positive' | 'attention' | 'danger' | 'inverse';
export type SurfaceElevation = 'flat' | 'card' | 'floating';

export type SurfaceProps = PropsWithChildren<{
  variant?: SurfaceVariant;
  elevation?: SurfaceElevation;
  selected?: boolean;
  disabled?: boolean;
  onPress?: PressableProps['onPress'];
  accessibilityLabel?: string;
  accessibilityHint?: string;
  style?: StyleProp<ViewStyle>;
  testID?: string | undefined;
}>;

export function Surface({
  children,
  variant = 'default',
  elevation = 'flat',
  selected = false,
  disabled = false,
  onPress,
  accessibilityLabel,
  accessibilityHint,
  style,
  testID,
}: SurfaceProps) {
  const theme = useTogtTheme();
  const [focused, setFocused] = useState(false);
  const backgroundColor = {
    default: theme.colors.surface,
    subtle: theme.colors.surfaceSubtle,
    positive: theme.colors.surfacePositive,
    attention: theme.colors.surfaceAttention,
    danger: theme.colors.surfaceDanger,
    inverse: theme.colors.surfaceInverse,
  }[variant];
  const baseStyle: StyleProp<ViewStyle> = [
    styles.surface,
    theme.elevation[elevation],
    {
      backgroundColor,
      borderColor: focused || selected ? theme.colors.focus : theme.colors.border,
      borderRadius: theme.radius.card,
      borderWidth: focused || selected ? theme.border.strong : theme.border.thin,
      opacity: disabled ? theme.opacity.disabled : theme.opacity.solid,
      padding: theme.spacing.md,
    },
    style,
  ];

  if (!onPress) {
    return (
      <View
        accessible={Boolean(accessibilityLabel) || selected}
        accessibilityHint={accessibilityHint}
        accessibilityLabel={accessibilityLabel}
        accessibilityState={{ disabled, selected }}
        style={baseStyle}
        testID={testID}
      >
        {children}
      </View>
    );
  }

  return (
    <Pressable
      accessibilityHint={accessibilityHint}
      accessibilityLabel={accessibilityLabel}
      accessibilityRole="button"
      accessibilityState={{ disabled, selected }}
      android_ripple={{ color: theme.colors.actionSecondaryPressed }}
      disabled={disabled}
      onBlur={() => setFocused(false)}
      onFocus={() => setFocused(true)}
      onPress={onPress}
      style={({ pressed }) => [
        baseStyle,
        pressed && { opacity: theme.opacity.pressed },
      ]}
      testID={testID}
    >
      {children}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  surface: {
    overflow: 'hidden',
  },
});

export default Surface;
