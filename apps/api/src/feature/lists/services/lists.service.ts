import {
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { PrismaService } from "../../../core/database/services/prisma.service.ts";
import { ProductLookupService } from "../../catalog/services/product-lookup.service.ts";
import {
  MAX_LISTS,
  MAX_LIST_ITEMS,
  type ListDetail,
  type Lists,
} from "../schema/lists.schema.ts";

const COVERS = 4;
const items = {
  orderBy: { addedAt: "desc" as const },
  select: { productUrl: true, addedAt: true },
};
const missing = () => new NotFoundException("This list no longer exists.");

/** Each device's named lists of saved products; a separate feature from the cart. */
@Injectable()
export class ListsService {
  constructor(
    @Inject(PrismaService) private readonly db: PrismaService,
    @Inject(ProductLookupService) private readonly lookup: ProductLookupService,
  ) {}

  async overview(userId: string, url?: string): Promise<Lists> {
    const rows = await this.db.shoppingList.findMany({
      where: { userId },
      orderBy: { createdAt: "asc" },
      include: { items },
    });
    const newest = rows.map((row) =>
      row.items.slice(0, COVERS).map((item) => item.productUrl),
    );
    const details = await this.lookup.describe([...new Set(newest.flat())]);
    return {
      lists: rows.map((row, index) => ({
        id: row.id,
        name: row.name,
        itemCount: row.items.length,
        covers: newest[index]!.flatMap((productUrl) => {
          const image = details.get(productUrl)?.product?.images[0];
          return image ? [image] : [];
        }),
        updatedAt: row.updatedAt.toISOString(),
        ...(url
          ? { contains: row.items.some((item) => item.productUrl === url) }
          : {}),
      })),
    };
  }

  async create(userId: string, name: string, url?: string) {
    if ((await this.db.shoppingList.count({ where: { userId } })) >= MAX_LISTS)
      throw new ConflictException(`You can keep up to ${MAX_LISTS} lists.`);
    const list = await this.db.shoppingList.create({
      data: {
        userId,
        name,
        ...(url ? { items: { create: [{ productUrl: url }] } } : {}),
      },
    });
    return { id: list.id };
  }

  async detail(userId: string, id: string): Promise<ListDetail> {
    const list = await this.owned(userId, id);
    const details = await this.lookup.describe(
      list.items.map((item) => item.productUrl),
    );
    return {
      id: list.id,
      name: list.name,
      items: list.items.map((item) => ({
        url: item.productUrl,
        addedAt: item.addedAt.toISOString(),
        product: details.get(item.productUrl)?.product ?? null,
        history: details.get(item.productUrl)?.history ?? [],
      })),
    };
  }

  async rename(userId: string, id: string, name: string) {
    const { count } = await this.db.shoppingList.updateMany({
      where: { id, userId },
      data: { name },
    });
    if (!count) throw missing();
  }

  async remove(userId: string, id: string) {
    const { count } = await this.db.shoppingList.deleteMany({
      where: { id, userId },
    });
    if (!count) throw missing();
  }

  async addItem(userId: string, id: string, productUrl: string) {
    const list = await this.owned(userId, id);
    const present = list.items.some((item) => item.productUrl === productUrl);
    if (!present && list.items.length >= MAX_LIST_ITEMS)
      throw new ConflictException(
        `A list holds up to ${MAX_LIST_ITEMS} products.`,
      );
    await this.db.shoppingListItem.upsert({
      where: { listId_productUrl: { listId: id, productUrl } },
      create: { listId: id, productUrl },
      update: {},
    });
    await this.touch(userId, id);
  }

  async removeItem(userId: string, id: string, productUrl: string) {
    await this.owned(userId, id);
    await this.db.shoppingListItem.deleteMany({
      where: { listId: id, productUrl },
    });
    await this.touch(userId, id);
  }

  private async owned(userId: string, id: string) {
    const list = await this.db.shoppingList.findFirst({
      where: { id, userId },
      include: { items },
    });
    if (!list) throw missing();
    return list;
  }

  /** A list changes when its products do. */
  private touch(userId: string, id: string) {
    return this.db.shoppingList.updateMany({
      where: { id, userId },
      data: { updatedAt: new Date() },
    });
  }
}
