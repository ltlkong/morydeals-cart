import { Circle } from "react-native-svg";
import { MORY_COLORS } from "../../theme/mory";

export function MoryHandPart({
  at: [cx, cy],
  stroke,
}: {
  at: [number, number];
  stroke: number;
}) {
  return (
    <Circle
      cx={cx}
      cy={cy}
      r={13}
      fill={MORY_COLORS.body}
      stroke={MORY_COLORS.outline}
      strokeWidth={stroke}
    />
  );
}
