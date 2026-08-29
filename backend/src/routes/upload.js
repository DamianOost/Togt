const express = require('express');
const multer = require('multer');
const router = express.Router();
const { authMiddleware } = require('../middleware/auth');
const {
  UploadInputError,
  upload,
  isCloudinaryConfigured,
  uploadProfileImage,
} = require('../config/cloudinary');

function requireUploadProvider(_req, res, next) {
  if (!isCloudinaryConfigured()) {
    return res.status(503).json({ error: 'Profile image uploads are unavailable' });
  }
  return next();
}

function receiveProfileImage(req, res, next) {
  upload.single('image')(req, res, (error) => {
    if (!error) return next();
    if (error instanceof UploadInputError) {
      return res.status(415).json({ error: error.message });
    }
    if (error instanceof multer.MulterError) {
      if (error.code === 'LIMIT_FILE_SIZE') {
        return res.status(413).json({ error: 'Profile image exceeds the 5 MB limit' });
      }
      return res.status(400).json({ error: 'Invalid profile image upload' });
    }
    return res.status(400).json({ error: 'Invalid profile image upload' });
  });
}

// POST /upload/profile-image
// Accepts multipart/form-data with field name "image".
// The success response remains { url, public_id } for existing clients.
router.post(
  '/profile-image',
  authMiddleware,
  requireUploadProvider,
  receiveProfileImage,
  async (req, res) => {
    if (!req.file) {
      return res.status(400).json({ error: 'No image file provided' });
    }

    try {
      const result = await uploadProfileImage(req.file.buffer, req.file.mimetype);
      return res.json(result);
    } catch (error) {
      if (error instanceof UploadInputError) {
        return res.status(415).json({ error: error.message });
      }
      return res.status(502).json({ error: 'Profile image upload failed' });
    }
  }
);

module.exports = router;
