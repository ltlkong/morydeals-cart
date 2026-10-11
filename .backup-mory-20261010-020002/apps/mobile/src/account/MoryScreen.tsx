import type { ReactNode } from "react";
import { ScrollView, StyleSheet, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Copy, Mory, Pressable, colors, type MoryLook } from "@morydeals/ui";
import { StackScreen } from "../navigation/StackScreen";
import { EXPRESSIONS, HEADPIECES } from "./mory-look-parts";

const HEADPIECE_LABELS: Record<MoryLook["headpiece"], string> = {
  orange: "Orange",
  apple: "Apple",
  pear: "Pear",
  none: "Nothing",
};
const EXPRESSION_LABELS: Record<MoryLook["expression"], string> = {
  neutral: "Calm",
  happy: "Happy",
  wink: "Wink",
  sleepy: "Sleepy",
};

/** Choose what Mory wears on its head and its expression; every Mory in the app follows. */
export function MoryScreen({
  look,
  onChange,
  onClose,
}: {
  look: MoryLook;
  onChange: (look: MoryLook) => void;
  onClose: () => void;
}) {
  const insets = useSafeAreaInsets();
  return (
    <StackScreen title="Customize Mory" onClose={onClose} zIndex={80}>
      <ScrollView
        contentContainerStyle={[
          s.content,
          { paddingBottom: 24 + insets.bottom },
        ]}
      >
        <View style={s.preview}>
          <Mory pose="wave" size={170} live />
        </View>
        <Section title="On its head">
          {HEADPIECES.map((headpiece) => (
            <Option
              key={headpiece}
              label={HEADPIECE_LABELS[headpiece]}
              selected={look.headpiece === headpiece}
              onPress={() => onChange({ ...look, headpiece })}
            >
              <Mory
                size={56}
                headpiece={headpiece}
                expression={look.expression}
                still
              />
            </Option>
          ))}
        </Section>
        <Section title="Expression">
          {EXPRESSIONS.map((expression) => (
            <Option
              key={expression}
              label={EXPRESSION_LABELS[expression]}
              selected={look.expression === expression}
              onPress={() => onChange({ ...look, expression })}
            >
              <Mory
                size={56}
                headpiece={look.headpiece}
                expression={expression}
                still
              />
            </Option>
          ))}
        </Section>
        <Copy tone="muted" style={s.note}>
          Your Mory appears across the app and is kept on this phone.
        </Copy>
      </ScrollView>
    </StackScreen>
  );
}
function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <View style={s.section}>
      <Copy weight="extra" style={s.sectionTitle}>
        {title}
      </Copy>
      <View style={s.options}>{children}</View>
    </View>
  );
}
function Option({
  label,
  selected,
  onPress,
  children,
}: {
  label: string;
  selected: boolean;
  onPress: () => void;
  children: ReactNode;
}) {
  return (
    <Pressable
      accessibilityRole="radio"
      accessibilityLabel={label}
      accessibilityState={{ selected }}
      onPress={onPress}
      style={[s.option, selected && s.chosen]}
    >
      {children}
      <Copy weight={selected ? "extra" : "semibold"} style={s.optionLabel}>
        {label}
      </Copy>
    </Pressable>
  );
}
const s = StyleSheet.create({
  content: { paddingHorizontal: 16, paddingTop: 8, gap: 20 },
  preview: {
    alignItems: "center",
    paddingVertical: 16,
    borderRadius: 24,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.line,
  },
  section: { gap: 10 },
  sectionTitle: { fontSize: 17, lineHeight: 23 },
  options: { flexDirection: "row", gap: 8 },
  option: {
    flex: 1,
    alignItems: "center",
    gap: 4,
    paddingVertical: 10,
    borderRadius: 16,
    borderWidth: 2,
    borderColor: colors.line,
    backgroundColor: colors.surface,
  },
  chosen: { borderColor: colors.accent, backgroundColor: colors.accentSoft },
  optionLabel: { fontSize: 12, lineHeight: 16 },
  note: { fontSize: 13, lineHeight: 18, textAlign: "center" },
});
