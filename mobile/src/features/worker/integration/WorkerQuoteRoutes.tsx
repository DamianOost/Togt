import { useNetInfo } from '@react-native-community/netinfo';
import { useFocusEffect } from '@react-navigation/native';
import React, { useCallback, useState } from 'react';
import { Alert } from 'react-native';
import {
  adaptWorkerQuoteCommandV1,
  adaptWorkerQuoteRequestDetailV1,
  adaptWorkerQuoteRequestListV1,
} from '../../../data/grounded';
import type { WorkerQuoteRequestDetail } from '../../../data/grounded';
import {
  createGroundedQuote,
  isGroundedMarketplaceError,
  loadGroundedQuoteRequest,
  loadGroundedQuoteRequests,
  runGroundedQuoteCommand,
  saveGroundedQuote,
} from '../../../services';
import { AppScaffold, ScreenError, TopAppBar } from '../../../ui';
import {
  WorkerQuoteBuilderScreen,
  WorkerQuoteRequestDetailScreen,
  WorkerQuoteRequestsScreen,
  deriveWorkerQuoteActions,
  hasWorkerQuoteFormErrors,
  validateWorkerQuoteDraft,
  validateWorkerQuoteForSubmission,
  workerQuoteFormFromEvidence,
  workerQuoteIdempotencyKey,
  workerQuoteMutationFromForm,
} from '../quotes';
import type {
  WorkerQuoteDetailState,
  WorkerQuoteForm,
  WorkerQuoteFormErrors,
  WorkerQuoteFormField,
  WorkerQuoteRequestListState,
} from '../quotes';

type ProblemView = Readonly<{ title: string; message: string; correlationId: string | null }>;

function connectionState(network: ReturnType<typeof useNetInfo>): 'online' | 'offline' {
  return network.isConnected === true && network.isInternetReachable !== false ? 'online' : 'offline';
}

function problemView(error: unknown, title: string, message: string): ProblemView {
  return isGroundedMarketplaceError(error)
    ? Object.freeze({
        title: error.problem.title,
        message: error.problem.detail,
        correlationId: error.problem.correlationId,
      })
    : Object.freeze({ title, message, correlationId: null });
}

function errorDetail(problem: ProblemView): string {
  return problem.correlationId ? `${problem.message} Reference ${problem.correlationId}.` : problem.message;
}

export function WorkerQuoteRequestsRoute({ navigation }: { navigation: any }) {
  const connection = connectionState(useNetInfo());
  const [state, setState] = useState<WorkerQuoteRequestListState>({ status: 'loading' });
  const refresh = useCallback(async () => {
    if (connection === 'offline') {
      setState((current) => current.status === 'ready'
        ? current
        : { status: 'error', title: 'Quote requests are offline', message: 'Reconnect to load current eligible requests.', correlationId: null });
      return;
    }
    setState((current) => current.status === 'ready' ? current : { status: 'loading' });
    try {
      const adapted = adaptWorkerQuoteRequestListV1(await loadGroundedQuoteRequests());
      if (!adapted.ok) throw new Error(`${adapted.reasonCode}:${adapted.field}`);
      setState({ status: 'ready', value: adapted.value });
    } catch (error) {
      const problem = problemView(error, 'Quote requests could not load', 'The server response could not be verified for this app version.');
      setState({ status: 'error', ...problem });
    }
  }, [connection]);
  useFocusEffect(useCallback(() => { void refresh(); }, [refresh]));
  return (
    <WorkerQuoteRequestsScreen
      connection={connection}
      onBack={() => navigation.goBack()}
      onOpenRequest={(requestId) => navigation.navigate('WorkerQuoteRequestDetail', { requestId })}
      onRetry={() => { void refresh(); }}
      state={state}
    />
  );
}

