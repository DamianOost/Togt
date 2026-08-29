import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useTogtTheme } from '../design';
import { TertiaryButton } from './Button';

export type SectionHeaderProps = {
  title: string;
  subtitle?: string;
  actionLabel?: string;
  actionAccessibilityHint?: string;
  onAction?: () => void;
  testID?: string;
};

export function SectionHeader({
  title,
  subtitle,
  actionLabel,
  actionAccessibilityHint,
  onAction,
  testID,
}: SectionHeaderProps) {
  const theme = useTogtTheme();

  return (
    <View style={styles.row} testID={testID}>
      <View style={[styles.copy, { paddingVertical: theme.spacing.xs }]}>
        <Text accessibilityRole="header" allowFontScaling style={[theme.typography.h3, { color: theme.colors.text }]}>
          {title}
        </Text>
        {subtitle ? (
          <Text
            allowFontScaling
            style={[theme.typography.bodySmall, { color: theme.colors.textSecondary, marginTop: theme.spacing.xxs }]}
          >
            {subtitle}
          </Text>
        ) : null}
      </View>
      {actionLabel && onAction ? (
        <TertiaryButton
          accessibilityHint={actionAccessibilityHint}
          label={actionLabel}
          onPress={onAction}
          style={{ marginLeft: theme.spacing.sm }}
        />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    alignItems: 'center',
    flexDirection: 'row',
  },
  copy: {
    flex: 1,
  },
});

export default SectionHeader;
