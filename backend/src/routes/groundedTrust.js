const express = require('express');
const db = require('../config/db');
const { authMiddleware, requireRole } = require('../middleware/auth');
const {
  SCHEMA,
  fail,
  assertPlainObject,
  rejectUnknownFields,
  assertUuid,
  requireIdempotencyKey,
  requireExpectedRevision,
} = require('../services/groundedTrust/contracts');
const {
  createFavourite,
  removeFavourite,
  blockRelationship,
  createRebookDraft,
  updateRebookDraft,
  getRelationshipEligibility,
} = require('../services/groundedTrust/relationships');
const {
  createIncident,
  getIncidentForReporter,
  listIncidentsForReporter,
  rejectOperationsTransition,
} = require('../services/groundedTrust/safety');
const { createSeries, updateSeries } = require('../services/groundedTrust/recurrence');
const { getFairnessEvidence } = require('../services/groundedTrust/fairness');
const {
  listFavouriteRows,
  getRebookDraft,
  listRebookDrafts,
  getSeriesBundle,
  listSeriesBundles,
} = require('../services/groundedTrust/store');
const {
  serializeFavourite,
  serializeRebookDraft,
  serializeSeries,
} = require('../services/groundedTrust/privacy');

const router = express.Router();
const BLOCK_REASONS = new Set([
  'safety_concern',
  'harassment',
  'inappropriate_contact',
  'work_dispute',
  'do_not_match',
  'other',
]);
const INCIDENT_CATEGORIES = new Set([
  'immediate_danger',
  'injury',
  'harassment',
  'unsafe_work',
  'property_damage',
  'payment_or_work',
  'account_help',
  'other',
]);

router.get('/trust/fairness', authMiddleware, async (req, res, next) => {
  try {
    res.json(await getFairnessEvidence(db, req.user));
  } catch (err) { next(err); }
});

function commandContext(req, {
  commandType,
  resourceId,
  body,
  expectedRevision,
}) {
  return {
    actor: req.user,
    commandType,
    resourceId,
    body,
    expectedRevision,
    idempotencyKey: requireIdempotencyKey(req),
  };
}

function sendCommand(res, result) {
  if (result.replay) res.set('Idempotent-Replay', 'true');
  const revision = result.body?.recurringSeries?.revision
    ?? result.body?.rebookDraft?.revision
    ?? result.body?.favourite?.revision
    ?? result.body?.incident?.revision;
  if (revision !== undefined) res.set('ETag', `"${revision}"`);
  return res.status(result.status).json(result.body);
}

function validateCategory(value) {
  if (!INCIDENT_CATEGORIES.has(value)) {
    fail(
      'incident_category_invalid',
      'Incident category is invalid',
      422,
      `Choose one of: ${[...INCIDENT_CATEGORIES].join(', ')}.`
    );
  }
  return value;
}

function parseIncidentBody(req, kind) {
  assertPlainObject(req.body);
  rejectUnknownFields(req.body, ['bookingId', 'category', 'summary', 'requestedChannel']);
  if (req.body.bookingId !== undefined && req.body.bookingId !== null) {
    assertUuid(req.body.bookingId, 'bookingId');
  }
  return {
    kind,
    bookingId: req.body.bookingId || null,
    category: validateCategory(req.body.category),
    summary: req.body.summary,
    requestedChannel: req.body.requestedChannel,
  };
}

router.post('/safety/incidents', authMiddleware, async (req, res, next) => {
  try {
    const body = parseIncidentBody(req, 'safety');
    sendCommand(res, await createIncident(commandContext(req, {
      commandType: 'create_safety_case',
      body,
    })));
  } catch (err) { next(err); }
});

router.get('/safety/incidents', authMiddleware, async (req, res, next) => {
  try {
    const incidents = await listIncidentsForReporter(db, req.user, 'safety');
    res.json({ schema: SCHEMA, incidents, meta: { count: incidents.length } });
  } catch (err) { next(err); }
});

router.get('/safety/incidents/:id', authMiddleware, async (req, res, next) => {
  try {
    assertUuid(req.params.id, 'incidentId');
    res.json({ incident: await getIncidentForReporter(db, req.params.id, req.user, 'safety') });
  } catch (err) { next(err); }
});

