// README contract: the plain-English README, enforced.
//
// The README is written for a developer who has never heard of this package.
// It drifts the moment nobody checks it: a tagline edited in the README but not
// in package.json, a section moved, a pasted output that no longer matches the
// code, internal jargon creeping back in, a link to a file that moved. Keep it
// dumb on purpose: string and regex checks only, no markdown parser.
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { afterEach, describe, expect, it, vi } from "vitest";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const README = readFileSync(join(ROOT, "README.md"), "utf8");
const PKG = JSON.parse(readFileSync(join(ROOT, "package.json"), "utf8")) as {
  description: string;
};

const TITLE = "# @edgeproc/errors";
const INSTALL_LINE = "**`npm install @edgeproc/errors`**";
const TECH_DOCS = "**Technical docs:**";
const ARCHITECTURE = "docs/ARCHITECTURE.md";
const GETTING_STARTED = "docs/GETTING_STARTED.md";

/** The sections, in the order a reader meets them. */
const SECTIONS = [
  "## Try it",
  "## How it works",
  "## What it does not do",
  "## When to use something else",
  "## Install",
  "## Develop",
  "## More detail",
  "## License",
];

/**
 * Internal vocabulary, hype, and the old template's headings. Matched as whole
 * words, case-insensitive, in prose only: code blocks and inline code are
 * stripped first, so the real command `pnpm gate` is still allowed.
 */
const BANNED = [
  "northstar",
  "seam",
  "lego",
  "trust envelope",
  "receipt",
  "fail-closed",
  "fails closed",
  "gate",
  "fleet",
  "portfolio",
  "production-ready",
  "robust",
  "blazing",
  "enterprise-grade",
  "seamless",
  "at a glance",
  "try it in 60 seconds",
  "below the fold",
];

const at = (needle: string): number => README.indexOf(needle);

/** Text of one `## ` section, up to the next `## ` heading. */
function section(heading: string): string {
  const start = at(`${heading}\n`);
  if (start < 0) throw new Error(`README has no "${heading}" section`);
  const next = README.indexOf("\n## ", start + heading.length);
  return README.slice(start, next < 0 ? undefined : next);
}

/** README with fenced code blocks and inline code removed. */
function prose(): string {
  return README.replace(/^```[\s\S]*?^```/gm, "").replace(/`[^`\n]*`/g, "");
}

/** Every `](target)` link outside fenced code blocks. */
function linkTargets(): string[] {
  const text = README.replace(/^```[\s\S]*?^```/gm, "");
  return [...text.matchAll(/\]\(([^)\s]+)(?:\s+"[^"]*")?\)/g)].map(
    (m) => m[1] as string,
  );
}

/** The contents of the first ```lang fenced block inside `text`. */
function fenced(text: string, lang: string): string {
  const found = text.match(
    new RegExp(`^\`\`\`${lang}\\n([\\s\\S]*?)^\`\`\``, "m"),
  );
  if (!found?.[1]) throw new Error(`no \`\`\`${lang} block found`);
  return found[1];
}

const isExternal = (target: string): boolean =>
  /^[a-z][a-z0-9+.-]*:/i.test(target) || target.startsWith("#");

describe("README contract", () => {
  it("opens with the name and a one-line tagline equal to the package description", () => {
    const lines = README.split("\n");
    expect(lines[0]).toBe(TITLE);
    expect(lines[1]).toBe("");
    expect(lines[2]).toBe(PKG.description);
    expect(PKG.description.length).toBeLessThanOrEqual(140);
  });

  it("puts the one install line, in bold, right under the tagline", () => {
    const lines = README.split("\n");
    expect(lines[4]?.startsWith(INSTALL_LINE)).toBe(true);
  });

  it("keeps at most three badges (CI, license, version)", () => {
    expect(README.split("[![").length - 1).toBeLessThanOrEqual(3);
  });

  it("links the technical docs, including Getting started, before 'Try it'", () => {
    const line = README.split("\n").find((l) => l.startsWith(TECH_DOCS));
    expect(line).toBeDefined();
    expect(at(TECH_DOCS)).toBeLessThan(at("## Try it\n"));
    expect(line).toContain(`](${ARCHITECTURE})`);
    expect(line).toContain(`](${GETTING_STARTED})`);
  });

  it("has every section, in the agreed order", () => {
    const positions = SECTIONS.map((heading) => at(`${heading}\n`));
    for (const [i, heading] of SECTIONS.entries()) {
      expect(positions[i], heading).toBeGreaterThan(0);
    }
    expect(positions).toEqual([...positions].sort((a, b) => a - b));
  });

  it("links Getting started from the Develop section", () => {
    expect(section("## Develop")).toContain(`](${GETTING_STARTED})`);
  });

  it("says who it is for, the problem, and the honest limits in plain words", () => {
    expect(README).toContain("JavaScript or TypeScript");
    expect(README).toContain("does not log, retry, or report errors");
    const limits = section("## What it does not do");
    expect(limits).toContain("escape");
    expect(limits).toContain("Node");
  });

  it("links every technical doc under 'More detail'", () => {
    const more = section("## More detail");
    for (const doc of [
      ARCHITECTURE,
      GETTING_STARTED,
      "docs/API.md",
      "SECURITY.md",
      "CHANGELOG.md",
      "CONTRIBUTING.md",
      "docs/architecture/index.html",
    ]) {
      expect(more, doc).toContain(`](${doc})`);
    }
  });

  it("uses no internal jargon, hype, or old-template headings", () => {
    const text = prose().toLowerCase();
    const found = BANNED.filter((word) =>
      new RegExp(`(^|[^a-z-])${word}($|[^a-z-])`).test(text),
    );
    expect(found).toEqual([]);
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

describe("README 'Try it' shows real code and its real output", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("quotes examples/try.mjs exactly", () => {
    const code = fenced(section("## Try it"), "js");
    expect(code).toBe(readFileSync(join(ROOT, "examples/try.mjs"), "utf8"));
  });

  it("pastes exactly what examples/try.mjs prints", async () => {
    const printed: string[] = [];
    vi.spyOn(console, "log").mockImplementation((...args: unknown[]) => {
      printed.push(args.join(" "));
    });
    // vitest.config.ts aliases "@edgeproc/errors" to src/, so this runs the
    // example file against the code in this commit.
    const example = pathToFileURL(join(ROOT, "examples/try.mjs")).href;
    await import(/* @vite-ignore */ example);
    expect(fenced(section("## Try it"), "text")).toBe(
      `${printed.join("\n")}\n`,
    );
  });
});
