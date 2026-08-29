import React, { useState } from 'react';
import type { ReactNode } from 'react';
import type {
  StyleProp,
  TextInputProps,
  TextStyle,
  ViewStyle,
} from 'react-native';
import { StyleSheet, Text, TextInput, View } from 'react-native';
import { useTogtTheme } from '../design';

export interface TextFieldProps extends Omit<TextInputProps, 'style'> {
  label: string;
  helperText?: string;
  error?: string;
  required?: boolean;
  disabled?: boolean;
  leading?: ReactNode;
  trailing?: ReactNode;
  containerStyle?: StyleProp<ViewStyle>;
  inputStyle?: StyleProp<TextStyle>;
}

export function TextField({
  label,
  helperText,
  error,
  required = false,
  disabled = false,
  leading,
  trailing,
  containerStyle,
  inputStyle,
  multiline = false,
  onBlur,
  onFocus,
  accessibilityHint,
  ...textInputProps
}: TextFieldProps) {
  const theme = useTogtTheme();
  const [focused, setFocused] = useState(false);
  const visibleLabel = required ? `${label} (required)` : label;
  const borderColor = error
    ? theme.colors.error
    : focused
      ? theme.colors.focus
      : theme.colors.border;

  const handleFocus: NonNullable<TextInputProps['onFocus']> = (event) => {
    setFocused(true);
    onFocus?.(event);
  };

  const handleBlur: NonNullable<TextInputProps['onBlur']> = (event) => {
    setFocused(false);
    onBlur?.(event);
  };

  return (
    <View style={[styles.group, containerStyle]}>
      <Text allowFontScaling style={[theme.typography.label, { color: theme.colors.text }]}>
        {visibleLabel}
      </Text>
      <View
        style={[
          styles.field,
          {
            backgroundColor: disabled ? theme.colors.surfaceSubtle : theme.colors.surface,
            borderColor,
            borderRadius: theme.radius.input,
            borderWidth: focused || error ? theme.border.strong : theme.border.thin,
            marginTop: theme.spacing.xxs,
            minHeight: multiline ? theme.sizing.multilineFieldMinHeight : theme.sizing.touchTarget,
            opacity: disabled ? theme.opacity.disabled : theme.opacity.solid,
            paddingHorizontal: theme.spacing.sm,
          },
        ]}
      >
        {leading ? (
          <View importantForAccessibility="no-hide-descendants" style={{ marginRight: theme.spacing.xs }}>
            {leading}
          </View>
        ) : null}
        <TextInput
          {...textInputProps}
          accessibilityHint={accessibilityHint ?? helperText}
          accessibilityLabel={visibleLabel}
          accessibilityState={{ disabled }}
          allowFontScaling
          editable={!disabled && textInputProps.editable !== false}
          multiline={multiline}
          onBlur={handleBlur}
          onFocus={handleFocus}
          placeholderTextColor={theme.colors.textSecondary}
          selectionColor={theme.colors.focus}
          style={[
            theme.typography.body,
            styles.input,
            multiline && styles.multiline,
            { color: theme.colors.text, paddingVertical: theme.spacing.sm },
            inputStyle,
          ]}
          textAlignVertical={multiline ? 'top' : 'center'}
        />
        {trailing ? (
          <View importantForAccessibility="no-hide-descendants" style={{ marginLeft: theme.spacing.xs }}>
            {trailing}
          </View>
        ) : null}
      </View>
      {error ? (
        <Text
          accessibilityLiveRegion="polite"
          accessibilityRole="alert"
          allowFontScaling
          style={[theme.typography.caption, { color: theme.colors.error, marginTop: theme.spacing.xxs }]}
        >
          {error}
        </Text>
      ) : helperText ? (
        <Text
          allowFontScaling
          style={[theme.typography.caption, { color: theme.colors.textSecondary, marginTop: theme.spacing.xxs }]}
        >
          {helperText}
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  group: {
    alignSelf: 'stretch',
  },
  field: {
    alignItems: 'center',
    flexDirection: 'row',
  },
  input: {
    flex: 1,
    minWidth: 0,
  },
  multiline: {
    alignSelf: 'stretch',
  },
});

export default TextField;
