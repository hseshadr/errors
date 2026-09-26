// Four things a first-time user of the published package hit, reproduced
// exactly as they wrote them, against the public API only.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import type { Catalog } from "../src/index.js";
import {
  aiPack,
  corePack,
  DuplicateCodeError,
  defineErrors,
  defineErrorsWith,
  InvalidCatalogEntryError,
  UnregisteredFallbackError,
} from "../src/index.js";

const ROOT = fileURLToPath(new URL("..", import.meta.url));

describe("composing corePack and aiPack", () => {
  it("registers every code from both packs: no code is lost", () => {
    const errors = defineErrorsWith({}, corePack, aiPack);
    expect(errors.codes).toEqual([
      ...Object.keys(corePack),
      ...Object.keys(aiPack),
    ]);
  });

  it("throws when the same code is defined twice, never keeps one silently", () => {
    expect(() => defineErrorsWith({}, corePack, { ...corePack })).toThrow(
      DuplicateCodeError,
    );
  });

  // Documented precedence: the list you pass first wins every raw failure that
  // both lists claim. aiPack's own 402 is claimed by nobody else.
  const SHARED: ReadonlyArray<readonly [unknown, string, string]> = [
    [{ status: 401 }, "http.unauthorized", "ai.provider.unauthorized"],
    [{ status: 403 }, "http.unauthorized", "ai.provider.unauthorized"],
    [{ status: 404 }, "http.not_found", "ai.model.unavailable"],
    [{ status: 429 }, "http.rate_limited", "ai.provider.rate_limited"],
    [{ status: 500 }, "http.server_error", "ai.provider.server_error"],
    [{ status: 522 }, "http.server_error", "ai.provider.server_error"],
    [{ name: "AbortError" }, "request.timeout", "ai.request.timeout"],
  ];

  it.each(SHARED)("core first: %j -> %s", (raw, coreCode) => {
    expect(defineErrorsWith({}, corePack, aiPack).classify(raw)).toBe(coreCode);
  });

  it.each(SHARED)("ai first: %j -> %s", (raw, _core, aiCode) => {
    expect(defineErrorsWith({}, aiPack, corePack).classify(raw)).toBe(aiCode);
  });

  it("routes 402 to aiPack whichever order you pass", () => {
    for (const errors of [
      defineErrorsWith({}, corePack, aiPack),
      defineErrorsWith({}, aiPack, corePack),
    ]) {
      expect(errors.classify({ status: 402 })).toBe(
        "ai.provider.out_of_credits",
      );
    }
  });
});

describe("aiPack on its own", () => {
  it("still works with defineErrors, which does not check the fallback", () => {
    expect(defineErrors(aiPack).classify({ status: 402 })).toBe(
      "ai.provider.out_of_credits",
    );
  });

  it("works with defineErrorsWith once you choose a fallback it registers", () => {
    const errors = defineErrorsWith(
      { fallbackCode: "ai.provider.server_error" },
      aiPack,
    );
    expect(errors.classify({ status: 418 })).toBe("ai.provider.server_error");
  });

  it("throws an error that says exactly what is missing and both fixes", () => {
    let thrown: unknown;
    try {
      defineErrorsWith({}, aiPack);
    } catch (err) {
      thrown = err;
    }
    expect(thrown).toBeInstanceOf(UnregisteredFallbackError);
    const message = (thrown as Error).message;
    expect(message).toContain('"internal.unknown"');
    expect(message).toContain("corePack");
    expect(message).toContain("fallbackCode");
  });

  it("does not point you at corePack for a fallback you chose yourself", () => {
    expect(() =>
      defineErrorsWith({ fallbackCode: "shop.nope" }, aiPack),
    ).toThrow(
      'Fallback code "shop.nope" is not registered in this catalog, so classify() would return a code this registry does not contain. Add "shop.nope" to one of the lists you pass, or set fallbackCode to a code you do register.',
    );
  });
});

describe("CanonicalError.message is the code, and the README says so", () => {
  it("keeps .message equal to the code (a stable, searchable log line)", () => {
    const err = defineErrors(corePack).create("config.missing", {
      field: "API_KEY",
    });
    expect(err.message).toBe("config.missing");
    expect(defineErrors(corePack).describe(err.code, err.params)).toBe(
      "A required setting is missing: API_KEY.",
    );
  });

  it("tells README readers .message is the code and where the sentence is", () => {
    const readme = readFileSync(join(ROOT, "README.md"), "utf8");
    expect(readme).toContain("`.message` is the code");
    expect(readme).toContain("errors.describe(err.code, err.params)");
  });
});

describe("httpStatus must be a list", () => {
  const entry = (httpStatus: unknown): Catalog => ({
    "x.timeout": {
      category: "timeout",
      httpStatus: httpStatus as readonly number[],
    },
  });

  it("rejects a bare number at definition time with a clear typed error", () => {
    expect(() => defineErrors(entry(408))).toThrow(InvalidCatalogEntryError);
    expect(() => defineErrors(entry(408))).toThrow(
      'Error code "x.timeout": httpStatus must be a list of whole-number HTTP statuses, like [408]. Got 408.',
    );
  });

  it("rejects it on the checked entry point too", () => {
    expect(() =>
      defineErrorsWith({ fallbackCode: "x.timeout" }, entry(408)),
    ).toThrow(InvalidCatalogEntryError);
  });

  it("rejects a list holding something that is not a whole number", () => {
    expect(() => defineErrors(entry(["408"]))).toThrow(
      'Error code "x.timeout": httpStatus must be a list of whole-number HTTP statuses, like [408]. Got ["408"].',
    );
    expect(() => defineErrors(entry([408.5]))).toThrow(
      InvalidCatalogEntryError,
    );
  });

  it("accepts a list, and an entry with no httpStatus at all", () => {
    expect(defineErrors(entry([408])).classify({ status: 408 })).toBe(
      "x.timeout",
    );
    expect(defineErrors(entry(undefined)).codes).toEqual(["x.timeout"]);
  });

  it("is a named Error subclass", () => {
    const err = new InvalidCatalogEntryError("a.b", "something is off.");
    expect(err).toBeInstanceOf(Error);
    expect(err.name).toBe("InvalidCatalogEntryError");
    expect(err.code).toBe("a.b");
    expect(err.message).toBe('Error code "a.b": something is off.');
  });
});
