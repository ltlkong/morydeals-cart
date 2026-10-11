import { useState } from 'react';
import { View, ScrollView, Pressable, StyleSheet, Platform, ActivityIndicator, KeyboardAvoidingView, useWindowDimensions } from 'react-native';
import { SafeAreaProvider, useSafeAreaInsets } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { Grid2X2, Palette, Sparkles, ShoppingBag, TrendingDown, Ticket, MessagesSquare, PanelsTopLeft, Monitor, Smartphone, ChevronRight } from 'lucide-react-native';
import { Brand, Copy, colors, useLibraryFonts, Mory } from '@morydeals/ui';
import { sections, type SectionId } from './src/fixtures';
import { ShowcasePage } from './src/ShowcasePage';

const icons = { overview: Grid2X2, foundations: Palette, mory: Sparkles, products: ShoppingBag, charts: TrendingDown, coupons: Ticket, assistant: MessagesSquare, overlays: PanelsTopLeft };

function Showcase() {
  const ready = useLibraryFonts();
  const [section, setSection] = useState<SectionId>('overview');
  const { width, height } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const wide = width >= 960;
  const current = sections.find(item => item.id === section)!;
  if (!ready) return <View style={s.loading}><ActivityIndicator color={colors.accent} /></View>;
  return <KeyboardAvoidingView style={[s.root, { paddingTop: insets.top }]} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
    <View style={[s.header, { paddingHorizontal: wide ? 28 : 18 }]}><Brand />{wide && <View style={s.headerLabel}><Copy weight="bold">UI Showcase</Copy><Copy tone="muted" style={{ fontSize: 12 }}>Shared components, made tangible.</Copy></View>}<View style={s.platform}>{Platform.OS === 'web' ? <Monitor size={16} color={colors.muted} /> : <Smartphone size={16} color={colors.muted} />}<Copy tone="muted" weight="bold" style={{ fontSize: 12 }}>{Platform.OS === 'web' ? 'Web' : 'Native'}{wide ? ` · ${width} × ${height}` : ''}</Copy></View></View>
    <View style={s.workspace}>
      {wide ? <View style={s.sidebar}><Copy weight="extra" tone="muted" style={s.navLabel}>COMPONENT LIBRARY</Copy><ScrollView showsVerticalScrollIndicator={false}>{sections.map(item => { const Icon = icons[item.id]; return <Pressable key={item.id} accessibilityRole="button" accessibilityLabel={item.title} accessibilityState={{ selected: section === item.id }} onPress={() => setSection(item.id)} style={[s.nav, section === item.id && s.navActive]}><Icon size={18} color={section === item.id ? colors.accentInk : colors.muted} /><View style={{ flex: 1 }}><Copy weight="bold" style={{ fontSize: 14, color: section === item.id ? colors.accentInk : colors.ink }}>{item.title}</Copy><Copy tone="muted" style={{ fontSize: 10, lineHeight: 15 }}>{item.hint}</Copy></View>{section === item.id && <ChevronRight size={15} color={colors.accent} />}</Pressable>; })}</ScrollView><View style={s.sidebarFoot}><Mory pose="wave" size={64} still /><Copy weight="extra" style={{ fontSize: 13 }}>Small details. Shared delight.</Copy><Copy tone="muted" style={{ fontSize: 11 }}>@morydeals/ui · v0.1</Copy></View></View> : null}
      <View style={s.main}>
        {!wide && <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ flexGrow: 0, flexShrink: 0, height: 56 }} contentContainerStyle={s.mobileNav}>{sections.map(item => <Pressable key={item.id} accessibilityRole="button" accessibilityLabel={item.title} accessibilityState={{ selected: section === item.id }} onPress={() => setSection(item.id)} style={[s.mobileTab, section === item.id && s.mobileTabActive]}><Copy weight="bold" style={{ fontSize: 12, color: section === item.id ? colors.accentInk : colors.muted }}>{item.title}</Copy></Pressable>)}</ScrollView>}
        <ScrollView key={section} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled" contentContainerStyle={{ padding: wide ? 32 : 18, paddingBottom: Math.max(insets.bottom, 24), flexGrow: 1 }}>
          <View style={s.pageWidth}><View style={s.breadcrumb}><Copy tone="muted" style={{ fontSize: 12 }}>UI Showcase</Copy><ChevronRight size={12} color={colors.faint} /><Copy weight="bold" style={{ fontSize: 12 }}>{current.title}</Copy></View><ShowcasePage section={section} wide={wide} availableWidth={Math.min(1120, width - (wide ? 232 + 64 : 36))} onNavigate={setSection} /></View>
        </ScrollView>
      </View>
    </View>
  </KeyboardAvoidingView>;
}
export default function App() { return <SafeAreaProvider><StatusBar style="dark" /><Showcase /></SafeAreaProvider>; }
const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.background }, loading: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: colors.background },
  header: { minHeight: 76, backgroundColor: colors.surface, borderBottomWidth: 1, borderColor: colors.line, flexDirection: 'row', alignItems: 'center', gap: 24 },
  headerLabel: { borderLeftWidth: 1, borderColor: colors.lineStrong, paddingLeft: 24, gap: 1 },
  platform: { marginLeft: 'auto', flexDirection: 'row', alignItems: 'center', gap: 7 },
  workspace: { flex: 1, minHeight: 0, flexDirection: 'row' }, main: { flex: 1, minWidth: 0, minHeight: 0 },
  sidebar: { width: 232, backgroundColor: colors.surface, borderRightWidth: 1, borderColor: colors.line, padding: 16 },
  navLabel: { fontSize: 10, letterSpacing: 1.4, margin: 12, marginBottom: 17 },
  nav: { flexDirection: 'row', alignItems: 'center', gap: 11, padding: 12, borderRadius: 999, borderWidth: 1, borderColor: colors.line, marginBottom: 5, minHeight: 58 },
  navActive: { backgroundColor: colors.accentSoft },
  sidebarFoot: { marginTop: 'auto', padding: 15, gap: 4, borderTopWidth: 1, borderColor: colors.line },
  pageWidth: { width: '100%', maxWidth: 1120, alignSelf: 'center', gap: 22 },
  breadcrumb: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  mobileNav: { paddingHorizontal: 12, paddingVertical: 10, gap: 4, backgroundColor: colors.surface, borderBottomWidth: 1, borderColor: colors.line },
  mobileTab: { paddingHorizontal: 12, paddingVertical: 9, borderRadius: 999, borderWidth: 1, borderColor: colors.line }, mobileTabActive: { backgroundColor: colors.accentSoft },
});
