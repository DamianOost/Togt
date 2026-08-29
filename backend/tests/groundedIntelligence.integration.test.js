const express = require('express');
const supertest = require('supertest');
const intelligenceRoutes = require('../src/routes/groundedIntelligence');
const { problemHandler } = require('../src/lib/problemJson');
const { createAssistedIntakeService } = require('../src/services/groundedIntelligence/assistedIntake');
const { createRecommendationService } = require('../src/services/groundedIntelligence/recommendations');
const { createLiveStatusService } = require('../src/services/groundedIntelligence/liveStatus');

const CUSTOMER = Object.freeze({
  id: '22222222-2222-4222-8222-222222222222',
  role: 'customer',
});
const REQUEST_ID = '33333333-3333-4333-8333-333333333333';
const WORKER_ID = '44444444-4444-4444-8444-444444444444';
const PROJECT_ID = '55555555-5555-4555-8555-555555555555';

function testApp(services, actor = CUSTOMER) {
  const app = express();
  app.use(express.json());
  const authenticate = (req, res, next) => {
    req.user = actor;
    next();
  };
  app.use('/api', intelligenceRoutes.createGroundedIntelligenceRouter({ authenticate, services }));
  app.use(problemHandler);
  return app;
}

describe('Grounded Phase 4 HTTP contracts', () => {
  test('all default release capabilities fail closed with manual fallbacks and no request echo', async () => {
    const app = testApp(require('../src/services/groundedIntelligence').defaultServices());
    const sensitiveInput = 'Do work and call 082 123 4567';
    const assisted = await supertest(app).post('/api/intent/extract').send({
      schemaVersion: 1,
      typedText: sensitiveInput,
      voiceAssetId: null,
      photoAssetIds: [],
      processingConsent: true,
      consentPolicyVersion: 'ai-processing-v1',
    });
    expect(assisted.status).toBe(503);
    expect(assisted.type).toMatch(/application\/problem\+json/);
    expect(assisted.body.extensions).toMatchObject({
      capability: 'ai_assisted_intake',
      deterministicFallbackAvailable: true,
    });
    expect(JSON.stringify(assisted.body)).not.toContain(sensitiveInput);

    const recommendation = await supertest(app)
      .get(`/api/recommendations/quote-requests/${REQUEST_ID}/workers/${WORKER_ID}/explanation`);
    expect(recommendation.status).toBe(503);
    expect(recommendation.body.extensions).toMatchObject({
      capability: 'explainable_recommendations',
      manualComparisonAvailable: true,
    });

    const live = await supertest(app).get(`/api/projects/${PROJECT_ID}/live-status`);
    expect(live.status).toBe(503);
    expect(live.body.extensions).toMatchObject({
      capability: 'android_live_updates',
      projectScreenFallbackAvailable: true,
    });
  });

  test('enabled provider-neutral endpoint returns review-only structured output with no-store', async () => {
    const provider = {
      id: 'approved-eval-provider',
      approved: true,
      configured: true,
      adapterVersion: 1,
      extract: jest.fn(async () => ({
        schemaVersion: 1,
        modelVersion: 'model-v1',
        promptVersion: 'prompt-v1',
        fields: [{
          fieldId: 'problem_description',
          value: 'A kitchen tap is dripping',
          confidence: 0.9,
          sources: ['typed_text'],
          explanation: 'The user described a dripping kitchen tap',
        }],
        suggestedQuestions: [],
      })),
    };
    const assistedIntake = createAssistedIntakeService({
      capability: { available: true },
      provider,
      approvedConsentPolicyVersions: ['ai-processing-v1'],
    });
    const app = testApp({
      assistedIntake,
      recommendations: createRecommendationService({ capability: { available: false } }),
      liveStatus: createLiveStatusService({ capability: { available: false } }),
    });
    const res = await supertest(app).post('/api/intent/extract').send({
      schemaVersion: 1,
      typedText: 'My kitchen tap is dripping',
      voiceAssetId: null,
      photoAssetIds: [],
      processingConsent: true,
      consentPolicyVersion: 'ai-processing-v1',
    });
    expect(res.status).toBe(200);
    expect(res.headers['cache-control']).toBe('no-store');
    expect(res.body.assistance).toMatchObject({
      schemaVersion: 1,
      readyForDeterministicBrief: false,
      fields: [{ status: 'needs_review', editedByUser: false }],
    });
    expect(res.body.confirmation.finalWorkerSelectedByAI).toBe(false);
  });

  test('enabled recommendation and live endpoints use trusted sources and private no-store responses', async () => {
    const recommendations = createRecommendationService({
      capability: { available: true },
      source: {
        getEvidence: jest.fn(async () => ({
          workerId: WORKER_ID,
          sponsored: true,
          rankingVersion: 'rank-v1',
          evidence: [{
            code: 'credential_fit',
            activeOptIn: true,
            serviceLabel: 'Plumbing',
            evidenceAsOf: '2026-08-29T10:00:00Z',
          }],
        })),
      },
    });
    const liveStatus = createLiveStatusService({
      capability: { available: true },
      projectSource: {
        getProject: jest.fn(async () => ({
          id: PROJECT_ID,
          lifecycle_revision: 9,
          status: 'in_progress',
          operational_phase: 'work_active',
          skill_needed: 'Plumbing',
          address: '99 Never Expose Road',
          customer_phone: '0821234567',
          notes: 'Private access instructions',
          phase_updated_at: '2026-08-29T10:00:00Z',
        })),
      },
    });
    const app = testApp({
      assistedIntake: createAssistedIntakeService(),
      recommendations,
      liveStatus,
    });

    const recommendation = await supertest(app)
      .get(`/api/recommendations/quote-requests/${REQUEST_ID}/workers/${WORKER_ID}/explanation`);
    expect(recommendation.status).toBe(200);
    expect(recommendation.headers['cache-control']).toBe('private, no-store');
    expect(recommendation.body.recommendation.placement).toEqual({ sponsored: true, label: 'Sponsored' });

    const live = await supertest(app).get(`/api/projects/${PROJECT_ID}/live-status`);
    expect(live.status).toBe(200);
    expect(live.headers.etag).toBe('"9"');
    expect(live.headers['cache-control']).toBe('private, no-store');
    expect(live.body.liveStatus).toMatchObject({ state: 'active', phase: 'work_active', title: 'Plumbing' });
    expect(JSON.stringify(live.body)).not.toMatch(/Never Expose|0821234567|Private access/);
  });

  test('invalid identifiers fail before any source query', async () => {
    const source = { getEvidence: jest.fn() };
    const app = testApp({
      assistedIntake: createAssistedIntakeService(),
      recommendations: createRecommendationService({ capability: { available: true }, source }),
      liveStatus: createLiveStatusService({ capability: { available: false } }),
    });
    const res = await supertest(app)
      .get(`/api/recommendations/quote-requests/not-a-uuid/workers/${WORKER_ID}/explanation`);
    expect(res.status).toBe(400);
    expect(source.getEvidence).not.toHaveBeenCalled();
  });
});
