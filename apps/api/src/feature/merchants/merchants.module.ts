import { Module } from "@nestjs/common";
import { DatabaseModule } from "../../core/database/database.module.ts";
import { StorageModule } from "../../core/storage/storage.module.ts";
import { MerchantsController } from "./api/merchants.controller.ts";
import { MerchantsService } from "./services/merchants.service.ts";
@Module({
  imports: [DatabaseModule, StorageModule],
  controllers: [MerchantsController],
  providers: [MerchantsService],
  exports: [MerchantsService],
})
export class MerchantsModule {}
