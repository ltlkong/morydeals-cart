import { DEFAULT_MORY_LOOK, type MoryLook } from "@morydeals/ui";
import { useLocalState } from "../use-local-state";
import { validMoryLook } from "./mory-look-parts";

/** The shopper's Mory, kept on this phone. */
export function useStoredMoryLook() {
  const { value, setValue } = useLocalState<MoryLook>(
    "mory.look.v1",
    DEFAULT_MORY_LOOK,
    validMoryLook,
  );
  return { look: value, setLook: setValue };
}
