import { describe, expect, it } from "vitest";
import type { Catalog, Category, KnownCategory } from "../src/index.js";
import { defineErrorsWith } from "../src/index.js";

/**
 * `Category` used to be a closed 7-member union, so a consumer could not add
 * `auth`, `validation` or `billing` without patching this library. It is now
 * open: the seven known members stay as documented suggestions (and keep editor
 * autocomplete), and any other string is valid.
 *
 * The `satisfies Catalog` below is the real assertion — it does not compile
 * against a closed union, so `pnpm typecheck` is what guards this.
 */
const APP_CATALOG = {
  "auth.session_expired": {
    category: "auth",
    en: "Your session expired. Sign in again.",
  },
  "validation.rejected": {
    category: "validation",
    params: ["field"],
    en: "Check the {field} field.",
  },
  "billing.card_declined": {
    category: "billing",
    httpStatus: [402],
    en: "Your card was declined.",
  },
  "app.unknown": { category: "internal", en: "Something went wrong." },
} as const satisfies Catalog;

describe("Category — open to a consumer's own buckets", () => {
  const registry = defineErrorsWith(
    { fallbackCode: "app.unknown" },
    APP_CATALOG,
  );

  it("registers codes whose category is not one of the built-in seven", () => {
    expect(registry.get("auth.session_expired")?.category).toBe("auth");
    expect(registry.get("validation.rejected")?.category).toBe("validation");
    expect(registry.get("billing.card_declined")?.category).toBe("billing");
  });

  it("carries a custom category onto the CanonicalError it creates", () => {
    const err = registry.create("auth.session_expired");
    expect(err.category).toBe("auth");
    // Assignable to Category: the point of the widening.
    const category: Category = err.category;
    expect(category).toBe("auth");
  });

  it("still classifies and describes custom-category codes normally", () => {
    expect(registry.classify({ status: 402 })).toBe("billing.card_declined");
    expect(registry.describe("validation.rejected", { field: "email" })).toBe(
      "Check the email field.",
    );
  });
});

describe("Category — the seven known members are unchanged", () => {
  it("keeps every documented member assignable to KnownCategory", () => {
    const known: readonly KnownCategory[] = [
      "provider",
      "config",
      "network",
      "timeout",
      "device",
      "integrity",
      "internal",
    ];
    expect(known).toHaveLength(7);
    // Each is still a valid Category too.
    for (const member of known) {
      const category: Category = member;
      expect(typeof category).toBe("string");
    }
  });
});
