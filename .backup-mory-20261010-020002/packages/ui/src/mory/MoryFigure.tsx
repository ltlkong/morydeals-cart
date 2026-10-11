import { useId, type ReactNode } from "react";
import { StyleSheet, View, type StyleProp, type ViewStyle } from "react-native";
import Animated, {
  useAnimatedStyle,
  type AnimatedStyle,
  type SharedValue,
} from "react-native-reanimated";
import Svg, { ClipPath, Defs, G, Path } from "react-native-svg";

import { MORY_COLORS } from "../theme/mory";

import {
  EDGE_LINE,
  HANDS,
  Held,
  roundedRect,
  SignWords,
  type MoryHolding,
} from "./held";
import { blinkAt, bobAt, glanceAt, leafAngle, waveAngle } from "./motion";
import { strikeAt, keyLightAt } from "./motion/hands";
import { MoryBodyPart as Body, MoryShadowPart as Shadow } from "./parts/body";
import { MoryHandPart as Hand } from "./parts/hands";
import { MoryHeadpiecePart as Headpiece } from "./parts/headpiece";
import { MoryExpressionPart as Eyes } from "./parts/face";
import type { MoryHeadpiece, MoryExpression, MoryHandMotion } from "./types";

/** Every part is drawn on this square grid and scaled to the figure's size. */
const GRID = 200;
const VIEW_BOX = `0 0 ${GRID} ${GRID}`;
/** The outline on the grid; small figures get a heavier one so it still reads as a line. */
const STROKE = 6;
const THIN_BELOW = 64;

type Props = {
  size: number;
  holding: MoryHolding;
  headpiece?: MoryHeadpiece;
  expression?: MoryExpression;
  handMotion?: MoryHandMotion;
  bodyMotion?: boolean;
  blink?: boolean;
  headSway?: boolean;
  propMotion?: boolean;
  /** The clock Mory lives on (useClock); null draws it still, as one SVG, for small or many copies. */
  clock: SharedValue<number> | null;
  /** Lifts the orange off Mory's head: 1 is out of frame above, 0 seated (useDropIn). */
  orangeLift?: SharedValue<number>;
  /** Mory's own soft shadow; off when the caller draws a ground shadow (useDropIn). */
  shadow?: boolean;
  /** What a sign in Mory's hands says. */
  words?: string;
  /**
   * Keystrokes, for the keyboard: each whole step of this value presses one hand, left then right — the
   * caller moves it by one per key the user types, so Mory types when they do.
   */
  keystrokes?: SharedValue<number>;
};

/** One full-size layer: its own SVG, so it can move on its own. */
function Layer({
  children,
  style,
}: {
  children: ReactNode;
  style?: StyleProp<AnimatedStyle<ViewStyle>>;
}) {
  return (
    <Animated.View
      style={[StyleSheet.absoluteFill, style]}
      pointerEvents="none"
    >
      <Svg width="100%" height="100%" viewBox={VIEW_BOX}>
        {children}
      </Svg>
    </Animated.View>
  );
}

