import type { MoryLook } from "@morydeals/ui";

export const HEADPIECES = ["orange", "apple", "pear", "none"] as const;
export const EXPRESSIONS = ["neutral", "happy", "wink", "sleepy"] as const;

/** A saved look from storage (untrusted): only known parts. */
export const validMoryLook = (value: unknown): value is MoryLook => {
  const look = value as Partial<Record<keyof MoryLook, unknown>> | null;
  return (
    !!look &&
    typeof look === "object" &&
    (HEADPIECES as readonly unknown[]).includes(look.headpiece) &&
    (EXPRESSIONS as readonly unknown[]).includes(look.expression)
  );
};
