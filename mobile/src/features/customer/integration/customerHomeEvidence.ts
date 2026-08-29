import { adaptProjectListItemV1 } from '../../../data/grounded/projects.ts';
import type { FavouriteDto } from '../../../services/groundedTrust';
import type { ActiveProjectSummary, RecentWorkerSummary } from '../intake/CustomerHomeScreen';
import type { ProjectListItem, ProjectSegment } from '../projects';

const PROJECT_SCHEMA = 'togt.project.v1' as const;

type JsonRecord = Record<string, unknown>;

export type CustomerHomeEvidenceResult<T> =
  | Readonly<{ ok: true; value: T }>
  | Readonly<{ ok: false; reasonCode: 'invalid_home_project_contract' | 'invalid_home_relationship_contract' }>;

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function failed<T>(reasonCode: Extract<CustomerHomeEvidenceResult<T>, { ok: false }>['reasonCode']): CustomerHomeEvidenceResult<T> {
  return Object.freeze({ ok: false, reasonCode });
}

/**
 * Adapts one canonical Project-list response and additionally verifies the
 * response schema and requested segment. The generic Project adapter remains
 * the only mapper for Project fields.
 */
export function adaptCustomerHomeProjectList(
  response: unknown,
  expectedSegment: Extract<ProjectSegment, 'active' | 'upcoming'>,
): CustomerHomeEvidenceResult<readonly ProjectListItem[]> {
  if (!isRecord(response) || response.schema !== PROJECT_SCHEMA || !Array.isArray(response.projects)) {
    return failed('invalid_home_project_contract');
  }

  const projects: ProjectListItem[] = [];
  for (const raw of response.projects) {
    if (!isRecord(raw) || raw.schema !== PROJECT_SCHEMA) {
      return failed('invalid_home_project_contract');
    }
    const adapted = adaptProjectListItemV1(raw);
    if (!adapted.ok || adapted.value.segment !== expectedSegment) {
      return failed('invalid_home_project_contract');
    }
    projects.push(adapted.value);
  }
  return Object.freeze({ ok: true, value: Object.freeze(projects) });
}

/** Resolve a favourite's source Project through the same strict Project DTO. */
export function adaptCustomerHomeSourceProject(
  response: unknown,
  expectedProjectId: string,
): CustomerHomeEvidenceResult<ProjectListItem> {
  if (!isRecord(response) || !isRecord(response.project) || response.project.schema !== PROJECT_SCHEMA) {
    return failed('invalid_home_project_contract');
  }
  const adapted = adaptProjectListItemV1(response.project);
  if (!adapted.ok
      || adapted.value.projectId !== expectedProjectId.toLowerCase()
      || adapted.value.segment !== 'past') {
    return failed('invalid_home_project_contract');
  }
  return Object.freeze({ ok: true, value: adapted.value });
}

export function selectCustomerHomeProject(
  active: readonly ProjectListItem[],
  upcoming: readonly ProjectListItem[],
): ActiveProjectSummary | null {
  const project = active.find((candidate) => candidate.segment === 'active')
    ?? upcoming.find((candidate) => candidate.segment === 'upcoming')
    ?? null;
  if (!project) return null;
  return Object.freeze({
    projectId: project.projectId,
    title: project.serviceLabel,
    statusLabel: project.operationalLabel,
    areaLabel: project.areaLabel,
    workerName: project.workerName,
    workerPhotoUrl: project.workerPhotoUrl,
  });
}

/**
 * A recent-Worker row is valid only when every active favourite is backed by
 * its own participant-visible, completed Project. The service label comes
 * exclusively from that canonical Project snapshot.
 */
export function buildRecentWorkerSummaries(
  favourites: readonly FavouriteDto[],
  sourceProjects: readonly ProjectListItem[],
): CustomerHomeEvidenceResult<readonly RecentWorkerSummary[]> {
  if (favourites.length !== sourceProjects.length) {
    return failed('invalid_home_relationship_contract');
  }

  const projectsById = new Map(sourceProjects.map((project) => [project.projectId, project]));
  const seenWorkers = new Set<string>();
  const recentWorkers: RecentWorkerSummary[] = [];

  for (const favourite of favourites) {
    const sourceProject = projectsById.get(favourite.sourceProjectReference);
    if (favourite.status !== 'active'
        || seenWorkers.has(favourite.worker.id)
        || !sourceProject
        || sourceProject.segment !== 'past'
        || sourceProject.workerId !== favourite.worker.id
        || !sourceProject.serviceId
        || !sourceProject.serviceVersion) {
      return failed('invalid_home_relationship_contract');
    }
    seenWorkers.add(favourite.worker.id);
    recentWorkers.push(Object.freeze({
      workerId: favourite.worker.id,
      displayName: favourite.worker.displayName,
      serviceId: sourceProject.serviceId,
      serviceVersion: sourceProject.serviceVersion,
      serviceLabel: sourceProject.serviceLabel,
      photoUrl: sourceProject.workerPhotoUrl,
    }));
  }

  return Object.freeze({ ok: true, value: Object.freeze(recentWorkers) });
}
