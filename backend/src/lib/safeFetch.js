/**
 * SSRF defence for outbound webhook delivery.
 *
 * `assertPublicHost(url)` resolves the URL's hostname and throws if any
 * resolved address is in a private / loopback / link-local / CGNAT range.
 * Applied at TWO points so DNS rebinding between create-time and
 * deliver-time cannot route a delivery to an internal target:
 *   1. Subscription create (validateUrl in routes/webhookSubscriptions.js)
 *   2. Dispatcher (deliverOne in services/webhookDispatcher.js)
 *
 * Disabled outside production so dev/test fixtures using 127.0.0.1
 * receivers continue to work — the env-gating mirrors the
 * https-required-in-prod gate in validateUrl.
 */

const net = require('net');
const dns = require('dns').promises;

function isPrivateIPv4(ip) {
  const parts = ip.split('.').map((p) => Number(p));
  if (parts.length !== 4 || parts.some((p) => Number.isNaN(p) || p < 0 || p > 255)) return false;
  const [a, b] = parts;
  if (a === 0) return true;                       // "this network"
  if (a === 10) return true;                      // RFC1918
  if (a === 127) return true;                     // loopback
  if (a === 169 && b === 254) return true;        // link-local + AWS IMDS
  if (a === 172 && b >= 16 && b <= 31) return true; // RFC1918
  if (a === 192 && b === 168) return true;        // RFC1918
  if (a === 100 && b >= 64 && b <= 127) return true; // CGNAT
  if (a >= 224) return true;                      // multicast / reserved
  return false;
}

function isPrivateIPv6(ip) {
  const lower = ip.toLowerCase();
  if (lower === '::1' || lower === '::') return true;
  if (lower.startsWith('fe80:') || lower.startsWith('fec0:')) return true; // link-local / site-local (deprecated)
  if (/^f[cd][0-9a-f]{2}:/.test(lower)) return true; // ULA fc00::/7
  if (lower.startsWith('::ffff:')) {
    // IPv4-mapped — extract and check
    const v4 = lower.slice('::ffff:'.length);
    return isPrivateIPv4(v4);
  }
  return false;
}

async function assertPublicHost(url) {
  if (process.env.NODE_ENV !== 'production' && process.env.WEBHOOK_SSRF_FORCE !== '1') return;
  let parsed;
  try { parsed = new URL(url); } catch (_) { throw new Error(`invalid url: ${url}`); }
  // URL.hostname keeps brackets around IPv6 literals (e.g. "[::1]"); strip them
  // so net.isIP recognises them.
  let host = parsed.hostname;
  if (!host) throw new Error(`url has no hostname: ${url}`);
  if (host.startsWith('[') && host.endsWith(']')) host = host.slice(1, -1);
  if (net.isIP(host)) {
    const fam = net.isIP(host);
    if ((fam === 4 && isPrivateIPv4(host)) || (fam === 6 && isPrivateIPv6(host))) {
      throw new Error(`refusing webhook delivery to private IP ${host}`);
    }
    return;
  }
  let addrs;
  try {
    addrs = await dns.lookup(host, { all: true });
  } catch (err) {
    throw new Error(`DNS lookup failed for ${host}: ${err.message}`);
  }
  for (const a of addrs) {
    if (a.family === 4 && isPrivateIPv4(a.address)) {
      throw new Error(`refusing: ${host} resolves to private IPv4 ${a.address}`);
    }
    if (a.family === 6 && isPrivateIPv6(a.address)) {
      throw new Error(`refusing: ${host} resolves to private IPv6 ${a.address}`);
    }
  }
}

module.exports = { assertPublicHost, isPrivateIPv4, isPrivateIPv6 };
