import React, { useState } from 'react';
import type { ReactNode } from 'react';
import type { PressableProps, StyleProp, ViewStyle } from 'react-native';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { useTogtTheme } from '../design';

export type ButtonVariant = 'primary' | 'secondary' | 'tertiary' | 'danger';

export interface ButtonProps extends Omit<PressableProps, 'children' | 'style'> {
  label: string;
  variant?: ButtonVariant;
  loading?: boolean;
  leading?: ReactNode;
  trailing?: ReactNode;
  fullWidth?: boolean;
  large?: boolean;
  style?: StyleProp<ViewStyle>;
}

export function Button({
  label,
  variant = 'primary',
  loading = false,
  leading,
  trailing,
  fullWidth = false,
  large = false,
  disabled = false,
  accessibilityHint,
  accessibilityLabel = label,
  accessibilityState,
  onBlur,
  onFocus,
  style,
  ...pressableProps
}: ButtonProps) {
  const theme = useTogtTheme();
  const [focused, setFocused] = useState(false);
  const isDisabled = disabled || loading;
  const palette = {
    primary: {
      background: theme.colors.actionPrimary,
      pressed: theme.colors.actionPrimaryPressed,
      border: theme.colors.actionPrimary,
      text: theme.colors.textInverse,
    },
    secondary: {
      background: theme.colors.actionSecondary,
      pressed: theme.colors.actionSecondaryPressed,
      border: theme.colors.borderStrong,
      text: theme.colors.text,
    },
    tertiary: {
      background: theme.colors.actionTertiary,
      pressed: theme.colors.actionSecondaryPressed,
      border: theme.colors.actionTertiary,
      text: theme.colors.actionPrimaryPressed,
    },
    danger: {
      background: theme.colors.actionDanger,
      pressed: theme.colors.actionDanger,
      border: theme.colors.actionDanger,
      text: theme.colors.textInverse,
    },
  }[variant];
  const focusBorderColor = variant === 'primary' || variant === 'danger'
    ? theme.colors.textInverse
    : theme.colors.focus;
  const handleFocus: NonNullable<PressableProps['onFocus']> = (event) => {
    setFocused(true);
    onFocus?.(event);
  };
  const handleBlur: NonNullable<PressableProps['onBlur']> = (event) => {
    setFocused(false);
    onBlur?.(event);
  };

  return (
    <Pressable
      {...pressableProps}
      accessibilityHint={accessibilityHint}
      accessibilityLabel={accessibilityLabel}
      accessibilityRole="button"
      accessibilityState={{
        ...accessibilityState,
        busy: loading,
        disabled: isDisabled,
      }}
      android_ripple={{ color: palette.pressed }}
      disabled={isDisabled}
      onBlur={handleBlur}
      onFocus={handleFocus}
      style={({ pressed }) => [
        styles.button,
        {
          backgroundColor: pressed ? palette.pressed : palette.background,
          borderColor: focused ? focusBorderColor : palette.border,
          borderRadius: theme.radius.input,
          borderWidth: focused ? theme.border.strong : theme.border.thin,
          minHeight: large ? theme.sizing.controlHeightLarge : theme.sizing.touchTarget,
          opacity: isDisabled ? theme.opacity.disabled : theme.opacity.solid,
          paddingHorizontal: theme.spacing.lg,
        },
        fullWidth && styles.fullWidth,
        pressed && variant === 'danger' && { opacity: theme.opacity.pressed },
        style,
      ]}
    >
      <View style={[styles.content, { columnGap: theme.spacing.xs }]}>
        {loading ? (
          <ActivityIndicator
            color={palette.text}
            importantForAccessibility="no-hide-descendants"
            size="small"
          />
        ) : leading ? (
          <View importantForAccessibility="no-hide-descendants">{leading}</View>
        ) : null}
        <Text allowFontScaling style={[theme.typography.label, styles.label, { color: palette.text }]}>
          {label}
        </Text>
        {!loading && trailing ? (
          <View importantForAccessibility="no-hide-descendants">{trailing}</View>
        ) : null}
      </View>
    </Pressable>
  );
}

export function PrimaryButton(props: Omit<ButtonProps, 'variant'>) {
  return <Button {...props} variant="primary" />;
}

export function SecondaryButton(props: Omit<ButtonProps, 'variant'>) {
  return <Button {...props} variant="secondary" />;
}

export function TertiaryButton(props: Omit<ButtonProps, 'variant'>) {
  return <Button {...props} variant="tertiary" />;
}

export function DangerButton(props: Omit<ButtonProps, 'variant'>) {
  return <Button {...props} variant="danger" />;
}

const styles = StyleSheet.create({
  button: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  content: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'center',
  },
  fullWidth: {
    alignSelf: 'stretch',
    width: '100%',
  },
  label: {
    flexShrink: 1,
    textAlign: 'center',
  },
});

export default Button;
