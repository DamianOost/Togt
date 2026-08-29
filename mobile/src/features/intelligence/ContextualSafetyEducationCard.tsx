import React from 'react';
import { Text } from 'react-native';
import { useTogtTheme } from '../../design';
import { Button, SectionHeader, Surface } from '../../ui';

export type SafetyEducationAudience = 'customer_project' | 'worker_start';

export function ContextualSafetyEducationCard({
  audience,
  onDismiss,
}: Readonly<{
  audience: SafetyEducationAudience;
  onDismiss: () => void;
}>) {
  const theme = useTogtTheme();
  const body = audience === 'worker_start'
    ? 'Before work starts, review the agreed scope together and ask for the one-time PIN only when both people are ready. This is general guidance, not an alert about this Job.'
    : 'Keep the agreed scope and messages in TOGT, and use Safety & support whenever you want help. This is general guidance, not an alert about this Project.';
  return (
    <Surface
      accessibilityLabel={`A calm check-in. ${body}`}
      style={{ gap: theme.spacing.sm }}
      testID="contextual-safety-education-card"
      variant="subtle"
    >
      <SectionHeader title="A calm check-in" />
      <Text allowFontScaling style={[theme.typography.bodySmall, { color: theme.colors.textSecondary }]}>{body}</Text>
      <Button label="Dismiss reminder" onPress={onDismiss} variant="tertiary" />
    </Surface>
  );
}
