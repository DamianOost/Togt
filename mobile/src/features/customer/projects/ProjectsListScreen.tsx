import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useTogtTheme } from '../../../design';
import { AppScaffold, Button, Chip, EmptyState, SectionHeader, Surface, TopAppBar } from '../../../ui';
import { customerProjectMessage, segmentLabel } from './copy';
import { ProjectCard, ProjectScreenState } from './components';
import { createCustomerCommandIntent, groupProjects } from './model';
import type {
  CustomerCommandIntent,
  Loadable,
  ProjectListItem,
  ProjectSegment,
} from './model';

type ListCommand = 'cancel_project';

export type ProjectsListScreenProps = Readonly<{
  projects: Loadable<readonly ProjectListItem[]>;
  selectedSegment: ProjectSegment;
  actorId: string;
  commandKeys: Readonly<Record<ListCommand, string>>;
  onSelectSegment: (segment: ProjectSegment) => void;
  onOpenQuoteRequests: () => void;
  onRetry: () => void;
  onOpenProject: (projectId: string) => void;
  onCommand: (intent: CustomerCommandIntent) => void;
  onStartReschedule: (projectId: string) => void;
  onOpenReceipt: (projectId: string) => void;
  onOpenRating: (projectId: string) => void;
  onStartRebook: (projectId: string) => void;
  onOpenSupport: (projectId: string) => void;
}>;

const SEGMENTS: readonly ProjectSegment[] = ['active', 'upcoming', 'past'];
const EMPTY_COPY = {
  active: { title: 'projects.emptyActiveTitle', body: 'projects.emptyActiveBody' },
  upcoming: { title: 'projects.emptyUpcomingTitle', body: 'projects.emptyUpcomingBody' },
  past: { title: 'projects.emptyPastTitle', body: 'projects.emptyPastBody' },
} as const;