/** Mory alive: each moving part is its own layer, animated on the clock. */
function LiveFigure({
  size,
  holding,
  headpiece = "orange",
  expression = "neutral",
  handMotion = "hold",
  bodyMotion = true,
  blink = true,
  headSway = true,
  propMotion = true,
  clock,
  stroke,
  orangeLift,
  shadow: withShadow = true,
  words,
  keystrokes,
}: Props & { clock: SharedValue<number>; stroke: number }) {
  const hands = {
    ...HANDS[holding],
    right: handMotion === "wave" ? HANDS.wave.right : HANDS[holding].right,
  };
  const peeking = holding === "ledge" || holding === "edge";

  const bob = useAnimatedStyle(() => ({
    transform: [
      {
        translateY: (bodyMotion ? (peeking ? 8 : -5) : 0) * bobAt(clock.get()),
      },
    ],
  }));
  const shadow = useAnimatedStyle(() => ({
    transform: [{ scaleX: 1 - (bodyMotion ? 0.08 : 0) * bobAt(clock.get()) }],
  }));
  const leaves = useAnimatedStyle(() => ({
    transform: [
      { translateY: -(orangeLift?.get() ?? 0) * size * 1.6 },
      { rotate: `${headSway ? leafAngle(clock.get()) : 0}deg` },
    ],
  }));
  // A blink near the end of each turn; peeking, the eyes also glance left and right.
  const eyes = useAnimatedStyle(() => ({
    transform: [
      { translateX: peeking ? glanceAt(clock.get()) : 0 },
      { scaleY: blink ? blinkAt(clock.get()) : 1 },
    ],
  }));
  // The deals tag swings, the heart beats, a box or cable sways gently; the rest stay put in Mory's hands.
  const held = useAnimatedStyle(() => {
    const t = clock.get();
    if (!propMotion) return {};
    if (holding === "box" || holding === "plug") {
      return {
        transform: [
          { translateY: -1.5 * (size / 200) * bobAt(t) },
          { rotate: `${2 * Math.sin(t * Math.PI * 2)}deg` },
        ],
      };
    }
    if (holding === "deals")
      return { transform: [{ translateY: -2 * (size / 200) * bobAt(t) }] };
    if (holding === "heart") {
      return {
        transform: [
          { scale: 1 + 0.08 * Math.max(0, Math.sin(t * Math.PI * 6)) },
        ],
      };
    }
    return {};
  });
  // Three waves in the first half of each turn, then the hand rests.
  const wave = useAnimatedStyle(() => ({
    transform: [{ rotate: `${waveAngle(clock.get())}deg` }],
  }));

  // Typing: each keystroke is one hand lifting high and striking a key, left on even strokes and right on
  // odd ones; the struck key lights up and Mory's body gives a small jolt.
  const unit = size / 200;
  const phaseOf = (even: boolean) => {
    "worklet";
    const n = keystrokes?.get() ?? clock.get() * 6;
    const whole = Math.floor(n);
    return (whole % 2 === 0) === even && n > 0 ? n - whole : -1;
  };
  const leftTap = useAnimatedStyle(() => ({
    transform: [{ translateY: strikeAt(phaseOf(true)) * unit }],
  }));
  const rightTap = useAnimatedStyle(() => ({
    transform: [{ translateY: strikeAt(phaseOf(false)) * unit }],
  }));
  const leftKey = useAnimatedStyle(() => ({
    opacity: keyLightAt(phaseOf(true)),
  }));
  const rightKey = useAnimatedStyle(() => ({
    opacity: keyLightAt(phaseOf(false)),
  }));
  const jolt = useAnimatedStyle(() => {
    const p = Math.max(phaseOf(true), phaseOf(false));
    return {
      transform: [
        {
          translateY:
            p >= 0 && handMotion === "tap"
              ? 2.5 * unit * Math.max(0, Math.sin(((p - 0.35) / 0.4) * Math.PI))
              : 0,
        },
      ],
    };
  });

  const inHands = (
    <>
      <Layer style={[origins[holding], held]}>
        <Held holding={holding} stroke={stroke} />
      </Layer>
      {holding === "keyboard" && handMotion === "tap" ? (
        <>
          <Layer style={leftKey}>
            <Path
              d={roundedRect(64, 154, 26, 10, 3)}
              fill={MORY_COLORS.orange}
            />
          </Layer>
          <Layer style={rightKey}>
            <Path
              d={roundedRect(110, 154, 26, 10, 3)}
              fill={MORY_COLORS.orange}
            />
          </Layer>
        </>
      ) : null}
      <Animated.View style={[StyleSheet.absoluteFill, origins[holding], held]}>
        <Layer style={handMotion === "tap" ? leftTap : undefined}>
          <Hand at={hands.left} stroke={stroke} />
        </Layer>
      </Animated.View>
      {handMotion === "wave" ? (
        <Layer style={[origins.shoulder, wave]}>
          <Hand at={hands.right} stroke={stroke} />
        </Layer>
      ) : (
        <Animated.View
          style={[StyleSheet.absoluteFill, origins[holding], held]}
        >
          <Layer style={handMotion === "tap" ? rightTap : undefined}>
            <Hand at={hands.right} stroke={stroke} />
          </Layer>
        </Animated.View>
      )}
      {holding === "sign" ? <SignWords size={size} words={words} /> : null}
    </>
  );

  return (
    <View style={{ width: size, height: size }}>
      {peeking || !withShadow ? null : (
        <Layer style={[origins.shadow, shadow]}>
          <Shadow />
        </Layer>
      )}
      {/* At the caller's edge, everything below the hands is cut off: Mory is behind that edge. */}
      <View
        style={[
          StyleSheet.absoluteFill,
          peeking && {
            bottom: size * (1 - EDGE_LINE / 200),
            overflow: "hidden",
          },
        ]}
      >
        <Animated.View
          style={[
            {
              position: "absolute",
              left: 0,
              top: 0,
              width: size,
              height: size,
            },
            bob,
          ]}
        >
          <Animated.View style={[StyleSheet.absoluteFill, jolt]}>
            <Layer style={[origins.orange, leaves]}>
              <Headpiece kind={headpiece} stroke={stroke} />
            </Layer>
            <Layer>
              <Body stroke={stroke} />
            </Layer>
            <Layer style={[origins.eyes, eyes]}>
              <Eyes expression={expression} />
            </Layer>
            {peeking ? null : inHands}
          </Animated.View>
        </Animated.View>
      </View>
      {/* The ledge and the hands on it hold still while Mory bobs behind it. */}
      {peeking ? inHands : null}
    </View>
  );
}

