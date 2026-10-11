import { Inject, Injectable } from "@nestjs/common";
import { Prisma } from "../../../generated/prisma/client.ts";
import { PrismaService } from "../../../core/database/services/prisma.service.ts";
import type { CatalogPage, CatalogQuery } from "../schema/catalog.schema.ts";
import { ProductLookupService } from "./product-lookup.service.ts";
import { decodeCatalogCursor, encodeCatalogCursor } from "./catalog-cursor.ts";

/**
 * The shared product catalog for browsing: every product the worker has stored at an enabled store, the most
 * recently observed first. Nothing in it says who captured, saved or viewed a product.
 */
@Injectable()
export class CatalogService {
  constructor(
    @Inject(PrismaService) private readonly db: PrismaService,
    @Inject(ProductLookupService) private readonly lookup: ProductLookupService,
  ) {}
  async page({ cursor, limit, merchant }: CatalogQuery): Promise<CatalogPage> {
    const after = cursor ? decodeCatalogCursor(cursor) : null;
    // Only enabled stores: products from disabled or unlisted (Others) stores are not browsable.
    const stores = (
      await this.db.merchant.findMany({ where: { enabled: true } })
    ).filter((store) => !merchant || store.id === merchant);
    const domains = [
      ...new Set(
        stores.flatMap((store) => store.domains.map((d) => d.toLowerCase())),
      ),
    ];
    if (!domains.length) return { items: [], nextCursor: null };
    // One extra row says whether another page follows.
    const rows = await this.db.$queryRaw<
      { id: string; url: string; seen: string }[]
    >(Prisma.sql`
      SELECT p.id, p.url, to_char(p.last_observed_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS seen
      FROM public.tracked_products p
      CROSS JOIN LATERAL (
        SELECT lower(substring(p.url from '^[A-Za-z][A-Za-z0-9+.-]*://([^/?#:]+)')) AS host
      ) h
      WHERE EXISTS (
        SELECT 1 FROM unnest(${domains}::text[]) AS d(domain)
        WHERE h.host = d.domain OR right(h.host, length(d.domain) + 1) = '.' || d.domain
      )
      ${
        after
          ? Prisma.sql`AND (p.last_observed_at, p.id) < (${after.seen}::timestamptz, ${after.id})`
          : Prisma.empty
      }
      ORDER BY p.last_observed_at DESC, p.id DESC
      LIMIT ${limit + 1}`);
    const page = rows.slice(0, limit);
    const last = page.at(-1);
    const details = await this.lookup.describe(page.map((row) => row.url));
    return {
      items: page.flatMap((row) => {
        const found = details.get(row.url);
        // A stored product that no longer parses is left out rather than shown half-empty.
        return found?.product ? [{ url: row.url, ...found }] : [];
      }),
      nextCursor:
        rows.length > limit && last
          ? encodeCatalogCursor({ seen: last.seen, id: last.id })
          : null,
    };
  }
}
