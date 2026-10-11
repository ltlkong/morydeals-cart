import { PageSnapshotStore } from "./providers/page-snapshot.store.ts";
import { MerchantsModule } from "../merchants/merchants.module.ts";
import { CartModule } from "../cart/cart.module.ts";
import { HistoryModule } from "../history/history.module.ts";
import { UsersModule } from "../users/users.module.ts";
import { Module } from "@nestjs/common";
import { QueueModule } from "../../core/queue/queue.module.ts";
import { CaptureQueue } from "./providers/capture.queue.ts";
import { ProductsController } from "./api/products.controller.ts";
import { PagesController } from "./api/pages.controller.ts";
import { CatalogModule } from "../catalog/catalog.module.ts";
import { ProductsService } from "./services/products.service.ts";
@Module({
  imports: [
    QueueModule,
    MerchantsModule,
    UsersModule,
    CartModule,
    HistoryModule,
    CatalogModule,
  ],
  controllers: [ProductsController, PagesController],
  providers: [ProductsService, CaptureQueue, PageSnapshotStore],
})
export class ProductsModule {}
