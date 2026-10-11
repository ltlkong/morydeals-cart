-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateTable
CREATE TABLE "crawler_runs" (
    "id" TEXT NOT NULL,
    "requested_url" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "acquisition" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completed_at" TIMESTAMPTZ(6),
    "result" JSONB,

    CONSTRAINT "crawler_runs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "crawler_attempts" (
    "id" TEXT NOT NULL,
    "run_id" TEXT NOT NULL,
    "archive_path" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "final_url" TEXT,
    "raw_sha256" TEXT,
    "parser_version" TEXT,
    "started_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completed_at" TIMESTAMPTZ(6),
    "error" TEXT,

    CONSTRAINT "crawler_attempts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tracked_products" (
    "id" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "sku" TEXT,
    "title" TEXT NOT NULL,
    "data" JSONB NOT NULL,
    "last_observed_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "tracked_products_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "product_observations" (
    "id" BIGSERIAL NOT NULL,
    "run_id" TEXT NOT NULL,
    "attempt_id" TEXT NOT NULL,
    "product_id" TEXT NOT NULL,
    "observed_at" TIMESTAMPTZ(6) NOT NULL,
    "data" JSONB NOT NULL,

    CONSTRAINT "product_observations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "price_observations" (
    "observation_id" BIGINT NOT NULL,
    "offer_index" INTEGER NOT NULL,
    "amount" DECIMAL(24,6) NOT NULL,
    "currency" CHAR(3) NOT NULL,
    "availability" TEXT,
    "offer_url" TEXT,
    "evidence" TEXT NOT NULL,

    CONSTRAINT "price_observations_pkey" PRIMARY KEY ("observation_id","offer_index")
);

-- CreateIndex
CREATE INDEX "crawler_attempts_run_idx" ON "crawler_attempts"("run_id");

-- CreateIndex
CREATE INDEX "observations_history_idx" ON "product_observations"("product_id", "observed_at" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "product_observations_run_id_product_id_key" ON "product_observations"("run_id", "product_id");

-- AddForeignKey
ALTER TABLE "crawler_attempts" ADD CONSTRAINT "crawler_attempts_run_id_fkey" FOREIGN KEY ("run_id") REFERENCES "crawler_runs"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "product_observations" ADD CONSTRAINT "product_observations_run_id_fkey" FOREIGN KEY ("run_id") REFERENCES "crawler_runs"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "product_observations" ADD CONSTRAINT "product_observations_attempt_id_fkey" FOREIGN KEY ("attempt_id") REFERENCES "crawler_attempts"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "product_observations" ADD CONSTRAINT "product_observations_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "tracked_products"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "price_observations" ADD CONSTRAINT "price_observations_observation_id_fkey" FOREIGN KEY ("observation_id") REFERENCES "product_observations"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;
