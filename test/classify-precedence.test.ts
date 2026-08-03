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

describe("classify — match order among match rules", () => {
  const OWN_TIMEOUT = {
    "db.query.timeout": {
      category: "timeout",
      en: "The database query timed out.",
      match: (raw: unknown) => /db .*timeout/i.test(String(raw ?? "")),
    },
  } as const;

  it("keeps registration order when no priority is declared", () => {
    // The documented trap: `{ ...starterPack, ...own }` registers the starter
    // pack's broad /timeout|timed out/i rule FIRST, so it claims the raw before
    // the consumer's own rule ever runs. Three vendored consumers depend on
    // registration order being the precedence, so this stays the default.
    const app = defineErrors({ ...starterPack, ...OWN_TIMEOUT });
    expect(app.classify("db timeout after 30s")).toBe("ai.request.timeout");
  });

  it("lets a higher priority claim the raw ahead of an earlier broad rule", () => {
    const app = defineErrors({
      ...starterPack,
      "db.query.timeout": { ...OWN_TIMEOUT["db.query.timeout"], priority: 10 },
    });
    expect(app.classify("db timeout after 30s")).toBe("db.query.timeout");
  });

  it("still lets the broad rule catch what the specific one does not", () => {
    const app = defineErrors({
      ...starterPack,
      "db.query.timeout": { ...OWN_TIMEOUT["db.query.timeout"], priority: 10 },
    });
    expect(app.classify("the request timed out")).toBe("ai.request.timeout");
  });

  it("orders by priority descending, then by registration", () => {
    const always = () => true;
    const app = defineErrors({
      "app.first_registered": { category: "internal", match: always },
      "app.low": { category: "internal", priority: -5, match: always },
      "app.high": { category: "internal", priority: 5, match: always },
      "app.also_default": { category: "internal", match: always },
      "internal.unknown": { category: "internal", en: "?" },
    });
    expect(app.classify("anything")).toBe("app.high");
  });

  it("breaks a priority tie by registration order, not by code name", () => {
    const always = () => true;
    const app = defineErrors({
      "zz.registered_first": {
        category: "internal",
        priority: 3,
        match: always,
      },
      "aa.registered_second": {
        category: "internal",
        priority: 3,
        match: always,
      },
      "internal.unknown": { category: "internal", en: "?" },
    });
    expect(app.classify("anything")).toBe("zz.registered_first");
  });
});

describe("classify — httpStatusRange is the third tier", () => {
  const app = defineErrors({
    "app.gateway_timeout": {
      category: "timeout",
      httpStatus: [504],
      en: "Gateway timeout.",
    },
    "app.server_error": {
      category: "provider",
      httpStatus: [500],
      httpStatusRange: [500, 599],
      en: "The server had an error.",
    },
    "app.claimed": {
      category: "internal",
      en: "Claimed by predicate.",
      match: (raw: unknown) => String(raw ?? "") === "claim-me",
    },
    "internal.unknown": { category: "internal", en: "Something went wrong." },
  });

  it("catches the statuses no exact entry registered", () => {
    for (const status of [501, 505, 507, 522, 599]) {
      expect(app.classify({ status })).toBe("app.server_error");
    }
  });

  it("lets an exact httpStatus entry win over a range that also covers it", () => {
    expect(app.classify({ status: 504 })).toBe("app.gateway_timeout");
  });

  it("does not swallow statuses outside the range", () => {
    expect(app.classify({ status: 499 })).toBe("internal.unknown");
    expect(app.classify({ status: 600 })).toBe("internal.unknown");
  });

  it("still runs behind match predicates", () => {
    expect(app.classify("claim-me")).toBe("app.claimed");
  });
});

describe("classify — starterPack's 5xx claim is exactly four statuses", () => {
  const registry = defineErrors(starterPack);

  it("maps only the four registered 5xx statuses", () => {
    for (const status of [500, 502, 503, 504]) {
      expect(registry.classify({ status })).toBe("ai.provider.server_error");
    }
  });

  it("falls through for every other 5xx — deliberate, not a range", () => {
    // starterPack is frozen for the vendored consumers, so its httpStatus list
    // stays [500, 502, 503, 504]. corePack.http.server_error is the entry that
    // claims the whole 5xx range via httpStatusRange.
    for (const status of [501, 505, 507, 522, 599]) {
      expect(registry.classify({ status })).toBe("internal.unknown");
    }
  });
});
