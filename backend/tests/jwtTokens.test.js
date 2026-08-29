const jwt = require('jsonwebtoken');
const { jwtSecret, jwtRefreshSecret } = require('../src/config/env');
const {
  signAccessToken,
  signRefreshToken,
  verifyAccessToken,
  verifyRefreshToken,
} = require('../src/lib/jwtTokens');

const SUBJECT = {
  id: '11111111-1111-4111-8111-111111111111',
  email: 'typed-token@example.test',
  role: 'customer',
};

describe('purpose-bound JWTs', () => {
  test('mints explicit access and refresh token-type claims', () => {
    const accessToken = signAccessToken(SUBJECT);
    const refreshToken = signRefreshToken({ ...SUBJECT, jti: 'typed-refresh-jti' });

    expect(jwt.decode(accessToken)).toMatchObject({ ...SUBJECT, token_type: 'access' });
    expect(jwt.decode(refreshToken)).toMatchObject({
      ...SUBJECT,
      token_type: 'refresh',
      jti: 'typed-refresh-jti',
    });
    expect(verifyAccessToken(accessToken).id).toBe(SUBJECT.id);
    expect(verifyRefreshToken(refreshToken).id).toBe(SUBJECT.id);
  });

  test('never accepts a refresh token at an access boundary or vice versa', () => {
    const accessToken = signAccessToken(SUBJECT);
    const refreshToken = signRefreshToken({ ...SUBJECT, jti: 'typed-refresh-jti' });

    expect(() => verifyAccessToken(refreshToken)).toThrow();
    expect(() => verifyRefreshToken(accessToken)).toThrow();
  });

  test('rejects a wrong or missing purpose claim even under the expected signing key', () => {
    const refreshClaimSignedAsAccess = jwt.sign(
      { ...SUBJECT, token_type: 'refresh' },
      jwtSecret,
      { algorithm: 'HS256', expiresIn: '5m' }
    );
    const accessClaimSignedAsRefresh = jwt.sign(
      { ...SUBJECT, token_type: 'access', jti: 'wrong-purpose-jti' },
      jwtRefreshSecret,
      { algorithm: 'HS256', expiresIn: '5m' }
    );
    const untypedAccess = jwt.sign(SUBJECT, jwtSecret, {
      algorithm: 'HS256',
      expiresIn: '5m',
    });

    expect(() => verifyAccessToken(refreshClaimSignedAsAccess)).toThrow(/access token/);
    expect(() => verifyRefreshToken(accessClaimSignedAsRefresh)).toThrow(/refresh token/);
    expect(() => verifyAccessToken(untypedAccess)).toThrow(/access token/);
  });
});
