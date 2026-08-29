import React from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { useLayoutMetrics, useTogtTheme } from '../../../design';
import { useRouteEntryFocus } from '../../../navigation/useRouteEntryFocus';
import {
  AppScaffold,
  Button,
  Chip,
  EmptyState,
  OfflineBanner,
  ScreenError,
  Surface,
  TopAppBar,
} from '../../../ui';
import { JobSummaryCard, OfferCard } from './components';
import type {
  ConnectionState,
  JobsInboxSegment,
  JobsInboxSnapshot,
  ResourceState,
  WorkerJobSummary,
  WorkerOffer,
} from './model';
import { formatTimeEnZa, translateWorkerShell } from './copy';
import type { WorkerShellCopyKey, WorkerShellTranslator } from './copy';

export type JobsInboxScreenProps = Readonly<{
  snapshot: JobsInboxSnapshot;
  selectedSegment: JobsInboxSegment;
  connection: ConnectionState;
  serverNow: string;
  onSelectSegment: (segment: JobsInboxSegment) => void;
  onOpenOffer: (offerId: string) => void;
  onOpenJob: (jobId: string) => void;
  onOpenQuoteRequests: () => void;
  onRetry: (segment: JobsInboxSegment) => void;
  translate?: WorkerShellTranslator;
}>;

const SEGMENTS: readonly JobsInboxSegment[] = ['offers', 'upcoming', 'active', 'history'];

const SEGMENT_COPY: Readonly<Record<JobsInboxSegment, WorkerShellCopyKey>> = Object.freeze({
  offers: 'jobs.offers',
  upcoming: 'jobs.upcoming',
  active: 'jobs.active',
  history: 'jobs.history',
});

const EMPTY_COPY: Readonly<Record<JobsInboxSegment, readonly [WorkerShellCopyKey, WorkerShellCopyKey]>> = Object.freeze({
  offers: ['jobs.emptyOffers', 'jobs.emptyOffersBody'],
  upcoming: ['jobs.emptyUpcoming', 'jobs.emptyUpcomingBody'],
  active: ['jobs.emptyActive', 'jobs.emptyActiveBody'],
  history: ['jobs.emptyHistory', 'jobs.emptyHistoryBody'],
});

export function JobsInboxScreen({
  snapshot,
  selectedSegment,
  connection,
  serverNow,
  onSelectSegment,
  onOpenOffer,
  onOpenJob,
  onOpenQuoteRequests,
  onRetry,
  translate = translateWorkerShell,
}: JobsInboxScreenProps) {
  const theme = useTogtTheme();
  const layout = useLayoutMetrics();
  const routeTitle = translate('jobs.title');
  const routeTitleRef = useRouteEntryFocus<Text>({ fallbackAnnouncement: routeTitle });
  const selectedState = snapshot[selectedSegment];

  return (
    <AppScaffold
      contentContainerStyle={{ paddingBottom: theme.spacing.xxxxl }}
      scrollable
      testID="worker-jobs-inbox-screen"
      topBar={<TopAppBar title={routeTitle} titleRef={routeTitleRef} />}
    >
      <View style={[styles.stack, { rowGap: theme.spacing.lg }]}>
        {connection === 'offline' ? (
          <OfflineBanner
            message={translate('common.offline')}
            onRetry={() => onRetry(selectedSegment)}
            {...(snapshot.lastUpdatedAt ? { lastUpdatedLabel: formatTimeEnZa(snapshot.lastUpdatedAt) } : {})}
          />
        ) : null}

        <View
          accessibilityRole="tablist"
          style={[
            styles.segmentControl,
            {
              flexDirection: layout.size === 'compact' ? 'column' : 'row',
              gap: theme.spacing.xs,
            },
          ]}
        >
          {SEGMENTS.map((segment) => (
            <Chip
              accessibilityHint={translate(SEGMENT_COPY[segment])}
              accessibilityRole="tab"
              key={segment}
              label={translate(SEGMENT_COPY[segment])}
              onPress={() => onSelectSegment(segment)}
              selected={selectedSegment === segment}
              style={layout.size === 'compact' ? styles.segmentCompact : styles.segmentWrapped}
              testID={`worker-jobs-tab-${segment}`}
              tone="brand"
            />
          ))}
        </View>

        <Surface variant="positive">
          <View style={[styles.quoteEntry, { columnGap: theme.spacing.md, rowGap: theme.spacing.sm }]}>
            <View style={styles.quoteEntryCopy}>
              <Text allowFontScaling style={[theme.typography.h3, { color: theme.colors.text }]}>Quote requests</Text>
              <Text allowFontScaling style={[theme.typography.bodySmall, { color: theme.colors.textSecondary, marginTop: theme.spacing.xxs }]}>
                Review eligible structured requests and build a private, versioned quote.
              </Text>
            </View>
            <Button label="View requests" onPress={onOpenQuoteRequests} variant="secondary" />
          </View>
        </Surface>

        <SegmentContent
          connection={connection}
          onOpenJob={onOpenJob}
          onOpenOffer={onOpenOffer}
          onRetry={() => onRetry(selectedSegment)}
          segment={selectedSegment}
          serverNow={serverNow}
          state={selectedState}
          translate={translate}
        />

        {snapshot.lastUpdatedAt ? (
          <Text allowFontScaling style={[theme.typography.caption, styles.timestamp, { color: theme.colors.textSecondary }]}>
            {translate('common.lastUpdated', { time: formatTimeEnZa(snapshot.lastUpdatedAt) })}
          </Text>
        ) : null}
      </View>
    </AppScaffold>
  );
}

