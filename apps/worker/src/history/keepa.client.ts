import { Inject, Injectable } from '@nestjs/common';
import { workerConfig, type Configuration } from '../config/worker.config.ts';
import { buyBoxPoints, type KeepaPoint } from './keepa-history.ts';

/** Keepa's domain id for amazon.ca. */
const CANADA = 6;
/** Tokens Keepa charges per product for history plus Buy Box data. */
export const KEEPA_BUY_BOX_COST = 3;

/** Thin Keepa API client. The key travels only in the request URL; errors never include it. */
@Injectable()
export class KeepaClient {
  constructor(@Inject(workerConfig.KEY) private readonly config: Configuration) {}
  get enabled() {
    return Boolean(this.config.keepa.apiKey);
  }
  private async get(path: string, query: Record<string, string>) {
    const url = new URL(`https://api.keepa.com/${path}`);
    url.searchParams.set('key', this.config.keepa.apiKey ?? '');
    for (const [name, value] of Object.entries(query)) url.searchParams.set(name, value);
    let response: Response;
    try {
      response = await fetch(url, { signal: AbortSignal.timeout(30_000) });
    } catch {
      throw new Error(`Keepa ${path} request failed`);
    }
    if (!response.ok) throw new Error(`Keepa ${path} returned HTTP ${response.status}`);
    return (await response.json()) as Record<string, unknown>;
  }
  /** Free: the tokens currently available. */
  async tokensLeft(): Promise<number> {
    const body = await this.get('token', {});
    return typeof body.tokensLeft === 'number' ? body.tokensLeft : 0;
  }
  /** Buy Box history for up to 100 amazon.ca ASINs; ASINs Keepa does not know are absent from the map. */
  async buyBoxHistory(asins: readonly string[]): Promise<Map<string, KeepaPoint[]>> {
    const body = await this.get('product', {
      domain: String(CANADA),
      asin: asins.join(','),
      buybox: '1',
      history: '1',
    });
    const histories = new Map<string, KeepaPoint[]>();
    for (const product of Array.isArray(body.products) ? body.products : []) {
      const record = product as { asin?: unknown; domainId?: unknown; csv?: unknown[] };
      if (typeof record.asin !== 'string' || record.domainId !== CANADA) continue;
      if (!asins.includes(record.asin)) continue;
      histories.set(record.asin, buyBoxPoints(record.csv?.[18]));
    }
    return histories;
  }
}
