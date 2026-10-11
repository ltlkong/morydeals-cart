import { AcquisitionError } from '../../acquisition.types.ts';
import { RemoteBrowserProvider } from './remote.provider.ts';

export interface BrowserbaseSettings {
  apiKey: string;
  projectId: string;
  region?: 'us-west-2' | 'us-east-1' | 'eu-central-1' | 'ap-southeast-1';
}
// Fetch injection allows contract tests without creating paid cloud sessions.
export function browserbaseProvider(settings: BrowserbaseSettings, request: typeof fetch = fetch) {
  return new RemoteBrowserProvider(
    'browserbase',
    { engine: 'chromium', transport: 'cdp', stagehand: true },
    async (options) => {
      const lifetimeSecs = Math.max(60, Math.ceil(options.timeoutMs / 1000));
      const expiresAt = Date.now() + lifetimeSecs * 1000;
      const headers = { 'X-BB-API-Key': settings.apiKey, 'content-type': 'application/json' };
      let sessionId: string | undefined;
      const release = async () => {
        if (!sessionId) return;
        const response = await request(
          `https://api.browserbase.com/v1/sessions/${encodeURIComponent(sessionId)}`,
          {
            method: 'POST',
            headers,
            signal: AbortSignal.timeout(10000),
            body: JSON.stringify({ projectId: settings.projectId, status: 'REQUEST_RELEASE' }),
          },
        );
        if (!response.ok)
          throw new AcquisitionError('network_error', 'Browserbase session release failed', true);
      };
      try {
        const response = await request('https://api.browserbase.com/v1/sessions', {
          method: 'POST',
          headers,
          signal: AbortSignal.any([options.signal, AbortSignal.timeout(options.timeoutMs)]),
          body: JSON.stringify({
            projectId: settings.projectId,
            region: settings.region,
            timeout: lifetimeSecs,
            keepAlive: false,
            proxies: [
              {
                type: 'external',
                server: options.proxy.server,
                username: options.proxy.username,
                password: options.proxy.password,
              },
            ],
            browserSettings: {
              viewport: { width: 1280, height: 720 },
              recordSession: false,
              logSession: false,
            },
          }),
        });
        if (!response.ok) throw new Error('Session creation failed');
        const session = (await response.json()) as { id?: unknown; connectUrl?: unknown };
        if (typeof session.id !== 'string') throw new Error('Missing session id');
        sessionId = session.id;
        if (typeof session.connectUrl !== 'string') throw new Error('Missing connection URL');
        options.signal.throwIfAborted();
        return { endpoint: session.connectUrl, expiresAt, release };
      } catch {
        await release().catch(() => undefined);
        throw new AcquisitionError('network_error', 'Browserbase session creation failed', true);
      }
    },
  );
}
