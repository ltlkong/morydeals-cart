import { useEffect, useState } from "react";
import {
  ActivityIndicator,
  ScrollView,
  StyleSheet,
  TextInput,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { SheetScreen } from "../navigation/SheetScreen";
import { userMessage } from "../errors";
import { Check, Plus } from "lucide-react-native";
import { Button, Copy, ListCover, Pressable, colors } from "@morydeals/ui";
import {
  addToList,
  createList,
  getLists,
  removeFromList,
  type ListSummary,
} from "./lists-api";
import { withMembership } from "./list-state";

/**
 * "Add to list". For one product: every list with a tick showing whether it holds it; a tap adds or removes it at
 * once (undone if the server refuses). For several (a cart selection): a tap on a list saves them all to it and
 * closes. Either way a new list can be made here, with the products already in it.
 */
export function ListPicker({
  productUrls,
  onClose,
  onChanged,
  onSaved,
}: {
  /** The products being saved; the sheet shows while set. */
  productUrls: readonly string[] | null;
  onClose: () => void;
  /** The overview reloads after a change. */
  onChanged: () => void;
  /** Several products were saved to a list (the sheet then closes). */
  onSaved?: () => void;
}) {
  const insets = useSafeAreaInsets();
  const [lists, setLists] = useState<ListSummary[] | null>(null);
  const [error, setError] = useState("");
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState("");
  const single = productUrls?.length === 1 ? productUrls[0]! : null;
  useEffect(() => {
    if (!productUrls?.length) return;
    const abort = new AbortController();
    setLists(null);
    setError("");
    setCreating(false);
    setName("");
    // Membership ticks only make sense for a single product.
    getLists(single ?? undefined, abort.signal)
      .then(setLists)
      .catch((failure: unknown) => {
        if (!abort.signal.aborted)
          setError(
            userMessage(failure, "Something went wrong. Please try again."),
          );
      });
    return () => abort.abort();
  }, [productUrls, single]);
  const fail = (failure: unknown) =>
    setError(userMessage(failure, "Something went wrong. Please try again."));
  /** Several products: save them all to `id`, then close. */
  const saveAll = (id: string) =>
    Promise.all((productUrls ?? []).map((url) => addToList(id, url))).then(
      () => {
        onChanged();
        onSaved?.();
        onClose();
      },
    );
  const toggle = (list: ListSummary) => {
    if (!productUrls?.length || !lists) return;
    setError("");
    if (!single) {
      void saveAll(list.id).catch(fail);
      return;
    }
    const next = !list.contains;
    setLists((current) => current && withMembership(current, list.id, next));
    void (next ? addToList(list.id, single) : removeFromList(list.id, single))
      .then(onChanged)
      .catch((failure: unknown) => {
        setLists(
          (current) => current && withMembership(current, list.id, !next),
        );
        fail(failure);
      });
  };
  const create = () => {
    if (!productUrls?.length || !name.trim()) return;
    const [first, ...rest] = productUrls;
    void createList(name.trim(), first)
      .then(async (id) => {
        if (!single) {
          await Promise.all(rest.map((url) => addToList(id, url)));
          onChanged();
          onSaved?.();
          onClose();
          return;
        }
        setLists(await getLists(single));
        setCreating(false);
        setName("");
        onChanged();
      })
      .catch(fail);
  };
  return (
    <SheetScreen
      visible={!!productUrls?.length}
      title={
        productUrls && productUrls.length > 1
          ? `Add ${productUrls.length} products`
          : "Add to list"
      }
      cancel="Done"
      onClose={onClose}
    >
      <View style={[s.body, { paddingBottom: insets.bottom + 16 }]}>
        {/* At the top: the keyboard would cover a field at the bottom of the sheet. */}
        {creating ? (
          <View style={s.create}>
            <TextInput
              accessibilityLabel="New list name"
              autoFocus
              value={name}
              onChangeText={setName}
              placeholder="e.g. For my home"
              placeholderTextColor={colors.faint}
              maxLength={60}
              returnKeyType="done"
              onSubmitEditing={create}
              style={s.input}
            />
            <Button disabled={!name.trim()} onPress={create}>
              Create
            </Button>
          </View>
        ) : (
          <Button
            secondary
            icon={<Plus size={16} color={colors.ink} />}
            onPress={() => setCreating(true)}
          >
            New list
          </Button>
        )}
        {error ? (
          <Copy accessibilityRole="alert" style={s.error}>
            {error}
          </Copy>
        ) : null}
        <ScrollView style={s.rows} contentContainerStyle={s.rowsContent}>
          {!lists ? (
            error ? null : (
              <ActivityIndicator color={colors.accent} />
            )
          ) : (
            lists.map((list) => (
              <Pressable
                key={list.id}
                accessibilityRole={single ? "checkbox" : "button"}
                accessibilityLabel={single ? list.name : `Add to ${list.name}`}
                accessibilityState={
                  single ? { checked: !!list.contains } : undefined
                }
                onPress={() => toggle(list)}
                style={s.row}
              >
                <ListCover images={list.covers} size={48} />
                <View style={s.text}>
                  <Copy weight="bold" numberOfLines={1} style={s.name}>
                    {list.name}
                  </Copy>
                  <Copy tone="muted" style={s.small}>
                    {list.itemCount === 1
                      ? "1 product"
                      : `${list.itemCount} products`}
                  </Copy>
                </View>
                {single ? (
                  <View style={[s.check, list.contains && s.checked]}>
                    {list.contains ? (
                      <Check
                        size={16}
                        color={colors.onAccent}
                        strokeWidth={3}
                      />
                    ) : null}
                  </View>
                ) : (
                  <Plus size={20} color={colors.accentInk} />
                )}
              </Pressable>
            ))
          )}
        </ScrollView>
      </View>
    </SheetScreen>
  );
}
const s = StyleSheet.create({
  body: { flex: 1, paddingHorizontal: 20, paddingTop: 12, gap: 12 },
  rows: { flex: 1 },
  rowsContent: { gap: 6 },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingVertical: 6,
  },
  text: { flex: 1, minWidth: 0 },
  name: { fontSize: 15, lineHeight: 21 },
  small: { fontSize: 13, lineHeight: 18 },
  check: {
    width: 26,
    height: 26,
    borderRadius: 13,
    borderWidth: 2,
    borderColor: colors.lineStrong,
    alignItems: "center",
    justifyContent: "center",
  },
  checked: { backgroundColor: colors.accent, borderColor: colors.accent },
  create: { flexDirection: "row", gap: 8 },
  input: {
    flex: 1,
    minWidth: 0,
    height: 48,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: colors.line,
    paddingHorizontal: 18,
    fontSize: 15,
    color: colors.ink,
    backgroundColor: colors.background,
  },
  error: { fontSize: 13, lineHeight: 18, color: colors.danger },
});
