import { createServer } from 'node:http';
import { firefox } from 'playwright';
import { launchOptions } from 'camoufox-js';
import { VirtualDisplay } from 'camoufox-js/dist/virtdisplay.js';

const port = Number(process.env.CAMOUFOX_PORT ?? 9222);
const healthPort = Number(process.env.CAMOUFOX_HEALTH_PORT ?? 9223);
// Headful on a virtual display: harder to tell from a desktop than headless. The locale and timezone match the
// Canadian proxy exits; pages must not override them.
// The image starts under xvfb-run; a display of our own is only for running outside it.
const display = process.env.DISPLAY ? undefined : new VirtualDisplay();
const browser = await firefox.launchServer({
  ...await launchOptions({ headless: false, virtual_display: process.env.DISPLAY ?? await display!.get(), block_webrtc: true,
    humanize: true, locale: process.env.CAMOUFOX_LOCALE ?? 'en-CA',
    // The process clock, as on a desktop set to this zone. Camoufox ignores its own `timezone` setting.
    env: { ...process.env, TZ: process.env.CAMOUFOX_TIMEZONE ?? 'America/Toronto' },
    firefox_user_prefs: { 'network.proxy.allow_hijacking_localhost': true } }),
  host: '0.0.0.0', port, wsPath: '/camoufox',
});
const health = createServer((_request, response) => {
  response.writeHead(200, { 'content-type': 'application/json' }); response.end(JSON.stringify({ ready: true }));
});
health.listen(healthPort, '0.0.0.0');
console.info(`Camoufox ready on port ${port}, path /camoufox`);
let closing = false;
async function shutdown() {
  if (closing) return; closing = true;
  health.close(); await browser.close(); display?.kill();
}
process.once('SIGTERM', () => { void shutdown(); });
process.once('SIGINT', () => { void shutdown(); });
browser.process()?.once('exit', () => { health.close(); display?.kill(); process.exitCode = 1; });
