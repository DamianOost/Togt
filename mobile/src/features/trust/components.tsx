import React from 'react';
import type { ReactNode } from 'react';
import { ActivityIndicator, StyleSheet, Switch, Text, View } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useTogtTheme } from '../../design';
import {
  EmptyState,
  OfflineBanner,
  ScreenError,
  StatusPill,
  Surface,
} from '../../ui';
import type { IncidentDto, IncidentState } from '../../services/groundedTrust';
import type { ConnectionState, TrustResourceState } from './model';
import { incidentCategoryLabel, incidentStateLabel, incidentTimeline } from './model';

export type TrustResourceProps<T> = Readonly<{
  resource: TrustResourceState<T>;
  connectionState: ConnectionState;
  loadingLabel: string;
  onRetry: () => void;
  children: (value: T) => ReactNode;
}>;

export function TrustResource<T>({
  resource,
  connectionState,
  loadingLabel,
  onRetry,
  children,
}: TrustResourceProps<T>) {
  const theme = useTogtTheme();
  if (resource.status === 'loading') {
    return (
      <View accessibilityLabel={loadingLabel} accessibilityRole="progressbar" style={styles.centredState}>
        <ActivityIndicator color={theme.colors.actionPrimary} size="large" />
        <Text allowFontScaling style={[theme.typography.body, { color: theme.colors.textSecondary, marginTop: theme.spacing.md }]}>
          {loadingLabel}
        </Text>
      </View>
    );
  }
  if (resource.status === 'error') {
    return (
      <ScreenError
        actionLabel="Try again"
        body={resource.message}
        {...(resource.correlationId ? { correlationId: resource.correlationId } : {})}
        onAction={onRetry}
        title={resource.title}
      />
    );
  }
  if (resource.status === 'empty') {
    return <EmptyState body={resource.message} title={resource.title} />;
  }
  return (
    <>
      {connectionState === 'offline' ? (
        <OfflineBanner
          {...(resource.lastUpdatedAt ? { lastUpdatedLabel: resource.lastUpdatedAt } : {})}
          message="Records remain visible, but changes are unavailable until you reconnect."
          onRetry={onRetry}
        />
      ) : null}
      {children(resource.value)}
    </>
  );
}

export function TrustHero({
  eyebrow,
  title,
  body,
  icon,
  tone = 'brand',
}: Readonly<{
  eyebrow: string;
  title: string;
  body: string;
  icon: React.ComponentProps<typeof MaterialCommunityIcons>['name'];
  tone?: 'brand' | 'danger';
}>) {
  const theme = useTogtTheme();
  const danger = tone === 'danger';
  return (
    <Surface elevation="card" style={{ gap: theme.spacing.md }} variant={danger ? 'danger' : 'inverse'}>
      <View style={[styles.heroIcon, {
        backgroundColor: danger ? theme.colors.surface : theme.colors.actionPrimary,
        borderRadius: theme.radius.hero,
        height: theme.sizing.stateGlyph,
        width: theme.sizing.stateGlyph,
      }]}>
        <MaterialCommunityIcons
          color={danger ? theme.colors.emergency : theme.colors.textInverse}
          name={icon}
          size={theme.sizing.iconLarge}
        />
      </View>
      <View style={{ gap: theme.spacing.xxs }}>
        <Text allowFontScaling style={[theme.typography.label, {
          color: danger ? theme.colors.error : theme.colors.actionPrimary,
          textTransform: 'uppercase',
        }]}>
          {eyebrow}
        </Text>
        <Text accessibilityRole="header" allowFontScaling style={[theme.typography.h1, {
          color: danger ? theme.colors.text : theme.colors.textInverse,
        }]}>
          {title}
        </Text>
        <Text allowFontScaling style={[theme.typography.body, {
          color: danger ? theme.colors.textSecondary : theme.colors.translucentSurface,
        }]}>
          {body}
        </Text>
      </View>
    </Surface>
  );
}

