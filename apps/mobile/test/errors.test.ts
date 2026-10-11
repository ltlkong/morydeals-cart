import { test } from "node:test";
import assert from "node:assert/strict";
import { OFFLINE, UserFacingError, userMessage } from "../src/errors";

test("only messages written for the shopper are shown; everything else becomes our own wording", () => {
  assert.equal(
    userMessage(
      new UserFacingError("You can keep up to 20 lists."),
      "Try again.",
    ),
    "You can keep up to 20 lists.",
  );
  // fetch's network failure: the server is down or unreachable.
  assert.equal(
    userMessage(new TypeError("Network request failed"), "Try again."),
    OFFLINE,
  );
  // Internal details never reach the screen.
  for (const internal of [
    new Error("connect ECONNREFUSED 10.0.0.147:3000"),
    new Error("Unexpected token < in JSON at position 0"),
    new SyntaxError("JSON Parse error"),
    "PrismaClientKnownRequestError",
    null,
  ])
    assert.equal(
      userMessage(internal, "Could not load your lists."),
      "Could not load your lists.",
    );
  assert.doesNotMatch(OFFLINE, /\d+\.\d+|http|api|server/i);
});

test("API rejections: business wording is kept, framework validation text and server errors are not", async () => {
  const { apiFailure } = await import("../src/errors");
  const reply = (status: number, message: string) =>
    new Response(JSON.stringify({ statusCode: status, message }), { status });
  assert.equal(
    (
      await apiFailure(
        reply(409, "You can keep up to 20 lists."),
        "Could not create the list.",
      )
    ).message,
    "You can keep up to 20 lists.",
  );
  assert.equal(
    (await apiFailure(reply(404, "This list no longer exists."), "x")).message,
    "This list no longer exists.",
  );
  assert.equal(
    (
      await apiFailure(
        reply(400, "Validation failed (uuid v4 is expected)"),
        "Could not load this list.",
      )
    ).message,
    "Could not load this list.",
  );
  assert.equal(
    (
      await apiFailure(
        reply(503, "Service temporarily unavailable."),
        "Could not load your cart.",
      )
    ).message,
    "Could not load your cart.",
  );
  assert.equal(
    (
      await apiFailure(
        new Response("<html>", { status: 404 }),
        "Not found here.",
      )
    ).message,
    "Not found here.",
  );
});
