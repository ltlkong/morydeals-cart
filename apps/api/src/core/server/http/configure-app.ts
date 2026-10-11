import { json, urlencoded } from "express";
import { HttpException, type INestApplication } from "@nestjs/common";
import { Logger } from "nestjs-pino";
import helmet from "helmet";
import { MAX_SNAPSHOT_BYTES } from "@morydeals/capture-contracts";
import type { ApiConfig } from "../../config/schema/config.schema.ts";
/** Page uploads (captures and automatic visits) carry up to MAX_SNAPSHOT_BYTES of HTML; JSON escaping adds the rest. */
const PAGE_UPLOAD_PATHS = new Set(["/api/products/snapshots", "/api/pages"]);
export function configureHttp(app: INestApplication, config: ApiConfig) {
  app.useLogger(app.get(Logger));
  app.setGlobalPrefix("api");
  app.use(helmet());
  const parseJson = json();
  const parseSnapshot = json({ limit: Math.ceil(MAX_SNAPSHOT_BYTES * 1.25) });
  const parseForm = urlencoded({ extended: true });
  app.use(
    (
      req: import("express").Request,
      res: import("express").Response,
      next: import("express").NextFunction,
    ) => {
      if (req.method === "PUT" && req.path.startsWith("/api/storage/local/"))
        return next();
      const parser =
        req.method === "POST" && PAGE_UPLOAD_PATHS.has(req.path)
          ? parseSnapshot
          : parseJson;
      parser(req, res, (error) =>
        error
          ? next(
              new HttpException(
                "Invalid request body",
                error.status === 413 ? 413 : 400,
              ),
            )
          : parseForm(req, res, next),
      );
    },
  );
  app.enableCors({
    origin: config.corsOrigins,
    exposedHeaders: ["x-request-id"],
  });
  app.enableShutdownHooks();
}
