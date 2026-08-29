'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const mobileRoot = path.resolve(__dirname, '../..');
const read = (relativePath) => fs.readFileSync(path.join(mobileRoot, relativePath), 'utf8');

test('worker quote transport uses authenticated strict request, create, edit and command endpoints', () => {
  const service = read('src/services/groundedMarketplace.ts');
  assert.match(service, /loadGroundedQuoteRequests/);
  assert.match(service, /url: '\/api\/quote-requests'/);
  assert.match(service, /createGroundedQuote[\s\S]*method: 'POST'[\s\S]*\/api\/quote-requests\/\$\{requestIdValueSafe\}\/quotes/);
  assert.match(service, /saveGroundedQuote[\s\S]*method: 'PUT'[\s\S]*\/api\/quotes\/\$\{quoteIdValueSafe\}/);
  assert.match(service, /runGroundedQuoteCommand[\s\S]*\/api\/quotes\/\$\{quoteIdValueSafe\}\/\$\{command\}/);
  assert.match(service, /'Idempotency-Key': idempotencyKey\(key\)/);
});

test('worker quote routes adapt every response and pair discovery, detail, builder and lifecycle commands', () => {
  const routes = read('src/features/worker/integration/WorkerQuoteRoutes.tsx');
  for (const adapter of ['adaptWorkerQuoteRequestListV1', 'adaptWorkerQuoteRequestDetailV1', 'adaptWorkerQuoteCommandV1']) {
    assert.match(routes, new RegExp(adapter));
  }
  assert.match(routes, /navigation\.navigate\('WorkerQuoteRequestDetail', \{ requestId \}\)/);
  assert.match(routes, /navigation\.navigate\('WorkerQuoteBuilder', \{ requestId: id \}\)/);
  assert.match(routes, /createGroundedQuote\(state\.detail\.request\.id, quote, submit, key\)/);
  assert.match(routes, /saveGroundedQuote\(existing\.id, quote, submit, key\)/);
  assert.match(routes, /runGroundedQuoteCommand\(quote\.id, 'withdraw', key\)/);
  assert.match(routes, /validateWorkerQuoteForSubmission/);
  assert.match(routes, /workerQuoteIdempotencyKey/);
});

test('worker request and builder screens keep privacy, unsupported clarification and server money truth explicit', () => {
  const detail = read('src/features/worker/quotes/WorkerQuoteRequestDetailScreen.tsx');
  const builder = read('src/features/worker/quotes/WorkerQuoteBuilderScreen.tsx');
  assert.match(detail, /Exact address and customer contact remain hidden/);
  assert.match(detail, /Clarification thread unavailable/);
  assert.doesNotMatch(detail, /onSend|sendClarification/);
  assert.match(builder, /Save draft/);
  assert.match(builder, /Submit quote/);
  assert.match(builder, /Withdraw quote/);
  assert.match(builder, /Platform fee/);
  assert.match(builder, /Worker net/);
  assert.match(builder, /not yet returned by server/);
  assert.doesNotMatch(detail + builder, /#[\da-f]{3,8}\b/i);
  assert.doesNotMatch(detail + builder, /[\u{1F300}-\u{1FAFF}]/u);
});

test('worker jobs shell exposes quote discovery and stack registers all paired routes', () => {
  const jobs = read('src/features/worker/shell/JobsInboxScreen.tsx');
  const shellRoutes = read('src/features/worker/integration/WorkerShellRoutes.tsx');
  const stack = read('src/navigation/GroundedWorkerStack.tsx');
  assert.match(jobs, /onOpenQuoteRequests/);
  assert.match(jobs, /Quote requests/);
  assert.match(shellRoutes, /navigation\.navigate\('WorkerQuoteRequests'\)/);
  for (const route of ['WorkerQuoteRequests', 'WorkerQuoteRequestDetail', 'WorkerQuoteBuilder']) {
    assert.equal((stack.match(new RegExp(`<Stack\\.Screen name=["']${route}["']`, 'g')) || []).length, 1);
  }
});
