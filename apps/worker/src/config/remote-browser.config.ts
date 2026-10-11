import { z } from 'zod';
import { BrowserProviderIdSchema } from '@morydeals/capture-contracts';
import type { RemoteBrowserSettings } from '../acquisition/browser/browser.factory.ts';

const envName = z.string().regex(/^[A-Z][A-Z0-9_]*$/);
export const RemoteBrowserConfigurationSchema = z
  .array(
    z
      .object({
        id: BrowserProviderIdSchema,
        engine: z.enum(['chromium', 'firefox', 'webkit']),
        transport: z.enum(['playwright', 'cdp']),
        endpointEnv: envName,
        headersEnv: envName.optional(),
        stagehand: z.boolean().default(false),
      })
      .strict(),
  )
  .max(30);
// The deployment file contains environment references, never literal credentials.
export function resolveRemoteBrowsers(
  value: unknown,
  env: Record<string, string | undefined>,
): RemoteBrowserSettings[] {
  return RemoteBrowserConfigurationSchema.parse(value).map((settings) => {
    const endpoint = env[settings.endpointEnv];
    if (!endpoint)
      throw new Error(`Missing browser endpoint environment variable: ${settings.endpointEnv}`);
    let headers: Record<string, string> | undefined;
    if (settings.headersEnv) {
      const encoded = env[settings.headersEnv];
      if (!encoded)
        throw new Error(`Missing browser headers environment variable: ${settings.headersEnv}`);
      try {
        headers = z.record(z.string(), z.string()).parse(JSON.parse(encoded));
      } catch {
        throw new Error(`Invalid browser headers environment variable: ${settings.headersEnv}`);
      }
    }
    return {
      id: settings.id,
      engine: settings.engine,
      transport: settings.transport,
      endpoint,
      headers,
      stagehand: settings.stagehand,
    };
  });
}
