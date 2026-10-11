import {
  Inject,
  Injectable,
  type OnModuleInit,
  type OnApplicationShutdown,
} from "@nestjs/common";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../../../generated/prisma/client.ts";
import {
  apiConfig,
  type ApiConfig,
} from "../../config/schema/config.schema.ts";
@Injectable()
export class PrismaService
  extends PrismaClient
  implements OnModuleInit, OnApplicationShutdown
{
  constructor(@Inject(apiConfig.KEY) config: ApiConfig) {
    super({
      adapter: new PrismaPg(
        {
          connectionString: config.databaseUrl,
          max: 5,
          connectionTimeoutMillis: 5000,
        },
        { schema: "api" },
      ),
    });
  }
  async onModuleInit() {
    await this.$connect();
  }
  async onApplicationShutdown() {
    await this.$disconnect();
  }
}
