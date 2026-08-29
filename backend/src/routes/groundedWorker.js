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
  boundedText,
  optionalWholeNumber,
  assertPolicyVersion,
  assertCurrentPolicyVersion,
  assertAcknowledgementKind,
} = require('../services/groundedWorker/contracts');
const {
  loadWorkerProfile,
  listWorkerOfferings,
  loadWorkerOffering,
  listAcknowledgements,
} = require('../services/groundedWorker/store');
const {
  serializeOffering,
  serializeServicesProfile,
  serializeActivation,
} = require('../services/groundedWorker/projections');
const {
  savePublicProfile,
  createOffering,
  updateOffering,
  acknowledgeActivationItem,
  saveEmergencyContact,
} = require('../services/groundedWorker/commands');
const {
  OFFER_SCHEMA,
  listWorkerOffers,
  getWorkerOffer,
} = require('../services/groundedWorker/shell');
const { getPingTimeoutMs } = require('../services/matcher');
const { containsPublicContactDetails } = require('../lib/publicText');

const router = express.Router();
router.use(authMiddleware, requireRole('labourer'));

function publicWorkerText(value, field) {
  if (containsPublicContactDetails(value)) {
    fail(
      'worker_public_text_contact_details',
      'Public Worker text cannot contain contact details',
      422,
      `Remove phone numbers and email addresses from ${field} before publishing.`
    );
  }
  return value;
}

function commandContext(req, { commandType, resourceId, body }) {
  return {
    actor: req.user,
    commandType,
    resourceId,
    body,
    expectedRevision: requireExpectedRevision(req),
    idempotencyKey: requireIdempotencyKey(req),
  };
}

function sendCommand(res, result) {
  if (result.replay) res.set('Idempotent-Replay', 'true');
  const revision = result.body?.publicProfile?.stateVersion
    ?? result.body?.offering?.stateVersion
    ?? result.body?.acknowledgement?.stateVersion
    ?? result.body?.activation?.stateVersion;
  if (revision !== undefined) res.set('ETag', `"${revision}"`);
  return res.status(result.status).json(result.body);
}

async function requireWorkerBundle(workerId) {
  const worker = await loadWorkerProfile(db, workerId);
  if (!worker) fail('worker_profile_not_found', 'Worker profile not found', 404);
  const [offerings, acknowledgements] = await Promise.all([
    listWorkerOfferings(db, workerId),
    listAcknowledgements(db, workerId),
  ]);
  return { worker, offerings, acknowledgements };
}

router.get('/activation', async (req, res, next) => {
  try {
    const bundle = await requireWorkerBundle(req.user.id);
    const activation = serializeActivation(bundle.worker, bundle.offerings, bundle.acknowledgements);
    res.set('ETag', `"${activation.stateVersion}"`).json({ schema: SCHEMA, activation });
  } catch (err) { next(err); }
});

router.put('/activation/acknowledgements/:kind', async (req, res, next) => {
  try {
    assertPlainObject(req.body);
    rejectUnknownFields(req.body, ['policyVersion']);
    const kind = assertAcknowledgementKind(req.params.kind);
    const policyVersion = assertPolicyVersion(req.body.policyVersion);
    const body = {
      kind,
      policyVersion: assertCurrentPolicyVersion(kind, policyVersion),
    };
    sendCommand(res, await acknowledgeActivationItem(commandContext(req, {
      commandType: `worker_acknowledge_${body.kind}`,
      resourceId: req.user.id,
      body,
    })));
  } catch (err) { next(err); }
});

router.put('/activation/emergency-contact', async (req, res, next) => {
  try {
    assertPlainObject(req.body);
    rejectUnknownFields(req.body, ['phone']);
    const phone = boundedText(req.body.phone, 'phone', { min: 7, max: 30 })
      .replace(/\s+/g, ' ');
    if (!/^\+?[0-9][0-9 ()-]{5,28}[0-9]$/.test(phone)) {
      fail(
        'worker_emergency_contact_invalid',
        'Emergency contact is invalid',
        422,
        'Enter a private phone number using digits and optional spaces, brackets, hyphens or a leading plus.'
      );
    }
    sendCommand(res, await saveEmergencyContact(commandContext(req, {
      commandType: 'worker_save_emergency_contact',
      resourceId: req.user.id,
      body: { phone },
    })));
  } catch (err) { next(err); }
});

router.get('/profile', async (req, res, next) => {
  try {
    const bundle = await requireWorkerBundle(req.user.id);
    const servicesProfile = serializeServicesProfile(bundle.worker, bundle.offerings);
    res.set('ETag', `"${servicesProfile.publicProfile.stateVersion}"`).json({ servicesProfile });
  } catch (err) { next(err); }
});

router.get('/offers', async (req, res, next) => {
  try {
    const now = new Date();
    const offers = await listWorkerOffers(db, req.user.id, {
      now,
      pingTimeoutMs: getPingTimeoutMs(),
    });
    if (offers === null) fail('worker_profile_not_found', 'Worker profile not found', 404);
    res.json({
      schema: OFFER_SCHEMA,
      serverNow: now.toISOString(),
      offers,
      meta: { count: offers.length },
    });
  } catch (err) { next(err); }
});