/**
 * Mory in SVG: the round white body, the orange on its head, and what it holds (see Held). Given a
 * clock it is alive — a slow bob, a blink, swaying leaves, and per holding a wave, a swinging tag or
 * a beating heart. Without one it is a single still SVG, the cheap way to show many small Morys.
 */
export function MoryFigure({
  size,
  holding,
  headpiece = "orange",
  expression = "neutral",
  handMotion = "hold",
  bodyMotion = true,
  blink = true,
  headSway = true,
  propMotion = true,
  clock,
  orangeLift,
  shadow = true,
  words,
  keystrokes,
}: Props) {
  const clipId = `mory-edge-${useId().replace(/[^a-z0-9_-]/gi, "")}`;
  const stroke = STROKE * Math.max(1, THIN_BELOW / size);
  if (clock) {
    return (
      <LiveFigure
        size={size}
        holding={holding}
        headpiece={headpiece}
        expression={expression}
        handMotion={handMotion}
        bodyMotion={bodyMotion}
        blink={blink}
        headSway={headSway}
        propMotion={propMotion}
        clock={clock}
        stroke={stroke}
        orangeLift={orangeLift}
        shadow={shadow}
        words={words}
        keystrokes={keystrokes}
      />
    );
  }
  const hands = {
    ...HANDS[holding],
    right: handMotion === "wave" ? HANDS.wave.right : HANDS[holding].right,
  };
  const figure = (
    <Svg width={size} height={size} viewBox={VIEW_BOX}>
      {!shadow || holding === "ledge" || holding === "edge" ? null : <Shadow />}
      <Defs>
        <ClipPath id={clipId}>
          <Path
            d={roundedRect(
              0,
              0,
              200,
              holding === "edge" || holding === "ledge" ? EDGE_LINE : 200,
              0,
            )}
          />
        </ClipPath>
      </Defs>
      <G clipPath={`url(#${clipId})`}>
        <Headpiece kind={headpiece} stroke={stroke} />
        <Body stroke={stroke} />
        <Eyes expression={expression} />
      </G>
      <Held holding={holding} stroke={stroke} />
      <Hand at={hands.left} stroke={stroke} />
      <Hand at={hands.right} stroke={stroke} />
    </Svg>
  );
  if (holding !== "sign") return figure;
  return (
    <View style={{ width: size, height: size }}>
      {figure}
      <SignWords size={size} words={words} />
    </View>
  );
}

/** Pivots, as fractions of the grid: each part turns about where it is held or attached. */
const origins = StyleSheet.create({
  shadow: { transformOrigin: "50% 94%" },
  orange: { transformOrigin: "50% 44%" },
  eyes: { transformOrigin: "50% 59%" },
  shoulder: { transformOrigin: "72% 66%" },
  none: {},
  card: {},
  camera: {},
  heart: { transformOrigin: "50% 76%" },
  tag: {},
  deals: { transformOrigin: "50% 71%" },
  ledge: {},
  edge: {},
  sign: {},
  wave: {},
  keyboard: {},
  box: { transformOrigin: "50% 78%" },
  plug: { transformOrigin: "50% 78%" },
});
