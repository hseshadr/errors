# Changelog

All notable changes to this project are documented here.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- Initial `@edgeproc/errors` glue over two standards — **i18next** (descriptions)
  and **RFC 9457 Problem Details** (wire shape). Zero runtime dependencies.
- `defineErrors(...fragments)` → a typed per-app `Registry`. Duplicate codes
  across fragments throw `DuplicateCodeError`.
- `registry.classify(raw)` — a small rule engine (duck-typed `.status` / `.name`
  / `.message` / `.body`, registered `httpStatus` + `match` predicates, fallback
  `internal.unknown`), pre-loaded with the AlmaMesh-proven HTTP + name mappings.
- `registry.describe(code, params, t)` — resolves `errors.<code>` via a
  consumer-provided i18next `t`, falling back to the catalog default English.
- `registry.toProblemDetails(code, params, opts)` — RFC 9457 shape.
- `registry.create(code, params)` and the `CanonicalError` class for throw-sites.
- `starterPack` — the 18 universal codes transcribed from `errors-registry.json`.

### Roadmap (deferred — not shipped in 0.1.0)

- Publish to npm vs. vendor (match the private-until-tested release convention).
- Optional `neverthrow` `Result` channel carrying a classified code.
- Parity test against the Python `shared_libs_python.errors` surface.

## License

MIT.
