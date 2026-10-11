import type { BrowserProvider, BrowserEngine } from './browser-provider.types.ts';
import { LocalBrowserProvider } from './providers/local.provider.ts';
import { RemoteBrowserProvider } from './providers/remote.provider.ts';
import { BrowserRegistry } from './browser.registry.ts';
import { browserbaseProvider, type BrowserbaseSettings } from './providers/browserbase.provider.ts';

export interface RemoteBrowserSettings {
  id: string;
  engine: BrowserEngine;
  transport: 'playwright' | 'cdp';
  endpoint: string;
  headers?: Record<string, string>;
  stagehand?: boolean;
}
export interface BrowserDeployment {
  poolSize?: number;
  idleMs?: number;
  camoufoxWsEndpoint?: string;
  browserlessWsEndpoint?: string;
  browserbase?: BrowserbaseSettings;
  remoteBrowsers?: readonly RemoteBrowserSettings[];
  proxyBindHost?: string;
  proxyAdvertisedHost?: string;
  stagehandApiKey?: string;
}
export function createBrowserRegistry(deployment: BrowserDeployment = {}): BrowserRegistry {
  const configured: BrowserProvider[] = (deployment.remoteBrowsers ?? []).map(
    (settings) =>
      new RemoteBrowserProvider(settings.id, settings, async () => ({
        endpoint: settings.endpoint,
        headers: settings.headers,
      })),
  );
  if (deployment.camoufoxWsEndpoint)
    configured.push(
      new RemoteBrowserProvider(
        'camoufox',
        // The service launches Camoufox with its locale and timezone.
        { engine: 'firefox', transport: 'playwright', launchLocale: true },
        async () => ({ endpoint: deployment.camoufoxWsEndpoint! }),
      ),
    );
  if (deployment.browserlessWsEndpoint)
    configured.push(
      new RemoteBrowserProvider(
        'browserless',
        { engine: 'chromium', transport: 'cdp' },
        async () => ({ endpoint: deployment.browserlessWsEndpoint! }),
      ),
    );
  if (deployment.browserbase) configured.push(browserbaseProvider(deployment.browserbase));
  const overridden = new Set(configured.map((provider) => provider.id));
  const defaults = [
    new LocalBrowserProvider('camoufox', 'firefox', true),
    new LocalBrowserProvider('chromium', 'chromium'),
    new LocalBrowserProvider('firefox', 'firefox'),
    new LocalBrowserProvider('webkit', 'webkit'),
  ];
  return new BrowserRegistry([
    ...defaults.filter((provider) => !overridden.has(provider.id)),
    ...configured,
  ]);
}
