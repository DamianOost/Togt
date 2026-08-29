import { MaterialCommunityIcons } from '@expo/vector-icons';
import React from 'react';
import type { ReactNode } from 'react';
import { Image, StyleSheet, Text, View } from 'react-native';
import { useTogtTheme } from '../../../design';
import { Chip, StatusPill, Surface } from '../../../ui';
import type { StatusTone } from '../../../ui';
import {
  deriveOfferActionPresentation,
  hasValidOfferCommercialBreakdown,
  isSupported,
} from './model';
import type {
  ConnectionState,
  Evidence,
  OfferActionPresentation,
  OfferCommercialBreakdown,
  WorkerJobPhase,
  WorkerJobSummary,
  WorkerOffer,
} from './model';
import {
  formatDateTimeEnZa,
  formatDurationEstimate,
  formatTimeEnZa,
  formatTravelEstimate,
  formatZarEnZa,
  translateWorkerShell,
} from './copy';
import type { WorkerShellTranslator } from './copy';

type IconName = React.ComponentProps<typeof MaterialCommunityIcons>['name'];

export type WorkerAvatarProps = Readonly<{
  displayName: string;
  imageUri: string | null;
  size?: number;
  translate?: WorkerShellTranslator;
}>;

export function WorkerAvatar({
  displayName,
  imageUri,
  size = 64,
  translate = translateWorkerShell,
}: WorkerAvatarProps) {
  const theme = useTogtTheme();
  return (
    <View
      accessible
      accessibilityLabel={translate('today.profilePhoto', { name: displayName })}
      accessibilityRole="image"
      style={[
        styles.avatar,
        {
          backgroundColor: theme.colors.surfacePositive,
          borderColor: theme.colors.border,
          borderRadius: theme.radius.pill,
          borderWidth: theme.border.thin,
          height: size,
          width: size,
        },
      ]}
    >
      {imageUri ? (
        <Image
          accessibilityElementsHidden
          importantForAccessibility="no-hide-descendants"
          resizeMode="cover"
          source={{ uri: imageUri }}
          style={{ height: size, width: size }}
        />
      ) : (
        <MaterialCommunityIcons
          color={theme.colors.actionPrimaryPressed}
          importantForAccessibility="no-hide-descendants"
          name="account-hard-hat-outline"
          size={Math.round(size * 0.48)}
        />
      )}
    </View>
  );
}

export type InfoRowProps = Readonly<{
  icon: IconName;
  label: string;
  value: string;
  tone?: 'default' | 'positive' | 'attention';
  trailing?: ReactNode;
  testID?: string;
}>;

export function InfoRow({
  icon,
  label,
  value,
  tone = 'default',
  trailing,
  testID,
}: InfoRowProps) {
  const theme = useTogtTheme();
  const iconColor = tone === 'positive'
    ? theme.colors.actionPrimary
    : tone === 'attention'
      ? theme.colors.attention
      : theme.colors.textSecondary;
  return (
    <View style={[styles.infoRow, { columnGap: theme.spacing.sm }]} testID={testID}>
      <MaterialCommunityIcons
        color={iconColor}
        importantForAccessibility="no-hide-descendants"
        name={icon}
        size={theme.sizing.iconSmall}
      />
      <View style={styles.flex}>
        <Text allowFontScaling style={[theme.typography.caption, { color: theme.colors.textSecondary }]}>
          {label}
        </Text>
        <Text allowFontScaling style={[theme.typography.bodySmall, { color: theme.colors.text }]}>
          {value}
        </Text>
      </View>
      {trailing}
    </View>
  );
}

export function EvidenceNotice<T>({
  evidence,
  label,
  renderSupported,
}: Readonly<{
  evidence: Evidence<T, 'server'>;
  label: string;
  renderSupported: (value: T) => ReactNode;
}>) {
  const theme = useTogtTheme();
  if (isSupported(evidence)) return <>{renderSupported(evidence.value)}</>;
  return (
    <View accessibilityRole="summary" style={[styles.notice, { columnGap: theme.spacing.xs }]}>
      <MaterialCommunityIcons
        color={theme.colors.textSecondary}
        importantForAccessibility="no-hide-descendants"
        name="information-outline"
        size={theme.sizing.iconSmall}
      />
      <Text allowFontScaling style={[theme.typography.bodySmall, styles.flex, { color: theme.colors.textSecondary }]}>
        {label}: {evidence.explanation}
      </Text>
    </View>
  );
}

