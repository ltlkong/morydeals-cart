import {
  chromium,
  firefox,
  webkit,
  type Browser,
  type BrowserType,
  type BrowserContextOptions,
} from 'playwright';
import { AcquisitionError } from '../../acquisition.types.ts';
import type {
  BrowserProvider,
  BrowserCapabilities,
  BrowserOpenOptions,
  BrowserLease,
} from '../browser-provider.types.ts';

export interface RemoteConnection {
  endpoint: string;
  expiresAt?: number;
  headers?: Record<string, string>;
  release?(): Promise<void>;
}
export type RemoteConnectionFactory = (options: BrowserOpenOptions) => Promise<RemoteConnection>;
const browsers = { chromium, firefox, webkit };

export function withContextProxy(
  browser: Browser,
  proxy: NonNullable<BrowserContextOptions['proxy']>,
): Browser {
  return new Proxy(browser, {
    get(target, key) {
      // Crawlee anonymizes credentials into worker-local proxies. Remote contexts
      // must use the original proxy address reachable from the browser service.
      if (key === 'newPage')
        return (options?: Parameters<Browser['newPage']>[0]) =>
          target.newPage({ ...options, proxy });
      const value = Reflect.get(target, key, target);
      return typeof value === 'function' ? value.bind(target) : value;
    },
  });
}

export class RemoteBrowserProvider implements BrowserProvider {
  readonly capabilities: BrowserCapabilities;
  constructor(
    readonly id: string,
    options: Omit<BrowserCapabilities, 'stagehand' | 'launchLocale'> & {
      stagehand?: boolean;
      launchLocale?: boolean;
    },
    private readonly connection: RemoteConnectionFactory,
  ) {
    if (options.transport === 'local')
      throw new Error('Remote provider requires a remote transport');
    if (options.transport === 'cdp' && options.engine !== 'chromium')
      throw new Error('CDP requires Chromium');
    if (options.stagehand && options.transport !== 'cdp')
      throw new Error('Stagehand attachment requires CDP');
    // A CDP launch URL can create a fresh browser per connection. Stagehand's
    // second connection must attach to the same session, explicitly guaranteed
    // by the provider (Browserbase session URL or an existing CDP server).
    this.capabilities = {
      engine: options.engine,
      transport: options.transport,
      stagehand: options.stagehand ?? false,
      launchLocale: options.launchLocale ?? false,
    };
  }
  async open(options: BrowserOpenOptions): Promise<BrowserLease> {
    options.signal.throwIfAborted();
    const connection = await this.connection(options);
    let closing: Promise<void> | undefined;
    const close = () => (closing ??= Promise.resolve().then(() => connection.release?.()));
    try {
      const endpoint = new URL(connection.endpoint);
      const protocols =
        this.capabilities.transport === 'playwright'
          ? ['ws:', 'wss:']
          : ['ws:', 'wss:', 'http:', 'https:'];
      if (!protocols.includes(endpoint.protocol))
        throw new Error('Invalid browser endpoint protocol');
      if (this.capabilities.stagehand && ['http:', 'https:'].includes(endpoint.protocol)) {
        const discovery = new URL(endpoint);
        discovery.pathname = `${discovery.pathname.replace(/\/$/, '')}/json/version`;
        const response = await fetch(discovery, {
          headers: connection.headers,
          signal: AbortSignal.any([options.signal, AbortSignal.timeout(options.timeoutMs)]),
        });
        if (!response.ok) throw new Error('CDP discovery failed');
        const version = (await response.json()) as { webSocketDebuggerUrl?: unknown };
        if (
          typeof version.webSocketDebuggerUrl !== 'string' ||
          !['ws:', 'wss:'].includes(new URL(version.webSocketDebuggerUrl).protocol)
        )
          throw new Error('Invalid CDP discovery response');
        connection.endpoint = version.webSocketDebuggerUrl;
      }
      options.signal.throwIfAborted();
      const library = browsers[this.capabilities.engine];
      const launcher = Object.assign(Object.create(library) as BrowserType, {
        launch: async () => {
          try {
            options.signal.throwIfAborted();
            const browser =
              this.capabilities.transport === 'cdp'
                ? await chromium.connectOverCDP(connection.endpoint, {
                    timeout: options.timeoutMs,
                    headers: connection.headers,
                  })
                : await library.connect(connection.endpoint, {
                    timeout: options.timeoutMs,
                    headers: connection.headers,
                  });
            if (options.signal.aborted) {
              await browser.close();
              options.signal.throwIfAborted();
            }
            return withContextProxy(browser, options.proxy);
          } catch {
            throw new AcquisitionError(
              'network_error',
              `Browser connection failed: ${this.id}`,
              true,
            );
          }
        },
      });
      return {
        expiresAt: connection.expiresAt,
        launcher,
        launchOptions: { headless: true },
        ...(this.capabilities.stagehand
          ? {
              stagehand: {
                kind: 'attach' as const,
                endpoint: connection.endpoint,
                headers: connection.headers,
              },
            }
          : {}),
        close,
      };
    } catch {
      await close();
      throw new AcquisitionError(
        'network_error',
        `Browser session initialization failed: ${this.id}`,
        true,
      );
    }
  }
}
