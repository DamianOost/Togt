const { request, app, db, truncateAll, registerUser, authHeader } = require('./helpers');

beforeEach(async () => {
  await truncateAll();
});

afterAll(async () => {
  if (db.end) await db.end();
});

describe('labourer foreground location boundary', () => {
  test.each([
    ['patch', { lat: -33.9249, lng: 18.4241 }],
    ['put', { lat: 90, lng: -180 }],
  ])('%s stores valid finite coordinates and acknowledges the heartbeat', async (method, location) => {
    const worker = await registerUser({ role: 'labourer', name: `Location ${method}` });

    const response = await request(app)[method]('/labourers/location')
      .set(authHeader(worker.accessToken))
      .send(location);

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ updated: true });
    const stored = await db.query(
      'SELECT current_lat, current_lng, location_updated_at FROM labourer_profiles WHERE user_id = $1',
      [worker.user.id]
    );
    expect(Number(stored.rows[0].current_lat)).toBe(location.lat);
    expect(Number(stored.rows[0].current_lng)).toBe(location.lng);
    expect(stored.rows[0].location_updated_at).toBeTruthy();
  });

  test.each(['patch', 'put'])('%s rejects malformed and out-of-range coordinates without storing a heartbeat', async (method) => {
    const worker = await registerUser({ role: 'labourer', name: `Invalid location ${method}` });
    const invalidLocations = [
      { lng: 18.4241 },
      { lat: -33.9249 },
      { lat: '-33.9249', lng: 18.4241 },
      { lat: -33.9249, lng: '18.4241' },
      { lat: true, lng: 18.4241 },
      { lat: -90.0001, lng: 18.4241 },
      { lat: 90.0001, lng: 18.4241 },
      { lat: -33.9249, lng: -180.0001 },
      { lat: -33.9249, lng: 180.0001 },
    ];

    for (const location of invalidLocations) {
      const response = await request(app)[method]('/labourers/location')
        .set(authHeader(worker.accessToken))
        .send(location);

      expect(response.status).toBe(400);
      expect(response.body).toMatchObject({ error: 'invalid_location_coordinates' });
    }

    const stored = await db.query(
      'SELECT current_lat, current_lng, location_updated_at FROM labourer_profiles WHERE user_id = $1',
      [worker.user.id]
    );
    expect(stored.rows[0]).toMatchObject({
      current_lat: null,
      current_lng: null,
      location_updated_at: null,
    });
  });

  test.each(['patch', 'put'])('%s returns not found when the authenticated Worker profile is absent', async (method) => {
    const worker = await registerUser({ role: 'labourer', name: `Missing location ${method}` });
    await db.query('DELETE FROM labourer_profiles WHERE user_id = $1', [worker.user.id]);

    const response = await request(app)[method]('/labourers/location')
      .set(authHeader(worker.accessToken))
      .send({ lat: -33.9249, lng: 18.4241 });

    expect(response.status).toBe(404);
    expect(response.body).toEqual({ error: 'Profile not found' });
  });
});
