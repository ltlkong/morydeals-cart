import { code as isoCurrency } from 'currency-codes';

/** ISO 4217 data, independent of platform-specific display rounding. */
export function currencyCode(value: unknown): string | undefined {
  if (typeof value !== 'string') return;
  const code = value.trim().toUpperCase();
  if (!/^[A-Z]{3}$/.test(code) || !isoCurrency(code)) return;
  return code;
}

export function currencyDecimals(currency: string): number {
  const record = isoCurrency(currency);
  if (!record) throw new Error(`Unknown currency: ${currency}`);
  return record.digits;
}

/** Exact conversion, without floating-point multiplication or rounding. */
export function toMinorUnits(value: unknown, currency: string): number | undefined {
  if (!currencyCode(currency)) return;
  const source = typeof value === 'number' ? String(value) : value;
  if (typeof source !== 'string' || !/^\d+(?:\.\d+)?$/.test(source)) return;
  const [whole, fraction = ''] = source.split('.');
  const decimals = currencyDecimals(currency);
  if (/[1-9]/.test(fraction.slice(decimals))) return;
  const minor = BigInt(whole + fraction.slice(0, decimals).padEnd(decimals, '0'));
  if (minor > BigInt(Number.MAX_SAFE_INTEGER)) return;
  return Number(minor);
}

export function displayedMinorUnits(value: string, currency: string): number | undefined {
  // Emphasis markers come from markup such as $<strong>209</strong><sup>.98</sup>.
  const number = value.replace(/^~{1,2}([^~]+)~{1,2}$/, '$1').replace(/[A-Za-z$£€¥\s*_]/g, '');
  if (!/^(?:\d+|\d{1,3}(?:,\d{3})+)(?:\.\d+)?$/.test(number)) return;
  return toMinorUnits(number.replaceAll(',', ''), currency);
}
