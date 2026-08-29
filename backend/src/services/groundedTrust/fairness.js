const { SCHEMA } = require('./contracts');

function iso(value, fallback) {
  const parsed = value ? new Date(value) : fallback;
  return parsed.toISOString();
}

function count(value) {
  const parsed = Number(value || 0);
  return Number.isSafeInteger(parsed) && parsed >= 0 ? parsed : 0;
}

function ratingLabel(average, sampleSize) {
  if (sampleSize === 0 || average === null || average === undefined) return 'No ratings received';
  return `${Number(average).toFixed(2)} / 5`;
}

/**
 * Build a two-sided, evidence-only trust projection for the authenticated
 * participant. This deliberately does not calculate a composite score or
 * infer an account restriction: TOGT has no operated restriction engine in
 * this release, so claiming one would be misleading.
 */
async function getFairnessEvidence(queryable, actor) {
  const generatedAt = new Date();
  const participant = await queryable.query(
    `SELECT
       COUNT(*)::int AS project_count,
       COUNT(*) FILTER (WHERE status = 'completed')::int AS completed_count,
       COUNT(*) FILTER (WHERE status = 'cancelled' AND cancelled_by = $1)::int AS cancelled_by_actor_count,
       MAX(COALESCE(completed_at, phase_updated_at, created_at)) AS observed_at
     FROM bookings
     WHERE customer_id = $1 OR labourer_id = $1`,
    [actor.id]
  );
  const ratings = await queryable.query(
    `SELECT
       COUNT(*)::int AS rating_count,
       ROUND(AVG(score)::numeric, 2) AS rating_average,
       MAX(created_at) AS observed_at
     FROM ratings
     WHERE reviewee_id = $1
       AND (publication_status = 'published' OR publish_after <= NOW())`,
    [actor.id]
  );
  const noShows = await queryable.query(
    `SELECT
       COUNT(*)::int AS allegation_count,
       COUNT(*) FILTER (WHERE status IN ('received', 'replacement_requested'))::int AS unresolved_count,
       MAX(reported_at) AS observed_at
     FROM grounded_no_show_reports
     WHERE absent_role = $2
       AND booking_id IN (
         SELECT id FROM bookings WHERE customer_id = $1 OR labourer_id = $1
       )`,
    [actor.id, actor.role]
  );

  const project = participant.rows[0] || {};
  const rating = ratings.rows[0] || {};
  const noShow = noShows.rows[0] || {};
  const projectCount = count(project.project_count);
  const ratingCount = count(rating.rating_count);
  const cancellationCount = count(project.cancelled_by_actor_count);
  const noShowCount = count(noShow.allegation_count);
  const unresolvedNoShowCount = count(noShow.unresolved_count);

  const evidence = Object.freeze([
    Object.freeze({
      id: 'completed-projects',
      label: 'Completed Projects',
      valueLabel: String(count(project.completed_count)),
      explanation: 'Counts canonical Projects in which you participated and whose lifecycle status is completed.',
      sourceLabel: 'Canonical Project lifecycle',
      sampleSize: projectCount,
      observedAt: iso(project.observed_at, generatedAt),
    }),
    Object.freeze({
      id: 'participant-ratings',
      label: 'Participant ratings',
      valueLabel: ratingLabel(rating.rating_average, ratingCount),
      explanation: ratingCount === 0
        ? 'No completed-Project participant has submitted a rating about you.'
        : 'The arithmetic mean of ratings submitted about you after completed Projects; it is not combined with reliability evidence.',
      sourceLabel: 'Completed-Project participant ratings',
      sampleSize: ratingCount,
      observedAt: iso(rating.observed_at, generatedAt),
    }),
    Object.freeze({
      id: 'actor-cancellations',
      label: 'Projects cancelled by you',
      valueLabel: String(cancellationCount),
      explanation: 'Counts canonical cancelled Projects only when the lifecycle record names you as the cancelling participant.',
      sourceLabel: 'Canonical Project cancellation records',
      sampleSize: projectCount,
      observedAt: iso(project.observed_at, generatedAt),
    }),
    Object.freeze({
      id: 'no-show-records',
      label: 'No-show records naming your role',
      valueLabel: String(noShowCount),
      explanation: `${unresolvedNoShowCount} record(s) are currently received or replacement-requested. A record is evidence, not an automatic finding.`,
      sourceLabel: 'Participant-submitted no-show records',
      sampleSize: noShowCount,
      observedAt: iso(noShow.observed_at, generatedAt),
    }),
  ]);

  return Object.freeze({
    schema: SCHEMA,
    generatedAt: generatedAt.toISOString(),
    fairness: Object.freeze({
      title: actor.role === 'labourer' ? 'Your Worker evidence' : 'Your customer evidence',
      summary: 'Ratings and reliability facts are shown separately. TOGT does not collapse them into an opaque trust score.',
      evidence,
      restriction: Object.freeze({
        status: 'none',
        reasonCode: null,
        reasonLabel: 'This release has no automated trust-restriction engine, so this evidence view applies no automated restriction.',
        evidence: Object.freeze([]),
        recoverySteps: Object.freeze([]),
        humanReview: Object.freeze({
          available: true,
          channel: 'in_app_record',
          actionLabel: 'Create a private review request',
        }),
      }),
    }),
  });
}

module.exports = { getFairnessEvidence };
