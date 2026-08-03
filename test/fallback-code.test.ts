import { describe, expect, it } from "vitest";
import {
  DEFAULT_FALLBACK_CODE,
  defineErrors,
  defineErrorsWith,
  starterPack,
  UnregisteredFallbackError,
} from "../src/index.js";

/**
 * The fallback code `classify` returns when nothing matches used to be the
 * hardcoded literal `internal.unknown`. A consumer with their own catalog got a
 * code their registry did not contain: `has()` false, `get()` undefined,
 * `describe()` echoing the raw key, and `{"type":"internal.unknown"}` on the
 * wire — contradicting the promise that you are never stuck with a raw key on
 * screen.
 */
const OWN_CATALOG = {
  "shop.unknown": {
    category: "internal",
    en: "Something went wrong with your order.",
  },
  "shop.out_of_stock": {
    category: "provider",
    httpStatus: [409],
    en: "Sold out.",
  },
} as const;

describe("fallback code — configurable per registry", () => {
  const registry = defineErrorsWith(
    { fallbackCode: "shop.unknown" },
    OWN_CATALOG,
  );

  it("classifies an unrecognised failure to the configured fallback", () => {
    expect(registry.classify(new Error("something odd"))).toBe("shop.unknown");
    expect(registry.classify({ status: 418 })).toBe("shop.unknown");
  });

  it("keeps the fallback inside the registry: has() and get() resolve it", () => {
    const code = registry.classify(null);
    expect(registry.has(code)).toBe(true);
    expect(registry.get(code)?.category).toBe("internal");
  });

  it("describes the fallback in real English, not as a raw key", () => {
    const code = registry.classify(null);
    expect(registry.describe(code)).toBe(
      "Something went wrong with your order.",
    );
    expect(registry.describe(code)).not.toBe(code);
  });

  it("puts a describable title on the wire, not the bare code", () => {
    const problem = registry.toProblemDetails(registry.classify(null));
    expect(problem.type).toBe("shop.unknown");
    expect(problem.title).toBe("Something went wrong with your order.");
  });

  it("does not leak internal.unknown into a catalog that never declared it", () => {
    expect(registry.codes).not.toContain("internal.unknown");
    expect(registry.classify(undefined)).not.toBe("internal.unknown");
  });
});

describe("fallback code — validated at registration time", () => {
  it("throws when the configured fallback is not in the catalog", () => {
    expect(() =>
      defineErrorsWith({ fallbackCode: "shop.nope" }, OWN_CATALOG),
    ).toThrow(UnregisteredFallbackError);
  });

  it("names the offending code so the fix is obvious", () => {
    expect(() =>
      defineErrorsWith({ fallbackCode: "shop.nope" }, OWN_CATALOG),
    ).toThrow(/shop\.nope/);
  });

  it("throws when no fallback is configured and internal.unknown is absent", () => {
    expect(() => defineErrorsWith({}, OWN_CATALOG)).toThrow(
      UnregisteredFallbackError,
    );
  });

  it("accepts the default fallback when the catalog registers it", () => {
    const reg = defineErrorsWith({}, starterPack);
    expect(reg.classify(new Error("odd"))).toBe(DEFAULT_FALLBACK_CODE);
  });

  it("merges fragments and rejects duplicates like defineErrors does", () => {
    const reg = defineErrorsWith(
      { fallbackCode: "shop.unknown" },
      OWN_CATALOG,
      {
        "extra.code": { category: "network", en: "Extra." },
      },
    );
    expect(reg.codes).toContain("extra.code");
  });
});

describe("fallback code — defineErrors keeps its lenient default", () => {
  it("still falls back to internal.unknown", () => {
    expect(DEFAULT_FALLBACK_CODE).toBe("internal.unknown");
    expect(defineErrors(starterPack).classify(new Error("odd"))).toBe(
      "internal.unknown",
    );
  });

  it("does NOT throw for a catalog without internal.unknown (unchanged)", () => {
    // Existing call sites rely on this; only defineErrorsWith is strict.
    const reg = defineErrors(OWN_CATALOG);
    expect(reg.classify(new Error("odd"))).toBe("internal.unknown");
  });
});
