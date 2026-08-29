const express = require('express');
const request = require('supertest');

const PROVIDER_ENV = [
  'CLOUDINARY_CLOUD_NAME',
  'CLOUDINARY_API_KEY',
  'CLOUDINARY_API_SECRET',
  'PROFILE_IMAGE_UPLOADS_ENABLED',
];

const originalProviderEnv = Object.fromEntries(
  PROVIDER_ENV.map((name) => [name, process.env[name]])
);

function restoreProviderEnv() {
  for (const name of PROVIDER_ENV) {
    const value = originalProviderEnv[name];
    if (value === undefined) delete process.env[name];
    else process.env[name] = value;
  }
}

function setProviderEnv(configured, enabled) {
  for (const name of PROVIDER_ENV) delete process.env[name];
  if (enabled) process.env.PROFILE_IMAGE_UPLOADS_ENABLED = 'true';
  if (configured === 'partial') {
    process.env.CLOUDINARY_CLOUD_NAME = 'test-cloud';
    process.env.CLOUDINARY_API_KEY = 'test-key';
  } else if (configured) {
    process.env.CLOUDINARY_CLOUD_NAME = 'test-cloud';
    process.env.CLOUDINARY_API_KEY = 'test-key';
    process.env.CLOUDINARY_API_SECRET = 'test-secret';
  }
}

function loadUploadApp({
  configured = true,
  enabled = true,
  uploadResult,
  uploadError,
} = {}) {
  jest.resetModules();
  setProviderEnv(configured, enabled);

  const capture = { config: null, options: null, buffer: null };
  jest.doMock('cloudinary', () => {
    const { PassThrough } = require('stream');
    return {
      v2: {
        config: jest.fn((value) => { capture.config = value; }),
        uploader: {
          upload_stream: jest.fn((options, callback) => {
            capture.options = options;
            const stream = new PassThrough();
            const chunks = [];
            stream.on('data', (chunk) => chunks.push(Buffer.from(chunk)));
            stream.on('finish', () => {
              capture.buffer = Buffer.concat(chunks);
              callback(
                uploadError || null,
                uploadResult || {
                  secure_url: 'https://res.cloudinary.com/test/profile.jpg',
                  public_id: 'togt/profiles/profile',
                }
              );
            });
            return stream;
          }),
        },
      },
    };
  });
  jest.doMock('../src/middleware/auth', () => ({
    authMiddleware: (req, _res, next) => {
      req.user = { id: 'test-user', role: 'customer' };
      next();
    },
  }));

  const app = express();
  app.use('/upload', require('../src/routes/upload'));
  return { app, capture };
}

afterEach(() => {
  restoreProviderEnv();
  jest.resetModules();
  jest.dontMock('cloudinary');
  jest.dontMock('../src/middleware/auth');
});

afterAll(restoreProviderEnv);

describe('profile image upload security boundary', () => {
  test('fails closed before buffering when provider configuration is absent', async () => {
    const { app, capture } = loadUploadApp({ configured: false });

    const response = await request(app)
      .post('/upload/profile-image')
      .attach('image', Buffer.from([0xff, 0xd8, 0xff, 0xd9]), {
        filename: 'profile.jpg',
        contentType: 'image/jpeg',
      });

    expect(response.status).toBe(503);
    expect(response.body).toEqual({ error: 'Profile image uploads are unavailable' });
    expect(capture.config).toBeNull();
    expect(capture.buffer).toBeNull();
  });

  test('treats partial provider credentials as unavailable', async () => {
    const { app, capture } = loadUploadApp({ configured: 'partial' });

    const response = await request(app)
      .post('/upload/profile-image')
      .attach('image', Buffer.from([0xff, 0xd8, 0xff, 0xd9]), {
        filename: 'profile.jpg',
        contentType: 'image/jpeg',
      });

    expect(response.status).toBe(503);
    expect(capture.config).toBeNull();
    expect(capture.buffer).toBeNull();
  });

  test('keeps uploads disabled when credentials exist but the reviewed gate is off', async () => {
    const { app, capture } = loadUploadApp({ enabled: false });

    const response = await request(app)
      .post('/upload/profile-image')
      .attach('image', Buffer.from([0xff, 0xd8, 0xff, 0xd9]), {
        filename: 'profile.jpg',
        contentType: 'image/jpeg',
      });

    expect(response.status).toBe(503);
    expect(capture.config).toBeNull();
    expect(capture.buffer).toBeNull();
  });

  test('rejects unsupported declared MIME types without calling Cloudinary', async () => {
    const { app, capture } = loadUploadApp();

    const response = await request(app)
      .post('/upload/profile-image')
      .attach('image', Buffer.from('not-an-image'), {
        filename: 'profile.txt',
        contentType: 'text/plain',
      });

    expect(response.status).toBe(415);
    expect(response.body.error).toMatch(/JPEG, PNG, or WebP/);
    expect(capture.buffer).toBeNull();
  });

  test('rejects content whose signature does not match its declared type', async () => {
    const { app, capture } = loadUploadApp();

    const response = await request(app)
      .post('/upload/profile-image')
      .attach('image', Buffer.from('spoofed-image'), {
        filename: 'profile.jpg',
        contentType: 'image/jpeg',
      });

    expect(response.status).toBe(415);
    expect(response.body.error).toMatch(/does not match/);
    expect(capture.buffer).toBeNull();
  });

  test('enforces the five megabyte limit before provider upload', async () => {
    const { app, capture } = loadUploadApp();
    const oversized = Buffer.alloc((5 * 1024 * 1024) + 1, 0);
    oversized.set([0xff, 0xd8, 0xff], 0);

    const response = await request(app)
      .post('/upload/profile-image')
      .attach('image', oversized, {
        filename: 'profile.jpg',
        contentType: 'image/jpeg',
      });

    expect(response.status).toBe(413);
    expect(response.body.error).toMatch(/5 MB/);
    expect(capture.buffer).toBeNull();
  });

  test('uses only fixed transformations and preserves the success response contract', async () => {
    const image = Buffer.from([0xff, 0xd8, 0xff, 0xd9]);
    const { app, capture } = loadUploadApp();

    const response = await request(app)
      .post('/upload/profile-image')
      .attach('image', image, {
        filename: 'attacker&argument.jpg',
        contentType: 'image/jpeg',
      });

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      url: 'https://res.cloudinary.com/test/profile.jpg',
      public_id: 'togt/profiles/profile',
    });
    expect(capture.config).toEqual({
      cloud_name: 'test-cloud',
      api_key: 'test-key',
      api_secret: 'test-secret',
    });
    expect(capture.options).toEqual({
      resource_type: 'image',
      folder: 'togt/profiles',
      format: 'jpg',
      unique_filename: true,
      overwrite: false,
      transformation: [{ quality: 'auto', width: 500, crop: 'limit' }],
    });
    expect(capture.options).not.toHaveProperty('public_id');
    expect(capture.buffer).toEqual(image);
  });

  test('sanitises provider failures and never exposes the upstream error', async () => {
    const { app } = loadUploadApp({
      uploadError: new Error('api_secret=test-secret upstream detail'),
    });

    const response = await request(app)
      .post('/upload/profile-image')
      .attach('image', Buffer.from([0xff, 0xd8, 0xff, 0xd9]), {
        filename: 'profile.jpg',
        contentType: 'image/jpeg',
      });

    expect(response.status).toBe(502);
    expect(response.body).toEqual({ error: 'Profile image upload failed' });
    expect(JSON.stringify(response.body)).not.toContain('test-secret');
  });
});
