import { errorNameOf, errorTextOf, httpStatusOf } from "./raw.js";
import type { Catalog } from "./types.js";

const NETWORK_TEXT = /failed to fetch|load failed|networkerror/i;
const TIMEOUT_TEXT = /timeout|timed out/i;

/**
 * How broad a text-sniffing rule is allowed to be. `/timeout|timed out/i` and
 * `/failed to fetch/i` are last-resort heuristics, not evidence, so they run
 * BEHIND every default-priority rule — including a consumer's own. Without this,
 * `{ ...corePack, ...ownCodes }` would let the broad rule claim
 * `"db timeout after 30s"` before `db.query.timeout` ever ran.
 */
const BROAD = -10;

/** True for an aborted or timed-out request, however it was reported. */
const isTimeoutFailure = (raw: unknown): boolean => {
  const name = errorNameOf(raw);
  if (name === "AbortError" || name === "TimeoutError") return true;
  return TIMEOUT_TEXT.test(errorTextOf(raw));
};

/** True for a transport failure that never got as far as an HTTP status. */
const isUnreachableFailure = (raw: unknown): boolean =>
  httpStatusOf(raw) === undefined && NETWORK_TEXT.test(errorTextOf(raw));

/**
 * The 18 universal error codes (`ai.*`, `net.*`, `bundle.*`, `config.*`,
 * `internal`), transcribed from `errors-registry.json`. It is an OPTIONAL
 * starter pack, not a mandate: a site may `defineErrors({ ...starterPack,
 * ...ownCodes })` to avoid re-declaring the common ones, then add its own.
 *
 * On top of the registry data, three codes carry the AlmaMesh-proven `match`
 * rules for the failures that have no HTTP status: an aborted/timed-out request,
 * a fetch/network failure, and a pre-egress privacy block.
 *
 * FROZEN. Three product repos vendor a byte-identical copy of this library and
 * build their catalogs by spreading individual entries out of this object, so
 * its codes, English and rule order are a compatibility surface: changing them
 * would change three shipped UIs on the next re-vendor. It is also, honestly,
 * an AI/WASM catalog wearing a generic name — 10 of the 18 codes are `ai.*` or
 * `bundle.*`, three hardcode another app's "Settings → AI", and
 * `ai.privacy.violation` string-couples to `@edgeproc/privacy-core`. New work
 * should reach for {@link corePack} / {@link aiPack} / {@link bundlePack}
 * instead and take only the halves it needs.
 */
export const starterPack = {
  "ai.config.no_key": {
    category: "config",
    params: [],
    en: "No AI provider key is set. Add your key in Settings → AI to turn on the optional AI features.",
  },
  "ai.provider.unauthorized": {
    category: "config",
    httpStatus: [401, 403],
    params: [],
    en: "Your AI provider key was rejected. Check the key in Settings → AI.",
  },
  "ai.provider.out_of_credits": {
    category: "provider",
    httpStatus: [402],
    params: ["creditsLeft", "creditsTotal", "currency"],
    en: "Your provider account is out of credits. Add credits and try again.",
  },
  "ai.provider.rate_limited": {
    category: "provider",
    httpStatus: [429],
    params: ["retryAfter"],
    en: "The AI provider is rate-limiting requests. Wait a moment and try again.",
  },
  "ai.provider.server_error": {
    category: "provider",
    httpStatus: [500, 502, 503, 504],
    params: [],
    en: "The AI provider had a server error. Try again shortly.",
  },
  "ai.model.unavailable": {
    category: "config",
    httpStatus: [404],
    params: ["model"],
    en: "The selected model isn't available. Pick another model in Settings → AI.",
  },
  "ai.request.timeout": {
    category: "timeout",
    params: [],
    en: "The AI request timed out. Try again.",
    match: isTimeoutFailure,
  },
  "ai.request.cancelled": {
    category: "internal",
    params: [],
    en: "The AI request was cancelled.",
  },
  "ai.privacy.violation": {
    category: "config",
    params: [],
    en: "The request was blocked to protect your private data before it left this device.",
    match: (raw) => errorNameOf(raw) === "PrivacyViolationError",
  },
  "net.unreachable": {
    category: "network",
    params: [],
    en: "Couldn't reach the server. Check your connection and try again.",
    match: isUnreachableFailure,
  },
  "bundle.download_failed": {
    category: "network",
    params: [],
    en: "Couldn't download the data bundle. Check your connection and retry.",
  },
  "bundle.integrity_failed": {
    category: "integrity",
    params: ["chunk"],
    en: "A downloaded file failed its integrity check. Retry to re-fetch it.",
  },
  "bundle.quota_exceeded": {
    category: "device",
    params: ["requiredBytes", "availableBytes"],
    en: "Not enough free storage to load the data on this device. Free up space and retry, or use a desktop browser.",
  },
  "bundle.device_unsupported": {
    category: "device",
    params: ["reason"],
    en: "This device or browser can't run the local engine. Try a recent desktop browser.",
  },
  "bundle.timeout": {
    category: "timeout",
    params: [],
    en: "Loading the data timed out. Retry, or try on a desktop browser.",
  },
  "config.missing": {
    category: "config",
    params: ["field"],
    en: "A required setting is missing: {field}.",
  },
  "config.invalid": {
    category: "config",
    params: ["field"],
    en: "A setting is invalid: {field}.",
  },
  "internal.unknown": {
    category: "internal",
    params: [],
    en: "Something went wrong. Try again.",
  },
} as const satisfies Catalog;

