import { BadRequestException } from "@nestjs/common";

/**
 * Where a catalog page ends: the last product's observation time in UTC to the microsecond Postgres stores (so no row
 * is skipped or repeated at a page edge), and its id to break ties.
 */
export type CatalogCursor = { seen: string; id: string };

export function encodeCatalogCursor(cursor: CatalogCursor) {
  return Buffer.from(JSON.stringify([cursor.seen, cursor.id])).toString(
    "base64url",
  );
}

/** The cursor a previous page returned; anything else is a 400, never a silent first page. */
export function decodeCatalogCursor(value: string): CatalogCursor {
  try {
    const parsed: unknown = JSON.parse(
      Buffer.from(value, "base64url").toString("utf8"),
    );
    if (
      Array.isArray(parsed) &&
      parsed.length === 2 &&
      typeof parsed[0] === "string" &&
      typeof parsed[1] === "string" &&
      parsed[1].length > 0 &&
      parsed[1].length <= 100 &&
      /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{6}Z$/.test(parsed[0]) &&
      !Number.isNaN(Date.parse(parsed[0]))
    )
      return { seen: parsed[0], id: parsed[1] };
  } catch {
    // Not base64url JSON: the same 400 as a malformed one.
  }
  throw new BadRequestException("invalid_cursor");
}
