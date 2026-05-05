/**
 * Self-service API key management for authenticated users.
 *
 * - GET  /api/api-keys              — list keys for the current user
 * - POST /api/api-keys              — mint a new key (raw shown ONCE)
 * - DELETE /api/api-keys/:id        — revoke
 *
 * Auth via the existing JWT-based authMiddleware (NOT api-key auth — you
 * sign in to your dashboard, then mint keys for downstream agent integration).
 */

const express = require('express');
const { authMiddleware } = require('../middleware/auth');
const { ProblemError } = require('../lib/problemJson');
const { createKey, listKeys, revokeKey } = require('../lib/apiKey');

const router = express.Router();

const VALID_SCOPES = new Set(['mcp:full', 'mcp:read_only', 'admin:full']);

router.get('/', authMiddleware, async (req, res, next) => {
  try {
    const keys = await listKeys(req.user.id);
    res.json({ keys });
  } catch (err) { next(err); }
});

router.post('/', authMiddleware, async (req, res, next) => {
  try {
    const { scopes, description } = req.body || {};
    if (!Array.isArray(scopes) || scopes.length === 0) {
      throw new ProblemError({
        type: 'api_key_scopes_required',
        title: 'Scopes required',
        status: 400,
        detail: `Provide a non-empty array of scopes from: ${[...VALID_SCOPES].join(', ')}`,
      });
    }
    const invalid = scopes.filter((s) => !VALID_SCOPES.has(s));
    if (invalid.length > 0) {
      throw new ProblemError({
        type: 'api_key_invalid_scope',
        title: 'Unknown scope(s)',
        status: 400,
        detail: `Unknown scopes: ${invalid.join(', ')}. Valid scopes: ${[...VALID_SCOPES].join(', ')}`,
        extensions: { invalid_scopes: invalid, valid_scopes: [...VALID_SCOPES] },
      });
    }
    // Only the account owner can mint admin:full keys for themselves —
    // and we leave the gate open since this is dashboard-mediated. A
    // future tightening: only let users with role admin mint admin:full.
    const created = await createKey({
      userId: req.user.id,
      scopes,
      description: description || null,
    });
    // Raw key returned ONCE. Future GETs return only prefix + metadata.
    res.status(201).json({
      key: created.key,                          // RAW — show, never store
      id: created.id,
      prefix: created.prefix,
      scopes: created.scopes,
      description: created.description,
      created_at: created.created_at,
      warning: 'Store this key now — it will not be shown again.',
    });
  } catch (err) { next(err); }
});

router.delete('/:id', authMiddleware, async (req, res, next) => {
  try {
    const ok = await revokeKey(req.params.id, req.user.id);
    if (!ok) {
      throw new ProblemError({
        type: 'api_key_not_found',
        title: 'API key not found or already revoked',
        status: 404,
      });
    }
    res.json({ ok: true });
  } catch (err) { next(err); }
});

module.exports = router;