function phaseCopyKey(phase: WorkerJobPhase) {
  return ({
    scheduled: 'job.phase.scheduled',
    accepted: 'job.phase.accepted',
    en_route: 'job.phase.enRoute',
    arrived: 'job.phase.arrived',
    scope_confirmation: 'job.phase.scopeConfirmation',
    active: 'job.phase.active',
    completion_review: 'job.phase.completionReview',
    payment_pending: 'job.phase.paymentPending',
    closed: 'job.phase.closed',
    cancelled: 'job.phase.cancelled',
  } as const)[phase];
}

function phaseTone(phase: WorkerJobPhase): StatusTone {
  if (phase === 'active' || phase === 'en_route' || phase === 'arrived') return 'inProgress';
  if (phase === 'closed') return 'complete';
  if (phase === 'cancelled') return 'offline';
  return 'pending';
}

export type JobSummaryCardProps = Readonly<{
  job: WorkerJobSummary;
  onPress: (jobId: string) => void;
  translate?: WorkerShellTranslator;
  testID?: string;
}>;

export function JobSummaryCard({
  job,
  onPress,
  translate = translateWorkerShell,
  testID,
}: JobSummaryCardProps) {
  const theme = useTogtTheme();
  const service = isSupported(job.serviceLabel) ? job.serviceLabel.value : translate('common.notAvailable');
  const area = isSupported(job.broadArea) ? job.broadArea.value : translate('common.notAvailable');
  const customer = isSupported(job.customerDisplayName)
    ? job.customerDisplayName.value
    : translate('common.notAvailable');
  return (
    <Surface
      accessibilityHint={translate('common.viewDetails')}
      accessibilityLabel={`${service}. ${area}`}
      elevation="card"
      onPress={() => onPress(job.jobId)}
      style={{ padding: theme.spacing.lg }}
      testID={testID}
    >
      <View style={[styles.between, { columnGap: theme.spacing.sm }]}>
        <View style={styles.flex}>
          <Text allowFontScaling style={[theme.typography.h3, { color: theme.colors.text }]}>
            {service}
          </Text>
          <Text allowFontScaling style={[theme.typography.bodySmall, { color: theme.colors.textSecondary }]}>
            {customer}
          </Text>
        </View>
        {isSupported(job.phase) ? (
          <StatusPill
            label={translate(phaseCopyKey(job.phase.value))}
            tone={phaseTone(job.phase.value)}
          />
        ) : null}
      </View>
      <View style={[styles.stack, { marginTop: theme.spacing.md, rowGap: theme.spacing.sm }]}>
        <InfoRow icon="map-marker-radius-outline" label={translate('jobs.approximateArea')} value={area} />
        {isSupported(job.schedule) ? (
          <InfoRow
            icon="calendar-clock-outline"
            label={translate('jobs.schedule')}
            value={job.schedule.value.startsAt ? formatDateTimeEnZa(job.schedule.value.startsAt) : translate('common.notAvailable')}
          />
        ) : null}
        {isSupported(job.travel) ? (
          <InfoRow icon="navigation-variant-outline" label={translate('jobs.travel')} value={formatTravelEstimate(job.travel.value)} />
        ) : null}
        {isSupported(job.expectedNet) ? (
          <InfoRow icon="cash-check" label={translate('jobs.expectedNet')} tone="positive" value={formatZarEnZa(job.expectedNet.value)} />
        ) : null}
      </View>
    </Surface>
  );
}

function offerStatusLabel(
  presentation: OfferActionPresentation,
  translate: WorkerShellTranslator,
): string {
  if (presentation.statusCode === 'open') {
    if (presentation.expiryKind === 'instant_window') {
      return presentation.remainingMinutes === 0
        ? translate('jobs.expiresSoon')
        : translate('jobs.expiresIn', { minutes: presentation.remainingMinutes ?? 0 });
    }
    return presentation.deadlineAt
      ? translate('jobs.respondBy', { time: formatDateTimeEnZa(presentation.deadlineAt) })
      : translate('jobs.expiryUnknown');
  }
  return ({
    offline: translate('jobs.offlineAction'),
    status_unknown: translate('jobs.statusUnknown'),
    stale_cache: translate('jobs.staleOffer'),
    expiry_unknown: translate('jobs.expiryUnknown'),
    window_elapsed_refresh: translate('jobs.windowElapsed'),
    acceptance_blocked: translate('jobs.acceptanceBlocked'),
    accepted: translate('jobs.accepted'),
    declined: translate('jobs.declined'),
    expired: translate('jobs.expired'),
    taken: translate('jobs.taken'),
    withdrawn: translate('jobs.withdrawn'),
  } as const)[presentation.statusCode];
}

