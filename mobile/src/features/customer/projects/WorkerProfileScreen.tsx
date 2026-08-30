import React from 'react';
import { Image, ScrollView, StyleSheet, Text, View } from 'react-native';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { useTogtTheme } from '../../../design';
import { AppScaffold, Button, SectionHeader, StatusPill, Surface, TopAppBar } from '../../../ui';
import { customerProjectMessage } from './copy';
import { PriceEvidenceSummary, ProjectScreenState, VerificationList } from './components';
import type { Loadable, WorkerProfileSnapshot } from './model';
import { isSafeRemoteImageUrl } from './model';

export type WorkerProfileScreenProps = Readonly<{
  profile: Loadable<WorkerProfileSnapshot>;
  onBack: () => void;
  onRetry: () => void;
  onRequestService: (workerId: string, serviceId: string, serviceVersion: number) => void;
  onSeeAlternatives: (serviceId: string | null) => void;
}>;

export function WorkerProfileScreen({ profile, onBack, onRetry, onRequestService, onSeeAlternatives }: WorkerProfileScreenProps) {
  const theme = useTogtTheme();
  const readyProfile = profile.state === 'ready' ? profile : null;
  return (
    <AppScaffold
      bottomAction={readyProfile?.value.serviceVariants.length === 0 ? (
        <Button
          disabled={readyProfile.connectionState === 'offline'}
          fullWidth
          label={customerProjectMessage('worker.seeAlternatives')}
          onPress={() => onSeeAlternatives(null)}
        />
      ) : readyProfile ? (
        <Button
          disabled={!readyProfile.value.currentlyAvailable || !readyProfile.value.directRequestAvailable || readyProfile.connectionState === 'offline'}
          fullWidth
          label={readyProfile.value.currentlyAvailable && readyProfile.value.directRequestAvailable
            ? customerProjectMessage('worker.request')
            : readyProfile.value.currentlyAvailable
              ? customerProjectMessage('worker.requestUnavailable')
              : customerProjectMessage('worker.unavailable')}
          onPress={() => onRequestService(
            readyProfile.value.worker.workerId,
            readyProfile.value.worker.serviceId,
            readyProfile.value.worker.serviceVersion,
          )}
        />
      ) : null}
      contentContainerStyle={{ gap: theme.spacing.lg, paddingBottom: theme.spacing.xxxl }}
      scrollable
      testID="worker-profile-screen"
      topBar={<TopAppBar onBack={onBack} title={customerProjectMessage('worker.profileTitle')} />}
    >
      <ProjectScreenState
        emptyBody="No Worker identity was supplied."
        emptyTitle="Worker profile unavailable"
        errorBody="No request was sent. Check your connection and try again."
        errorTitle="Worker profile could not be loaded"
        loadingLabel="Loading Worker profile"
        onRetry={onRetry}
        value={profile}
      >
        {(snapshot, connectionState) => {
          const worker = snapshot.worker;
          const rating = worker.rating
            ? customerProjectMessage('worker.reviews', { rating: worker.rating.average.toFixed(1), count: worker.rating.count })
            : customerProjectMessage('worker.new');
          return (
            <>
              <Surface elevation="card" style={{ gap: theme.spacing.md }}>
                <View style={[styles.profileHeader, { gap: theme.spacing.lg }]}>
                  {isSafeRemoteImageUrl(worker.photoUrl) ? (
                    <Image accessibilityLabel={`${worker.displayName} profile photo`} source={{ uri: worker.photoUrl }} style={[styles.heroAvatar, { borderRadius: theme.radius.hero }]} />
                  ) : (
                    <View accessibilityLabel={`${worker.displayName} branded profile placeholder`} style={[styles.heroAvatarFallback, { backgroundColor: theme.colors.surfacePositive, borderRadius: theme.radius.hero }]}>
                      <MaterialCommunityIcons color={theme.colors.actionPrimary} name="account-outline" size={48} />
                    </View>
                  )}
                  <View style={styles.flex}>
                    <Text accessibilityRole="header" allowFontScaling style={[theme.typography.h1, { color: theme.colors.text }]}>{worker.displayName}</Text>
                    <Text allowFontScaling style={[theme.typography.body, { color: theme.colors.textSecondary }]}>{worker.serviceLabel}</Text>
                    <Text allowFontScaling style={[theme.typography.bodySmall, { color: theme.colors.textSecondary }]}>{rating}</Text>
                    <StatusPill
                      label={snapshot.currentlyAvailable ? worker.availabilityLabel ?? 'Available' : worker.availabilityLabel ?? 'Unavailable'}
                      tone={snapshot.currentlyAvailable ? 'available' : 'offline'}
                    />
                  </View>
                </View>
                <VerificationList evidence={worker.verification} />
                {worker.serviceAreaLabel ? (
                  <Text allowFontScaling style={[theme.typography.bodySmall, { color: theme.colors.textSecondary }]}>{customerProjectMessage('worker.area')}: {worker.serviceAreaLabel}</Text>
                ) : null}
              </Surface>

              <Surface style={{ gap: theme.spacing.sm }}>
                <SectionHeader title={customerProjectMessage('worker.about')} />
                <Text allowFontScaling style={[theme.typography.body, { color: theme.colors.textSecondary }]}>{snapshot.about ?? 'No about information is available.'}</Text>
              </Surface>

              <View style={{ gap: theme.spacing.md }}>
                <SectionHeader title="Services" />
                {snapshot.serviceVariants.map((service) => (
                  <Surface elevation="card" key={`${service.serviceId}:v${service.serviceVersion}`} style={{ gap: theme.spacing.sm }}>
                    <View style={styles.splitRow}>
                      <View style={styles.flex}>
                        <Text accessibilityRole="header" allowFontScaling style={[theme.typography.h3, { color: theme.colors.text }]}>{service.label}</Text>
                        <Text allowFontScaling style={[theme.typography.bodySmall, { color: theme.colors.textSecondary }]}>{service.description}</Text>
                      </View>
                      <PriceEvidenceSummary price={service.price} />
                    </View>
                    {service.availabilityLabel ? <Text allowFontScaling style={[theme.typography.caption, { color: theme.colors.textSecondary }]}>{service.availabilityLabel}</Text> : null}
                    {snapshot.currentlyAvailable && snapshot.directRequestAvailable ? (
                      <Button
                        disabled={connectionState === 'offline'}
                        label={customerProjectMessage('worker.request')}
                        onPress={() => onRequestService(worker.workerId, service.serviceId, service.serviceVersion)}
                      />
                    ) : (
                      <View style={{ gap: theme.spacing.sm }}>
                        <Text allowFontScaling style={[theme.typography.bodySmall, { color: theme.colors.textSecondary }]}>
                          {snapshot.currentlyAvailable
                            ? snapshot.directRequestUnavailableReason ?? customerProjectMessage('worker.requestUnavailable')
                            : snapshot.nextAvailabilityLabel ?? customerProjectMessage('worker.unavailable')}
                        </Text>
                        <Button label={customerProjectMessage('worker.seeAlternatives')} onPress={() => onSeeAlternatives(service.serviceId)} variant="secondary" />
                      </View>
                    )}
                  </Surface>
                ))}
                {snapshot.serviceVariants.length === 0 ? (
                  <Surface style={{ gap: theme.spacing.sm }} variant="attention">
                    <View accessibilityRole="alert">
                      <Text allowFontScaling style={[theme.typography.body, { color: theme.colors.textSecondary }]}>
                        {customerProjectMessage('worker.noActiveServices')}
                      </Text>
                    </View>
                  </Surface>
                ) : null}
              </View>

              <View style={{ gap: theme.spacing.md }}>
                <SectionHeader title="Portfolio" />
                {snapshot.portfolio.length > 0 ? (
                  <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                    <View style={[styles.portfolioRow, { gap: theme.spacing.sm }]}>
                      {snapshot.portfolio.filter((item) => isSafeRemoteImageUrl(item.imageUrl)).map((item) => (
                        <Surface key={item.portfolioId} style={styles.portfolioCard}>
                          <Image accessibilityLabel={item.caption} source={{ uri: item.imageUrl }} style={[styles.portfolioImage, { borderRadius: theme.radius.input }]} />
                          <Text allowFontScaling style={[theme.typography.caption, { color: theme.colors.textSecondary, marginTop: theme.spacing.xs }]}>{item.caption}</Text>
                        </Surface>
                      ))}
                    </View>
                  </ScrollView>
                ) : (
                  <Text allowFontScaling style={[theme.typography.bodySmall, { color: theme.colors.textSecondary }]}>{customerProjectMessage('worker.portfolioUnavailable')}</Text>
                )}
              </View>

              <View style={{ gap: theme.spacing.md }}>
                <SectionHeader title="Reviews" />
                {snapshot.reviews.length > 0 ? snapshot.reviews.map((review) => (
                  <Surface key={review.reviewId} style={{ gap: theme.spacing.xs }}>
                    <Text accessibilityLabel={`${review.rating} out of 5`} allowFontScaling style={[theme.typography.label, { color: theme.colors.text }]}>{review.rating} / 5 · {review.serviceLabel}</Text>
                    {review.body ? <Text allowFontScaling style={[theme.typography.bodySmall, { color: theme.colors.textSecondary }]}>{review.body}</Text> : null}
                    <Text allowFontScaling style={[theme.typography.caption, { color: theme.colors.textSecondary }]}>{review.publishedAt}</Text>
                  </Surface>
                )) : <Text allowFontScaling style={[theme.typography.bodySmall, { color: theme.colors.textSecondary }]}>No published reviews are available.</Text>}
              </View>
            </>
          );
        }}
      </ProjectScreenState>
    </AppScaffold>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  profileHeader: { alignItems: 'flex-start', flexDirection: 'row', flexWrap: 'wrap' },
  heroAvatar: { height: 120, width: 120 },
  heroAvatarFallback: { alignItems: 'center', height: 120, justifyContent: 'center', width: 120 },
  splitRow: { alignItems: 'flex-start', flexDirection: 'row', flexWrap: 'wrap' },
  portfolioRow: { flexDirection: 'row' },
  portfolioCard: { width: 240 },
  portfolioImage: { height: 150, width: '100%' },
});

export default WorkerProfileScreen;
