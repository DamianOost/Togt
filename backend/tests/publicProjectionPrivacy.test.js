const {
  containsReviewContactDetails,
  publicReviewComment,
} = require('../src/lib/publicReview');
const {
  approvedPublicProfileImageUrl,
  configuredPublicProfileImageOrigin,
} = require('../src/lib/publicMedia');
const {
  containsPublicContactDetails,
  publicTextOrNull,
} = require('../src/lib/publicText');

describe('public legacy projection privacy boundaries', () => {
  test('all public free text shares the same contact quarantine rule', () => {
    expect(containsPublicContactDetails('Call 082 555 0199')).toBe(true);
    expect(containsPublicContactDetails('Mail private@example.com')).toBe(true);
    expect(publicTextOrNull('  Careful household repair work.  ', { maxLength: 80 }))
      .toBe('Careful household repair work.');
    expect(publicTextOrNull('Call 082 555 0199', { maxLength: 80 })).toBeNull();
    expect(publicTextOrNull('private@example.com', { maxLength: 80 })).toBeNull();
  });

  test('legacy contact-bearing comments are quarantined while safe text is normalised', () => {
    expect(containsReviewContactDetails('Call 082 555 0199')).toBe(true);
    expect(containsReviewContactDetails('Mail private@example.com')).toBe(true);
    expect(publicReviewComment('Call 082 555 0199')).toBeNull();
    expect(publicReviewComment('Mail private@example.com')).toBeNull();
    expect(publicReviewComment('  Careful and punctual.  ')).toBe('Careful and punctual.');
    expect(publicReviewComment('bad\u0000text')).toBeNull();
  });

  test('public profile images require one explicit exact HTTPS origin', () => {
    expect(configuredPublicProfileImageOrigin({})).toBeNull();
    expect(configuredPublicProfileImageOrigin({
      PUBLIC_PROFILE_IMAGE_ORIGIN: 'http://media.togt.example',
    })).toBeNull();
    expect(approvedPublicProfileImageUrl(
      'https://tracker.attacker.example/pixel.gif',
      { PUBLIC_PROFILE_IMAGE_ORIGIN: 'https://media.togt.example' }
    )).toBeNull();
    expect(approvedPublicProfileImageUrl(
      'https://media.togt.example/togt/profiles/worker.jpg',
      { PUBLIC_PROFILE_IMAGE_ORIGIN: 'https://media.togt.example' }
    )).toBe('https://media.togt.example/togt/profiles/worker.jpg');
  });

  test('Cloudinary public images are additionally bound to the configured tenant', () => {
    const environment = {
      PUBLIC_PROFILE_IMAGE_ORIGIN: 'https://res.cloudinary.com',
      CLOUDINARY_CLOUD_NAME: 'togt-approved',
    };
    expect(approvedPublicProfileImageUrl(
      'https://res.cloudinary.com/attacker/image/upload/pixel.jpg',
      environment
    )).toBeNull();
    expect(approvedPublicProfileImageUrl(
      'https://res.cloudinary.com/togt-approved/image/upload/profile.jpg',
      environment
    )).toBe('https://res.cloudinary.com/togt-approved/image/upload/profile.jpg');
  });
});
