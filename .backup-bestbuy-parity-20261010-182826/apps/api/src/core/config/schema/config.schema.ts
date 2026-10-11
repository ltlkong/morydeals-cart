import { randomBytes } from "node:crypto";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { registerAs } from "@nestjs/config";
import { z } from "zod";

const environment = z.object({
  CAPTURE_SNAPSHOT_DIRECTORY: z.string().default(".local/capture-snapshots"),
  STORAGE_PROVIDER: z.enum(["local", "r2"]).default("local"),
  STORAGE_LOCAL_DIRECTORY: z.string().default(".local/storage"),
  STORAGE_SIGNING_SECRET: z.string().min(32).optional(),
  PUBLIC_API_URL: z.url().optional(),
  R2_ACCOUNT_ID: z.string().optional(),
  R2_ACCESS_KEY_ID: z.string().optional(),
  R2_SECRET_ACCESS_KEY: z.string().optional(),
  R2_BUCKET: z.string().optional(),
  R2_PUBLIC_BASE_URL: z.url().optional(),
  DATABASE_URL: z
    .string()
    .url()
    .refine((value) => /^postgres(ql)?:/.test(value))
    .default("postgres://morydeals:local-morydeals@127.0.0.1:55432/morydeals"),
  API_ALLOW_OTHER_MERCHANTS: z.enum(["true", "false"]).default("true"),
  MERCHANT_ADMIN_TOKEN: z.string().min(16).optional(),
  LOG_LEVEL: z
    .enum(["silent", "fatal", "error", "warn", "info", "debug", "trace"])
    .default("info"),
  NODE_ENV: z
    .enum(["development", "test", "production"])
    .default("development"),
  API_HOST: z.string().min(1).default("127.0.0.1"),
  API_PORT: z.coerce.number().int().min(1).max(65535).default(3000),
  REDIS_URL: z
    .string()
    .url()
    .refine((value) => /^rediss?:/.test(value))
    .default("redis://127.0.0.1:56379"),
  BULLMQ_PREFIX: z
    .string()
    .regex(/^[a-zA-Z0-9_-]+$/)
    .default("bull"),
  API_PROXY_PROFILE: z
    .string()
    .regex(/^[a-z][a-z0-9_-]{0,63}$/)
    .optional(),
  API_DIRECT_HOSTS: z
    .string()
    .default("")
    .transform((value) =>
      value
        .split(",")
        .map((host) => host.trim().toLowerCase())
        .filter(Boolean),
    )
    .pipe(z.array(z.hostname())),
  API_BROWSER: z
    .string()
    .regex(/^[a-z][a-z0-9_-]{0,63}$/)
    .default("camoufox"),
  API_CORS_ORIGINS: z
    .string()
    .default("http://localhost:8091,http://127.0.0.1:8091"),
});
export function loadApiConfig(env: NodeJS.ProcessEnv = process.env) {
  const result = environment.safeParse({
    ...env,
    API_PROXY_PROFILE: env.API_PROXY_PROFILE || undefined,
  });
  if (!result.success)
    throw new Error(
      `Invalid API configuration: ${result.error.issues.map((issue) => issue.path.join(".")).join(", ")}`,
    );
  const value = result.data;
  if (value.NODE_ENV === "production" && !env.REDIS_URL)
    throw new Error("Production requires REDIS_URL");
  if (value.NODE_ENV === "production" && !env.DATABASE_URL)
    throw new Error("Production requires DATABASE_URL");
  if (
    value.STORAGE_PROVIDER === "local" &&
    value.NODE_ENV === "production" &&
    !value.STORAGE_SIGNING_SECRET
  )
    throw new Error("Production local storage requires STORAGE_SIGNING_SECRET");
  if (
    value.STORAGE_PROVIDER === "r2" &&
    (!value.R2_ACCOUNT_ID ||
      !value.R2_ACCESS_KEY_ID ||
      !value.R2_SECRET_ACCESS_KEY ||
      !value.R2_BUCKET ||
      !value.R2_PUBLIC_BASE_URL)
  )
    throw new Error(
      "R2 storage requires account, credentials, bucket and public base URL",
    );
  const databaseUrl = new URL(value.DATABASE_URL);
  databaseUrl.searchParams.set("schema", "api");
  const corsOrigins = value.API_CORS_ORIGINS.split(",")
    .map((origin) => origin.trim())
    .filter(Boolean);
  if (
    corsOrigins.some(
      (origin) =>
        !URL.canParse(origin) ||
        !["http:", "https:"].includes(new URL(origin).protocol) ||
        new URL(origin).origin !== origin,
    )
  )
    throw new Error("Invalid API_CORS_ORIGINS");
  return {
    storage: {
      provider: value.STORAGE_PROVIDER,
      directory: resolve(
        fileURLToPath(new URL("../../../../../../", import.meta.url)),
        value.STORAGE_LOCAL_DIRECTORY,
      ),
      signingSecret:
        value.STORAGE_SIGNING_SECRET ?? randomBytes(32).toString("hex"),
      publicApiUrl:
        value.PUBLIC_API_URL ?? `http://127.0.0.1:${value.API_PORT}`,
      r2AccountId: value.R2_ACCOUNT_ID ?? "",
      r2AccessKeyId: value.R2_ACCESS_KEY_ID ?? "",
      r2SecretAccessKey: value.R2_SECRET_ACCESS_KEY ?? "",
      r2Bucket: value.R2_BUCKET ?? "",
      r2PublicBaseUrl: value.R2_PUBLIC_BASE_URL ?? "",
    },
    snapshotDirectory: resolve(
      fileURLToPath(new URL("../../../../../../", import.meta.url)),
      value.CAPTURE_SNAPSHOT_DIRECTORY,
    ),
    databaseUrl: databaseUrl.href,
    allowOtherMerchants: value.API_ALLOW_OTHER_MERCHANTS === "true",
    merchantAdminToken: value.MERCHANT_ADMIN_TOKEN,
    logLevel: value.LOG_LEVEL,
    host: value.API_HOST,
    port: value.API_PORT,
    redisUrl: value.REDIS_URL,
    queuePrefix: value.BULLMQ_PREFIX,
    proxyProfile: value.API_PROXY_PROFILE,
    directHosts: value.API_DIRECT_HOSTS,
    browser: value.API_BROWSER,
    corsOrigins,
    docsEnabled: value.NODE_ENV !== "production",
  };
}
export type ApiConfig = ReturnType<typeof loadApiConfig>;
export const apiConfig = registerAs("api", loadApiConfig);
