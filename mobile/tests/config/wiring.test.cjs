'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const mobileRoot = path.resolve(__dirname, '../..');

function read(relativePath) {
  return fs.readFileSync(path.join(mobileRoot, relativePath), 'utf8');
}

test('all network transports use the shared API configuration', () => {
  const consumers = [
    'src/services/api.js',
    'src/services/imageUpload.js',
    'src/services/matchSocket.js',
    'src/services/socketService.js',
    'src/screens/shared/ChatScreen.js',
  ];

  for (const file of consumers) {
    const source = read(file);
    assert.match(source, /config\/apiConfig/);
    assert.doesNotMatch(source, /Constants\.expoConfig\?\.extra\?\.apiUrl/);
    assert.doesNotMatch(source, /http:\/\/(?:localhost|192\.168\.)/);
  }
});

test('booking subscriptions use the socket service API rather than private state', () => {
  const source = read('src/screens/customer/ActiveBookingScreen.js');
  assert.doesNotMatch(source, /socketService\.socket/);
  assert.match(source, /socketService\.on\('worker_location'/);
  assert.match(source, /socketService\.off\('worker_location'/);
});

test('push registration supplies a project ID and never logs the token', () => {
  const source = read('src/services/notificationService.js');
  assert.match(source, /getExpoPushTokenAsync\(\{ projectId \}\)/);
  assert.doesNotMatch(source, /console\.(?:log|warn|error)\([^\n]*tokenData\.data/);
  assert.doesNotMatch(source, /Expo push token:/);
});
