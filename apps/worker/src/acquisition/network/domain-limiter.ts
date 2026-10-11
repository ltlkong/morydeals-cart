export const DOMAIN_LIMITER = Symbol('DOMAIN_LIMITER');

export interface DomainLimiter {
  wait(host: string): Promise<void>;
}
export class LocalDomainLimiter implements DomainLimiter {
  private readonly next = new Map<string, number>();
  constructor(private readonly intervalMs: number) {}
  async wait(host: string) {
    const now = Date.now();
    const slot = Math.max(now, this.next.get(host) ?? 0);
    this.next.set(host, slot + this.intervalMs);
    if (slot > now) await new Promise((resolve) => setTimeout(resolve, slot - now));
  }
}
