import { describe, expect, it } from "vitest";
import type { Catalog } from "../src/index.js";
import { defineErrors, starterPack } from "../src/index.js";

const registry = defineErrors(starterPack);
const INHERITED = ["constructor", "__proto__", "toString"] as const;

describe.each(INHERITED)("inherited Object.prototype name %s", (name) => {
  it("is not registered", () => {
    expect(registry.has(name)).toBe(false);
    expect(registry.codes).not.toContain(name);
  });

  it("get() returns undefined, not an Object.prototype member", () => {
    expect(registry.get(name)).toBeUndefined();
  });

  it("describe() echoes the code instead of reading an inherited member", () => {
    expect(registry.describe(name)).toBe(name);
  });

  it("toProblemDetails() treats it as an unregistered code", () => {
    const pd = registry.toProblemDetails(name);
    expect(pd).toEqual({ type: name, title: name });
  });

  it("create() falls back to the internal category", () => {
    expect(registry.create(name).category).toBe("internal");
  });
});

describe("a catalog that genuinely registers an own `__proto__` code", () => {
  const fragment = JSON.parse(
    '{"__proto__": {"category": "config", "en": "Own proto entry."}}',
  ) as Catalog;
  const reg = defineErrors(fragment);

  it("keeps it as an own code rather than rewriting the prototype", () => {
    expect(reg.codes).toEqual(["__proto__"]);
    expect(reg.has("__proto__")).toBe(true);
    expect(reg.get("__proto__")?.category).toBe("config");
    expect(reg.describe("__proto__")).toBe("Own proto entry.");
    expect(reg.create("__proto__").category).toBe("config");
  });

  it("still leaves other inherited names unregistered", () => {
    expect(reg.get("constructor")).toBeUndefined();
    expect(reg.has("toString")).toBe(false);
  });
});
