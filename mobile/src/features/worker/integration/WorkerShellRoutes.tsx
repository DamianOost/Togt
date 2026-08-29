import { useNetInfo } from '@react-native-community/netinfo';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import * as Haptics from 'expo-haptics';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Alert } from 'react-native';
import { useSelector } from 'react-redux';
import {
  composeWorkerTodayV1,
  workerJobsSnapshotV1,
} from '../../../data/grounded';
import type {
  WorkerAvailabilityRecord,
  WorkerJobsBundle,
  WorkerOffersBundle,
} from '../../../data/grounded';
import {
  acceptGroundedWorkerShellOffer,
  declineGroundedWorkerShellOffer,
  isGroundedWorkerError,
  isGroundedWorkerShellError,
  loadGroundedWorkerActivation,
  loadGroundedWorkerProfile,
  loadGroundedWorkerShellAvailability,
  loadGroundedWorkerShellEarnings,
  loadGroundedWorkerShellJobs,
  loadGroundedWorkerShellOffer,
  loadGroundedWorkerShellOffers,
  sendGroundedWorkerForegroundLocationHeartbeat,
  setGroundedWorkerShellAvailability,
} from '../../../services';
import { locationService } from '../../../services/locationService';
import { matchSocket } from '../../../services/matchSocket';
import {
  IncomingOfferScreen,
  JobsInboxScreen,
  WorkerEarningsScreen,
  WorkerTodayScreen,
  dayPeriodForHour,
} from '../shell';
import {
  isWorkerForegroundLocationError,
  requestGroundedWorkerOnlineAvailability,
} from './workerForegroundAvailability';
import type {
  EarningsSnapshot,
  InstantOffer,
  JobsInboxSegment,
  JobsInboxSnapshot,
  ResourceState,
  WorkerTodaySnapshot,
} from '../shell';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const EMPTY_SERVER_TIME = '1970-01-01T00:00:00.000Z';
const { createNestedRootIntent } = require('../../../navigation/routeContracts');

type ProblemView = Readonly<{
  title: string;
  message: string;
  correlationId: string | null;
}>;

function connectionState(network: ReturnType<typeof useNetInfo>): 'online' | 'offline' {
  return network.isConnected === true && network.isInternetReachable !== false ? 'online' : 'offline';
}

function problemView(error: unknown, fallbackTitle: string, fallbackMessage: string): ProblemView {
  if (isWorkerForegroundLocationError(error)) {
    return Object.freeze({
      title: error.problem.title,
      message: error.problem.detail,
      correlationId: null,
    });
  }
  if (isGroundedWorkerShellError(error) || isGroundedWorkerError(error)) {
    return Object.freeze({
      title: error.problem.title,
      message: error.problem.detail,
      correlationId: error.problem.correlationId,
    });
  }
  return Object.freeze({ title: fallbackTitle, message: fallbackMessage, correlationId: null });
}

function errorState<T>(problem: ProblemView): ResourceState<T> {
  return Object.freeze({
    status: 'error',
    title: problem.title,
    message: problem.message,
    correlationId: problem.correlationId,
  });
}

function isRetryableProblem(error: unknown): boolean {
  return (isGroundedWorkerShellError(error) || isGroundedWorkerError(error))
    && error.problem.retryable;
}

function withConfirmedAvailability(
  snapshot: WorkerTodaySnapshot,
  availability: WorkerAvailabilityRecord,
): WorkerTodaySnapshot {
  const fastMatchEligibility = availability.availability === 'offline'
    ? Object.freeze({
        status: 'supported' as const,
        source: 'server' as const,
        observedAt: availability.observedAt,
        value: 'ineligible' as const,
      })
    : Object.freeze({
        status: 'unavailable' as const,
        reasonCode: 'fast_match_heartbeat_not_returned',
        explanation: 'Online prerequisites may pass, but no separate waiting-for-offers app heartbeat was returned.',
      });
  return Object.freeze({
    ...snapshot,
    availability: Object.freeze({
      status: 'supported' as const,
      source: 'server' as const,
      observedAt: availability.observedAt,
      value: availability.availability,
    }),
    fastMatchEligibility,
    lastUpdatedAt: Date.parse(availability.observedAt) > Date.parse(snapshot.lastUpdatedAt)
      ? availability.observedAt
      : snapshot.lastUpdatedAt,
  });
}

