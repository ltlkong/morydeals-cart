import { Inject, Injectable, type OnModuleInit, type OnApplicationShutdown } from '@nestjs/common';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../generated/prisma/client.ts';
import { workerConfig, type Configuration } from '../config/worker.config.ts';

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnApplicationShutdown {
  constructor(@Inject(workerConfig.KEY) config: Configuration) {
    const schema = new URL(config.databaseUrl).searchParams.get('schema') ?? 'public';
    super({
      adapter: new PrismaPg(
        { connectionString: config.databaseUrl, max: 10, connectionTimeoutMillis: 5000 },
        { schema },
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
