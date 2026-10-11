import { Ellipse } from "react-native-svg";
import { MORY_COLORS } from "../../theme/mory";

/** Original Mory proportions, on a 200 × 200 grid. */
export function MoryBodyPart({ stroke }: { stroke: number }) {
  return (
    <Ellipse
      cx={100}
      cy={126}
      rx={62}
      ry={56}
      fill={MORY_COLORS.body}
      stroke={MORY_COLORS.outline}
      strokeWidth={stroke}
    />
  );
}
export function MoryShadowPart() {
  return (
    <Ellipse
      cx={100}
      cy={188}
      rx={52}
      ry={7}
      fill={MORY_COLORS.outline}
      opacity={0.08}
    />
  );
}
