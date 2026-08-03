# Changelog

All notable changes to this project are documented here.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.1.0] - 2026-08-02

First public release.

### Added

- Initial `@edgeproc/errors` glue over two standards — **i18next** (descriptions)
  and **RFC 9457 Problem Details** (wire shape). Zero runtime dependencies, zero
  peer dependencies.
- `defineErrors(...fragments)` → a typed per-app `Registry`. Duplicate codes
  across fragments throw `DuplicateCodeError`.
- `defineErrorsWith(options, ...fragments)` — the same, with registry-wide
  options in front. Today that is `fallbackCode`: the code `classify` returns
  when nothing else claims a raw failure. It is **validated** — a fallback the
  catalog does not register throws `UnregisteredFallbackError` at registration
  instead of shipping a code your own registry does not contain onto the wire.
  `DEFAULT_FALLBACK_CODE` (`"internal.unknown"`) is the default.
- `registry.classify(raw)` — a small rule engine over duck-typed `.status` /
  `.name` / `.message` / `.body`. Precedence: `match` predicates (by `priority`,
  then registration order) → the exact `httpStatus` table → `httpStatusRange` →
  the fallback.
- `registry.describe(code, params, t)` — resolves `errors.<code>` via a
  consumer-provided i18next `t`, falling back to the catalog default English.
- `registry.toProblemDetails(code, params, opts)` — RFC 9457 shape.
- `registry.create(code, params)` and the `CanonicalError` class for throw-sites.
- `CatalogEntry.priority` — order among `match` predicates, higher first,
  default `0` (registration order). The escape hatch from the spread trap where
  a pack's broad `/timeout/i` rule claims a raw failure before your own specific
  rule ever runs.
- `CatalogEntry.httpStatusRange` — an inclusive `[min, max]` status range, so
  `[500, 599]` covers 501 / 507 / 522 / 599 instead of letting them fall through
  to the fallback. Consulted only after the exact `httpStatus` table.
- Three composable packs: `corePack` (10 domain-neutral codes — the one a new
  consumer should start from), `aiPack` (9 `ai.*` codes, only if you talk to an
  LLM provider), and `bundlePack` (5 `bundle.*` codes, only if you ship a
  downloadable artefact).
- `starterPack` — the original 18 codes, unchanged. Frozen for the repos that
  already vendor a byte-identical copy; new work should reach for the three
  packs above.
- `KnownCategory` (the seven categories shipped here) exported alongside
  `Category`, which is now open: a consumer can use `auth`, `validation` or
  `billing` without patching this library, and the known members still
  autocomplete.
- CI pins every GitHub Action to a full commit SHA, and
  `test/workflow-security.test.ts` fails the gate if one is ever unpinned or a
  workflow grants a top-level write scope.
- `.github/workflows/publish.yml` — npm release via OIDC Trusted Publishing on a
  `v*` tag push. No npm write token in this repo.

## License

MIT.
