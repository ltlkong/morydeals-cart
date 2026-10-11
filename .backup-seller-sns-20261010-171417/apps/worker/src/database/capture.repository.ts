import { retryTransaction } from './transaction-retry.ts';
import { Inject, Injectable } from '@nestjs/common';
import { Prisma } from '../generated/prisma/client.ts';
import { PrismaService } from './prisma.service.ts';
import { workerConfig, type Configuration } from '../config/worker.config.ts';
import { hash } from 'node:crypto';
import { CaptureConflictError, CaptureLeaseError } from '../pipeline/capture.errors.ts';
import type { CaptureResult } from '../pipeline/capture-result.ts';
import type { CrawlTask } from '@morydeals/capture-contracts';
import type { Offer } from '../parsing/parsers/types.ts';

const json = (value: unknown): Prisma.InputJsonValue => JSON.parse(JSON.stringify(value));
@Injectable()
export class CaptureRepository {
  constructor(
    @Inject(PrismaService) readonly prisma: PrismaService,
    @Inject(workerConfig.KEY) private readonly config: Configuration,
  ) {}
  private async transaction<T>(
    operation: (tx: Prisma.TransactionClient) => Promise<T>,
  ): Promise<T> {
    return retryTransaction(() =>
      this.prisma.$transaction(operation, {
        isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
        timeout: 10000,
      }),
    );
  }

