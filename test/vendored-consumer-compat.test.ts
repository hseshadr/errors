import { describe, expect, it } from "vitest";
import {
  defineErrors,
  errorNameOf,
  httpStatusOf,
  starterPack,
} from "../src/index.js";

/**
 * Three product repos vendor a byte-identical copy of this library and all build
 * their catalogs the same way: spread ONE starterPack entry, then override its
 * `match`. Registration order is the precedence, and each of them says so in a
 * comment above the catalog.
 *
 *   "bundle.timeout": { ...starterPack["bundle.timeout"], match: … }
 *
 * That spread is why starterPack's own entries must never carry a `priority`:
 * the consumer would inherit it and their rules would silently reorder. These
 * tests reproduce each consumer's catalog shape and pin the resulting order, so
 * a priority added to starterPack goes RED here instead of in their product.
 *
 * Sources (read-only, not modified by this branch):
 *   aml-filter/frontend/app/src/pages/bootErrorMessage.ts
 *   edge-reco/frontend/app/src/api/syncErrors.ts
 *   almamesh/frontend/apps/web/src/lib/errors.ts
 */

const nameOf = (raw: unknown): string =>
  raw instanceof Error ? raw.name : errorNameOf(raw);

const named = (name: string, message = "boom"): Error => {
  const error = new Error(message);
  error.name = name;
  return error;
};

describe("aml-filter's boot-error catalog shape", () => {
  const registry = defineErrors({
    "bundle.device_unsupported": {
      ...starterPack["bundle.device_unsupported"],
      i18nKey: "errors:device.unsupported",
      match: (raw: unknown) => nameOf(raw) === "DeviceUnsupportedError",
    },
    "bundle.quota_exceeded": {
      ...starterPack["bundle.quota_exceeded"],
      match: (raw: unknown) => nameOf(raw) === "QuotaError",
    },
    "bundle.integrity_failed": {
      ...starterPack["bundle.integrity_failed"],
      match: (raw: unknown) => nameOf(raw) === "IntegrityError",
    },
    "net.unreachable": {
      ...starterPack["net.unreachable"],
      // The real consumer sniffs the MESSAGE, not the stringified error.
      match: (raw: unknown) =>
        /network ?error|unreachable/i.test(
          raw instanceof Error ? raw.message : "",
        ),
    },
    "bundle.download_failed": {
      ...starterPack["bundle.download_failed"],
      match: (raw: unknown) => nameOf(raw) === "NetworkError",
    },
    "internal.unknown": starterPack["internal.unknown"],
  });

  it("keeps net.unreachable ahead of bundle.download_failed", () => {
    // Both rules claim a NetworkError whose text says "network". The consumer
    // registered net.unreachable first, so it wins — inheriting a priority from
    // starterPack's net.unreachable entry would flip this.
    expect(registry.classify(named("NetworkError", "network error"))).toBe(
      "net.unreachable",
    );
  });

  it("still routes a plain NetworkError to bundle.download_failed", () => {
    expect(registry.classify(named("NetworkError", "chunk 3 failed"))).toBe(
      "bundle.download_failed",
    );
  });

  it("keeps the device/quota/integrity rules in registration order", () => {
    expect(registry.classify(named("DeviceUnsupportedError"))).toBe(
      "bundle.device_unsupported",
    );
    expect(registry.classify(named("QuotaError"))).toBe(
      "bundle.quota_exceeded",
    );
    expect(registry.classify(named("IntegrityError"))).toBe(
      "bundle.integrity_failed",
    );
    expect(registry.classify(named("SomethingElse"))).toBe("internal.unknown");
  });

  it("honours the i18nKey the consumer attached to a spread entry", () => {
    const seen: string[] = [];
    registry.describe("bundle.device_unsupported", {}, (key) => {
      seen.push(key);
      return key;
    });
    expect(seen).toEqual(["errors:device.unsupported"]);
  });
});

describe("edge-reco's sync-error catalog shape", () => {
  const registry = defineErrors({
    "bundle.integrity_failed": {
      ...starterPack["bundle.integrity_failed"],
      match: (raw: unknown) => errorNameOf(raw) === "VerificationError",
    },
    "bundle.download_failed": {
      ...starterPack["bundle.download_failed"],
      match: (raw: unknown) => errorNameOf(raw) === "NetworkError",
    },
    "bundle.timeout": {
      ...starterPack["bundle.timeout"],
      match: (raw: unknown) => errorNameOf(raw) === "WorkerTimeoutError",
    },
    "bundle.device_unsupported": {
      ...starterPack["bundle.device_unsupported"],
      match: (raw: unknown) => errorNameOf(raw) === "WorkerCrashError",
    },
    "net.unreachable": starterPack["net.unreachable"],
    "internal.unknown": starterPack["internal.unknown"],
  });

  it("prefers the consumer's WorkerTimeoutError rule over the inherited one", () => {
    // starterPack's net.unreachable match is inherited verbatim here and sits
    // LAST; the consumer's four rules must all run before it.
    expect(registry.classify(named("WorkerTimeoutError", "timed out"))).toBe(
      "bundle.timeout",
    );
    expect(registry.classify(named("VerificationError"))).toBe(
      "bundle.integrity_failed",
    );
    expect(registry.classify(named("WorkerCrashError"))).toBe(
      "bundle.device_unsupported",
    );
  });

  it("falls through to the inherited net.unreachable rule", () => {
    expect(registry.classify(new TypeError("Failed to fetch"))).toBe(
      "net.unreachable",
    );
  });
});

describe("almamesh's AI-error catalog shape", () => {
  const registry = defineErrors({
    "ai.privacy.violation": {
      ...starterPack["ai.privacy.violation"],
      match: (raw: unknown) => nameOf(raw) === "PrivacyViolationError",
    },
    "ai.provider.out_of_credits": {
      ...starterPack["ai.provider.out_of_credits"],
      match: (raw: unknown) => httpStatusOf(raw) === 402,
    },
    "ai.provider.unauthorized": {
      ...starterPack["ai.provider.unauthorized"],
      match: (raw: unknown) => {
        const status = httpStatusOf(raw);
        return status === 401 || status === 403;
      },
    },
    "net.unreachable": {
      ...starterPack["net.unreachable"],
      match: (raw: unknown) =>
        httpStatusOf(raw) === undefined && /failed to fetch/i.test(String(raw)),
    },
    "internal.unknown": starterPack["internal.unknown"],
  });

  it("keeps ai.privacy.violation first, ahead of every status rule", () => {
    // A blocked request that also carries a 402 must stay a privacy violation:
    // it is registered first. A priority on the starterPack entry it spreads
    // would sink it below out_of_credits.
    const raw = Object.assign(named("PrivacyViolationError"), { status: 402 });
    expect(registry.classify(raw)).toBe("ai.privacy.violation");
  });

  it("routes the ordinary provider statuses unchanged", () => {
    expect(registry.classify({ status: 402 })).toBe(
      "ai.provider.out_of_credits",
    );
    expect(registry.classify({ status: 401 })).toBe("ai.provider.unauthorized");
    expect(registry.classify({ status: 418 })).toBe("internal.unknown");
  });
});
