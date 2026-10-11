import { lookup } from 'node:dns/promises';
import ipaddr from 'ipaddr.js';

export class RejectedUrlError extends Error {}

export function inputUrl(value: unknown): URL {
  if (typeof value !== 'string' || value.length > 4096)
    throw new RejectedUrlError('URL must be a string under 4096 characters');
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new RejectedUrlError('Invalid URL');
  }
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password)
    throw new RejectedUrlError('Only HTTP(S) without credentials is allowed');
  return url;
}
export function publicAddress(address: string): boolean {
  try {
    let parsed = ipaddr.parse(address);
    if (parsed.kind() === 'ipv6' && (parsed as ipaddr.IPv6).isIPv4MappedAddress())
      parsed = (parsed as ipaddr.IPv6).toIPv4Address();
    return parsed.range() === 'unicast';
  } catch {
    return false;
  }
}

export class UrlPolicy {
  constructor(private readonly testLoopback = false) {}
  async address(url: URL): Promise<{ address: string; family: number }> {
    const hostname = url.hostname.replace(/^\[|\]$/g, '').toLowerCase();
    if (!this.testLoopback && url.port && !['80', '443'].includes(url.port))
      throw new RejectedUrlError('Nonstandard ports are not allowed');
    const addresses = await lookup(hostname, { all: true, verbatim: true });
    if (
      !addresses.length ||
      addresses.some(
        (a) =>
          !publicAddress(a.address) &&
          !(this.testLoopback && ['127.0.0.1', '::1'].includes(a.address)),
      )
    ) {
      throw new RejectedUrlError(
        'Private, local and reserved network destinations are not allowed',
      );
    }
    // Prefer IPv4 for dual-stack hosts: upstream proxies may not support IPv6 CONNECT.
    // Validate every DNS answer above; IPv6-only public hosts remain supported.
    return addresses.find((address) => address.family === 4) ?? addresses[0]!;
  }
}
