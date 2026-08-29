const { withTx } = require('../../config/db');
const { fail, sha256 } = require('./contracts');

async function beginCommand(client, context) {
  const requestHash = sha256({
    resourceId: context.resourceId || null,
    expectedRevision: context.expectedRevision,
    body: context.body,
  });
  const inserted = await client.query(
    `INSERT INTO grounded_worker_profile_command_receipts (
       actor_user_id, command_type, idempotency_key, resource_id, request_hash
     ) VALUES ($1, $2, $3, $4, $5)
     ON CONFLICT (actor_user_id, command_type, idempotency_key) DO NOTHING
     RETURNING request_hash`,
    [
      context.actor.id,
      context.commandType,
      context.idempotencyKey,
      context.resourceId || null,
      requestHash,
    ]
  );
  if (inserted.rowCount === 1) return null;

  const existing = await client.query(
    `SELECT request_hash, response_status, response_body
       FROM grounded_worker_profile_command_receipts
      WHERE actor_user_id = $1 AND command_type = $2 AND idempotency_key = $3`,
    [context.actor.id, context.commandType, context.idempotencyKey]
  );
  const row = existing.rows[0];
  if (!row || row.request_hash !== requestHash) {
    fail(
      'idempotency_key_reused',
      'Idempotency-Key reused with different input',
      422,
      'Use a fresh Idempotency-Key when the resource, request body, or If-Match revision changes.'
    );
  }
  if (row.response_status === null || !row.response_body) {
    fail(
      'idempotency_command_in_progress',
      'Command is still in progress',
      409,
      'Retry the exact request with the same Idempotency-Key.'
    );
  }
  return { status: Number(row.response_status), body: row.response_body, replay: true };
}

async function completeCommand(client, context, result) {
  await client.query(
    `UPDATE grounded_worker_profile_command_receipts
        SET resource_id = COALESCE(resource_id, $4),
            response_status = $5,
            response_body = $6::jsonb,
            completed_at = NOW()
      WHERE actor_user_id = $1 AND command_type = $2 AND idempotency_key = $3`,
    [
      context.actor.id,
      context.commandType,
      context.idempotencyKey,
      result.resourceId || context.resourceId || null,
      result.status,
      JSON.stringify(result.body),
    ]
  );
}

async function executeCommand(context, mutate) {
  return withTx(async (client) => {
    const replay = await beginCommand(client, context);
    if (replay) return replay;
    const result = await mutate(client);
    await completeCommand(client, context, result);
    return { status: result.status, body: result.body, replay: false };
  });
}

function assertRevision(row, expectedRevision, resourceName) {
  const currentRevision = Number(row.revision);
  if (currentRevision !== expectedRevision) {
    fail(
      'worker_revision_mismatch',
      `${resourceName} revision is stale`,
      412,
      `Fetch the latest ${resourceName} before retrying.`,
      { expectedRevision, currentRevision }
    );
  }
}

module.exports = { executeCommand, assertRevision };
