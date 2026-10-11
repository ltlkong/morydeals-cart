import http from 'node:http';
import net from 'node:net';

// A real CONNECT proxy that records routing/auth without using a paid proxy service.
export async function startProxy() {
  const requests: { destination: string; auth?: string }[] = [];
  const sockets = new Set<net.Socket>();
  const track = (socket: net.Socket) => {
    sockets.add(socket);
    socket.once('close', () => sockets.delete(socket));
    socket.on('error', () => undefined);
  };
  const server = http.createServer((_req, res) => {
    res.writeHead(405);
    res.end();
  });
  server.on('connection', track);
  server.on('connect', (request, incoming, head) => {
    const client = incoming as net.Socket;
    requests.push({ destination: request.url!, auth: request.headers['proxy-authorization'] });
    const url = new URL(`http://${request.url}`);
    const upstream = net.connect({ host: url.hostname, port: Number(url.port) });
    track(upstream);
    upstream.on('connect', () => {
      client.write('HTTP/1.1 200 Connection Established\r\n\r\n');
      if (head.length) upstream.write(head);
      client.pipe(upstream).pipe(client);
    });
    client.once('close', () => upstream.destroy());
    upstream.once('close', () => client.destroy());
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  return {
    url: `http://user:secret@127.0.0.1:${(server.address() as net.AddressInfo).port}`,
    requests,
    async close() {
      for (const socket of sockets) socket.destroy();
      await new Promise<void>((resolve) => server.close(() => resolve()));
    },
  };
}
