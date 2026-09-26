# API guide

Everything `@edgeproc/errors` exports, with examples. For how `classify` decides
and why, see [Architecture](ARCHITECTURE.md). All examples run against v0.2.0,
the current version on npm.

## The smallest loop

```ts
import { corePack, defineErrorsWith } from "@edgeproc/errors";

const errors = defineErrorsWith({}, corePack);

// A raw failure from anywhere: fetch, an SDK, a thrown DOMException.
const code = errors.classify({ status: 429, message: "Slow down" });

console.log(code); // "http.rate_limited"
console.log(errors.describe(code)); // "Too many requests. Wait a moment and try again."
```

For the full loop (register, classify, show it in two languages, send it as
JSON), clone the repo and run `pnpm demo`. It builds the package and runs
[`examples/quickstart.mjs`](../examples/quickstart.mjs).

## Add your own codes

```ts
import { corePack, defineErrorsWith } from "@edgeproc/errors";

// Start from the 10 everyday codes and add your own on top.
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

errors.describe("shop.out_of_stock", { sku: "MUG-12" });
// "Sorry, MUG-12 is sold out."
```

Pass packs as separate arguments (`defineErrorsWith({}, corePack, aiPack)`) to
get a startup error if two of them define the same code. Spread them into one
object to get the richest param typing.

## Classify a raw failure where it happens

```ts
try {
  await callApi();
} catch (err) {
  const code = errors.classify(err); // e.g. { status: 429 } -> "http.rate_limited"
  showError(errors.describe(code, {}, t)); // shown through YOUR i18next `t`
}
```

`describe` calls `t("errors.<code>", params)`. If that key is not translated
yet, it falls back to the catalog's English, so a raw key never reaches the
screen. `t` can be anything shaped like `t(key, params)`:

```ts
const es: Record<string, string> = {
  "errors.http.rate_limited": "Demasiadas solicitudes.",
};
const t = (key: string) => es[key] ?? key;

errors.describe("http.rate_limited", {}, t); // "Demasiadas solicitudes."
errors.describe("http.not_found", {}, t); // "That was not found on the server." (English fallback)
```

Set `i18nKey` on a catalog entry to use a different translation key.

## Send it from an API (RFC 9457)

```ts
errors.toProblemDetails("http.rate_limited", { retryAfter: 30 });
// => { retryAfter: 30,
//      type: "http.rate_limited",
//      title: "Too many requests. Wait a moment and try again.",
//      status: 429 }
```

`status` comes from the entry's first `httpStatus`. Pass `{ status }` or
`{ instance }` in the third argument to set them. Params become public fields in
the body, so never pass a secret. Reserved and unsafe names are dropped; the
full list is in [Architecture](ARCHITECTURE.md#the-json-bodys-safety-rules).

## Throw a coded error when you already know the cause

```ts
import { CanonicalError } from "@edgeproc/errors";

// You know what happened, so there is nothing to classify.
throw errors.create("config.missing", { field: "STRIPE_KEY" });

// or without a registry:
new CanonicalError("config.missing", "config", { field: "STRIPE_KEY" });
```

A `CanonicalError` carries `code`, `params`, and `category`. Its `message` is
the code itself (`"config.missing"`), not the English sentence. Call
`errors.describe(err.code, err.params)` when you need the sentence.

## Choose your own fallback code

`classify` returns the fallback code when nothing else matches. It is
`internal.unknown` (exported as `DEFAULT_FALLBACK_CODE`) unless you set one:

```ts
import { defineErrorsWith } from "@edgeproc/errors";

export const errors = defineErrorsWith({ fallbackCode: "shop.unknown" }, shopCodes);

errors.classify({ weird: true }); // "shop.unknown"
```

`defineErrorsWith` checks that the fallback code is in your catalog. If not, it
throws `UnregisteredFallbackError` at startup. This also means `aiPack` on its
own throws, because it does not include `internal.unknown`. The error says so and
names both fixes: add `corePack`, or set a `fallbackCode` that `aiPack` has:

```ts
defineErrorsWith({ fallbackCode: "ai.provider.server_error" }, aiPack);
```

`defineErrors(...fragments)` is the older entry point. It always falls back to
`internal.unknown` and does not check it.

## Rule order and priority

A broad `match` rule registered first can claim failures meant for a later,
more specific rule. `priority` fixes that. It defaults to `0`. Higher runs
earlier, and negative runs last.

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

To write your own `match` rules, use the exported helpers `errorNameOf`,
`errorTextOf`, and `httpStatusOf`. They read those fields from any thrown value
without crashing on odd inputs.

## Categories

`category` is how your UI and telemetry decide what to do: retry, open
settings, free up space. Seven are built in and exported as `KnownCategory`:

`provider` · `config` · `network` · `timeout` · `device` · `integrity` ·
`internal`

You can use any other string too. `Category` is
`KnownCategory | (string & Record<never, never>)`, so the seven still
autocomplete in an editor, and `auth`, `validation`, or `billing` type-check
without patching this library.

```ts
const errors = defineErrorsWith(
  {},
  {
    ...corePack,
    "auth.session_expired": {
      category: "auth", // not one of the seven, still valid
      en: "Your session expired. Sign in again.",
    },
  },
);
```

## Configuration

There are no environment variables and no config files. The only registry-wide
setting is `fallbackCode`, passed as the first argument to `defineErrorsWith`.
Everything else is your catalog.

## Reference

| Export                                         | Kind  | What it does                                                        |
| ---------------------------------------------- | ----- | ------------------------------------------------------------------- |
| `defineErrors`                                 | fn    | Registers one or more catalog fragments and returns a typed `Registry` |
| `defineErrorsWith`                             | fn    | `defineErrors` plus `RegistryOptions` (today: a checked `fallbackCode`) |
| `DEFAULT_FALLBACK_CODE`                        | const | `"internal.unknown"`, the fallback when you set none                |
| `UnregisteredFallbackError`                    | class | Thrown when the `fallbackCode` is not in the catalog                |
| `corePack`                                     | const | 10 everyday codes, the pack to start from                           |
| `aiPack`                                       | const | 9 `ai.*` codes, for apps that call an AI model provider             |
| `bundlePack`                                   | const | 5 `bundle.*` codes, for apps that download a file to the device     |
| `starterPack`                                  | const | The original 18 codes, frozen for the repos that vendor them        |
| `CanonicalError`                               | class | `Error` subclass carrying `{ code, params, category }`              |
| `DuplicateCodeError`                           | class | Thrown when a code is defined in two fragments                      |
| `InvalidCatalogEntryError`                     | class | Thrown when an entry has the wrong shape, e.g. `httpStatus: 408` instead of `[408]` |
| `errorNameOf` / `errorTextOf` / `httpStatusOf` | fn    | Helpers for writing your own `match` rules                          |

`Registry` methods: `classify(raw)`, `describe(code, params?, t?)`,
`toProblemDetails(code, params?, opts?)`, `create(code, params?)`, plus
`codes`, `has`, and `get`.

`CatalogEntry` fields: `category` (required), `en`, `params`, `i18nKey`,
`httpStatus`, `httpStatusRange`, `problemType`, `match`, `priority`.

Types: `Catalog`, `CatalogEntry`, `Category`, `KnownCategory`, `ErrorCode`,
`MatchRule`, `Params`, `ParamsFor`, `ParamValue`, `ProblemDetails`,
`ProblemOptions`, `Registry`, `RegistryOptions`, `TFunction`.
