const initChatSockets = require('../src/sockets/chat');
const initLocationSockets = require('../src/sockets/location');
const initMatchSockets = require('../src/sockets/match');
const { signAccessToken, signRefreshToken } = require('../src/lib/jwtTokens');

const SUBJECT = {
  id: '11111111-1111-4111-8111-111111111111',
  email: 'socket-token@example.test',
  role: 'customer',
};

function captureAuthMiddleware(initializer) {
  const namespace = {
    use: jest.fn(),
    on: jest.fn(),
  };
  initializer({ of: jest.fn(() => namespace) });
  return namespace.use.mock.calls[0][0];
}

function authenticate(middleware, token) {
  return new Promise((resolve) => {
    const socket = { handshake: { auth: { token } } };
    middleware(socket, (error) => resolve({ socket, error }));
  });
}

describe.each([
  ['chat', initChatSockets],
  ['location', initLocationSockets],
  ['match', initMatchSockets],
])('%s socket authentication', (_name, initializer) => {
  test('accepts access tokens and rejects refresh tokens', async () => {
    const middleware = captureAuthMiddleware(initializer);
    const access = await authenticate(middleware, signAccessToken(SUBJECT));
    const refresh = await authenticate(
      middleware,
      signRefreshToken({ ...SUBJECT, jti: `${_name}-refresh-jti` })
    );

    expect(access.error).toBeUndefined();
    expect(access.socket.user).toMatchObject({ id: SUBJECT.id, token_type: 'access' });
    expect(refresh.error).toBeInstanceOf(Error);
    expect(refresh.error.message).toBe('Invalid token');
    expect(refresh.socket.user).toBeUndefined();
  });
});