export type OfferCardProps = Readonly<{
  offer: WorkerOffer;
  connection: ConnectionState;
  serverNow: string;
  onOpen: (offerId: string) => void;
  translate?: WorkerShellTranslator;
  testID?: string;
}>;

export function OfferCard({
  offer,
  connection,
  serverNow,
  onOpen,
  translate = translateWorkerShell,
  testID,
}: OfferCardProps) {
  const theme = useTogtTheme();
  const presentation = deriveOfferActionPresentation(offer, { serverNow, connection });
  const service = isSupported(offer.serviceLabel) ? offer.serviceLabel.value : translate('common.notAvailable');
  const area = isSupported(offer.broadArea) ? offer.broadArea.value : translate('common.notAvailable');
  const timeLabel = offerStatusLabel(presentation, translate);
  const tone: StatusTone = presentation.statusCode === 'open'
    ? 'pending'
    : presentation.statusCode === 'accepted' ? 'complete' : 'offline';
  return (
    <Surface
      accessibilityHint={translate('jobs.openOffer')}
      accessibilityLabel={`${offer.kind === 'instant' ? translate('jobs.instantOffer') : translate('jobs.scheduledRequest')}. ${service}. ${area}. ${timeLabel}`}
      elevation="card"
      onPress={() => onOpen(offer.offerId)}
      style={{ padding: theme.spacing.lg }}
      testID={testID}
    >
      <View style={[styles.between, { columnGap: theme.spacing.sm }]}>
        <View style={styles.flex}>
          <Text allowFontScaling style={[theme.typography.caption, { color: theme.colors.actionPrimaryPressed }]}>
            {offer.kind === 'instant' ? translate('jobs.instantOffer') : translate('jobs.scheduledRequest')}
          </Text>
          <Text allowFontScaling style={[theme.typography.h3, { color: theme.colors.text, marginTop: theme.spacing.xxs }]}>
            {service}
          </Text>
        </View>
        <StatusPill label={timeLabel} tone={tone} />
      </View>
      <View style={[styles.stack, { marginTop: theme.spacing.md, rowGap: theme.spacing.sm }]}>
        <InfoRow icon="map-marker-radius-outline" label={translate('jobs.approximateArea')} value={area} />
        {isSupported(offer.schedule) ? (
          <InfoRow
            icon="calendar-clock-outline"
            label={translate('jobs.schedule')}
            value={offer.schedule.value.startsAt ? formatDateTimeEnZa(offer.schedule.value.startsAt) : translate('common.notAvailable')}
          />
        ) : null}
        {isSupported(offer.travel) ? (
          <InfoRow icon="navigation-variant-outline" label={translate('jobs.travel')} value={formatTravelEstimate(offer.travel.value)} />
        ) : null}
        {isSupported(offer.expectedDuration) ? (
          <InfoRow icon="timer-sand" label={translate('jobs.duration')} value={formatDurationEstimate(offer.expectedDuration.value)} />
        ) : null}
        {isSupported(offer.commercial) && hasValidOfferCommercialBreakdown(offer.commercial.value) ? (
          <InfoRow
            icon="cash-multiple"
            label={translate('jobs.expectedNet')}
            tone="positive"
            value={formatZarEnZa({ currency: 'ZAR', amountMinor: offer.commercial.value.expectedNetMinor })}
          />
        ) : null}
      </View>
    </Surface>
  );
}

