import { describe, expect, it, vi } from "vitest";
import { defineErrors, type TFunction } from "../src/index.js";

/**
 * `i18nKey` is a documented public feature: an entry may override the i18n key
 * `describe` looks up, instead of the default `errors.<code>`. It had no test,
 * so deleting support for it left the suite green. These tests go RED if the
 * override is dropped.
 */
const registry = defineErrors({
  "app.custom_key": {
    category: "config",
    i18nKey: "errors:device.unsupported",
    params: ["field"],
    en: "Default English for {field}.",
  },
  "app.default_key": {
    category: "config",
    en: "No override here.",
  },
  "internal.unknown": { category: "internal", en: "Something went wrong." },
});

describe("describe — i18nKey overrides the default `errors.<code>` key", () => {
  it("looks the override key up in t, not `errors.<code>`", () => {
    const t: TFunction = vi.fn((key: string) => `translated(${key})`);
    const out = registry.describe("app.custom_key", { field: "x" }, t);
    expect(t).toHaveBeenCalledWith("errors:device.unsupported", { field: "x" });
    expect(t).not.toHaveBeenCalledWith(
      "errors.app.custom_key",
      expect.anything(),
    );
    expect(out).toBe("translated(errors:device.unsupported)");
  });

  it("falls back to the default English when t returns the OVERRIDE key verbatim", () => {
    // i18next returns the key unchanged when the resource is missing. The
    // miss-detection must compare against the override, not `errors.<code>`.
    const t: TFunction = (key: string) => key;
    expect(registry.describe("app.custom_key", { field: "x" }, t)).toBe(
      "Default English for x.",
    );
  });

  it("uses `errors.<code>` when the entry declares no i18nKey", () => {
    const t: TFunction = vi.fn((key: string) => `translated(${key})`);
    registry.describe("app.default_key", {}, t);
    expect(t).toHaveBeenCalledWith("errors.app.default_key", {});
  });

  it("uses `errors.<code>` for a code that is not registered at all", () => {
    const t: TFunction = vi.fn((key: string) => `translated(${key})`);
    expect(registry.describe("not.registered", {}, t)).toBe(
      "translated(errors.not.registered)",
    );
    expect(t).toHaveBeenCalledWith("errors.not.registered", {});
  });

  it("carries the i18nKey-resolved title into toProblemDetails", () => {
    const problem = registry.toProblemDetails("app.custom_key", { field: "y" });
    expect(problem.title).toBe("Default English for y.");
  });
});
