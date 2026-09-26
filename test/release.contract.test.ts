// Release contract: the version a tag publishes is the version the docs name.
//
// publish.yml refuses a tag that differs from package.json, but nothing checked
// that the CHANGELOG and the docs moved with it. A release that bumps only
// package.json ships an npm page whose changelog and API guide name the old
// version. String checks only, on purpose.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const read = (path: string): string => readFileSync(join(ROOT, path), "utf8");
const VERSION = (JSON.parse(read("package.json")) as { version: string })
  .version;

/** Headings like `## [0.2.0] - 2026-09-26`, skipping `## [Unreleased]`. */
const RELEASED_HEADING = /^## \[(\d+\.\d+\.\d+)\] - (\d{4}-\d{2}-\d{2})$/gm;

describe("release contract", () => {
  it("package.json holds a plain semver version", () => {
    expect(VERSION).toMatch(/^\d+\.\d+\.\d+$/);
  });

  it("the newest CHANGELOG release is the package.json version", () => {
    const [newest] = [...read("CHANGELOG.md").matchAll(RELEASED_HEADING)];
    expect(newest?.[1]).toBe(VERSION);
  });

  it.each(["docs/API.md", "docs/ARCHITECTURE.md"])(
    "%s names the package.json version",
    (path) => {
      const named = [...read(path).matchAll(/\bv(\d+\.\d+\.\d+)\b/g)].map(
        (m) => m[1],
      );
      expect(named.length).toBeGreaterThan(0);
      expect(new Set(named)).toEqual(new Set([VERSION]));
    },
  );
});
