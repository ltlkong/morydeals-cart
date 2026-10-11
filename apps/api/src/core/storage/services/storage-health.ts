import { Inject, Injectable } from "@nestjs/common";
import { HealthIndicatorService } from "@nestjs/terminus";
import { StorageService } from "./storage.service.ts";

/**
 * How long one probe of the object store (R2: a paid HeadBucket call) answers for. The operations status and its
 * `morydeals.dependency.up` gauge read this indicator every export interval; the probe runs at most once per period.
 */
export const STORAGE_PROBE_TTL_MS = 5 * 60_000;

/**
 * The object store's health, for monitoring only: it is not part of the container's /health readiness (most routes do not
 * need storage, and an R2 incident must not mark the backend unhealthy or block a release).
 */
@Injectable()
export class StorageHealth {
  private probe?: { at: number; result: Promise<boolean> };

  constructor(
    @Inject(StorageService) private readonly storage: StorageService,
    @Inject(HealthIndicatorService)
    private readonly health: HealthIndicatorService,
  ) {}

  async check() {
    const indicator = this.health.check("storage");
    return (await this.healthy())
      ? indicator.up()
      : indicator.down({ message: "storage_unavailable" });
  }

  /** The latest probe's answer; concurrent callers share one probe, and a new one starts once it is STORAGE_PROBE_TTL_MS old. */
  private healthy(): Promise<boolean> {
    const now = Date.now();
    if (!this.probe || now - this.probe.at >= STORAGE_PROBE_TTL_MS) {
      this.probe = {
        at: now,
        result: this.storage.check().then(
          () => true,
          () => false,
        ),
      };
    }
    return this.probe.result;
  }
}