export function TrustDefinitionRow({
  icon,
  label,
  value,
  tone = 'default',
}: Readonly<{
  icon: React.ComponentProps<typeof MaterialCommunityIcons>['name'];
  label: string;
  value: string;
  tone?: 'default' | 'positive' | 'attention' | 'danger';
}>) {
  const theme = useTogtTheme();
  const colour = tone === 'danger'
    ? theme.colors.error
    : tone === 'attention'
      ? theme.colors.attention
      : tone === 'positive'
        ? theme.colors.success
        : theme.colors.actionPrimary;
  return (
    <View accessible accessibilityLabel={`${label}: ${value}`} style={[styles.row, { gap: theme.spacing.sm, paddingVertical: theme.spacing.xs }]}>
      <MaterialCommunityIcons color={colour} name={icon} size={theme.sizing.iconMedium} />
      <View style={styles.flex}>
        <Text allowFontScaling style={[theme.typography.caption, { color: theme.colors.textSecondary }]}>{label}</Text>
        <Text allowFontScaling selectable style={[theme.typography.body, { color: theme.colors.text }]}>{value}</Text>
      </View>
    </View>
  );
}

export function TruthNotice({
  title,
  body,
  tone = 'attention',
  icon = 'shield-check-outline',
}: Readonly<{
  title: string;
  body: string;
  tone?: 'subtle' | 'positive' | 'attention' | 'danger';
  icon?: React.ComponentProps<typeof MaterialCommunityIcons>['name'];
}>) {
  const theme = useTogtTheme();
  const colour = tone === 'danger' ? theme.colors.error : tone === 'positive' ? theme.colors.success : theme.colors.actionPrimary;
  return (
    <Surface accessibilityLabel={`${title}. ${body}`} style={{ gap: theme.spacing.sm }} variant={tone}>
      <View style={[styles.row, { gap: theme.spacing.sm }]}>
        <MaterialCommunityIcons color={colour} name={icon} size={theme.sizing.iconMedium} />
        <View style={styles.flex}>
          <Text accessibilityRole="header" allowFontScaling style={[theme.typography.h3, { color: theme.colors.text }]}>{title}</Text>
          <Text allowFontScaling style={[theme.typography.bodySmall, { color: theme.colors.textSecondary, marginTop: theme.spacing.xxs }]}>{body}</Text>
        </View>
      </View>
    </Surface>
  );
}

function incidentTone(state: IncidentState): 'pending' | 'inProgress' | 'complete' | 'error' {
  if (state === 'resolved') return 'complete';
  if (state === 'failed') return 'error';
  if (state === 'received') return 'pending';
  return 'inProgress';
}

export function IncidentRecordCard({ incident, onOpen }: Readonly<{
  incident: IncidentDto;
  onOpen: (incident: IncidentDto) => void;
}>) {
  const theme = useTogtTheme();
  return (
    <Surface
      accessibilityHint="Opens the record details."
      accessibilityLabel={`${incident.kind} record, ${incidentCategoryLabel(incident.category)}, ${incidentStateLabel(incident.state)}`}
      elevation="card"
      onPress={() => onOpen(incident)}
      style={{ gap: theme.spacing.sm }}
      testID={`trust-record-${incident.id}`}
    >
      <View style={[styles.splitRow, { gap: theme.spacing.sm }]}>
        <View style={styles.flex}>
          <Text accessibilityRole="header" allowFontScaling style={[theme.typography.h3, { color: theme.colors.text }]}>
            {incidentCategoryLabel(incident.category)}
          </Text>
          <Text allowFontScaling style={[theme.typography.caption, { color: theme.colors.textSecondary }]}>
            Recorded {incident.createdAt}
          </Text>
        </View>
        <StatusPill label={incidentStateLabel(incident.state)} tone={incidentTone(incident.state)} />
      </View>
      <Text allowFontScaling style={[theme.typography.bodySmall, { color: theme.colors.textSecondary }]}>
        Record-only intake · Revision {incident.revision}
      </Text>
    </Surface>
  );
}

