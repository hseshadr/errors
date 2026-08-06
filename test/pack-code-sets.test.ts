import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { aiPack, bundlePack, corePack, starterPack } from "../src/index.js";

/**
 * The code names ARE the public API.
 *
 * A consumer writes `errors.create("bundle.quota_exceeded", …)` against a string,
 * not against a symbol the compiler can follow. Rename or drop a code here and
 * every one of those call sites — in repos this one has never seen — breaks at
 * runtime, silently, on the next upgrade.
 *
 * Before this file existed, that was unguarded. A mutation run against the 24
 * codes the README promises (`corePack` 10 + `aiPack` 9 + `bundlePack` 5) found
 * 8 of 12 rename/delete mutations left the whole gate green — lint, typecheck,
 * tests, build. The 4 that did go red went red by accident: those particular
 * codes happen to be name-dropped in an unrelated `classify` assertion. 23 of the
 * 24 code strings already appeared somewhere under `test/`, which is exactly why
 * "the code is mentioned in a test" is not the same thing as "the code is pinned"
 * — most of those mentions belong to `starterPack`'s list, a different object.
 *
 * So: one exact, ordered, literal list per pack. Not a length check —
 * `toHaveLength(10)` passes at any ten codes, whatever they are called. The
 * literal strings below are the promise, transcribed from README's pack table
 * and its "What `classify` knows out of the box" tables.
 *
 * Order is pinned too, deliberately. README documents that "the code that
 * registers a status first wins", so declaration order is observable behaviour
 * for a consumer who spreads two packs together, not an implementation detail.
 *
 * When you genuinely mean to add or rename a code: change the list here in the
 * same commit, and treat a rename as the breaking change it is.
 */

describe("the exact code set of every pack (the published API surface)", () => {
  it("corePack ships exactly its 10 documented codes, in order", () => {
    expect(Object.keys(corePack)).toEqual([
      "http.unauthorized",
      "http.not_found",
      "http.rate_limited",
      "http.server_error",
      "net.unreachable",
      "request.timeout",
      "request.cancelled",
      "config.missing",
      "config.invalid",
      "internal.unknown",
    ]);
  });

  it("aiPack ships exactly its 9 documented codes, in order", () => {
    expect(Object.keys(aiPack)).toEqual([
      "ai.config.no_key",
      "ai.provider.unauthorized",
      "ai.provider.out_of_credits",
      "ai.provider.rate_limited",
      "ai.provider.server_error",
      "ai.model.unavailable",
      "ai.request.timeout",
      "ai.request.cancelled",
      "ai.privacy.violation",
    ]);
  });

  it("bundlePack ships exactly its 5 documented codes, in order", () => {
    expect(Object.keys(bundlePack)).toEqual([
      "bundle.download_failed",
      "bundle.integrity_failed",
      "bundle.quota_exceeded",
      "bundle.device_unsupported",
      "bundle.timeout",
    ]);
  });

  it("starterPack ships exactly its 18 frozen codes, in order", () => {
    // Frozen: three repos vendor a byte-identical copy and build catalogs by
    // spreading these entries, so this list is a compatibility surface.
    expect(Object.keys(starterPack)).toEqual([
      "ai.config.no_key",
      "ai.provider.unauthorized",
      "ai.provider.out_of_credits",
      "ai.provider.rate_limited",
      "ai.provider.server_error",
      "ai.model.unavailable",
      "ai.request.timeout",
      "ai.request.cancelled",
      "ai.privacy.violation",
      "net.unreachable",
      "bundle.download_failed",
      "bundle.integrity_failed",
      "bundle.quota_exceeded",
      "bundle.device_unsupported",
      "bundle.timeout",
      "config.missing",
      "config.invalid",
      "internal.unknown",
    ]);
  });
});

/**
 * The lists above pin the code names. This pins the other half of the promise:
 * README's pack table advertises a count per pack, and a reader picks a pack off
 * that table. If someone adds an 11th code to `corePack` and updates the list
 * above but not the table, the docs start lying. Read the number out of the
 * shipped README rather than restating it, so there is one source for it.
 */
describe("README's pack table matches what the packs actually ship", () => {
  const README = readFileSync(
    fileURLToPath(new URL("../README.md", import.meta.url)),
    "utf8",
  );

  /** Pulls N out of README's `| \`corePack\` | 10 | … |` row. */
  const documentedCount = (pack: string): number => {
    const row = new RegExp(`^\\|\\s*\`${pack}\`\\s*\\|\\s*(\\d+)\\s*\\|`, "m");
    const found = README.match(row);
    if (!found?.[1]) throw new Error(`no README table row for ${pack}`);
    return Number(found[1]);
  };

  const packs = { corePack, aiPack, bundlePack, starterPack };

  it("reads the four advertised counts out of the shipped README", () => {
    // Guards the parser itself: if the table is reformatted away, the regex
    // would quietly match nothing and every check below would vacuously pass.
    expect([
      documentedCount("corePack"),
      documentedCount("aiPack"),
      documentedCount("bundlePack"),
      documentedCount("starterPack"),
    ]).toEqual([10, 9, 5, 18]);
  });

  for (const [name, pack] of Object.entries(packs)) {
    it(`${name}'s advertised count is the count it ships`, () => {
      expect(Object.keys(pack)).toHaveLength(documentedCount(name));
    });
  }
});
