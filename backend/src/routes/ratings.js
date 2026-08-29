const express = require('express');
const db = require('../config/db');
const { authMiddleware } = require('../middleware/auth');
const {
  containsReviewContactDetails,
  publicReviewComment,
} = require('../lib/publicReview');
const { publicTextOrNull } = require('../lib/publicText');
const {
  assertPlainObject,
  assertUuid,
  fail,
  rejectUnknownFields,
  requireIdempotencyKey,
} = require('../services/groundedTrust/contracts');

const router = express.Router();
const SCHEMA = 'togt.rating.v1';
const WINDOW_DAYS = 14;
function boundedComment(value) {
  if (value === undefined || value === null || value === '') return null;
  if (typeof value !== 'string') {
    fail('rating_comment_invalid', 'Rating comment is invalid', 422, 'Comment must be text.');
  }
  const comment = value.trim();
  if (comment.length > 1_000 || comment.includes('\u0000')) {
    fail('rating_comment_invalid', 'Rating comment is invalid', 422, 'Comment must be no longer than 1,000 characters.');
  }
  if (containsReviewContactDetails(comment)) {
    fail(
      'rating_comment_contact_details',
      'Rating comment cannot contain contact details',
      422,
      'Remove phone numbers and email addresses before publishing this review.'
    );
  }
  return comment || null;
}

function score(value) {
  if (!Number.isSafeInteger(value) || value < 1 || value > 5) {
    fail('rating_score_invalid', 'Rating score is invalid', 422, 'Choose an integer from 1 to 5.');
  }
  return value;
}

function publicationDeadline(booking) {
  const anchor = new Date(booking.completed_at || booking.phase_updated_at || booking.created_at);
  return new Date(anchor.getTime() + WINDOW_DAYS * 24 * 60 * 60 * 1_000);
}

function ownRatingProjection(row, bookingId) {
  const published = row.publication_status === 'published';
  return {
    schema: SCHEMA,
    projectReference: bookingId,
    state: published ? 'published' : 'sealed',
    selectedValue: Number(row.score),
    reasonLabels: [],
    publicationLabel: published
      ? 'Published after both participants submitted or the rating window closed.'
      : 'Submitted privately. It publishes after both participants submit or the rating window closes.',
    publishAfter: new Date(row.publish_after).toISOString(),
    submittedAt: new Date(row.created_at).toISOString(),
  };
}

function emptyRatingProjection(booking, bookingId) {
  if (booking.status !== 'completed') {
    return {
      schema: SCHEMA,
      projectReference: bookingId,
      state: 'not_open',
      selectedValue: null,
      reasonLabels: [],
      publicationLabel: 'Rating opens only after canonical Project completion.',
      publishAfter: null,
      submittedAt: null,
    };
  }
  const deadline = publicationDeadline(booking);
  const closed = Date.now() >= deadline.getTime();
  return {
    schema: SCHEMA,
    projectReference: bookingId,
    state: closed ? 'window_closed' : 'open',
    selectedValue: null,
    reasonLabels: [],
    publicationLabel: closed
      ? 'The 14-day rating window has closed.'
      : 'Your rating remains private until both participants submit or the 14-day window closes.',
    publishAfter: deadline.toISOString(),
    submittedAt: null,
  };
}

async function refreshWorkerAverage(queryable, workerId) {
  await queryable.query(
    `UPDATE labourer_profiles
        SET rating_avg = COALESCE((
              SELECT ROUND(AVG(score)::numeric, 2)
                FROM ratings
               WHERE reviewee_id = $1 AND publication_status = 'published'
            ), 0),
            rating_count = (
              SELECT COUNT(*) FROM ratings
               WHERE reviewee_id = $1 AND publication_status = 'published'
            )
      WHERE user_id = $1`,
    [workerId]
  );
}

async function publishDueRatings(queryable) {
  const due = await queryable.query(
    `UPDATE ratings
        SET publication_status = 'published', published_at = NOW()
      WHERE publication_status = 'sealed' AND publish_after <= NOW()
      RETURNING reviewee_id`
  );
  for (const revieweeId of new Set(due.rows.map((row) => row.reviewee_id))) {
    await refreshWorkerAverage(queryable, revieweeId);
  }
}

async function participantBooking(queryable, bookingId, actorId, { forUpdate = false } = {}) {
  const result = await queryable.query(
    `SELECT id, customer_id, labourer_id, status, completed_at, phase_updated_at, created_at
       FROM bookings
      WHERE id = $1 AND (customer_id = $2 OR labourer_id = $2)
      ${forUpdate ? 'FOR UPDATE' : ''}`,
    [bookingId, actorId]
  );
  if (!result.rows[0]) {
    fail('rating_project_not_found', 'Project not found', 404, 'No rating-eligible Project was found for this participant.');
  }
  return result.rows[0];
}

router.get('/booking/:id/mine', authMiddleware, async (req, res, next) => {
  try {
    const bookingId = assertUuid(req.params.id, 'bookingId');
    const rating = await db.withTx(async (client) => {
      await publishDueRatings(client);
      const booking = await participantBooking(client, bookingId, req.user.id);
      const existing = await client.query(
        `SELECT score, publication_status, publish_after, created_at
           FROM ratings WHERE booking_id = $1 AND reviewer_id = $2`,
        [bookingId, req.user.id]
      );
      return existing.rows[0]
        ? ownRatingProjection(existing.rows[0], bookingId)
        : emptyRatingProjection(booking, bookingId);
    });
    res.json({ schema: SCHEMA, rating });
  } catch (err) { next(err); }
});

