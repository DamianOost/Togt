const { FEATURES } = require('../../config/capabilities');
const {
  LIVE_STATUS_SCHEMA_VERSION,
  assertPrivacySafeProjection,
  fail,
  stableId,
} = require('./contracts');

const LIVE_PHASES = Object.freeze({
  assigned: { phase: 'accepted', status: 'Worker accepted', actionLabel: 'View Project' },
  scheduled: { phase: 'accepted', status: 'Worker preparing', actionLabel: 'View Project' },
  en_route: { phase: 'en_route', status: 'Worker en route', actionLabel: 'View arrival' },
  arrived: { phase: 'arrived', status: 'Worker arrived', actionLabel: 'Review scope' },
  scope_confirmation: { phase: 'arrived', status: 'Scope confirmation needed', actionLabel: 'Review scope' },
  work_active: { phase: 'work_active', status: 'Work in progress', actionLabel: 'View Project' },
  completion_review: { phase: 'completion_review', status: 'Completion review needed', actionLabel: 'Review completion' },
  payment_pending: { phase: 'payment_pending', status: 'Payment action pending', actionLabel: 'View payment' },
});
const TERMINAL_STATUSES = new Set(['cancelled', 'terminated_after_start', 'refunded']);
const LIVE_IMMINENT_WINDOW_MS = 24 * 60 * 60 * 1000;

function safeServiceTitle(value) {
  if (typeof value !== 'string') return 'TOGT Project';
  const title = value.trim();
  if (!title || title.length > 80) return 'TOGT Project';
  if (/(?:\+27|0)\s*[6-8][\d\s()-]{8,13}\b|@|\b\d{13}\b|-?\d{1,2}\.\d{4,}\s*[,/]\s*-?\d{1,3}\.\d{4,}/i.test(title)) {
    return 'TOGT Project';
  }
  return title;
}

function createPrivacySafeLiveStatus(project, { now = Date.now() } = {}) {
  const projectId = stableId(project.id, 'project_id', { uuid: true });
  const revision = Number(project.lifecycle_revision || 0);
  if (!Number.isSafeInteger(revision) || revision < 0) fail('live_status_revision_invalid', 'Project revision is invalid', 500);
  const updatedAtValue = project.phase_updated_at || project.updated_at || project.created_at;
  const parsed = Date.parse(updatedAtValue);
  if (!Number.isFinite(parsed)) fail('live_status_updated_at_invalid', 'Project update time is invalid', 500);
  const updatedAt = new Date(parsed).toISOString();

  if (TERMINAL_STATUSES.has(project.status) || project.operational_phase === 'closed') {
    return assertPrivacySafeProjection(Object.freeze({
      schemaVersion: LIVE_STATUS_SCHEMA_VERSION,
      projectId,
      revision,
      state: 'ended',
      updatedAt,
    }));
  }

  const phase = LIVE_PHASES[project.operational_phase];
  if (['assigned', 'scheduled'].includes(project.operational_phase)) {
    const startsAt = Date.parse(project.scheduled_at);
    if (!Number.isFinite(startsAt) || startsAt - now > LIVE_IMMINENT_WINDOW_MS) {
      return assertPrivacySafeProjection(Object.freeze({
        schemaVersion: LIVE_STATUS_SCHEMA_VERSION,
        projectId,
        revision,
        state: 'not_eligible',
        updatedAt,
      }));
    }
  }
  if (!phase) {
    return assertPrivacySafeProjection(Object.freeze({
      schemaVersion: LIVE_STATUS_SCHEMA_VERSION,
      projectId,
      revision,
      state: 'not_eligible',
      updatedAt,
    }));
  }
  return assertPrivacySafeProjection(Object.freeze({
    schemaVersion: LIVE_STATUS_SCHEMA_VERSION,
    projectId,
    revision,
    state: 'active',
    phase: phase.phase,
    title: safeServiceTitle(project.catalogue_service_snapshot?.label || project.skill_needed),
    status: phase.status,
    actionLabel: phase.actionLabel,
    updatedAt,
  }));
}

function createLiveStatusService({
  capability = FEATURES.android_live_updates,
  projectSource,
} = {}) {
  return Object.freeze({
    async status(actor, projectId) {
      if (!['customer', 'labourer'].includes(actor?.role)) {
        fail('auth_forbidden_role', 'Live status requires a Project participant role', 403);
      }
      if (capability?.available !== true) {
        fail('capability_unavailable', 'Android live status is unavailable', 503, {
          capability: 'android_live_updates',
          reasonCode: capability?.reason_code || 'native_live_update_contract_not_proven',
          projectScreenFallbackAvailable: true,
        });
      }
      if (!projectSource || typeof projectSource.getProject !== 'function') {
        fail('live_status_source_unavailable', 'Live status Project source is unavailable', 503);
      }
      const project = await projectSource.getProject(actor, projectId);
      if (!project) fail('project_not_found', 'Project not found', 404);
      return createPrivacySafeLiveStatus(project);
    },
  });
}

module.exports = {
  LIVE_PHASES,
  TERMINAL_STATUSES,
  LIVE_IMMINENT_WINDOW_MS,
  safeServiceTitle,
  createPrivacySafeLiveStatus,
  createLiveStatusService,
};
