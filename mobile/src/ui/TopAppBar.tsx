import React from 'react';
import type { ReactNode, Ref } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useLayoutMetrics, useTogtTheme } from '../design';
import { BrandMark } from './BrandMark';

export type TopAppBarAction = {
  accessibilityLabel: string;
  accessibilityHint?: string;
  content: ReactNode;
  disabled?: boolean;
  onPress: () => void;
  testID?: string;
};

export type TopAppBarProps = {
  title?: string;
  subtitle?: string;
  onBack?: () => void;
  backLabel?: string;
  leading?: ReactNode;
  actions?: TopAppBarAction[];
  testID?: string;
  titleRef?: Ref<Text>;
};

export function TopAppBar({
  title,
  subtitle,
  onBack,
  backLabel = 'Back',
  leading,
  actions = [],
  testID,
  titleRef,
}: TopAppBarProps) {
  const theme = useTogtTheme();
  const layout = useLayoutMetrics();

  return (
    <View
      style={[
        styles.bar,
        {
          backgroundColor: theme.colors.canvas,
          borderBottomColor: theme.colors.border,
          borderBottomWidth: theme.border.thin,
          minHeight: theme.sizing.appBarMinHeight,
          paddingHorizontal: layout.horizontalPadding,
          paddingVertical: theme.spacing.xs,
        },
      ]}
      testID={testID}
    >
      <View style={[styles.leading, { marginRight: theme.spacing.sm }]}>
        {onBack ? (
          <Pressable
            accessibilityLabel={backLabel}
            accessibilityRole="button"
            hitSlop={theme.spacing.xs}
            onPress={onBack}
            style={({ pressed }) => [
              styles.action,
              {
                borderRadius: theme.radius.input,
                minHeight: theme.sizing.touchTarget,
                minWidth: theme.sizing.touchTarget,
              },
              pressed && { backgroundColor: theme.colors.actionSecondaryPressed },
            ]}
          >
            <Text allowFontScaling style={[theme.typography.label, { color: theme.colors.actionPrimaryPressed }]}>
              {backLabel}
            </Text>
          </Pressable>
        ) : leading ? (
          leading
        ) : (
          <BrandMark compact />
        )}
      </View>

      <View style={styles.titleGroup}>
        {title ? (
          <Text
            accessibilityRole="header"
            allowFontScaling
            ref={titleRef}
            style={[theme.typography.h3, { color: theme.colors.text }]}
          >
            {title}
          </Text>
        ) : null}
        {subtitle ? (
          <Text allowFontScaling style={[theme.typography.caption, { color: theme.colors.textSecondary }]}>
            {subtitle}
          </Text>
        ) : null}
      </View>

      {actions.length > 0 ? (
        <View style={[styles.actions, { marginLeft: theme.spacing.sm }]}>
          {actions.map((action) => (
            <Pressable
              accessibilityHint={action.accessibilityHint}
              accessibilityLabel={action.accessibilityLabel}
              accessibilityRole="button"
              accessibilityState={{ disabled: action.disabled }}
              disabled={action.disabled}
              hitSlop={theme.spacing.xs}
              key={action.accessibilityLabel}
              onPress={action.onPress}
              style={({ pressed }) => [
                styles.action,
                {
                  borderRadius: theme.radius.input,
                  minHeight: theme.sizing.touchTarget,
                  minWidth: theme.sizing.touchTarget,
                  opacity: action.disabled ? theme.opacity.disabled : theme.opacity.solid,
                },
                pressed && { backgroundColor: theme.colors.actionSecondaryPressed },
              ]}
              testID={action.testID}
            >
              <View importantForAccessibility="no-hide-descendants">{action.content}</View>
            </Pressable>
          ))}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    alignItems: 'center',
    flexDirection: 'row',
  },
  leading: {
    alignItems: 'flex-start',
    justifyContent: 'center',
  },
  titleGroup: {
    flex: 1,
    justifyContent: 'center',
  },
  actions: {
    alignItems: 'center',
    flexDirection: 'row',
  },
  action: {
    alignItems: 'center',
    justifyContent: 'center',
  },
});

export default TopAppBar;
