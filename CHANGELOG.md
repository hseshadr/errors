# Changelog

All notable changes to this project are documented here.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.1.2] - 2026-09-23

### Fixed

- **Prototype-name lookups.** `get`, `describe`, `toProblemDetails`, and
  `create` read the catalog with a plain `map[code]`, so `get("constructor")`
  returned `Object.prototype.constructor` while `has("constructor")` correctly
  said `false`. Every lookup is now own-property only, and the merged catalog
  has a null prototype, so a fragment that registers its own `__proto__` code
  (e.g. from `JSON.parse`) keeps it as an entry instead of rewriting the
  prototype.

### Security

- **Reserved Problem Details members.** `toProblemDetails` spread caller params
  into the RFC 9457 body, so a param named `status`, `detail`, or `instance`
  could appear as that core member (`type` and `title` were already overwritten).
  Params named `type`, `title`, `status`, `detail`, or `instance` are now
  dropped from the body; they still reach `describe` for title interpolation.
  All other params remain public extension members, as now documented. The
  shape of a body built from non-reserved params is unchanged.
- **Hostile param names and values.** A param named `toJSON` was spread into
  the body as a member, so `JSON.stringify` called it and the caller's object
  replaced the whole serialized Problem Details, including all five RFC 9457
  core members. Params from `JSON.parse` could also put `__proto__` (with an
  object value), `constructor`, or `prototype` on the wire. `toProblemDetails`
  now never emits a param named `toJSON`, `__proto__`, `constructor`, or
  `prototype`, and emits a param only when its value is a string or a finite
  number, which is the declared `ParamValue` type. Objects, arrays, booleans,
  `null`, `undefined`, `NaN`, `±Infinity`, bigints (which made
  `JSON.stringify` throw), functions, and symbols are dropped from the body.
  This is a behaviour change only for callers that passed values outside
  `ParamValue`. Symbol-keyed and non-enumerable params were already excluded
  and still are. `describe` still receives every param for title
  interpolation. This matches the filter going into the Python mirror in
  edgeproc-core.
- **Prototype-pollution hardening (defense in depth).** The members of
  catalog entries (`problemType`, `i18nKey`, `en`, `httpStatus`,
  `httpStatusRange`, `match`, `priority`, `category`) and of
  `toProblemDetails` options (`status`, `title`, `instance`) were read through
  the prototype chain. If other code in the process polluted
  `Object.prototype`, those values leaked into `classify`, `describe`,
  `create`, and Problem Details bodies. For example, a polluted `match` claimed
  every raw failure for the first registered code. They are now read as own
  properties only. The raw-failure helpers (`httpStatusOf`, `errorNameOf`,
  `errorTextOf`) still read through the prototype chain on purpose, because a
  fetch `Response` exposes `status` as an inherited getter.
- **Release pipeline no longer exposes the npm publish credential to
  dependency code.** `publish.yml` called ci's reusable `ts-publish.yml`: one
  job held `id-token: write` (the npm OIDC credential) while it ran
  `pnpm install`, the gate, the build, and an unpinned
  `npm install -g npm@latest`. Any `v*` tag on any commit triggered it.
  `publish.yml` (same file name, so the npm trusted publisher still matches) is
  now two local jobs:
  - An unprivileged `build` job (`contents: read`) refuses a tag whose commit
    is not on `main` or whose name is not `v` + the `package.json` version. It
    then runs `pnpm install --frozen-lockfile`, `pnpm gate`, and `pnpm pack`,
    and uploads the tarball with its SHA-256.
  - A `publish` job holds `id-token: write`. It never checks out or installs
    anything. It verifies the checksum and publishes that exact tarball with
    `npm publish --provenance --access public`, using the npm bundled with a
    pinned Node 24.21.0 (npm 11.19.0; the job asserts the OIDC floor of
    11.5.1).

  `test/workflow-security.test.ts` now fails the gate if this split, the
  tag checks, or the no-`${{ }}`-in-shell rule regress, or if any workflow
  uses `@latest`.

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
