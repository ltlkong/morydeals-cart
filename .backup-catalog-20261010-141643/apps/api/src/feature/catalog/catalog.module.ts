import { Module } from "@nestjs/common";
import { DatabaseModule } from "../../core/database/database.module.ts";
import { ProductLookupService } from "./services/product-lookup.service.ts";
/** Read-only product data and price history, shared by the cart, lists and history features. */
@Module({
  imports: [DatabaseModule],
  providers: [ProductLookupService],
  exports: [ProductLookupService],
})
export class CatalogModule {}