export function ProjectsListScreen({
  projects,
  selectedSegment,
  actorId,
  commandKeys,
  onSelectSegment,
  onOpenQuoteRequests,
  onRetry,
  onOpenProject,
  onCommand,
  onStartReschedule,
  onOpenReceipt,
  onOpenRating,
  onStartRebook,
  onOpenSupport,
}: ProjectsListScreenProps) {
  const theme = useTogtTheme();
  return (
    <AppScaffold
      contentContainerStyle={{ gap: theme.spacing.lg, paddingBottom: theme.spacing.xxxl }}
      scrollable
      testID="projects-list-screen"
      topBar={<TopAppBar title={customerProjectMessage('projects.title')} />}
    >
      <Surface
        accessibilityHint={customerProjectMessage('quoteRequests.entryBody')}
        accessibilityLabel={customerProjectMessage('quoteRequests.entryTitle')}
        elevation="card"
        onPress={onOpenQuoteRequests}
        testID="open-quote-requests-entry"
        variant="positive"
      >
        <View style={[styles.quoteEntry, { gap: theme.spacing.md }]}>
          <View style={[styles.quoteEntryIcon, { backgroundColor: theme.colors.actionPrimary, borderRadius: theme.radius.hero }]}>
            <MaterialCommunityIcons color={theme.colors.textInverse} name="clipboard-text-clock-outline" size={theme.sizing.iconMedium} />
          </View>
          <View style={styles.flex}>
            <Text accessibilityRole="header" allowFontScaling style={[theme.typography.h3, { color: theme.colors.text }]}>
              {customerProjectMessage('quoteRequests.entryTitle')}
            </Text>
            <Text allowFontScaling style={[theme.typography.bodySmall, { color: theme.colors.textSecondary, marginTop: theme.spacing.xxs }]}>
              {customerProjectMessage('quoteRequests.entryBody')}
            </Text>
          </View>
          <MaterialCommunityIcons color={theme.colors.actionPrimary} name="chevron-right" size={theme.sizing.iconMedium} />
        </View>
      </Surface>
      <ProjectScreenState
        emptyBody="Your active, upcoming and past work will appear here."
        emptyTitle="No Projects yet"
        errorBody={customerProjectMessage('error.projectsBody')}
        errorTitle={customerProjectMessage('error.projectsTitle')}
        loadingLabel={customerProjectMessage('loading.projects')}
        onRetry={onRetry}
        value={projects}
      >
        {(items, connectionState) => {
          const grouped = groupProjects(items);
          const selected = grouped[selectedSegment];
          const emit = (project: ProjectListItem, command: ListCommand) => {
            const result = createCustomerCommandIntent({
              actorId,
              command,
              connectionState,
              projectId: project.projectId,
              requestKey: commandKeys[command],
              stateVersion: project.stateVersion,
            });
            if (result.ok) onCommand(result.intent);
          };
          return (
            <>
              <View accessibilityLabel="Project filters" accessibilityRole="tablist" style={[styles.segmentRow, { gap: theme.spacing.xs }]}>
                {SEGMENTS.map((segment) => (
                  <Chip
                    accessibilityHint={`Shows ${segmentLabel(segment).toLowerCase()} Projects.`}
                    key={segment}
                    label={segmentLabel(segment)}
                    onPress={() => onSelectSegment(segment)}
                    selected={segment === selectedSegment}
                    style={styles.segmentChip}
                    testID={`project-segment-${segment}`}
                  />
                ))}
              </View>
              <SectionHeader
                subtitle={`${selected.length} ${selected.length === 1 ? 'Project' : 'Projects'}`}
                title={segmentLabel(selectedSegment)}
              />
              {selected.length === 0 ? (
                <EmptyState
                  body={customerProjectMessage(EMPTY_COPY[selectedSegment].body)}
                  title={customerProjectMessage(EMPTY_COPY[selectedSegment].title)}
                />
              ) : (
                <View style={{ gap: theme.spacing.md }}>
                  {selected.map((project) => (
                    <View key={project.projectId} style={{ gap: theme.spacing.sm }}>
                      <ProjectCard
                        onCancel={(item) => emit(item, 'cancel_project')}
                        onOpen={(item) => onOpenProject(item.projectId)}
                        onReschedule={(item) => onStartReschedule(item.projectId)}
                        project={{
                          ...project,
                          canCancel: project.canCancel && connectionState === 'online',
                          canReschedule: project.canReschedule && connectionState === 'online',
                        }}
                      />
                      {selectedSegment === 'past' ? (
                        <View style={[styles.actions, { gap: theme.spacing.sm }]}>
                          {project.hasReceipt ? <Button label={customerProjectMessage('projects.receipt')} onPress={() => onOpenReceipt(project.projectId)} variant="secondary" /> : null}
                          {project.canRate ? <Button label={customerProjectMessage('projects.rate')} onPress={() => onOpenRating(project.projectId)} variant="secondary" /> : null}
                          {project.canRebook ? <Button disabled={connectionState === 'offline'} label={customerProjectMessage('projects.rebook')} onPress={() => onStartRebook(project.projectId)} /> : null}
                          <Button label="Support" onPress={() => onOpenSupport(project.projectId)} variant="tertiary" />
                        </View>
                      ) : null}
                    </View>
                  ))}
                </View>
              )}
              {connectionState === 'offline' ? (
                <Text accessibilityRole="alert" allowFontScaling style={[theme.typography.bodySmall, { color: theme.colors.textSecondary }]}>
                  {customerProjectMessage('offline.body')}
                </Text>
              ) : null}
            </>
          );
        }}
      </ProjectScreenState>
    </AppScaffold>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  segmentRow: { flexDirection: 'row', flexWrap: 'wrap' },
  segmentChip: { flexGrow: 1 },
  actions: { alignItems: 'center', flexDirection: 'row', flexWrap: 'wrap' },
  quoteEntry: { alignItems: 'center', flexDirection: 'row' },
  quoteEntryIcon: { alignItems: 'center', height: 48, justifyContent: 'center', width: 48 },
});

export default ProjectsListScreen;
