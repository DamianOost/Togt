const db = require('../../config/db');
const { ProblemError } = require('../../lib/problemJson');
const { serializeFulfilment } = require('./privacy');
const store = require('./store');

function fail(type, title, status, detail) {
  throw new ProblemError({ type, title, status, detail });
}

async function getFulfilment(bookingId, actor, queryable = db) {
  const booking = await store.getBooking(queryable, bookingId, actor);
  if (!booking) {
    fail(
      'project_not_found',
      'Project not found',
      404,
      'No participant-visible Project exists for this identifier.'
    );
  }
  const roleMatches = (actor.role === 'customer' && booking.customer_id === actor.id)
    || (actor.role === 'labourer' && booking.labourer_id === actor.id);
  if (!roleMatches) {
    fail(
      'fulfilment_actor_forbidden',
      'The participant role does not match this Project',
      403
    );
  }
  const state = await store.getState(queryable, booking);
  return serializeFulfilment(booking, state, actor);
}

module.exports = { getFulfilment };
