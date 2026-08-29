const express = require('express');
const { authMiddleware } = require('../middleware/auth');
const { ProblemError, problemResponse } = require('../lib/problemJson');
const contracts = require('../services/groundedFulfilment/contracts');
const commands = require('../services/groundedFulfilment/commands');
const { getFulfilment } = require('../services/groundedFulfilment');

const router = express.Router();

function fail(type, title, status, detail, extensions) {
  throw new ProblemError({ type, title, status, detail, extensions });
}

function requireParticipantRole(req, res, next) {
  if (!['customer', 'labourer'].includes(req.user?.role)) {
    return problemResponse(res, {
      type: 'auth_forbidden_role',
      title: 'Requires a customer or Worker role',
      status: 403,
      instance: req.originalUrl,
    });
  }
  return next();
}

function parseExpectedRevision(req) {
  const header = req.header('if-match');
  if (header == null) {
    fail(
      'project_revision_required',
      'If-Match revision is required',
      428,
      'Send the revision from the latest fulfilment response.'
    );
  }
  const value = String(header).trim().replace(/^W\//, '').replace(/^"|"$/g, '');
  if (!/^\d+$/.test(value) || !Number.isSafeInteger(Number(value))) {
    fail(
      'project_revision_invalid',
      'If-Match revision is invalid',
      400,
      'If-Match must be a non-negative integer revision.'
    );
  }
  return Number(value);
}

function parseIdempotencyKey(req) {
  const key = req.header('idempotency-key');
  if (!key || !/^[\x21-\x7e]{8,255}$/.test(key)) {
    fail(
      'idempotency_key_required',
      'A valid Idempotency-Key is required',
      400,
      'Send an 8-255 character printable Idempotency-Key.'
    );
  }
  return key;
}

function context(req, body, extras = {}) {
  return {
    actor: req.user,
    bookingId: req.params.id.toLowerCase(),
    expectedRevision: parseExpectedRevision(req),
    idempotencyKey: parseIdempotencyKey(req),
    body,
    ...extras,
  };
}

function sendCommand(res, result) {
  if (result.replay) res.set('Idempotent-Replay', 'true');
  const revision = result.body?.fulfilment?.revision;
  if (revision != null) res.set('ETag', `"${revision}"`);
  if (result.problem) {
    return res.status(result.status).type('application/problem+json').json(result.body);
  }
  return res.status(result.status).json(result.body);
}

router.use(authMiddleware, requireParticipantRole);

router.param('id', (req, res, next, value) => {
  try {
    contracts.uuid(value, 'project_id');
    next();
  } catch (error) {
    next(error);
  }
});

router.param('proposalId', (req, res, next, value) => {
  try {
    contracts.uuid(value, 'reschedule_proposal_id');
    next();
  } catch (error) {
    next(error);
  }
});

router.param('changeOrderId', (req, res, next, value) => {
  try {
    contracts.uuid(value, 'change_order_id');
    next();
  } catch (error) {
    next(error);
  }
});

router.get('/:id/fulfilment', async (req, res, next) => {
  try {
    const fulfilment = await getFulfilment(req.params.id.toLowerCase(), req.user);
    res.set('ETag', `"${fulfilment.revision}"`).json({ fulfilment });
  } catch (error) {
    next(error);
  }
});

router.post('/:id/en-route', async (req, res, next) => {
  try {
    sendCommand(res, await commands.startRoute(context(req, contracts.emptyBody(req.body))));
  } catch (error) {
    next(error);
  }
});

router.post('/:id/arrivals', async (req, res, next) => {
  try {
    sendCommand(res, await commands.markArrived(context(req, contracts.normalizeArrival(req.body))));
  } catch (error) {
    next(error);
  }
});

router.post('/:id/scope-proposals', async (req, res, next) => {
  try {
    sendCommand(res, await commands.proposeScope(context(req, contracts.normalizeScopeProposal(req.body))));
  } catch (error) {
    next(error);
  }
});

router.post('/:id/scope-confirmations', async (req, res, next) => {
  try {
    sendCommand(res, await commands.decideScope(context(req, contracts.normalizeScopeDecision(req.body))));
  } catch (error) {
    next(error);
  }
});

router.post('/:id/start-pin-reveals', async (req, res, next) => {
  try {
    sendCommand(res, await commands.revealStartPin(context(req, contracts.emptyBody(req.body))));
  } catch (error) {
    next(error);
  }
});

router.post('/:id/start', async (req, res, next) => {
  try {
    sendCommand(res, await commands.startWork(context(req, contracts.normalizeStart(req.body))));
  } catch (error) {
    next(error);
  }
});

router.post('/:id/reschedule-proposals', async (req, res, next) => {
  try {
    sendCommand(res, await commands.proposeReschedule(context(req, contracts.normalizeReschedule(req.body))));
  } catch (error) {
    next(error);
  }
});

router.post('/:id/reschedule-proposals/:proposalId/accept', async (req, res, next) => {
  try {
    sendCommand(res, await commands.decideReschedule(
      context(req, contracts.emptyBody(req.body), { proposalId: req.params.proposalId.toLowerCase() }),
      'accept'
    ));
  } catch (error) {
    next(error);
  }
});

router.post('/:id/reschedule-proposals/:proposalId/decline', async (req, res, next) => {
  try {
    sendCommand(res, await commands.decideReschedule(
      context(req, contracts.emptyBody(req.body), { proposalId: req.params.proposalId.toLowerCase() }),
      'decline'
    ));
  } catch (error) {
    next(error);
  }
});

router.post('/:id/change-orders', async (req, res, next) => {
  try {
    sendCommand(res, await commands.proposeChangeOrder(context(req, contracts.normalizeChangeOrder(req.body))));
  } catch (error) {
    next(error);
  }
});

router.post('/:id/change-orders/:changeOrderId/approve', async (req, res, next) => {
  try {
    sendCommand(res, await commands.decideChangeOrder(
      context(req, contracts.emptyBody(req.body), { changeOrderId: req.params.changeOrderId.toLowerCase() }),
      'approve'
    ));
  } catch (error) {
    next(error);
  }
});

router.post('/:id/change-orders/:changeOrderId/decline', async (req, res, next) => {
  try {
    sendCommand(res, await commands.decideChangeOrder(
      context(req, contracts.emptyBody(req.body), { changeOrderId: req.params.changeOrderId.toLowerCase() }),
      'decline'
    ));
  } catch (error) {
    next(error);
  }
});

router.post('/:id/no-show-reports', async (req, res, next) => {
  try {
    sendCommand(res, await commands.reportNoShow(context(req, contracts.normalizeNoShow(req.body))));
  } catch (error) {
    next(error);
  }
});

router.post('/:id/replacement-requests', async (req, res, next) => {
  try {
    sendCommand(res, await commands.requestReplacement(context(req, contracts.emptyBody(req.body))));
  } catch (error) {
    next(error);
  }
});

module.exports = router;