export function CommercialBreakdown({
  commercial,
  translate = translateWorkerShell,
}: Readonly<{
  commercial: Evidence<OfferCommercialBreakdown, 'server_ledger'>;
  translate?: WorkerShellTranslator;
}>) {
  const theme = useTogtTheme();
  if (!isSupported(commercial) || !hasValidOfferCommercialBreakdown(commercial.value)) {
    return (
      <Surface variant="subtle">
        <Text allowFontScaling style={[theme.typography.bodySmall, { color: theme.colors.textSecondary }]}>
          {commercial.status === 'supported' ? translate('common.notAvailable') : commercial.explanation}
        </Text>
      </Surface>
    );
  }
  const breakdown = commercial.value;
  const amount = (amountMinor: number) => formatZarEnZa({ currency: 'ZAR', amountMinor });
  return (
    <Surface elevation="flat" style={{ padding: theme.spacing.lg }}>
      <Text accessibilityRole="header" allowFontScaling style={[theme.typography.h3, { color: theme.colors.text }]}>
        {translate('jobs.commercial')}
      </Text>
      <View style={[styles.stack, { marginTop: theme.spacing.md, rowGap: theme.spacing.sm }]}>
        <MoneyRow label={translate('jobs.gross')} value={amount(breakdown.grossMinor)} />
        <MoneyRow label={translate('jobs.platformFee')} value={`−${amount(breakdown.platformFeeMinor)}`} />
        <View style={{ backgroundColor: theme.colors.border, height: theme.border.thin }} />
        <MoneyRow emphasized label={translate('jobs.expectedNet')} value={amount(breakdown.expectedNetMinor)} />
      </View>
    </Surface>
  );
}

export function MoneyRow({
  label,
  value,
  emphasized = false,
}: Readonly<{ label: string; value: string; emphasized?: boolean }>) {
  const theme = useTogtTheme();
  return (
    <View style={[styles.between, { columnGap: theme.spacing.md }]}>
      <Text
        allowFontScaling
        style={[emphasized ? theme.typography.label : theme.typography.bodySmall, styles.flex, { color: theme.colors.text }]}
      >
        {label}
      </Text>
      <Text
        allowFontScaling
        style={[theme.typography.numeric, { color: emphasized ? theme.colors.actionPrimaryPressed : theme.colors.text }]}
      >
        {value}
      </Text>
    </View>
  );
}

export function TrustEvidenceList({
  trust,
  translate = translateWorkerShell,
}: Readonly<{
  trust: WorkerOffer['customerTrust'];
  translate?: WorkerShellTranslator;
}>) {
  const theme = useTogtTheme();
  if (!isSupported(trust) || trust.value.length === 0) {
    return (
      <Text allowFontScaling style={[theme.typography.bodySmall, { color: theme.colors.textSecondary }]}>
        {isSupported(trust) ? translate('common.notAvailable') : trust.explanation}
      </Text>
    );
  }
  return (
    <View style={[styles.wrap, { gap: theme.spacing.xs }]}>
      {trust.value.map((item) => (
        <Chip key={`${item.kind}:${item.label}`} label={item.label} tone="brand" />
      ))}
    </View>
  );
}

export function OfferRemainingSummary({
  presentation,
  translate = translateWorkerShell,
}: Readonly<{
  presentation: OfferActionPresentation;
  translate?: WorkerShellTranslator;
}>) {
  const theme = useTogtTheme();
  const label = offerStatusLabel(presentation, translate);
  return (
    <View
      accessible
      accessibilityLabel={`${translate('offer.remainingTime')}. ${label}`}
      style={[styles.remaining, { backgroundColor: theme.colors.surfaceAttention, borderRadius: theme.radius.hero, padding: theme.spacing.lg }]}
    >
      <MaterialCommunityIcons
        color={theme.colors.attention}
        importantForAccessibility="no-hide-descendants"
        name="timer-outline"
        size={theme.sizing.iconLarge}
      />
      <View style={[styles.flex, { marginLeft: theme.spacing.sm }]}>
        <Text allowFontScaling style={[theme.typography.caption, { color: theme.colors.textSecondary }]}>
          {translate('offer.remainingTime')}
        </Text>
        <Text allowFontScaling style={[theme.typography.numeric, theme.typography.h3, { color: theme.colors.text }]}>
          {label}
        </Text>
      </View>
    </View>
  );
}

export function scheduleLabel(offer: WorkerOffer, translate: WorkerShellTranslator): string {
  if (!isSupported(offer.schedule)) return offer.schedule.explanation;
  if (offer.schedule.value.kind === 'now') return translate('jobs.now');
  return offer.schedule.value.startsAt
    ? formatDateTimeEnZa(offer.schedule.value.startsAt)
    : translate('common.notAvailable');
}

export function shortObservedTime(value: string): string {
  return formatTimeEnZa(value);
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  stack: {},
  between: {
    alignItems: 'flex-start',
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
  },
  avatar: {
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  infoRow: {
    alignItems: 'flex-start',
    flexDirection: 'row',
  },
  notice: {
    alignItems: 'flex-start',
    flexDirection: 'row',
  },
  wrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  remaining: {
    alignItems: 'center',
    flexDirection: 'row',
  },
});
