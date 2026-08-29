const db = require('../../config/db');
const { fail } = require('./contracts');
const { RANKING_VERSION } = require('./recommendations');
const { getProject } = require('../groundedProjects/store');

async function getRecommendationEvidence(actor, requestId, workerId, queryable = db) {
  if (actor.role !== 'customer') {
    fail('auth_forbidden_role', 'Recommendation explanations are customer-only', 403);
  }
  const result = await queryable.query(
    `SELECT qr.customer_id,
            sc.label_en_za AS service_label,
            o.status AS opt_in_status,
            o.opted_in_at,
            q.status AS quote_status,
            q.updated_at AS quote_updated_at,
            v.valid_until AS quote_valid_until,
            COALESCE((
              SELECT COUNT(*)
                FROM bookings completed
                JOIN grounded_project_completions completion_evidence
                  ON completion_evidence.booking_id = completed.id
                 AND completion_evidence.status = 'confirmed'
               WHERE completed.labourer_id = q.worker_id
                 AND completed.status = 'completed'
            ), 0) AS completed_project_count,
            COALESCE((
              SELECT COUNT(*)
                FROM bookings prior
                JOIN grounded_project_completions prior_evidence
                  ON prior_evidence.booking_id = prior.id
                 AND prior_evidence.status = 'confirmed'
               WHERE prior.labourer_id = q.worker_id
                 AND prior.customer_id = qr.customer_id
                 AND prior.status = 'completed'
            ), 0) AS prior_completed_project_count
       FROM grounded_quote_requests qr
       JOIN grounded_quotes q
         ON q.quote_request_id = qr.id AND q.worker_id = $3
       JOIN grounded_quote_versions v
         ON v.quote_id = q.id AND v.version = q.current_version
       JOIN service_catalogue_versions sc
         ON sc.service_id = qr.service_id AND sc.service_version = qr.service_version
       LEFT JOIN catalogue_worker_opt_ins o
         ON o.worker_id = q.worker_id
        AND o.service_id = qr.service_id
        AND o.service_version = qr.service_version
      WHERE qr.id = $1 AND qr.customer_id = $2`,
    [requestId, actor.id, workerId]
  );
  const row = result.rows[0];
  if (!row) return null;
  const quoteEvidenceAt = new Date(row.quote_updated_at).toISOString();
  const evidence = [];
  if (row.opt_in_status === 'active') {
    evidence.push({
      code: 'credential_fit',
      activeOptIn: true,
      serviceLabel: row.service_label,
      evidenceAsOf: new Date(row.opted_in_at).toISOString(),
    });
  }
  const completedCount = Number(row.completed_project_count);
  if (completedCount > 0) {
    evidence.push({
      code: 'reliability_evidence',
      completedProjectCount: completedCount,
      evidenceAsOf: quoteEvidenceAt,
    });
  }
  if (['submitted', 'accepted'].includes(row.quote_status)
      && Date.parse(row.quote_valid_until) > Date.now()) {
    evidence.push({
      code: 'price_compatibility',
      validQuote: true,
      evidenceAsOf: quoteEvidenceAt,
    });
  }
  const priorCount = Number(row.prior_completed_project_count);
  if (priorCount > 0) {
    evidence.push({
      code: 'past_customer_relationship',
      priorCompletedProjectCount: priorCount,
      evidenceAsOf: quoteEvidenceAt,
    });
  }
  if (!evidence.length) return null;
  return {
    workerId,
    rankingVersion: RANKING_VERSION,
    sponsored: false,
    evidence,
  };
}

const recommendationSource = Object.freeze({
  getEvidence: (actor, requestId, workerId) => getRecommendationEvidence(actor, requestId, workerId),
});

const projectSource = Object.freeze({
  getProject: (actor, projectId) => getProject(db, projectId, actor),
});

module.exports = {
  getRecommendationEvidence,
  recommendationSource,
  projectSource,
};
