import { Module } from "@nestjs/common";
import { PrismaService } from "./services/prisma.service.ts";
@Module({ providers: [PrismaService], exports: [PrismaService] })
export class DatabaseModule {}
