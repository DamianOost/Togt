const express = require('express');
const db = require('../config/db');
const { authMiddleware, requireRole } = require('../middleware/auth');

const router = express.Router();

// GET /api/earnings — returns today/week/month totals + daily breakdown
router.get('/', authMiddleware, requireRole('labourer'), async (req, res, next) => {
  try {
    const userId = req.user.id;

    // Totals for today, week, month
    const totalsResult = await db.query(
      `SELECT
         SUM(CASE WHEN b.completed_at >= CURRENT_DATE THEN b.total_amount ELSE 0 END)               AS today,
         SUM(CASE WHEN b.completed_at >= DATE_TRUNC('week', NOW()) THEN b.total_amount ELSE 0 END)  AS this_week,
         SUM(CASE WHEN b.completed_at >= DATE_TRUNC('month', NOW()) THEN b.total_amount ELSE 0 END) AS this_month,
         SUM(b.total_amount)                                                                         AS all_time
       FROM bookings b
       WHERE b.labourer_id = $1
         AND b.status = 'completed'
         AND b.total_amount IS NOT NULL`,
      [userId]
    );

    // Daily breakdown for the last 30 days (for charting)
    const dailyResult = await db.query(
      `SELECT
         DATE(b.completed_at) AS date,
         COUNT(*)             AS booking_count,
         SUM(b.total_amount)  AS amount
       FROM bookings b
       WHERE b.labourer_id = $1
         AND b.status = 'completed'
         AND b.total_amount IS NOT NULL
         AND b.completed_at >= NOW() - INTERVAL '30 days'
       GROUP BY DATE(b.completed_at)
       ORDER BY date ASC`,
      [userId]
    );

    const totals = totalsResult.rows[0];
    res.json({
      today: parseFloat(totals.today || 0),
      this_week: parseFloat(totals.this_week || 0),
      this_month: parseFloat(totals.this_month || 0),
      all_time: parseFloat(totals.all_time || 0),
      daily: dailyResult.rows.map((row) => ({
        date: row.date,
        booking_count: parseInt(row.booking_count),
        amount: parseFloat(row.amount),
      })),
    });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
