const jwt = require('jsonwebtoken');
const {
  jwtSecret,
  jwtRefreshSecret,
  jwtExpiresIn,
  jwtRefreshExpiresIn,
} = require('../config/env');

const TOKEN_TYPES = Object.freeze({
  ACCESS: 'access',
  REFRESH: 'refresh',
});

function signAccessToken(payload) {
  return jwt.sign(
    { ...payload, token_type: TOKEN_TYPES.ACCESS },
    jwtSecret,
    { algorithm: 'HS256', expiresIn: jwtExpiresIn }
  );
}

function signRefreshToken(payload) {
  return jwt.sign(
    { ...payload, token_type: TOKEN_TYPES.REFRESH },
    jwtRefreshSecret,
    { algorithm: 'HS256', expiresIn: jwtRefreshExpiresIn }
  );
}

function verifyTokenType(token, secret, expectedType) {
  const decoded = jwt.verify(token, secret, { algorithms: ['HS256'] });
  if (!decoded || decoded.token_type !== expectedType) {
    throw new jwt.JsonWebTokenError(`Expected a ${expectedType} token`);
  }
  return decoded;
}

function verifyAccessToken(token) {
  return verifyTokenType(token, jwtSecret, TOKEN_TYPES.ACCESS);
}

function verifyRefreshToken(token) {
  return verifyTokenType(token, jwtRefreshSecret, TOKEN_TYPES.REFRESH);
}

module.exports = {
  TOKEN_TYPES,
  signAccessToken,
  signRefreshToken,
  verifyAccessToken,
  verifyRefreshToken,
};
