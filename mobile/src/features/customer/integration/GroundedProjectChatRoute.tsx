import { useNetInfo } from '@react-native-community/netinfo';
import { useFocusEffect } from '@react-navigation/native';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useSelector } from 'react-redux';
import { io, type Socket } from 'socket.io-client';

import { socketUrl } from '../../../config/apiConfig';
import api from '../../../services/api';
import { customerProjectMessage, ProjectChatScreen } from '../projects';
import type {
  CustomerCommandIntent,
  Loadable,
  ProjectChatSnapshot,
  ProjectMessage,
} from '../projects';

type JsonRecord = Record<string, unknown>;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function uuid(value: unknown): string | null {
  return typeof value === 'string' && UUID.test(value) ? value.toLowerCase() : null;
}

function boundedText(value: unknown, maximum: number): string | null {
  if (typeof value !== 'string') return null;
  const candidate = value.trim();
  return candidate.length > 0 && candidate.length <= maximum ? candidate : null;
}

function iso(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
}

function connectionState(network: ReturnType<typeof useNetInfo>): 'online' | 'offline' {
  return network.isConnected === false || network.isInternetReachable === false ? 'offline' : 'online';
}

function responseStatus(error: unknown): number | null {
  if (!isRecord(error) || !isRecord(error.response)) return null;
  return Number.isSafeInteger(error.response.status) ? Number(error.response.status) : null;
}

function responseProblemType(error: unknown): string | null {
  if (!isRecord(error) || !isRecord(error.response) || !isRecord(error.response.data)) return null;
  return boundedText(error.response.data.type, 240);
}

function messageFromApi(raw: unknown, actorId: string, actorRole: 'customer' | 'labourer'): ProjectMessage | null {
  if (!isRecord(raw)) return null;
  const messageId = uuid(raw.id);
  const senderId = uuid(raw.sender_id);
  const body = boundedText(raw.body, 2_048);
  const sentAt = iso(raw.created_at);
  if (!messageId || !senderId || !body || !sentAt) return null;
  const ownKind: ProjectMessage['kind'] = actorRole === 'customer' ? 'customer' : 'worker';
  const otherKind: ProjectMessage['kind'] = actorRole === 'customer' ? 'worker' : 'customer';
  const kind = senderId === actorId ? ownKind : otherKind;
  return Object.freeze({ messageId, kind, sentAt, body, delivery: 'sent', retryKey: null });
}

function timelineMessages(rawProject: JsonRecord): readonly ProjectMessage[] {
  if (!Array.isArray(rawProject.timeline)) return Object.freeze([]);
  const events: ProjectMessage[] = [];
  for (const raw of rawProject.timeline) {
    if (!isRecord(raw)) continue;
    const id = uuid(raw.id);
    const body = boundedText(raw.label, 240);
    const sentAt = iso(raw.occurredAt);
    if (id && body && sentAt) {
      events.push(Object.freeze({
        messageId: `event:${id}`,
        kind: 'system',
        sentAt,
        body,
        delivery: 'immutable',
        retryKey: null,
      }));
    }
  }
  return Object.freeze(events);
}

function projectContext(raw: unknown, role: 'customer' | 'labourer'): Readonly<{
  revision: number;
  otherParticipantName: string;
  serviceLabel: string;
  contactAccess: ProjectChatSnapshot['contactAccess'];
  readOnly: boolean;
  timeline: readonly ProjectMessage[];
}> | null {
  if (!isRecord(raw) || !isRecord(raw.project)) return null;
  const project = raw.project;
  if (!Number.isSafeInteger(project.revision) || Number(project.revision) < 0) return null;
  const participants = isRecord(project.participants) ? project.participants : {};
  const other = role === 'customer'
    ? (isRecord(participants.worker) ? participants.worker : null)
    : (isRecord(participants.customer) ? participants.customer : null);
  const service = isRecord(project.service) ? project.service : null;
  const operational = isRecord(project.operational) ? project.operational : null;
  const phase = boundedText(operational?.phase, 64) ?? 'unknown';
  const phone = other ? boundedText(other.phone, 32) : null;
  const terminal = phase === 'closed' || project.transactionalStatus === 'cancelled' || project.transactionalStatus === 'completed';
  return Object.freeze({
    revision: Number(project.revision),
    otherParticipantName: other ? boundedText(other.displayName, 100) ?? 'Project participant' : 'Project participant',
    serviceLabel: service ? boundedText(service.label, 120) ?? 'Project service' : 'Project service',
    contactAccess: terminal ? 'closed' : phone ? 'revealed' : 'masked',
    readOnly: terminal,
    timeline: timelineMessages(project),
  });
}

