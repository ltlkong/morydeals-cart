import { Module } from "@nestjs/common";
import { DatabaseModule } from "../../core/database/database.module.ts";
import { UsersModule } from "../users/users.module.ts";
import { CatalogModule } from "../catalog/catalog.module.ts";
import { ListsController } from "./api/lists.controller.ts";
import { ListsService } from "./services/lists.service.ts";
/** Named lists of saved products per device; a separate feature from the cart. */
@Module({
  imports: [DatabaseModule, UsersModule, CatalogModule],
  controllers: [ListsController],
  providers: [ListsService],
})
export class ListsModule {}
