import { useId } from "react";
import { View } from "react-native";
import Svg, { Circle, ClipPath, Defs, G } from "react-native-svg";

import { MORY_COLORS } from "../theme/mory";
import { colors } from "../theme/tokens";
import { useMoryLook } from "./look";
import { moryStrokeAt } from "./MoryFigure";
import { MoryBodyPart as Body } from "./parts/body";
import { MoryExpressionPart as Eyes } from "./parts/face";
import { MoryHeadpiecePart as Headpiece } from "./parts/headpiece";
import type { MoryExpression, MoryHeadpiece } from "./types";

/** Avatar sizes: chat bubbles and list rows (xs, sm), headers and cards (md), account (lg). */
export const MORY_AVATAR_SIZES = { xs: 24, sm: 32, md: 48, lg: 64 } as const;
export type MoryAvatarSize = keyof typeof MORY_AVATAR_SIZES;

/** The part of the 200-grid the avatar shows: the fruit, the face and the top of the body. */
const CROP = { x: 20, y: 22, side: 160 };
/** The disc behind Mory; the body is cut to it, the fruit pops out above it like a sticker. */
const CENTER = { x: 100, y: 116 };
const DISC = 66;

/**
 * Mory's head and shoulders in a circle, always one still SVG: the cheap way to put Mory beside a message,
 * in a list row or on a badge. It wears the shopper's look (MoryLookProvider) unless told otherwise.
 * Decorative unless given an accessibilityLabel.
 */
export function MoryAvatar({
  size = "md",
  headpiece,
  expression,
  tone = "soft",
  accessibilityLabel,
}: {
  size?: MoryAvatarSize | number;
  headpiece?: MoryHeadpiece;
  expression?: MoryExpression;
  /** soft: the accent's pale fill; plain: a white disc with a hairline. */
  tone?: "soft" | "plain";
  accessibilityLabel?: string;
}) {
  const look = useMoryLook();
  const px = typeof size === "number" ? size : MORY_AVATAR_SIZES[size];
  const clipId = `mory-avatar-${useId().replace(/[^a-z0-9_-]/gi, "")}`;
  // The outline follows the figure's own rule, at the size the whole grid would be drawn.
  const stroke = moryStrokeAt((px * 200) / CROP.side);
  const r = DISC;
  return (
    <View
      style={{ width: px, height: px }}
      accessible={!!accessibilityLabel}
      accessibilityRole={accessibilityLabel ? "image" : undefined}
      accessibilityLabel={accessibilityLabel}
      importantForAccessibility={
        accessibilityLabel ? "yes" : "no-hide-descendants"
      }
      pointerEvents="none"
    >
      <Svg
        width={px}
        height={px}
        viewBox={`${CROP.x} ${CROP.y} ${CROP.side} ${CROP.side}`}
      >
        <Defs>
          <ClipPath id={clipId}>
            <Circle cx={CENTER.x} cy={CENTER.y} r={r} />
          </ClipPath>
        </Defs>
        <Circle
          cx={CENTER.x}
          cy={CENTER.y}
          r={r}
          fill={tone === "soft" ? colors.accentSoft : MORY_COLORS.body}
          stroke={tone === "soft" ? colors.chipLine : colors.lineStrong}
          strokeWidth={stroke * 0.5}
        />
        {/* The fruit first, as on the figure: its base tucks behind the head. */}
        <Headpiece kind={headpiece ?? look.headpiece} stroke={stroke} />
        <G clipPath={`url(#${clipId})`}>
          <Body stroke={stroke} />
          <Eyes expression={expression ?? look.expression} />
        </G>
      </Svg>
    </View>
  );
}
