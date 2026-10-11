import http from 'node:http';
import https from 'node:https';
import { HttpsProxyAgent } from 'https-proxy-agent';
import net from 'node:net';
import { randomBytes } from 'node:crypto';
import { inputUrl, RejectedUrlError, UrlPolicy } from './url-policy.ts';

// Browsers resolve destinations in their own process. A proxy pins checked DNS answers
// to upstream sockets for both HTTP and HTTPS, including browser subresources.
export class EgressProxy {
  private readonly token = randomBytes(24).toString('hex');
  private readonly sockets = new Set<net.Socket>();
  private readonly server: http.Server;
  private port = 0;
  private upstreamProxyUrl?: string;
  private generation = 0;
  /** Why the last destination was refused, for a caller that reports it instead of a bare 403. */
  rejection?: RejectedUrlError;
  constructor(
    private readonly policy: UrlPolicy,
    private timeoutMs: number,
    private readonly maxBytes: number,
    private readonly bindHost = '127.0.0.1',
    private readonly advertisedHost = '127.0.0.1',
  ) {
    this.server = http.createServer((request, response) => {
      void this.forward(request, response);
    });
    this.server.on('connect', (request, socket, head) => {
      void this.tunnel(request, socket as net.Socket, head);
    });
    this.server.on('connection', (socket) => this.track(socket));
  }
  // A pooled browser slot runs one task at a time. Drain old sockets before changing its route.
  setUpstream(proxyUrl?: string, timeoutMs = this.timeoutMs) {
    this.disconnect();
    this.upstreamProxyUrl = proxyUrl;
    this.timeoutMs = timeoutMs;
  }
  disconnect() {
    this.generation++;
    for (const socket of this.sockets) socket.destroy();
  }
  async start() {
    await new Promise<void>((resolve, reject) => {
      this.server.once('error', reject);
      this.server.listen(0, this.bindHost, () => {
        this.server.off('error', reject);
        resolve();
      });
    });
    this.port = (this.server.address() as net.AddressInfo).port;
    return {
      server: `http://${this.advertisedHost}:${this.port}`,
      username: 'morydeals',
      password: this.token,
    };
  }
  private track(socket: net.Socket) {
    this.sockets.add(socket);
    socket.once('close', () => this.sockets.delete(socket));
    socket.on('error', () => undefined);
    socket.setTimeout(this.timeoutMs, () => socket.destroy());
  }
  private authenticated(request: http.IncomingMessage) {
    return (
      request.headers['proxy-authorization'] ===
      `Basic ${Buffer.from(`morydeals:${this.token}`).toString('base64')}`
    );
  }
  private async address(url: URL) {
    let timer: ReturnType<typeof setTimeout> | undefined;
    return Promise.race([
      this.policy.address(url),
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error('Proxy DNS timeout')), this.timeoutMs);
      }),
    ]).finally(() => clearTimeout(timer));
  }
  private async forward(request: http.IncomingMessage, response: http.ServerResponse) {
    const generation = this.generation;
    if (!this.authenticated(request)) {
      response.writeHead(407, { 'proxy-authenticate': 'Basic realm="MoryDeals"' });
      response.end();
      return;
    }
    try {
      const url = inputUrl(request.url);
      if (url.protocol !== 'http:') throw new Error('HTTPS requires CONNECT');
      const address = await this.address(url);
      if (generation !== this.generation || response.destroyed) return;
      const headers: http.OutgoingHttpHeaders = { ...request.headers, host: url.host };
      delete headers['proxy-authorization'];
      delete headers['proxy-connection'];
      const agent = this.upstreamProxyUrl
        ? new HttpsProxyAgent(this.upstreamProxyUrl, { timeout: this.timeoutMs })
        : undefined;
      const upstream = http.request({
        protocol: 'http:',
        hostname: address.address,
        port: url.port || 80,
        path: `${url.pathname}${url.search}`,
        method: request.method,
        headers,
        family: address.family,
        lookup: (_host, _options, callback) => callback(null, address.address, address.family),
        agent: agent ?? false,
      });
      upstream.once('close', () => agent?.destroy());
      upstream.on('socket', (socket) => this.track(socket));
      const timer = setTimeout(() => upstream.destroy(new Error('Proxy timeout')), this.timeoutMs);
      upstream.once('close', () => clearTimeout(timer));
      upstream.on('error', () => {
        clearTimeout(timer);
        if (!response.headersSent) response.writeHead(502);
        response.end();
      });
      upstream.on('response', (incoming) => {
        let bytes = 0;
        response.writeHead(incoming.statusCode ?? 502, incoming.headers);
        incoming.on('data', (chunk: Buffer) => {
          bytes += chunk.length;
          if (bytes > this.maxBytes) {
            incoming.destroy();
            upstream.destroy();
            response.destroy();
          }
        });
        incoming.on('error', () => response.destroy());
        incoming.on('end', () => clearTimeout(timer));
        incoming.pipe(response);
      });
      request.on('aborted', () => upstream.destroy());
      response.once('close', () => upstream.destroy());
      request.pipe(upstream);
    } catch (error) {
      if (error instanceof RejectedUrlError) this.rejection = error;
      response.writeHead(403);
      response.end('Destination rejected');
    }
  }
  private async tunnel(request: http.IncomingMessage, socket: net.Socket, head: Buffer) {
    const generation = this.generation;
    if (!this.authenticated(request)) {
      socket.end(
        'HTTP/1.1 407 Proxy Authentication Required\r\nProxy-Authenticate: Basic realm="MoryDeals"\r\n\r\n',
      );
      return;
    }
    try {
      const url = inputUrl(`https://${request.url}`);
      const address = await this.address(url);
      if (generation !== this.generation || socket.destroyed) return;
      const upstream = await this.connect(address.address, Number(url.port || 443));
      if (socket.destroyed || generation !== this.generation) {
        upstream.destroy();
        return;
      }
      this.track(upstream);
      let received = 0;
      upstream.on('data', (chunk: Buffer) => {
        received += chunk.length;
        if (received > this.maxBytes * 4) {
          upstream.destroy();
          socket.destroy();
        }
      });
      socket.write('HTTP/1.1 200 Connection Established\r\n\r\n');
      if (head.length) upstream.write(head);
      socket.pipe(upstream);
      upstream.pipe(socket);
      upstream.once('error', () => socket.destroy());
      socket.once('close', () => upstream.destroy());
      upstream.once('close', () => socket.destroy());
    } catch (error) {
      if (error instanceof RejectedUrlError) this.rejection = error;
      socket.end('HTTP/1.1 403 Forbidden\r\n\r\n');
    }
  }
  private connect(host: string, port: number): Promise<net.Socket> {
    if (!this.upstreamProxyUrl)
      return new Promise((resolve, reject) => {
        const socket = net.connect({ host, port });
        this.track(socket);
        socket.once('connect', () => resolve(socket));
        socket.once('error', reject);
        socket.once('close', () => reject(new Error('Connection closed')));
      });
    const proxy = new URL(this.upstreamProxyUrl);
    // CONNECT targets the already-validated IP. Hostname resolution is never delegated to the proxy.
    return new Promise((resolve, reject) => {
      const request = (proxy.protocol === 'https:' ? https : http).request(proxy, {
        method: 'CONNECT',
        path: `${net.isIPv6(host) ? `[${host}]` : host}:${port}`,
        agent: false,
        headers: { host: `${host}:${port}` },
      });
      // Node's URL auth sets Authorization; proxies require Proxy-Authorization instead.
      request.removeHeader('authorization');
      if (proxy.username || proxy.password)
        request.setHeader(
          'proxy-authorization',
          `Basic ${Buffer.from(`${decodeURIComponent(proxy.username)}:${decodeURIComponent(proxy.password)}`).toString('base64')}`,
        );
      request.on('socket', (socket) => this.track(socket));
      const timer = setTimeout(
        () => request.destroy(new Error('Upstream proxy timeout')),
        this.timeoutMs,
      );
      request.once('error', () => {
        clearTimeout(timer);
        reject(new Error('Upstream proxy connection failed'));
      });
      request.once('close', () => {
        clearTimeout(timer);
        reject(new Error('Upstream proxy connection closed'));
      });
      request.once('connect', (response, socket, head) => {
        clearTimeout(timer);
        if (response.statusCode !== 200) {
          socket.destroy();
          reject(new Error('Upstream proxy rejected connection'));
          return;
        }
        if (head.length) socket.unshift(head);
        resolve(socket);
      });
      request.end();
    });
  }
  async close() {
    this.disconnect();
    if (this.server.listening)
      await new Promise<void>((resolve) => this.server.close(() => resolve()));
  }
}
