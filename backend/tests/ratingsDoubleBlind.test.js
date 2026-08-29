const express = require('express');
const supertest = require('supertest');
const db = require('../src/config/db');
const { signAccessToken } = require('../src/lib/jwtTokens');
const labourersRouter = require('../src/routes/labourers');
const ratingsRouter = require('../src/routes/ratings');
const { groundedTrustErrorHandler } = require('../src/middleware/groundedTrustErrors');
const { problemHandler } = require('../src/lib/problemJson');

const app = express();
app.use(express.json());
app.use('/api/labourers', labourersRouter);
app.use('/api/ratings', ratingsRouter);
app.use(groundedTrustErrorHandler);
app.use(problemHandler);
const request = supertest(app);

function auth(user) {
  return { Authorization: `Bearer ${signAccessToken({ id: user.id, role: user.role })}` };
}

async function createUser(role, suffix, name) {
  const result = await db.query(
    `INSERT INTO users (name, email, phone, password_hash, role)
     VALUES ($1, $2, $3, 'test-hash', $4)
     RETURNING id, role`,
    [name, `${role}-${suffix}@ratings.example.test`, `085${suffix}`, role]
  );
  if (role === 'labourer') {
    await db.query(
      `INSERT INTO labourer_profiles (user_id, skills, hourly_rate, is_available)
       VALUES ($1, ARRAY['Carpentry'], 350, true)`,
      [result.rows[0].id]
    );
  }
  return result.rows[0];
}

async function fixture() {
  const suffix = String(Math.floor(Math.random() * 8_000_000) + 1_000_000);
  const customer = await createUser('customer', suffix, 'Naledi PrivateSurname');
  const worker = await createUser('labourer', String(Number(suffix) + 1), 'Thabo WorkerSurname');
  const outsider = await createUser('customer', String(Number(suffix) + 2), 'Outside Person');
  const booking = await db.query(
    `INSERT INTO bookings (
       customer_id, labourer_id, status, operational_phase, skill_needed,
       address, location_lat, location_lng, scheduled_at, completed_at
     ) VALUES ($1, $2, 'completed', 'closed', 'Carpentry', 'Private home',
               -33.9, 18.4, NOW() + INTERVAL '1 day', NOW())
     RETURNING id`,
    [customer.id, worker.id]
  );
  return { customer, worker, outsider, bookingId: booking.rows[0].id };
}

function submit(user, bookingId, ratingScore, key, comment = undefined) {
  return request.post('/api/ratings')
    .set(auth(user))
    .set('Idempotency-Key', key)
    .send({ booking_id: bookingId, score: ratingScore, ...(comment ? { comment } : {}) });
}

async function seedGroundedOfferings(workerId) {
  const activeServiceId = '10000000-0000-4000-8000-000000000001';
  const inactiveServiceId = '10000000-0000-4000-8000-000000000002';
  await db.query('UPDATE users SET is_verified = true, emergency_contact = $2 WHERE id = $1', [
    workerId,
    '0849999999',
  ]);
  await db.query(
    `INSERT INTO grounded_worker_public_profiles (worker_id, public_display_name, about_experience)
     VALUES ($1, 'Thabo Repairs', 'Careful household carpentry and repair work with clear scope confirmation.')`,
    [workerId]
  );
  await db.query(
    `INSERT INTO service_catalogue_versions (
       service_id, service_version, canonical_key, category_key, label_en_za,
       description_en_za, pricing_mode, fulfilment_mode, risk_tier,
       cancellation_policy_version, worker_eligibility, is_published, published_at
     ) VALUES
       ($1, 1, 'carpentry_repairs', 'carpentry', 'Carpentry repairs',
        'Remote quote carpentry repair service.', 'remote_quote', 'receive_quotes', 'standard',
        'test-cancellation-v1', '{}'::jsonb, true, NOW()),
       ($2, 1, 'inactive_carpentry', 'carpentry', 'Inactive carpentry service',
        'An otherwise valid but inactive service.', 'remote_quote', 'receive_quotes', 'standard',
        'test-cancellation-v1', '{}'::jsonb, true, NOW())`,
    [activeServiceId, inactiveServiceId]
  );
  await db.query(
    `INSERT INTO catalogue_worker_opt_ins (
       worker_id, service_id, service_version, status, deactivated_at
     ) VALUES
       ($1, $2, 1, 'active', NULL),
       ($1, $3, 1, 'inactive', NOW())`,
    [workerId, activeServiceId, inactiveServiceId]
  );
  await db.query(
    `INSERT INTO grounded_worker_service_offerings (
       worker_id, service_id, service_version, customer_facing_title,
       description, service_area_label
     ) VALUES
       ($1, $2, 1, 'Careful carpentry repairs',
        'Careful household carpentry repairs with scope confirmed before work.', 'Cape Town metro'),
       ($1, $3, 1, 'Inactive carpentry repairs',
        'This inactive service must never appear on a customer-facing profile.', 'Cape Town metro')`,
    [workerId, activeServiceId, inactiveServiceId]
  );
  return { activeServiceId, inactiveServiceId };
}

