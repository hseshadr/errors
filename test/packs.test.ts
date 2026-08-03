import { describe, expect, it } from "vitest";
import type { Catalog } from "../src/index.js";
import {
  aiPack,
  bundlePack,
  corePack,
  defineErrors,
  defineErrorsWith,
  starterPack,
} from "../src/index.js";

/**
 * `starterPack` is an AI/WASM catalog wearing a generic name: 10 of its 18 codes
 * are `ai.*` or `bundle.*`, three carry another app's UI in shipped English
 * ("Settings → AI"), and one string-couples to @edgeproc/privacy-core. It stays
 * exactly as shipped for the three vendored consumers; the split below is what a
 * stranger should reach for.
 */
const englishOf = (pack: Record<string, { en?: string }>): string[] =>
  Object.values(pack).map((entry) => entry.en ?? "");

describe("corePack — domain-neutral, no AI, no WASM", () => {
  it("registers no ai.* and no bundle.* codes", () => {
    for (const code of Object.keys(corePack)) {
      expect(code.startsWith("ai.")).toBe(false);
      expect(code.startsWith("bundle.")).toBe(false);
    }
  });

  it("ships no AI-provider or local-engine wording", () => {
    for (const en of englishOf(corePack)) {
      expect(en).not.toMatch(/\bAI\b|Settings →|local engine|\bmodel\b/i);
    }
  });

  it("carries a category and default English on every code", () => {
    for (const entry of Object.values(corePack)) {
      expect(entry.category).toBeTypeOf("string");
      expect(entry.en).toBeTypeOf("string");
    }
  });

  it("classifies the ordinary HTTP statuses to neutral codes", () => {
    const registry = defineErrorsWith({}, corePack);
    expect(registry.classify({ status: 401 })).toBe("http.unauthorized");
    expect(registry.classify({ status: 404 })).toBe("http.not_found");
    expect(registry.classify({ status: 429 })).toBe("http.rate_limited");
    expect(registry.classify({ status: 500 })).toBe("http.server_error");
  });

  it("claims the WHOLE 5xx range, not four hand-picked statuses", () => {
    const registry = defineErrorsWith({}, corePack);
    for (const status of [500, 501, 502, 503, 504, 507, 522, 599]) {
      expect(registry.classify({ status })).toBe("http.server_error");
    }
  });

  it("registers internal.unknown, so the default fallback validates", () => {
    expect(() => defineErrorsWith({}, corePack)).not.toThrow();
  });

  it("keeps its broad rules out of a consumer's way", () => {
    // corePack's timeout/network rules are declared broad (negative priority),
    // so a consumer's own default-priority rule wins even when spread second.
    const registry = defineErrors({
      ...corePack,
      "db.query.timeout": {
        category: "timeout",
        en: "The database query timed out.",
        match: (raw: unknown) => /db .*timeout/i.test(String(raw ?? "")),
      },
    });
    expect(registry.classify("db timeout after 30s")).toBe("db.query.timeout");
    // …and the broad rule still catches everything else.
    expect(registry.classify("the request timed out")).toBe("request.timeout");
  });
});

describe("aiPack — the AI half, named honestly", () => {
  it("holds only ai.* codes", () => {
    for (const code of Object.keys(aiPack)) {
      expect(code.startsWith("ai.")).toBe(true);
    }
  });

  it("does not hardcode another app's settings UI", () => {
    for (const en of englishOf(aiPack)) {
      expect(en).not.toMatch(/Settings →/);
    }
  });

  it("does not string-couple to @edgeproc/privacy-core", () => {
    // Widened to Catalog: `match` is absent from the literal type, which is the
    // point — the coupling is gone at the type level too.
    const entries: Catalog = aiPack;
    expect(entries["ai.privacy.violation"]?.match).toBeUndefined();
    for (const entry of Object.values(entries)) {
      expect(String(entry.match ?? "")).not.toMatch(/PrivacyViolationError/);
    }
  });

  it("claims the whole 5xx range for the provider error", () => {
    const registry = defineErrors({ ...corePack, ...aiPack });
    // aiPack is spread second, so corePack's 5xx registration wins by order;
    // registered alone, the AI code claims the range itself.
    expect(registry.classify({ status: 500 })).toBe("http.server_error");
    const aiOnly = defineErrorsWith(
      { fallbackCode: "ai.request.cancelled" },
      aiPack,
    );
    for (const status of [500, 501, 522, 599]) {
      expect(aiOnly.classify({ status })).toBe("ai.provider.server_error");
    }
  });
});

describe("bundlePack — the WASM/data-bundle half", () => {
  it("holds only bundle.* codes", () => {
    for (const code of Object.keys(bundlePack)) {
      expect(code.startsWith("bundle.")).toBe(true);
    }
  });

  it("does not name a specific app's engine", () => {
    for (const en of englishOf(bundlePack)) {
      expect(en).not.toMatch(/local engine/i);
    }
  });
});

describe("the three packs compose without a code collision", () => {
  it("merges as separate fragments (which is duplicate-checked)", () => {
    const registry = defineErrors(corePack, aiPack, bundlePack);
    expect(registry.has("http.not_found")).toBe(true);
    expect(registry.has("ai.provider.rate_limited")).toBe(true);
    expect(registry.has("bundle.integrity_failed")).toBe(true);
    expect(registry.has("internal.unknown")).toBe(true);
  });
});

describe("starterPack — frozen exactly as the vendored consumers have it", () => {
  it("still has all 18 codes", () => {
    expect(Object.keys(starterPack)).toHaveLength(18);
  });

  it("keeps its shipped English byte-for-byte, Settings → AI included", () => {
    // Deliberate: three repos vendor a byte-identical copy of this library and
    // build catalogs by spreading these entries. Rewording them here would
    // change their UI on the next re-vendor. New wording lives in aiPack.
    expect(starterPack["ai.config.no_key"].en).toBe(
      "No AI provider key is set. Add your key in Settings → AI to turn on the optional AI features.",
    );
    expect(starterPack["bundle.device_unsupported"].en).toBe(
      "This device or browser can't run the local engine. Try a recent desktop browser.",
    );
  });

  it("keeps its privacy-core match rule and its four-status 5xx list", () => {
    expect(starterPack["ai.privacy.violation"].match).toBeTypeOf("function");
    expect(starterPack["ai.provider.server_error"].httpStatus).toEqual([
      500, 502, 503, 504,
    ]);
  });
});
