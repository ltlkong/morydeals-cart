import { Inject, Injectable, Logger } from '@nestjs/common';
import { workerConfig, type Configuration } from '../config/worker.config.ts';
import { PrismaService } from '../database/prisma.service.ts';
import { amazonAsin, backfillBatchSize } from './keepa-history.ts';
import { KEEPA_BUY_BOX_COST, KeepaClient } from './keepa.client.ts';

const SOURCE = 'keepa';
const SERIES = 'buy_box';
const REFRESH_AFTER_MS = 24 * 60 * 60 * 1000;

/**
 * One scheduled run: fill Keepa Buy Box history for captured amazon.ca products, never-synced first, then those not
 * refreshed for a day, spending at most the minute's token refill.
 */
@Injectable()
export class HistoryBackfillService {
  private readonly logger = new Logger(HistoryBackfillService.name);
  constructor(
    @Inject(KeepaClient) private readonly keepa: KeepaClient,
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(workerConfig.KEY) private readonly config: Configuration,
  ) {}
  async runOnce(): Promise<{ fetched: number; points: number }> {
    if (!this.keepa.enabled) return { fetched: 0, points: 0 };
    const batch = backfillBatchSize(
      await this.keepa.tokensLeft(),
      this.config.keepa.tokensPerMinute,
      KEEPA_BUY_BOX_COST,
    );
    if (!batch) return { fetched: 0, points: 0 };
    const stale = new Date(Date.now() - REFRESH_AFTER_MS);
    const candidates = await this.prisma.$queryRaw<{ id: string; url: string }[]>`
      SELECT p.id, p.url FROM tracked_products p
      LEFT JOIN external_history_syncs s ON s.product_id = p.id AND s.source = ${SOURCE}
      WHERE p.url LIKE 'https://www.amazon.ca/dp/%' AND (s.product_id IS NULL OR s.last_synced_at < ${stale})
      ORDER BY s.last_synced_at ASC NULLS FIRST, p.last_observed_at DESC
      LIMIT ${batch}`;
    const products = candidates.flatMap((c) => {
      const asin = amazonAsin(c.url);
      return asin ? [{ ...c, asin }] : [];
    });
    if (!products.length) return { fetched: 0, points: 0 };
    const histories = await this.keepa.buyBoxHistory(products.map((p) => p.asin));
    let points = 0;
    for (const product of products) {
      const history = histories.get(product.asin);
      if (history?.length) {
        const written = await this.prisma.externalPricePoint.createMany({
          skipDuplicates: true,
          data: history.map((point) => ({
            productId: product.id,
            source: SOURCE,
            series: SERIES,
            observedAt: point.observedAt,
            amountMinor: point.amountMinor === null ? null : BigInt(point.amountMinor),
            shippingMinor: point.shippingMinor === null ? null : BigInt(point.shippingMinor),
            currency: 'CAD',
          })),
        });
        points += written.count;
      }
      // Recorded even when Keepa has nothing, so an unknown product is not retried every minute.
      const sync = {
        lastSyncedAt: new Date(),
        lastError: history ? null : 'Not found on Keepa',
      };
      await this.prisma.externalHistorySync.upsert({
        where: { productId_source: { productId: product.id, source: SOURCE } },
        create: { productId: product.id, source: SOURCE, ...sync },
        update: sync,
      });
    }
    this.logger.log({ event: 'keepa_backfill', fetched: products.length, points });
    return { fetched: products.length, points };
  }
}
