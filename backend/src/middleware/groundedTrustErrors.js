const { problemResponse } = require('../lib/problemJson');

// Database triggers are the final enforcement boundary for legacy and future
// routes. Convert their deliberately stable error messages into safe API
// problems instead of leaking SQL details or returning an opaque 500.
function groundedTrustErrorHandler(err, req, res, next) {
  if (err?.code === '42501' && err.message === 'grounded_relationship_block_active') {
    return problemResponse(res, {
      type: 'relationship_block_active',
      title: 'This relationship is blocked',
      status: 409,
      detail: 'Future matching, booking creation and new contact are unavailable for this pair.',
      extensions: {
        futureMatchingAllowed: false,
        newContactAllowed: false,
      },
      instance: req.originalUrl,
    });
  }
  if (err?.code === '23514' && err.message === 'grounded_open_safety_incident') {
    return problemResponse(res, {
      type: 'completion_open_safety_incident',
      title: 'Completion is blocked by an open safety incident',
      status: 409,
      detail: 'The safety record must reach a supported resolved state before fulfilment can close.',
      instance: req.originalUrl,
    });
  }
  if (err?.code === '23514' && err.message === 'grounded_incident_transition_invalid') {
    return problemResponse(res, {
      type: 'safety_incident_transition_invalid',
      title: 'Safety incident transition is invalid',
      status: 409,
      detail: 'Refresh the incident and follow its canonical state progression.',
      instance: req.originalUrl,
    });
  }
  return next(err);
}

module.exports = { groundedTrustErrorHandler };
