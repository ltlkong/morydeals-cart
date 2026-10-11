import { Text, type TextProps } from "react-native";
import { colors, fonts } from "../theme/index";

export function Copy({
  style,
  tone = "ink",
  weight = "regular",
  ...props
}: TextProps & { tone?: keyof typeof colors; weight?: keyof typeof fonts }) {
  return (
    <Text
      {...props}
      style={[
        {
          fontFamily: fonts[weight],
          fontSize: 15,
          lineHeight: 21,
          color: colors[tone],
        },
        style,
      ]}
    />
  );
}
