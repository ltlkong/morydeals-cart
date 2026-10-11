import { StyleSheet, Text, View } from "react-native";
import { Circle, Path, G } from "react-native-svg";
import { PriceTagArtwork } from "./price-tag";
import { DealsProp } from "./deals";

import { MORY_COLORS } from "../../theme/mory";
import { font } from "../../theme/typography";

/**
 * What Mory has in its hands, drawn on the figure's 200 x 200 grid: a card with an orange (its
 * everyday pose), a camera, a heart, a $ tag, a bundle of coupons, or the caller's own edge:
 * nothing drawn, the body cut off below the hands; see EDGE_LINE, a sign with a word
 * on it, a keyboard it types on, an open empty box (empty states), an unplugged cable (error states), or
 * nothing while one hand waves.
 */
export type MoryHolding =
  | "none"
  | "card"
  | "camera"
  | "heart"
  | "tag"
  | "deals"
  | "ledge"
  | "edge"
  | "sign"
  | "wave"
  | "keyboard"
  | "box"
  | "plug";

/** For `edge`: the grid line the hands grip and the body is cut off at (the ledge's top). A caller lines its edge up with it. */
export const EDGE_LINE = 150;

type Point = [number, number];

/** Where the two hands sit for each holding; the right hand is the one that waves. */
export const HANDS: Record<MoryHolding, { left: Point; right: Point }> = {
  none: { left: [50, 148], right: [150, 148] },
  card: { left: [60, 158], right: [140, 158] },
  camera: { left: [58, 156], right: [142, 156] },
  heart: { left: [72, 160], right: [128, 160] },
  tag: { left: [58, 128], right: [142, 128] },
  deals: { left: [54, 138], right: [146, 138] },
  ledge: { left: [66, 148], right: [134, 148] },
  edge: { left: [66, 148], right: [134, 148] },
  sign: { left: [24, 152], right: [176, 152] },
  wave: { left: [50, 148], right: [164, 104] },
  keyboard: { left: [78, 156], right: [122, 156] },
  box: { left: [52, 150], right: [148, 150] },
  plug: { left: [52, 150], right: [148, 150] },
};

/** The keyboard on the grid: a board with three rows of keys and a space bar. */
const KEYBOARD = { x: 50, y: 150, width: 100, height: 34 };

/** A rounded rectangle as a path (react-native-svg's Rect places itself with deprecated x/y props). */
export function roundedRect(
  x: number,
  y: number,
  width: number,
  height: number,
  r: number,
): string {
  return (
    `M${x + r} ${y} H${x + width - r} A${r} ${r} 0 0 1 ${x + width} ${y + r} ` +
    `V${y + height - r} A${r} ${r} 0 0 1 ${x + width - r} ${y + height} ` +
    `H${x + r} A${r} ${r} 0 0 1 ${x} ${y + height - r} V${y + r} A${r} ${r} 0 0 1 ${x + r} ${y} Z`
  );
}

/** A small orange with one leaf, centred on (cx, cy). */
function Orange({
  cx,
  cy,
  r,
  stroke,
}: {
  cx: number;
  cy: number;
  r: number;
  stroke: number;
}) {
  return (
    <>
      <Path
        d={`M${cx} ${cy - r} C ${cx + 3} ${cy - r - 9}, ${cx + 13} ${cy - r - 9}, ${cx + 13} ${cy - r - 4} C ${cx + 9} ${cy - r + 1}, ${cx + 3} ${cy - r + 1}, ${cx} ${cy - r} Z`}
        fill={MORY_COLORS.leaf}
        stroke={MORY_COLORS.outline}
        strokeWidth={stroke * 0.6}
        strokeLinejoin="round"
      />
      <Circle
        cx={cx}
        cy={cy}
        r={r}
        fill={MORY_COLORS.orange}
        stroke={MORY_COLORS.outline}
        strokeWidth={stroke * 0.7}
      />
    </>
  );
}

/** The sign's board on the grid; its words are laid over it (SignWords). */
const SIGN = { x: 24, y: 122, width: 152, height: 60 };

/** What a sign says unless Mory is given its words. */
const SIGN_WORDS = "Hello!";

/**
 * The words on Mory's sign, over the board, for a figure `size` wide. Real text rather than SVG text, so it
 * is set in the app's font (SVG text does not use the loaded fonts). A short word or two fits.
 */
export function SignWords({ size, words }: { size: number; words?: string }) {
  const unit = size / 200;
  return (
    <View
      pointerEvents="none"
      style={[
        styles.sign,
        {
          left: SIGN.x * unit,
          top: SIGN.y * unit,
          width: SIGN.width * unit,
          height: SIGN.height * unit,
        },
      ]}
    >
      <Text
        style={[styles.words, { fontSize: 24 * unit }]}
        numberOfLines={1}
        adjustsFontSizeToFit
      >
        {words ?? SIGN_WORDS}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  sign: {
    position: "absolute",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: "4%",
  },
  words: {
    fontFamily: font.extra,
    color: MORY_COLORS.tag,
    includeFontPadding: false,
  },
});

