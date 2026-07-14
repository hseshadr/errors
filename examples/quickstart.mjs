// Runnable quickstart. From the repo root: `pnpm demo`
// (it builds the package, then runs this against the real dist/ artifact).
//
// It shows the whole loop a site uses: register a catalog, classify a raw 402
// into a stable code, render it through your OWN i18next `t`, and serialize it
// to RFC 9457 for the wire.

import { defineErrors, starterPack } from "../dist/index.js";

// 1. Register: the 18 universal codes + your own domain code, in one registry.
const errors = defineErrors({
  ...starterPack,
  "shop.out_of_stock": {
    category: "provider",
    params: ["sku"],
    en: "Sorry, {sku} is sold out.",
  },
});

// 2. Classify: a raw OpenRouter 402 reaches a `catch` block.
const raw = { status: 402, message: "Insufficient credits" };
const code = errors.classify(raw); // -> "ai.provider.out_of_credits"

// 3. Describe: render through your app's i18next. Here a tiny fake `t` stands in
//    for real i18next; a missing key returns the key verbatim, so we fall back
//    to the catalog's default English automatically.
const es = {
  "errors.ai.provider.out_of_credits":
    "Tu cuenta no tiene créditos. Añade créditos e inténtalo de nuevo.",
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
  JSON.stringify(
    errors.toProblemDetails(code, { creditsLeft: 0, currency: "USD" }),
  ),
);

function interpolate(template, params = {}) {
  return template.replace(/\{(\w+)\}/g, (m, name) =>
    name in params ? String(params[name]) : m,
  );
}
