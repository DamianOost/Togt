const express = require('express');
const { authMiddleware, requireRole } = require('../middleware/auth');
const { getWorkerEarnings } = require('../services/groundedWorkerPayableLedger');

const router = express.Router();

// GET /api/earnings — authenticated Worker-only projection. Reconciliation
// posts append-only evidence entries only for canonically completed Projects
// whose latest payment exactly matches the locked ZAR commercial snapshot and
// has canonical `paid` state. Refunds or later holds append reversals. Customer
// paid Project value never becomes Worker gross/net, a balance or payout.
router.get('/', authMiddleware, requireRole('labourer'), async (req, res, next) => {
  try {
    const { ledger, legacy } = await getWorkerEarnings(req.user.id);
    const paid = legacy.paid;
    const pending = legacy.pending;
    const jobValue = legacy.jobValue;

    res.set('Cache-Control', 'private, no-store');
    res.json({
      // Backward-compatible aliases remain payment-evidence values. They are
      // not Worker net earnings and are now backed by the canonical ledger.
      today: paid.today,
      this_week: paid.this_week,
      this_month: paid.this_month,
      all_time: paid.all_time,
      paid,
      pending,
      job_value: jobValue,
      daily: legacy.daily,
      worker_payable_ledger: ledger,
      semantics: {
        currency: 'ZAR',
        legacy_totals: 'paid_job_value',
        paid: 'completed_reconciled_paid_project_value_not_worker_net',
        pending: 'completed_project_value_without_current_reconciled_paid_evidence',
        job_value: 'completed_project_locked_or_booking_total',
        ledger_definition: ledger.definition,
        worker_gross_supported: false,
        platform_fee_supported: false,
        worker_net_supported: false,
        available_balance_supported: false,
        payout_supported: false,
      },
    });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
