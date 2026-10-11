import {
  Compass,
  ShoppingBag,
  ListChecks,
  UserRound,
} from "lucide-react-native";
import { LogoCarousel, colors, type DockNavigationItem } from "@morydeals/ui";
/** While Browse is not the open page, its icon cycles through the stores' logos. */
export const navigationItems = (logos: string[]): DockNavigationItem[] => [
  {
    key: "browse",
    label: "Browse stores",
    title: "Browse",
    icon: (selected) =>
      selected || !logos.length ? (
        <Compass size={20} color={selected ? colors.accent : colors.ink} />
      ) : (
        <LogoCarousel uris={logos} size={22} />
      ),
  },
  {
    key: "cart",
    label: "Your cart",
    title: "Cart",
    icon: (selected) => (
      <ShoppingBag size={20} color={selected ? colors.accent : colors.ink} />
    ),
  },
  {
    key: "lists",
    label: "Your lists",
    title: "List",
    icon: (selected) => (
      <ListChecks size={20} color={selected ? colors.accent : colors.ink} />
    ),
  },
  {
    key: "account",
    label: "Your account",
    title: "Account",
    icon: (selected) => (
      <UserRound size={20} color={selected ? colors.accent : colors.ink} />
    ),
  },
];
