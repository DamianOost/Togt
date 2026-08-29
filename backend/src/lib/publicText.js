'use strict';

// One contact-details definition protects every user-authored public text
// surface. Write routes reject new values; public serializers still quarantine
// historical/direct-database rows because schema migrations cannot prove that
// legacy content passed today's policy.
const PUBLIC_CONTACT_RE = /(?:\+?27|0)[\s-]?[6-8][\d\s-]{7,12}\d|[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i;

function containsPublicContactDetails(value) {
  return typeof value === 'string' && PUBLIC_CONTACT_RE.test(value);
}

function publicTextOrNull(value, { maxLength = 2_048 } = {}) {
  if (typeof value !== 'string') return null;
  const text = value.trim();
  if (!text || text.length > maxLength || text.includes('\u0000')) return null;
  return containsPublicContactDetails(text) ? null : text;
}

module.exports = {
  PUBLIC_CONTACT_RE,
  containsPublicContactDetails,
  publicTextOrNull,
};
