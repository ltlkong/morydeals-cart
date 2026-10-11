import type { Archive } from './raw-archive.ts';
import type { CaptureTimings } from '../pipeline/capture-timings.ts';

/** Called once by the execution owner; cleanup errors never replace the original failure. */
export async function finalizeFailure(
  archive: Archive,
  error: unknown,
  timings: CaptureTimings,
): Promise<string[]> {
  const errors: string[] = [];
  const attempt = async (operation: () => Promise<unknown>) => {
    try {
      await operation();
    } catch (failure) {
      errors.push(failure instanceof Error ? failure.message : String(failure));
    }
  };
  await attempt(() => archive.initialize());
  await attempt(() => archive.seal(error instanceof Error ? error.message : String(error)));
  await attempt(() =>
    archive.artifact(
      'failure.json',
      JSON.stringify({
        message: error instanceof Error ? error.message : String(error),
        failedAt: new Date().toISOString(),
      }),
    ),
  );
  await attempt(() =>
    archive.artifact('timings.json', JSON.stringify(timings.snapshot('before_archive'))),
  );
  await attempt(() => timings.measure('archive', () => archive.finalize()));
  return errors;
}
