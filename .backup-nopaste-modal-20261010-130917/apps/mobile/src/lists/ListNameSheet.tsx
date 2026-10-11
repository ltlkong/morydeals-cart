import { useEffect, useState } from "react";
import { StyleSheet, TextInput, View } from "react-native";
import { userMessage } from "../errors";
import { Copy, colors } from "@morydeals/ui";
import { SheetScreen } from "../navigation/SheetScreen";

/** A page sheet asking for a list's name, for creating or renaming one. Names are 1 to 60 characters. */
export function ListNameSheet({
  visible,
  title,
  confirm,
  initial = "",
  onClose,
  onSubmit,
}: {
  visible: boolean;
  title: string;
  confirm: string;
  initial?: string;
  onClose: () => void;
  /** Resolves when saved; a rejection's message is shown in the sheet. */
  onSubmit: (name: string) => Promise<void>;
}) {
  const [name, setName] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => {
    if (visible) {
      setName(initial);
      setError("");
    }
  }, [visible, initial]);
  const submit = () => {
    if (!name.trim() || busy) return;
    setBusy(true);
    setError("");
    void onSubmit(name.trim())
      .then(onClose)
      .catch((failure: unknown) =>
        setError(
          userMessage(failure, "Something went wrong. Please try again."),
        ),
      )
      .finally(() => setBusy(false));
  };
  return (
    <SheetScreen
      visible={visible}
      title={title}
      onClose={onClose}
      confirm={{
        label: confirm,
        disabled: !name.trim() || busy,
        onPress: submit,
      }}
    >
      <View style={s.body}>
        <Copy weight="bold" style={s.label}>
          Name
        </Copy>
        <TextInput
          accessibilityLabel="List name"
          autoFocus
          value={name}
          onChangeText={setName}
          placeholder="e.g. For my home"
          placeholderTextColor={colors.faint}
          maxLength={60}
          returnKeyType="done"
          onSubmitEditing={submit}
          style={s.input}
        />
        <Copy tone="muted" style={s.small}>
          {`${name.trim().length}/60`}
        </Copy>
        {error ? (
          <Copy accessibilityRole="alert" style={s.error}>
            {error}
          </Copy>
        ) : null}
      </View>
    </SheetScreen>
  );
}
const s = StyleSheet.create({
  body: { padding: 20, gap: 8 },
  label: { fontSize: 13, lineHeight: 18, color: colors.muted },
  input: {
    height: 50,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.line,
    paddingHorizontal: 16,
    fontSize: 16,
    color: colors.ink,
    backgroundColor: colors.surface,
  },
  small: { fontSize: 12, lineHeight: 16, textAlign: "right" },
  error: { fontSize: 13, lineHeight: 18, color: colors.danger },
});
