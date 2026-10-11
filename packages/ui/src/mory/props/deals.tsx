import { Circle, G, Path } from "react-native-svg";
import { MORY_COLORS } from "../../theme/mory";

/** A bundle of discount coupons, deliberately distinct from the single dollar price tag. */
export function DealsProp({ stroke }: { stroke: number }) {
  const outline = {
    stroke: MORY_COLORS.outline,
    strokeWidth: stroke,
    strokeLinejoin: "round" as const,
  };
  return (
    <>
      <G transform="rotate(-6 100 160)">
        <Path
          d="M48 124H151Q158 124 158 133V172Q158 180 149 180H48Q40 180 40 172V133Q40 124 48 124Z"
          fill="#FFF0D3"
          {...outline}
        />
        <Path
          d="M52 132H139"
          stroke={MORY_COLORS.orange}
          strokeWidth={3}
          strokeLinecap="round"
        />
      </G>
      <Path
        d="M42 138H158Q170 138 170 150V153C158 153 158 173 170 173V178Q170 188 158 188H42Q30 188 30 178V173C42 173 42 153 30 153V150Q30 138 42 138Z"
        fill={MORY_COLORS.tag}
        {...outline}
      />
      <Path
        d="M140 146V180"
        stroke="#FFAFB8"
        strokeWidth={2.5}
        strokeDasharray="3 5"
        strokeLinecap="round"
      />
      <Circle
        cx={88}
        cy={153}
        r={5}
        fill="none"
        stroke={MORY_COLORS.tagInk}
        strokeWidth={4}
      />
      <Circle
        cx={110}
        cy={174}
        r={5}
        fill="none"
        stroke={MORY_COLORS.tagInk}
        strokeWidth={4}
      />
      <Path
        d="M88 175L110 152"
        stroke={MORY_COLORS.tagInk}
        strokeWidth={5}
        strokeLinecap="round"
      />
    </>
  );
}
