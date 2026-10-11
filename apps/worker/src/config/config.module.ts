import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { resolve } from 'node:path';
import { workerConfig, projectRoot } from './worker.config.ts';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      cache: true,
      envFilePath: resolve(projectRoot, '.env'),
      load: [workerConfig],
    }),
  ],
  exports: [ConfigModule],
})
export class WorkerConfigModule {}