export function WorkerQuoteRequestDetailRoute({ navigation, route }: { navigation: any; route: any }) {
  const connection = connectionState(useNetInfo());
  const requestId = typeof route.params?.requestId === 'string' ? route.params.requestId : '';
  const [state, setState] = useState<WorkerQuoteDetailState>({ status: 'loading' });
  const refresh = useCallback(async () => {
    if (connection === 'offline') {
      setState((current) => current.status === 'ready'
        ? current
        : { status: 'error', title: 'Request detail is offline', message: 'Reconnect to verify this quote request.', correlationId: null });
      return;
    }
    setState((current) => current.status === 'ready' ? current : { status: 'loading' });
    try {
      const adapted = adaptWorkerQuoteRequestDetailV1(await loadGroundedQuoteRequest(requestId));
      if (!adapted.ok) throw new Error(`${adapted.reasonCode}:${adapted.field}`);
      setState({ status: 'ready', value: adapted.value });
    } catch (error) {
      const problem = problemView(error, 'Request detail could not load', 'The privacy-safe request response could not be verified.');
      setState({ status: 'error', ...problem });
    }
  }, [connection, requestId]);
  useFocusEffect(useCallback(() => { void refresh(); }, [refresh]));
  return (
    <WorkerQuoteRequestDetailScreen
      connection={connection}
      onBack={() => navigation.goBack()}
      onOpenBuilder={(id) => navigation.navigate('WorkerQuoteBuilder', { requestId: id })}
      onRetry={() => { void refresh(); }}
      state={state}
    />
  );
}

type BuilderState =
  | Readonly<{ status: 'loading' }>
  | Readonly<{ status: 'error'; problem: ProblemView }>
  | Readonly<{ status: 'ready'; detail: WorkerQuoteRequestDetail; form: WorkerQuoteForm }>;

