import { createContext, type ReactNode, useContext } from "react";
import { DEFAULT_MORY_LOOK, type MoryLook } from "./poses";

const Look = createContext<MoryLook>(DEFAULT_MORY_LOOK);

/** The shopper's chosen look for every Mory inside (headpiece and expression). */
export function MoryLookProvider({
  look,
  children,
}: {
  look: MoryLook;
  children: ReactNode;
}) {
  return <Look.Provider value={look}>{children}</Look.Provider>;
}

export const useMoryLook = () => useContext(Look);
