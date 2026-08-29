import React from 'react';
import type { StyleProp, ViewStyle } from 'react-native';
import { StyleSheet, Text, View } from 'react-native';
import { useTogtTheme } from '../design';
import { Button, TertiaryButton } from './Button';
import { Surface } from './Surface';

type FeedbackTone = 'empty' | 'error' | 'offline';

type FeedbackStateProps = {
  title: string;
  body: string;
  tone: FeedbackTone;
  actionLabel?: string;
  onAction?: () => void;
  style?: StyleProp<ViewStyle>;
  testID?: string;
};

function StateGlyph({ tone }: { tone: FeedbackTone }) {
  const theme = useTogtTheme();
  const foreground = tone === 'error'
    ? theme.colors.error
    : tone === 'offline'
      ? theme.colors.offline
      : theme.colors.actionPrimary;
  const background = tone === 'error'
    ? theme.colors.surfaceDanger
    : tone === 'offline'
      ? theme.colors.surfaceSubtle
      : theme.colors.surfacePositive;

  return (
    <View
      importantForAccessibility="no-hide-descendants"
      style={[
        styles.glyph,
        {
          backgroundColor: background,
          borderColor: foreground,
          borderRadius: theme.radius.hero,
          borderWidth: theme.border.thin,
          height: theme.sizing.stateGlyph,
          width: theme.sizing.stateGlyph,
        },
      ]}
    >
      <View
        style={[
          styles.glyphLine,
          {
            backgroundColor: foreground,
            borderRadius: theme.radius.pill,
            height: theme.border.strong,
            width: theme.sizing.iconLarge,
          },
        ]}
      />
      <View
        style={[
          styles.glyphLine,
          {
            backgroundColor: foreground,
            borderRadius: theme.radius.pill,
            height: theme.border.strong,
            marginTop: theme.spacing.xs,
            width: theme.sizing.iconSmall,
          },
        ]}
      />
    </View>
  );
}

function FeedbackState({
  title,
  body,
  tone,
  actionLabel,
  onAction,
  style,
  testID,
}: FeedbackStateProps) {
  const theme = useTogtTheme();
  const accessibilityRole = tone === 'error' ? 'alert' : 'summary';

  return (
    <View
      accessibilityRole={accessibilityRole}
      style={[
        styles.feedback,
        {
          maxWidth: theme.sizing.readableFormWidth,
          paddingVertical: theme.spacing.xl,
        },
        style,
      ]}
      testID={testID}
    >
      <StateGlyph tone={tone} />
      <Text
        accessibilityRole="header"
        allowFontScaling
        style={[theme.typography.h2, styles.centerText, { color: theme.colors.text, marginTop: theme.spacing.md }]}
      >
        {title}
      </Text>
      <Text
        allowFontScaling
        style={[
          theme.typography.body,
          styles.centerText,
          { color: theme.colors.textSecondary, marginTop: theme.spacing.xs },
        ]}
      >
        {body}
      </Text>
      {actionLabel && onAction ? (
        <Button
          label={actionLabel}
          onPress={onAction}
          style={{ marginTop: theme.spacing.lg }}
          variant={tone === 'error' ? 'secondary' : 'primary'}
        />
      ) : null}
    </View>
  );
}

export type EmptyStateProps = Omit<FeedbackStateProps, 'tone'>;

export function EmptyState(props: EmptyStateProps) {
  return <FeedbackState {...props} tone="empty" />;
}

export type ScreenErrorProps = Omit<FeedbackStateProps, 'tone'> & {
  correlationId?: string;
};

export function ScreenError({ correlationId, body, ...props }: ScreenErrorProps) {
  const detail = correlationId ? `${body} Reference ${correlationId}.` : body;
  return <FeedbackState {...props} body={detail} tone="error" />;
}

export type InlineErrorProps = {
  message: string;
  testID?: string;
};

export function InlineError({ message, testID }: InlineErrorProps) {
  const theme = useTogtTheme();

  return (
    <Surface
      style={{ padding: theme.spacing.sm }}
      testID={testID}
      variant="danger"
    >
      <Text
        accessibilityLiveRegion="polite"
        accessibilityRole="alert"
        allowFontScaling
        style={[theme.typography.bodySmall, { color: theme.colors.error }]}
      >
        {message}
      </Text>
    </Surface>
  );
}

export type OfflineBannerProps = {
  message?: string;
  lastUpdatedLabel?: string;
  onRetry?: () => void;
  testID?: string;
};

export function OfflineBanner({
  message = 'Some actions are unavailable until your connection returns.',
  lastUpdatedLabel,
  onRetry,
  testID,
}: OfflineBannerProps) {
  const theme = useTogtTheme();

  return (
    <Surface
      style={[styles.banner, { columnGap: theme.spacing.sm, padding: theme.spacing.sm }]}
      testID={testID}
      variant="attention"
    >
      <View
        importantForAccessibility="no"
        style={[
          styles.offlineIndicator,
          {
            backgroundColor: theme.colors.offline,
            borderRadius: theme.radius.pill,
            height: theme.sizing.statusDot,
            marginTop: theme.spacing.xs,
            width: theme.sizing.statusDot,
          },
        ]}
      />
      <View accessibilityRole="alert" style={styles.bannerCopy}>
        <Text allowFontScaling style={[theme.typography.label, { color: theme.colors.text }]}>
          Offline
        </Text>
        <Text allowFontScaling style={[theme.typography.bodySmall, { color: theme.colors.textSecondary }]}>
          {message}
        </Text>
        {lastUpdatedLabel ? (
          <Text allowFontScaling style={[theme.typography.caption, { color: theme.colors.textSecondary }]}>
            Last updated {lastUpdatedLabel}
          </Text>
        ) : null}
      </View>
      {onRetry ? <TertiaryButton label="Retry" onPress={onRetry} /> : null}
    </Surface>
  );
}

const styles = StyleSheet.create({
  feedback: {
    alignItems: 'center',
    alignSelf: 'center',
    width: '100%',
  },
  centerText: {
    textAlign: 'center',
  },
  glyph: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  glyphLine: {},
  banner: {
    alignItems: 'flex-start',
    flexDirection: 'row',
  },
  bannerCopy: {
    flex: 1,
  },
  offlineIndicator: {
    flexShrink: 0,
  },
});
