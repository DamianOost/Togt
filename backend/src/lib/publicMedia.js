'use strict';

function configuredPublicProfileImageOrigin(environment = process.env) {
  const value = environment.PUBLIC_PROFILE_IMAGE_ORIGIN;
  if (typeof value !== 'string' || !value.trim()) return null;
  try {
    const parsed = new URL(value.trim());
    if (parsed.protocol !== 'https:'
        || !parsed.hostname
        || parsed.username
        || parsed.password
        || parsed.pathname !== '/'
        || parsed.search
        || parsed.hash) return null;
    return parsed.origin;
  } catch {
    return null;
  }
}

function approvedPublicProfileImageUrl(value, environment = process.env) {
  const approvedOrigin = configuredPublicProfileImageOrigin(environment);
  if (!approvedOrigin || typeof value !== 'string' || value.length > 2_048) return null;
  try {
    const parsed = new URL(value);
    if (parsed.protocol !== 'https:'
        || parsed.origin !== approvedOrigin
        || parsed.username
        || parsed.password) return null;

    // Cloudinary shares one hostname across tenants. When that origin is
    // selected, bind the first path segment to this deployment's cloud name
    // so an arbitrary account cannot become a public tracking pixel.
    if (parsed.hostname.toLowerCase() === 'res.cloudinary.com') {
      const cloudName = environment.CLOUDINARY_CLOUD_NAME?.trim();
      const firstSegment = parsed.pathname.split('/').filter(Boolean)[0];
      if (!cloudName || firstSegment !== cloudName) return null;
    }
    parsed.hash = '';
    return parsed.toString();
  } catch {
    return null;
  }
}

module.exports = {
  approvedPublicProfileImageUrl,
  configuredPublicProfileImageOrigin,
};
