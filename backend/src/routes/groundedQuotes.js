const express = require('express');
const db = require('../config/db');
const { authMiddleware, requireRole } = require('../middleware/auth');
const { problemResponse } = require('../lib/problemJson');
const {
  assertUuid,
  requireIdempotencyKey,
  fail,
} = require('../services/groundedQuotes/contracts');
const {
  catalogueService,
  requestProjection,
  quoteProjection,
} = require('../services/groundedQuotes/projections');
const store = require('../services/groundedQuotes/store');
const commands = require('../services/groundedQuotes/commands');

const catalogueRouter = express.Router();
const quoteRequestRouter = express.Router();
const quoteRouter = express.Router();
const REQUEST_STATES = new Set(['open', 'receiving', 'selected', 'expired', 'cancelled', 'no_quotes']);
const PRICING_MODES = new Set(['fixed_instant', 'hourly_estimated', 'remote_quote', 'diagnostic_visit']);

function sendCommand(res, result) {
  if (result.replayed) res.set('Idempotent-Replay', 'true');
  return res.status(result.status).json(result.body);
}

function requireMarketplaceRole(req, res, next) {
  if (!['customer', 'labourer'].includes(req.user?.role)) {
    return problemResponse(res, {
      type: 'auth_forbidden_role',
      title: 'Requires a customer or worker role',
      status: 403,
      instance: req.originalUrl,
    });
  }
  next();
}

catalogueRouter.get('/services', async (req, res, next) => {
  try {
    const categoryKey = req.query.category;
    const pricingMode = req.query.pricingMode;
    if (categoryKey != null && (typeof categoryKey !== 'string' || !/^[a-z0-9]+(?:_[a-z0-9]+)*$/.test(categoryKey))) {
      fail('catalogue_filter_invalid', 'category must be a canonical snake_case key', 400);
    }
    if (pricingMode != null && !PRICING_MODES.has(pricingMode)) {
      fail('catalogue_filter_invalid', 'pricingMode is not supported', 400);
    }
    const rows = await store.listCatalogueServices({ categoryKey, pricingMode });
    res.json({
      services: rows.map(catalogueService),
      meta: {
        count: rows.length,
        availability: 'not_included',
        locale: 'en-ZA',
        currency: 'ZAR',
      },
    });
  } catch (error) {
    next(error);
  }
});

catalogueRouter.get('/services/:id', async (req, res, next) => {
  try {
    const serviceId = assertUuid(req.params.id, 'service_id');
    let version = null;
    if (req.query.version != null) {
      version = Number(req.query.version);
      if (!Number.isSafeInteger(version) || version < 1) {
        fail('service_version_invalid', 'version must be a positive integer', 400);
      }
    }
    const row = await store.getCatalogueService(db, serviceId, version);
    if (!row) fail('catalogue_service_not_found', 'Published service version not found', 404);
    res.json({
      service: catalogueService(row),
      meta: { availability: 'not_included', locale: 'en-ZA', currency: 'ZAR' },
    });
  } catch (error) {
    next(error);
  }
});

quoteRequestRouter.use(authMiddleware, requireMarketplaceRole);

quoteRequestRouter.get('/', async (req, res, next) => {
  try {
    const status = req.query.status;
    if (status != null && !REQUEST_STATES.has(status)) {
      fail('quote_request_filter_invalid', 'status is not a quote-request state', 400);
    }
    const rows = await store.listRequestsForUser(req.user, status);
    res.json({
      quoteRequests: rows.map((row) => requestProjection(row, req.user.role === 'customer' ? 'customer' : 'labourer')),
      meta: { count: rows.length, role: req.user.role === 'labourer' ? 'worker' : 'customer' },
    });
  } catch (error) {
    next(error);
  }
});

quoteRequestRouter.post('/', requireRole('customer'), async (req, res, next) => {
  try {
    const result = await commands.createRequest({
      actor: req.user,
      key: requireIdempotencyKey(req),
      body: req.body || {},
    });
    sendCommand(res, result);
  } catch (error) {
    next(error);
  }
});

quoteRequestRouter.get('/:id', async (req, res, next) => {
  try {
    const requestId = assertUuid(req.params.id, 'quote_request_id');
    await store.expireStale(db, requestId);
    const row = await store.loadRequest(db, requestId);
    if (!row) fail('quote_request_not_found', 'Quote request not found', 404);
    if (req.user.role === 'customer' && row.customer_id !== req.user.id) {
      fail('quote_request_not_found', 'Quote request not found', 404);
    }
    if (req.user.role === 'labourer' && !(await store.canWorkerReadRequest(db, row, req.user.id))) {
      fail('quote_request_not_found', 'Quote request not found', 404);
    }
    const quotes = await store.listQuotes(db, requestId, req.user);
    const body = {
      quoteRequest: requestProjection(row, req.user.role === 'customer' ? 'customer' : 'labourer'),
    };
    if (req.user.role === 'customer') {
      body.quoteSummary = {
        received: quotes.filter((quote) => quote.submitted_at != null).length,
        currentlyAvailable: quotes.filter((quote) => quote.status === 'submitted').length,
      };
    } else {
      body.ownQuote = quotes[0] ? quoteProjection(quotes[0]) : null;
    }
    res.json(body);
  } catch (error) {
    next(error);
  }
});