export function IncidentTimeline({ incident }: Readonly<{ incident: IncidentDto }>) {
  const theme = useTogtTheme();
  const items = incidentTimeline(incident);
  return (
    <View accessibilityRole="list" style={{ gap: theme.spacing.sm }}>
      {items.map((item) => (
        <View accessibilityLabel={`${item.label}, ${item.status}`} accessibilityRole="summary" key={item.state} style={[styles.row, { gap: theme.spacing.sm }]}>
          <MaterialCommunityIcons
            color={item.status === 'issue'
              ? theme.colors.error
              : item.status === 'current'
                ? theme.colors.actionPrimary
                : theme.colors.textSecondary}
            name={item.status === 'complete'
              ? 'check-circle'
              : item.status === 'issue'
                ? 'alert-circle'
                : item.status === 'current'
                  ? 'circle-slice-8'
                  : 'circle-outline'}
            size={theme.sizing.iconSmall}
          />
          <View style={styles.flex}>
            <Text allowFontScaling style={[theme.typography.label, { color: item.status === 'future' ? theme.colors.textSecondary : theme.colors.text }]}>
              {item.label}
            </Text>
            {item.occurredAt ? (
              <Text allowFontScaling style={[theme.typography.caption, { color: theme.colors.textSecondary }]}>{item.occurredAt}</Text>
            ) : null}
          </View>
        </View>
      ))}
    </View>
  );
}

export function TruthList({ statements, icon = 'check-circle-outline' }: Readonly<{
  statements: readonly string[];
  icon?: React.ComponentProps<typeof MaterialCommunityIcons>['name'];
}>) {
  const theme = useTogtTheme();
  return (
    <View style={{ gap: theme.spacing.sm }}>
      {statements.map((statement) => (
        <View key={statement} style={[styles.row, { gap: theme.spacing.sm }]}>
          <MaterialCommunityIcons color={theme.colors.actionPrimary} name={icon} size={theme.sizing.iconSmall} />
          <Text allowFontScaling style={[theme.typography.bodySmall, styles.flex, { color: theme.colors.textSecondary }]}>{statement}</Text>
        </View>
      ))}
    </View>
  );
}

export function SettingToggleRow({
  label,
  description,
  value,
  disabled,
  onChange,
  testID,
}: Readonly<{
  label: string;
  description: string;
  value: boolean;
  disabled: boolean;
  onChange: (value: boolean) => void;
  testID: string;
}>) {
  const theme = useTogtTheme();
  return (
    <View style={[styles.settingRow, { gap: theme.spacing.md, paddingVertical: theme.spacing.sm }]}>
      <View style={styles.flex}>
        <Text allowFontScaling style={[theme.typography.label, { color: theme.colors.text }]}>{label}</Text>
        <Text allowFontScaling style={[theme.typography.bodySmall, { color: theme.colors.textSecondary }]}>{description}</Text>
      </View>
      <Switch
        accessibilityLabel={label}
        accessibilityRole="switch"
        accessibilityState={{ checked: value, disabled }}
        disabled={disabled}
        ios_backgroundColor={theme.colors.border}
        onValueChange={onChange}
        testID={testID}
        thumbColor={theme.colors.surface}
        trackColor={{ false: theme.colors.borderStrong, true: theme.colors.actionPrimary }}
        value={value}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  centredState: { alignItems: 'center', flex: 1, justifyContent: 'center' },
  row: { alignItems: 'flex-start', flexDirection: 'row' },
  splitRow: { alignItems: 'flex-start', flexDirection: 'row' },
  heroIcon: { alignItems: 'center', justifyContent: 'center' },
  settingRow: { alignItems: 'center', flexDirection: 'row' },
});
