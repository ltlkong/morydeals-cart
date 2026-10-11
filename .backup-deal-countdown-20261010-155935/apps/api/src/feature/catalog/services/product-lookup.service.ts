import { Inject, Injectable } from "@nestjs/common";
import { hash } from "node:crypto";
import { Prisma } from "../../../generated/prisma/client.ts";
import { PrismaService } from "../../../core/database/services/prisma.service.ts";
import {
  ProductDataSchema,
  conditionKey,
  productFacts,
  type Product,
} from "../../products/schema/products.schema.ts";
import { identityUrl } from "@morydeals/capture-contracts";

const identityOf = (url: string) => {
  try {
    return identityUrl(url);
  } catch {
    return url;
  }
};

export type PricePoint = { at: string; amountMinor: number | null };
export type ProductDetails = {
  product: Product | null;
  history: PricePoint[];
};

/** Read-only view of the worker's products and price history, keyed like the worker: SHA-256 of the product URL. */
@Injectable()
export class ProductLookupService {
  constructor(@Inject(PrismaService) private readonly db: PrismaService) {}
  /** Each URL's latest confirmed product and up to 90 days of prices; unknown URLs get null and []. */
  async describe(urls: string[]): Promise<Map<string, ProductDetails>> {
    if (!urls.length) return new Map<string, ProductDetails>();
    // A URL saved before tracking parameters were dropped from identities is answered by its identity's product
    // once that has been captured, and by its own older row until then.
    const candidates = (url: string) => [...new Set([identityOf(url), url])];
    const keys = [...new Set(urls.flatMap(candidates))].map((url) =>
      hash("sha256", url),
    );
    const rows = await this.db.$queryRaw<
      { url: string; data: unknown; observed_at?: Date }[]
    >(
      Prisma.sql`SELECT url, data, last_observed_at AS observed_at FROM public.tracked_products WHERE identity_key IN (${Prisma.join(keys)})`,
    );
    const products = new Map(
      rows.map((row) => [
        row.url,
        row.observed_at
          ? {
              ...(row.data as object),
              observedAt: new Date(row.observed_at).toISOString(),
            }
          : row.data,
      ]),
    );
    const history = await this.history(keys);
    return new Map(
      urls.map((url) => {
        const found =
          candidates(url).find((candidate) => products.has(candidate)) ?? url;
        const product = ProductDataSchema.safeParse(products.get(found));
        const series = history.get(found) ?? new Map<string, PricePoint[]>();
        const shown = product.success
          ? productFacts(product.data, { history: series })
          : null;
        return [
          url,
          {
            product: shown,
            // The primary offer's own condition: a used price never enters the new price's history.
            history: series.get(conditionKey(shown?.condition)) ?? [],
          },
        ];
      }),
    );
  }
  /**
   * The product captured from this exact page URL, if any capture (a visit, a manual capture or the daily refresh)
   * observed it after `since`.
   */
  async capturedFrom(pageUrl: string, since: Date): Promise<string | null> {
    const rows = await this.db.$queryRaw<{ url: string }[]>(Prisma.sql`
      SELECT p.url FROM public.crawler_runs r
      JOIN public.product_observations o ON o.run_id = r.id
      JOIN public.tracked_products p ON p.id = o.product_id
      WHERE r.requested_url = ${pageUrl} AND p.last_observed_at > ${since}
      ORDER BY o.observed_at DESC LIMIT 1`);
    return rows[0]?.url ?? null;
  }
  /**
   * Price history per condition. Keepa Buy Box points are new. Our captures give, per capture and condition, the
   * new series' featured offer (the lowest offer index: the price the page put first) and, for every other
   * condition, its lowest price ("used from"). An offer that states no condition is read with new.
   */
  private async history(keys: string[]) {
    const rows = await this.db.$queryRaw<
      {
        url: string;
        at: Date;
        amount: bigint | null;
        condition?: string | null;
      }[]
    >(Prisma.sql`
      SELECT * FROM (
        SELECT DISTINCT ON (p.url) p.url, e.observed_at AS at, e.amount_minor AS amount, 'new' AS condition
        FROM public.external_price_points e JOIN public.tracked_products p ON p.id = e.product_id
        WHERE p.identity_key IN (${Prisma.join(keys)}) AND e.source = 'keepa' AND e.series = 'buy_box'
          AND e.observed_at <= now() - interval '90 days'
        ORDER BY p.url, e.observed_at DESC
      ) before_window
      UNION ALL
      SELECT p.url, e.observed_at, e.amount_minor, 'new'
      FROM public.external_price_points e JOIN public.tracked_products p ON p.id = e.product_id
      WHERE p.identity_key IN (${Prisma.join(keys)}) AND e.source = 'keepa' AND e.series = 'buy_box'
        AND e.observed_at > now() - interval '90 days'
      UNION ALL
      SELECT url, at, amount, condition FROM (
        SELECT DISTINCT ON (o.id, COALESCE(po.condition, 'new'))
          p.url, o.observed_at AS at, po.amount_minor AS amount, COALESCE(po.condition, 'new') AS condition
        FROM public.price_observations po
        JOIN public.product_observations o ON o.id = po.observation_id
        JOIN public.tracked_products p ON p.id = o.product_id
        WHERE p.identity_key IN (${Prisma.join(keys)})
          AND o.observed_at > now() - interval '90 days'
        ORDER BY o.id, COALESCE(po.condition, 'new'),
          CASE WHEN COALESCE(po.condition, 'new') = 'new' THEN po.offer_index::bigint ELSE po.amount_minor END
      ) captured
      ORDER BY 2`);
    const byUrl = new Map<string, Map<string, PricePoint[]>>();
    for (const row of rows) {
      const series = byUrl.get(row.url) ?? new Map<string, PricePoint[]>();
      const condition = conditionKey(row.condition);
      const points = series.get(condition) ?? [];
      points.push({
        at: new Date(row.at).toISOString(),
        amountMinor: row.amount === null ? null : Number(row.amount),
      });
      series.set(condition, points);
      byUrl.set(row.url, series);
    }
    return byUrl;
  }
}
