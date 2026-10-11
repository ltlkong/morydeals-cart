import { Circle, Ellipse, Path, G } from "react-native-svg";
import { MORY_COLORS } from "../../theme/mory";
import type { MoryHeadpiece } from "../types";

/** Head attachments share the same anchor, stroke and shading language. */
export function MoryHeadpiecePart({
  kind = "orange",
  stroke,
}: {
  kind?: MoryHeadpiece;
  stroke: number;
}) {
  if (kind === "none") return null;
  const outline = {
    stroke: MORY_COLORS.outline,
    strokeWidth: stroke * 0.86,
    strokeLinejoin: "round" as const,
  };
  if (kind === "apple")
    return (
      <G transform="translate(0 -12)">
        <Path
          d="M100 58 C98 49 101 45 104 42"
          fill="none"
          stroke={MORY_COLORS.stem}
          strokeWidth={stroke * 0.7}
          strokeLinecap="round"
        />
        <Path
          d="M102 53 C104 40 120 39 121 43 C117 54 109 56 102 53Z"
          fill={MORY_COLORS.leaf}
          {...outline}
        />
        <Path
          d="M100 60 C81 49 75 64 80 80 C84 95 94 98 100 91 C106 98 116 95 120 80 C125 64 119 49 100 60Z"
          fill="#F05A54"
          {...outline}
        />
        <Ellipse
          cx={89}
          cy={67}
          rx={4}
          ry={6}
          fill="#FFB9A6"
          transform="rotate(20 89 67)"
        />
      </G>
    );
  if (kind === "cherry")
    return (
      <>
        {/* Two cherries on stems that meet under one leaf, sitting on top of the head. */}
        <Path
          d="M101 28 C95 36 89 44 86 54 M101 28 C107 38 112 47 114 58"
          fill="none"
          stroke={MORY_COLORS.stem}
          strokeWidth={stroke * 0.7}
          strokeLinecap="round"
        />
        <Path
          d="M101 29 C109 17 126 18 128 24 C120 33 109 34 101 29Z"
          fill={MORY_COLORS.leaf}
          {...outline}
        />
        <Circle cx={86} cy={62} r={14} fill={MORY_COLORS.cherry} {...outline} />
        <Circle
          cx={115}
          cy={65}
          r={14}
          fill={MORY_COLORS.cherry}
          {...outline}
        />
        <Ellipse
          cx={81}
          cy={57}
          rx={3.2}
          ry={4.6}
          fill={MORY_COLORS.cherryShine}
          transform="rotate(25 81 57)"
        />
        <Ellipse
          cx={110}
          cy={60}
          rx={3.2}
          ry={4.6}
          fill={MORY_COLORS.cherryShine}
          transform="rotate(25 110 60)"
        />
      </>
    );
  if (kind === "lemon")
    return (
      <G transform="translate(0 -16)">
        <Path
          d="M100 58 L101 49"
          stroke={MORY_COLORS.stem}
          strokeWidth={stroke * 0.86}
          strokeLinecap="round"
        />
        <Path
          d="M101 52 C109 37 128 38 131 44 C123 54 110 57 101 52Z"
          fill={MORY_COLORS.leaf}
          {...outline}
        />
        {/* A lemon lying a little tilted, with a nub at each end. */}
        <Path
          d="M72 80 C70 76 73 72 77 72 C84 58 116 54 125 65 C128 63 132 65 131 70 C131 74 129 75 128 76 C124 92 88 98 78 86 C75 86 72 83 72 80Z"
          fill={MORY_COLORS.lemon}
          {...outline}
        />
        <Ellipse
          cx={91}
          cy={69}
          rx={6.5}
          ry={3.2}
          fill={MORY_COLORS.lemonShine}
          transform="rotate(-14 91 69)"
        />
      </G>
    );
  if (kind === "pear")
    return (
      <G transform="translate(0 -12)">
        <Path
          d="M100 47 L102 40"
          stroke={MORY_COLORS.stem}
          strokeWidth={stroke * 0.7}
          strokeLinecap="round"
        />
        <Path
          d="M101 46 C107 36 120 39 118 43 C112 48 105 50 101 46Z"
          fill={MORY_COLORS.leaf}
          {...outline}
        />
        <Path
          d="M100 46 C88 47 93 63 84 72 C72 85 82 97 100 96 C118 97 128 85 116 72 C107 63 112 47 100 46Z"
          fill="#B8D95C"
          {...outline}
        />
        <Ellipse
          cx={89}
          cy={78}
          rx={4}
          ry={6}
          fill="#E6F2AE"
          transform="rotate(20 89 78)"
        />
      </G>
    );
  return (
    <>
      <Path
        d="M100 62 C87 38 63 35 53 42 C54 61 79 75 100 62Z"
        fill={MORY_COLORS.leaf}
        stroke={MORY_COLORS.outline}
        strokeWidth={stroke * 0.72}
        strokeLinejoin="round"
      />
      <Path
        d="M100 62 C103 36 124 24 143 26 C143 51 124 70 100 65Z"
        fill={MORY_COLORS.leaf}
        stroke={MORY_COLORS.outline}
        strokeWidth={stroke * 0.72}
        strokeLinejoin="round"
      />
      <Path
        d="M100 59 L99 51"
        stroke={MORY_COLORS.stem}
        strokeWidth={stroke * 0.86}
        strokeLinecap="round"
      />
      <Circle
        cx={100}
        cy={75}
        r={17.5}
        fill={MORY_COLORS.orange}
        {...outline}
      />
      <Ellipse cx={93} cy={69} rx={4.4} ry={3} fill={MORY_COLORS.orangeShine} />
    </>
  );
}
