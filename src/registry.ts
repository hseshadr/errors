import { CanonicalError, DuplicateCodeError } from "./canonical-error.js";
import { httpStatusOf } from "./raw.js";
import type {
  Catalog,
  CatalogEntry,
  ErrorCode,
  MatchRule,
  Params,
  ParamValue,
  ProblemDetails,
  ProblemOptions,
  Registry,
  RegistryOptions,
  TFunction,
} from "./types.js";

/** The last-resort code a registry uses when it configures no other. */
export const DEFAULT_FALLBACK_CODE = "internal.unknown";
const PLACEHOLDER = /\{(\w+)\}/g;

/**
 * Thrown by `defineErrorsWith` when the fallback code is not registered in the
 * catalog. `classify` would then return a code the registry does not contain —
 * `has()` false, `get()` undefined, `describe()` echoing the raw key, and the
 * bare key shipped as the Problem Details `type` and `title`.
 */
export class UnregisteredFallbackError extends Error {
  constructor(code: string) {
    super(
      `Fallback code "${code}" is not registered in this catalog. classify() would return a code this registry does not contain.`,
    );
    this.name = "UnregisteredFallbackError";
  }
}

/** Replace `{name}` placeholders in a default-English template. */
function interpolate(
  template: string,
  params: Record<string, ParamValue>,
): string {
  return template.replace(PLACEHOLDER, (match, name: string) =>
    Object.hasOwn(params, name) ? String(params[name]) : match,
  );
}

function collectMatchers(
  map: Catalog,
): ReadonlyArray<readonly [string, MatchRule]> {
  const matchers: Array<readonly [string, MatchRule]> = [];
  for (const [code, entry] of Object.entries(map)) {
    if (entry.match) matchers.push([code, entry.match]);
  }
  return matchers;
}

/** First code registered for a status wins — codes are stable, not last-writer. */
function buildStatusIndex(map: Catalog): Map<number, string> {
  const index = new Map<number, string>();
  for (const [code, entry] of Object.entries(map)) {
    for (const status of entry.httpStatus ?? []) {
      if (!index.has(status)) index.set(status, code);
    }
  }
  return index;
}

function mergeCatalogs(fragments: readonly Catalog[]): Catalog {
  const merged: Record<string, CatalogEntry> = {};
  for (const fragment of fragments) {
    for (const [code, entry] of Object.entries(fragment)) {
      if (Object.hasOwn(merged, code)) throw new DuplicateCodeError(code);
      merged[code] = entry;
    }
  }
  return merged;
}

/**
 * Build a per-app error registry from one or more catalog fragments.
 *
 * - Pass a single (optionally spread) catalog for the richest param typing:
 *   `defineErrors({ ...starterPack, ...ownCodes })`.
 * - Pass fragments as separate arguments to get runtime duplicate-code
 *   detection across them: `defineErrors(starterPack, ownCodes)`.
 */
export function defineErrors<const C extends Catalog>(catalog: C): Registry<C>;
export function defineErrors(...fragments: Catalog[]): Registry<Catalog>;
export function defineErrors(...fragments: Catalog[]): Registry<Catalog> {
  return createRegistry(mergeCatalogs(fragments), DEFAULT_FALLBACK_CODE);
}

/**
 * `defineErrors` with registry-wide options in front — today, the fallback code
 * `classify` returns when nothing matches.
 *
 * Options come first so the fragment list stays variadic and unambiguous:
 * `defineErrorsWith({ fallbackCode: "shop.unknown" }, ownCodes)`.
 *
 * Unlike `defineErrors`, this entry point VALIDATES the fallback: it must be a
 * code the merged catalog registers, or it throws
 * {@link UnregisteredFallbackError}. Opting into options is opting into the
 * check.
 */
export function defineErrorsWith<const C extends Catalog>(
  options: RegistryOptions,
  catalog: C,
): Registry<C>;
export function defineErrorsWith(
  options: RegistryOptions,
  ...fragments: Catalog[]
): Registry<Catalog>;
export function defineErrorsWith(
  options: RegistryOptions,
  ...fragments: Catalog[]
): Registry<Catalog> {
  const catalog = mergeCatalogs(fragments);
  const fallbackCode = options.fallbackCode ?? DEFAULT_FALLBACK_CODE;
  if (!Object.hasOwn(catalog, fallbackCode)) {
    throw new UnregisteredFallbackError(fallbackCode);
  }
  return createRegistry(catalog, fallbackCode);
}

function createRegistry<C extends Catalog>(
  catalog: C,
  fallbackCode: ErrorCode,
): Registry<C> {
  const map: Catalog = catalog;
  const codes = Object.keys(map);
  const matchers = collectMatchers(map);
  const statusIndex = buildStatusIndex(map);

  function classify(raw: unknown): ErrorCode {
    for (const [code, match] of matchers) {
      if (match(raw)) return code;
    }
    const status = httpStatusOf(raw);
    if (status !== undefined) {
      const byStatus = statusIndex.get(status);
      if (byStatus !== undefined) return byStatus;
    }
    return fallbackCode;
  }

  function describe(code: ErrorCode, params?: Params, t?: TFunction): string {
    const entry = map[code];
    const values: Record<string, ParamValue> = { ...(params ?? {}) };
    const key = entry?.i18nKey ?? `errors.${code}`;
    if (t) {
      const localized = t(key, values);
      if (localized !== key) return localized;
    }
    const template = entry?.en;
    return template === undefined ? code : interpolate(template, values);
  }

  function toProblemDetails(
    code: ErrorCode,
    params?: Params,
    options?: ProblemOptions,
  ): ProblemDetails {
    const entry = map[code];
    const values: Record<string, ParamValue> = { ...(params ?? {}) };
    const status = options?.status ?? entry?.httpStatus?.[0];
    const problem: ProblemDetails = {
      ...values,
      type: entry?.problemType ?? code,
      title: options?.title ?? describe(code, params),
    };
    if (status !== undefined) problem.status = status;
    if (options?.instance !== undefined) problem.instance = options.instance;
    return problem;
  }

  function create(code: ErrorCode, params?: Params): CanonicalError {
    const category = map[code]?.category ?? "internal";
    return new CanonicalError(code, category, params);
  }

  const registry = {
    codes,
    has: (code: string): boolean => Object.hasOwn(map, code),
    get: (code: string): CatalogEntry | undefined => map[code],
    classify,
    describe,
    toProblemDetails,
    create,
  };
  return registry as Registry<C>;
}
