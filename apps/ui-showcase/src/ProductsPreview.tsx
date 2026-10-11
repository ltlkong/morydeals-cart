import { useState } from 'react';
import { View, Switch } from 'react-native';
import * as Clipboard from 'expo-clipboard';
import { ProductCard, PurchaseButton, Masonry, imageHeightOf, Sheet, Copy, Button, colors, type ProductCardVariant } from '@morydeals/ui';
import { Heading, Options, CodeBlock } from './blocks';
import { AtlasPhoto } from './AtlasPhoto';
import { products } from './fixtures';

type Product = typeof products[number];
const shapes = ['Horizontal', 'Vertical', 'Vertical small'] as const;
type Shape = typeof shapes[number];
const variants: Record<Shape, ProductCardVariant> = { Horizontal: 'horizontal', Vertical: 'vertical', 'Vertical small': 'vertical-small' };

export function ProductsPreview({ availableWidth }: { availableWidth: number }) {
  const [shape, setShape] = useState<Shape>('Vertical');
  const [layout, setLayout] = useState('Masonry');
  const [selected, setSelected] = useState<Product | null>(null);
  const [bought, setBought] = useState('');
  const [copyFailure, setCopyFailure] = useState(false);
  const horizontal = shape === 'Horizontal';
  const compact = shape === 'Vertical small';
  const count = horizontal ? (availableWidth >= 800 ? 2 : 1) : availableWidth >= 760 ? (compact ? 5 : 4) : availableWidth >= 540 ? 3 : 2;
  const gap = 8;
  const width = (availableWidth - gap * (count - 1)) / count;
  const isWall = !horizontal && layout === 'Masonry';
  const imageHeight = (product: Product) => isWall ? imageHeightOf(product.key) * (compact ? 0.68 : 1) : compact ? 112 : 180;
  async function copy(code: string) {
    if (copyFailure) throw new Error('Preview copy failure');
    await Clipboard.setStringAsync(code);
  }
  function card(product: Product, width: number) {
    return <ProductCard card={product.card} variant={variants[shape]} width={width} imageHeight={imageHeight(product)}
      renderImage={product.slot === null ? undefined : geometry => <AtlasPhoto slot={product.slot!} size={geometry.width} height={geometry.height} />}
      onPress={() => setSelected(product)}
      action={<PurchaseButton couponCode={product.couponCode} buyLabel="Buy now" copyLabel="Copy coupon" copiedLabel="Copied!" copyErrorLabel="Copy failed. Select the code below." disabled={!product.card.price} onCopy={copy} onBuy={() => setBought(product.card.title)} />} />;
  }
  return <View style={{ gap: 18 }}>
    <Heading title="Product cards." description="Horizontal, vertical and compact. Clear metadata, mini history, and coupon-to-buy actions." />
    <View style={{ padding: 14, gap: 12, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.line, borderRadius: 20 }}>
      <Options label="Card shape" value={shape} options={shapes} onChange={setShape} />
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>{!horizontal && <Options label="Layout" value={layout} options={['Masonry', 'Grid']} onChange={setLayout} />}<View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}><Copy style={{ fontSize: 11 }}>Copy error</Copy><Switch accessibilityLabel="Preview clipboard failure" value={copyFailure} onValueChange={setCopyFailure} trackColor={{ false: colors.lineStrong, true: colors.accent }} /></View></View>
    </View>
    {!!bought && <Copy accessibilityLiveRegion="polite" tone="success" style={{ fontSize: 12 }}>Buy callback: {bought}</Copy>}
    {isWall ? <Masonry items={products} width={availableWidth} columns={count} gap={gap} keyExtractor={p => p.key} getItemHeight={p => imageHeight(p) + (compact ? 180 : 182)} renderItem={card} /> : <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap, alignItems: 'flex-start' }}>{products.map(product => <View key={product.key}>{card(product, width)}</View>)}</View>}
    <CodeBlock>{`<ProductCard\n  card={presentation}\n  variant="${variants[shape]}"\n  imageHeight={imageHeightOf(key)}\n  action={<PurchaseButton {...purchaseProps} />}\n  onPress={openDetails}\n/>`}</CodeBlock>
    <Sheet visible={!!selected} title={selected?.card.title ?? 'Product'} onClose={() => setSelected(null)}>
      <Copy tone="muted">{selected?.card.productTags.map(tag => tag.label).join(' · ')}</Copy>
      <Copy weight="extra" style={{ fontSize: 30 }}>{selected?.card.price ?? 'Awaiting price'}</Copy>
      <Copy tone="muted" style={{ fontSize: 13 }}>Card details and purchase are separate callbacks. This showcase uses sample data.</Copy>
      <Button onPress={() => setSelected(null)}>Done</Button>
    </Sheet>
  </View>;
}
