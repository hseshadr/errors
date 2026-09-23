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

/**
 * Read an optional member as an OWN property only. Catalog entries and
 * `ProblemOptions` are caller-supplied plain objects, so a plain `obj.key` read
 * would fall through to `Object.prototype` — and if anything else in the host
 * process pollutes it, an attacker's value would silently become a match rule,
 * a status, or a wire member. An absent own member is simply `undefined`.
 */
function own<T extends object, K extends keyof T>(
  obj: T | null | undefined,
  key: K,
): T[K] | undefined {
  // `null` is not in the types, but untyped callers passed it and `?.` took it.
  return obj !== undefined && obj !== null && Object.hasOwn(obj, key)
    ? obj[key]
    : undefined;
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

interface Matcher {
  readonly code: string;
  readonly match: MatchRule;
  readonly priority: number;
}

/**
 * Match rules in the order `classify` runs them: highest `priority` first,
 * registration order within a tie. The default priority is 0, so a catalog that
 * declares no priorities keeps plain registration order.
 */
function collectMatchers(map: Catalog): ReadonlyArray<Matcher> {
  const matchers: Matcher[] = [];
  for (const [code, entry] of Object.entries(map)) {
    const match = own(entry, "match");
    if (match) {
      matchers.push({ code, match, priority: own(entry, "priority") ?? 0 });
    }
  }
  // Array.prototype.sort is stable, which is what preserves registration order.
  return matchers.sort((a, b) => b.priority - a.priority);
}

/** Inclusive `[min, max]` status ranges, in registration order. */
function collectStatusRanges(
  map: Catalog,
): ReadonlyArray<readonly [string, readonly [number, number]]> {
  const ranges: Array<readonly [string, readonly [number, number]]> = [];
  for (const [code, entry] of Object.entries(map)) {
    const range = own(entry, "httpStatusRange");
    if (range) ranges.push([code, range]);
  }
  return ranges;
}

/** First code registered for a status wins — codes are stable, not last-writer. */
function buildStatusIndex(map: Catalog): Map<number, string> {
  const index = new Map<number, string>();
  for (const [code, entry] of Object.entries(map)) {
    for (const status of own(entry, "httpStatus") ?? []) {
      if (!index.has(status)) index.set(status, code);
    }
  }
  return index;
}

/**
 * Merged catalogs have a null prototype, so a fragment's own `__proto__` code
 * becomes an own entry instead of rewriting the object's prototype, and no
 * `Object.prototype` member (`constructor`, `toString`, …) is ever reachable
 * as if it were a registered entry.
 */
function mergeCatalogs(fragments: readonly Catalog[]): Catalog {
  const merged: Record<string, CatalogEntry> = Object.create(null);
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

/**
 * RFC 9457 members the registry owns. Params never supply them: `type` and
 * `title` come from the catalog, `status` and `instance` from options, and
 * `detail` is not emitted. Every other param becomes a public extension member.
 */
const RESERVED_PROBLEM_MEMBERS: ReadonlySet<string> = new Set([
  "type",
  "title",
  "status",
  "detail",
  "instance",
]);

/**
 * Names that can never be an extension member, whatever their value. `toJSON`
 * would let one param replace the entire serialized body (`JSON.stringify`
 * calls it); `__proto__`, `constructor`, and `prototype` are prototype-shaped
 * names that `JSON.parse` hands back as ordinary own keys. The Python mirror in
 * edgeproc-core reserves the same prototype-shaped names.
 */
const UNSAFE_MEMBER_NAMES: ReadonlySet<string> = new Set([
  "toJSON",
  "__proto__",
  "constructor",
  "prototype",
]);

/**
 * A value that may go on the wire: exactly the declared `ParamValue` — a string
 * or a FINITE number. Anything else (objects, arrays, booleans, `null`,
 * `NaN`/`Infinity`, bigint, functions, symbols) is outside the type contract,
 * could smuggle structure into the body, or makes `JSON.stringify` throw.
 */
function isWireValue(value: unknown): value is ParamValue {
  return (
    typeof value === "string" ||
    (typeof value === "number" && Number.isFinite(value))
  );
}

/**
 * Copy `params` minus the reserved RFC 9457 members, the unsafe member names,
 * and any value that is not a string or finite number. Only own, enumerable,
 * string-keyed params are considered (`Object.entries`), so symbol and
 * non-enumerable keys never reach the wire. `describe` still receives the
 * unfiltered params for title interpolation.
 */
function extensionMembers(params?: Params): Record<string, ParamValue> {
  const members: Record<string, ParamValue> = Object.create(null);
  for (const [name, value] of Object.entries(params ?? {})) {
    if (RESERVED_PROBLEM_MEMBERS.has(name)) continue;
    if (UNSAFE_MEMBER_NAMES.has(name)) continue;
    if (isWireValue(value)) members[name] = value;
  }
  return members;
}

/** The entry's first own `httpStatus`, never an inherited array or index. */
function firstStatus(entry: CatalogEntry | undefined): number | undefined {
  const statuses = own(entry, "httpStatus");
  return statuses !== undefined && statuses.length > 0
    ? statuses[0]
    : undefined;
}

function createRegistry<C extends Catalog>(
  catalog: C,
  fallbackCode: ErrorCode,
): Registry<C> {
  const map: Catalog = catalog;
  const codes = Object.keys(map);
  const matchers = collectMatchers(map);
  const statusIndex = buildStatusIndex(map);
  const statusRanges = collectStatusRanges(map);

  /** Own-property lookup: an unregistered code never resolves to an inherited member. */
  function entryOf(code: string): CatalogEntry | undefined {
    return Object.hasOwn(map, code) ? map[code] : undefined;
  }

  /** First registered range containing `status` — the tier below the exact table. */
  function codeForStatusRange(status: number): string | undefined {
    for (const [code, [min, max]] of statusRanges) {
      if (status >= min && status <= max) return code;
    }
    return undefined;
  }

  /**
   * Precedence, in order: `match` predicates (by priority, then registration),
   * the exact `httpStatus` table, then `httpStatusRange`, then the fallback.
   */
  function classify(raw: unknown): ErrorCode {
    for (const { code, match } of matchers) {
      if (match(raw)) return code;
    }
    const status = httpStatusOf(raw);
    if (status !== undefined) {
      const byStatus = statusIndex.get(status) ?? codeForStatusRange(status);
      if (byStatus !== undefined) return byStatus;
    }
    return fallbackCode;
  }

  function describe(code: ErrorCode, params?: Params, t?: TFunction): string {
    const entry = entryOf(code);
    const values: Record<string, ParamValue> = { ...(params ?? {}) };
    const key = own(entry, "i18nKey") ?? `errors.${code}`;
    if (t) {
      const localized = t(key, values);
      if (localized !== key) return localized;
    }
    const template = own(entry, "en");
    return template === undefined ? code : interpolate(template, values);
  }

  function toProblemDetails(
    code: ErrorCode,
    params?: Params,
    options?: ProblemOptions,
  ): ProblemDetails {
    const entry = entryOf(code);
    const status = own(options, "status") ?? firstStatus(entry);
    const problem: ProblemDetails = {
      ...extensionMembers(params),
      type: own(entry, "problemType") ?? code,
      title: own(options, "title") ?? describe(code, params),
    };
    if (status !== undefined) problem.status = status;
    const instance = own(options, "instance");
    if (instance !== undefined) problem.instance = instance;
    return problem;
  }

  function create(code: ErrorCode, params?: Params): CanonicalError {
    const category = own(entryOf(code), "category") ?? "internal";
    return new CanonicalError(code, category, params);
  }

  const registry = {
    codes,
    has: (code: string): boolean => Object.hasOwn(map, code),
    get: entryOf,
    classify,
    describe,
    toProblemDetails,
    create,
  };
  return registry as Registry<C>;
}
