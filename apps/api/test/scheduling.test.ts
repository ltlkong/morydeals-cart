import "reflect-metadata";
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  HISTORY_QUEUE,
  KEEPA_BACKFILL_EVERY_MS,
  KEEPA_BACKFILL_SCHEDULER,
} from "@morydeals/capture-contracts";
import { JobSchedules } from "../src/core/scheduling/job-schedules.service.ts";

const setup = () => {
  const calls: unknown[][] = [];
  let sweeps = 0;
  const queue = {
    name: HISTORY_QUEUE,
    upsertJobScheduler: async (...args: unknown[]) => {
      calls.push(args);
    },
  };
  const storage = { sweepExpiredUploads: async () => void sweeps++ };
  return {
    calls,
    sweeps: () => sweeps,
    schedules: new JobSchedules(queue as never, storage as never),
  };
};

test("the API owns recurring jobs: it schedules the Keepa backfill on the history queue at startup", async () => {
  const { calls, schedules } = setup();
  await schedules.onApplicationBootstrap();
  assert.equal(calls.length, 1);
  const [id, repeat, template] = calls[0] as [
    string,
    { every: number },
    { name: string },
  ];
  // Upserting by a fixed id keeps one schedule however many API instances start.
  assert.equal(id, KEEPA_BACKFILL_SCHEDULER);
  assert.deepEqual(repeat, { every: KEEPA_BACKFILL_EVERY_MS });
  assert.equal(template.name, KEEPA_BACKFILL_SCHEDULER);
});

test("the hourly job sweeps expired uploads through storage", async () => {
  const { schedules, sweeps } = setup();
  await schedules.sweepExpiredUploads();
  assert.equal(sweeps(), 1);
});
