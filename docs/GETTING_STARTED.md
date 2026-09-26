# Getting started for developers

From zero to a passing local build and your first change. Every command below
was run from a fresh clone on macOS with Node 24.16.0 and pnpm 11.5.0 on
2026-09-25. The times are what it took there.

## 1. What you need

- **Node 22.13 or newer.** CI uses Node 24, so Node 24 is the safest choice. With
  [nvm](https://github.com/nvm-sh/nvm): `nvm install 24 && nvm use 24`.
- **pnpm 11.5.0.** You do not install it by hand. `corepack` (it ships with Node)
  reads the version from `package.json` (`"packageManager": "pnpm@11.5.0"`).
- **git.** Nothing else: no database, no Docker, no API keys.

Known trap: on a machine where `node` is Node 26 but `corepack` is an older
global install, every `pnpm` command crashes with
`ERR_VM_DYNAMIC_IMPORT_CALLBACK_MISSING` before doing anything. Switching to
Node 24 (`nvm use 24`, then `corepack enable` again) fixed it for us.

## 2. Clone, install, and run the tests

```bash
git clone https://github.com/hseshadr/errors.git && cd errors   # ~1.5s
corepack enable                                                  # ~0.2s
pnpm install                                                     # ~1.5s with a warm pnpm cache
pnpm gate                                                        # 6-16s
```

Success looks like this at the end of `pnpm gate`:

```text
 Test Files  17 passed (17)
      Tests  237 passed (237)
...
Statements   : 100% ( 138/138 )
Branches     : 100% ( 100/100 )
Functions    : 100% ( 31/31 )
Lines        : 100% ( 118/118 )
...
$ tsc -p tsconfig.build.json
```

and an exit code of 0. The last step writes the build to `dist/`.

To see the library do something, run the demo (~1.5s). It builds the package
and runs [`examples/quickstart.mjs`](../examples/quickstart.mjs):

```bash
pnpm demo
```

```text
code:       http.rate_limited
english:    Too many requests. Wait a moment and try again.
spanish:    Demasiadas solicitudes. Espera un momento e inténtalo de nuevo.
own code:   Sorry, A-17 is sold out.
problem:    {"retryAfter":30,"type":"http.rate_limited","title":"Too many requests. Wait a moment and try again.","status":429}
a 522:      http.server_error
```

## 3. The one command CI runs

```bash
pnpm gate
```

It runs, in order: `pnpm lint` (Biome), `pnpm typecheck` (tsc), `pnpm test`
(Vitest with coverage), and `pnpm build`. CI runs exactly this on Node 24 after
`pnpm install --frozen-lockfile`, plus a secret scan. It took 6 to 16 seconds on our runs.
Coverage must stay at 100% of statements, branches, functions, and lines, or
the test step fails.

Installs use a 24-hour quarantine for new package releases
(`minimumReleaseAge: 1440` in `pnpm-workspace.yaml`) and a native-build
allowlist limited to Biome and esbuild. So a dependency version published less
than a day ago will refuse to install. That is on purpose: it gives the registry
time to pull a compromised release. CI, the weekly audit, and publishing all use
the same settings.

## 4. Map of the code

| Path | What it is |
| --- | --- |
| `src/registry.ts` | The core: `defineErrors` / `defineErrorsWith`, and the `classify`, `describe`, `toProblemDetails`, and `create` methods. |
| `src/starter-pack.ts` | The ready-made code lists: `corePack`, `aiPack`, `bundlePack`, `starterPack`. |
| `src/raw.ts` | Helpers that safely read `.status`, `.name`, and message text from any thrown value. |
| `src/canonical-error.ts` | `CanonicalError`, the error class `create` returns. |
| `src/types.ts` | All public types. |
| `src/index.ts` | The public export list. A new export must be added here. |
| `test/` | One Vitest file per behaviour. `readme.contract.test.ts` checks the README, including that its example output is real. |
| `examples/` | Runnable scripts. `try.mjs` is the README example. |
| `docs/` | [Architecture](ARCHITECTURE.md), the [API guide](API.md), this guide, and the interactive architecture map. |
| `.github/workflows/` | `ci.yml` (runs `pnpm gate`), `publish.yml` (npm release with provenance), `security-audit.yml` (weekly). |

## 5. Make your first change

A typical small change: teach `corePack` a new rule, or add a code. Say you want
`corePack` to map HTTP `408 Request Timeout` to `request.timeout`.

1. Branch off `main`:

   ```bash
   git switch -c feat/408-is-a-timeout
   ```

2. Write the failing test first, at the end of `test/packs.test.ts` (it already
   imports `corePack` and `defineErrorsWith`):

   ```ts
   describe("corePack and HTTP 408", () => {
     it("maps 408 to request.timeout", () => {
       const errors = defineErrorsWith({}, corePack);
       expect(errors.classify({ status: 408 })).toBe("request.timeout");
     });
   });
   ```

3. Run just that file and watch it fail for the right reason (~1s):

   ```bash
   pnpm exec vitest run test/packs.test.ts
   ```

   ```text
   AssertionError: expected 'internal.unknown' to be 'request.timeout'
   ```

4. Make it pass: in `src/starter-pack.ts`, add `httpStatus: [408],` to the
   `request.timeout` entry of `corePack`. `httpStatus` is a list, so a plain
   `408` would crash every registry that uses `corePack`. Run the file again
   and it passes.

5. Run `pnpm gate` (one more test than before). If a test that pins pack
   contents fails (for example `test/pack-code-sets.test.ts`, or the frozen
   `starterPack` tests), read it before changing it. Those tests exist because other apps depend on that exact
   behaviour. `starterPack` must never change.

6. Add a line to `CHANGELOG.md` under `[Unreleased]`.

`pnpm test:watch` gives you a fast loop while you work, and `pnpm lint:fix`
fixes formatting.

## 6. Open a pull request

- Name the branch for the change: `feat/...`, `fix/...`, or `docs/...`.
- Push and open a PR against `main`. CI runs two checks: the secret scan
  (gitleaks over the full history) and `pnpm gate` on Node 24. Both must pass.
- Reviewers look for: a test that fails without your change, 100% coverage
  kept, no renamed error codes (deprecate and add a new one instead), no new
  runtime dependency, and no new export without a real caller. See
  [CONTRIBUTING.md](../CONTRIBUTING.md).
- Do not bump the version or publish. Releases are cut separately.
