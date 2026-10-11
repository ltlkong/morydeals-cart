import { Ellipse, Path } from "react-native-svg";
import { MORY_COLORS } from "../../theme/mory";
import type { MoryExpression } from "../types";

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
