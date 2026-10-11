import type { ReactNode } from 'react';
import { View, StyleSheet, Pressable } from 'react-native';
import { Copy, colors } from '@morydeals/ui';

export function Heading({ title, description }: { title: string; description: string }) {
  return <View style={{ gap: 6, marginBottom: 4 }}><Copy weight="extra" style={{ fontSize: 30, lineHeight: 38, letterSpacing: -0.7 }}>{title}</Copy><Copy tone="muted" style={{ fontSize: 14, lineHeight: 22, maxWidth: 640 }}>{description}</Copy></View>;
}
export function Panel({ title, caption, children, style }: { title: string; caption?: string; children: ReactNode; style?: object }) {
  return <View style={[s.panel, style]}><View style={s.head}><Copy weight="extra" style={{ fontSize: 16 }}>{title}</Copy>{!!caption && <Copy tone="muted" style={{ fontSize: 11 }}>{caption}</Copy>}</View><View style={{ padding: 18, gap: 14 }}>{children}</View></View>;
}
export function Options<T extends string>({ label, value, options, onChange }: { label: string; value: T; options: readonly T[]; onChange: (value: T) => void }) {
  return <View style={{ gap: 7 }}><Copy weight="bold" style={{ fontSize: 12 }}>{label}</Copy><View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 5 }}>{options.map(item => <Pressable key={item} accessibilityRole="button" accessibilityLabel={`${label}: ${item}`} accessibilityState={{ selected: item === value }} onPress={() => onChange(item)} style={[s.option, item === value && s.active]}><Copy weight="bold" style={{ fontSize: 12, color: item === value ? colors.accentInk : colors.muted }}>{item}</Copy></Pressable>)}</View></View>;
}
export function CodeBlock({ children }: { children: string }) {
  return <View style={s.code}><Copy selectable style={{ fontFamily: undefined, fontSize: 12, lineHeight: 19 }} tone="muted">{children}</Copy></View>;
}
const s = StyleSheet.create({
  panel: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.line, borderRadius: 20, overflow: 'hidden' },
  head: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 8, paddingHorizontal: 18, paddingVertical: 14, borderBottomWidth: 1, borderColor: colors.line },
  option: { backgroundColor: colors.background, borderWidth: 1, borderColor: colors.line, paddingHorizontal: 11, paddingVertical: 7, borderRadius: 999 },
  active: { backgroundColor: colors.accentSoft, borderColor: colors.chipLine },
  code: { backgroundColor: colors.surfaceSunken, borderRadius: 12, padding: 14 },
});
