const crypto = require('crypto');

function hmacHex(secret, signedString) {
  return crypto.createHmac('sha256', secret).update(signedString).digest('hex');
}

function signPayload(secret, body, timestampSeconds = Math.floor(Date.now() / 1000), previousSecret = null) {
  const ts = String(timestampSeconds);
  const signed = `${ts}.${body}`;
  const v1 = hmacHex(secret, signed);
  let header = `t=${ts},v1=${v1}`;
  let v1Previous = null;
  if (previousSecret) {
    v1Previous = hmacHex(previousSecret, signed);
    header += `,v1=${v1Previous}`;
  }
  return { header, timestamp: ts, v1, v1Previous };
}

function verifySignature(secret, body, header, toleranceSeconds = 300) {
  if (typeof header !== 'string' || !header) return false;
  let ts = null;
  const v1Values = [];
  for (const segment of header.split(',')) {
    const idx = segment.indexOf('=');
    if (idx <= 0) continue;
    const k = segment.slice(0, idx);
    const v = segment.slice(idx + 1);
    if (k === 't') ts = v;
    else if (k === 'v1') v1Values.push(v);
  }
  if (!ts || v1Values.length === 0 || !/^\d+$/.test(ts)) return false;
  const ageSeconds = Math.floor(Date.now() / 1000) - Number(ts);
  if (Math.abs(ageSeconds) > toleranceSeconds) return false;
  const expected = hmacHex(secret, `${ts}.${body}`);
  const expectedBuf = Buffer.from(expected, 'hex');
  for (const v1 of v1Values) {
    if (!/^[a-f0-9]{64}$/.test(v1)) continue;
    const candidate = Buffer.from(v1, 'hex');
    if (expectedBuf.length === candidate.length && crypto.timingSafeEqual(expectedBuf, candidate)) {
      return true;
    }
  }
  return false;
}

module.exports = { signPayload, verifySignature };
