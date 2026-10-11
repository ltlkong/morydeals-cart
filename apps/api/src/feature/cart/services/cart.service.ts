import { Inject, Injectable } from "@nestjs/common";
import { PrismaService } from "../../../core/database/services/prisma.service.ts";
import type { Cart } from "../schema/cart.schema.ts";
import { ProductLookupService } from "../../catalog/services/product-lookup.service.ts";

@Injectable()
export class CartService {
  constructor(
    @Inject(PrismaService) private readonly db: PrismaService,
    @Inject(ProductLookupService) private readonly lookup: ProductLookupService,
  ) {}
  async add(userId: string, productUrl: string) {
    await this.db.cartItem.upsert({
      where: { userId_productUrl: { userId, productUrl } },
      create: { userId, productUrl },
      update: {},
    });
  }
  async remove(userId: string, productUrl: string) {
    await this.db.cartItem.deleteMany({ where: { userId, productUrl } });
  }
  async list(userId: string): Promise<Cart> {
    const items = await this.db.cartItem.findMany({
      where: { userId },
      orderBy: { addedAt: "desc" },
    });
    const details = await this.lookup.describe(
      items.map((item) => item.productUrl),
    );
    return {
      items: items.map((item) => ({
        url: item.productUrl,
        addedAt: item.addedAt.toISOString(),
        ...details.get(item.productUrl)!,
      })),
    };
  }
}
