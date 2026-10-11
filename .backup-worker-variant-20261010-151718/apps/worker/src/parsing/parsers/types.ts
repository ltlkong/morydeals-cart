export interface PageDocument {
  version: '1';
  url: string;
  /** Original user URL, retained across redirects to verify selected-item identity. */
  requestedUrl?: string;
  /** Original inert HTML for deterministic retailer readers. Never executed. */
  html?: string;
  storefront?: {
    target: import('./shopify/store.ts').ShopifyTarget;
    response: unknown;
  };
  fetchedAt: string;
  markdown: string;
  metadata: Record<string, string[]>;
  jsonLd: unknown[];
  /** Inert product JSON captured before script removal; never evaluated. */
  embeddedProducts?: {
    kind: 'selected-variant' | 'product';
    source: string;
    value: unknown;
  }[];
}

export interface Offer {
  /** Integer smallest currency units; CAD 89.99 = 8999. */
  amountMinor: number;
  /** Advertised former price, never a second purchasable offer. */
  compareAtAmountMinor?: number;
  compareAtEvidence?: string;
  currencyEvidence: string;
  currency: string;
  url?: string;
  availability?: string;
  seller?: string;
  validUntil?: string;
  evidence: string;
}

export interface Product {
  url: string;
  title: string;
  description?: string;
  brand?: string;
  sku?: string;
  variantId?: string;
  images: string[];
  offers: Offer[];
  evidence: string;
}

export interface ParseResult {
  parserVersion: string;
  strategy: string;
  status: 'parsed' | 'needs_review';
  products: Product[];
  issues: string[];
  /** The page had not finished loading when it was read: reading it again can work; guessing from it cannot. */
  incomplete?: true;
}

export interface ParserStrategy {
  id: string;
  parse(document: PageDocument): ParseResult;
}
