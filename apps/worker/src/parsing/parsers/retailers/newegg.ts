import type { Condition, PageDocument, Product } from '../types.ts';
import { conditionInText, promotion, rating } from '../shared/facts.ts';
import {
  all,
  assignedJson,
  content,
  htmlDocument,
  plainHtml,
  type HtmlNode,
} from '../shared/html.ts';
import { displayedMinorUnits } from '../money.ts';
import {
  record,
  list,
  text,
  requireValue,
  check,
  amount,
  compareAt,
  imageUrls,
  merchantUrl,
  parseRetailer,
} from '../shared/retailer.ts';

/** Newegg's own flags (open box, refurbished, new) or the title's words; nothing stated stays unknown. */
function neweggCondition(feature: Record<string, unknown>, title: string): Condition | undefined {
  if (feature.IsOpenBoxed === true) return 'open_box';
  if (feature.IsRefurbished === true) return 'renewed';
  return conditionInText(title) ?? (feature.IsNew === true ? 'new' : undefined);
}
function canonical(value: unknown): string | undefined {
  const candidate = text(value)?.toUpperCase();
  if (!candidate) return;
  if (/^\d{2}-\d{3}-\d{3}$/.test(candidate)) return 'N82E168' + candidate.replaceAll('-', '');
  return /^(N82E168\d{8}|9SI[A-Z0-9]{11}|[A-Z0-9]{3}-[A-Z0-9]{4}-[A-Z0-9]{5})$/.test(candidate)
    ? candidate
    : undefined;
}
function itemId(value: string): string {
  const url = merchantUrl(value, 'newegg.ca');
  const path = requireValue(
    /^\/(?:[A-Za-z0-9-]+\/)?p\/([^/]+)\/?$/i.exec(url.pathname)?.[1],
    'Unsupported Newegg product URL',
  );
  check(canonical(path), 'Invalid Newegg product path');
  const selections = [...url.searchParams].filter(([k]) => k.toLowerCase() === 'item');
  check(selections.length <= 1, 'Ambiguous Newegg Item selection');
  return requireValue(canonical(selections[0]?.[1] ?? path), 'Invalid Newegg Item');
}
function validateAddons(initial: Record<string, unknown>) {
  // Desktop pages name the selection PropertyCollection; mobile pages name the same groups Property.
  const groups = record(initial.PropertyCollection ?? initial.Property).PropertyGroups;
  if (groups == null) return;
  check(Array.isArray(groups), 'Malformed Newegg selection groups');
  for (const entry of groups) {
    const group = record(entry);
    const chosen = record(group.SelectedProperty).Value;
    const choices = list(group.Properties)
      .map(record)
      .filter((p) => String(p.Value) === String(chosen));
    const plan = /protection|warranty|service\s+plan|\bsnet\b/i;
    const excluded =
      group.HasPriceAdditionInfo === true || plan.test(text(group.GroupDescription) ?? '');
    if (excluded) check(choices.length === 1, 'Unconfirmed Newegg add-on selection');
    for (const choice of choices) {
      const label = text(choice.Description) ?? text(choice.DisplayInfo) ?? '';
      check(
        !(excluded || plan.test(label)) ||
          /^(?:no\b|none\b|without\b|not\s+included\b|decline\b)/i.test(label),
        'Newegg protection plans and paid add-ons are excluded',
      );
    }
  }
}
function gallery(item: Record<string, unknown>, url: string) {
  const image = record(item.Image);
  const normal = record(image.Normal);
  const patterns = list(image.ImagePathPattern)
    .map(record)
    .filter((p) => Number.isInteger(p.Size) && Number(p.Size) > 0)
    .sort((a, b) => Number(b.Size) - Number(a.Size));
  const pattern = text(patterns[0]?.PathPattern);
  if (!pattern) return [];
  const names = (text(normal.ImageNameList) ?? text(normal.ImageName) ?? '')
    .split(',')
    .map((v) => v.trim())
    .filter((v) => /^[A-Za-z0-9_.-]+$/.test(v) && v !== '.' && v !== '..');
  return imageUrls(
    names.map((name) =>
      pattern.replaceAll('{ImageName}', name).replaceAll('{Size}', String(patterns[0].Size)),
    ),
    url,
  );
}
function read(document: PageDocument, issues: string[]): Product {
  const expected = itemId(document.requestedUrl ?? document.url);
  check(itemId(document.url) === expected, 'Newegg redirected to a different item');
  const root = htmlDocument(requireValue(document.html, 'Newegg requires original HTML'));
  const initial = record(assignedJson(root, '__initialState__'));
  const state = assignedJson(root, '__neweggState__', true);
  const item = record(initial.ItemDetail);
  if (state === undefined && item.Price && typeof item.Price === 'object')
    return readMobile(root, initial, expected);
  const site = record(state);
  check(canonical(item.Item) === expected, 'Newegg selected item mismatch');
  validateAddons(initial);
  const description = record(item.Description);
  const title = requireValue(text(description.Title), 'Missing Newegg title');
  const feature = record(item.Feature);
  const condition = neweggCondition(feature, title);
  const currency = requireValue(
    text(record(site.currency).currencyCode),
    'Missing Newegg currency',
  );
  check(
    currency === 'CAD' &&
      [record(site.country).currency, item.CurrencyCode, item.Currency].every(
        (v) => v == null || v === currency,
      ),
    'Newegg currency mismatch',
  );
  const seller = record(item.Seller);
  const firstParty = seller.SellerId === '' && !expected.startsWith('9SI');
  if (firstParty)
    check(
      !text(seller.SellerName) || ['Newegg', 'Newegg Canada'].includes(String(seller.SellerName)),
      'Conflicting Newegg seller',
    );
  else requireValue(text(seller.SellerId), 'Missing Newegg seller identity');
  const sellerName = firstParty
    ? 'Newegg Canada'
    : requireValue(text(seller.SellerName), 'Missing Newegg seller name');
  const final = amount(item.FinalPrice, currency);
  const unit = amount(item.UnitCost, currency);
  const rebate = amount(item.InstantRebateAmount, currency);
  // FinalPrice can include the shipping charge (ASUS desktop: 3399.99 − 200 + 29.99); the item's price is unit cost
  // less the instant rebate, when the final price corroborates it with or without shipping.
  const shipping = item.ShippingCharge == null ? 0 : amount(item.ShippingCharge, currency);
  const current = unit - rebate;
  check(
    current > 0 && (final === current || final === current + shipping),
    'Newegg item price is not corroborated; it may include fees',
  );
  check(
    item.PriceHideMark == null || item.PriceHideMark === 0 || item.PriceHideMark === '0',
    'Newegg price is hidden',
  );
  const subscription = record(item.Subscription);
  check(
    subscription.SubscriptionOnly !== true && subscription.IsSubscriptionOnly !== true,
    'Newegg subscription-only price',
  );
  const url = `https://www.newegg.ca/p/${expected}${expected.startsWith('9SI') ? `?Item=${expected}` : ''}`;
  const evidence = 'window.__initialState__.ItemDetail';
  const review = record(item.Review);
  const stars = rating(
    { value: review.RatingOneDecimal, scale: 5, count: review.HumanRating },
    `${evidence}.Review.RatingOneDecimal`,
  );
  const specifications = list(record(item.DetailSpecificationObject).Groups)
    .flatMap((group) => list(record(group).Properties))
    .map(record)
    .flatMap((property) => {
      const name = text(property.Key);
      const value = plainHtml(property.Value);
      return name && value && !/best seller ranking/i.test(name) ? [{ name, value }] : [];
    })
    .slice(0, 30);
  const categories = all(root, 'script[type="application/ld+json"]')
    .flatMap((script) => {
      try {
        return [record(JSON.parse(content(script)))];
      } catch {
        return [];
      }
    })
    .filter((node) => node['@type'] === 'BreadcrumbList')
    .slice(0, 1)
    .flatMap((node) => list(node.itemListElement))
    .flatMap((entry) => {
      const name = text(record(record(entry).item).name);
      return name && !/^home$/i.test(name) ? [name] : [];
    });
  // Event badges on the item ("FantasTech Deal"); their end has no zone, so it is not a countdown.
  const promotions = list(item.EssItemBadges)
    .map(record)
    .filter((badge) => !badge.ItemNumber || badge.ItemNumber === item.Item)
    .flatMap((badge) => {
      const found = promotion('deal', badge.Title, `${evidence}.EssItemBadges`);
      return found ? [found] : [];
    });
  return {
    url,
    title,
    sku: expected,
    ...(stars ? { rating: stars } : {}),
    ...(specifications.length ? { specifications } : {}),
    ...(categories.length ? { categories } : {}),
    brand: text(record(item.ItemManufactory).Manufactory),
    description: plainHtml(description.LongDescription),
    images: gallery(item, url),
    evidence,
    offers: [
      {
        ...(condition ? { condition } : {}),
        amountMinor: current,
        ...compareAt(
          item.OriginalUnitPrice,
          current,
          currency,
          `${evidence}.OriginalUnitPrice`,
          issues,
        ),
        currency,
        currencyEvidence: 'window.__neweggState__.currency.currencyCode',
        seller: sellerName,
        availability:
          item.Instock === true ? 'InStock' : item.Instock === false ? 'OutOfStock' : undefined,
        ...(promotions.length ? { promotions } : {}),
        url,
        evidence: `${evidence}.UnitCost − InstantRebateAmount`,
      },
    ],
  };
}
const MOBILE_IMAGES = 'https://c1.neweggimages.com/productimage/nb640/';
/**
 * Newegg's mobile site: no __neweggState__; ItemDetail names the item NeweggItemNumber and carries a Price object.
 * Identity must agree across the item, route and option map, and the price across the state and its JSON-LD.
 */
