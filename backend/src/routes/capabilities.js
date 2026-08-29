const express = require('express');
const {
  CACHE_TTL_SECONDS,
  capabilitySnapshot,
} = require('../config/capabilities');

const router = express.Router();

// Public, read-only bootstrap contract. It intentionally contains no tenant,
// provider credential, or environment detail.
router.get('/', (req, res) => {
  res.set('Cache-Control', `public, max-age=${CACHE_TTL_SECONDS}, must-revalidate`);
  res.json(capabilitySnapshot());
});

module.exports = router;
