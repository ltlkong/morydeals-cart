/** Settles once `work` settles and at least `ms` have passed; a failure still settles (the caller reports errors). */
export function atLeast(work: Promise<unknown>, ms: number): Promise<void> {
  return Promise.all([
    work.catch(() => undefined),
    new Promise((resolve) => setTimeout(resolve, ms)),
  ]).then(() => undefined);
}
