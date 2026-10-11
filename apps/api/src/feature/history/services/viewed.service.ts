import { Inject, Injectable } from "@nestjs/common";
import { PrismaService } from "../../../core/database/services/prisma.service.ts";
import type { Viewed } from "../schema/history.schema.ts";
import { ProductLookupService } from "../../catalog/services/product-lookup.service.ts";

/** Product pages this device opened, newest first; separate from the cart, which only holds explicit adds. */
@Injectable()
export class ViewedService {
  constructor(
    @Inject(PrismaService) private readonly db: PrismaService,
    @Inject(ProductLookupService) private readonly lookup: ProductLookupService,
  ) {}
  async record(userId: string, productUrl: string) {
    const viewedAt = new Date();
    await this.db.viewedItem.upsert({
      where: { userId_productUrl: { userId, productUrl } },
      create: { userId, productUrl, viewedAt },
      update: { viewedAt },
    });
  }
  async list(userId: string): Promise<Viewed> {
    const items = await this.db.viewedItem.findMany({
      where: { userId },
      orderBy: { viewedAt: "desc" },
      take: 100,
    });
    const details = await this.lookup.describe(
      items.map((item) => item.productUrl),
    );
    return {
      items: items.map((item) => ({
        url: item.productUrl,
        viewedAt: item.viewedAt.toISOString(),
        ...details.get(item.productUrl)!,
      })),
    };
  }
}
