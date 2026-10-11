import { PageSnapshotStore } from "../providers/page-snapshot.store.ts";
import type { PageSnapshot } from "@morydeals/capture-contracts";
import { MerchantsService } from "../../merchants/services/merchants.service.ts";
import { CartService } from "../../cart/services/cart.service.ts";
import { ViewedService } from "../../history/services/viewed.service.ts";
import { ProductLookupService } from "../../catalog/services/product-lookup.service.ts";
import {
  SkippedVisitSchema,
  PageClassificationSchema,
} from "@morydeals/capture-contracts";
import { Inject, Injectable, NotFoundException } from "@nestjs/common";
import { randomUUID } from "node:crypto";
import {
  apiConfig,
  type ApiConfig,
} from "../../../core/config/schema/config.schema.ts";
import { CaptureQueue } from "../providers/capture.queue.ts";
import {
  ParsedCaptureSchema,
  type CreateProduct,
  type KnownPage,
  type ProductStatus,
  type VisitStatus,
} from "../schema/products.schema.ts";
/** A product's price is refreshed at most this often, whichever capture refreshes it. */
export const RECAPTURE_AFTER_MS = 12 * 3600_000;
@Injectable()
export class ProductsService {
  constructor(
    @Inject(PageSnapshotStore) private readonly snapshots: PageSnapshotStore,
    @Inject(MerchantsService) private readonly merchants: MerchantsService,
    @Inject(CaptureQueue) private readonly captures: CaptureQueue,
    @Inject(apiConfig.KEY) private readonly config: ApiConfig,
    @Inject(CartService) private readonly cart: CartService,
    @Inject(ViewedService) private readonly viewed: ViewedService,
    @Inject(ProductLookupService) private readonly lookup: ProductLookupService,
  ) {}
  async create(input: CreateProduct) {
    await this.merchants.assertAllowed(input.url);
    const direct = this.config.directHosts.includes(
      new URL(input.url).hostname,
    );
    const id = await this.captures.submit({
      taskId: randomUUID(),
      url: input.url,
      context: {
        version: 1,
        decision: { mode: "auto", browser: this.config.browser },
        ...(!direct && this.config.proxyProfile
          ? {
              network: {
                proxyProfile: this.config.proxyProfile,
                rotation: "session",
              },
            }
          : {}),
      },
    });
    return { id, status: "pending" as const };
  }
  /** An automatic visit: the worker classifies the page and captures it only if it is a likely product page. */
  async createVisit(input: PageSnapshot) {
    await this.merchants.assertAllowed(input.url);
    const snapshot = await this.snapshots.save(input);
    try {
      const id = await this.captures.submit({
        taskId: snapshot.id,
        url: input.url,
        snapshot,
        intent: "browse",
      });
      return { id, status: "pending" as const };
    } catch (error) {
      await this.snapshots.remove(snapshot.id);
      throw error;
    }
  }
  /**
   * A page whose product any capture observed in the last 12 hours is answered from the catalogue, so revisits, and
   * products the daily refresh just updated, are not captured again.
   */
  async knownPage(url: string, userId: string): Promise<KnownPage> {
    await this.merchants.assertAllowed(url);
    const since = new Date(Date.now() - RECAPTURE_AFTER_MS);
    const productUrl = await this.lookup.capturedFrom(url, since);
    const details = productUrl
      ? (await this.lookup.describe([productUrl])).get(productUrl)
      : undefined;
    if (!details?.product) return { status: "unknown" };
    await this.viewed.record(userId, details.product.url);
    return {
      status: "product",
      product: details.product,
      history: details.history,
    };
  }
  async visitStatus(id: string, userId: string): Promise<VisitStatus> {
    const job = await this.captures.find(id);
    if (!job) throw new NotFoundException("This page visit has expired.");
    if (job.state === "pending") return { id, status: "pending" };
    if (job.state === "failed") return { id, status: "failed" };
    const skipped = SkippedVisitSchema.safeParse(job.result);
    if (skipped.success) {
      const { productProbability } = skipped.data.classification;
      // A page read before it rendered is read again, as an unconfirmed product is.
      const status =
        skipped.data.status === "not_loaded"
          ? "unconfirmed"
          : skipped.data.status;
      return { id, status, productProbability };
    }
    const classification = PageClassificationSchema.safeParse(
      (job.result as { classification?: unknown } | null)?.classification,
    );
    const productProbability = classification.success
      ? classification.data.productProbability
      : 1;
    const result = ParsedCaptureSchema.safeParse(job.result);
    if (!result.success)
      return { id, status: "unconfirmed", productProbability };
    const product = result.data.parsed.products[0]!;
    // Viewed products go to history; only an explicit add puts them in the cart.
    await this.viewed.record(userId, product.url);
    const history =
      (await this.lookup.describe([product.url])).get(product.url)?.history ??
      [];
    return { id, status: "product", productProbability, product, history };
  }
  async createSnapshot(input: PageSnapshot) {
    await this.merchants.assertAllowed(input.url);
    const snapshot = await this.snapshots.save(input);
    try {
      const id = await this.captures.submit({
        taskId: snapshot.id,
        url: input.url,
        snapshot,
      });
      return { id, status: "pending" as const };
    } catch (error) {
      await this.snapshots.remove(snapshot.id);
      throw error;
    }
  }
  async status(id: string, userId: string): Promise<ProductStatus> {
    const job = await this.captures.find(id);
    if (!job)
      throw new NotFoundException(
        "This request has expired. Please submit the link again.",
      );
    if (job.state === "pending") return { id, status: "pending" };
    if (job.state === "failed")
      return {
        id,
        status: "failed",
        message:
          job.failureCode === "incomplete"
            ? "The store did not provide product details, even after loading the page. Please check the product link."
            : job.failureCode === "blocked"
              ? "This store blocked automated capture. Please try again later."
              : job.failureCode === "timeout"
                ? "The store took too long to load. Please try again."
                : "This store could not be reached. Please try again later.",
      };
    const result = ParsedCaptureSchema.safeParse(job.result);
    if (!result.success)
      return {
        id,
        status: "failed",
        message:
          "We could not confirm this product’s price. Please try another product link.",
      };
    const product = result.data.parsed.products[0]!;
    // A confirmed capture lands in the requesting user's cart (idempotent, so polling again is harmless).
    await this.cart.add(userId, product.url);
    return { id, status: "ready", product };
  }
}
