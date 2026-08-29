const { request, app, db, truncateAll, registerUser, authHeader } = require('./helpers');

beforeEach(async () => {
  await truncateAll();
});

afterAll(async () => {
  if (db.end) await db.end();
});

async function insertCanonicalCompletedProject(customerId, workerId, totalAmount, payment = null) {
  const bookingResult = await db.query(
    `INSERT INTO bookings (
       customer_id, labourer_id, status, operational_phase, skill_needed,
       address, location_lat, location_lng, scheduled_at, total_amount,
       completed_at, phase_updated_at
     ) VALUES (
       $1, $2, 'completed', 'closed', 'Testing service',
       'Private test address', -29.8, 31.0, NOW() + INTERVAL '1 day', $3,
       NOW() - INTERVAL '1 hour', NOW()
     ) RETURNING id`,
    [customerId, workerId, totalAmount]
  );
  const bookingId = bookingResult.rows[0].id;
  const snapshotResult = await db.query(
    `INSERT INTO grounded_project_commercial_snapshots (
       booking_id, version, booking_revision, currency, agreed_total_amount,
       service_label, capture_reason
     ) VALUES ($1, 1, 0, 'ZAR', $2, 'Testing service', 'completion_requested')
     RETURNING id`,
    [bookingId, totalAmount]
  );
  await db.query(
    `INSERT INTO grounded_project_completions (
       booking_id, status, requested_by, snapshot_id, decided_by, decided_at
     ) VALUES ($1, 'confirmed', $2, $3, $4, NOW() - INTERVAL '1 hour')`,
    [bookingId, workerId, snapshotResult.rows[0].id, customerId]
  );
  let paymentId = null;
  if (payment) {
    const paymentResult = await db.query(
      `INSERT INTO payments (booking_id, amount, currency, status, created_at)
       VALUES ($1, $2, 'ZAR', $3, COALESCE($4, NOW()))
       RETURNING id`,
      [bookingId, payment.amount, payment.status, payment.createdAt || null]
    );
    paymentId = paymentResult.rows[0].id;
  }
  return { bookingId, paymentId, snapshotId: snapshotResult.rows[0].id };
}

async function getEarnings(worker) {
  return request(app).get('/api/earnings').set(authHeader(worker.accessToken));
}

