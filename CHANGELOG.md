# Changelog

All notable changes to this project are documented here.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.1.1] - 2026-08-03

**The code is byte-identical to 0.1.0. Nothing was added, fixed, or removed.**
What changes is where the artifact came from, and that is the entire point of
this release.

0.1.0 was published by hand from a laptop, so it carries **no provenance
attestation** — nothing cryptographically ties that tarball to this repository
or to the commit it was built from. That was unavoidable rather than careless:
npm has no "pending publisher" state, so a package name must already exist
before a trusted publisher can attach to it. The first publish of any name
therefore cannot use OIDC. And a published version is immutable, so 0.1.0
cannot be re-published later to add provenance.

0.1.1 is the first release through the trusted-publisher rail
(`hseshadr/errors` → `publish.yml`, registered 2026-08-03). It is signed into
npm's transparency log by GitHub's OIDC token, with no credential stored in this
repository.

**Why a patch and not a minor.** No capability shipped, so a minor bump would
overstate it. More usefully, consumers already on `^0.1.0` pick this up on their
next install with no code change — `^0.1.0` resolves `>=0.1.1 <0.2.0` — which is
exactly the propagation an attested build wants. A 0.2.0 would have required a
manual bump in three repositories to deliver nothing but metadata.

Verify it yourself:

```sh
npm view @edgeproc/errors@0.1.1 dist.attestations
```

That must print a `predicateType` of `https://slsa.dev/provenance/v1`. It prints
empty **and exits 0** when provenance is absent, so read the value, not the exit
code.

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