type SegmentContentProps = Readonly<{
  segment: JobsInboxSegment;
  state: ResourceState<readonly WorkerOffer[]> | ResourceState<readonly WorkerJobSummary[]>;
  connection: ConnectionState;
  serverNow: string;
  onOpenOffer: (offerId: string) => void;
  onOpenJob: (jobId: string) => void;
  onRetry: () => void;
  translate: WorkerShellTranslator;
}>;

function SegmentContent({
  segment,
  state,
  connection,
  serverNow,
  onOpenOffer,
  onOpenJob,
  onRetry,
  translate,
}: SegmentContentProps) {
  const theme = useTogtTheme();
  if (state.status === 'loading') {
    return (
      <View accessibilityRole="progressbar" style={[styles.feedback, { paddingVertical: theme.spacing.xxxl }]}>
        <ActivityIndicator color={theme.colors.actionPrimary} size="large" />
        <Text allowFontScaling style={[theme.typography.body, { color: theme.colors.textSecondary, marginTop: theme.spacing.md }]}>
          {translate('common.loading')}
        </Text>
      </View>
    );
  }

  if (state.status === 'error') {
    return (
      <ScreenError
        actionLabel={translate('common.retry')}
        body={state.message || translate('jobs.loadErrorBody')}
        onAction={onRetry}
        title={state.title || translate('jobs.loadErrorTitle')}
        {...(state.correlationId ? { correlationId: state.correlationId } : {})}
      />
    );
  }

  if (state.status === 'empty' || state.value.length === 0) {
    const emptyCopy = EMPTY_COPY[segment];
    return (
      <EmptyState
        body={state.status === 'empty' ? state.message : translate(emptyCopy[1])}
        title={state.status === 'empty' ? state.title : translate(emptyCopy[0])}
      />
    );
  }

  if (segment === 'offers') {
    const offers = state.value as readonly WorkerOffer[];
    return (
      <View style={[styles.stack, { rowGap: theme.spacing.sm }]}>
        {offers.map((offer) => (
          <OfferCard
            connection={connection}
            key={offer.offerId}
            offer={offer}
            onOpen={onOpenOffer}
            serverNow={serverNow}
            testID={`worker-offer-card-${offer.offerId}`}
            translate={translate}
          />
        ))}
      </View>
    );
  }

  const jobs = state.value as readonly WorkerJobSummary[];
  return (
    <View style={[styles.stack, { rowGap: theme.spacing.sm }]}>
      {jobs.map((job) => (
        <JobSummaryCard
          job={job}
          key={job.jobId}
          onPress={onOpenJob}
          testID={`worker-job-card-${job.jobId}`}
          translate={translate}
        />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  stack: {},
  feedback: { alignItems: 'center', justifyContent: 'center' },
  timestamp: { textAlign: 'center' },
  quoteEntry: { alignItems: 'center', flexDirection: 'row', flexWrap: 'wrap' },
  quoteEntryCopy: { flexBasis: 220, flexGrow: 1 },
  segmentControl: { flexWrap: 'wrap', width: '100%' },
  segmentCompact: { alignSelf: 'stretch', width: '100%' },
  segmentWrapped: { alignSelf: 'stretch', flexBasis: '46%', flexGrow: 1 },
});

export default JobsInboxScreen;
