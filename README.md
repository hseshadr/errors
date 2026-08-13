# @edgeproc/errors

**One error system for a whole app.** Every failure gets a stable **code**, one
`classify()` turns raw failures (an HTTP 402, a thrown `AbortError`, a dead
network) into that code, and your app renders it through its own translations.
No more the-same-402-says-three-different-things.

It is thin glue over two mature standards, not a new framework:

- **[i18next](https://www.i18next.com/)** owns the human descriptions. You hand
  `describe()` your own `t` function. This package never imports i18next, so
  i18next is not a dependency of any kind — anything shaped like
  `t(key, params)` works, including a five-line stand-in.
- **[RFC 9457 Problem Details](https://www.rfc-editor.org/rfc/rfc9457)** owns the
  wire shape.

Zero dependencies: no runtime deps, no peer deps. The only new code is ~200
lines: register a catalog, and classify a raw failure into a code.

## The problem, in one line

The same HTTP `402` becomes _"out of credits"_ in Settings and a misleading
_"check your model and endpoint"_ in chat, because each `catch` block
re-invents the message. This collapses that N-way drift to one answer.

## Install

```bash
pnpm add @edgeproc/errors    # or: npm i @edgeproc/errors
```

Needs Node >= 22.13. Nothing to configure.

## Quickstart

Paste this into a file and run it:

```ts
import { corePack, defineErrorsWith } from "@edgeproc/errors";

const errors = defineErrorsWith({}, { ...corePack });

// A raw failure from anywhere — fetch, an SDK, a thrown DOMException.
const code = errors.classify({ status: 429, message: "Slow down" });

console.log(code);
// "http.rate_limited"

console.log(errors.describe(code));
// "Too many requests. Wait a moment and try again."
```

That is the whole idea: one raw failure in, one stable code out, one description
your app can translate.

Want the full loop — register, classify, render in two languages, serialize to
RFC 9457? Clone this repo and run the demo:

```bash
pnpm install && pnpm demo   # builds, then runs examples/quickstart.mjs
```

## Scope and limits

Shipped today: a zero-runtime-dependency catalog, classifier, description helper, and
RFC 9457 serializer. It does not log, retry, or report errors for you; your application
owns those policies and supplies its own translation function. It also cannot infer a
business-specific cause unless your catalog declares the matching rule.

There is no hosted service or hidden global registry. No roadmap feature is implied by
the interfaces in this package; future behavior belongs in the changelog before it is
documented as available.

## Which pack should you start from?

The package ships four catalogs. They are optional starting points, not a
mandate — you can also declare every code yourself and import none of them.

| Pack          | Codes | Take it when                                                                 |
| ------------- | ----- | ---------------------------------------------------------------------------- |
| `corePack`    | 10    | **Almost always. Start here.** Domain-neutral `http.*` / `net.*` / `request.*` / `config.*` / `internal.unknown`. |
| `aiPack`      | 9     | Your app calls an LLM provider. Adds `ai.*` — no key, rejected key, out of credits, rate limited, model unavailable. |
| `bundlePack`  | 5     | Your app downloads and verifies an artefact on the device (a WASM engine, a model, a screening list). Adds `bundle.*`. |
| `starterPack` | 18    | You are one of the repos already vendoring this library. New code should not reach for it — see below. |

Compose the halves you actually need:

```ts
import { aiPack, corePack, defineErrorsWith } from "@edgeproc/errors";

// Separate fragments, so a duplicate code across them throws at startup.
export const errors = defineErrorsWith({}, corePack, aiPack);
```

**`starterPack` is unchanged and still exported.** Same 18 codes, same English
byte-for-byte, same rule order — three product repos vendor a byte-identical
copy of this library and build their catalogs out of it, so it is frozen on
purpose. It is also, honestly, an AI/WASM catalog wearing a generic name: 14 of
its 18 codes are `ai.*` or `bundle.*`, three of them name another app's
"Settings → AI" screen in the English, and `ai.privacy.violation` carries a
`match` rule that string-matches `"PrivacyViolationError"` — a hard coupling to
`@edgeproc/privacy-core`. Starting a new shop from `starterPack` inherits an AI
provider catalog you never asked for. Use `corePack`.

### Register your errors

```ts
import { corePack, defineErrorsWith } from "@edgeproc/errors";

// Start from the 10 domain-neutral codes, add your own on top.
export const errors = defineErrorsWith(
  {},
  {
    ...corePack,
    "shop.out_of_stock": {
      category: "provider",
      params: ["sku"], // the typed contract for this code's params
      en: "Sorry, {sku} is sold out.",
    },
  },
);
```

### Classify a raw failure at the boundary

```ts
try {
  await callApi();
} catch (err) {
  const code = errors.classify(err); // e.g. { status: 429 } -> "http.rate_limited"
  showError(errors.describe(code, {}, t)); // render via YOUR i18next `t`
}
```

`describe` calls your app's i18next `t("errors.<code>", params)`. If that key
isn't localized yet, it falls back to the catalog's default English — so you're
never stuck with a raw key on screen.

### Serialize it for an API (RFC 9457)

```ts
// A Python/Node backend can emit the identical shape:
errors.toProblemDetails("http.rate_limited", { retryAfter: 30 });
// => { type: "http.rate_limited",
//      title: "Too many requests. Wait a moment and try again.",
//      status: 429, retryAfter: 30 }
```

`status` comes from the entry's first registered `httpStatus`; pass
`{ status }` in the third argument to override it.

### Throw a coded error when you already know the cause

```ts
import { CanonicalError } from "@edgeproc/errors";

// At a throw-site, where no classification is needed — you know what happened:
throw errors.create("config.missing", { field: "STRIPE_KEY" });
// or standalone: new CanonicalError("config.missing", "config", { field: "..." })
```

## What `classify` knows out of the box

`classify` duck-types the raw failure (`.status`, `.name`, `.message`/`.body`)
and runs the rules **registered by the packs you actually composed**. Nothing is
global — a mapping only exists if a code in your catalog declared it.

**`corePack`:**

| Raw failure                      | Code                |
| -------------------------------- | ------------------- |
| `status: 401` / `403`            | `http.unauthorized` |
| `status: 404`                    | `http.not_found`    |
| `status: 429`                    | `http.rate_limited` |
| any `status` in `500–599`        | `http.server_error` |
| `name: "AbortError"` / timed out | `request.timeout`   |
| `"Failed to fetch"` (no status)  | `net.unreachable`   |
| _(anything else)_                | the fallback code   |

**`aiPack`** (compose on top of `corePack`; the code that registers a status
first wins, so `corePack`'s `http.*` keeps the shared statuses when you spread
`corePack` first):

| Raw failure               | Code                         |
| ------------------------- | ---------------------------- |
| `status: 402`             | `ai.provider.out_of_credits` |
| `status: 401` / `403`     | `ai.provider.unauthorized`   |
| `status: 404`             | `ai.model.unavailable`       |
| `status: 429`             | `ai.provider.rate_limited`   |
| any `status` in `500–599` | `ai.provider.server_error`   |
| timed out / aborted       | `ai.request.timeout`         |

`aiPack`'s `ai.privacy.violation` ships **no** `match` rule — the old one
string-matched the error name `"PrivacyViolationError"`, which coupled the
catalog to one specific egress guard. Attach your own predicate for whatever
yours throws.

**`bundlePack`** registers no statuses and no predicates at all. Its five codes
are for throw-sites you reach deliberately (`errors.create("bundle.quota_exceeded",
{ requiredBytes })`), not for classifying an unknown failure.

**`starterPack`** keeps its original table: `401`/`403` →
`ai.provider.unauthorized`, `402` → `ai.provider.out_of_credits`, `404` →
`ai.model.unavailable`, `429` → `ai.provider.rate_limited`, `AbortError` →
`ai.request.timeout`, `"Failed to fetch"` → `net.unreachable`,
`PrivacyViolationError` → `ai.privacy.violation`.

Its 5xx mapping is **exactly four statuses** — `500`, `502`, `503`, `504`. A
`501`, `507`, `522` or `599` falls through to the fallback. That is deliberate,
frozen, and asserted by a test, because the vendored consumers ship that
behaviour today. `corePack.http.server_error` and `aiPack.ai.provider.server_error`
both claim the **whole** `[500, 599]` range instead, via `httpStatusRange`.

Your catalog extends whichever pack you took: any entry's `httpStatus`,
`httpStatusRange` or `match` predicate joins the same rule engine.

## How `classify` picks a code

Four tiers, in this order. The first one that produces a code wins.

1. **`match` predicates** — highest `priority` first, registration order within a
   tie.
2. **The exact `httpStatus` table** — the first code registered for a status
   keeps it, so a code cannot be silently stolen by a later fragment.
3. **`httpStatusRange`** — an inclusive `[min, max]`, in registration order.
   Consulted only after the exact table, so a code that names `500` still beats a
   range that merely covers it.
4. **The fallback code** — `internal.unknown` unless you configured another.

### `priority`: the escape hatch from the spread trap

`match` predicates are ordinary functions, and a broad one is greedy.
`{ ...somePack, ...ownCodes }` puts the pack's rules **first**, so a broad
`/timeout|timed out/i` rule claims `"db timeout after 30s"` before your own
`db.query.timeout` rule ever runs.

`priority` fixes the order without reordering the object. It defaults to `0`,
which is plain registration order; higher runs earlier, and negative runs last.

```ts
const errors = defineErrorsWith(
  {},
  {
    ...corePack,
    "db.query.timeout": {
      category: "timeout",
      priority: 10, // beats any default-priority rule, wherever it was registered
      match: (raw) => /db .*timeout/i.test(String((raw as Error)?.message ?? "")),
      en: "The database query timed out.",
    },
  },
);
```

`corePack` marks its own two text-sniffing rules (`request.timeout`,
`net.unreachable`) `priority: -10`, so they run behind every default-priority
rule — including yours. You get the safety net without the theft.

## Choose your own fallback code

`defineErrorsWith(options, ...fragments)` is `defineErrors` with registry-wide
settings in front. Today there is one: `fallbackCode`, the code `classify`
returns when nothing else claims the raw failure.

```ts
import { defineErrorsWith } from "@edgeproc/errors";

export const errors = defineErrorsWith(
  { fallbackCode: "shop.unknown" },
  shopCodes,
);

errors.classify({ weird: true }); // "shop.unknown", not "internal.unknown"
```

**Why this exists.** The fallback used to be hardcoded to `internal.unknown`. A
consumer with their own catalog that never declared that code still got it back
from `classify` — a code their registry did not contain. `has()` said false,
`get()` returned `undefined`, `describe()` echoed the bare key instead of a
sentence, and `toProblemDetails()` put that bare key on the wire as both `type`
and `title`. The one error a user sees when everything else has already gone
wrong was the one error the system could not describe.

`defineErrorsWith` therefore **validates** the fallback: it must be a code the
merged catalog registers, or it throws `UnregisteredFallbackError` at
registration, naming the offending code. Opting into options is opting into the
check. `DEFAULT_FALLBACK_CODE` is exported if you want to name the default
explicitly.

`defineErrors` keeps its old, lenient behaviour unchanged: fallback
`internal.unknown`, no validation. Nothing that already calls it has to move.

## Categories are open

`category` is how UI and telemetry decide the treatment — retry, or "open
Settings", or "free up space". This library ships seven, exported as
`KnownCategory`:

`provider` · `config` · `network` · `timeout` · `device` · `integrity` ·
`internal`

`Category` is `KnownCategory | (string & Record<never, never>)`, which is the
TypeScript idiom for "open union with suggestions". The seven still autocomplete
in an editor, and `auth`, `validation` or `billing` type-check without you
patching or forking this library.

```ts
const errors = defineErrorsWith(
  {},
  {
    ...corePack,
    "auth.session_expired": {
      category: "auth", // not one of the seven — still valid
      en: "Your session expired. Sign in again.",
    },
  },
);
```

## API

| Export                                         | Kind  | Role                                                                   |
| ---------------------------------------------- | ----- | ---------------------------------------------------------------------- |
| `defineErrors`                                 | fn    | register one/more catalog fragments → a typed `Registry`               |
| `defineErrorsWith`                             | fn    | `defineErrors` + `RegistryOptions` (today: a validated `fallbackCode`)  |
| `DEFAULT_FALLBACK_CODE`                        | const | `"internal.unknown"` — the fallback when you configure none            |
| `UnregisteredFallbackError`                    | class | thrown when the configured `fallbackCode` is not in the catalog        |
| `corePack`                                     | const | 10 domain-neutral codes — **the pack to start from**                   |
| `aiPack`                                       | const | 9 `ai.*` codes, for apps that call an LLM provider                     |
| `bundlePack`                                   | const | 5 `bundle.*` codes, for apps that download an artefact                 |
| `starterPack`                                  | const | the original 18 codes, frozen for the repos that vendor them           |
| `CanonicalError`                               | class | `Error` subclass carrying `{ code, params, category }`                 |
| `DuplicateCodeError`                           | class | thrown when a code is defined in two fragments                         |
| `errorNameOf` / `errorTextOf` / `httpStatusOf` | fn    | duck-type helpers for writing your own `match` rules                   |

`Registry` methods: `classify(raw)`, `describe(code, params?, t?)`,
`toProblemDetails(code, params?, opts?)`, `create(code, params?)`, plus
`codes` / `has` / `get`.

`CatalogEntry` fields: `category` (required), `en`, `params`, `i18nKey`,
`httpStatus`, `httpStatusRange`, `problemType`, `match`, `priority`.

Types: `Catalog`, `CatalogEntry`, `Category`, `KnownCategory`, `ErrorCode`,
`MatchRule`, `Params`, `ParamsFor`, `ParamValue`, `ProblemDetails`,
`ProblemOptions`, `Registry`, `RegistryOptions`, `TFunction`.

## Under the hood (for the expert reader)

- **The code is the identity.** `<domain>.<subject>.<reason>`, greppable and
  loggable. A shipped code is a stable API contract — deprecate, never rename.
- **The catalog entry is the typed params contract.** `params: ["retryAfter"]`
  is what makes `describe(code, { retryAfter })` type-check; there's no reliance
  on i18next's own type inference, keeping coupling low.
- **Two ways to register.** A single spread object
  (`defineErrorsWith({}, { ...corePack, ...own })`) gives the richest param
  typing; separate fragments (`defineErrorsWith({}, corePack, own)`) add runtime
  duplicate-code detection across them.
- **Classify precedence.** `match` predicates (by `priority`, then registration
  order), then the exact `httpStatus` table (first registration wins — codes stay
  stable), then `httpStatusRange`, then the fallback code.
- **RFC 9457 caveat.** Problem Details is literally "for HTTP APIs"; on the
  client we adopt its _shape_ as a clean envelope. The real payoff is a backend
  emitting it verbatim.

A full runnable walkthrough — register, classify, translate, serialize — lives in
[`examples/quickstart.mjs`](./examples/quickstart.mjs).

## Develop

```bash
pnpm gate   # lint (biome) + typecheck (tsc) + test (vitest) + build
```

`pnpm gate` is the exact command CI runs. Coverage is enforced at 100% of
statements, branches, functions and lines — see
[`vitest.config.ts`](./vitest.config.ts).

Installs use a 24-hour quarantine for new package releases and a native-build
allowlist limited to Biome and esbuild. CI, the weekly audit, and publishing all
use those same pnpm controls; no workflow can bypass them.

See [CONTRIBUTING.md](./CONTRIBUTING.md) to send a change, and
[SECURITY.md](./SECURITY.md) to report a vulnerability.

## License

MIT.
