import { Module } from "@nestjs/common";
import { DatabaseModule } from "../../core/database/database.module.ts";
import { CatalogController } from "./api/catalog.controller.ts";
import { CatalogService } from "./services/catalog.service.ts";
import { ProductLookupService } from "./services/product-lookup.service.ts";
/**
 * Read-only product data and price history, shared by the cart, lists and history features, and the browsable
 * catalog (`GET /catalog/products`).
 */
@Module({
  imports: [DatabaseModule],
  controllers: [CatalogController],
  providers: [ProductLookupService, CatalogService],
  exports: [ProductLookupService],
})
export class CatalogModule {}
