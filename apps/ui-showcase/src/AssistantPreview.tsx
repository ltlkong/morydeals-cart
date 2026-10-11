import { useRef, useState } from 'react';
import { View, Switch, Modal, useWindowDimensions } from 'react-native';
import { Compass, ShoppingBag, ListChecks, SlidersHorizontal, X } from 'lucide-react-native';
import { AssistantDock, DockNavigation, dockNavigationWidth, ProductRow, Copy, Button, Chip, IconButton, colors, type ChatMessage, type DockSnap, type DockActivity } from '@morydeals/ui';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Panel, Options, CodeBlock } from './blocks';
import { products } from './fixtures';
import { AtlasPhoto } from './AtlasPhoto';

const points = ['Folded', 'Half', 'Full'] as const;
export function AssistantPreview() {
  const [place, setPlace] = useState('browse');
  const places = [{key:'browse',label:'Browse stores',icon:()=> <Compass size={20} color={colors.ink}/>},{key:'cart',label:'Your cart',icon:()=> <ShoppingBag size={20} color={colors.ink}/>},{key:'lists',label:'Your lists',icon:()=> <ListChecks size={20} color={colors.ink}/>}];
  const [fullPreview, setFullPreview] = useState(false);
  const viewport = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [reject, setReject] = useState(false);
  const [feedback, setFeedback] = useState('');
  const [scenario, setScenario] = useState('Welcome');
  const [snap, setSnap] = useState<DockSnap>(0);
  const [keyboard, setKeyboard] = useState(false);
  const [activity, setActivity] = useState('Idle');
  const nextId = useRef(0);
  function send(text: string) {
    if (reject) { setFeedback('Submission rejected. Your draft is preserved.'); return false; }
    setFeedback('');
    setMessages(current => [...current, { id: `user-${nextId.current++}`, role: 'user', text }, { id: `reply-${nextId.current++}`, role: 'assistant', text: 'I can keep an eye on this item and help you find a coupon.', content: <ProductRow card={products[0]!.card} imageSize={56} renderImage={({ width, height }) => <AtlasPhoto slot={0} size={width} height={height} />} onPress={() => setFeedback('Product callback pressed')} /> }]);
    return true;
  }
  function chooseScenario(next: string) {
    setScenario(next);
    setMessages(next === 'Welcome' ? [] : next === 'Conversation' ? [{ id: 'a', role: 'user', text: 'When should I buy these headphones?' }, { id: 'b', role: 'assistant', text: 'The sample price is $329.99. Set a target or check for a coupon.' }] : Array.from({ length: 10 }, (_, i) => ({ id: `long-${i}`, role: i % 2 ? 'assistant' as const : 'user' as const, text: i % 2 ? 'Here is another preview reply to check scrolling in a longer conversation.' : 'Show me another example.' })));
  }
  const activityState = activity === 'Idle' ? undefined : { id: activity, state: activity === 'Scanning' ? 'running' : activity === 'Found a deal' ? 'done' : 'failed' } as DockActivity;
  const canvasHeight = 620;
  function renderCanvas(canvasHeight: number) { return (<View style={{ height: canvasHeight, borderWidth: 1, borderColor: colors.lineStrong, borderRadius: 24, backgroundColor: colors.background, overflow: 'hidden' }}>
      <View style={{ padding: 22, gap: 12 }}><Copy weight="extra" style={{ fontSize: 24 }}>Your shopping cart.</Copy><Copy tone="muted" style={{ fontSize: 13 }}>The page stays in place while the dock moves between its three positions.</Copy><ProductRow card={products[1]!.card} renderImage={({ width, height }) => <AtlasPhoto slot={1} size={width} height={height} />} onPress={() => setFeedback('Product callback pressed')} /></View>
      {keyboard && <View style={{ position: 'absolute', left: 0, right: 0, bottom: 0, height: 180, backgroundColor: colors.surfaceSunken, padding: 16, gap: 12 }}><Copy weight="bold" tone="muted" style={{ fontSize: 12 }}>Keyboard geometry preview</Copy><View style={{ flexDirection: 'row', gap: 4 }}>{'QWERTYUIOP'.split('').map(letter => <View key={letter} style={{ flex: 1, height: 32, borderRadius: 5, backgroundColor: colors.surface, justifyContent: 'center', alignItems: 'center' }}><Copy style={{ fontSize: 10 }}>{letter}</Copy></View>)}</View></View>}
      <AssistantDock availableHeight={canvasHeight - 2} keyboardInset={keyboard ? 180 : undefined} snap={snap} onSnapChange={setSnap} messages={messages} onSend={send} onRestart={() => { setMessages([]); setFeedback(''); }} activity={activityState}
        suggestions={messages.length ? [] : ['Find a coupon', 'Track a product']}
        welcome={<View style={{ gap: 5 }}><Copy weight="extra">Hi, I’m Mory.</Copy><Copy style={{ fontSize: 13 }}>Paste a product link. I’ll help you track its price and find a coupon.</Copy></View>}
        leadingActionWidth={dockNavigationWidth(places.length)} leadingAction={<DockNavigation items={places} selectedKey={place} onSelect={setPlace} />}
        actionLine={<View style={{ flexDirection: 'row', gap: 6 }}><Chip label="Tracked items" onPress={() => setFeedback('Tracked items pressed')} /><Chip label="Coupons" onPress={() => setFeedback('Coupons pressed')} /></View>}
      />
    </View>); }
  return <View style={{ gap: 18 }}>
    <Button onPress={() => setFullPreview(true)}>Open full-screen dock preview</Button>
    <Panel title="Dock positions & motion" caption="Original folded / half / full anchors">
      <Options label="Dock position" value={points[snap]} options={points} onChange={next => setSnap(points.indexOf(next) as DockSnap)} />
      <Options label="Scenario" value={scenario} options={['Welcome', 'Conversation', 'Long thread']} onChange={chooseScenario} />
      <Options label="Mory activity" value={activity} options={['Idle', 'Scanning', 'Found a deal', 'Error']} onChange={setActivity} />
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}><Copy style={{ fontSize: 12 }}>Preview keyboard geometry</Copy><Switch accessibilityLabel="Preview keyboard geometry" value={keyboard} onValueChange={setKeyboard} trackColor={{ false: colors.lineStrong, true: colors.accent }} /></View>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}><Copy style={{ fontSize: 12 }}>Reject submission</Copy><Switch accessibilityLabel="Reject message submission" value={reject} onValueChange={setReject} trackColor={{ false: colors.lineStrong, true: colors.accent }} /></View>
      {!!feedback && <Copy accessibilityLiveRegion="polite" tone="accentInk" style={{ fontSize: 12 }}>{feedback}</Copy>}
    </Panel>
    {renderCanvas(canvasHeight)}
    <CodeBlock>{'<AssistantDock\n  availableHeight={canvasHeight}\n  snap={snap} onSnapChange={setSnap}\n  messages={messages} onSend={handleSend}\n  actionLine={pageActions}\n/>'}</CodeBlock>
    <Modal visible={fullPreview} animationType="slide" onRequestClose={() => setFullPreview(false)}><View accessibilityViewIsModal role="dialog" aria-label="Mory dock preview" style={{ flex: 1, paddingTop: insets.top, paddingBottom: insets.bottom, backgroundColor: colors.background }}><View style={{ height: 56, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 18 }}><Copy weight="extra">MoryDeals · Dock preview</Copy><IconButton label="Close dock preview" onPress={() => setFullPreview(false)}><X size={20} color={colors.ink} /></IconButton></View>{renderCanvas(Math.max(200, viewport.height - insets.top - insets.bottom - 56))}</View></Modal>
  </View>;
}
