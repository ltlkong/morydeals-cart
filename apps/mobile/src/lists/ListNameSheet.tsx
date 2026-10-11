import { useEffect, useState } from "react";
import { StyleSheet, TextInput, View } from "react-native";
import { userMessage } from "../errors";
import { Button, Copy, Sheet, colors } from "@morydeals/ui";

/**
 * A short form over the current page (dimmed backdrop, bottom sheet that rises with the keyboard) asking for a
 * list's name, for creating or renaming one. The backdrop, Close and Cancel dismiss it. Names are 1 to 60 characters.
 */
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
    <Sheet visible={visible} title={title} onClose={onClose}>
      <View style={s.field}>
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
      <View style={s.actions}>
        <Button secondary onPress={onClose} style={s.action}>
          Cancel
        </Button>
        <Button
          disabled={!name.trim()}
          loading={busy}
          onPress={submit}
          style={s.action}
        >
          {confirm}
        </Button>
      </View>
    </Sheet>
  );
}
const s = StyleSheet.create({
  field: { gap: 8 },
  actions: { flexDirection: "row", gap: 10 },
  action: { flex: 1 },
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
