import {
  BadRequestException,
  Controller,
  Get,
  HttpCode,
  Inject,
  Logger,
  NotFoundException,
  Param,
  Put,
  Req,
  Res,
} from "@nestjs/common";
import type { Request, Response } from "express";
import { open } from "node:fs/promises";
import { pipeline } from "node:stream/promises";
import {
  LocalStorageError,
  LocalStorageProvider,
} from "./local-storage.provider.ts";
import { STORAGE_PROVIDER, type StorageProvider } from "../storage-provider.ts";

/** Byte endpoints for the local provider only; access is granted by the signed token, not a session. */
@Controller("storage/local")
export class LocalStorageController {
  private readonly logger = new Logger(LocalStorageController.name);

  constructor(
    @Inject(STORAGE_PROVIDER) private readonly provider: StorageProvider,
  ) {}

  private local(): LocalStorageProvider {
    if (!(this.provider instanceof LocalStorageProvider))
      throw new NotFoundException("not_found");
    return this.provider;
  }

  @Put(":token")
  @HttpCode(204)
  async upload(
    @Param("token") token: string,
    @Req() request: Request,
  ): Promise<void> {
    try {
      await this.local().receive(
        token,
        request.headers["content-type"],
        request,
      );
    } catch (error) {
      if (error instanceof LocalStorageError) {
        this.logger.warn(
          `local_upload_rejected code=${error.code} content_type=${request.headers["content-type"] ?? ""} content_length=${request.headers["content-length"] ?? ""}`,
        );
        throw new BadRequestException(error.code);
      }
      throw error;
    }
  }

  @Get(":token")
  async download(
    @Param("token") token: string,
    @Res() response: Response,
  ): Promise<void> {
    try {
      const file = await this.local().open(token);
      // Opened before any header or byte: a file removed since it was checked is a clean 404, not a broken response.
      const handle = await open(file.path, "r");
      // This handler owns the handle and closes it on every path: an aborted request or a header error would
      // otherwise leave it to garbage collection, which Node treats as a fatal error.
      try {
        response.setHeader("Content-Type", file.contentType);
        response.setHeader("X-Content-Type-Options", "nosniff");
        // Signed file URLs are embedded by other origins (the console's <img>); Helmet's default
        // same-origin resource policy would make browsers refuse them. Only file downloads relax it.
        response.setHeader("Cross-Origin-Resource-Policy", "cross-origin");
        // pipeline (not pipe): a later read error rejects (and ends the response) instead of crashing the process.
        await pipeline(handle.createReadStream({ autoClose: false }), response);
      } finally {
        await handle.close();
      }
    } catch (error) {
      if (response.headersSent) return; // the body had started; pipeline has already ended the response
      if (
        error instanceof LocalStorageError ||
        (error as NodeJS.ErrnoException).code === "ENOENT"
      )
        throw new NotFoundException("not_found");
      throw error;
    }
  }
}
