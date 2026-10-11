import { View, Image } from 'react-native';
import { colors } from '@morydeals/ui';
const atlas = require('../assets/catalog.png');

/** Crops the generated contact sheet in the showcase only; the library accepts ordinary image sources. */
export function AtlasPhoto({ slot, size, height = size }: { slot: number; size: number; height?: number }) {
  const imageSize = Math.min(size, height / 0.72);
  const row = Math.floor(slot / 2);
  const cropTop = [0, 0.33, 0.64][row] ?? 0;
  const cropHeight = [0.325, 0.31, 0.36][row] ?? 0.325;
  return <View style={{ width: size, height, backgroundColor: colors.surfaceAlt, borderRadius: 16, overflow: 'hidden', alignItems: 'center', justifyContent: 'center' }}>
    <View style={{ width: imageSize, height: imageSize * 2 * cropHeight, overflow: 'hidden' }}><Image source={atlas} resizeMode="contain" style={{ position: 'absolute', width: imageSize * 2, height: imageSize * 2, left: -(slot % 2) * imageSize, top: -imageSize * 2 * cropTop }} /></View>
  </View>;
}
