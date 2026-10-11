import { Inject, Injectable } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import type { Queue } from 'bullmq';
import type { DomainLimiter } from '../../acquisition/network/domain-limiter.ts';
import { hash } from 'node:crypto';
import { workerConfig, type Configuration } from '../../config/worker.config.ts';
import { QUEUE_NAME } from '@morydeals/capture-contracts';

@Injectable()
export class RedisDomainLimiter implements DomainLimiter {
  constructor(
    @InjectQueue(QUEUE_NAME) private readonly queue: Queue,
    @Inject(workerConfig.KEY) private readonly config: Configuration,
  ) {}
  async wait(host: string) {
    const redis = await this.queue.backend.connection.client;
    redis.defineCommand('reserveDomainSlot', {
      numberOfKeys: 1,
      lua: `
      local t=redis.call('TIME')
      local now=tonumber(t[1])*1000+math.floor(tonumber(t[2])/1000)
      local slot=math.max(now,tonumber(redis.call('GET',KEYS[1]) or '0'))
      local next=slot+tonumber(ARGV[1])
      redis.call('SET',KEYS[1],next,'PX',math.max(1000,next-now+1000))
      return slot-now`,
    });
    const delay = Number(
      await redis.runCommand('reserveDomainSlot', [
        `${this.queue.opts.prefix ?? 'bull'}:${this.queue.name}:domain:${hash('sha256', host)}`,
        this.config.domainIntervalMs,
      ]),
    );
    if (delay > 0) await new Promise((resolve) => setTimeout(resolve, delay));
  }
}
