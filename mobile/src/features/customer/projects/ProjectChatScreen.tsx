import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { useTogtTheme } from '../../../design';
import { useRouteEntryFocus } from '../../../navigation/useRouteEntryFocus';
import { AppScaffold, Button, StatusPill, Surface, TextField, TopAppBar } from '../../../ui';
import { customerProjectMessage } from './copy';
import { ProjectScreenState } from './components';
import { createCustomerCommandIntent } from './model';
import type {
  CustomerCommandIntent,
  Loadable,
  ProjectChatSnapshot,
  ProjectMessage,
} from './model';

export type ProjectChatScreenProps = Readonly<{
  chat: Loadable<ProjectChatSnapshot>;
  actorId: string;
  ownParticipantKind?: 'customer' | 'worker';
  composerText: string;
  sendBlockedReason: string | null;
  sendRequestKey: string;
  onBack: () => void;
  onRetryLoad: () => void;
  onComposerChange: (text: string) => void;
  onCommand: (intent: CustomerCommandIntent) => void;
  onOpenSupport: (projectId: string) => void;
}>;

export function ProjectChatScreen({
  chat,
  actorId,
  ownParticipantKind = 'customer',
  composerText,
  sendBlockedReason,
  sendRequestKey,
  onBack,
  onRetryLoad,
  onComposerChange,
  onCommand,
  onOpenSupport,
}: ProjectChatScreenProps) {
  const theme = useTogtTheme();
  const routeTitle = customerProjectMessage('chat.title');
  const routeTitleRef = useRouteEntryFocus<Text>({ fallbackAnnouncement: routeTitle });
  return (
    <AppScaffold
      contentContainerStyle={{ gap: theme.spacing.md, paddingBottom: theme.spacing.xxxl }}
      keyboardAware
      scrollable
      testID="project-chat-screen"
      topBar={<TopAppBar onBack={onBack} title={routeTitle} titleRef={routeTitleRef} />}
    >
      <ProjectScreenState
        emptyBody="No chat context was supplied."
        emptyTitle="Chat unavailable"
        errorBody="Your message draft was not removed."
        errorTitle="Chat could not be loaded"
        loadingLabel="Loading Project chat"
        onRetry={onRetryLoad}
        value={chat}
      >
        {(snapshot, connectionState) => {
          const offline = connectionState === 'offline' || snapshot.connectionStatus === 'offline';
          const send = () => {
            const body = composerText.trim();
            if (!body || snapshot.readOnly || sendBlockedReason !== null) return;
            const result = createCustomerCommandIntent({
              actorId,
              command: 'send_message',
              connectionState: offline ? 'offline' : 'online',
              projectId: snapshot.projectId,
              requestKey: sendRequestKey,
              stateVersion: snapshot.stateVersion,
              payload: { body },
            });
            if (result.ok) onCommand(result.intent);
          };
          const retry = (message: ProjectMessage) => {
            if (!message.retryKey) return;
            const result = createCustomerCommandIntent({
              actorId,
              command: 'retry_message',
              connectionState: offline ? 'offline' : 'online',
              projectId: snapshot.projectId,
              requestKey: message.retryKey,
              stateVersion: snapshot.stateVersion,
              targetId: message.messageId,
            });
            if (result.ok) onCommand(result.intent);
          };
          return (
            <>
              <Surface style={{ gap: theme.spacing.xs }} variant="subtle">
                <View style={styles.splitRow}>
                  <View style={styles.flex}>
                    <Text accessibilityRole="header" allowFontScaling style={[theme.typography.h3, { color: theme.colors.text }]}>{snapshot.otherParticipantName}</Text>
                    <Text allowFontScaling style={[theme.typography.bodySmall, { color: theme.colors.textSecondary }]}>{snapshot.serviceLabel}</Text>
                  </View>
                  <StatusPill
                    label={snapshot.connectionStatus}
                    tone={snapshot.connectionStatus === 'connected' ? 'available' : snapshot.connectionStatus === 'degraded' ? 'pending' : 'offline'}
                  />
                </View>
                {snapshot.contactAccess !== 'revealed' ? (
                  <Text allowFontScaling style={[theme.typography.caption, { color: theme.colors.textSecondary }]}>{customerProjectMessage('chat.masked')}</Text>
                ) : null}
              </Surface>

              <View accessibilityRole="list" style={{ gap: theme.spacing.sm }}>
                {snapshot.messages.map((message) => (
                  <Surface
                    accessibilityLabel={`${message.kind === 'system' ? 'Project event' : message.kind === ownParticipantKind ? 'Your' : 'Participant'} message, ${message.sentAt}. ${message.body}`}
                    key={message.messageId}
                    style={[styles.message, message.kind === ownParticipantKind ? styles.customerMessage : styles.otherMessage]}
                    variant={message.kind === 'system' ? 'attention' : message.delivery === 'failed' ? 'danger' : message.kind === ownParticipantKind ? 'positive' : 'default'}
                  >
                    {message.kind === 'system' ? (
                      <View style={[styles.systemHeading, { gap: theme.spacing.xs }]}>
                        <MaterialCommunityIcons color={theme.colors.attention} name="information-outline" size={theme.sizing.iconSmall} />
                        <Text allowFontScaling style={[theme.typography.label, { color: theme.colors.text }]}>Project event</Text>
                      </View>
                    ) : null}
                    <Text allowFontScaling selectable style={[theme.typography.body, { color: theme.colors.text }]}>{message.body}</Text>
                    <Text allowFontScaling style={[theme.typography.caption, { color: theme.colors.textSecondary }]}>{message.sentAt} · {message.delivery}</Text>
                    {message.delivery === 'failed' && message.retryKey ? (
                      <Button
                        disabled={offline || sendBlockedReason !== null}
                        label={customerProjectMessage('chat.retry')}
                        onPress={() => retry(message)}
                        variant="secondary"
                      />
                    ) : null}
                  </Surface>
                ))}
              </View>

              {snapshot.readOnly ? (
                <Surface variant="subtle">
                  <Text accessibilityRole="alert" allowFontScaling style={[theme.typography.body, { color: theme.colors.textSecondary }]}>{customerProjectMessage('chat.closed')}</Text>
                </Surface>
              ) : sendBlockedReason ? (
                <Surface variant="attention">
                  <Text accessibilityRole="alert" allowFontScaling style={[theme.typography.body, { color: theme.colors.textSecondary }]}>{sendBlockedReason}</Text>
                </Surface>
              ) : (
                <Surface style={{ gap: theme.spacing.sm }}>
                  <TextField
                    helperText={`${composerText.trim().length}/2048 characters`}
                    label="Message"
                    maxLength={2_048}
                    multiline
                    onChangeText={onComposerChange}
                    placeholder="Write a Project message"
                    value={composerText}
                  />
                  <Button disabled={offline || composerText.trim().length === 0} label="Send message" onPress={send} />
                </Surface>
              )}
              <Button label="Report or get support" onPress={() => onOpenSupport(snapshot.projectId)} variant="tertiary" />
            </>
          );
        }}
      </ProjectScreenState>
    </AppScaffold>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  splitRow: { alignItems: 'flex-start', flexDirection: 'row', flexWrap: 'wrap' },
  message: { maxWidth: '88%' },
  customerMessage: { alignSelf: 'flex-end' },
  otherMessage: { alignSelf: 'flex-start' },
  systemHeading: { alignItems: 'center', flexDirection: 'row' },
});

export default ProjectChatScreen;
