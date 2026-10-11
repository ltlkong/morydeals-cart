import { amazonPageChallenge } from '../../parsing/parsers/index.ts';
import { AcquisitionError } from '../acquisition.types.ts';
import { HttpTransport, decodeHtml } from './http.transport.ts';
import { type DomainLimiter } from '../network/domain-limiter.ts';
import { UrlPolicy } from '../network/url-policy.ts';
import type { AcquisitionDriver, DriverRequest, CapturedPage } from '../acquisition.types.ts';
import { NetworkSessions } from '../network/network-sessions.ts';

export class HttpDriver implements AcquisitionDriver {
  constructor(
    private readonly policy: UrlPolicy,
    private readonly limiter: DomainLimiter,
    private readonly maxBytes: number,
    private readonly network = new NetworkSessions(),
  ) {}
  async fetch(request: DriverRequest): Promise<CapturedPage> {
    const { url, archive, step, context, signal } = request;
    return this.network.run(request, async (proxyUrl) => {
      const fetched = await new HttpTransport(
        this.policy,
        this.limiter,
        step.timeoutMs,
        this.maxBytes,
      ).fetch(url, archive, { locale: context.locale, signal, proxyUrl });
      const statusChallenge = amazonPageChallenge(fetched.capture.url, fetched.capture.status);
      if (statusChallenge) throw new AcquisitionError('blocked', statusChallenge);
      const html = decodeHtml(fetched.body, fetched.capture, this.maxBytes);
      const challenge = amazonPageChallenge(fetched.capture.url, fetched.capture.status, html);
      if (challenge) throw new AcquisitionError('blocked', challenge);
      return { ...fetched, html };
    });
  }
}
