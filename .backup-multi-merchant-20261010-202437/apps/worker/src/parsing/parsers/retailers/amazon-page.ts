import { htmlDocument, one } from '../shared/html.ts';

/** Classify Amazon's own verification document before extracting product facts. */
export function amazonPageChallenge(
  url: string,
  status: number,
  html?: string,
): string | undefined {
  const host = new URL(url).hostname;
  if (host !== 'amazon.ca' && host !== 'www.amazon.ca') return;
  if (status === 202) return 'Amazon verification response (HTTP 202)';
  if (
    new URL(url).pathname === '/_sec/verify' ||
    html?.includes('/_sec/verify?provider=interstitial')
  )
    return 'Amazon verification interstitial';
  if (!html) return;
  const root = htmlDocument(html);
  if (
    one(
      root,
      '#captchacharacters, form[action*="validateCaptcha"], form[action*="/_sec/verify"], iframe[src*="/_sec/verify"]',
    )
  )
    return 'Amazon verification page';
}
