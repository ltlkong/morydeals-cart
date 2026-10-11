import {
  ArgumentsHost,
  Catch,
  HttpException,
  Logger,
  type ExceptionFilter,
} from "@nestjs/common";
import type { Response } from "express";
@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(HttpExceptionFilter.name);
  catch(error: unknown, host: ArgumentsHost) {
    const response = host.switchToHttp().getResponse<Response>();
    const status = error instanceof HttpException ? error.getStatus() : 500;
    const requestId = String(response.getHeader("x-request-id") ?? "");
    if (status >= 500)
      this.logger.error({
        event: "request_failed",
        requestId,
        statusCode: status,
      });
    response.status(status).json({
      statusCode: status,
      message:
        status >= 500
          ? "Service temporarily unavailable. Please try again."
          : error instanceof HttpException
            ? error.message
            : "Request failed",
      requestId,
    });
  }
}