describe('GET /api/earnings canonical Worker ledger', () => {
  test('returns safe zero defaults and explicit capability-off money states', async () => {
    const worker = await registerUser({ role: 'labourer' });
    const res = await getEarnings(worker);

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      today: 0,
      this_week: 0,
      this_month: 0,
      all_time: 0,
      paid: { today: 0, this_week: 0, this_month: 0, all_time: 0 },
      pending: { today: 0, this_week: 0, this_month: 0, all_time: 0 },
      job_value: { today: 0, this_week: 0, this_month: 0, all_time: 0 },
      daily: [],
      worker_payable_ledger: {
        schema: 'togt.worker-payable-ledger.v1',
        projects: [],
        entries: [],
        capabilities: {
          workerGross: false,
          platformFee: false,
          workerNet: false,
          availableBalance: false,
          payout: false,
        },
      },
    });
    expect(res.body.semantics.available_balance_supported).toBe(false);
    expect(res.body.semantics.payout_supported).toBe(false);
  });

  test('accounts only exact completed, confirmed and reconciled-paid Project value', async () => {
    const customer = await registerUser({ role: 'customer' });
    const worker = await registerUser({ role: 'labourer' });
    const recognised = await insertCanonicalCompletedProject(
      customer.user.id,
      worker.user.id,
      150,
      { amount: 150, status: 'paid' }
    );
    await insertCanonicalCompletedProject(
      customer.user.id,
      worker.user.id,
      200,
      { amount: 200, status: 'pending' }
    );
    await insertCanonicalCompletedProject(
      customer.user.id,
      worker.user.id,
      75,
      { amount: 100, status: 'paid' }
    );

    const res = await getEarnings(worker);
    expect(res.status).toBe(200);
    expect(res.body.all_time).toBe(150);
    expect(res.body.paid.all_time).toBe(150);
    expect(res.body.pending.all_time).toBe(275);
    expect(res.body.job_value.all_time).toBe(425);
    expect(res.body.worker_payable_ledger.totals.reconciledPaidJobValue.allTime).toBe('150.00');
    expect(res.body.worker_payable_ledger.projects).toHaveLength(1);
    expect(res.body.worker_payable_ledger.projects[0]).toMatchObject({
      projectId: recognised.bookingId,
      ledgerState: 'recognised',
      paymentState: 'paid_online',
      reconciledPaidJobValue: { currency: 'ZAR', amount: '150.00' },
      workerGross: { state: 'unavailable', amount: null },
      platformFee: { state: 'unavailable', amount: null },
      workerNet: { state: 'unavailable', amount: null },
      payout: { supported: false, state: 'unavailable' },
    });

    const accounting = await db.query(
      `SELECT COUNT(*) AS entry_count,
              SUM(reconciled_paid_job_value_delta) AS paid_value,
              COUNT(worker_gross_amount_delta) AS gross_claims,
              COUNT(platform_fee_amount_delta) AS fee_claims,
              COUNT(worker_net_amount_delta) AS net_claims
         FROM grounded_worker_payable_ledger_entries
        WHERE worker_id = $1`,
      [worker.user.id]
    );
    expect(accounting.rows[0]).toMatchObject({
      entry_count: '1',
      paid_value: '150.00',
      gross_claims: '0',
      fee_claims: '0',
      net_claims: '0',
    });
  });

  test('refund appends one reversal and repeated reads cannot duplicate either entry', async () => {
    const customer = await registerUser({ role: 'customer' });
    const worker = await registerUser({ role: 'labourer' });
    const project = await insertCanonicalCompletedProject(
      customer.user.id,
      worker.user.id,
      240,
      { amount: 240, status: 'paid' }
    );

    await Promise.all([getEarnings(worker), getEarnings(worker), getEarnings(worker)]);
    await db.query('UPDATE payments SET status = $2 WHERE id = $1', [project.paymentId, 'refunded']);
    const refunded = await getEarnings(worker);
    const repeated = await getEarnings(worker);

    expect(refunded.status).toBe(200);
    expect(repeated.status).toBe(200);
    expect(refunded.body.paid.all_time).toBe(0);
    expect(refunded.body.worker_payable_ledger.projects[0]).toMatchObject({
      ledgerState: 'reversed',
      latestReasonCode: 'payment_refunded',
      paymentState: 'refunded',
      reconciledPaidJobValue: { amount: '0.00' },
    });
    expect(refunded.body.worker_payable_ledger.entries).toEqual([
      expect.objectContaining({ sequence: 1, type: 'recognition', reconciledPaidJobValueDelta: { currency: 'ZAR', amount: '240.00' } }),
      expect.objectContaining({ sequence: 2, type: 'reversal', reasonCode: 'payment_refunded', reconciledPaidJobValueDelta: { currency: 'ZAR', amount: '-240.00' } }),
    ]);
    const entries = await db.query(
      `SELECT COUNT(*) AS entry_count, SUM(reconciled_paid_job_value_delta) AS current_value
         FROM grounded_worker_payable_ledger_entries WHERE booking_id = $1`,
      [project.bookingId]
    );
    expect(entries.rows[0]).toEqual({ entry_count: '2', current_value: '0.00' });
  });

  test('an open dispute appends a reversal and resolution may only append a fresh recognition', async () => {
    const customer = await registerUser({ role: 'customer' });
    const worker = await registerUser({ role: 'labourer' });
    const project = await insertCanonicalCompletedProject(
      customer.user.id,
      worker.user.id,
      300,
      { amount: 300, status: 'paid' }
    );
    await getEarnings(worker);
    const issue = await db.query(
      `INSERT INTO grounded_project_issues (booking_id, kind, status, opened_by, reason)
       VALUES ($1, 'completion_dispute', 'open', $2, 'Customer opened a factual test dispute')
       RETURNING id`,
      [project.bookingId, customer.user.id]
    );

    const disputed = await getEarnings(worker);
    expect(disputed.body.worker_payable_ledger.projects[0]).toMatchObject({
      ledgerState: 'reversed',
      latestReasonCode: 'project_disputed',
      paymentState: 'disputed',
    });

    await db.query(
      `UPDATE grounded_project_issues
          SET status = 'resolved', resolved_at = NOW()
        WHERE id = $1`,
      [issue.rows[0].id]
    );
    const restored = await getEarnings(worker);
    expect(restored.body.worker_payable_ledger.projects[0]).toMatchObject({
      ledgerState: 'recognised',
      latestReasonCode: 'project_reconciled_again',
      adjustmentCount: 3,
      reconciledPaidJobValue: { amount: '300.00' },
    });
    expect(restored.body.worker_payable_ledger.entries.map((entry) => entry.type)).toEqual([
      'recognition', 'reversal', 'recognition',
    ]);
  });

  test('duplicate paid records and concurrent reads still post one recognition', async () => {
    const customer = await registerUser({ role: 'customer' });
    const worker = await registerUser({ role: 'labourer' });
    const project = await insertCanonicalCompletedProject(
      customer.user.id,
      worker.user.id,
      80,
      { amount: 80, status: 'paid', createdAt: new Date(Date.now() - 1000) }
    );
    await db.query(
      `INSERT INTO payments (booking_id, amount, currency, status, created_at)
       VALUES ($1, 80, 'ZAR', 'paid', NOW())`,
      [project.bookingId]
    );

    const responses = await Promise.all(Array.from({ length: 5 }, () => getEarnings(worker)));
    expect(responses.every((response) => response.status === 200)).toBe(true);
    const entries = await db.query(
      'SELECT entry_sequence FROM grounded_worker_payable_ledger_entries WHERE booking_id = $1',
      [project.bookingId]
    );
    expect(entries.rows).toEqual([{ entry_sequence: 1 }]);
  });

  test('ledger rows are immutable and the projection is role-scoped and privacy-minimised', async () => {
    const customer = await registerUser({ role: 'customer', name: 'Private Customer' });
    const worker = await registerUser({ role: 'labourer' });
    const otherWorker = await registerUser({ role: 'labourer' });
    const project = await insertCanonicalCompletedProject(
      customer.user.id,
      worker.user.id,
      90,
      { amount: 90, status: 'paid' }
    );

    expect((await request(app).get('/api/earnings')).status).toBe(401);
    expect((await request(app).get('/api/earnings').set(authHeader(customer.accessToken))).status).toBe(403);
    const own = await getEarnings(worker);
    const other = await getEarnings(otherWorker);
    expect(own.status).toBe(200);
    expect(own.headers['cache-control']).toBe('private, no-store');
    expect(other.status).toBe(200);
    expect(other.body.worker_payable_ledger.entries).toEqual([]);
    const serialized = JSON.stringify(own.body.worker_payable_ledger);
    expect(serialized).not.toContain(customer.email);
    expect(serialized).not.toContain(customer.phone);
    expect(serialized).not.toContain(customer.name);
    expect(serialized).not.toContain('Private test address');
    expect(serialized).not.toContain(project.paymentId);
    expect(serialized).not.toMatch(/provider|beneficiary/i);

    const entry = own.body.worker_payable_ledger.entries[0];
    await expect(db.query(
      'UPDATE grounded_worker_payable_ledger_entries SET reason_code = reason_code WHERE id = $1',
      [entry.id]
    )).rejects.toThrow(/append-only/);
    await expect(db.query(
      'DELETE FROM grounded_worker_payable_ledger_entries WHERE id = $1',
      [entry.id]
    )).rejects.toThrow(/append-only/);

    const foreignEvidence = await insertCanonicalCompletedProject(
      customer.user.id,
      otherWorker.user.id,
      45,
      { amount: 45, status: 'pending' }
    );
    const insertEvidence = (workerId, snapshotId, paymentId, fingerprint) => db.query(
      `INSERT INTO grounded_worker_payable_ledger_entries (
         booking_id, worker_id, completion_snapshot_id, source_payment_id,
         entry_sequence, entry_type, reason_code, currency,
         reconciled_paid_job_value_delta, source_fingerprint, source_evidence
       ) VALUES (
         $1, $2, $3, $4, 2, 'recognition', 'project_reconciled_again', 'ZAR',
         1, $5, '{}'::jsonb
       )`,
      [project.bookingId, workerId, snapshotId, paymentId, fingerprint]
    );
    await expect(insertEvidence(
      otherWorker.user.id,
      project.snapshotId,
      project.paymentId,
      'a'.repeat(64)
    )).rejects.toThrow(/grounded_worker_ledger_booking_worker_fk|foreign key/i);
    await expect(insertEvidence(
      worker.user.id,
      foreignEvidence.snapshotId,
      project.paymentId,
      'b'.repeat(64)
    )).rejects.toThrow(/grounded_worker_ledger_snapshot_booking_fk|foreign key/i);
    await expect(insertEvidence(
      worker.user.id,
      project.snapshotId,
      foreignEvidence.paymentId,
      'c'.repeat(64)
    )).rejects.toThrow(/grounded_worker_ledger_payment_booking_fk|foreign key/i);
  });
});
