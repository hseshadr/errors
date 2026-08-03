import { describe, expect, it } from "vitest";
import { defineErrors, starterPack } from "../src/index.js";

/**
 * The documented classification contract, tested so it cannot silently flip.
 *
 * Order: `match` predicates first (most specific), then the exact `httpStatus`
 * table, then the fallback code. Every test here is written so that a rewrite
 * of `classify` that consults `httpStatus` before `match` goes RED.
 */
describe("classify — match predicates outrank the httpStatus table", () => {
  const registry = defineErrors(starterPack);

  it("prefers the match rule when BOTH a match rule and a status claim the raw", () => {
    // 402 is registered by ai.provider.out_of_credits; the name is claimed by
    // ai.request.timeout's match rule. Match must win.
    const raw = { status: 402, name: "AbortError", message: "aborted" };
    expect(registry.classify(raw)).toBe("ai.request.timeout");
  });

  it("prefers the match rule over a 404 status claim", () => {
    // 404 -> ai.model.unavailable by status; the text claims ai.request.timeout.
    const raw = { status: 404, message: "the request timed out" };
    expect(registry.classify(raw)).toBe("ai.request.timeout");
  });

  it("still uses the status table when no match rule claims the raw", () => {
    expect(registry.classify({ status: 429 })).toBe("ai.provider.rate_limited");
  });

  it("keeps match-first even for a caller's own catalog", () => {
    const app = defineErrors({
      "app.by_status": {
        category: "provider",
        httpStatus: [409],
        en: "Conflict.",
      },
      "app.by_match": {
        category: "config",
        en: "Claimed by predicate.",
        match: (raw) =>
          typeof raw === "object" &&
          raw !== null &&
          (raw as { tag?: unknown }).tag === "claim-me",
      },
      "internal.unknown": { category: "internal", en: "Something went wrong." },
    });
    expect(app.classify({ status: 409, tag: "claim-me" })).toBe("app.by_match");
  });
});
