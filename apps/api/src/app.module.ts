import { StorageModule } from "./core/storage/storage.module.ts";
import { Module } from "@nestjs/common";
import { ApiConfigModule } from "./core/config/config.module.ts";
import { ProductsModule } from "./feature/products/products.module.ts";
import { CartModule } from "./feature/cart/cart.module.ts";
import { CatalogModule } from "./feature/catalog/catalog.module.ts";
import { HistoryModule } from "./feature/history/history.module.ts";
import { ListsModule } from "./feature/lists/lists.module.ts";
import { UsersModule } from "./feature/users/users.module.ts";
import { ServerModule } from "./core/server/server.module.ts";
import { SchedulingModule } from "./core/scheduling/scheduling.module.ts";
@Module({
  imports: [
    ApiConfigModule,
    UsersModule,
    ProductsModule,
    CartModule,
    CatalogModule,
    HistoryModule,
    ListsModule,
    ServerModule,
    StorageModule,
    SchedulingModule,
  ],
})
export class AppModule {}
