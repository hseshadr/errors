// Defense in depth: if some OTHER code in the host process pollutes
// `Object.prototype` (the classic `merge(target, JSON.parse(input))` bug), the
// registry must not start reading attacker values through the prototype chain.
// Catalog entries and `ProblemOptions` are plain objects, so every optional
// member is read as an OWN property only.
//
// Each case pollutes inside try/finally and restores before asserting, so a
// failure can never leave the prototype dirty for the rest of the suite.
import { describe, expect, it } from "vitest";
import type { Catalog } from "../src/index.js";
import { defineErrors } from "../src/index.js";

const POLLUTION: Readonly<Record<string, unknown>> = {
  // ProblemOptions
  status: 299,
  title: "polluted title",
  instance: "/polluted",
  // CatalogEntry
  problemType: "https://attacker.example/polluted",
  i18nKey: "polluted.key",
  en: "polluted {x}",
  httpStatus: [298],
  httpStatusRange: [100, 599],
  match: () => true,
  priority: 1_000,
  category: "polluted",
};

/** Run `fn` with `Object.prototype` polluted, always restoring it. */
function withPollutedPrototype<T>(fn: () => T): T {
  const proto = Object.prototype as Record<string, unknown>;
  const names = Object.keys(POLLUTION);
  const clashes = names.filter((name) => name in proto);
  expect(clashes).toEqual([]);
  try {
    for (const name of names) proto[name] = POLLUTION[name];
    return fn();
  } finally {
    for (const name of names) delete proto[name];
  }
}

const catalog = {
  "app.bare": { category: "config" },
  "app.full": {
    category: "provider",
    en: "Full {x}.",
    httpStatus: [402],
    problemType: "https://example.com/full",
  },
} satisfies Catalog;

describe("a polluted Object.prototype", () => {
  const outcome = withPollutedPrototype(() => {
    const reg = defineErrors(catalog);
    const t = (key: string): string => key;
    return {
      bare: reg.toProblemDetails("app.bare"),
      bareWithOptions: reg.toProblemDetails("app.bare", {}, {}),
      full: reg.toProblemDetails("app.full", { x: "y" }, {}),
      unknown: reg.toProblemDetails("nope", {}, {}),
      describeBare: reg.describe("app.bare"),
      describeBareT: reg.describe("app.bare", {}, t),
      describeFull: reg.describe("app.full", { x: "y" }),
      classifyText: reg.classify("anything at all"),
      classify298: reg.classify({ status: 298 }),
      classify404: reg.classify({ status: 404 }),
      classify402: reg.classify({ status: 402 }),
      createBare: reg.create("app.bare").category,
    };
  });

  it("is fully restored after the test pollutes it", () => {
    for (const name of Object.keys(POLLUTION)) {
      expect(name in Object.prototype).toBe(false);
    }
  });

  it("leaks no option or entry member into Problem Details", () => {
    expect(outcome.bare).toEqual({ type: "app.bare", title: "app.bare" });
    expect(outcome.bareWithOptions).toEqual({
      type: "app.bare",
      title: "app.bare",
    });
    expect(outcome.full).toEqual({
      type: "https://example.com/full",
      title: "Full y.",
      status: 402,
      x: "y",
    });
    expect(outcome.unknown).toEqual({ type: "nope", title: "nope" });
    const serialized = JSON.stringify([
      outcome.bare,
      outcome.bareWithOptions,
      outcome.full,
      outcome.unknown,
    ]);
    expect(serialized).not.toContain("polluted");
    expect(serialized).not.toContain("299");
    expect(serialized).not.toContain("298");
  });

  it("leaks no i18nKey or en template into describe", () => {
    expect(outcome.describeBare).toBe("app.bare");
    expect(outcome.describeBareT).toBe("app.bare");
    expect(outcome.describeFull).toBe("Full y.");
  });

  it("leaks no match, priority, httpStatus, or range into classify", () => {
    expect(outcome.classifyText).toBe("internal.unknown");
    expect(outcome.classify298).toBe("internal.unknown");
    expect(outcome.classify404).toBe("internal.unknown");
    expect(outcome.classify402).toBe("app.full");
  });

  it("leaks no category into create", () => {
    expect(outcome.createBare).toBe("config");
  });
});

describe("an entry registered without its required category", () => {
  it("falls back to internal instead of reading the prototype", () => {
    const reg = defineErrors({ "app.nocat": {} as never });
    const category = withPollutedPrototype(
      () => reg.create("app.nocat").category,
    );
    expect(category).toBe("internal");
  });
});

describe("untyped callers passing null", () => {
  it("still accepts null params and null options, as before", () => {
    const reg = defineErrors(catalog);
    expect(
      reg.toProblemDetails("app.full", null as never, null as never),
    ).toEqual({
      type: "https://example.com/full",
      title: "Full {x}.",
      status: 402,
    });
  });
});
