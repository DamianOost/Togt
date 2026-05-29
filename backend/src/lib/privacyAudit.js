const { recordAuditFireAndForget } = require('../services/auditLog');
const { redactForAudit } = require('./privacy');

function actorFromRequest(req) {
  if (req?.apiKey?.id) return { type: 'api_key', apiKeyId: req.apiKey.id };
  if (req?.user?.id) return { type: 'user', userId: req.user.id };
  return { type: 'system' };
}

function recordPrivacyAudit(req, { action, resource, metadata = {}, statusCode, errorCode }) {
  if (process.env.NODE_ENV === 'test') return;

  recordAuditFireAndForget({
    actor: actorFromRequest(req),
    action,
    resource,
    requestId: req?.headers?.['x-request-id'] || null,
    ip: req?.ip || null,
    statusCode: statusCode || null,
    metadata: redactForAudit(metadata),
    errorCode,
  });
}

module.exports = {
  actorFromRequest,
  recordPrivacyAudit,
};
