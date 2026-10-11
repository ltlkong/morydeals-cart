import { Module } from "@nestjs/common";
import { DatabaseModule } from "../../core/database/database.module.ts";
import { UsersModule } from "../users/users.module.ts";
import { CatalogModule } from "../catalog/catalog.module.ts";
import { HistoryController } from "./api/history.controller.ts";
import { ViewedService } from "./services/viewed.service.ts";
/** Product pages each device viewed; separate from the cart and lists, which hold explicit saves. */
@Module({
  imports: [DatabaseModule, UsersModule, CatalogModule],
  controllers: [HistoryController],
  providers: [ViewedService],
  exports: [ViewedService],
})
export class HistoryModule {}