function useServerClock(): readonly [string, (authoritativeNow: string) => void] {
  const [serverNow, setServerNow] = useState(EMPTY_SERVER_TIME);
  const anchor = useRef<Readonly<{ serverMs: number; deviceMs: number }> | null>(null);
  const confirmServerNow = useCallback((authoritativeNow: string) => {
    const serverMs = Date.parse(authoritativeNow);
    if (!Number.isFinite(serverMs)) return;
    anchor.current = Object.freeze({ serverMs, deviceMs: Date.now() });
    setServerNow(new Date(serverMs).toISOString());
  }, []);
  useEffect(() => {
    const timer = setInterval(() => {
      if (!anchor.current) return;
      const elapsed = Math.max(0, Date.now() - anchor.current.deviceMs);
      setServerNow(new Date(anchor.current.serverMs + elapsed).toISOString());
    }, 1_000);
    return () => clearInterval(timer);
  }, []);
  return [serverNow, confirmServerNow] as const;
}

export function WorkerTodayRoute({ navigation }: { navigation: any }) {
  const network = useNetInfo();
  const connection = connectionState(network);
  const [state, setState] = useState<ResourceState<WorkerTodaySnapshot>>({ status: 'loading' });
  const [availabilityChangePending, setAvailabilityChangePending] = useState(false);

  const refresh = useCallback(async () => {
    if (connection === 'offline') {
      setState((current) => current.status === 'ready'
        ? current
        : errorState({
            title: 'Today is unavailable offline',
            message: 'Reconnect to load server-confirmed availability and Jobs. Nothing was changed.',
            correlationId: null,
          }));
      return;
    }
    setState((current) => current.status === 'ready' ? current : { status: 'loading' });
    const [activation, profile, availability, jobs, offers, earnings] = await Promise.allSettled([
      loadGroundedWorkerActivation(),
      loadGroundedWorkerProfile(),
      loadGroundedWorkerShellAvailability(),
      loadGroundedWorkerShellJobs(),
      loadGroundedWorkerShellOffers(),
      loadGroundedWorkerShellEarnings(),
    ]);
    const criticalFailure = [activation, profile, availability].find((result) => result.status === 'rejected');
    if (criticalFailure?.status === 'rejected') {
      const failedState = errorState<WorkerTodaySnapshot>(problemView(
        criticalFailure.reason,
        'Today could not refresh',
        'Server-confirmed Worker availability could not be verified. Nothing was changed.',
      ));
      setState((current) => current.status === 'ready' && isRetryableProblem(criticalFailure.reason)
        ? current
        : failedState);
      return;
    }
    if (activation.status !== 'fulfilled' || profile.status !== 'fulfilled' || availability.status !== 'fulfilled') return;
    const adapted = composeWorkerTodayV1({
      activation: activation.value,
      profile: profile.value,
      availability: availability.value,
      jobs: jobs.status === 'fulfilled' ? jobs.value : null,
      offers: offers.status === 'fulfilled' ? offers.value : null,
      earnings: earnings.status === 'fulfilled' ? earnings.value : null,
    });
    if (!adapted.ok) {
      setState(errorState({
        title: 'Today could not be verified',
        message: `The server response did not match this app version (${adapted.field}).`,
        correlationId: null,
      }));
      return;
    }
    setState({ status: 'ready', value: adapted.value });
  }, [connection]);

  useFocusEffect(useCallback(() => {
    void refresh();
  }, [refresh]));

  const requestAvailabilityChange = useCallback(async (availability: 'online' | 'offline') => {
    if (availabilityChangePending || connection === 'offline') return;
    setAvailabilityChangePending(true);
    try {
      const confirmed = availability === 'online'
        ? await requestGroundedWorkerOnlineAvailability({
            requestForegroundPermission: () => locationService.requestPermission(),
            getCurrentForegroundPosition: () => locationService.getCurrentPosition(),
            sendLocationHeartbeat: (position) => sendGroundedWorkerForegroundLocationHeartbeat({
              lat: position.lat,
              lng: position.lng,
              connectionState: connection,
            }),
            requestOnline: () => setGroundedWorkerShellAvailability({
              availability: 'online',
              connectionState: connection,
            }),
          })
        : await setGroundedWorkerShellAvailability({ availability: 'offline', connectionState: connection });
      setState((current) => current.status === 'ready'
        ? { status: 'ready', value: withConfirmedAvailability(current.value, confirmed) }
        : current);
      await refresh();
    } catch (error) {
      const problem = problemView(
        error,
        'Availability was not changed',
        'The server did not confirm the requested availability. Your last confirmed state remains in place.',
      );
      Alert.alert(problem.title, problem.message);
    } finally {
      setAvailabilityChangePending(false);
    }
  }, [availabilityChangePending, connection, refresh]);

  return (
    <WorkerTodayScreen
      availabilityChangePending={availabilityChangePending}
      connection={connection}
      dayPeriod={dayPeriodForHour(new Date().getHours())}
      onOpenActivation={() => navigation.navigate('WorkerActivation')}
      onOpenAvailabilityDetails={() => navigation.navigate('WorkerAccountReadiness')}
      onOpenEarnings={() => navigation.navigate('Earnings')}
      onOpenNextJob={(projectId) => navigation.navigate('WorkerJobDetail', { projectId })}
      onOpenOffers={() => navigation.navigate('Jobs')}
      onRequestAvailabilityChange={(availability) => { void requestAvailabilityChange(availability); }}
      onRetry={() => { void refresh(); }}
      state={state}
    />
  );
}