function readMobile(root: HtmlNode, initial: Record<string, unknown>, expected: string): Product {
  const item = record(initial.ItemDetail);
  check(canonical(item.NeweggItemNumber) === expected, 'Newegg selected item mismatch');
  const route = record(initial.params).Item;
  check(route == null || canonical(route) === expected, 'Newegg selected item mismatch');
  const property = record(initial.Property);
  const selected = list(property.SelectedProperties).map(record);
  if (selected.length) {
    const chosen = list(property.AvailableMap)
      .map(record)
      .filter((entry) => {
        const map = list(entry.Map).map(record);
        return (
          map.length === selected.length &&
          selected.every((s) => map.some((m) => m.Name === s.Name && m.Value === s.Value))
        );
      });
    check(
      chosen.length === 1 && canonical(chosen[0].NeweggItemNumber) === expected,
      'Newegg selected options do not match the item',
    );
  }
  validateAddons(initial);
  const description = record(item.Description);
  const title = requireValue(text(description.Title), 'Missing Newegg title');
  const feature = record(item.Feature);
  const condition = neweggCondition(feature, title);
  const price = record(item.Price);
  check(price.CurrencyCode === 'CAD', 'Newegg currency mismatch');
  const current = amount(price.FinalPrice, 'CAD');
  const detail = record(price.CurrentPriceDetail);
  check(
    displayedMinorUnits(
      `${text(detail.PriceInteger) ?? ''}${text(detail.PriceDecimal) ?? ''}`,
      'CAD',
    ) === current,
    'Newegg displayed price does not match the item price',
  );
  const original = text(price.OriginalPriceText)
    ? displayedMinorUnits(String(price.OriginalPriceText), 'CAD')
    : undefined;
  const rebate = price.InstantRebateAmount ? amount(price.InstantRebateAmount, 'CAD') : 0;
  check(
    original === undefined ? rebate === 0 : current === original - rebate,
    'Newegg item price is not corroborated; it may include fees',
  );
  // Independent check: the page's one Product JSON-LD must name this item at this price.
  const products = all(root, 'script[type="application/ld+json"]').flatMap((node) => {
    try {
      const value = record(JSON.parse(content(node)));
      return String(value['@type']).includes('Product') ? [value] : [];
    } catch {
      return [];
    }
  });
  check(products.length === 1, 'Newegg structured product data missing or ambiguous');
  // schema.org allows one Offer object or a list of them.
  const offered = products[0].offers;
  const offers = (Array.isArray(offered) ? offered : offered ? [offered] : []).map(record);
  check(
    canonical(products[0].sku) === expected &&
      offers.length === 1 &&
      offers[0].priceCurrency === 'CAD' &&
      amount(offers[0].price, 'CAD') === current,
    'Newegg structured product data does not match the item price',
  );
  check(
    item.PriceHideMark == null || item.PriceHideMark === 0 || item.PriceHideMark === '0',
    'Newegg price is hidden',
  );
  const subscription = record(item.Subscription);
  check(
    subscription.SubscriptionOnly !== true && subscription.IsSubscriptionOnly !== true,
    'Newegg subscription-only price',
  );
  // The mobile state carries no seller id, so only first-party items are accepted.
  check(
    !expected.startsWith('9SI') && ['Newegg', 'Newegg Canada'].includes(String(item.SellerName)),
    'Newegg marketplace seller is unconfirmed on the mobile site',
  );
  const url = `https://www.newegg.ca/p/${expected}`;
  const evidence = 'window.__initialState__.ItemDetail.Price';
  return {
    url,
    title,
    sku: expected,
    brand: text(record(item.ItemManufactory).Manufactory),
    description: plainHtml(description.WebDescription),
    images: imageUrls(
      list(item.ImageList)
        .map((name) => text(name) ?? '')
        .filter((name) => /^[A-Za-z0-9_.-]+$/.test(name) && name !== '.' && name !== '..')
        .map((name) => MOBILE_IMAGES + name),
      url,
    ),
    evidence,
    offers: [
      {
        ...(condition ? { condition } : {}),
        amountMinor: current,
        ...(original !== undefined && original > current
          ? { compareAtAmountMinor: original, compareAtEvidence: `${evidence}.OriginalPriceText` }
          : {}),
        currency: 'CAD',
        currencyEvidence: `${evidence}.CurrencyCode`,
        seller: 'Newegg Canada',
        availability:
          item.IsInStock === true ? 'InStock' : item.IsInStock === false ? 'OutOfStock' : undefined,
        url,
        evidence: `${evidence}.FinalPrice`,
      },
    ],
  };
}
export const parseNeweggProduct = (document: PageDocument) =>
  parseRetailer('newegg-ca', document, read);
