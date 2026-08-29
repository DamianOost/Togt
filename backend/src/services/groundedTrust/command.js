const { withTx } = require('../../config/db');
const { fail, sha256 } = require('./contracts');

async function beginCommand(client, context) {
  const requestHash = sha256({
    resourceId: context.resourceId || null,
    expectedRevision: context.expectedRevision ?? null,
    body: context.body || {},
  });
  const inserted = await client.query(
    `INSERT INTO grounded_trust_command_receipts (
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
  if (inserted.rowCount === 1) return { replay: false };

  const existing = await client.query(
    `SELECT resource_id, request_hash, response_status, response_body
       FROM grounded_trust_command_receipts
      WHERE actor_user_id = $1 AND command_type = $2 AND idempotency_key = $3`,
    [context.actor.id, context.commandType, context.idempotencyKey]
  );
  const row = existing.rows[0];
  if (!row || row.request_hash !== requestHash) {
    fail(
      'idempotency_key_reused',
      'Idempotency-Key reused with different command input',
      422,
      'Use a fresh Idempotency-Key when the resource, body, or If-Match revision changes.'
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
  return {
    replay: true,
    response: { status: Number(row.response_status), body: row.response_body },
  };
}

async function completeCommand(client, context, response, resourceId) {
  await client.query(
    `UPDATE grounded_trust_command_receipts
        SET resource_id = COALESCE(resource_id, $4),
            response_status = $5,
            response_body = $6::jsonb,
            completed_at = NOW()
      WHERE actor_user_id = $1 AND command_type = $2 AND idempotency_key = $3`,
    [
      context.actor.id,
      context.commandType,
      context.idempotencyKey,
      resourceId || null,
      response.status,
      JSON.stringify(response.body),
    ]
  );
}

async function executeCommand(context, mutate) {
  return withTx(async (client) => {
    const command = await beginCommand(client, context);
    if (command.replay) return { ...command.response, replay: true };
    const result = await mutate(client);
    await completeCommand(client, context, result, result.resourceId || context.resourceId);
    return { status: result.status, body: result.body, replay: false };
  });
}

function assertRevision(row, expectedRevision, resourceName) {
  const currentRevision = Number(row.revision);
  if (currentRevision !== expectedRevision) {
    fail(
      'trust_revision_mismatch',
      `${resourceName} revision is stale`,
      412,
      `Fetch the latest ${resourceName} before retrying this command.`,
      { expectedRevision, currentRevision }
    );
  }
}

module.exports = { beginCommand, completeCommand, executeCommand, assertRevision };