quoteRequestRouter.get('/:id/quotes', async (req, res, next) => {
  try {
    const requestId = assertUuid(req.params.id, 'quote_request_id');
    await store.expireStale(db, requestId);
    const row = await store.loadRequest(db, requestId);
    if (!row) fail('quote_request_not_found', 'Quote request not found', 404);
    if (req.user.role === 'customer' && row.customer_id !== req.user.id) {
      fail('quote_request_not_found', 'Quote request not found', 404);
    }
    if (req.user.role === 'labourer' && !(await store.canWorkerReadRequest(db, row, req.user.id))) {
      fail('quote_request_not_found', 'Quote request not found', 404);
    }
    const rows = await store.listQuotes(db, requestId, req.user);
    res.json({
      quotes: rows.map((quote) => quoteProjection(quote, {
        includeWorkerEvidence: req.user.role === 'customer',
      })),
      meta: {
        count: rows.length,
        visibility: req.user.role === 'customer' ? 'submitted_offers' : 'own_quote_only',
      },
    });
  } catch (error) {
    next(error);
  }
});

quoteRequestRouter.post('/:id/quotes', requireRole('labourer'), async (req, res, next) => {
  try {
    const result = await commands.createQuote({
      actor: req.user,
      key: requireIdempotencyKey(req),
      requestId: req.params.id,
      body: req.body || {},
    });
    sendCommand(res, result);
  } catch (error) {
    next(error);
  }
});

quoteRequestRouter.post('/:id/cancel', requireRole('customer'), async (req, res, next) => {
  try {
    const result = await commands.cancelRequest({
      actor: req.user,
      key: requireIdempotencyKey(req),
      requestId: req.params.id,
      body: req.body || {},
    });
    sendCommand(res, result);
  } catch (error) {
    next(error);
  }
});

quoteRouter.use(authMiddleware, requireMarketplaceRole);

quoteRouter.get('/:id', async (req, res, next) => {
  try {
    const quoteId = assertUuid(req.params.id, 'quote_id');
    await store.expireStale();
    const quote = await store.loadQuote(db, quoteId);
    if (!quote) fail('quote_not_found', 'Quote not found', 404);
    const requestRow = await store.loadRequest(db, quote.quote_request_id);
    const customerMayRead = req.user.role === 'customer'
      && requestRow?.customer_id === req.user.id
      && quote.status !== 'draft';
    const workerMayRead = req.user.role === 'labourer' && quote.worker_id === req.user.id;
    if (!customerMayRead && !workerMayRead) fail('quote_not_found', 'Quote not found', 404);
    res.json({
      quote: quoteProjection(quote, { includeWorkerEvidence: customerMayRead }),
    });
  } catch (error) {
    next(error);
  }
});

quoteRouter.put('/:id', requireRole('labourer'), async (req, res, next) => {
  try {
    const result = await commands.editQuote({
      actor: req.user,
      key: requireIdempotencyKey(req),
      quoteId: req.params.id,
      body: req.body || {},
    });
    sendCommand(res, result);
  } catch (error) {
    next(error);
  }
});

quoteRouter.post('/:id/submit', requireRole('labourer'), async (req, res, next) => {
  try {
    const result = await commands.submitQuote({
      actor: req.user,
      key: requireIdempotencyKey(req),
      quoteId: req.params.id,
      body: req.body || {},
    });
    sendCommand(res, result);
  } catch (error) {
    next(error);
  }
});

quoteRouter.post('/:id/withdraw', requireRole('labourer'), async (req, res, next) => {
  try {
    const result = await commands.withdrawQuote({
      actor: req.user,
      key: requireIdempotencyKey(req),
      quoteId: req.params.id,
      body: req.body || {},
    });
    sendCommand(res, result);
  } catch (error) {
    next(error);
  }
});

quoteRouter.post('/:id/decline', requireRole('customer'), async (req, res, next) => {
  try {
    const result = await commands.declineQuote({
      actor: req.user,
      key: requireIdempotencyKey(req),
      quoteId: req.params.id,
      body: req.body || {},
    });
    sendCommand(res, result);
  } catch (error) {
    next(error);
  }
});

quoteRouter.post('/:id/accept', requireRole('customer'), async (req, res, next) => {
  try {
    const result = await commands.acceptQuote({
      actor: req.user,
      key: requireIdempotencyKey(req),
      quoteId: req.params.id,
      body: req.body || {},
    });
    sendCommand(res, result);
  } catch (error) {
    next(error);
  }
});

module.exports = { catalogueRouter, quoteRequestRouter, quoteRouter };
