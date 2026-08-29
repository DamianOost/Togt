'use strict';

const {
  PUBLIC_CONTACT_RE,
  containsPublicContactDetails,
  publicTextOrNull,
} = require('./publicText');

// Backwards-compatible review names keep ratings callers stable while sharing
// the same public-text contact rule as Worker profiles and offerings.
const REVIEW_CONTACT_RE = PUBLIC_CONTACT_RE;
const containsReviewContactDetails = containsPublicContactDetails;

function publicReviewComment(value) {
  return publicTextOrNull(value, { maxLength: 1_000 });
}

module.exports = {
  REVIEW_CONTACT_RE,
  containsReviewContactDetails,
  publicReviewComment,
};
