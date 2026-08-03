// Runnable quickstart. From the repo root: `pnpm demo`
// (it builds the package, then runs this against the real dist/ artifact).
//
// It shows the whole loop a site uses: register a catalog, classify a raw 429
// into a stable code, render it through your OWN i18next `t`, and serialize it
// to RFC 9457 for the wire.
//
// It starts from `corePack` — the domain-neutral pack, and the one a new
// consumer should reach for. `aiPack` and `bundlePack` are there to compose on
// top when your app actually talks to an LLM provider or downloads an artefact.

import { corePack, defineErrorsWith } from "../dist/index.js";

// 1. Register: the 10 domain-neutral codes + your own, in one registry.
//    `defineErrorsWith` validates the fallback code — `{}` means "use the
//    default, `internal.unknown`", which corePack registers, so it passes.
const errors = defineErrorsWith(
  {},
  {
    ...corePack,
    "shop.out_of_stock": {
      category: "provider",
      params: ["sku"],
      en: "Sorry, {sku} is sold out.",
    },
  },
);

// 2. Classify: a raw 429 from an upstream API reaches a `catch` block.
const raw = { status: 429, message: "Too Many Requests" };
const code = errors.classify(raw); // -> "http.rate_limited"

// 3. Describe: render through your app's i18next. Here a tiny fake `t` stands in
//    for real i18next; a missing key returns the key verbatim, so we fall back
//    to the catalog's default English automatically.
const es = {
  "errors.http.rate_limited":
    "Demasiadas solicitudes. Espera un momento e inténtalo de nuevo.",
};
const t = (key, params) => interpolate(es[key] ?? key, params);

console.log("code:      ", code);
console.log("english:   ", errors.describe(code)); // default English fallback
console.log("spanish:   ", errors.describe(code, {}, t)); // via i18next `t`
console.log(
  "own code:  ",
  errors.describe("shop.out_of_stock", { sku: "A-17" }),
);

// 4. Serialize: the same error on the wire, as RFC 9457 Problem Details.
console.log(
  "problem:   ",
  JSON.stringify(errors.toProblemDetails(code, { retryAfter: 30 })),
);

// 5. The whole 5xx range is claimed, not four hand-picked statuses — a 522 from
//    a CDN lands on a code you can describe, instead of the fallback.
console.log("a 522:     ", errors.classify({ status: 522 }));

function interpolate(template, params = {}) {
  return template.replace(/\{(\w+)\}/g, (m, name) =>
    name in params ? String(params[name]) : m,
  );
}
