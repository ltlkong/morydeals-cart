import { Module } from "@nestjs/common";
import { TerminusModule } from "@nestjs/terminus";
import { apiConfig } from "../config/schema/config.schema.ts";
import { DatabaseModule } from "../database/database.module.ts";
import { LocalStorageController } from "./providers/local/local-storage.controller.ts";
import { createStorageProvider } from "./providers/create-storage-provider.ts";
import { STORAGE_PROVIDER } from "./providers/storage-provider.ts";
import { StorageRepository } from "./persistence/storage.repository.ts";
import { StorageHealth } from "./services/storage-health.ts";
import { StorageService } from "./services/storage.service.ts";
@Module({
  imports: [DatabaseModule, TerminusModule],
  controllers: [LocalStorageController],
  providers: [
    {
      provide: STORAGE_PROVIDER,
      inject: [apiConfig.KEY],
      useFactory: createStorageProvider,
    },
    StorageRepository,
    StorageService,
    StorageHealth,
  ],
  exports: [StorageService, StorageHealth],
})
export class StorageModule {}
