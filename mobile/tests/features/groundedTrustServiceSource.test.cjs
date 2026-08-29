'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const mobileRoot = path.resolve(__dirname, '..', '..');
const servicePath = path.join(mobileRoot, 'src', 'services', 'groundedTrust.ts');

function serviceSource() {
  return fs.existsSync(servicePath) ? fs.readFileSync(servicePath, 'utf8') : '';
}

function occurrences(source, pattern) {
  return [...source.matchAll(pattern)].length;
}

test('the grounded trust transport is present and owns the exact implemented API families', () => {
  assert.equal(fs.existsSync(servicePath), true, 'missing src/services/groundedTrust.ts');
  const source = serviceSource();

  for (const route of [
    '/api/safety/incidents',
    '/api/support/cases',
    '/api/favourites',
    '/api/blocks',
    '/api/rebook-drafts',
    '/api/recurring-series',
    '/api/trust/fairness',
  ]) {
    assert.equal(source.includes(route), true, `missing exact backend route ${route}`);
  }
  assert.match(source, /\/api\/bookings\/\$\{[^}]+\}\/relationship-eligibility/);
  assert.match(source, /\/api\/bookings\/\$\{[^}]+\}\/rebook-drafts/);
});

test('consequential trust mutations are idempotent, revision-aware and fail closed offline', () => {
  const source = serviceSource();
  assert.match(source, /Idempotency-Key/);
  assert.match(source, /If-Match/);
  assert.match(source, /['"]If-Match['"]:\s*`\\?"\$\{[^}]*revision[^}]*\}\\?"`/);
  assert.match(source, /connectionState/);
  assert.match(source, /connectionState\s*(?:===\s*['"]offline['"]|!==\s*['"]online['"])/);
  assert.match(source, /throw new [A-Za-z]*Offline[A-Za-z]*Error|throw new GroundedTrustError\([^)]*offline/is);
  assert.doesNotMatch(source, /queue(?:Mutation|Request)|offlineQueue|outbox/i, 'offline mutation queuing is not authorised');

  const guards = occurrences(source, /assertOnline\s*\(|requireOnline\s*\(|guardOnline\s*\(|ensureOnline\s*\(/g);
  assert.ok(guards >= 7, `expected the shared online guard at each mutation boundary; found ${guards}`);
});

test('the service exposes fail-closed DTO adapters instead of trusting untyped server payloads', () => {
  const source = serviceSource();
  const adapters = occurrences(source, /\badapt[A-Z][A-Za-z0-9]*(?:Dto|Response)?\s*(?:=|\()/g);
  assert.ok(adapters >= 6, `expected adapters for the trust DTO families; found ${adapters}`);
  assert.match(source, /:\s*unknown\b/);
  assert.match(source, /ContractError|contract[^\n]{0,36}(?:invalid|mismatch|violation)/i);
  for (const discriminator of [
    'record_only',
    'requirements_not_met',
    'no_substitution',
    'explicit_approval_each_time',
    'bookingCreationRequiresReconfirmation',
    'mutualAcceptanceRequired',
  ]) {
    assert.match(source, new RegExp(discriminator));
  }
});

test('only implemented trust capabilities have transport endpoints', () => {
  const source = serviceSource();
  assert.doesNotMatch(source, /\/api\/(?:public-)?(?:live-)?shar(?:e|es)\b/i);
  assert.doesNotMatch(source, /\/api\/notifications?(?:\/|['"`])/i);
  assert.doesNotMatch(source, /\/api\/safety\/incidents\/\$\{[^}]+\}\/(?:acknowledge|escalate|resolve|dispatch)/i);
  assert.doesNotMatch(source, /\/api\/support\/cases\/\$\{[^}]+\}\/(?:acknowledge|escalate|resolve|dispatch)/i);
});

test('relationship, draft and recurrence contracts retain server-authored gates', () => {
  const source = serviceSource();
  assert.match(source, /['"]not_found['"]/, 'idempotent favourite removal must accept the server no-op state');
  for (const gate of [
    'relationshipEligible',
    'requiresConfirmedCompletion',
    'requiresReconciledPaidPayment',
    'requiresNoOpenIssueOrBlock',
    'futureMatchingAllowed',
    'newContactAllowed',
    'recurringRelationshipAllowed',
    'currentPrice',
    'workerAvailability',
    'bookingCreated',
    'supportedByThisEndpoint',
  ]) {
    assert.match(source, new RegExp(gate), `missing server-authored gate ${gate}`);
  }

  for (const action of [
    'accept_terms',
    'propose_terms',
    'request_resume',
    'accept_resume',
    'request_cancel_series',
    'accept_cancel_series',
    'request_occurrence_change',
    'accept_occurrence_change',
    'decline_occurrence_change',
  ]) {
    assert.match(source, new RegExp(`['"]${action}['"]`), `missing recurring action ${action}`);
  }
});
