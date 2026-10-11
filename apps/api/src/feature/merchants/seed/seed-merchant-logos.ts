import "reflect-metadata";
import { NestFactory } from "@nestjs/core";
import { AppModule } from "../../../app.module.ts";
import { PrismaService } from "../../../core/database/services/prisma.service.ts";
import { StorageService } from "../../../core/storage/services/storage.service.ts";
import {
  MERCHANT_LOGO_POLICY,
  merchantLogoOwner,
} from "../services/merchants.service.ts";
import { MERCHANT_LOGO_SEEDS } from "./merchant-logo-seeds.ts";

const contentTypeOf = (response: Response, sourceUrl: string) => {
  const header = response.headers.get("content-type")?.split(";", 1)[0];
  if (header) return header;
  return "image/png";
};

const app = await NestFactory.createApplicationContext(AppModule, {
  logger: false,
});
try {
  const db = app.get(PrismaService);
  const storage = app.get(StorageService);
  const force = process.argv.includes("--force");
  for (const seed of MERCHANT_LOGO_SEEDS) {
    const merchant = await db.merchant.findUnique({
      where: { id: seed.merchantId },
    });
    if (!merchant) {
      console.warn(`Skipping missing merchant ${seed.merchantId}`);
      continue;
    }
    if (merchant.logoObjectId && !force) {
      console.log(`Keeping existing logo for ${seed.merchantId}`);
      continue;
    }
    const response = await fetch(seed.sourceUrl, {
      headers: { "user-agent": "MoryDeals merchant logo seed" },
    });
    if (!response.ok) {
      throw new Error(
        `Could not download ${seed.merchantId} logo (${response.status})`,
      );
    }
    const contentType = contentTypeOf(response, seed.sourceUrl);
    if (!MERCHANT_LOGO_POLICY.contentTypes.includes(contentType as never))
      throw new Error(`Unsupported logo content type: ${contentType}`);
    const object = await storage.put(
      MERCHANT_LOGO_POLICY,
      new Uint8Array(await response.arrayBuffer()),
      contentType,
      merchantLogoOwner(merchant.id),
    );
    await db.merchant.update({
      where: { id: merchant.id },
      data: { logoObjectId: object.id },
    });
    if (merchant.logoObjectId && merchant.logoObjectId !== object.id)
      await storage.delete(merchant.logoObjectId, {
        userId: merchantLogoOwner(merchant.id),
        admin: true,
      });
    console.log(`Seeded ${seed.merchantId} logo ${object.id}`);
  }
} finally {
  await app.close();
}
