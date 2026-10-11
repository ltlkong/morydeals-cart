import { shopifyLanguage } from '@morydeals/capture-contracts';
import { parseExpressionAt } from 'acorn';
import { textContent } from 'domutils';
import { all, htmlDocument } from '../shared/html.ts';
import { currencyCode } from '../money.ts';
import { record } from '../shared/retailer.ts';

/** Evidence only: does not choose acquisition, a model, or a market for the caller. */
export function detectShopify(html: string) {
  const fields = new Map<string, Set<string>>();
  const evidence: string[] = [];
  const issues: string[] = [];
  for (const script of all(htmlDocument(html), 'script')) {
    const source = textContent(script);
    for (const match of source.matchAll(/\bShopify\.(shop|country|locale|currency)\s*=\s*/g)) {
      const field = match[1];
      try {
        const start = match.index! + match[0].length;
        const expression = parseExpressionAt(source, start, {
          ecmaVersion: 'latest',
        });
        // Acorn reads quoted string literals, including single quotes; objects must be strict JSON.
        const value =
          expression.type === 'Literal' &&
          'value' in expression &&
          typeof expression.value === 'string'
            ? expression.value
            : JSON.parse(source.slice(start, expression.end));
        const actual = field === 'currency' ? record(value).active : value;
        if (typeof actual !== 'string') throw new Error('Invalid declaration');
        const set = fields.get(field) ?? new Set<string>();
        set.add(actual);
        fields.set(field, set);
        evidence.push(`Shopify.${field}`);
      } catch {
        issues.push(`Invalid Shopify.${field}`);
      }
    }
  }
  const single = (key: string) => {
    const values = fields.get(key);
    if (values && values.size > 1) issues.push(`Conflicting Shopify.${key}`);
    return values?.size === 1 ? [...values][0] : undefined;
  };
  const shop = single('shop');
  const country = single('country');
  const locale = single('locale');
  const currency = single('currency');
  return {
    shopDomain: shop && /^[a-z0-9][a-z0-9-]*\.myshopify\.com$/.test(shop) ? shop : undefined,
    country: country && /^[A-Z]{2}$/.test(country) ? country : undefined,
    language: locale ? shopifyLanguage(locale) : undefined,
    currency: currencyCode(currency),
    evidence: [...new Set(evidence)],
    issues,
  };
}