router.post('/', authMiddleware, async (req, res, next) => {
  try {
    assertPlainObject(req.body);
    rejectUnknownFields(req.body, ['booking_id', 'score', 'comment']);
    requireIdempotencyKey(req);
    const bookingId = assertUuid(req.body.booking_id, 'booking_id');
    const ratingScore = score(req.body.score);
    const comment = boundedComment(req.body.comment);
    const result = await db.withTx(async (client) => {
      const booking = await participantBooking(client, bookingId, req.user.id, { forUpdate: true });
      const existing = await client.query(
        `SELECT score, comment, publication_status, publish_after, created_at
           FROM ratings WHERE booking_id = $1 AND reviewer_id = $2`,
        [bookingId, req.user.id]
      );
      if (existing.rows[0]) {
        const prior = existing.rows[0];
        if (Number(prior.score) !== ratingScore || (prior.comment || null) !== comment) {
          fail('rating_already_submitted', 'Rating was already submitted', 409, 'Submitted ratings cannot be changed.');
        }
        await publishDueRatings(client);
        const replay = await client.query(
          `SELECT score, publication_status, publish_after, created_at
             FROM ratings WHERE booking_id = $1 AND reviewer_id = $2`,
          [bookingId, req.user.id]
        );
        return { status: 200, replay: true, rating: ownRatingProjection(replay.rows[0], bookingId) };
      }
      if (booking.status !== 'completed') {
        fail('rating_not_open', 'Rating is not open', 409, 'Canonical Project completion is required before rating.');
      }
      const deadline = publicationDeadline(booking);
      if (Date.now() >= deadline.getTime()) {
        fail('rating_window_closed', 'Rating window is closed', 409, `Ratings close ${WINDOW_DAYS} days after completion.`);
      }
      const revieweeId = req.user.id === booking.customer_id ? booking.labourer_id : booking.customer_id;
      await client.query(
        `INSERT INTO ratings (
           booking_id, reviewer_id, reviewee_id, score, comment,
           publication_status, publish_after, published_at
         ) VALUES ($1, $2, $3, $4, $5, 'sealed', $6, NULL)`,
        [bookingId, req.user.id, revieweeId, ratingScore, comment, deadline]
      );
      const submissions = await client.query(
        'SELECT COUNT(*)::int AS count FROM ratings WHERE booking_id = $1',
        [bookingId]
      );
      if (Number(submissions.rows[0].count) >= 2) {
        await client.query(
          `UPDATE ratings
              SET publication_status = 'published', published_at = NOW()
            WHERE booking_id = $1 AND publication_status = 'sealed'`,
          [bookingId]
        );
      }
      await publishDueRatings(client);
      await refreshWorkerAverage(client, booking.labourer_id);
      const created = await client.query(
        `SELECT score, publication_status, publish_after, created_at
           FROM ratings WHERE booking_id = $1 AND reviewer_id = $2`,
        [bookingId, req.user.id]
      );
      return { status: 201, replay: false, rating: ownRatingProjection(created.rows[0], bookingId) };
    });
    if (result.replay) res.set('Idempotent-Replay', 'true');
    res.status(result.status).json({ schema: SCHEMA, rating: result.rating });
  } catch (err) { next(err); }
});

router.get('/labourer/:id', async (req, res, next) => {
  try {
    const workerId = assertUuid(req.params.id, 'workerId');
    const ratings = await db.withTx(async (client) => {
      await publishDueRatings(client);
      const worker = await client.query(
        'SELECT 1 FROM labourer_profiles WHERE user_id = $1',
        [workerId]
      );
      if (!worker.rows[0]) {
        fail('rating_worker_not_found', 'Worker not found', 404, 'No public Worker profile was found.');
      }
      const result = await client.query(
        `SELECT r.score, r.comment, r.created_at,
                split_part(trim(u.name), ' ', 1) AS reviewer_name
           FROM ratings r
           JOIN users u ON r.reviewer_id = u.id
          WHERE r.reviewee_id = $1 AND r.publication_status = 'published'
          ORDER BY r.created_at DESC
          LIMIT 20`,
        [workerId]
      );
      return result.rows.map((row) => ({
        ...row,
        comment: publicReviewComment(row.comment),
        reviewer_name: publicTextOrNull(row.reviewer_name, { maxLength: 80 }) || 'Customer',
      }));
    });
    res.json({ ratings });
  } catch (err) { next(err); }
});

router.get('/user/:userId', authMiddleware, async (req, res, next) => {
  try {
    const userId = assertUuid(req.params.userId, 'userId');
    if (req.user.id !== userId) {
      fail('rating_history_forbidden', 'Rating history is private', 403, 'Only the account owner can view this rating history.');
    }
    const body = await db.withTx(async (client) => {
      await publishDueRatings(client);
      const result = await client.query(
        `SELECT r.id, r.booking_id, r.score, r.comment, r.created_at,
                split_part(trim(u.name), ' ', 1) AS reviewer_name
           FROM ratings r
           JOIN users u ON r.reviewer_id = u.id
          WHERE r.reviewee_id = $1 AND r.publication_status = 'published'
          ORDER BY r.created_at DESC
          LIMIT 50`,
        [userId]
      );
      const average = await client.query(
        `SELECT ROUND(AVG(score)::numeric, 2) AS avg_score, COUNT(*)::int AS total
           FROM ratings
          WHERE reviewee_id = $1 AND publication_status = 'published'`,
        [userId]
      );
      return {
        ratings: result.rows,
        avg_score: average.rows[0]?.avg_score || 0,
        total: Number(average.rows[0]?.total || 0),
      };
    });
    res.json(body);
  } catch (err) { next(err); }
});

module.exports = router;
