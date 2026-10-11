import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { fileURLToPath } from "node:url";
import { apiConfig } from "./schema/config.schema.ts";
@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      cache: true,
      envFilePath: fileURLToPath(
        new URL("../../../../../.env", import.meta.url),
      ),
      load: [apiConfig],
    }),
  ],
})
export class ApiConfigModule {}