  async start(taskId: string, attemptId: string, input: CrawlTask, archive: string) {
    return this.transaction(async (tx) => {
      const contextHash = hash(
        'sha256',
        JSON.stringify(
          input.snapshot ? { context: input.context, snapshot: input.snapshot } : input.context,
        ),
      );
      const run = await tx.captureRun.upsert({
        where: { id: taskId },
        update: {},
        create: {
          id: taskId,
          requestedUrl: input.url,
          source: input.snapshot ? 'user-webview' : 'executor',
          acquisition: input.snapshot
            ? 'snapshot'
            : 'decision' in input.context
              ? 'auto'
              : input.context.acquisition.mode,
          status: 'running',
          contextSha256: contextHash,
        },
      });
      if (run.requestedUrl !== input.url)
        throw new CaptureConflictError('Task ID already belongs to another URL');
      if (run.contextSha256 !== contextHash)
        throw new CaptureConflictError('Task ID already belongs to another context');
      if (['parsed', 'needs_review'].includes(run.status)) {
        const completed = await tx.captureAttempt.findFirstOrThrow({
          where: { taskId, status: { in: ['parsed', 'needs_review'] } },
          orderBy: { completedAt: 'desc' },
        });
        return completed.auditId;
      }
      const now = new Date();
      if (run.activeAttemptId && run.leaseExpiresAt && run.leaseExpiresAt > now)
        throw new CaptureConflictError(
          'Run already has an active attempt',
          true,
          run.leaseExpiresAt,
        );
      await tx.captureAttempt.updateMany({
        where: { taskId, status: 'running' },
        data: { status: 'failed', error: 'Previous attempt lease expired', completedAt: now },
      });
      await tx.captureRun.update({
        where: { id: taskId },
        data: {
          status: 'running',
          completedAt: null,
          activeAttemptId: attemptId,
          leaseExpiresAt: new Date(now.getTime() + this.config.leaseMs),
        },
      });
      await tx.captureAttempt.create({
        data: { id: attemptId, taskId, auditId: archive, status: 'running' },
      });
      return undefined;
    });
  }
  async renew(taskId: string, attemptId: string) {
    const result = await this.prisma.captureRun.updateMany({
      where: { id: taskId, activeAttemptId: attemptId, leaseExpiresAt: { gt: new Date() } },
      data: { leaseExpiresAt: new Date(Date.now() + this.config.leaseMs) },
    });
    if (result.count !== 1) throw new CaptureLeaseError('Lost run lease');
  }
  async complete(result: CaptureResult, finalUrl: string, fetchedAt: string) {
    await this.transaction(async (tx) => {
      const owned = await tx.captureRun.updateMany({
        where: {
          id: result.taskId,
          activeAttemptId: result.attemptId,
          leaseExpiresAt: { gt: new Date() },
        },
        data: {
          status: result.status,
          completedAt: new Date(),
          activeAttemptId: null,
          leaseExpiresAt: null,
        },
      });
      if (owned.count !== 1) throw new CaptureLeaseError('Lost run lease');
      const observedAt = new Date(fetchedAt);
      // needs_review output is unverified: it stays in the audit bundle and never
      // replaces tracked product data or enters price history.
      const products = result.status === 'parsed' ? result.parsed.products : [];
      for (const product of products) {
        const identityKey = hash('sha256', product.url);
        const data = {
          url: product.url,
          sku: product.sku,
          title: product.title,
          data: json(product),
          variantId: product.variant?.id ?? product.variantId ?? null,
          variantLabel: product.variant?.label ?? null,
          ratingValue: product.rating?.value ?? null,
          ratingScale: product.rating?.scale ?? null,
          ratingCount: product.rating?.count ?? null,
          lastObservedAt: observedAt,
        };
        const tracked = await tx.trackedProduct.upsert({
          where: { identityKey },
          create: { id: identityKey, identityKey, ...data },
          update: {},
        });
        if (tracked.url !== product.url) throw new Error('Product identity collision');
        const productId = tracked.id;
        await tx.trackedProduct.updateMany({
          where: { id: productId, lastObservedAt: { lte: observedAt } },
          data,
        });
        // The run lease above makes completion atomic/idempotent. Observations remain
        // separate so merging legacy duplicate products never discards historical evidence.
        const observation = await tx.productObservation.create({
          data: {
            taskId: result.taskId,
            attemptId: result.attemptId,
            productId,
            observedAt,
            data: json(product),
          },
        });
        await tx.priceObservation.createMany({
          skipDuplicates: true,
          data: product.offers.map((offer, offerIndex) => ({
            observationId: observation.id,
            offerIndex,
            amountMinor: BigInt(offer.amountMinor),
            compareAtAmountMinor:
              offer.compareAtAmountMinor === undefined ? null : BigInt(offer.compareAtAmountMinor),
            compareAtEvidence: offer.compareAtEvidence,
            currencyEvidence: offer.currencyEvidence,
            currency: offer.currency,
            availability: offer.availability,
            condition: offer.condition,
            seller: offer.seller,
            ...dealEnd(offer),
            promotions: offer.promotions?.length ? json(offer.promotions) : Prisma.DbNull,
            offerUrl: offer.url,
            evidence: offer.evidence,
          })),
        });
      }
      await tx.captureAttempt.update({
        where: { id: result.attemptId },
        data: {
          status: result.status,
          finalUrl,
          parserVersion: result.parsed.parserVersion,
          completedAt: new Date(),
        },
      });
    });
  }
  async fail(taskId: string, attemptId: string, error: string) {
    await this.transaction(async (tx) => {
      await tx.captureAttempt.updateMany({
        where: { id: attemptId, taskId, status: 'running' },
        data: { status: 'failed', error: error.slice(0, 2000), completedAt: new Date() },
      });
      await tx.captureRun.updateMany({
        where: { id: taskId, activeAttemptId: attemptId },
        data: {
          status: 'failed',
          completedAt: new Date(),
          activeAttemptId: null,
          leaseExpiresAt: null,
        },
      });
    });
  }
  async history(url: string) {
    const rows = await this.prisma.priceObservation.findMany({
      where: { observation: { product: { identityKey: hash('sha256', url), url } } },
      orderBy: [{ observation: { observedAt: 'desc' } }, { offerIndex: 'asc' }],
      include: { observation: { include: { product: true } } },
    });
    return rows.map((row) => ({
      productId: row.observation.productId,
      title: row.observation.product.title,
      observedAt: row.observation.observedAt,
      amountMinor: Number(row.amountMinor),
      compareAtAmountMinor:
        row.compareAtAmountMinor === null ? null : Number(row.compareAtAmountMinor),
      compareAtEvidence: row.compareAtEvidence,
      currencyEvidence: row.currencyEvidence,
      currency: row.currency,
      availability: row.availability,
      condition: row.condition,
      promotions: row.promotions,
      taskId: row.observation.taskId,
      attemptId: row.observation.attemptId,
    }));
  }
}
/** An offer's soonest-ending deal, with whether that end was estimated from a countdown (see Promotion). */
export function dealEnd(offer: Offer): { dealEndsAt?: Date; dealEndsEstimated?: boolean } {
  const ends = (offer.promotions ?? [])
    .filter((deal) => deal.validUntil && !Number.isNaN(Date.parse(deal.validUntil)))
    .sort((a, b) => Date.parse(a.validUntil!) - Date.parse(b.validUntil!));
  return ends.length
    ? {
        dealEndsAt: new Date(ends[0].validUntil!),
        dealEndsEstimated: !!ends[0].validUntilEstimated,
      }
    : {};
}
