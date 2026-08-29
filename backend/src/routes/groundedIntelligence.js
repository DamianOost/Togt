const express = require('express');
const { authMiddleware } = require('../middleware/auth');
const { ProblemError } = require('../lib/problemJson');
const {
  IntelligenceContractError,
  stableId,
} = require('../services/groundedIntelligence/contracts');
const { defaultServices } = require('../services/groundedIntelligence');

function toProblem(error) {
  if (!(error instanceof IntelligenceContractError)) return error;
  return new ProblemError({
    type: error.code,
    title: error.message,
    status: error.status,
    extensions: error.extensions,
  });
}

function createGroundedIntelligenceRouter({
  authenticate = authMiddleware,
  services = defaultServices(),
} = {}) {
  const router = express.Router();
  router.use(authenticate);

  router.post('/intent/extract', async (req, res, next) => {
    try {
      if (!['customer', 'labourer'].includes(req.user?.role)) {
        throw new ProblemError({
          type: 'auth_forbidden_role',
          title: 'Assisted intake requires a customer or Worker role',
          status: 403,
        });
      }
      const result = await services.assistedIntake.extract(req.body, { actorId: req.user.id });
      res.set('Cache-Control', 'no-store').status(200).json(result);
    } catch (error) {
      next(toProblem(error));
    }
  });

  router.get('/recommendations/quote-requests/:requestId/workers/:workerId/explanation', async (req, res, next) => {
    try {
      const requestId = stableId(req.params.requestId, 'quote_request_id', { uuid: true });
      const workerId = stableId(req.params.workerId, 'worker_id', { uuid: true });
      const recommendation = await services.recommendations.explanation(req.user, requestId, workerId);
      res.set('Cache-Control', 'private, no-store').json({ recommendation });
    } catch (error) {
      next(toProblem(error));
    }
  });

  router.get('/projects/:projectId/live-status', async (req, res, next) => {
    try {
      const projectId = stableId(req.params.projectId, 'project_id', { uuid: true });
      const liveStatus = await services.liveStatus.status(req.user, projectId);
      res.set('Cache-Control', 'private, no-store').set('ETag', `"${liveStatus.revision}"`).json({ liveStatus });
    } catch (error) {
      next(toProblem(error));
    }
  });

  return router;
}

const router = createGroundedIntelligenceRouter();
router.createGroundedIntelligenceRouter = createGroundedIntelligenceRouter;
router.toProblem = toProblem;

module.exports = router;
