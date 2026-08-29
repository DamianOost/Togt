const crypto = require('crypto');
const db = require('../config/db');

const LEDGER_SCHEMA = 'togt.worker-payable-ledger.v1';
const LEDGER_DEFINITION = 'completed_reconciled_paid_project_value_not_worker_net_v1';

function amount(value) {
  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function count(value) {
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : 0;
}

function moneyUnavailable(reasonCode) {
  return {
    state: 'unavailable',
    amount: null,
    reasonCode,
  };
}

function periodTotals(row, prefix) {
  return {
    today: amount(row[`${prefix}_today`]),
    this_week: amount(row[`${prefix}_this_week`]),
    this_month: amount(row[`${prefix}_this_month`]),
    all_time: amount(row[`${prefix}_all_time`]),
  };
}

function reversalReason(row) {
  if (row.completion_status === 'disputed' || row.has_open_project_issue) {
    return 'project_disputed';
  }
  if (row.has_open_support_issue || row.has_safety_hold) return 'project_hold_applied';
  if (row.payment_status === 'refunded') return 'payment_refunded';
  if (row.booking_status !== 'completed' || !['confirmed', 'timed_out'].includes(row.completion_status)) {
    return 'project_completion_reversed';
  }
  return 'payment_reconciliation_reversed';
}

function paymentState(row) {
  if (row.completion_status === 'disputed' || row.has_open_project_issue || row.has_open_support_issue || row.has_safety_hold) {
    return 'disputed';
  }
  if (row.payment_status === 'refunded') return 'refunded';
  if (amount(row.current_reconciled_value) > 0) return 'paid_online';
  return 'awaiting_reconciliation';
}

function fingerprint(payload) {
  return crypto.createHash('sha256').update(JSON.stringify(payload)).digest('hex');
}

const RECONCILIATION_CANDIDATES = `
  WITH candidates AS (
    SELECT
      b.id AS booking_id,
      b.labourer_id AS worker_id,
      b.status AS booking_status,
      b.completed_at,
      completion.status AS completion_status,
      completion.snapshot_id AS completion_snapshot_id,
      snapshot.currency AS commercial_currency,
      snapshot.agreed_total_amount AS commercial_amount,
      payment.id AS payment_id,
      payment.status AS payment_status,
      payment.currency AS payment_currency,
      payment.amount AS payment_amount,
      EXISTS (
        SELECT 1 FROM grounded_project_issues issue
         WHERE issue.booking_id = b.id
           AND issue.status IN ('open', 'acknowledged', 'under_review')
      ) AS has_open_project_issue,
      EXISTS (
        SELECT 1 FROM grounded_support_incidents incident
         WHERE incident.booking_id = b.id
           AND incident.state IN ('received', 'acknowledged', 'escalated')
      ) AS has_open_support_issue,
      EXISTS (
        SELECT 1 FROM sos_events legacy_sos
         WHERE legacy_sos.booking_id = b.id
      ) AS has_safety_hold,
      COALESCE(ledger.current_reconciled_value, 0)::numeric AS current_reconciled_value,
      COALESCE(ledger.last_sequence, 0)::integer AS last_sequence
    FROM bookings b
    JOIN grounded_project_completions completion ON completion.booking_id = b.id
    JOIN grounded_project_commercial_snapshots snapshot ON snapshot.id = completion.snapshot_id
    LEFT JOIN LATERAL (
      SELECT p.id, p.status, p.currency, p.amount
        FROM payments p
       WHERE p.booking_id = b.id
       ORDER BY p.created_at DESC, p.id DESC
       LIMIT 1
    ) payment ON TRUE
    LEFT JOIN LATERAL (
      SELECT
        SUM(entry.reconciled_paid_job_value_delta)::numeric AS current_reconciled_value,
        MAX(entry.entry_sequence)::integer AS last_sequence
      FROM grounded_worker_payable_ledger_entries entry
      WHERE entry.booking_id = b.id
    ) ledger ON TRUE
    WHERE b.labourer_id = $1
      AND (
        b.status = 'completed'
        OR EXISTS (
          SELECT 1 FROM grounded_worker_payable_ledger_entries existing
           WHERE existing.booking_id = b.id
        )
      )
    FOR UPDATE OF b
  ), desired AS (
    SELECT candidates.*,
      CASE
        WHEN booking_status = 'completed'
         AND completion_status IN ('confirmed', 'timed_out')
         AND completed_at IS NOT NULL
         AND commercial_amount IS NOT NULL
         AND commercial_amount > 0
         AND commercial_currency = 'ZAR'
         AND payment_status = 'paid'
         AND payment_amount = commercial_amount
         AND payment_currency = commercial_currency
         AND NOT has_open_project_issue
         AND NOT has_open_support_issue
         AND NOT has_safety_hold
        THEN commercial_amount
        ELSE 0::numeric
      END AS desired_reconciled_value
    FROM candidates
  )
  SELECT desired.*,
         (desired_reconciled_value - current_reconciled_value)::numeric AS delta_value
    FROM desired
   ORDER BY booking_id`;

async function reconcileEntries(client, workerId) {
  // Serialise all reads that may post evidence for one Worker. The subsequent
  // delta check makes repeated and concurrent projections idempotent.
  await client.query(
    'SELECT pg_advisory_xact_lock(hashtext($1))',
    [`grounded-worker-ledger:${workerId}`]
  );
  const candidates = await client.query(RECONCILIATION_CANDIDATES, [workerId]);
  for (const row of candidates.rows) {
    if (amount(row.delta_value) === 0) continue;

    const positive = amount(row.delta_value) > 0;
    const entrySequence = Number(row.last_sequence) + 1;
    const reasonCode = positive
      ? (Number(row.last_sequence) === 0 ? 'project_reconciled_paid' : 'project_reconciled_again')
      : reversalReason(row);
    const sourceEvidence = {
      schema: LEDGER_SCHEMA,
      bookingStatus: row.booking_status,
      completionStatus: row.completion_status,
      paymentStatus: row.payment_status || 'not_created',
      currency: row.commercial_currency,
      reconciledAmount: row.desired_reconciled_value,
      projectIssueOpen: row.has_open_project_issue,
      supportIssueOpen: row.has_open_support_issue,
      safetyHoldOpen: row.has_safety_hold,
    };
    const sourceFingerprint = fingerprint({
      bookingId: row.booking_id,
      entrySequence,
      entryType: positive ? 'recognition' : 'reversal',
      reasonCode,
      sourcePaymentId: row.payment_id || null,
      delta: row.delta_value,
      evidence: sourceEvidence,
    });

    await client.query(
      `INSERT INTO grounded_worker_payable_ledger_entries (
         booking_id, worker_id, completion_snapshot_id, source_payment_id,
         entry_sequence, entry_type, reason_code, currency,
         reconciled_paid_job_value_delta, source_fingerprint, source_evidence
       ) VALUES ($1, $2, $3, $4, $5, $6, $7, 'ZAR', $8, $9, $10::jsonb)
       ON CONFLICT (booking_id, source_fingerprint) DO NOTHING`,
      [
        row.booking_id,
        workerId,
        row.completion_snapshot_id,
        row.payment_id,
        entrySequence,
        positive ? 'recognition' : 'reversal',
        reasonCode,
        row.delta_value,
        sourceFingerprint,
        JSON.stringify(sourceEvidence),
      ]
    );
  }
}

const LEDGER_PROJECTS = `
  WITH ledger AS (
    SELECT
      entry.booking_id,
      entry.worker_id,
      SUM(entry.reconciled_paid_job_value_delta)::numeric AS current_reconciled_value,
      COUNT(*)::integer AS adjustment_count,
      MAX(entry.entry_sequence)::integer AS last_sequence
    FROM grounded_worker_payable_ledger_entries entry
    WHERE entry.worker_id = $1
    GROUP BY entry.booking_id, entry.worker_id
  )
  SELECT
    ledger.booking_id,
    ledger.current_reconciled_value,
    ledger.adjustment_count,
    booking.completed_at,
    completion.status AS completion_status,
    snapshot.service_label,
    latest.id AS ledger_entry_id,
    latest.entry_type,
    latest.reason_code,
    latest.occurred_at AS ledger_updated_at,
    payment.status AS payment_status,
    EXISTS (
      SELECT 1 FROM grounded_project_issues issue
       WHERE issue.booking_id = booking.id
         AND issue.status IN ('open', 'acknowledged', 'under_review')
    ) AS has_open_project_issue,
    EXISTS (
      SELECT 1 FROM grounded_support_incidents incident
       WHERE incident.booking_id = booking.id
         AND incident.state IN ('received', 'acknowledged', 'escalated')
    ) AS has_open_support_issue,
    EXISTS (
      SELECT 1 FROM sos_events legacy_sos
       WHERE legacy_sos.booking_id = booking.id
    ) AS has_safety_hold
  FROM ledger
  JOIN bookings booking ON booking.id = ledger.booking_id
  JOIN grounded_project_completions completion ON completion.booking_id = booking.id
  JOIN grounded_project_commercial_snapshots snapshot ON snapshot.id = completion.snapshot_id
  JOIN grounded_worker_payable_ledger_entries latest
    ON latest.booking_id = ledger.booking_id
   AND latest.entry_sequence = ledger.last_sequence
  LEFT JOIN LATERAL (
    SELECT p.status
      FROM payments p
     WHERE p.booking_id = booking.id
     ORDER BY p.created_at DESC, p.id DESC
     LIMIT 1
  ) payment ON TRUE
  ORDER BY booking.completed_at DESC NULLS LAST, ledger.booking_id DESC`;

async function loadLedgerProjection(client, workerId) {
  const projectsResult = await client.query(LEDGER_PROJECTS, [workerId]);
  const entriesResult = await client.query(
      `SELECT id, booking_id, entry_sequence, entry_type, reason_code,
              currency, reconciled_paid_job_value_delta, occurred_at
         FROM grounded_worker_payable_ledger_entries
        WHERE worker_id = $1
        ORDER BY occurred_at ASC, booking_id ASC, entry_sequence ASC`,
      [workerId]
    );
  const totalsResult = await client.query(
      `WITH current_projects AS (
         SELECT entry.booking_id,
                SUM(entry.reconciled_paid_job_value_delta)::numeric AS amount
           FROM grounded_worker_payable_ledger_entries entry
          WHERE entry.worker_id = $1
          GROUP BY entry.booking_id
       )
       SELECT
         COALESCE(SUM(GREATEST(current_projects.amount, 0)), 0) AS all_time,
         COALESCE(SUM(GREATEST(current_projects.amount, 0))
           FILTER (WHERE booking.completed_at >= CURRENT_DATE), 0) AS today,
         COALESCE(SUM(GREATEST(current_projects.amount, 0))
           FILTER (WHERE booking.completed_at >= DATE_TRUNC('week', NOW())), 0) AS this_week,
         COALESCE(SUM(GREATEST(current_projects.amount, 0))
           FILTER (WHERE booking.completed_at >= DATE_TRUNC('month', NOW())), 0) AS this_month
       FROM current_projects
       JOIN bookings booking ON booking.id = current_projects.booking_id`,
      [workerId]
    );

  const projects = projectsResult.rows.map((row) => ({
    ledgerEntryId: row.ledger_entry_id,
    projectId: row.booking_id,
    serviceLabel: row.service_label,
    completedAt: new Date(row.completed_at).toISOString(),
    ledgerState: amount(row.current_reconciled_value) > 0 ? 'recognised' : 'reversed',
    latestReasonCode: row.reason_code,
    adjustmentCount: count(row.adjustment_count),
    reconciledPaidJobValue: {
      currency: 'ZAR',
      amount: String(row.current_reconciled_value),
    },
    workerGross: moneyUnavailable('worker_gross_policy_not_configured'),
    platformFee: moneyUnavailable('platform_fee_policy_not_configured'),
    workerNet: moneyUnavailable('worker_net_policy_not_configured'),
    paymentState: paymentState(row),
    payout: {
      supported: false,
      state: 'unavailable',
      reasonCode: 'payout_capability_unavailable',
    },
    updatedAt: new Date(row.ledger_updated_at).toISOString(),
  }));
  const totals = totalsResult.rows[0];

  return {
    schema: LEDGER_SCHEMA,
    definition: LEDGER_DEFINITION,
    currency: 'ZAR',
    totals: {
      reconciledPaidJobValue: {
        today: String(totals.today),
        thisWeek: String(totals.this_week),
        thisMonth: String(totals.this_month),
        allTime: String(totals.all_time),
      },
      workerGross: moneyUnavailable('worker_gross_policy_not_configured'),
      platformFee: moneyUnavailable('platform_fee_policy_not_configured'),
      workerNet: moneyUnavailable('worker_net_policy_not_configured'),
    },
    projects,
    entries: entriesResult.rows.map((row) => ({
      id: row.id,
      projectId: row.booking_id,
      sequence: count(row.entry_sequence),
      type: row.entry_type,
      reasonCode: row.reason_code,
      reconciledPaidJobValueDelta: {
        currency: row.currency,
        amount: String(row.reconciled_paid_job_value_delta),
      },
      occurredAt: new Date(row.occurred_at).toISOString(),
    })),
    capabilities: {
      workerGross: false,
      platformFee: false,
      workerNet: false,
      availableBalance: false,
      payout: false,
    },
  };
}

const COMPLETED_JOB_VALUE = `
  WITH completed_jobs AS (
    SELECT
      booking.id,
      booking.completed_at,
      GREATEST(COALESCE(snapshot.agreed_total_amount, booking.total_amount, 0), 0)::numeric AS job_value
    FROM bookings booking
    LEFT JOIN grounded_project_completions completion ON completion.booking_id = booking.id
    LEFT JOIN grounded_project_commercial_snapshots snapshot ON snapshot.id = completion.snapshot_id
    WHERE booking.labourer_id = $1
      AND booking.status = 'completed'
      AND COALESCE(snapshot.agreed_total_amount, booking.total_amount) IS NOT NULL
  ), current_ledger AS (
    SELECT entry.booking_id,
           GREATEST(SUM(entry.reconciled_paid_job_value_delta), 0)::numeric AS paid_amount
      FROM grounded_worker_payable_ledger_entries entry
     WHERE entry.worker_id = $1
     GROUP BY entry.booking_id
  ), evidence AS (
    SELECT
      job.id,
      job.completed_at,
      job.job_value,
      LEAST(job.job_value, COALESCE(ledger.paid_amount, 0))::numeric AS paid_amount,
      GREATEST(job.job_value - LEAST(job.job_value, COALESCE(ledger.paid_amount, 0)), 0)::numeric AS pending_amount
    FROM completed_jobs job
    LEFT JOIN current_ledger ledger ON ledger.booking_id = job.id
  )`;

async function loadLegacyEvidence(client, workerId) {
  const totalsResult = await client.query(
      `${COMPLETED_JOB_VALUE}
       SELECT
         COALESCE(SUM(paid_amount) FILTER (WHERE completed_at >= CURRENT_DATE), 0) AS paid_today,
         COALESCE(SUM(paid_amount) FILTER (WHERE completed_at >= DATE_TRUNC('week', NOW())), 0) AS paid_this_week,
         COALESCE(SUM(paid_amount) FILTER (WHERE completed_at >= DATE_TRUNC('month', NOW())), 0) AS paid_this_month,
         COALESCE(SUM(paid_amount), 0) AS paid_all_time,
         COALESCE(SUM(pending_amount) FILTER (WHERE completed_at >= CURRENT_DATE), 0) AS pending_today,
         COALESCE(SUM(pending_amount) FILTER (WHERE completed_at >= DATE_TRUNC('week', NOW())), 0) AS pending_this_week,
         COALESCE(SUM(pending_amount) FILTER (WHERE completed_at >= DATE_TRUNC('month', NOW())), 0) AS pending_this_month,
         COALESCE(SUM(pending_amount), 0) AS pending_all_time,
         COALESCE(SUM(job_value) FILTER (WHERE completed_at >= CURRENT_DATE), 0) AS job_value_today,
         COALESCE(SUM(job_value) FILTER (WHERE completed_at >= DATE_TRUNC('week', NOW())), 0) AS job_value_this_week,
         COALESCE(SUM(job_value) FILTER (WHERE completed_at >= DATE_TRUNC('month', NOW())), 0) AS job_value_this_month,
         COALESCE(SUM(job_value), 0) AS job_value_all_time
       FROM evidence`,
      [workerId]
    );
  const dailyResult = await client.query(
      `${COMPLETED_JOB_VALUE}
       SELECT
         TO_CHAR(DATE(completed_at AT TIME ZONE 'UTC'), 'YYYY-MM-DD') AS date,
         COUNT(*) AS booking_count,
         COUNT(*) FILTER (WHERE paid_amount > 0 AND pending_amount = 0) AS paid_booking_count,
         COUNT(*) FILTER (WHERE paid_amount > 0 AND pending_amount > 0) AS partially_paid_booking_count,
         COUNT(*) FILTER (WHERE pending_amount > 0) AS pending_booking_count,
         SUM(paid_amount) AS paid_amount,
         SUM(pending_amount) AS pending_amount,
         SUM(job_value) AS job_value
       FROM evidence
       WHERE completed_at >= NOW() - INTERVAL '30 days'
       GROUP BY TO_CHAR(DATE(completed_at AT TIME ZONE 'UTC'), 'YYYY-MM-DD')
       ORDER BY date ASC`,
      [workerId]
    );
  const totals = totalsResult.rows[0];
  return {
    paid: periodTotals(totals, 'paid'),
    pending: periodTotals(totals, 'pending'),
    jobValue: periodTotals(totals, 'job_value'),
    daily: dailyResult.rows.map((row) => ({
      date: row.date,
      booking_count: count(row.booking_count),
      amount: amount(row.paid_amount),
      paid_booking_count: count(row.paid_booking_count),
      partially_paid_booking_count: count(row.partially_paid_booking_count),
      pending_booking_count: count(row.pending_booking_count),
      paid_amount: amount(row.paid_amount),
      pending_amount: amount(row.pending_amount),
      job_value: amount(row.job_value),
    })),
  };
}

async function getWorkerEarnings(workerId) {
  return db.withTx(async (client) => {
    await reconcileEntries(client, workerId);
    const ledger = await loadLedgerProjection(client, workerId);
    const legacy = await loadLegacyEvidence(client, workerId);
    return { ledger, legacy };
  });
}

module.exports = {
  LEDGER_SCHEMA,
  LEDGER_DEFINITION,
  getWorkerEarnings,
  reconcileEntries,
  loadLedgerProjection,
  loadLegacyEvidence,
};