function mergeMessages(...groups: readonly (readonly ProjectMessage[])[]): readonly ProjectMessage[] {
  const byId = new Map<string, ProjectMessage>();
  groups.flat().forEach((message) => byId.set(message.messageId, message));
  return Object.freeze([...byId.values()].sort((left, right) => left.sentAt.localeCompare(right.sentAt)));
}

function requestKey(projectId: string): string {
  return `chat:${projectId}:${Date.now()}`;
}

export function GroundedProjectChatRoute({ navigation, route }: { navigation: any; route: any }) {
  const projectId = uuid(route.params?.projectId ?? route.params?.bookingId) ?? '';
  const { accessToken, user } = useSelector((state: any) => state.auth);
  const actorId = uuid(user?.id) ?? '';
  const actorRole: 'customer' | 'labourer' = user?.role === 'labourer' ? 'labourer' : 'customer';
  const network = useNetInfo();
  const connection = connectionState(network);
  const [chat, setChat] = useState<Loadable<ProjectChatSnapshot>>({ state: 'loading' });
  const [composerText, setComposerText] = useState(() => boundedText(route.params?.prefillMessage, 2_048) ?? '');
  const [sendBlockedReason, setSendBlockedReason] = useState<string | null>(null);
  const [sendRequestKey, setSendRequestKey] = useState(() => requestKey(projectId || 'invalid'));
  const socketRef = useRef<Socket | null>(null);
  const refreshSequenceRef = useRef(0);

  const refresh = useCallback(async () => {
    const refreshSequence = ++refreshSequenceRef.current;
    if (!projectId || !actorId) {
      setChat({ state: 'empty' });
      return;
    }
    if (connection === 'offline') {
      setChat((current) => current.state === 'ready'
        ? { ...current, connectionState: 'offline', value: { ...current.value, connectionStatus: 'offline' } }
        : { state: 'error', correlationId: null });
      return;
    }
    setChat((current) => current.state === 'ready' ? current : { state: 'loading' });
    try {
      const [messagesResponse, projectResponse] = await Promise.all([
        api.get(`/api/messages/${projectId}`),
        api.get(`/api/projects/${projectId}`),
      ]);
      const context = projectContext(projectResponse.data, actorRole);
      const rawMessages = isRecord(messagesResponse.data) && Array.isArray(messagesResponse.data.messages)
        ? messagesResponse.data.messages
        : null;
      if (!context || !rawMessages) throw new Error('project_chat_contract_invalid');
      const messages = rawMessages.map((raw) => messageFromApi(raw, actorId, actorRole));
      if (messages.some((message) => message === null)) throw new Error('project_chat_message_contract_invalid');
      if (refreshSequence !== refreshSequenceRef.current) return;
      setChat({
        state: 'ready',
        connectionState: connection,
        lastUpdatedAt: new Date().toISOString(),
        value: Object.freeze({
          projectId,
          stateVersion: context.revision,
          otherParticipantName: context.otherParticipantName,
          serviceLabel: context.serviceLabel,
          messages: mergeMessages(context.timeline, messages as readonly ProjectMessage[]),
          connectionStatus: socketRef.current?.connected ? 'connected' : 'degraded',
          contactAccess: context.contactAccess,
          readOnly: context.readOnly,
        }),
      });
    } catch {
      if (refreshSequence !== refreshSequenceRef.current) return;
      setChat({ state: 'error', correlationId: null });
    }
  }, [actorId, actorRole, connection, projectId]);

  useEffect(() => {
    setSendBlockedReason(null);
  }, [projectId]);

  useFocusEffect(useCallback(() => {
    void refresh();
  }, [refresh]));

  useEffect(() => {
    if (!projectId || !accessToken || connection === 'offline') return undefined;
    const socket = io(socketUrl('/chat'), {
      auth: { token: accessToken },
      transports: ['polling', 'websocket'],
    });
    socketRef.current = socket;
    const setConnection = (status: ProjectChatSnapshot['connectionStatus']) => {
      setChat((current) => current.state === 'ready'
        ? { ...current, value: { ...current.value, connectionStatus: status } }
        : current);
    };
    socket.on('connect', () => {
      socket.emit('join:booking', projectId);
      setConnection('connected');
      void refresh();
    });
    socket.on('disconnect', () => setConnection('degraded'));
    socket.on('connect_error', () => setConnection('degraded'));
    socket.on('new_message', () => {
      void refresh();
    });
    return () => {
      socket.emit('leave:booking', projectId);
      socket.disconnect();
      if (socketRef.current === socket) socketRef.current = null;
    };
  }, [accessToken, connection, projectId, refresh]);

  useEffect(() => {
    if (!projectId || !accessToken || connection === 'offline') return undefined;
    const reconciliationTimer = setInterval(() => {
      if (!socketRef.current?.connected) void refresh();
    }, 15_000);
    return () => clearInterval(reconciliationTimer);
  }, [accessToken, connection, projectId, refresh]);

  const failedMessages = useMemo(() => chat.state === 'ready'
    ? new Map(chat.value.messages.filter((message) => message.delivery === 'failed').map((message) => [message.messageId, message]))
    : new Map(), [chat]);

  const runCommand = useCallback(async (intent: CustomerCommandIntent) => {
    if (intent.command !== 'send_message' && intent.command !== 'retry_message') return;
    const retryMessage = intent.command === 'retry_message' && intent.targetId
      ? failedMessages.get(intent.targetId) ?? null
      : null;
    const body = intent.command === 'send_message'
      ? boundedText(intent.payload.body, 2_048)
      : retryMessage?.body ?? null;
    const operationKey = intent.command === 'retry_message'
      ? retryMessage?.retryKey ?? null
      : intent.idempotencyKey;
    if (!body || !operationKey || connection === 'offline') return;
    try {
      const response = await api.post(
        `/api/messages/${projectId}`,
        { body },
        { headers: { 'Idempotency-Key': operationKey } },
      );
      const confirmed = isRecord(response.data) ? messageFromApi(response.data.message, actorId, actorRole) : null;
      if (!confirmed) throw new Error('project_chat_send_contract_invalid');
      setChat((current) => current.state === 'ready'
        ? {
            ...current,
            lastUpdatedAt: new Date().toISOString(),
            value: {
              ...current.value,
              messages: mergeMessages(
                current.value.messages.filter((message) => message.retryKey !== operationKey),
                [confirmed],
              ),
            },
          }
        : current);
      setComposerText((current) => current.trim() === body ? '' : current);
      setSendRequestKey(requestKey(projectId));
    } catch (error) {
      const status = responseStatus(error);
      const problemType = responseProblemType(error);
      if (problemType?.endsWith('/relationship_block_active') || problemType === 'relationship_block_active') {
        setSendBlockedReason(customerProjectMessage('chat.blocked'));
        await refresh();
        return;
      }
      if (status !== null && status >= 400 && status < 500) {
        await refresh();
        return;
      }
      if (intent.command !== 'send_message') return;
      const failed: ProjectMessage = Object.freeze({
        messageId: `local:${intent.idempotencyKey}`,
        kind: actorRole === 'labourer' ? 'worker' : 'customer',
        sentAt: new Date().toISOString(),
        body,
        delivery: 'failed',
        retryKey: intent.idempotencyKey,
      });
      setChat((current) => current.state === 'ready'
        ? { ...current, value: { ...current.value, messages: mergeMessages(current.value.messages, [failed]) } }
        : current);
    }
  }, [actorId, actorRole, connection, failedMessages, projectId, refresh]);

  const goBack = () => {
    if (navigation.canGoBack()) navigation.goBack();
    else if (actorRole === 'customer') navigation.navigate('CustomerTabs', { screen: 'Projects' });
    else navigation.navigate('WorkerTabs', { screen: 'Jobs' });
  };

  return (
    <ProjectChatScreen
      actorId={actorId}
      chat={chat}
      composerText={composerText}
      onBack={goBack}
      onCommand={(intent) => { void runCommand(intent); }}
      onComposerChange={setComposerText}
      onOpenSupport={(id) => navigation.navigate('SafetyHelp', { projectId: id })}
      onRetryLoad={() => { void refresh(); }}
      ownParticipantKind={actorRole === 'labourer' ? 'worker' : 'customer'}
      sendBlockedReason={sendBlockedReason}
      sendRequestKey={sendRequestKey}
    />
  );
}

export default GroundedProjectChatRoute;
