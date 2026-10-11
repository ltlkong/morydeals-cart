import { createContext, type ReactNode, useContext } from "react";

const Paused = createContext(false);

/**
 * Hosts mark a part of the screen that is out of view (a tab in the background): looping decorations in it (Mory)
 * stand still there instead of animating every frame nobody sees.
 */
export function MotionPause({
  paused,
  children,
}: {
  paused: boolean;
  children: ReactNode;
}) {
  return <Paused.Provider value={paused}>{children}</Paused.Provider>;
}

/** Whether looping decorations here should stand still (see MotionPause). */
export const useMotionPaused = () => useContext(Paused);
