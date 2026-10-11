import { memo } from "react";
import { StyleSheet, View } from "react-native";
import { HOME_SECTIONS, type HomeContext } from "./HomeSections";

/** The Browse tab: the home page, built from the section registry. Stores only, no products. */
export const BrowseScreen = memo(function BrowseScreen(context: HomeContext) {
  return (
    <View style={s.root}>
      {HOME_SECTIONS.filter((section) => section.visible(context)).map(
        ({ key, Section }) => (
          <Section key={key} {...context} />
        ),
      )}
    </View>
  );
});

const s = StyleSheet.create({ root: { paddingTop: 16, gap: 22 } });
