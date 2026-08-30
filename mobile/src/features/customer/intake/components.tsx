import React from 'react';
import type { ComponentProps, ReactNode } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { useTogtTheme } from '../../../design';
import { StatusPill, Surface } from '../../../ui';
import type { CapabilityState } from './model';

export type IntakeIconName = ComponentProps<typeof MaterialCommunityIcons>['name'];

export function IntakeIcon({
  name,
  tone = 'primary',
  size,
}: {
  name: IntakeIconName;
  tone?: 'primary' | 'secondary' | 'inverse' | 'attention' | 'danger';
  size?: number;
}) {
  const theme = useTogtTheme();
  const color = {
    primary: theme.colors.actionPrimary,
    secondary: theme.colors.textSecondary,
    inverse: theme.colors.textInverse,
    attention: theme.colors.attention,
    danger: theme.colors.error,
  }[tone];
  return (
    <MaterialCommunityIcons
      color={color}
      importantForAccessibility="no-hide-descendants"
      name={name}
      size={size ?? theme.sizing.iconMedium}
    />
  );
}

export function ScreenHeading({ title, body }: { title: string; body?: string }) {
  const theme = useTogtTheme();
  return (
    <View style={{ rowGap: theme.spacing.xs }}>
      <Text accessibilityRole="header" allowFontScaling style={[theme.typography.h1, { color: theme.colors.text }]}>
        {title}
      </Text>
      {body ? (
        <Text allowFontScaling style={[theme.typography.body, { color: theme.colors.textSecondary }]}>
          {body}
        </Text>
      ) : null}
    </View>
  );
}

export function StepProgress({
  accessibleLabel,
  activeIndex,
  labels,
}: {
  accessibleLabel: string;
  activeIndex: number;
  labels: readonly string[];
}) {
  const theme = useTogtTheme();
  return (
    <View
      accessible
      accessibilityLabel={accessibleLabel}
      accessibilityRole="progressbar"
      style={[styles.progressWrap, { rowGap: theme.spacing.xs }]}
    >
      <View style={[styles.progressTrack, { columnGap: theme.spacing.xxs }]}>
        {labels.map((label, index) => (
          <View key={label} style={styles.progressItem}>
            <View
              style={[
                styles.progressBar,
                {
                  backgroundColor: index <= activeIndex ? theme.colors.actionPrimary : theme.colors.border,
                  borderRadius: theme.radius.pill,
                  height: theme.border.strong * 2,
                },
              ]}
            />
          </View>
        ))}
      </View>
      <Text allowFontScaling style={[theme.typography.caption, { color: theme.colors.textSecondary }]}>
        {accessibleLabel}
      </Text>
    </View>
  );
}

export function CapabilityNotice({
  capability,
  title,
}: {
  capability: CapabilityState;
  title: string;
}) {
  const theme = useTogtTheme();
  if (capability.status === 'available') return null;
  return (
    <Surface
      accessibilityLabel={`${title}. ${capability.explanation}`}
      style={[styles.notice, { columnGap: theme.spacing.sm, padding: theme.spacing.sm }]}
      variant={capability.status === 'unknown' ? 'attention' : 'subtle'}
    >
      <IntakeIcon name="information-outline" tone={capability.status === 'unknown' ? 'attention' : 'secondary'} />
      <View style={styles.flex}>
        <Text allowFontScaling style={[theme.typography.label, { color: theme.colors.text }]}>
          {title}
        </Text>
        <Text allowFontScaling style={[theme.typography.bodySmall, { color: theme.colors.textSecondary }]}>
          {capability.explanation}
        </Text>
      </View>
    </Surface>
  );
}