/** The thing in Mory's hands, in front of its body; `stroke` is the figure's outline width. */
export function Held({
  holding,
  stroke,
}: {
  holding: MoryHolding;
  stroke: number;
}) {
  const outline = {
    stroke: MORY_COLORS.outline,
    strokeWidth: stroke,
    strokeLinejoin: "round" as const,
  };
  switch (holding) {
    case "none":
      return null;
    case "card":
      return (
        <>
          <Path
            d={roundedRect(60, 128, 80, 50, 11)}
            fill={MORY_COLORS.body}
            {...outline}
          />
          <Orange cx={100} cy={156} r={10} stroke={stroke} />
        </>
      );
    case "camera":
      return (
        <>
          <Path
            d={roundedRect(84, 118, 26, 14, 4)}
            fill={MORY_COLORS.orange}
            {...outline}
          />
          <Path
            d={roundedRect(60, 126, 80, 52, 12)}
            fill={MORY_COLORS.orange}
            {...outline}
          />
          <Circle
            cx={100}
            cy={152}
            r={17}
            fill="#2B2420"
            stroke={MORY_COLORS.body}
            strokeWidth={stroke + 1}
          />
          <Circle cx={94} cy={146} r={4} fill={MORY_COLORS.body} />
          <Circle cx={127} cy={137} r={3.5} fill={MORY_COLORS.body} />
        </>
      );
    case "heart":
      return (
        <Path
          d="M100 172 C 72 154, 74 128, 91 131 C 96 132, 100 138, 100 141 C 100 138, 104 132, 109 131 C 126 128, 128 154, 100 172 Z"
          fill={MORY_COLORS.tag}
          {...outline}
        />
      );
    case "tag":
      return (
        <G transform="translate(33 124) scale(0.82)">
          <PriceTagArtwork stroke={stroke / 0.82} />
        </G>
      );
    case "deals":
      return <DealsProp stroke={stroke} />;
    case "sign":
      return (
        <>
          <Path
            d={roundedRect(SIGN.x, SIGN.y, SIGN.width, SIGN.height, 14)}
            fill={MORY_COLORS.body}
            {...outline}
          />
        </>
      );
    case "ledge":
    case "edge":
      return null;
    case "keyboard":
      return (
        <>
          <Path
            d={roundedRect(
              KEYBOARD.x,
              KEYBOARD.y,
              KEYBOARD.width,
              KEYBOARD.height,
              8,
            )}
            fill={MORY_COLORS.body}
            {...outline}
          />
          {[0, 1].map((row) =>
            [0, 1, 2, 3, 4, 5, 6].map((key) => (
              <Path
                key={`${row}-${key}`}
                d={roundedRect(58 + key * 12.3, 156 + row * 8, 8, 5, 1.5)}
                fill={MORY_COLORS.outline}
                opacity={0.22}
              />
            )),
          )}
          <Path
            d={roundedRect(76, 172, 48, 5, 2)}
            fill={MORY_COLORS.orange}
            opacity={0.85}
          />
        </>
      );
    case "box":
      return (
        <>
          {/* Flaps folded out to both sides, then the open mouth: it is empty. */}
          <Path
            d="M58 128 L36 112 L44 104 L66 122 Z"
            fill={MORY_COLORS.box}
            {...outline}
          />
          <Path
            d="M142 128 L164 112 L156 104 L134 122 Z"
            fill={MORY_COLORS.box}
            {...outline}
          />
          <Path
            d="M58 128 H142 L136 182 H64 Z"
            fill={MORY_COLORS.box}
            {...outline}
          />
          <Path
            d="M62 128 H138 L134 140 H66 Z"
            fill={MORY_COLORS.boxInside}
            opacity={0.9}
          />
          <Path
            d="M74 160 H126"
            stroke={MORY_COLORS.outline}
            strokeWidth={stroke * 0.6}
            strokeLinecap="round"
            opacity={0.35}
          />
          <Path
            d="M82 168 H118"
            stroke={MORY_COLORS.outline}
            strokeWidth={stroke * 0.6}
            strokeLinecap="round"
            opacity={0.25}
          />
        </>
      );
    case "plug":
      return (
        <>
          {/* A cable from each hand whose ends do not meet, and a small spark in the gap. */}
          <Path
            d="M52 150 C 60 170, 74 166, 80 156"
            fill="none"
            stroke={MORY_COLORS.cable}
            strokeWidth={stroke + 1}
            strokeLinecap="round"
          />
          <Path
            d="M148 150 C 140 170, 126 166, 120 156"
            fill="none"
            stroke={MORY_COLORS.cable}
            strokeWidth={stroke + 1}
            strokeLinecap="round"
          />
          <Path
            d={roundedRect(72, 144, 18, 22, 5)}
            fill={MORY_COLORS.orange}
            {...outline}
          />
          <Path
            d="M90 150 H97 M90 160 H97"
            stroke={MORY_COLORS.outline}
            strokeWidth={stroke}
            strokeLinecap="round"
          />
          <Path
            d={roundedRect(110, 142, 22, 26, 6)}
            fill={MORY_COLORS.body}
            {...outline}
          />
          <Circle cx={117} cy={151} r={2.2} fill={MORY_COLORS.outline} />
          <Circle cx={117} cy={159} r={2.2} fill={MORY_COLORS.outline} />
          <Path
            d="M103 132 L99 142 L105 142 L100 152"
            fill="none"
            stroke={MORY_COLORS.spark}
            strokeWidth={stroke}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </>
      );
    case "wave":
      return null;
  }
}
