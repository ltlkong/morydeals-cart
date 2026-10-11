/**
 * What failures may say to the shopper. Only messages written for them are shown: our own copy, and the API's
 * wording for its business rejections. Network failures get one fixed line; anything else (programming errors,
 * framework validation text, unexpected replies, errors from inside a store page) shows the screen's own wording,
 * so no internal detail (addresses, services, stack text) ever reaches the screen.
 */
export class UserFacingError extends Error {}

export const OFFLINE =
  "Can't reach Mory right now. Check your connection and try again.";

export function userMessage(error: unknown, fallback: string): string {
  if (error instanceof UserFacingError) return error.message;
  // fetch rejects with a TypeError when the server cannot be reached.
  if (error instanceof TypeError) return OFFLINE;
  return fallback;
}

/** Rejections whose API wording is written for the shopper (a missing list, a limit, an unsupported store). */
const USER_FACING_STATUS = new Set([403, 404, 409, 413, 422]);

/** The error for a failed API response: its own wording for business rejections, else `fallback`. */
export async function apiFailure(
  response: Response,
  fallback: string,
): Promise<UserFacingError> {
  if (USER_FACING_STATUS.has(response.status)) {
    const body = (await response.json().catch(() => null)) as {
      message?: unknown;
    } | null;
    if (typeof body?.message === "string" && body.message)
      return new UserFacingError(body.message);
  }
  return new UserFacingError(fallback);
}
