import Svg from "react-native-svg";
import { PriceTagArtwork } from "./props/price-tag";

/** The same vector tag used by Mory; aspect ratio preserves straight edges. */
export function DealTag({ width, height }: { width: number; height: number }) {
  return (
    <Svg width={width} height={height} viewBox="0 0 164 80">
      <PriceTagArtwork />
    </Svg>
  );
}
