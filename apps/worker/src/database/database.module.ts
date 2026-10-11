import { Module } from '@nestjs/common';
import { WorkerConfigModule } from '../config/config.module.ts';
import { PrismaService } from './prisma.service.ts';
import { CaptureRepository } from './capture.repository.ts';

@Module({
  imports: [WorkerConfigModule],
  providers: [PrismaService, CaptureRepository],
  exports: [PrismaService, CaptureRepository],
})
export class DatabaseModule {}
