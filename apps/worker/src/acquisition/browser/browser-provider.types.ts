import type { BrowserType, BrowserContextOptions, LaunchOptions } from 'playwright';

export type BrowserEngine = 'chromium' | 'firefox' | 'webkit';
export type BrowserTransport = 'local' | 'playwright' | 'cdp';
export interface BrowserCapabilities {
  engine: BrowserEngine;
  transport: BrowserTransport;
  stagehand: boolean;
  /**
   * The browser sets its language at launch, matching its fingerprint. A page-level locale would replace its
   * Accept-Language with a bare tag that no real browser sends.
   */
  launchLocale: boolean;
}
export interface BrowserOpenOptions {
  proxy: NonNullable<BrowserContextOptions['proxy']>;
  locale?: string;
  timeoutMs: number;
  signal: AbortSignal;
}
// Crawlee owns page/context lifetime and closes its browser handle. The lease
// additionally releases provider resources (e.g. a billable cloud session).
export interface BrowserLease {
  /** Provider deadline, if its remote session has a fixed lifetime. */
  expiresAt?: number;
  launcher: BrowserType;
  launchOptions: LaunchOptions;
  stagehand?:
    | { kind: 'local'; launchOptions: LaunchOptions }
    | { kind: 'attach'; endpoint: string; headers?: Record<string, string> };
  close(): Promise<void>;
}
export interface BrowserProvider {
  readonly id: string;
  readonly capabilities: BrowserCapabilities;
  open(options: BrowserOpenOptions): Promise<BrowserLease>;
}
