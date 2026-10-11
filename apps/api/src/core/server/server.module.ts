import {
  Module,
  StandardSchemaValidationPipe,
  StandardSchemaSerializerInterceptor,
  BadRequestException,
} from "@nestjs/common";
import { APP_FILTER, APP_INTERCEPTOR, APP_PIPE } from "@nestjs/core";
import { LoggerModule } from "nestjs-pino";
import { TerminusModule } from "@nestjs/terminus";
import { randomUUID } from "node:crypto";
import { apiConfig, type ApiConfig } from "../config/schema/config.schema.ts";
import { QueueModule } from "../queue/queue.module.ts";
import { HealthController } from "./api/health.controller.ts";
import { HttpExceptionFilter } from "./http/error.filter.ts";
/** Infrastructure only. Feature modules depend on core, never the reverse. */
@Module({
  imports: [
    QueueModule,
    TerminusModule,
    LoggerModule.forRootAsync({
      inject: [apiConfig.KEY],
      useFactory: (config: ApiConfig) => ({
        pinoHttp: {
          level: config.logLevel,
          genReqId: (_request, response) => {
            const id = randomUUID();
            response.setHeader("x-request-id", id);
            return id;
          },
          serializers: {
            req: (request) => ({ id: request.id, method: request.method }),
            res: (response) => ({ statusCode: response.statusCode }),
          },
          redact: [
            "req.headers.authorization",
            "req.headers.cookie",
            'res.headers["set-cookie"]',
          ],
        },
      }),
    }),
  ],
  controllers: [HealthController],
  providers: [
    {
      provide: APP_PIPE,
      useFactory: () =>
        new StandardSchemaValidationPipe({
          exceptionFactory: () =>
            new BadRequestException(
              "Invalid request. Check the URL and request fields.",
            ),
        }),
    },
    { provide: APP_INTERCEPTOR, useClass: StandardSchemaSerializerInterceptor },
    { provide: APP_FILTER, useClass: HttpExceptionFilter },
  ],
})
export class ServerModule {}
