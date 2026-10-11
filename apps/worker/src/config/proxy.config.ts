import { z } from 'zod';

const profileSchema = z
  .object({
    id: z.string().regex(/^[a-z][a-z0-9_-]{0,63}$/),
    urlsEnv: z.string().regex(/^[A-Z][A-Z0-9_]*$/),
    maxSessions: z.number().int().min(1).max(100).default(10),
    maxSessionUses: z.number().int().min(1).max(1000).default(50),
    maxSessionAgeSecs: z.number().int().min(10).max(3600).default(600),
  })
  .strict();

export interface ProxyProfile extends Omit<z.infer<typeof profileSchema>, 'urlsEnv'> {
  urls: string[];
}

// Files contain environment variable names; credentials are resolved only in the worker.
export function resolveProxyProfiles(value: unknown, env: NodeJS.ProcessEnv): ProxyProfile[] {
  const profiles = z.array(profileSchema).max(20).parse(value);
  if (new Set(profiles.map((profile) => profile.id)).size !== profiles.length)
    throw new Error('Proxy profile IDs must be unique');
  return profiles.map(({ urlsEnv, ...profile }) => {
    try {
      const urls = z
        .array(z.string().url())
        .min(1)
        .max(100)
        .parse(JSON.parse(env[urlsEnv] ?? ''));
      for (const value of urls) {
        const url = new URL(value);
        if (
          !['http:', 'https:'].includes(url.protocol) ||
          url.pathname !== '/' ||
          url.search ||
          url.hash
        )
          throw new Error('Invalid proxy endpoint');
      }
      return { ...profile, urls };
    } catch {
      throw new Error(`Invalid proxy URLs in environment variable: ${urlsEnv}`);
    }
  });
}
