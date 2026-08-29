const cloudinary = require('cloudinary').v2;
const multer = require('multer');

const MAX_PROFILE_IMAGE_BYTES = 5 * 1024 * 1024;
const SUPPORTED_PROFILE_IMAGE_TYPES = Object.freeze([
  'image/jpeg',
  'image/png',
  'image/webp',
]);

class UploadInputError extends Error {
  constructor(code, message) {
    super(message);
    this.name = 'UploadInputError';
    this.code = code;
  }
}

class UploadProviderUnavailableError extends Error {
  constructor() {
    super('Profile image uploads are unavailable');
    this.name = 'UploadProviderUnavailableError';
    this.code = 'UPLOAD_PROVIDER_UNAVAILABLE';
  }
}

function requiredProviderValue(name) {
  const value = process.env[name];
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

const providerConfig = Object.freeze({
  cloud_name: requiredProviderValue('CLOUDINARY_CLOUD_NAME'),
  api_key: requiredProviderValue('CLOUDINARY_API_KEY'),
  api_secret: requiredProviderValue('CLOUDINARY_API_SECRET'),
});

// Credentials prove that a provider can be contacted; they do not constitute
// product approval. This exact, default-off gate prevents an accidentally
// provisioned secret from enabling a legacy upload surface.
const profileImageUploadsEnabled = process.env.PROFILE_IMAGE_UPLOADS_ENABLED === 'true';
const cloudinaryConfigured = profileImageUploadsEnabled
  && Object.values(providerConfig).every(Boolean);

if (cloudinaryConfigured) {
  cloudinary.config(providerConfig);
}

function isCloudinaryConfigured() {
  return cloudinaryConfigured;
}

function hasSupportedSignature(buffer, mimetype) {
  if (!Buffer.isBuffer(buffer) || buffer.length === 0) return false;

  if (mimetype === 'image/jpeg') {
    return buffer.length >= 3
      && buffer[0] === 0xff
      && buffer[1] === 0xd8
      && buffer[2] === 0xff;
  }

  if (mimetype === 'image/png') {
    const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    return buffer.length >= png.length && buffer.subarray(0, png.length).equals(png);
  }

  if (mimetype === 'image/webp') {
    return buffer.length >= 12
      && buffer.subarray(0, 4).toString('ascii') === 'RIFF'
      && buffer.subarray(8, 12).toString('ascii') === 'WEBP';
  }

  return false;
}

const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: MAX_PROFILE_IMAGE_BYTES,
    files: 1,
    fields: 0,
    // Busboy emits partsLimit when the counter reaches this value, so two
    // permits exactly one file part while rejecting any second part.
    parts: 2,
  },
  fileFilter: (_req, file, callback) => {
    if (!SUPPORTED_PROFILE_IMAGE_TYPES.includes(file.mimetype)) {
      callback(new UploadInputError(
        'UNSUPPORTED_IMAGE_TYPE',
        'Profile image must be JPEG, PNG, or WebP'
      ));
      return;
    }
    callback(null, true);
  },
});

function uploadProfileImage(buffer, mimetype) {
  if (!cloudinaryConfigured) {
    return Promise.reject(new UploadProviderUnavailableError());
  }
  if (!hasSupportedSignature(buffer, mimetype)) {
    return Promise.reject(new UploadInputError(
      'INVALID_IMAGE_CONTENT',
      'Profile image content does not match its declared type'
    ));
  }

  return new Promise((resolve, reject) => {
    let stream;
    try {
      stream = cloudinary.uploader.upload_stream({
        resource_type: 'image',
        folder: 'togt/profiles',
        format: 'jpg',
        unique_filename: true,
        overwrite: false,
        transformation: [{ quality: 'auto', width: 500, crop: 'limit' }],
      }, (error, result) => {
        if (error) {
          reject(error);
          return;
        }
        if (!result
          || typeof result.secure_url !== 'string'
          || !result.secure_url.startsWith('https://')
          || typeof result.public_id !== 'string'
          || !result.public_id) {
          reject(new Error('Cloudinary returned an invalid upload result'));
          return;
        }
        resolve({
          url: result.secure_url,
          public_id: result.public_id,
        });
      });
    } catch (error) {
      reject(error);
      return;
    }
    if (!stream || typeof stream.end !== 'function') {
      reject(new Error('Cloudinary did not return an upload stream'));
      return;
    }
    if (typeof stream.once === 'function') stream.once('error', reject);
    stream.end(buffer);
  });
}

module.exports = {
  MAX_PROFILE_IMAGE_BYTES,
  SUPPORTED_PROFILE_IMAGE_TYPES,
  UploadInputError,
  UploadProviderUnavailableError,
  cloudinary,
  upload,
  isCloudinaryConfigured,
  hasSupportedSignature,
  uploadProfileImage,
};
