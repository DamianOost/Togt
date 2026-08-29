import React, { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useLayoutMetrics, useTogtTheme } from '../design';
import { AppScaffold } from './AppScaffold';
import { BrandMark } from './BrandMark';
import { Button, DangerButton, SecondaryButton, TertiaryButton } from './Button';
import { Chip, StatusPill } from './Chip';
import { EmptyState, InlineError, OfflineBanner, ScreenError } from './Feedback';
import { SectionHeader } from './SectionHeader';
import { Surface } from './Surface';
import { TextField } from './TextField';
import { TopAppBar } from './TopAppBar';

function GallerySection({ title, children }: React.PropsWithChildren<{ title: string }>) {
  const theme = useTogtTheme();

  return (
    <View style={{ marginBottom: theme.spacing.xxl }}>
      <SectionHeader title={title} />
      <View style={{ rowGap: theme.spacing.sm }}>{children}</View>
    </View>
  );
}

export function DesignGalleryScreen() {
  const theme = useTogtTheme();
  const layout = useLayoutMetrics();
  const [selectedService, setSelectedService] = useState('Plumbing');

  return (
    <AppScaffold
      scrollable
      topBar={<TopAppBar title="Component gallery" subtitle={`${layout.size} layout`} />}
    >
      <Surface
        elevation="card"
        style={{ marginBottom: theme.spacing.xxl, marginTop: theme.spacing.lg, padding: theme.spacing.xl }}
      >
        <BrandMark showDescriptor />
        <Text
          allowFontScaling
          style={[theme.typography.h1, { color: theme.colors.text, marginTop: theme.spacing.lg }]}
        >
          Calm trust. Clear momentum.
        </Text>
        <Text
          allowFontScaling
          style={[theme.typography.body, { color: theme.colors.textSecondary, marginTop: theme.spacing.xs }]}
        >
          Grounded Momentum keeps identity, scope, money and safety legible while making the next action unmistakable.
        </Text>
      </Surface>

      <GallerySection title="Actions">
        <Button fullWidth label="Find a worker" onPress={() => undefined} />
        <SecondaryButton fullWidth label="Review job details" onPress={() => undefined} />
        <TertiaryButton fullWidth label="View all services" onPress={() => undefined} />
        <DangerButton fullWidth label="Cancel request" onPress={() => undefined} />
        <Button disabled fullWidth label="Unavailable action" onPress={() => undefined} />
        <Button fullWidth label="Confirming request" loading onPress={() => undefined} />
      </GallerySection>

      <GallerySection title="Inputs">
        <TextField
          helperText="Use a landmark only if it helps the worker find you."
          label="Job address"
          placeholder="Enter an address"
        />
        <TextField
          error="Describe the work before continuing."
          label="Job description"
          multiline
          placeholder="What needs doing?"
          required
        />
        <TextField disabled label="Confirmed price" value="R 450.00" />
      </GallerySection>

      <GallerySection title="Selection and status">
        <View style={[styles.wrap, { gap: theme.spacing.xs }]}>
          {['Plumbing', 'Electrical', 'Carpentry'].map((service) => (
            <Chip
              key={service}
              label={service}
              onPress={() => setSelectedService(service)}
              selected={selectedService === service}
            />
          ))}
        </View>
        <View style={[styles.wrap, { gap: theme.spacing.xs }]}>
          <StatusPill label="Available" tone="available" />
          <StatusPill label="Arriving in 18 min" tone="pending" />
          <StatusPill label="Job in progress" tone="inProgress" />
          <StatusPill label="Offline" tone="offline" />
        </View>
      </GallerySection>

      <GallerySection title="Feedback">
        <OfflineBanner lastUpdatedLabel="8 minutes ago" onRetry={() => undefined} />
        <InlineError message="We could not update the booking. Your entered details are still here." />
        <Surface>
          <EmptyState
            actionLabel="Describe a job"
            body="Tell us what needs doing and we will help you find a suitable worker."
            onAction={() => undefined}
            title="No active projects"
          />
        </Surface>
        <Surface>
          <ScreenError
            actionLabel="Try again"
            body="The request did not load. Check your connection and retry."
            correlationId="TG-2048"
            onAction={() => undefined}
            title="We could not load this job"
          />
        </Surface>
      </GallerySection>
    </AppScaffold>
  );
}

const styles = StyleSheet.create({
  wrap: {
    alignItems: 'center',
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
});

export default DesignGalleryScreen;
