// README contract — the portfolio README template, enforced.
//
// The first screen of README.md (title → tagline → badges → hero → "At a
// glance" → "Try it in 60 seconds") is written for a smart non-specialist, and
// it drifts the moment nobody checks it: a tagline edited in the README but not
// in package.json, a fifth badge, a label renamed, a hero caption dropped, a
// relative link to a file that moved. Keep it dumb on purpose: string and regex
// checks only, no markdown parser — it guards the shape, not the prose.
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const README = readFileSync(join(ROOT, "README.md"), "utf8");
const PKG = JSON.parse(readFileSync(join(ROOT, "package.json"), "utf8")) as {
  description: string;
};

const AT_A_GLANCE = "## At a glance";
const TRY_IT = "## Try it in 60 seconds";
const HOW_IT_WORKS = "## How it works";
const LABELS = [
  "**What it does**",
  "**Who it's for**",
  "**What stays on your device / what leaves it**",
  "**Runs on**",
  "**Not for**",
  "**Status**",
];

const at = (needle: string): number => README.indexOf(needle);

/** The tagline: the first non-empty line after the title that is not a badge or comment. */
function tagline(): string | undefined {
  return README.split("\n")
    .slice(1)
    .map((line) => line.trim())
    .find((l) => l !== "" && !l.startsWith("[![") && !l.startsWith("<!--"));
}

/** Every `](target)` link outside fenced code blocks. */
function linkTargets(): string[] {
  const prose = README.replace(/^```[\s\S]*?^```/gm, "");
  return [...prose.matchAll(/\]\(([^)\s]+)(?:\s+"[^"]*")?\)/g)].map(
    (m) => m[1] as string,
  );
}

const isExternal = (target: string): boolean =>
  /^[a-z][a-z0-9+.-]*:/i.test(target) || target.startsWith("#");

describe("README contract", () => {
  it("opens with '# <Name>' and a tagline equal to the package description", () => {
    expect(README.split("\n")[0]).toMatch(/^# \S/);
    const line = tagline();
    expect(line).toBe(PKG.description);
    expect(line?.length ?? 0).toBeLessThanOrEqual(120);
  });

  it("shows at most four badges before 'At a glance'", () => {
    expect(at(AT_A_GLANCE)).toBeGreaterThan(0);
    const badges = README.slice(0, at(AT_A_GLANCE)).split("[![").length - 1;
    expect(badges).toBeLessThanOrEqual(4);
  });

  it("puts every bolded At-a-glance label on the first screen", () => {
    const firstScreen = README.slice(0, at(HOW_IT_WORKS));
    for (const label of LABELS) {
      expect(firstScreen, label).toContain(`- ${label} — `);
    }
  });

  it("orders hero caption, 'Try it in 60 seconds', then 'How it works'", () => {
    const caption = at("Real output of the example below");
    expect(caption).toBeGreaterThan(0);
    expect(at(TRY_IT)).toBeGreaterThan(caption);
    expect(at(HOW_IT_WORKS)).toBeGreaterThan(at(TRY_IT));
  });

  it("links the interactive architecture map, whose source exists", () => {
    expect(README).toMatch(
      /\[\*{0,2}Explore the interactive architecture map[^\]]*\]\(docs\/architecture\/index\.html\)/,
    );
    expect(
      existsSync(join(ROOT, "docs/architecture/runtime.architecture.json")),
    ).toBe(true);
  });

  it("resolves every relative link to a path in the repo", () => {
    const relative = linkTargets().filter((t) => !isExternal(t));
    expect(relative.length).toBeGreaterThan(0);
    const missing = relative.filter((target) => {
      const path = decodeURIComponent(target.split("#")[0] as string);
      return !existsSync(join(dirname(join(ROOT, "README.md")), path));
    });
    expect(missing).toEqual([]);
  });
});
