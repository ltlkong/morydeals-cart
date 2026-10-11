import { View } from "react-native";
import Svg, { Rect } from "react-native-svg";

import { MORY_COLORS } from "../theme/mory";

/** Three golden round-ended rays, fanning out like the supplied Mory logo. Pure decoration. */
export function BrandSparkles({ size = 36 }: { size?: number }) {
  return (
    <View
      pointerEvents="none"
      accessible={false}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={{ width: size, height: size }}
    >
      <Svg width={size} height={size} viewBox="0 0 44 44">
        <Rect
          x={9}
          y={2}
          width={7}
          height={17}
          rx={3.5}
          transform="rotate(25 12.5 10.5)"
          fill={MORY_COLORS.spark}
          stroke={MORY_COLORS.orange}
          strokeWidth={0.7}
        />
        <Rect
          x={24}
          y={15}
          width={7}
          height={18}
          rx={3.5}
          transform="rotate(50 27.5 24)"
          fill={MORY_COLORS.spark}
          stroke={MORY_COLORS.orange}
          strokeWidth={0.7}
        />
        <Rect
          x={26}
          y={36}
          width={17}
          height={7}
          rx={3.5}
          fill={MORY_COLORS.spark}
          stroke={MORY_COLORS.orange}
          strokeWidth={0.7}
        />
      </Svg>
    </View>
  );
}