router.post('/support/cases', authMiddleware, async (req, res, next) => {
  try {
    const body = parseIncidentBody(req, 'support');
    sendCommand(res, await createIncident(commandContext(req, {
      commandType: 'create_support_case',
      body,
    })));
  } catch (err) { next(err); }
});

router.get('/support/cases', authMiddleware, async (req, res, next) => {
  try {
    const cases = await listIncidentsForReporter(db, req.user, 'support');
    res.json({ schema: SCHEMA, cases, meta: { count: cases.length } });
  } catch (err) { next(err); }
});

router.get('/support/cases/:id', authMiddleware, async (req, res, next) => {
  try {
    assertUuid(req.params.id, 'caseId');
    res.json({ case: await getIncidentForReporter(db, req.params.id, req.user, 'support') });
  } catch (err) { next(err); }
});

for (const action of ['acknowledge', 'escalate', 'resolve']) {
  router.post(`/operations/safety-incidents/:id/${action}`, authMiddleware, (req, res, next) => {
    try {
      assertUuid(req.params.id, 'incidentId');
      rejectOperationsTransition(action);
    } catch (err) { next(err); }
  });
}

router.get('/favourites', authMiddleware, requireRole('customer'), async (req, res, next) => {
  try {
    const rows = await listFavouriteRows(db, req.user.id);
    res.json({ schema: SCHEMA, favourites: rows.map(serializeFavourite), meta: { count: rows.length } });
  } catch (err) { next(err); }
});

router.post('/favourites', authMiddleware, requireRole('customer'), async (req, res, next) => {
  try {
    assertPlainObject(req.body);
    rejectUnknownFields(req.body, ['workerId', 'sourceBookingId']);
    const body = {
      workerId: assertUuid(req.body.workerId, 'workerId'),
      sourceBookingId: assertUuid(req.body.sourceBookingId, 'sourceBookingId'),
    };
    sendCommand(res, await createFavourite(commandContext(req, {
      commandType: 'create_favourite',
      body,
    })));
  } catch (err) { next(err); }
});

router.delete('/favourites/:workerId', authMiddleware, requireRole('customer'), async (req, res, next) => {
  try {
    const workerId = assertUuid(req.params.workerId, 'workerId');
    sendCommand(res, await removeFavourite(commandContext(req, {
      commandType: 'remove_favourite',
      resourceId: workerId,
      body: {},
    })));
  } catch (err) { next(err); }
});

router.post('/blocks', authMiddleware, async (req, res, next) => {
  try {
    assertPlainObject(req.body);
    rejectUnknownFields(req.body, ['blockedUserId', 'sourceBookingId', 'reasonCode']);
    if (!BLOCK_REASONS.has(req.body.reasonCode)) {
      fail('relationship_block_reason_invalid', 'Block reason is invalid', 422);
    }
    const body = {
      blockedUserId: assertUuid(req.body.blockedUserId, 'blockedUserId'),
      sourceBookingId: assertUuid(req.body.sourceBookingId, 'sourceBookingId'),
      reasonCode: req.body.reasonCode,
    };
    sendCommand(res, await blockRelationship(commandContext(req, {
      commandType: 'block_relationship',
      body,
    })));
  } catch (err) { next(err); }
});

router.post('/bookings/:id/rebook-drafts', authMiddleware, requireRole('customer'), async (req, res, next) => {
  try {
    assertUuid(req.params.id, 'bookingId');
    const bodyValue = req.body === undefined ? {} : req.body;
    assertPlainObject(bodyValue);
    rejectUnknownFields(bodyValue, []);
    sendCommand(res, await createRebookDraft(commandContext(req, {
      commandType: 'create_rebook_draft',
      body: { sourceBookingId: req.params.id },
    })));
  } catch (err) { next(err); }
});

router.get('/bookings/:id/relationship-eligibility', authMiddleware, async (req, res, next) => {
  try {
    const bookingId = assertUuid(req.params.id, 'bookingId');
    res.json({ relationship: await getRelationshipEligibility(db, bookingId, req.user) });
  } catch (err) { next(err); }
});

router.get('/rebook-drafts', authMiddleware, requireRole('customer'), async (req, res, next) => {
  try {
    const rows = await listRebookDrafts(db, req.user.id);
    res.json({ schema: SCHEMA, rebookDrafts: rows.map(serializeRebookDraft), meta: { count: rows.length } });
  } catch (err) { next(err); }
});

