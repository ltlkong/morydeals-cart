import { Circle, Ellipse, G, Path } from "react-native-svg";
import { MORY_COLORS } from "../../theme/mory";
import type { MoryExpression } from "../types";

/** The effects' four-point sparkle, on a 24 grid: Mory's eyes when a deal is too good. */
const STAR =
  "M12 0 C 13 8, 16 11, 24 12 C 16 13, 13 16, 12 24 C 11 16, 8 13, 0 12 C 8 11, 11 8, 12 0 Z";

export function MoryExpressionPart({
  expression = "neutral",
}: {
  expression?: MoryExpression;
}) {
  const eye = MORY_COLORS.eye;
  if (expression === "happy")
    return (
      <>
        <Path
          d="M76 120 Q82 110 88 120 M112 120 Q118 110 124 120"
          fill="none"
          stroke={eye}
          strokeWidth={4.5}
          strokeLinecap="round"
        />
      </>
    );
  if (expression === "starry")
    return (
      <>
        {[82, 118].map((cx) => (
          <G key={cx} transform={`translate(${cx - 13} 105) scale(${26 / 24})`}>
            <Path d={STAR} fill={eye} />
          </G>
        ))}
      </>
    );
  if (expression === "surprised")
    return (
      <>
        {/* Wow: brows up, round wide eyes with a glint, and a small round open mouth set high enough to clear held props. */}
        <Path
          d="M72 96 Q80 89 89 94 M111 94 Q120 89 128 96"
          fill="none"
          stroke={eye}
          strokeWidth={4}
          strokeLinecap="round"
        />
        <Circle cx={82} cy={110} r={7.5} fill={eye} />
        <Circle cx={118} cy={110} r={7.5} fill={eye} />
        <Circle cx={84.6} cy={107.4} r={2.3} fill={MORY_COLORS.body} />
        <Circle cx={120.6} cy={107.4} r={2.3} fill={MORY_COLORS.body} />
        <Ellipse cx={100} cy={120} rx={4.2} ry={5.2} fill={eye} />
      </>
    );
  if (expression === "worried")
    return (
      <>
        {/* Brows raised at the middle, eyes dropped a little, and one bead of sweat. */}
        <Path
          d="M72 105 Q80 103 88 99 M112 99 Q120 103 128 105"
          fill="none"
          stroke={eye}
          strokeWidth={4}
          strokeLinecap="round"
        />
        <Ellipse cx={82} cy={121} rx={4.5} ry={8} fill={eye} />
        <Ellipse cx={118} cy={121} rx={4.5} ry={8} fill={eye} />
        <Path
          d="M141 94 C137 101 135 104 135 107 C135 110.5 137.5 112.5 140.5 112.5 C143.5 112.5 146 110.5 146 107 C146 104 144 101 141 94Z"
          fill={MORY_COLORS.sweat}
        />
      </>
    );
  if (expression === "sleepy")
    return (
      <Path
        d="M76 119 Q82 124 88 119 M112 119 Q118 124 124 119"
        fill="none"
        stroke={eye}
        strokeWidth={4.5}
        strokeLinecap="round"
      />
    );
  return (
    <>
      <Ellipse cx={82} cy={118} rx={5} ry={9} fill={eye} />
      {expression === "wink" ? (
        <Path
          d="M112 119 Q118 113 124 119"
          fill="none"
          stroke={eye}
          strokeWidth={4.5}
          strokeLinecap="round"
        />
      ) : (
        <Ellipse cx={118} cy={118} rx={5} ry={9} fill={eye} />
      )}
    </>
  );
}
