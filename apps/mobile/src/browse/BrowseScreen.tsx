import { memo } from "react";
import { StyleSheet, View } from "react-native";
import { liveSections, type HomeContext } from "./HomeSections";

/** The Browse tab: the home page, built from the section registry. Stores lead; products sit under them. */
export const BrowseScreen = memo(function BrowseScreen(context: HomeContext) {
  return (
    <View style={s.root}>
      {liveSections(context).map(({ key, Section }) => (
        <Section key={key} {...context} />
      ))}
    </View>
  );
});

const s = StyleSheet.create({ root: { paddingTop: 16, gap: 22 } });