const LOADING_JOBS: JobsInboxSnapshot = Object.freeze({
  offers: Object.freeze({ status: 'loading' as const }),
  upcoming: Object.freeze({ status: 'loading' as const }),
  active: Object.freeze({ status: 'loading' as const }),
  history: Object.freeze({ status: 'loading' as const }),
  lastUpdatedAt: null,
});

export function WorkerJobsRoute({ navigation }: { navigation: any }) {
  const network = useNetInfo();
  const connection = connectionState(network);
  const [segment, setSegment] = useState<JobsInboxSegment>('offers');
  const [snapshot, setSnapshot] = useState<JobsInboxSnapshot>(LOADING_JOBS);
  const [serverNow, confirmServerNow] = useServerClock();

  const refresh = useCallback(async () => {
    if (connection === 'offline') {
      setSnapshot((current) => current.lastUpdatedAt ? current : workerJobsSnapshotV1(null, null));
      return;
    }
    setSnapshot((current) => current.lastUpdatedAt ? current : LOADING_JOBS);
    const [jobs, offers] = await Promise.allSettled([
      loadGroundedWorkerShellJobs(),
      loadGroundedWorkerShellOffers(),
    ]);
    const jobsValue: WorkerJobsBundle | null = jobs.status === 'fulfilled' ? jobs.value : null;
    const offersValue: WorkerOffersBundle | null = offers.status === 'fulfilled' ? offers.value : null;
    setSnapshot(workerJobsSnapshotV1(jobsValue, offersValue));
    if (offersValue) confirmServerNow(offersValue.serverNow);
    else if (jobsValue) confirmServerNow(jobsValue.observedAt);
  }, [confirmServerNow, connection]);

  useFocusEffect(useCallback(() => {
    void refresh();
  }, [refresh]));

  return (
    <JobsInboxScreen
      connection={connection}
      onOpenQuoteRequests={() => navigation.navigate('WorkerQuoteRequests')}
      onOpenJob={(projectId) => navigation.navigate('WorkerJobDetail', { projectId })}
      onOpenOffer={(offerId) => navigation.navigate('WorkerIncomingOffer', { offerId })}
      onRetry={() => { void refresh(); }}
      onSelectSegment={setSegment}
      selectedSegment={segment}
      serverNow={serverNow}
      snapshot={snapshot}
    />
  );
}

export function WorkerEarningsRoute({ navigation }: { navigation: any }) {
  const network = useNetInfo();
  const connection = connectionState(network);
  const [state, setState] = useState<ResourceState<EarningsSnapshot>>({ status: 'loading' });

  const refresh = useCallback(async () => {
    if (connection === 'offline') {
      setState((current) => current.status === 'ready'
        ? current
        : errorState({
            title: 'Earnings are unavailable offline',
            message: 'Reconnect to verify the current server ledger. No total was recalculated on this device.',
            correlationId: null,
          }));
      return;
    }
    setState((current) => current.status === 'ready' ? current : { status: 'loading' });
    try {
      setState({ status: 'ready', value: await loadGroundedWorkerShellEarnings() });
    } catch (error) {
      setState(errorState(problemView(
        error,
        'Earnings could not refresh',
        'No earnings or payout value was inferred on this device.',
      )));
    }
  }, [connection]);

  useFocusEffect(useCallback(() => {
    void refresh();
  }, [refresh]));

  return (
    <WorkerEarningsScreen
      connection={connection}
      onOpenLedgerRow={(projectId) => navigation.navigate('WorkerJobDetail', { projectId })}
      onOpenPayoutSupport={() => navigation.navigate('WorkerAccountReadiness')}
      onRetry={() => { void refresh(); }}
      state={state}
    />
  );
}

