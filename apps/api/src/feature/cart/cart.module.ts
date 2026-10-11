import { Module } from "@nestjs/common";
import { DatabaseModule } from "../../core/database/database.module.ts";
import { UsersModule } from "../users/users.module.ts";
import { CatalogModule } from "../catalog/catalog.module.ts";
import { CartController } from "./api/cart.controller.ts";
import { CartService } from "./services/cart.service.ts";
@Module({
  imports: [DatabaseModule, UsersModule, CatalogModule],
  controllers: [CartController],
  providers: [CartService],
  exports: [CartService],
})
export class CartModule {}
