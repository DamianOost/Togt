const express = require('express');
const db = require('../config/db');
const { authMiddleware } = require('../middleware/auth');
const { ProblemError } = require('../lib/problemJson');
const { serializeProject, SCHEMA } = require('../services/groundedProjects/privacy');
const { projectSegment } = require('../services/groundedProjects/state');
const { listProjects, getProject, getTimeline } = require('../services/groundedProjects/store');
const {
  requestCompletion,
  confirmCompletion,
  disputeCompletion,
} = require('../services/groundedProjects/commands');

const router = express.Router();
const SEGMENTS = new Set(['active', 'upcoming', 'past']);
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function fail(type, title, status, detail, extensions) {
  throw new ProblemError({ type, title, status, detail, extensions });
}

function parseExpectedRevision(req) {
  const header = req.header('if-match');
  if (!header) {
    fail(
      'project_revision_required',
      'If-Match is required',
      428,
      'Send the Project revision from the latest response in If-Match.'
    );
  }
  const unquoted = String(header).trim().replace(/^W\//, '').replace(/^"|"$/g, '');
  if (!/^\d+$/.test(unquoted) || !Number.isSafeInteger(Number(unquoted))) {
    fail(
      'project_revision_invalid',
      'If-Match revision is invalid',
      400,
      'If-Match must be a non-negative integer Project revision.'
    );
  }
  return Number(unquoted);
}

function parseIdempotencyKey(req) {
  const key = req.header('idempotency-key');
  if (!key || key.length < 8 || key.length > 255) {
    fail(
      'idempotency_key_required',
      'A valid Idempotency-Key is required',
      400,
      'Send an 8-255 character Idempotency-Key for this consequential transition.'
    );
  }
  return key;
}

function assertPlainObject(body) {
  if (body === null || Array.isArray(body) || typeof body !== 'object') {
    fail('project_command_body_invalid', 'Request body is invalid', 400, 'Send a JSON object.');
  }
}

function rejectUnknownFields(body, allowed) {
  const unknown = Object.keys(body).filter((key) => !allowed.includes(key));
  if (unknown.length > 0) {
    fail(
      'project_command_fields_invalid',
      'Request contains unsupported fields',
      422,
      'Canonical status and money are calculated by the server.',
      { unsupportedFields: unknown.sort() }
    );
  }
}

function commandContext(req, body) {
  return {
    actor: req.user,
    bookingId: req.params.id,
    idempotencyKey: parseIdempotencyKey(req),
    expectedRevision: parseExpectedRevision(req),
    body,
  };
}

function sendCommandResult(res, result) {
  if (result.replay) res.set('Idempotent-Replay', 'true');
  if (result.body?.project?.revision !== undefined) {
    res.set('ETag', `"${result.body.project.revision}"`);
  }
  return res.status(result.status).json(result.body);
}

router.param('id', (req, res, next, id) => {
  if (!UUID_RE.test(id)) {
    return next(new ProblemError({
      type: 'project_id_invalid',
      title: 'Project identifier is invalid',
      status: 400,
      detail: 'Project identifiers must be UUIDs.',
    }));
  }
  return next();
});

router.get('/', authMiddleware, async (req, res, next) => {
  try {
    const segment = req.query.segment;
    if (segment && !SEGMENTS.has(segment)) {
      fail(
        'project_segment_invalid',
        'Project segment is invalid',
        400,
        'segment must be active, upcoming or past.'
      );
    }
    const rows = await listProjects(db, req.user);
    const selected = segment ? rows.filter((row) => projectSegment(row) === segment) : rows;
    res.json({
      schema: SCHEMA,
      projects: selected.map((row) => serializeProject(row, req.user)),
      meta: { segment: segment || 'all', count: selected.length },
    });
  } catch (err) {
    next(err);
  }
});

router.get('/:id', authMiddleware, async (req, res, next) => {
  try {
    const project = await getProject(db, req.params.id, req.user);
    if (!project) {
      fail(
        'project_not_found',
        'Project not found',
        404,
        'No participant-visible Project exists for this identifier.'
      );
    }
    const events = await getTimeline(db, project.id);
    const body = serializeProject(project, req.user, { detail: true, events });
    res.set('ETag', `"${body.revision}"`).json({ project: body });
  } catch (err) {
    next(err);
  }
});

router.post('/:id/completion-requests', authMiddleware, async (req, res, next) => {
  try {
    const body = req.body === undefined ? {} : req.body;
    assertPlainObject(body);
    rejectUnknownFields(body, []);
    const result = await requestCompletion(commandContext(req, {}));
    sendCommandResult(res, result);
  } catch (err) {
    next(err);
  }
});

router.post('/:id/completion-confirmations', authMiddleware, async (req, res, next) => {
  try {
    const body = req.body === undefined ? {} : req.body;
    assertPlainObject(body);
    rejectUnknownFields(body, []);
    const result = await confirmCompletion(commandContext(req, {}));
    sendCommandResult(res, result);
  } catch (err) {
    next(err);
  }
});

router.post('/:id/disputes', authMiddleware, async (req, res, next) => {
  try {
    assertPlainObject(req.body);
    rejectUnknownFields(req.body, ['reason']);
    const reason = typeof req.body.reason === 'string' ? req.body.reason.trim() : '';
    if (reason.length < 3 || reason.length > 1000) {
      fail(
        'completion_dispute_reason_invalid',
        'A valid dispute reason is required',
        422,
        'reason must contain between 3 and 1000 characters.'
      );
    }
    const result = await disputeCompletion(commandContext(req, { reason }));
    sendCommandResult(res, result);
  } catch (err) {
    next(err);
  }
});

module.exports = router;
