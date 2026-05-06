const { encryptSecret, decryptSecret } = require('../src/lib/webhookSecretCrypto');

describe('webhookSecretCrypto', () => {
  test('round-trips a secret', () => {
    const plain = 'whsec_abcdefghijklmnopqrstuvwxyz0123456789';
    const blob = encryptSecret(plain);
    expect(blob).not.toContain(plain);
    expect(decryptSecret(blob)).toBe(plain);
  });

  test('produces different ciphertext on each call (random IV)', () => {
    const a = encryptSecret('whsec_same');
    const b = encryptSecret('whsec_same');
    expect(a).not.toBe(b);
    expect(decryptSecret(a)).toBe('whsec_same');
    expect(decryptSecret(b)).toBe('whsec_same');
  });

  test('decrypt fails on tampered ciphertext', () => {
    const blob = encryptSecret('whsec_x');
    const tampered = blob.slice(0, -4) + 'AAAA';
    expect(() => decryptSecret(tampered)).toThrow();
  });
});
