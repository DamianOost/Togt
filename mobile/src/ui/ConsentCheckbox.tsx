import React, { useState } from 'react';
import type { PressableProps, StyleProp, ViewStyle } from 'react-native';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useTogtTheme } from '../design';

export type ConsentCheckboxProps = Readonly<{
  checked: boolean;
  label: string;
  onPress: NonNullable<PressableProps['onPress']>;
  disabled?: boolean;
  testID?: string;
  style?: StyleProp<ViewStyle>;
}>;

export function ConsentCheckbox({
  checked,
  label,
  onPress,
  disabled = false,
  testID,
  style,
}: ConsentCheckboxProps) {
  const theme = useTogtTheme();
  const [focused, setFocused] = useState(false);
  return (
    <Pressable
      accessibilityLabel={label}
      accessibilityRole="checkbox"
      accessibilityState={{ checked, disabled }}
      android_ripple={{ color: theme.colors.actionSecondaryPressed }}
      disabled={disabled}
      onBlur={() => setFocused(false)}
      onFocus={() => setFocused(true)}
      onPress={onPress}
      style={({ pressed }) => [
        styles.row,
        {
          borderColor: focused ? theme.colors.focus : theme.colors.border,
          borderRadius: theme.radius.input,
          borderWidth: focused ? theme.border.strong : theme.border.thin,
          columnGap: theme.spacing.sm,
          minHeight: theme.sizing.touchTarget,
          opacity: disabled ? theme.opacity.disabled : pressed ? theme.opacity.pressed : theme.opacity.solid,
          padding: theme.spacing.sm,
        },
        style,
      ]}
      testID={testID}
    >
      <View
        importantForAccessibility="no-hide-descendants"
        style={[
          styles.box,
          {
            backgroundColor: checked ? theme.colors.actionPrimary : theme.colors.surface,
            borderColor: checked ? theme.colors.actionPrimaryPressed : theme.colors.borderStrong,
            borderRadius: theme.radius.input,
          },
        ]}
      >
        {checked ? (
          <View
            style={[
              styles.check,
              {
                borderBottomColor: theme.colors.textInverse,
                borderRightColor: theme.colors.textInverse,
              },
            ]}
          />
        ) : null}
      </View>
      <Text allowFontScaling style={[theme.typography.bodySmall, styles.label, { color: theme.colors.text }]}>
        {label}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  box: {
    alignItems: 'center',
    borderWidth: 2,
    height: 24,
    justifyContent: 'center',
    width: 24,
  },
  check: {
    borderBottomWidth: 2,
    borderRightWidth: 2,
    height: 13,
    marginTop: -3,
    transform: [{ rotate: '45deg' }],
    width: 7,
  },
  label: {
    flex: 1,
  },
  row: {
    alignItems: 'center',
    flexDirection: 'row',
  },
});

export default ConsentCheckbox;
