/**
 * @edgeproc/errors — canonical error glue.
 *
 * Register a per-app catalog of codes, classify raw failures into those codes,
 * describe them via your own i18next, and serialize to RFC 9457 Problem Details.
 * Zero runtime dependencies; i18next is an optional peer (you pass its `t`).
 */

export { CanonicalError, DuplicateCodeError } from "./canonical-error.js";
export { errorNameOf, errorTextOf, httpStatusOf } from "./raw.js";
export {
  DEFAULT_FALLBACK_CODE,
  defineErrors,
  defineErrorsWith,
  UnregisteredFallbackError,
} from "./registry.js";
export {
  aiPack,
  bundlePack,
  corePack,
  starterPack,
} from "./starter-pack.js";
export type {
  Catalog,
  CatalogEntry,
  Category,
  ErrorCode,
  KnownCategory,
  MatchRule,
  Params,
  ParamsFor,
  ParamValue,
  ProblemDetails,
  ProblemOptions,
  Registry,
  RegistryOptions,
  TFunction,
} from "./types.js";
