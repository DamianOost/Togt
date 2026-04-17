const express = require('express');
const router = express.Router();
const { authMiddleware } = require('../middleware/auth');
const { upload } = require('../config/cloudinary');

// POST /upload/profile-image
// Accepts multipart/form-data with field name "image"
// Returns { url, public_id }
router.post(
  '/profile-image',
  authMiddleware,
  upload.single('image'),
  (req, res) => {
    if (!req.file) {
      return res.status(400).json({ error: 'No image file provided' });
    }

    return res.json({
      url: req.file.path,         // Cloudinary secure URL
      public_id: req.file.filename, // Cloudinary public_id
    });
  }
);

module.exports = router;