router.get('/offers/:id', async (req, res, next) => {
  try {
    const offerId = assertUuid(req.params.id, 'offerId');
    const now = new Date();
    const offer = await getWorkerOffer(db, req.user.id, offerId, {
      now,
      pingTimeoutMs: getPingTimeoutMs(),
    });
    if (offer === null) fail('worker_profile_not_found', 'Worker profile not found', 404);
    if (offer === undefined) fail('worker_offer_not_found', 'Worker offer not found', 404);
    res.json({ schema: OFFER_SCHEMA, serverNow: now.toISOString(), offer });
  } catch (err) { next(err); }
});

router.patch('/profile', async (req, res, next) => {
  try {
    assertPlainObject(req.body);
    rejectUnknownFields(req.body, ['displayName', 'about']);
    const body = {
      displayName: publicWorkerText(
        boundedText(req.body.displayName, 'displayName', { min: 2, max: 80 }),
        'displayName'
      ),
      about: publicWorkerText(
        boundedText(req.body.about, 'about', { min: 20, max: 1000 }),
        'about'
      ),
    };
    sendCommand(res, await savePublicProfile(commandContext(req, {
      commandType: 'worker_save_public_profile',
      resourceId: req.user.id,
      body,
    })));
  } catch (err) { next(err); }
});

router.get('/offerings', async (req, res, next) => {
  try {
    const bundle = await requireWorkerBundle(req.user.id);
    res.json({
      schema: SCHEMA,
      workerId: req.user.id,
      offerings: bundle.offerings.map((offering) => serializeOffering(offering, bundle.worker)),
      meta: { count: bundle.offerings.length },
    });
  } catch (err) { next(err); }
});

router.post('/offerings', async (req, res, next) => {
  try {
    assertPlainObject(req.body);
    rejectUnknownFields(req.body, ['serviceId', 'serviceVersion']);
    const serviceVersion = optionalWholeNumber(req.body.serviceVersion, 'serviceVersion', { minimum: 1 });
    if (serviceVersion == null) {
      fail('worker_service_version_invalid', 'serviceVersion is invalid', 422, 'serviceVersion is required.');
    }
    const body = {
      serviceId: assertUuid(req.body.serviceId, 'serviceId'),
      serviceVersion,
    };
    sendCommand(res, await createOffering(commandContext(req, {
      commandType: 'worker_create_offering',
      body,
    })));
  } catch (err) { next(err); }
});

router.get('/offerings/:id', async (req, res, next) => {
  try {
    const offeringId = assertUuid(req.params.id, 'offeringId');
    const worker = await loadWorkerProfile(db, req.user.id);
    if (!worker) fail('worker_profile_not_found', 'Worker profile not found', 404);
    const offering = await loadWorkerOffering(db, req.user.id, offeringId);
    if (!offering) fail('worker_offering_not_found', 'Worker offering not found', 404);
    const dto = serializeOffering(offering, worker);
    res.set('ETag', `"${dto.stateVersion}"`).json({ schema: SCHEMA, offering: dto });
  } catch (err) { next(err); }
});

router.patch('/offerings/:id', async (req, res, next) => {
  try {
    const offeringId = assertUuid(req.params.id, 'offeringId');
    assertPlainObject(req.body);
    rejectUnknownFields(req.body, [
      'title',
      'description',
      'hourlyRateMinor',
      'minimumDurationMinutes',
      'callOutAmountMinor',
      'serviceAreaLabel',
      'active',
    ]);
    if (Object.keys(req.body).length === 0) {
      fail('worker_offering_patch_empty', 'Offering update is empty', 422, 'Send at least one supported field.');
    }
    const body = {};
    if (req.body.title !== undefined) {
      body.title = publicWorkerText(
        boundedText(req.body.title, 'title', { min: 2, max: 120 }),
        'title'
      );
    }
    if (req.body.description !== undefined) {
      body.description = publicWorkerText(
        boundedText(req.body.description, 'description', { min: 20, max: 1500 }),
        'description'
      );
    }
    if (req.body.serviceAreaLabel !== undefined) {
      body.serviceAreaLabel = publicWorkerText(
        boundedText(req.body.serviceAreaLabel, 'serviceAreaLabel', { min: 2, max: 160 }),
        'serviceAreaLabel'
      );
    }
    if (req.body.hourlyRateMinor !== undefined) {
      body.hourlyRateMinor = optionalWholeNumber(req.body.hourlyRateMinor, 'hourlyRateMinor', { minimum: 0 });
    }
    if (req.body.minimumDurationMinutes !== undefined) {
      body.minimumDurationMinutes = optionalWholeNumber(req.body.minimumDurationMinutes, 'minimumDurationMinutes', { minimum: 1 });
    }
    if (req.body.callOutAmountMinor !== undefined) {
      body.callOutAmountMinor = optionalWholeNumber(req.body.callOutAmountMinor, 'callOutAmountMinor', { minimum: 0 });
    }
    if (req.body.active !== undefined) {
      if (typeof req.body.active !== 'boolean') {
        fail('worker_active_invalid', 'active is invalid', 422, 'active must be a boolean.');
      }
      body.active = req.body.active;
    }
    sendCommand(res, await updateOffering(commandContext(req, {
      commandType: 'worker_update_offering',
      resourceId: offeringId,
      body,
    })));
  } catch (err) { next(err); }
});

module.exports = router;
