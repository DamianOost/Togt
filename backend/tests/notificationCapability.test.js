const db = require('../src/config/db');
const { notifyUser } = require('../src/services/notifications');

afterAll(async () => {
  if (db.end) await db.end();
});

describe('remote-push delivery capability', () => {
  test('fails closed before reading a configured token or contacting Expo', async () => {
    const query = jest.spyOn(db, 'query');

    const result = await notifyUser(
      '00000000-0000-0000-0000-000000000001',
      'Disabled',
      'This must not leave the server.'
    );

    expect(result).toEqual({ delivered: false, reason: 'capability_unavailable' });
    expect(query).not.toHaveBeenCalled();
    query.mockRestore();
  });
});