router.get('/rebook-drafts/:id', authMiddleware, requireRole('customer'), async (req, res, next) => {
  try {
    assertUuid(req.params.id, 'rebookDraftId');
    const row = await getRebookDraft(db, req.params.id, req.user.id);
    if (!row) fail('rebook_draft_not_found', 'Rebook draft not found', 404);
    const draft = serializeRebookDraft(row);
    res.set('ETag', `"${draft.revision}"`).json({ rebookDraft: draft });
  } catch (err) { next(err); }
});

router.patch('/rebook-drafts/:id', authMiddleware, requireRole('customer'), async (req, res, next) => {
  try {
    const draftId = assertUuid(req.params.id, 'rebookDraftId');
    assertPlainObject(req.body);
    rejectUnknownFields(req.body, ['editableScope', 'broadAreaLabel', 'requestedStartsAt']);
    sendCommand(res, await updateRebookDraft(commandContext(req, {
      commandType: 'update_rebook_draft',
      resourceId: draftId,
      body: req.body,
      expectedRevision: requireExpectedRevision(req),
    })));
  } catch (err) { next(err); }
});

router.post('/recurring-series', authMiddleware, requireRole('customer'), async (req, res, next) => {
  try {
    assertPlainObject(req.body);
    rejectUnknownFields(req.body, ['sourceBookingId', 'schedule', 'substitutionPolicy']);
    const body = {
      sourceBookingId: assertUuid(req.body.sourceBookingId, 'sourceBookingId'),
      schedule: req.body.schedule,
      substitutionPolicy: req.body.substitutionPolicy,
    };
    sendCommand(res, await createSeries(commandContext(req, {
      commandType: 'create_recurring_series',
      body,
    })));
  } catch (err) { next(err); }
});

router.get('/recurring-series', authMiddleware, async (req, res, next) => {
  try {
    const bundles = await listSeriesBundles(db, req.user);
    const series = bundles.map(serializeSeries);
    res.json({ schema: SCHEMA, recurringSeries: series, meta: { count: series.length } });
  } catch (err) { next(err); }
});

router.get('/recurring-series/:id', authMiddleware, async (req, res, next) => {
  try {
    assertUuid(req.params.id, 'recurringSeriesId');
    const bundle = await getSeriesBundle(db, req.params.id, req.user);
    if (!bundle) fail('recurring_series_not_found', 'Recurring series not found', 404);
    const series = serializeSeries(bundle);
    res.set('ETag', `"${series.revision}"`).json({ recurringSeries: series });
  } catch (err) { next(err); }
});

function parseSeriesActionBody(body) {
  assertPlainObject(body);
  const action = body.action;
  const noPayloadActions = new Set([
    'accept_terms',
    'pause',
    'request_resume',
    'accept_resume',
    'request_cancel_series',
    'accept_cancel_series',
  ]);
  if (noPayloadActions.has(action)) {
    rejectUnknownFields(body, ['action']);
  } else if (action === 'propose_terms') {
    rejectUnknownFields(body, ['action', 'schedule', 'substitutionPolicy']);
  } else if (action === 'request_occurrence_change') {
    rejectUnknownFields(body, ['action', 'occurrenceId', 'changeKind', 'proposedScheduledAt']);
    assertUuid(body.occurrenceId, 'occurrenceId');
  } else if (['accept_occurrence_change', 'decline_occurrence_change'].includes(action)) {
    rejectUnknownFields(body, ['action', 'changeRequestId']);
    assertUuid(body.changeRequestId, 'changeRequestId');
  } else {
    fail('recurring_action_unsupported', 'Recurring series action is unsupported', 422);
  }
  return body;
}

router.patch('/recurring-series/:id', authMiddleware, async (req, res, next) => {
  try {
    const seriesId = assertUuid(req.params.id, 'recurringSeriesId');
    const body = parseSeriesActionBody(req.body);
    sendCommand(res, await updateSeries(commandContext(req, {
      commandType: `recurring_series_${body.action}`,
      resourceId: seriesId,
      body,
      expectedRevision: requireExpectedRevision(req),
    })));
  } catch (err) { next(err); }
});

module.exports = router;
