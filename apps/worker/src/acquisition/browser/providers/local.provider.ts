import { chromium, firefox, webkit, type BrowserType } from 'playwright';
import { launchOptions } from 'camoufox-js';
import { VirtualDisplay } from 'camoufox-js/dist/virtdisplay.js';
import type {
  BrowserProvider,
  BrowserOpenOptions,
  BrowserLease,
  BrowserEngine,
} from '../browser-provider.types.ts';

const browsers: Record<BrowserEngine, BrowserType> = { chromium, firefox, webkit };
/** Our proxies exit in Canada; the browser's clock must agree with its IP, not with the host. */
export const BROWSER_TIMEZONE = 'America/Toronto';
/** Always a desktop: Camoufox fingerprints as Windows or macOS Firefox, never a phone. */
export const DESKTOP_OS = ['windows', 'macos'] as const;
export const DESKTOP_WINDOW: [number, number] = [1440, 900];

// Camoufox runs headful on a virtual display, harder to tell from a desktop than headless. Xvfb exists only on
// Linux; an existing display (xvfb-run) is used as is, otherwise one serves every browser in the process.
let display: Promise<string> | undefined;
const virtualDisplay = () => {
  if (process.platform !== 'linux') return undefined;
  if (process.env.DISPLAY) return Promise.resolve(process.env.DISPLAY);
  if (!display) {
    const xvfb = new VirtualDisplay();
    display = xvfb.get();
    process.once('exit', () => xvfb.kill());
  }
  return display;
};
export class LocalBrowserProvider implements BrowserProvider {
  readonly capabilities;
  constructor(
    readonly id: string,
    private readonly engine: BrowserEngine,
    private readonly camoufox = false,
  ) {
    if (camoufox && engine !== 'firefox') throw new Error('Camoufox requires Firefox');
    this.capabilities = {
      engine,
      transport: 'local' as const,
      stagehand: engine === 'chromium',
      launchLocale: camoufox,
    };
  }
  async open(options: BrowserOpenOptions): Promise<BrowserLease> {
    options.signal.throwIfAborted();
    const screen = this.camoufox ? await virtualDisplay() : undefined;
    const settings = this.camoufox
      ? await launchOptions({
          ...(screen ? { headless: false, virtual_display: screen } : { headless: true }),
          proxy: options.proxy,
          block_webrtc: true,
          humanize: true,
          // Stores serve their desktop page (the one the desktop parsers read) to a desktop browser at desktop size.
          os: DESKTOP_OS,
          window: DESKTOP_WINDOW,
          ...(options.locale ? { locale: options.locale } : {}),
          // The process clock, as on a desktop set to this zone. Camoufox ignores its own `timezone` setting.
          env: { ...process.env, TZ: BROWSER_TIMEZONE },
          firefox_user_prefs: { 'network.proxy.allow_hijacking_localhost': true },
        })
      : {
          headless: true,
          proxy: options.proxy,
          timeout: options.timeoutMs,
          ...(this.engine === 'chromium' ? { args: ['--proxy-bypass-list=<-loopback>'] } : {}),
          ...(this.engine === 'firefox'
            ? {
                firefoxUserPrefs: {
                  'network.proxy.allow_hijacking_localhost': true,
                  'media.peerconnection.enabled': false,
                },
              }
            : {}),
        };
    options.signal.throwIfAborted();
    return {
      launcher: browsers[this.engine],
      launchOptions: settings,
      ...(this.capabilities.stagehand
        ? {
            stagehand: {
              kind: 'local' as const,
              launchOptions: {
                executablePath: chromium.executablePath(),
                headless: true,
                args: [
                  '--proxy-bypass-list=<-loopback>',
                  ...(options.locale ? [`--lang=${options.locale}`] : []),
                ],
              },
            },
          }
        : {}),
      close: async () => {},
    };
  }
}