/**
 * The domain-neutral half: the codes any app has, whatever it does. No AI
 * provider, no WASM bundle, no other app's settings screen in the English.
 *
 * This is the pack a stranger should start from:
 * `defineErrorsWith({}, { ...corePack, ...ownCodes })`.
 *
 * Two properties `starterPack` does not have:
 * - `http.server_error` claims the WHOLE 5xx range via `httpStatusRange`, so
 *   501 / 507 / 522 / 599 do not fall through to the fallback.
 * - the two text-sniffing rules declare themselves broad (`priority: BROAD`),
 *   so your own rules win even when you spread this pack first.
 */
export const corePack = {
  "http.unauthorized": {
    category: "config",
    httpStatus: [401, 403],
    params: [],
    en: "You are not authorised to do that. Check your credentials and try again.",
  },
  "http.not_found": {
    category: "config",
    httpStatus: [404],
    params: ["resource"],
    en: "That was not found on the server.",
  },
  "http.rate_limited": {
    category: "provider",
    httpStatus: [429],
    params: ["retryAfter"],
    en: "Too many requests. Wait a moment and try again.",
  },
  "http.server_error": {
    category: "provider",
    httpStatus: [500],
    httpStatusRange: [500, 599],
    params: [],
    en: "The server had an error. Try again shortly.",
  },
  "net.unreachable": {
    category: "network",
    params: [],
    priority: BROAD,
    en: "Couldn't reach the server. Check your connection and try again.",
    match: isUnreachableFailure,
  },
  "request.timeout": {
    category: "timeout",
    params: [],
    priority: BROAD,
    en: "The request timed out. Try again.",
    match: isTimeoutFailure,
  },
  "request.cancelled": {
    category: "internal",
    params: [],
    en: "The request was cancelled.",
  },
  "config.missing": {
    category: "config",
    params: ["field"],
    en: "A required setting is missing: {field}.",
  },
  "config.invalid": {
    category: "config",
    params: ["field"],
    en: "A setting is invalid: {field}.",
  },
  "internal.unknown": {
    category: "internal",
    params: [],
    en: "Something went wrong. Try again.",
  },
} as const satisfies Catalog;

/**
 * The AI-provider half, named for what it actually is. Compose it only if your
 * app talks to an LLM provider: `defineErrors(corePack, aiPack)`.
 *
 * Differences from the same codes in `starterPack`: the English no longer names
 * another app's "Settings → AI" screen, `ai.provider.server_error` claims the
 * whole 5xx range, and `ai.privacy.violation` ships NO `match` rule — the old
 * one string-matched `"PrivacyViolationError"`, coupling this catalog to
 * `@edgeproc/privacy-core`. Attach your own predicate for whatever your egress
 * guard throws.
 */
export const aiPack = {
  "ai.config.no_key": {
    category: "config",
    params: [],
    en: "No AI provider key is set. Add a provider key in your settings to turn on the optional AI features.",
  },
  "ai.provider.unauthorized": {
    category: "config",
    httpStatus: [401, 403],
    params: [],
    en: "Your AI provider key was rejected. Check the key in your settings.",
  },
  "ai.provider.out_of_credits": {
    category: "provider",
    httpStatus: [402],
    params: ["creditsLeft", "creditsTotal", "currency"],
    en: "Your provider account is out of credits. Add credits and try again.",
  },
  "ai.provider.rate_limited": {
    category: "provider",
    httpStatus: [429],
    params: ["retryAfter"],
    en: "The AI provider is rate-limiting requests. Wait a moment and try again.",
  },
  "ai.provider.server_error": {
    category: "provider",
    httpStatus: [500],
    httpStatusRange: [500, 599],
    params: [],
    en: "The AI provider had a server error. Try again shortly.",
  },
  "ai.model.unavailable": {
    category: "config",
    httpStatus: [404],
    params: ["model"],
    en: "The selected model isn't available. Choose a different one.",
  },
  "ai.request.timeout": {
    category: "timeout",
    params: [],
    priority: BROAD,
    en: "The AI request timed out. Try again.",
    match: isTimeoutFailure,
  },
  "ai.request.cancelled": {
    category: "internal",
    params: [],
    en: "The AI request was cancelled.",
  },
  "ai.privacy.violation": {
    category: "config",
    params: [],
    en: "The request was blocked to protect your private data before it left this device.",
  },
} as const satisfies Catalog;

/**
 * The downloadable-artefact half: fetching, verifying and storing a data bundle
 * (a WASM engine, a model, a screening list) on the device. Compose it only if
 * your app ships one: `defineErrors(corePack, bundlePack)`.
 *
 * Same codes as `starterPack`'s `bundle.*`, with `bundle.device_unsupported`
 * reworded away from one app's "local engine".
 */
export const bundlePack = {
  "bundle.download_failed": {
    category: "network",
    params: [],
    en: "Couldn't download the data bundle. Check your connection and retry.",
  },
  "bundle.integrity_failed": {
    category: "integrity",
    params: ["chunk"],
    en: "A downloaded file failed its integrity check. Retry to re-fetch it.",
  },
  "bundle.quota_exceeded": {
    category: "device",
    params: ["requiredBytes", "availableBytes"],
    en: "Not enough free storage to load the data on this device. Free up space and retry, or use a desktop browser.",
  },
  "bundle.device_unsupported": {
    category: "device",
    params: ["reason"],
    en: "This device or browser doesn't support what this app needs. Try a recent desktop browser.",
  },
  "bundle.timeout": {
    category: "timeout",
    params: [],
    en: "Loading the data timed out. Retry, or try on a desktop browser.",
  },
} as const satisfies Catalog;
