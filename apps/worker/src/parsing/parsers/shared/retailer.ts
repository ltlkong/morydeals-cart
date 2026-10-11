import type { PageDocument, ParseResult, Product } from '../types.ts';
import { PARSER_VERSION } from '../version.ts';
import { toMinorUnits } from '../money.ts';

export const record = (v: unknown): Record<string, unknown> =>
  v !== null && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : {};
export const list = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);
/** Schema.org fields that may hold one value or a list. */
export const oneOrMany = (v: unknown): unknown[] =>
  Array.isArray(v) ? v : v === undefined || v === null ? [] : [v];
export const text = (v: unknown): string | undefined =>
  typeof v === 'string' && v.trim() ? v.trim() : undefined;
export function requireValue<T>(value: T | undefined | null, issue: string): T {
  if (value === undefined || value === null) throw new Error(issue);
  return value;
}
export function check(ok: unknown, issue: string): asserts ok {
  if (!ok) throw new Error(issue);
}
/** The page was read before its content rendered (an empty frame, or the previous page after in-app navigation). */
export class IncompletePage extends Error {}
export function checkLoaded(ok: unknown, issue: string): asserts ok {
  if (!ok) throw new IncompletePage(issue);
}
export function amount(value: unknown, currency: string): number {
  return requireValue(toMinorUnits(value, currency), 'Invalid product price');
}
export function compareAt(
  value: unknown,
  current: number,
  currency: string,
  evidence: string,
  issues: string[],
) {
  if (value == null) return {};
  const former = amount(value, currency);
  if (former > 0 && former < current)
    issues.push(`${evidence}: compare-at price is below current price; omitted`);
  return former > current ? { compareAtAmountMinor: former, compareAtEvidence: evidence } : {};
}
export function imageUrls(values: unknown[], base: string): string[] {
  return [
    ...new Set(
      values.flatMap((value) => {
        try {
          if (!text(value)) return [];
          const url = new URL(String(value), base);
          return ['https:', 'http:'].includes(url.protocol) && !url.username && !url.password
            ? [url.href]
            : [];
        } catch {
          return [];
        }
      }),
    ),
  ];
}
export function merchantUrl(value: string, host: string): URL {
  const url = new URL(value);
  check(
    ['http:', 'https:'].includes(url.protocol) &&
      !url.username &&
      !url.password &&
      [host, `www.${host}`].includes(url.hostname) &&
      !url.port,
    'Unsupported merchant URL',
  );
  return url;
}
export function parseRetailer(
  strategy: string,
  document: PageDocument,
  read: (document: PageDocument, issues: string[]) => Product,
): ParseResult {
  const base = { parserVersion: PARSER_VERSION, strategy };
  const issues: string[] = [];
  try {
    return {
      ...base,
      status: 'parsed',
      products: [read(document, issues)],
      issues,
    };
  } catch (error) {
    return {
      ...base,
      status: 'needs_review',
      products: [],
      issues: [error instanceof Error ? error.message : 'Invalid retailer document'],
      ...(error instanceof IncompletePage ? { incomplete: true as const } : {}),
    };
  }
}
export const NON_NEW = /\b(?:used|renewed|refurbished|reconditioned|pre[- ]owned|open[- ]box)\b/i;
