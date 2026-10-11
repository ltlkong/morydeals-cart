import { Inject, Injectable } from "@nestjs/common";
import { hash } from "node:crypto";
import { Prisma } from "../../../generated/prisma/client.ts";
import { PrismaService } from "../../../core/database/services/prisma.service.ts";
import {
  ProductDataSchema,
  conditionKey,
  offerKey,
  productFacts,
  type OfferHistory,
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
        const series = history.get(found) ?? {
          byCondition: new Map<string, PricePoint[]>(),
          byOffer: new Map<string, PricePoint[]>(),
        };
        const shown = product.success
          ? productFacts(product.data, { history: series })
          : null;
        return [
          url,
          {
            product: shown,
            // The primary offer's own history (a used price never enters the new price's history).
            history: shown?.offers[0].history ?? [],
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
   * Price history, per offer. The primary offer's series is its condition's featured price: per capture, the new
   * offer the page put first (the lowest offer index; Keepa Buy Box points are new too), or for another condition
   * its lowest price. Every other offer has its own series: the prices of the same condition and seller.
   * An offer that states no condition is read with new.
   */
  private async history(keys: string[]) {
    const rows = await this.db.$queryRaw<
      {
        url: string;
        at: Date;
        amount: bigint | null;
        condition?: string | null;
        seller?: string | null;
        observation?: bigint | string | null;
        offer_index?: number | null;
      }[]
    >(Prisma.sql`
      SELECT * FROM (
        SELECT DISTINCT ON (p.url) p.url, e.observed_at AS at, e.amount_minor AS amount, 'new' AS condition,
          NULL::text AS seller, NULL::bigint AS observation, NULL::int AS offer_index
        FROM public.external_price_points e JOIN public.tracked_products p ON p.id = e.product_id
        WHERE p.identity_key IN (${Prisma.join(keys)}) AND e.source = 'keepa' AND e.series = 'buy_box'
          AND e.observed_at <= now() - interval '90 days'
        ORDER BY p.url, e.observed_at DESC
      ) before_window
      UNION ALL
      SELECT p.url, e.observed_at, e.amount_minor, 'new', NULL, NULL, NULL
      FROM public.external_price_points e JOIN public.tracked_products p ON p.id = e.product_id
      WHERE p.identity_key IN (${Prisma.join(keys)}) AND e.source = 'keepa' AND e.series = 'buy_box'
        AND e.observed_at > now() - interval '90 days'
      UNION ALL
      SELECT p.url, o.observed_at, po.amount_minor, po.condition, po.seller, o.id, po.offer_index
      FROM public.price_observations po
      JOIN public.product_observations o ON o.id = po.observation_id
      JOIN public.tracked_products p ON p.id = o.product_id
      WHERE p.identity_key IN (${Prisma.join(keys)})
        AND o.observed_at > now() - interval '90 days'
      ORDER BY 2`);
    // Per URL, per capture (Keepa points are each their own capture), the series' point.
    type Pick = { at: string; amount: number | null; index: number };
    const pick = new Map<string, Map<string, Map<string, Pick>>>();
    const put = (
      url: string,
      kind: "c" | "o",
      key: string,
      capture: string,
      point: Pick,
      better: (a: Pick, b: Pick) => boolean,
    ) => {
      const byUrl = pick.get(url) ?? new Map<string, Map<string, Pick>>();
      const series = byUrl.get(`${kind}${key}`) ?? new Map<string, Pick>();
      const held = series.get(capture);
      if (!held || better(point, held)) series.set(capture, point);
      byUrl.set(`${kind}${key}`, series);
      pick.set(url, byUrl);
    };
    const lower = (a: Pick, b: Pick) =>
      a.amount !== null && (b.amount === null || a.amount < b.amount);
    rows.forEach((row, n) => {
      const at = new Date(row.at).toISOString();
      const point = {
        at,
        amount: row.amount === null ? null : Number(row.amount),
        index: row.offer_index ?? 0,
      };
      const condition = conditionKey(row.condition);
      const capture =
        row.observation == null ? `keepa:${n}` : String(row.observation);
      put(row.url, "c", condition, capture, point, (a, b) =>
        condition === "new" ? a.index < b.index : lower(a, b),
      );
      if (row.observation != null)
        put(
          row.url,
          "o",
          offerKey(row.condition, row.seller),
          capture,
          point,
          lower,
        );
    });
    const result = new Map<string, OfferHistory>();
    for (const [url, all] of pick) {
      const byCondition = new Map<string, PricePoint[]>();
      const byOffer = new Map<string, PricePoint[]>();
      for (const [key, captures] of all) {
        const points = [...captures.values()]
          .sort((a, b) => a.at.localeCompare(b.at))
          .map((p) => ({ at: p.at, amountMinor: p.amount }));
        (key[0] === "c" ? byCondition : byOffer).set(key.slice(1), points);
      }
      result.set(url, { byCondition, byOffer });
    }
    return result;
  }
}