beforeEach(async () => {
  await db.query('TRUNCATE TABLE users, service_catalogue_versions RESTART IDENTITY CASCADE');
});

afterAll(async () => {
  await db.end();
});

describe('C13 double-blind ratings', () => {
  test('opens only for a completed participant Project', async () => {
    const item = await fixture();
    const mine = await request.get(`/api/ratings/booking/${item.bookingId}/mine`).set(auth(item.customer));
    expect(mine.status).toBe(200);
    expect(mine.body.rating).toMatchObject({ state: 'open', selectedValue: null });

    const outsider = await request.get(`/api/ratings/booking/${item.bookingId}/mine`).set(auth(item.outsider));
    expect(outsider.status).toBe(404);
  });

  test('seals the first submission, accepts exact retries and rejects edits', async () => {
    const item = await fixture();
    const first = await submit(item.customer, item.bookingId, 5, 'rating-customer-one', 'Careful and tidy work.');
    expect(first.status).toBe(201);
    expect(first.body.rating.state).toBe('sealed');

    const publicBefore = await request.get(`/api/ratings/labourer/${item.worker.id}`);
    expect(publicBefore.status).toBe(200);
    expect(publicBefore.body.ratings).toEqual([]);
    const legacyProfileBefore = await request.get(`/api/labourers/${item.worker.id}`);
    expect(legacyProfileBefore.status).toBe(200);
    expect(legacyProfileBefore.body.reviews).toEqual([]);
    expect(JSON.stringify(legacyProfileBefore.body)).not.toContain('Careful and tidy work.');
    expect(JSON.stringify(legacyProfileBefore.body)).not.toContain('PrivateSurname');
    const profileBefore = await db.query('SELECT rating_avg, rating_count FROM labourer_profiles WHERE user_id = $1', [item.worker.id]);
    expect(Number(profileBefore.rows[0].rating_count)).toBe(0);

    const replay = await submit(item.customer, item.bookingId, 5, 'rating-customer-retry', 'Careful and tidy work.');
    expect(replay.status).toBe(200);
    expect(replay.headers['idempotent-replay']).toBe('true');
    const edit = await submit(item.customer, item.bookingId, 4, 'rating-customer-edit', 'Different');
    expect(edit.status).toBe(409);
  });

  test('publishes both only after the counterpart submits and exposes first-name-only reviewer identity', async () => {
    const item = await fixture();
    await submit(item.customer, item.bookingId, 5, 'rating-customer-bilateral', 'Excellent work.');
    const worker = await submit(item.worker, item.bookingId, 4, 'rating-worker-bilateral', 'Clear brief.');
    expect(worker.status).toBe(201);
    expect(worker.body.rating.state).toBe('published');

    const customerMine = await request.get(`/api/ratings/booking/${item.bookingId}/mine`).set(auth(item.customer));
    expect(customerMine.body.rating.state).toBe('published');
    const publicRatings = await request.get(`/api/ratings/labourer/${item.worker.id}`);
    expect(publicRatings.body.ratings).toEqual([
      expect.objectContaining({ score: 5, reviewer_name: 'Naledi', comment: 'Excellent work.' }),
    ]);
    expect(publicRatings.body.ratings[0]).not.toHaveProperty('reviewer_avatar');
    expect(JSON.stringify(publicRatings.body)).not.toContain('PrivateSurname');
    const legacyProfile = await request.get(`/api/labourers/${item.worker.id}`);
    expect(legacyProfile.status).toBe(200);
    expect(legacyProfile.body.reviews).toEqual([
      expect.objectContaining({ score: 5, reviewer_name: 'Naledi', comment: 'Excellent work.' }),
    ]);
    expect(legacyProfile.body.reviews[0]).not.toHaveProperty('reviewer_avatar');
    expect(JSON.stringify(legacyProfile.body.reviews)).not.toContain('PrivateSurname');
    const customerRatings = await request.get(`/api/ratings/labourer/${item.customer.id}`);
    expect(customerRatings.status).toBe(404);
    expect(customerRatings.body.type).toMatch(/rating_worker_not_found$/);
    const profile = await db.query('SELECT rating_avg, rating_count FROM labourer_profiles WHERE user_id = $1', [item.worker.id]);
    expect(Number(profile.rows[0].rating_avg)).toBe(5);
    expect(Number(profile.rows[0].rating_count)).toBe(1);
  });

  test('keeps received history private and requires idempotency on consequential submission', async () => {
    const item = await fixture();
    const missingKey = await request.post('/api/ratings').set(auth(item.customer)).send({ booking_id: item.bookingId, score: 5 });
    expect(missingKey.status).toBe(400);
    const forbidden = await request.get(`/api/ratings/user/${item.customer.id}`).set(auth(item.outsider));
    expect(forbidden.status).toBe(403);
  });

  test('rejects public review text containing phone numbers or email addresses', async () => {
    const phoneItem = await fixture();
    const phone = await submit(
      phoneItem.customer,
      phoneItem.bookingId,
      5,
      'rating-contact-phone',
      'Call me on 082 111 2222.'
    );
    expect(phone.status).toBe(422);
    expect(phone.body.type).toMatch(/rating_comment_contact_details$/);

    const emailItem = await fixture();
    const email = await submit(
      emailItem.customer,
      emailItem.bookingId,
      5,
      'rating-contact-email',
      'Email me at private@example.com.'
    );
    expect(email.status).toBe(422);
    expect(email.body.type).toMatch(/rating_comment_contact_details$/);
  });

  test('quarantines contact-bearing legacy comments at every public Worker review boundary', async () => {
    const item = await fixture();
    await seedGroundedOfferings(item.worker.id);
    await submit(item.customer, item.bookingId, 5, 'rating-legacy-contact-customer', 'Initially safe.');
    await submit(item.worker, item.bookingId, 4, 'rating-legacy-contact-worker', 'Clear scope.');
    const legacyContact = 'WhatsApp 082 555 0199 or private.legacy@example.com';
    await db.query(
      'UPDATE ratings SET comment = $1 WHERE booking_id = $2 AND reviewer_id = $3',
      [legacyContact, item.bookingId, item.customer.id]
    );
    await db.query('UPDATE users SET name = $1 WHERE id = $2', [
      'private.reviewer@example.com',
      item.customer.id,
    ]);

    const publicRatings = await request.get(`/api/ratings/labourer/${item.worker.id}`);
    expect(publicRatings.status).toBe(200);
    expect(publicRatings.body.ratings).toEqual([
      expect.objectContaining({ score: 5, comment: null, reviewer_name: 'Customer' }),
    ]);

    const legacyProfile = await request.get(`/api/labourers/${item.worker.id}`);
    expect(legacyProfile.status).toBe(200);
    expect(legacyProfile.body.reviews).toEqual([
      expect.objectContaining({ score: 5, comment: null, reviewer_name: 'Customer' }),
    ]);

    const groundedProfile = await request
      .get(`/api/labourers/${item.worker.id}/grounded-profile`)
      .set(auth(item.customer));
    expect(groundedProfile.status).toBe(200);
    expect(groundedProfile.body.profile.reviews).toEqual([
      expect.objectContaining({ rating: 5, body: null }),
    ]);
    for (const response of [publicRatings, legacyProfile, groundedProfile]) {
      expect(JSON.stringify(response.body)).not.toContain('082 555 0199');
      expect(JSON.stringify(response.body)).not.toContain('private.legacy@example.com');
      expect(JSON.stringify(response.body)).not.toContain('private.reviewer@example.com');
    }
  });

  test('public Worker photos fail closed unless their exact HTTPS media origin is approved', async () => {
    const originalOrigin = process.env.PUBLIC_PROFILE_IMAGE_ORIGIN;
    const originalCloudName = process.env.CLOUDINARY_CLOUD_NAME;
    const item = await fixture();
    await seedGroundedOfferings(item.worker.id);
    try {
      delete process.env.PUBLIC_PROFILE_IMAGE_ORIGIN;
      await db.query(
        'UPDATE users SET avatar_url = $1 WHERE id = $2',
        ['https://tracker.attacker.example/pixel.gif?worker=private', item.worker.id]
      );

      const unconfigured = await request
        .get(`/api/labourers/${item.worker.id}/grounded-profile`)
        .set(auth(item.customer));
      const unconfiguredLegacy = await request.get(`/api/labourers/${item.worker.id}`);
      expect(unconfigured.body.profile.profilePhoto).toMatchObject({
        status: 'unavailable',
        reasonCode: 'profile_photo_unavailable',
      });
      expect(unconfiguredLegacy.body.labourer).not.toHaveProperty('avatar_url');
      expect(JSON.stringify([unconfigured.body, unconfiguredLegacy.body])).not.toContain('tracker.attacker.example');

      process.env.PUBLIC_PROFILE_IMAGE_ORIGIN = 'https://media.togt.example';
      const mismatched = await request
        .get(`/api/labourers/${item.worker.id}/grounded-profile`)
        .set(auth(item.customer));
      expect(mismatched.body.profile.profilePhoto.status).toBe('unavailable');

      await db.query(
        'UPDATE users SET avatar_url = $1 WHERE id = $2',
        ['https://media.togt.example/togt/profiles/worker.jpg', item.worker.id]
      );
      const approved = await request
        .get(`/api/labourers/${item.worker.id}/grounded-profile`)
        .set(auth(item.customer));
      const approvedLegacy = await request.get(`/api/labourers/${item.worker.id}`);
      expect(approved.body.profile.profilePhoto).toMatchObject({
        status: 'supported',
        source: 'server',
        value: { uri: 'https://media.togt.example/togt/profiles/worker.jpg' },
      });
      expect(approvedLegacy.body.labourer.avatar_url).toBe(
        'https://media.togt.example/togt/profiles/worker.jpg'
      );

      process.env.PUBLIC_PROFILE_IMAGE_ORIGIN = 'https://res.cloudinary.com';
      process.env.CLOUDINARY_CLOUD_NAME = 'togt-approved';
      await db.query(
        'UPDATE users SET avatar_url = $1 WHERE id = $2',
        ['https://res.cloudinary.com/attacker-cloud/image/upload/pixel.jpg', item.worker.id]
      );
      const wrongTenant = await request
        .get(`/api/labourers/${item.worker.id}/grounded-profile`)
        .set(auth(item.customer));
      expect(wrongTenant.body.profile.profilePhoto.status).toBe('unavailable');
    } finally {
      if (originalOrigin === undefined) delete process.env.PUBLIC_PROFILE_IMAGE_ORIGIN;
      else process.env.PUBLIC_PROFILE_IMAGE_ORIGIN = originalOrigin;
      if (originalCloudName === undefined) delete process.env.CLOUDINARY_CLOUD_NAME;
      else process.env.CLOUDINARY_CLOUD_NAME = originalCloudName;
    }
  });

  test('quarantines direct-DB contact text from every legacy and Grounded public Worker field', async () => {
    const item = await fixture();
    const services = await seedGroundedOfferings(item.worker.id);
    const contactValues = [
      'Call 082 555 0101',
      'Email legacy.bio@example.com',
      'WhatsApp 083 555 0102',
      'Write to grounded.about@example.com for the details.',
      'Call 084 555 0103',
      'Email offering.description@example.com before booking this service.',
      '082 555 0104',
    ];

    await db.query('UPDATE users SET name = $1 WHERE id = $2', [contactValues[0], item.worker.id]);
    await db.query('UPDATE labourer_profiles SET bio = $1 WHERE user_id = $2', [
      contactValues[1],
      item.worker.id,
    ]);
    await db.query(
      `UPDATE grounded_worker_public_profiles
          SET public_display_name = $1, about_experience = $2
        WHERE worker_id = $3`,
      [contactValues[2], contactValues[3], item.worker.id]
    );
    await db.query(
      `UPDATE grounded_worker_service_offerings
          SET customer_facing_title = $1, description = $2, service_area_label = $3
        WHERE worker_id = $4 AND service_id = $5`,
      [contactValues[4], contactValues[5], contactValues[6], item.worker.id, services.activeServiceId]
    );

    const legacyListing = await request.get('/api/labourers');
    const legacyProfile = await request.get(`/api/labourers/${item.worker.id}`);
    const groundedProfile = await request
      .get(`/api/labourers/${item.worker.id}/grounded-profile`)
      .set(auth(item.customer));

    expect(legacyListing.status).toBe(200);
    expect(legacyListing.body.labourers).toEqual([
      expect.objectContaining({ id: item.worker.id, name: 'Worker' }),
    ]);
    expect(legacyListing.body.labourers[0]).not.toHaveProperty('bio');
    expect(legacyProfile.status).toBe(200);
    expect(legacyProfile.body.labourer).toMatchObject({ id: item.worker.id, name: 'Worker' });
    expect(legacyProfile.body.labourer).not.toHaveProperty('bio');
    expect(groundedProfile.status).toBe(200);
    expect(groundedProfile.body.profile).toMatchObject({
      displayName: 'Worker',
      about: '',
      serviceAreaLabel: '',
      offerings: [],
      currentlyAvailable: false,
    });
    for (const response of [legacyListing, legacyProfile, groundedProfile]) {
      const serialised = JSON.stringify(response.body);
      for (const value of contactValues) expect(serialised).not.toContain(value);
      expect(serialised).not.toMatch(/(?:082|083|084) 555 01/);
      expect(serialised).not.toContain('@example.com');
    }
  });

  test('legacy public bio writes reject contact details before persistence', async () => {
    const item = await fixture();
    const response = await request
      .put('/api/labourers/profile')
      .set(auth(item.worker))
      .send({ bio: 'Experienced repair Worker. Call 082 555 0199.' });
    expect(response.status).toBe(422);
    expect(response.body).toMatchObject({ error: 'public_bio_contact_details' });
    const stored = await db.query('SELECT bio FROM labourer_profiles WHERE user_id = $1', [item.worker.id]);
    expect(stored.rows[0].bio).toBeNull();
  });

  test('serves an authenticated Grounded profile with eligible public evidence and anonymous published reviews only', async () => {
    const item = await fixture();
    const services = await seedGroundedOfferings(item.worker.id);
    await submit(item.customer, item.bookingId, 5, 'rating-grounded-customer', 'Excellent grounded work.');
    await submit(item.worker, item.bookingId, 4, 'rating-grounded-worker', 'Clear scope.');

    const response = await request
      .get(`/api/labourers/${item.worker.id}/grounded-profile`)
      .set(auth(item.customer));

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({
      schema: 'togt.grounded-worker-public-profile.v1',
      profile: {
        workerId: item.worker.id,
        displayName: 'Thabo Repairs',
        completedJobs: 1,
        currentlyAvailable: false,
        rating: { average: 5, count: 1 },
        offerings: [expect.objectContaining({
          serviceId: services.activeServiceId,
          serviceVersion: 1,
          title: 'Careful carpentry repairs',
          pricingMode: 'remote_quote',
          serviceAreaLabel: 'Cape Town metro',
        })],
        reviews: [expect.objectContaining({
          rating: 5,
          body: 'Excellent grounded work.',
          serviceLabel: 'Carpentry',
        })],
      },
    });
    expect(response.body.profile.offerings).toHaveLength(1);
    const serialised = JSON.stringify(response.body);
    expect(serialised).not.toContain(services.inactiveServiceId);
    expect(serialised).not.toContain('PrivateSurname');
    expect(serialised).not.toContain('ratings.example.test');
    expect(serialised).not.toContain('0849999999');
    expect(serialised).not.toContain('reviewer');
    expect(response.body.profile).not.toHaveProperty('privateDetailLabels');
    expect(response.body.profile).not.toHaveProperty('activation');
    expect(response.body.profile.offerings[0]).not.toHaveProperty('eligibility');
  });

  test('Grounded profile rejects unauthenticated, invalid-role and invalid/missing Worker requests', async () => {
    const item = await fixture();
    expect((await request.get(`/api/labourers/${item.worker.id}/grounded-profile`)).status).toBe(401);

    const forbidden = await request
      .get(`/api/labourers/${item.worker.id}/grounded-profile`)
      .set(auth({ id: item.outsider.id, role: 'support' }));
    expect(forbidden.status).toBe(403);

    const invalid = await request
      .get('/api/labourers/not-a-uuid/grounded-profile')
      .set(auth(item.customer));
    expect(invalid.status).toBe(400);

    const missing = await request
      .get('/api/labourers/20000000-0000-4000-8000-000000000099/grounded-profile')
      .set(auth(item.customer));
    expect(missing.status).toBe(404);
  });
});