export function WorkerQuoteBuilderRoute({ navigation, route }: { navigation: any; route: any }) {
  const connection = connectionState(useNetInfo());
  const requestId = typeof route.params?.requestId === 'string' ? route.params.requestId : '';
  const [state, setState] = useState<BuilderState>({ status: 'loading' });
  const [errors, setErrors] = useState<WorkerQuoteFormErrors>({});
  const [commandError, setCommandError] = useState<string | null>(null);
  const [pendingAction, setPendingAction] = useState<'save' | 'submit' | 'withdraw' | null>(null);

  const refresh = useCallback(async () => {
    if (connection === 'offline') {
      setState((current) => current.status === 'ready'
        ? current
        : { status: 'error', problem: { title: 'Quote builder is offline', message: 'Reconnect to load a current server-backed draft.', correlationId: null } });
      return;
    }
    setState((current) => current.status === 'ready' ? current : { status: 'loading' });
    try {
      const adapted = adaptWorkerQuoteRequestDetailV1(await loadGroundedQuoteRequest(requestId));
      if (!adapted.ok) throw new Error(`${adapted.reasonCode}:${adapted.field}`);
      setState({ status: 'ready', detail: adapted.value, form: workerQuoteFormFromEvidence(adapted.value.request, adapted.value.ownQuote) });
      setErrors({});
      setCommandError(null);
    } catch (error) {
      setState({ status: 'error', problem: problemView(error, 'Quote builder could not load', 'The latest draft could not be verified.') });
    }
  }, [connection, requestId]);

  useFocusEffect(useCallback(() => { void refresh(); }, [refresh]));

  const change = useCallback((field: WorkerQuoteFormField, value: string) => {
    setState((current) => current.status === 'ready'
      ? { ...current, form: Object.freeze({ ...current.form, [field]: value }) }
      : current);
    setErrors((current) => {
      const next = { ...current };
      delete next[field];
      return Object.freeze(next);
    });
    setCommandError(null);
  }, []);

  const applyQuoteResponse = useCallback((response: unknown) => {
    const adapted = adaptWorkerQuoteCommandV1(response);
    if (!adapted.ok) throw new Error(`${adapted.reasonCode}:${adapted.field}`);
    setState((current) => {
      if (current.status !== 'ready' || adapted.value.requestId !== current.detail.request.id) return current;
      const detail = Object.freeze({ ...current.detail, ownQuote: adapted.value });
      return { status: 'ready', detail, form: workerQuoteFormFromEvidence(detail.request, detail.ownQuote) };
    });
    setErrors({});
    setCommandError(null);
  }, []);

  const mutate = useCallback(async (submit: boolean) => {
    if (state.status !== 'ready' || pendingAction !== null) return;
    const validation = submit
      ? validateWorkerQuoteForSubmission(state.form, state.detail.request, new Date().toISOString())
      : validateWorkerQuoteDraft(state.form);
    setErrors(validation);
    if (hasWorkerQuoteFormErrors(validation)) return;
    const quote = workerQuoteMutationFromForm(state.form);
    const existing = state.detail.ownQuote;
    const command = existing
      ? submit ? 'edit_submit' as const : 'save_draft' as const
      : submit ? 'create_submit' as const : 'create_draft' as const;
    const key = workerQuoteIdempotencyKey({
      command,
      requestId: state.detail.request.id,
      quoteId: existing?.id ?? null,
      version: existing?.version ?? state.detail.request.version,
      quote,
    });
    setPendingAction(submit ? 'submit' : 'save');
    setCommandError(null);
    try {
      const response = existing
        ? await saveGroundedQuote(existing.id, quote, submit, key)
        : await createGroundedQuote(state.detail.request.id, quote, submit, key);
      applyQuoteResponse(response);
    } catch (error) {
      setCommandError(errorDetail(problemView(error, submit ? 'Quote was not submitted' : 'Draft was not saved', 'Refresh the latest request state and try again.')));
    } finally {
      setPendingAction(null);
    }
  }, [applyQuoteResponse, pendingAction, state]);

  const withdraw = useCallback(() => {
    if (state.status !== 'ready' || !state.detail.ownQuote || pendingAction !== null) return;
    const quote = state.detail.ownQuote;
    Alert.alert(
      'Withdraw this quote?',
      'The customer will no longer be able to select it. This cannot be undone in this build.',
      [
        { text: 'Keep quote', style: 'cancel' },
        {
          text: 'Withdraw',
          style: 'destructive',
          onPress: () => {
            const key = workerQuoteIdempotencyKey({
              command: 'withdraw',
              requestId: state.detail.request.id,
              quoteId: quote.id,
              version: quote.version,
            });
            setPendingAction('withdraw');
            setCommandError(null);
            void runGroundedQuoteCommand(quote.id, 'withdraw', key)
              .then(applyQuoteResponse)
              .catch((error) => setCommandError(errorDetail(problemView(error, 'Quote was not withdrawn', 'Refresh the latest quote state and try again.'))))
              .finally(() => setPendingAction(null));
          },
        },
      ],
    );
  }, [applyQuoteResponse, pendingAction, state]);

  if (state.status === 'loading') {
    return <AppScaffold testID="worker-quote-builder-loading" topBar={<TopAppBar onBack={() => navigation.goBack()} title="Quote builder" />} />;
  }
  if (state.status === 'error') {
    return (
      <AppScaffold testID="worker-quote-builder-error" topBar={<TopAppBar onBack={() => navigation.goBack()} title="Quote builder" />}>
        <ScreenError actionLabel="Retry" body={state.problem.message} {...(state.problem.correlationId ? { correlationId: state.problem.correlationId } : {})} onAction={() => { void refresh(); }} title={state.problem.title} />
      </AppScaffold>
    );
  }
  const actions = deriveWorkerQuoteActions({ request: state.detail.request, quote: state.detail.ownQuote, connection });
  return (
    <WorkerQuoteBuilderScreen
      actions={actions}
      commandError={commandError}
      connection={connection}
      errors={errors}
      form={state.form}
      onBack={() => navigation.goBack()}
      onChange={change}
      onSaveDraft={() => { void mutate(false); }}
      onRefresh={() => { void refresh(); }}
      onSubmit={() => { void mutate(true); }}
      onWithdraw={withdraw}
      pendingAction={pendingAction}
      quote={state.detail.ownQuote}
      request={state.detail.request}
    />
  );
}
