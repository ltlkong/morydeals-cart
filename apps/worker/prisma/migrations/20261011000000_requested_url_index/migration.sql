-- The API answers revisited pages from the product last captured from them.
CREATE INDEX "crawler_runs_requested_url_idx" ON "crawler_runs"("requested_url");
