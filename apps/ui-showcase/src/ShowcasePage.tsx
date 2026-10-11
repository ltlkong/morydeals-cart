import { useState } from 'react';
import { View, Pressable, TextInput } from 'react-native';
import * as Clipboard from 'expo-clipboard';
import { ArrowUpRight, Check, Bell, Plus, Sparkles } from 'lucide-react-native';
import { Copy, Brand, Button, Chip, Badge, IconButton, Mory, SearchField, ProductCard, PriceHistory, CouponCard, Sheet, colors, fonts, type as typography, space, radius, type CouponCardProps } from '@morydeals/ui';
import { Heading, Panel, Options, CodeBlock } from './blocks';
import { products, pricePoints, sections, type SectionId } from './fixtures';
import { AtlasPhoto } from './AtlasPhoto';
import { MoryPlayground } from './MoryPlayground';
import { ProductsPreview } from './ProductsPreview';
import { AssistantPreview } from './AssistantPreview';

type Props = { section: SectionId; wide: boolean; availableWidth: number; onNavigate: (section: SectionId) => void };
export function ShowcasePage(props: Props) {
  switch (props.section) {
    case 'overview': return <Overview {...props} />;
    case 'foundations': return <Foundations />;
    case 'mory': return <MoryPlayground wide={props.wide} />;
    case 'products': return <ProductsPreview availableWidth={props.availableWidth} />;
    case 'charts': return <Charts />;
    case 'coupons': return <Coupons />;
    case 'assistant': return <View style={{ gap: 20 }}><Heading title="The original dock, shared." description="Drag between folded, half and full. The input stays anchored; page actions fade, and Mory rises to type with you." /><View style={{ maxWidth: 640, width: '100%' }}><AssistantPreview /></View></View>;
    case 'overlays': return <Overlays />;
  }
}
function Overview({ wide, onNavigate, availableWidth }: Props) {
  const cardWidth = Math.min(230, availableWidth - 72);
  return <View style={{ gap: 20 }}><View style={{ backgroundColor: colors.surfaceSunken, borderRadius: 24, padding: wide ? 32 : 22, flexDirection: wide ? 'row' : 'column', alignItems: wide ? 'center' : 'flex-start', gap: 20 }}><View style={{ flex: 1, gap: 12 }}><Badge icon={<Sparkles size={13} color={colors.accentInk} />}>WEB + REACT NATIVE</Badge><Copy weight="extra" style={{ fontSize: wide ? 40 : 30, lineHeight: wide ? 48 : 38, letterSpacing: -1 }}>Familiar warmth.{'\n'}A smarter shopping UI.</Copy><Copy tone="muted" style={{ fontSize: 14, lineHeight: 23, maxWidth: 520 }}>The Mory theme, a character with personality, and reusable building blocks for price tracking, coupons and conversation.</Copy><Button style={{ alignSelf: 'flex-start', marginTop: 5 }} icon={<ArrowUpRight size={17} color={colors.surface} />} onPress={() => onNavigate('mory')}>Explore Mory</Button></View><Mory pose="wave" size={wide ? 210 : 130} live /></View>
    <View style={{ flexDirection: wide ? 'row' : 'column', gap: 18 }}><Panel title="Product card" caption="Compact information" style={{ flex: 1 }}><View style={{ alignItems: 'center' }}><ProductCard card={products[0]!.card} width={cardWidth} renderImage={({ width, height }) => <AtlasPhoto slot={0} size={width} height={height} />} onPress={() => onNavigate('products')} /></View></Panel><View style={{ flex: 1, gap: 18 }}><Panel title="Price history" caption="30 sample observations"><PriceHistory days={sampleDays(pricePoints)} formatAmount={sampleAmount} formatDay={sampleDay(pricePoints)} /></Panel><CouponCard title="Save 10% on your order" code="MORYDEMO10" merchantLabel="Example store" terms="Example coupon for component preview." statusLabel="Preview code" onCopy={() => onNavigate('coupons')} /></View></View>
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 12 }}>{sections.filter(item => item.id !== 'overview').map(item => <Pressable accessibilityRole="button" accessibilityLabel={`Explore ${item.title}`} key={item.id} onPress={() => onNavigate(item.id)} style={{ width: wide ? (availableWidth - 24) / 3 : availableWidth, padding: 18, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.line, borderRadius: 16, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}><View><Copy weight="extra">{item.title}</Copy><Copy tone="muted" style={{ fontSize: 12 }}>{item.hint}</Copy></View><ArrowUpRight size={17} color={colors.muted} /></Pressable>)}</View>
  </View>;
}
function Foundations() {
  const [chip, setChip] = useState('All items');
  const [feedback, setFeedback] = useState('');
  const [search, setSearch] = useState('');
  const palette = ['background', 'surface', 'surfaceSunken', 'accent', 'accentSoft', 'ink', 'muted', 'success'] as const;
  return <View style={{ gap: 20 }}><Heading title="The Mory foundation." description="Copied from the original UI package: warm neutrals, vivid red, Nunito typography and consistent spacing." /><Panel title="Color tokens" caption="One source of truth"><View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 12 }}>{palette.map(name => <View key={name} style={{ width: 130, gap: 5 }}><View style={{ backgroundColor: colors[name], height: 72, borderRadius: 12, borderWidth: 1, borderColor: colors.line }} /><Copy weight="bold" style={{ fontSize: 12 }}>{name}</Copy><Copy tone="muted" selectable style={{ fontSize: 11 }}>{colors[name]}</Copy></View>)}</View></Panel><Panel title="Typography" caption="Nunito"><Copy style={typography.display}>Good things come to those who track.</Copy><Copy style={typography.heading}>A little help from Mory.</Copy><Copy style={typography.body}>The body style is calm, readable and easy to scan.</Copy><Copy style={typography.caption}>A caption for prices, sources and supporting details.</Copy><Copy style={typography.priceDisplay}>$329.99</Copy></Panel><Panel title="Actions & selection"><View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}><Button onPress={() => setFeedback('Primary action pressed')} icon={<Plus size={17} color={colors.surface} />}>Add a link</Button><Button secondary onPress={() => setFeedback('Secondary action pressed')}>Set an alert</Button><Button disabled onPress={() => {}}>Unavailable</Button><IconButton label="Preview notifications" onPress={() => setFeedback('Notification action pressed')}><Bell size={19} color={colors.ink} /></IconButton></View><View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 7 }}>{['All items', 'Price drops', 'Coupons'].map(label => <Chip key={label} label={label} selected={chip === label} onPress={() => setChip(label)} />)}</View><View style={{ flexDirection: 'row', gap: 8 }}><Badge green icon={<Check size={13} color={colors.success} />}>Price dropped</Badge><Badge>Coupon found</Badge></View>{!!feedback && <Copy accessibilityLiveRegion="polite" tone="muted" style={{ fontSize: 12 }}>{feedback}</Copy>}</Panel><Panel title="Brand & search" caption="Page header and store search"><Brand tagline="Save it now, buy it right." /><SearchField placeholder="Find a store" hints={['Amazon', 'Walmart', 'Best Buy']} clearLabel="Clear store search" value={search} onChangeText={setSearch} /></Panel><Panel title="Spacing & corners"><View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 20 }}>{Object.entries(space).map(([key, value]) => <View key={key} style={{ gap: 5 }}><View style={{ width: value, height: 28, backgroundColor: colors.accentSoft, borderLeftWidth: 2, borderColor: colors.accent }} /><Copy tone="muted" style={{ fontSize: 11 }}>{key} · {value}</Copy></View>)}</View><View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 15 }}>{Object.entries(radius).map(([key, value]) => <View key={key} style={{ width: 65, height: 65, borderRadius: value, borderWidth: 1, borderColor: colors.lineStrong, backgroundColor: colors.surfaceAlt, alignItems: 'center', justifyContent: 'center' }}><Copy tone="muted" style={{ fontSize: 11 }}>{key}</Copy></View>)}</View></Panel></View>;
}
function Charts() {
  const [range, setRange] = useState('30 days');
  const points = range === 'First observation' ? pricePoints.slice(0, 1) : range === '7 days' ? pricePoints.slice(-7) : pricePoints;
  return <View style={{ gap: 20 }}><Heading title="Make the price story clear." description="Daily prices as a step line, where today stands in one sentence, and the day under your finger. Currency and date formatting are supplied by the host." /><Panel title="History preview" caption="Sample CAD values"><Options label="History" value={range} options={['30 days', '7 days', 'First observation']} onChange={setRange} /><PriceHistory days={sampleDays(points)} formatAmount={sampleAmount} formatDay={sampleDay(points)} /></Panel><CodeBlock>{'<PriceHistory\n  days={dailyPrices(history, currentMinor)}\n  formatAmount={formatCurrency}\n  formatDay={formatDate}\n/>'}</CodeBlock></View>;
}
function Coupons() {
  const [state, setState] = useState<NonNullable<CouponCardProps['copyState']>>('idle');
  async function copy(code: string) { setState('copying'); try { await Clipboard.setStringAsync(code); setState('copied'); } catch { setState('error'); } }
  return <View style={{ gap: 20 }}><Heading title="A coupon you can act on." description="Clear terms and visible clipboard feedback. Code validity is supplied by the consuming application." /><Panel title="Copy states"><Options label="Clipboard state" value={state} options={['idle', 'copying', 'copied', 'error']} onChange={setState} /></Panel><View style={{ maxWidth: 600 }}><CouponCard title="Save 10% on your order" code="MORYDEMO10" merchantLabel="Example store" terms="Presentation code only. No real discount or store eligibility is implied." copyState={state} statusLabel={state === 'error' ? 'Could not copy. Try again.' : state === 'copied' ? 'Copied to your clipboard.' : 'Demo code · host owns clipboard behavior'} onCopy={copy} /></View><CodeBlock>{'<CouponCard\n  code="MORYDEMO10"\n  copyState={copyState}\n  onCopy={copyToClipboard}\n  {...couponPresentation}\n/>'}</CodeBlock></View>;
}
function Overlays() {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [saved, setSaved] = useState('');
  return <View style={{ gap: 20 }}><Heading title="Just enough room to focus." description="A shared sheet for short tasks. Test closing, keyboard entry and content scrolling on either platform." /><Panel title="Sheet preview"><Mory pose="welcome" size={130} still sign="Hello!" /><Button style={{ alignSelf: 'flex-start' }} onPress={() => setOpen(true)}>Open sheet</Button><Copy tone="muted" style={{ fontSize: 13 }}>Close with the button or backdrop. Web also supports Escape.</Copy>{!!saved && <Copy accessibilityLiveRegion="polite" weight="bold">Preview value: {saved}</Copy>}</Panel><Sheet visible={open} title="Name this example" onClose={() => setOpen(false)}><Copy tone="muted" style={{ fontSize: 13 }}>This input stays in local component state.</Copy><TextInput accessibilityLabel="Example name" value={name} onChangeText={setName} placeholder="My shopping list" style={{ backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.lineStrong, borderRadius: 14, padding: 14, fontFamily: fonts.regular }} /><Button disabled={!name.trim()} onPress={() => { setSaved(name.trim()); setOpen(false); }}>Apply preview</Button></Sheet><CodeBlock>{'<Sheet visible={open} title="Name this example" onClose={close}>\n  {formContent}\n</Sheet>'}</CodeBlock></View>;
}

/** Sample observations as chart days (index = day). */
const sampleDays = (points: readonly { label: string; amount: number }[]) => points.map((point, day) => ({ day, amountMinor: point.amount }));
const sampleDay = (points: readonly { label: string }[]) => (day: number) => points[day]?.label ?? '';
const sampleAmount = (amount: number) => `$${(amount / 100).toFixed(2)}`;
