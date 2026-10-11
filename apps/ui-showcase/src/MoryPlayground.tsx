import { useRef, useState } from 'react';
import { View, Switch, TextInput } from 'react-native';
import { ReduceMotion, useSharedValue, withTiming } from 'react-native-reanimated';
import { Mory, MorySilhouette, MoryAvatar, MoryState, MORY_AVATAR_SIZES, DealTag, MORY_POSES, Button, Copy, colors, fonts, type MoryPose, type MoryHolding, type MoryHeadpiece, type MoryExpression, type MoryHandMotion, type MoryAvatarSize, type MoryStateKind } from '@morydeals/ui';
import { Heading, Panel, Options, CodeBlock } from './blocks';

const fruits: MoryHeadpiece[] = ['orange', 'apple', 'pear', 'cherry', 'lemon', 'none'];
const expressions: MoryExpression[] = ['neutral', 'happy', 'wink', 'sleepy', 'starry', 'surprised', 'worried'];
const props: MoryHolding[] = ['none', 'card', 'camera', 'heart', 'tag', 'deals', 'sign', 'keyboard', 'box', 'plug', 'bell', 'drop', 'bag', 'magnifier'];
const stateKinds: MoryStateKind[] = ['empty-cart', 'price-drop', 'loading', 'no-results', 'error', 'alert-set'];
const stateCopy: Record<MoryStateKind, { title: string; message: string }> = {
  'empty-cart': { title: 'Your cart is empty', message: 'Paste a link and Mory will watch its price.' },
  'price-drop': { title: 'Price dropped!', message: 'Sample: now $329.99, was $399.99.' },
  loading: { title: 'Looking for deals…', message: 'Checking prices and coupons.' },
  'no-results': { title: 'Nothing found', message: 'Try another store or a shorter name.' },
  error: { title: 'Something went wrong', message: 'Check your connection and try again.' },
  'alert-set': { title: 'Alert set', message: "Mory will ring when the price drops." },
};
const hands: MoryHandMotion[] = ['hold', 'wave', 'tap'];
export function MoryPlayground({ wide }: { wide: boolean }) {
  const [pose, setPose] = useState<MoryPose>('mascot');
  const [fruit, setFruit] = useState<MoryHeadpiece>('orange');
  const [expression, setExpression] = useState<MoryExpression>('neutral');
  const [holding, setHolding] = useState<MoryHolding>('card');
  const [handMotion, setHandMotion] = useState<MoryHandMotion>('hold');
  const [animated, setAnimated] = useState(true);
  const [bob, setBob] = useState(true);
  const [blink, setBlink] = useState(true);
  const [sway, setSway] = useState(true);
  const [effects, setEffects] = useState(true);
  const [entry, setEntry] = useState(0);
  const [sign, setSign] = useState('Hello!');
  const [followTyping, setFollowTyping] = useState(false);
  const [typingText, setTypingText] = useState('');
  const strokes = useSharedValue(0);
  const strokeCount = useRef(0);
  function choosePose(next: MoryPose) { setPose(next); if (next === 'drop') setSign('-18%'); else if (next === 'welcome') setSign('Hello!'); setHolding(MORY_POSES[next].holding); setHandMotion(next === 'wave' ? 'wave' : next === 'type' ? 'tap' : 'hold'); }
  return <View style={{ gap: 20 }}><Heading title="Meet Mory. Make it yours." description="Original Mory artwork, separated into composable parts. Fruit, held object, expression and hand motion can change independently." />
    <View style={{ flexDirection: wide ? 'row' : 'column', gap: 18 }}>
      <Panel title="Live character" caption="SVG + Reanimated" style={{ flex: 1 }}><View style={{ backgroundColor: colors.surfaceAlt, borderRadius: 16, height: 290, justifyContent: 'center', alignItems: 'center' }}><Mory key={entry} pose={pose} holding={holding} headpiece={fruit} expression={expression} size={260} live still={!animated} sign={sign} keystrokes={followTyping && holding === 'keyboard' ? strokes : undefined} dropIn={entry > 0} showEffects={effects} motion={{ hands: handMotion, body: bob ? 'bob' : 'still', eyes: blink ? 'blink' : 'still', headpiece: sway ? 'sway' : 'still' }} /></View><View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}><Copy weight="bold">Animation</Copy><Switch accessibilityLabel="Play Mory animation" value={animated} onValueChange={setAnimated} trackColor={{ false: colors.lineStrong, true: colors.accent }} /></View><Button secondary disabled={!animated} onPress={() => setEntry(e => e + 1)}>Replay entrance</Button><CodeBlock>{`<Mory\n  pose="${pose}" size={260}\n  holding="${holding}" headpiece="${fruit}"\n  expression="${expression}"\n  motion={{ hands: '${handMotion}',\n    body: '${bob ? 'bob' : 'still'}', eyes: '${blink ? 'blink' : 'still'}',\n    headpiece: '${sway ? 'sway' : 'still'}' }}\n  showEffects={${effects}} still={${!animated}}\n/>`}</CodeBlock></Panel>
      <Panel title="Character controls" caption="Independent layers" style={{ flex: 1 }}><Options label="Head fruit" value={fruit} options={fruits} onChange={setFruit} /><Options label="Holding" value={holding} options={props} onChange={setHolding} /><Options label="Hands" value={handMotion} options={hands} onChange={setHandMotion} /><Options label="Expression" value={expression} options={expressions} onChange={setExpression} />{(holding === 'sign' || holding === 'drop') && <TextInput accessibilityLabel="Mory sign text" value={sign} onChangeText={setSign} maxLength={18} style={{ padding: 12, backgroundColor: colors.surfaceAlt, borderRadius: 10, fontFamily: fonts.bold, color: colors.ink }} />}{holding === 'keyboard' && <View style={{ gap: 8 }}><View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}><Copy style={{ fontSize: 13 }}>Follow your typing</Copy><Switch accessibilityLabel="Mory follows typing" value={followTyping} onValueChange={next => { setFollowTyping(next); if (next) setHandMotion('tap'); }} trackColor={{ false: colors.lineStrong, true: colors.accent }} /></View>{followTyping && <TextInput accessibilityLabel="Type with Mory" value={typingText} onChangeText={text => { setTypingText(text); strokes.set(withTiming(++strokeCount.current, { duration: 300, reduceMotion: ReduceMotion.System })); }} placeholder="Type and watch Mory's hands…" style={{ padding: 12, backgroundColor: colors.surfaceAlt, borderRadius: 10, fontFamily: fonts.regular, color: colors.ink }} />}</View>}{[{ label: 'Body bob', value: bob, change: setBob }, { label: 'Eye blink', value: blink, change: setBlink }, { label: 'Fruit sway', value: sway, change: setSway }, { label: 'Decorative effects', value: effects, change: setEffects }].map(item => <View key={item.label} style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}><Copy style={{ fontSize: 13 }}>{item.label}</Copy><Switch accessibilityLabel={item.label} value={item.value} onValueChange={item.change} trackColor={{ false: colors.lineStrong, true: colors.accent }} /></View>)}</Panel>
    </View>
    <Panel title="Pose presets" caption="Keep the familiar personality"><View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>{(Object.keys(MORY_POSES) as MoryPose[]).map(item => <View key={item} style={{ width: 102, alignItems: 'center', gap: 6, padding: 6, borderRadius: 14, backgroundColor: pose === item ? colors.accentSoft : colors.background }}><Mory pose={item} size={88} still /><Button secondary style={{ minHeight: 34, paddingHorizontal: 9, paddingVertical: 5 }} onPress={() => choosePose(item)}>{item}</Button></View>)}</View></Panel>
    <Panel title="Moments" caption="MoryState presets"><View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>{stateKinds.map(kind => <View key={kind} style={{ width: wide ? 200 : '100%', padding: 8, borderRadius: 14, backgroundColor: colors.background }}><MoryState kind={kind} size={120} still amount={kind === 'price-drop' ? '-18%' : undefined} {...stateCopy[kind]} /></View>)}</View><View style={{ padding: 12, borderRadius: 14, backgroundColor: colors.successSoft }}><MoryState kind="price-drop" layout="inline" amount="-18%" title="WH-1000XM5 dropped 18%" message="Sample price drop banner." /></View><CodeBlock>{'<MoryState kind="price-drop" amount="-18%"\n  title="Price dropped!" message={detail}\n  action={<Button onPress={buy}>Buy now</Button>} />'}</CodeBlock></Panel>
    <Panel title="Avatars" caption="Still, cropped, follows the shopper's look"><View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'flex-end', gap: 14 }}>{(Object.keys(MORY_AVATAR_SIZES) as MoryAvatarSize[]).map(item => <View key={item} style={{ alignItems: 'center', gap: 4 }}><MoryAvatar size={item} headpiece={fruit} expression={expression} /><Copy tone="muted" style={{ fontSize: 11 }}>{item} · {MORY_AVATAR_SIZES[item]}</Copy></View>)}<View style={{ alignItems: 'center', gap: 4 }}><MoryAvatar size="lg" tone="plain" headpiece={fruit} expression={expression} /><Copy tone="muted" style={{ fontSize: 11 }}>plain</Copy></View></View></Panel>
    <Panel title="Brand details" caption="Shared theme artwork"><View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 18 }}><MorySilhouette size={80} /><MorySilhouette size={80} face={1} /><DealTag width={125} height={61} /></View><Copy tone="muted" style={{ fontSize: 12 }}>Reduce Motion is respected. Pose galleries stay still; only the live preview owns a looping clock.</Copy></Panel>
  </View>;
}
