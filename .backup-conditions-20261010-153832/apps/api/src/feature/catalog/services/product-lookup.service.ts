import { Inject, Injectable } from "@nestjs/common";
import { hash } from "node:crypto";
import { Prisma } from "../../../generated/prisma/client.ts";
import { PrismaService } from "../../../core/database/services/prisma.service.ts";
import {
  ProductDataSchema,
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
        return [
          url,
          {
            product: product.success ? productFacts(product.data) : null,
            history: history.get(found) ?? [],
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
  /** Keepa Buy Box points, our captured prices, and the Keepa price in effect when the window starts. */
  private async history(keys: string[]) {
    const rows = await this.db.$queryRaw<
      { url: string; at: Date; amount: bigint | null }[]
    >(Prisma.sql`
      SELECT * FROM (
        SELECT DISTINCT ON (p.url) p.url, e.observed_at AS at, e.amount_minor AS amount
        FROM public.external_price_points e JOIN public.tracked_products p ON p.id = e.product_id
        WHERE p.identity_key IN (${Prisma.join(keys)}) AND e.source = 'keepa' AND e.series = 'buy_box'
          AND e.observed_at <= now() - interval '90 days'
        ORDER BY p.url, e.observed_at DESC
      ) before_window
      UNION ALL
      SELECT p.url, e.observed_at, e.amount_minor
      FROM public.external_price_points e JOIN public.tracked_products p ON p.id = e.product_id
      WHERE p.identity_key IN (${Prisma.join(keys)}) AND e.source = 'keepa' AND e.series = 'buy_box'
        AND e.observed_at > now() - interval '90 days'
      UNION ALL
      SELECT p.url, o.observed_at, po.amount_minor
      FROM public.price_observations po
      JOIN public.product_observations o ON o.id = po.observation_id
      JOIN public.tracked_products p ON p.id = o.product_id
      WHERE p.identity_key IN (${Prisma.join(keys)}) AND po.offer_index = 0
        AND o.observed_at > now() - interval '90 days'
      ORDER BY 2`);
    const byUrl = new Map<
      string,
      { at: string; amountMinor: number | null }[]
    >();
    for (const row of rows) {
      const points = byUrl.get(row.url) ?? [];
      points.push({
        at: new Date(row.at).toISOString(),
        amountMinor: row.amount === null ? null : Number(row.amount),
      });
      byUrl.set(row.url, points);
    }
    return byUrl;
  }
}
