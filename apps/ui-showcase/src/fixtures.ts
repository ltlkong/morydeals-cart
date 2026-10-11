import type { ProductCardData } from '@morydeals/ui';

/** A preview trend's days from a few sample prices (one per day, the newest last). */
const sampleDays = (prices: number[]) => prices.map((amountMinor, day) => ({ day, amountMinor }));

/** Presentation fixtures only; no merchant lookup or price service. */
export const products: { key: string; slot: number | null; couponCode?: string; card: ProductCardData }[] = [
  { key: 'headphones', slot: 0, card: { title: 'Sony WH-1000XM5 Wireless Noise Cancelling Headphones', price: '$329.99', was: '$399.99', productTags: [{ label: 'Wireless' }, { label: 'Noise cancelling' }], where: 'Example store', trend: { state: 'low', days: sampleDays([100, 100, 70, 70, 40, 40, 15]), label: 'At the sample 30-day low' } } },
  { key: 'camera', slot: 1, couponCode: 'MORYDEMO10', card: { title: 'Fujifilm Instax Mini Evo Hybrid Instant Camera', price: '$229.99', badge: 'Coupon', productTags: [{ label: 'Black' }, { label: '10% coupon', tone: 'accent' }], where: 'Example store', trend: { state: 'steady', days: sampleDays([60, 60, 60, 60, 60]), label: 'Steady sample price' } } },
  { key: 'sneakers', slot: 2, card: { title: 'New Balance 9060 Everyday Sneakers', price: '$159.99', was: '$199.99', productTags: [{ label: 'Rose / Grey' }, { label: 'Size 8' }], where: 'Example store', trend: { state: 'drop', days: sampleDays([90, 90, 90, 65, 65, 15]), label: 'Recent sample price drop' } } },
  { key: 'grinder', slot: 3, card: { title: 'Fellow Opus All-purpose Coffee Grinder', price: '$259.99', productTags: [{ label: 'White' }, { label: '41 settings' }], where: 'Example store', trend: { state: 'steady', days: sampleDays([50, 50, 50, 50, 50]), label: 'Steady sample price' } } },
  { key: 'hairdryer', slot: 4, couponCode: 'MORYDEMO15', card: { title: 'Ionic Hair Dryer', price: '$89.99', was: '$119.99', badge: 'Coupon', productTags: [{ label: 'Gold' }, { label: '15% coupon', tone: 'accent' }], where: 'Example store', trend: { state: 'drop', days: sampleDays([90, 90, 55, 55, 20]), label: 'Recent sample price drop' } } },
  { key: 'bottle', slot: 5, card: { title: 'Insulated Stainless Steel Water Bottle', price: '$69.99', productTags: [{ label: 'Blue' }, { label: '24 oz' }], where: 'Example store', trend: { state: 'steady', days: sampleDays([50, 50, 50, 50]), label: 'Steady sample price' } } },
  { key: 'pending', slot: null, card: { title: 'Product details are on the way', badge: 'Pending', productTags: [{ label: 'Saved link' }], where: 'Example store', noPriceLabel: 'Awaiting price' } },
];
export const pricePoints = Array.from({ length: 30 }, (_, day) => ({ label: new Date(Date.UTC(2026, 8, 9 + day)).toLocaleDateString('en-CA', { month: 'short', day: 'numeric', timeZone: 'UTC' }), amount: day < 9 ? 39999 : day < 20 ? 36999 : 32999 }));
export const sections = [
  { id: 'overview', title: 'Overview', hint: 'The library at a glance' },
  { id: 'foundations', title: 'Foundations', hint: 'Tokens, type & actions' },
  { id: 'mory', title: 'Mory', hint: 'Poses, motion & brand' },
  { id: 'products', title: 'Product cards', hint: 'Prices, coupons & pending' },
  { id: 'charts', title: 'Price charts', hint: 'History & target states' },
  { id: 'coupons', title: 'Coupons', hint: 'Code & feedback states' },
  { id: 'assistant', title: 'AI chat dock', hint: 'Conversation & composer' },
  { id: 'overlays', title: 'Sheets & overlays', hint: 'Modal & keyboard states' },
] as const;
export type SectionId = typeof sections[number]['id'];