export function OptionCard({
  title,
  body,
  icon,
  selected = false,
  disabled = false,
  badge,
  onPress,
  testID,
}: {
  title: string;
  body?: string;
  icon: IntakeIconName;
  selected?: boolean;
  disabled?: boolean;
  badge?: string;
  onPress: () => void;
  testID?: string;
}) {
  const theme = useTogtTheme();
  return (
    <Surface
      {...(body ? { accessibilityHint: body } : {})}
      accessibilityLabel={title}
      disabled={disabled}
      onPress={onPress}
      selected={selected}
      style={[styles.option, { minHeight: theme.sizing.controlHeightLarge + theme.spacing.xl }]}
      {...(testID ? { testID } : {})}
    >
      <View style={[styles.optionRow, { columnGap: theme.spacing.sm }]}>
        <View
          style={[
            styles.iconWell,
            {
              backgroundColor: selected ? theme.colors.actionPrimary : theme.colors.surfacePositive,
              borderRadius: theme.radius.input,
              minHeight: theme.sizing.touchTarget,
              minWidth: theme.sizing.touchTarget,
            },
          ]}
        >
          <IntakeIcon name={icon} tone={selected ? 'inverse' : 'primary'} />
        </View>
        <View style={styles.flex}>
          <View style={styles.optionTitleRow}>
            <Text allowFontScaling style={[theme.typography.h3, styles.flex, { color: theme.colors.text }]}>
              {title}
            </Text>
            {badge ? <StatusPill label={badge} tone="pending" /> : null}
          </View>
          {body ? (
            <Text
              allowFontScaling
              style={[theme.typography.bodySmall, { color: theme.colors.textSecondary, marginTop: theme.spacing.xxs }]}
            >
              {body}
            </Text>
          ) : null}
        </View>
        {selected ? <IntakeIcon name="check-circle" /> : <IntakeIcon name="chevron-right" tone="secondary" />}
      </View>
    </Surface>
  );
}

export function SummaryRow({
  label,
  value,
  icon,
  action,
}: {
  label: string;
  value: string;
  icon: IntakeIconName;
  action?: ReactNode;
}) {
  const theme = useTogtTheme();
  return (
    <View style={[styles.summaryRow, { columnGap: theme.spacing.sm, paddingVertical: theme.spacing.xs }]}>
      <IntakeIcon name={icon} tone="secondary" />
      <View style={styles.flex}>
        <Text allowFontScaling style={[theme.typography.caption, { color: theme.colors.textSecondary }]}>
          {label}
        </Text>
        <Text allowFontScaling style={[theme.typography.body, { color: theme.colors.text }]}>
          {value}
        </Text>
      </View>
      {action}
    </View>
  );
}

export function MoneyRow({
  label,
  value,
  emphasised = false,
}: {
  label: string;
  value: string;
  emphasised?: boolean;
}) {
  const theme = useTogtTheme();
  return (
    <View style={[styles.moneyRow, { columnGap: theme.spacing.md, paddingVertical: theme.spacing.xs }]}>
      <Text
        allowFontScaling
        style={[emphasised ? theme.typography.h3 : theme.typography.body, styles.flex, { color: theme.colors.text }]}
      >
        {label}
      </Text>
      <Text
        allowFontScaling
        style={[emphasised ? theme.typography.h3 : theme.typography.numeric, styles.moneyValue, { color: emphasised ? theme.colors.actionPrimaryPressed : theme.colors.text }]}
      >
        {value}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  progressWrap: {},
  progressTrack: { flexDirection: 'row' },
  progressItem: { flex: 1 },
  progressBar: { width: '100%' },
  notice: { alignItems: 'flex-start', flexDirection: 'row' },
  option: { justifyContent: 'center' },
  optionRow: { alignItems: 'center', flexDirection: 'row' },
  iconWell: { alignItems: 'center', justifyContent: 'center' },
  optionTitleRow: { alignItems: 'center', flexDirection: 'row', flexWrap: 'wrap' },
  summaryRow: { alignItems: 'center', flexDirection: 'row' },
  moneyRow: { alignItems: 'baseline', flexDirection: 'row' },
  moneyValue: { flexShrink: 1, textAlign: 'right' },
});
