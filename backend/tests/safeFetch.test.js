/**
 * Unit tests for the SSRF defence helper. Covers private IP detection
 * across IPv4 ranges (RFC1918, loopback, link-local, CGNAT, IPv4-mapped IPv6)
 * and asserts the production gate behaves as expected.
 */

const { isPrivateIPv4, isPrivateIPv6, assertPublicHost } = require('../src/lib/safeFetch');

describe('isPrivateIPv4', () => {
  test('catches RFC1918 + loopback + link-local + CGNAT + reserved', () => {
    for (const ip of [
      '10.0.0.1', '10.255.255.255',
      '172.16.0.1', '172.31.255.255',
      '192.168.0.1', '192.168.99.1',
      '127.0.0.1', '127.255.255.255',
      '169.254.169.254',           // AWS IMDS
      '100.64.0.1', '100.127.255.255',  // CGNAT
      '0.0.0.0',
      '224.0.0.1',                 // multicast
    ]) {
      expect(isPrivateIPv4(ip)).toBe(true);
    }
  });

  test('passes public IPv4 addresses', () => {
    for (const ip of [
      '8.8.8.8', '1.1.1.1', '142.250.190.78', '52.86.10.244',
      '172.15.255.255',  // just below the RFC1918 172.16/12 range
      '172.32.0.1',      // just above
      '192.167.255.255', // just below 192.168/16
    ]) {
      expect(isPrivateIPv4(ip)).toBe(false);
    }
  });

  test('rejects malformed input', () => {
    expect(isPrivateIPv4('not-an-ip')).toBe(false);
    expect(isPrivateIPv4('999.999.999.999')).toBe(false);
    expect(isPrivateIPv4('1.2.3')).toBe(false);
  });
});

describe('isPrivateIPv6', () => {
  test('catches loopback, link-local, ULA, IPv4-mapped private', () => {
    expect(isPrivateIPv6('::1')).toBe(true);
    expect(isPrivateIPv6('::')).toBe(true);
    expect(isPrivateIPv6('fe80::1')).toBe(true);
    expect(isPrivateIPv6('fc00::1')).toBe(true);
    expect(isPrivateIPv6('fd00::abcd')).toBe(true);
    expect(isPrivateIPv6('::ffff:10.0.0.1')).toBe(true);
    expect(isPrivateIPv6('::ffff:127.0.0.1')).toBe(true);
  });

  test('passes public IPv6', () => {
    expect(isPrivateIPv6('2606:4700:4700::1111')).toBe(false);  // Cloudflare
    expect(isPrivateIPv6('2001:4860:4860::8888')).toBe(false);  // Google
    expect(isPrivateIPv6('::ffff:8.8.8.8')).toBe(false);
  });
});

describe('assertPublicHost', () => {
  const ORIGINAL_NODE_ENV = process.env.NODE_ENV;
  const ORIGINAL_FORCE = process.env.WEBHOOK_SSRF_FORCE;

  afterEach(() => {
    process.env.NODE_ENV = ORIGINAL_NODE_ENV;
    if (ORIGINAL_FORCE === undefined) delete process.env.WEBHOOK_SSRF_FORCE;
    else process.env.WEBHOOK_SSRF_FORCE = ORIGINAL_FORCE;
  });

  test('no-op outside production unless WEBHOOK_SSRF_FORCE=1', async () => {
    process.env.NODE_ENV = 'test';
    delete process.env.WEBHOOK_SSRF_FORCE;
    await expect(assertPublicHost('http://127.0.0.1:8787/h')).resolves.toBeUndefined();
    await expect(assertPublicHost('http://10.0.0.1/h')).resolves.toBeUndefined();
  });

  test('rejects private IP when WEBHOOK_SSRF_FORCE=1', async () => {
    process.env.NODE_ENV = 'test';
    process.env.WEBHOOK_SSRF_FORCE = '1';
    await expect(assertPublicHost('http://127.0.0.1/h')).rejects.toThrow(/private IP/);
    await expect(assertPublicHost('http://10.0.0.5/h')).rejects.toThrow(/private/);
    await expect(assertPublicHost('http://169.254.169.254/latest/meta-data/')).rejects.toThrow(/private/);
  });

  test('rejects literal IPv6 loopback', async () => {
    process.env.WEBHOOK_SSRF_FORCE = '1';
    await expect(assertPublicHost('http://[::1]/h')).rejects.toThrow(/private/);
  });

  test('passes a literal public IPv4', async () => {
    process.env.WEBHOOK_SSRF_FORCE = '1';
    await expect(assertPublicHost('http://1.1.1.1/h')).resolves.toBeUndefined();
  });

  test('rejects URLs with no hostname', async () => {
    process.env.WEBHOOK_SSRF_FORCE = '1';
    await expect(assertPublicHost('not a url')).rejects.toThrow(/invalid url/);
  });
});
