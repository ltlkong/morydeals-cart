import { Configuration, ProxyConfiguration, Session, SessionPool } from '@crawlee/basic';
import type { ProxyProfile } from '../../config/proxy.config.ts';
import { AcquisitionError, type DriverRequest } from '../acquisition.types.ts';
import { ResponseError } from '../http/http.transport.ts';

// Sessions identify an outbound route. Cookies/storage never cross task boundaries.
// No hidden retries: an unhealthy session affects the next caller-configured attempt.
export class NetworkSessions {
  private readonly profiles = new Map<
    string,
    {
      config: ProxyProfile;
      proxy: ProxyConfiguration;
      pool?: Promise<SessionPool>;
    }
  >();

  constructor(profiles: readonly ProxyProfile[] = []) {
    for (const config of profiles)
      this.profiles.set(config.id, {
        config,
        proxy: new ProxyConfiguration({ proxyUrls: config.urls }),
      });
  }

  async run<T>(request: DriverRequest, execute: (proxyUrl?: string) => Promise<T>): Promise<T> {
    const network = request.step.network;
    if (!network) return execute();
    const profile = this.profiles.get(network.proxyProfile);
    if (!profile)
      throw new AcquisitionError(
        'unsupported_capability',
        `Unknown proxy profile: ${network.proxyProfile}`,
      );
    const { config, proxy } = profile;
    profile.pool ??= SessionPool.open(
      {
        maxPoolSize: config.maxSessions,
        sessionOptions: {
          maxUsageCount: config.maxSessionUses,
          maxAgeSecs: config.maxSessionAgeSecs,
        },
        blockedStatusCodes: [401, 403],
        persistenceOptions: { enable: false },
      },
      new Configuration({ persistStorage: false, purgeOnStart: false }),
    );
    const pool = await profile.pool;
    const session =
      network.rotation === 'per-request'
        ? new Session({ sessionPool: pool })
        : await pool.getSession();
    // Store the route on the bounded session, not ProxyConfiguration's unbounded ID map.
    const proxyUrl =
      typeof session.userData.proxyUrl === 'string'
        ? session.userData.proxyUrl
        : await proxy.newUrl();
    if (!proxyUrl)
      throw new AcquisitionError('unsupported_capability', 'Proxy profile has no available route');
    session.userData.proxyUrl = proxyUrl;
    await request.archive.artifact(
      `${request.artifactPrefix ?? ''}step-${request.stepIndex}-network.json`,
      JSON.stringify(
        {
          profile: config.id,
          proxyIndex: config.urls.indexOf(proxyUrl),
          sessionId: session.id,
          rotation: network.rotation,
        },
        null,
        2,
      ),
    );
    try {
      request.signal.throwIfAborted();
      const result = await execute(proxyUrl);
      session.markGood();
      return result;
    } catch (error) {
      // Rate limiting should back off through the caller/queue, not burn new IPs.
      if (error instanceof AcquisitionError && error.reason === 'blocked') session.retire();
      else if (
        !(error instanceof ResponseError && error.status === 429) &&
        !request.signal.aborted
      ) {
        const transportFailure =
          (error instanceof AcquisitionError && error.reason === 'network_error') ||
          (error instanceof ResponseError && error.retryable) ||
          (error instanceof Error &&
            'code' in error &&
            ['ECONNRESET', 'ECONNREFUSED', 'ENOTFOUND', 'ETIMEDOUT'].includes(String(error.code)));
        if (transportFailure) session.markBad();
      }
      throw error;
    } finally {
      if (network.rotation === 'per-request') session.retire();
    }
  }

  async onApplicationShutdown() {
    await this.close();
  }
  async close() {
    await Promise.all(
      [...this.profiles.values()].map(async (profile) => {
        if (profile.pool) await (await profile.pool).teardown({ persistState: false });
      }),
    );
  }
}