export function WorkerIncomingOfferRoute({ navigation, route }: { navigation: any; route: any }) {
  const network = useNetInfo();
  const connection = connectionState(network);
  const offerId = typeof route.params?.offerId === 'string' && UUID.test(route.params.offerId)
    ? route.params.offerId.toLowerCase()
    : null;
  const [state, setState] = useState<ResourceState<InstantOffer>>({ status: 'loading' });
  const [serverNow, confirmServerNow] = useServerClock();
  const [acceptPending, setAcceptPending] = useState(false);
  const [declinePending, setDeclinePending] = useState(false);

  const refresh = useCallback(async () => {
    if (!offerId) {
      setState(errorState({ title: 'Offer unavailable', message: 'The offer identifier is invalid.', correlationId: null }));
      return;
    }
    if (connection === 'offline') {
      setState((current) => current.status === 'ready'
        ? current
        : errorState({ title: 'Offer unavailable offline', message: 'Reconnect and refresh before responding.', correlationId: null }));
      return;
    }
    setState((current) => current.status === 'ready' ? current : { status: 'loading' });
    try {
      const result = await loadGroundedWorkerShellOffer(offerId);
      if (result.offer.kind !== 'instant') throw new Error('worker_offer_kind_invalid');
      confirmServerNow(result.serverNow);
      setState({ status: 'ready', value: result.offer });
    } catch (error) {
      setState(errorState(problemView(
        error,
        'Offer could not refresh',
        'The latest server offer state could not be verified. No response was sent.',
      )));
    }
  }, [confirmServerNow, connection, offerId]);

  useFocusEffect(useCallback(() => {
    void refresh();
  }, [refresh]));

  const accept = useCallback(async (requestedOfferId: string) => {
    if (acceptPending || declinePending || requestedOfferId !== offerId) return;
    setAcceptPending(true);
    try {
      const result = await acceptGroundedWorkerShellOffer({ offerId: requestedOfferId, connectionState: connection });
      navigation.replace('WorkerJobDetail', { projectId: result.projectId });
    } catch (error) {
      const problem = problemView(error, 'Offer was not accepted', 'Refresh to see whether the offer expired or was taken.');
      Alert.alert(problem.title, problem.message);
      await refresh();
    } finally {
      setAcceptPending(false);
    }
  }, [acceptPending, connection, declinePending, navigation, offerId, refresh]);

  const decline = useCallback(async (requestedOfferId: string) => {
    if (acceptPending || declinePending || requestedOfferId !== offerId) return;
    setDeclinePending(true);
    try {
      await declineGroundedWorkerShellOffer({ offerId: requestedOfferId, connectionState: connection });
      navigation.goBack();
    } catch (error) {
      const problem = problemView(error, 'Offer was not declined', 'The server did not confirm a decline. Refresh before trying again.');
      Alert.alert(problem.title, problem.message);
      await refresh();
    } finally {
      setDeclinePending(false);
    }
  }, [acceptPending, connection, declinePending, navigation, offerId, refresh]);

  const offerHaptic = useCallback((_intent: 'offer-arrival', _id: string) => {
    void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => undefined);
  }, []);

  return (
    <IncomingOfferScreen
      acceptPending={acceptPending}
      connection={connection}
      declinePending={declinePending}
      onAccept={(id) => { void accept(id); }}
      onDecline={(id) => { void decline(id); }}
      onDismiss={() => navigation.goBack()}
      onOfferArrivalHaptic={offerHaptic}
      onRefresh={() => { void refresh(); }}
      serverNow={serverNow}
      state={state}
    />
  );
}

export function GroundedIncomingOfferListener() {
  const navigation = useNavigation<any>();
  const { user, accessToken } = useSelector((state: any) => state.auth);
  const lastOfferId = useRef<string | null>(null);

  useEffect(() => {
    if (!accessToken || user?.role !== 'labourer') {
      matchSocket.disconnect();
      return undefined;
    }
    matchSocket.connect(accessToken);
    const onIncoming = (payload: unknown) => {
      if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return;
      const matchId = (payload as Record<string, unknown>).matchId;
      if (typeof matchId !== 'string' || !UUID.test(matchId) || lastOfferId.current === matchId) return;
      lastOfferId.current = matchId;
      const intent = createNestedRootIntent('labourer', 'WorkerIncomingOffer', { offerId: matchId });
      navigation.navigate(intent.name, intent.params);
    };
    matchSocket.on('match:incoming', onIncoming);
    return () => {
      matchSocket.off('match:incoming', onIncoming);
      matchSocket.disconnect();
    };
  }, [accessToken, navigation, user?.role]);

  return null;
}
