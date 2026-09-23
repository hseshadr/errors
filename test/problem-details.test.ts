import { describe, expect, it } from "vitest";
import { defineErrors, starterPack } from "../src/index.js";

const registry = defineErrors(starterPack);

describe("toProblemDetails — RFC 9457 conformance", () => {
  it("uses the code as `type` when no problemType is registered", () => {
    const pd = registry.toProblemDetails("ai.provider.out_of_credits");
    expect(pd.type).toBe("ai.provider.out_of_credits");
  });

  it("prefers a registered problemType URI as `type`", () => {
    const reg = defineErrors({
      "app.teapot": {
        category: "internal",
        problemType: "https://example.com/probs/teapot",
        en: "I'm a teapot.",
      },
    });
    const pd = reg.toProblemDetails("app.teapot");
    expect(pd.type).toBe("https://example.com/probs/teapot");
  });

  it("derives `title` from describe() when none is supplied", () => {
    const pd = registry.toProblemDetails("net.unreachable");
    expect(pd.title).toBe(
      "Couldn't reach the server. Check your connection and try again.",
    );
  });

  it("uses an explicit title when supplied", () => {
    const pd = registry.toProblemDetails(
      "ai.provider.rate_limited",
      {},
      { title: "Slow down" },
    );
    expect(pd.title).toBe("Slow down");
  });

  it("defaults `status` to the first registered httpStatus", () => {
    const pd = registry.toProblemDetails("ai.provider.out_of_credits");
    expect(pd.status).toBe(402);
  });

  it("prefers an explicit status and carries instance", () => {
    const pd = registry.toProblemDetails(
      "ai.provider.server_error",
      {},
      { status: 503, instance: "/v1/chat/42" },
    );
    expect(pd.status).toBe(503);
    expect(pd.instance).toBe("/v1/chat/42");
  });

  it("omits status entirely when there is neither an option nor an httpStatus", () => {
    const pd = registry.toProblemDetails("internal.unknown");
    expect("status" in pd).toBe(false);
  });

  it("spreads params as extension members alongside the core fields", () => {
    const pd = registry.toProblemDetails("ai.provider.out_of_credits", {
      creditsLeft: 0,
      currency: "USD",
    });
    expect(pd).toMatchObject({
      type: "ai.provider.out_of_credits",
      status: 402,
      creditsLeft: 0,
      currency: "USD",
    });
    expect(typeof pd.title).toBe("string");
  });
});

describe("toProblemDetails — reserved RFC 9457 members", () => {
  const reserved = {
    type: "https://attacker.example/forged",
    title: "Forged title",
    status: 200,
    detail: "Forged detail",
    instance: "/forged",
  };

  it("never lets params supply type, title, status, detail, or instance", () => {
    const pd = registry.toProblemDetails("ai.provider.out_of_credits", {
      ...reserved,
      creditsLeft: 0,
    });
    expect(pd).toEqual({
      type: "ai.provider.out_of_credits",
      title: registry.describe("ai.provider.out_of_credits"),
      status: 402,
      creditsLeft: 0,
    });
  });

  it("does not let a param fill a reserved member the registry leaves unset", () => {
    const pd = registry.toProblemDetails("internal.unknown", reserved);
    expect(pd).toEqual({
      type: "internal.unknown",
      title: registry.describe("internal.unknown"),
    });
  });

  it("still takes status and instance from options, not params", () => {
    const pd = registry.toProblemDetails("internal.unknown", reserved, {
      status: 500,
      instance: "/v1/jobs/7",
    });
    expect(pd.status).toBe(500);
    expect(pd.instance).toBe("/v1/jobs/7");
    expect("detail" in pd).toBe(false);
  });

  it("keeps a reserved-named param available to the title template", () => {
    const reg = defineErrors({
      "app.detail": {
        category: "internal",
        en: "Failed: {detail}",
        params: ["detail"],
      },
    });
    const pd = reg.toProblemDetails("app.detail", { detail: "disk full" });
    expect(pd).toEqual({ type: "app.detail", title: "Failed: disk full" });
  });
});

// Params are caller data and often reach this function straight from
// `JSON.parse`. Each member name or value below could hijack the serialized
// body: `toJSON` replaces it wholesale, `__proto__`/`constructor`/`prototype`
// are prototype-shaped names, and a non-string/non-finite value is outside the
// declared `ParamValue` contract (and a bigint makes `JSON.stringify` throw).
describe("toProblemDetails — hostile params", () => {
  const code = "ai.provider.out_of_credits";
  const base = {
    type: code,
    title: registry.describe(code),
    status: 402,
  };
  const wire = (params: unknown): unknown =>
    JSON.parse(
      JSON.stringify(registry.toProblemDetails(code, params as never)),
    );

  it("never lets a toJSON param replace the serialized body", () => {
    const forged = {
      toJSON: () => ({ type: "evil", status: 200, detail: "x" }),
      creditsLeft: 0,
    };
    const pd = registry.toProblemDetails(code, forged as never);
    expect(Object.hasOwn(pd, "toJSON")).toBe(false);
    expect(JSON.parse(JSON.stringify(pd))).toEqual({ ...base, creditsLeft: 0 });
  });

  it("drops a toJSON param even when it is a plain string", () => {
    expect(wire({ toJSON: "x", a: "b" })).toEqual({ ...base, a: "b" });
  });

  it("keeps a JSON.parse `__proto__` object off the wire", () => {
    const params = JSON.parse('{"__proto__":{"isAdmin":true},"a":"b"}');
    const pd = registry.toProblemDetails(code, params);
    expect(Object.hasOwn(pd, "__proto__")).toBe(false);
    expect(Object.getPrototypeOf(pd)).toBe(Object.prototype);
    expect((pd as Record<string, unknown>).isAdmin).toBeUndefined();
    expect(JSON.stringify(pd)).not.toContain("__proto__");
    expect(JSON.stringify(pd)).not.toContain("isAdmin");
    expect(wire(params)).toEqual({ ...base, a: "b" });
  });

  it.each(["__proto__", "constructor", "prototype", "toJSON"])(
    "drops the prototype-shaped member name %s even with a string value",
    (name) => {
      const params = JSON.parse(`{${JSON.stringify(name)}:"x","a":"b"}`);
      const pd = registry.toProblemDetails(code, params);
      expect(Object.hasOwn(pd, name)).toBe(false);
      expect(wire(params)).toEqual({ ...base, a: "b" });
    },
  );

  it.each<[string, unknown]>([
    ["an object", { nested: true }],
    ["an array", [1, 2]],
    ["a boolean", true],
    ["null", null],
    ["undefined", undefined],
    ["NaN", Number.NaN],
    ["Infinity", Number.POSITIVE_INFINITY],
    ["-Infinity", Number.NEGATIVE_INFINITY],
    ["a bigint", 10n],
    ["a function", () => "x"],
    ["a symbol", Symbol("x")],
  ])("drops a param whose value is %s", (_label, value) => {
    const pd = registry.toProblemDetails(code, { bad: value, ok: 1 } as never);
    expect(Object.hasOwn(pd, "bad")).toBe(false);
    expect(pd).toEqual({ ...base, ok: 1 });
    expect(() => JSON.stringify(pd)).not.toThrow();
  });

  it("keeps strings and finite numbers, including empty and zero", () => {
    expect(wire({ s: "", n: 0, f: -1.5, big: Number.MAX_VALUE })).toEqual({
      ...base,
      s: "",
      n: 0,
      f: -1.5,
      big: Number.MAX_VALUE,
    });
  });

  it("still excludes non-enumerable and symbol-keyed params", () => {
    const params: Record<string | symbol, unknown> = { visible: "yes" };
    Object.defineProperty(params, "hidden", {
      value: "no",
      enumerable: false,
    });
    params[Symbol("sym")] = "no";
    expect(registry.toProblemDetails(code, params as never)).toEqual({
      ...base,
      visible: "yes",
    });
  });

  it("still hands dropped names and values to the title template", () => {
    const reg = defineErrors({
      "app.proto": {
        category: "internal",
        en: "ctor={constructor} bad={bad}",
      },
    });
    const pd = reg.toProblemDetails("app.proto", {
      constructor: "C",
      bad: Number.NaN,
    });
    expect(pd).toEqual({ type: "app.proto", title: "ctor=C bad=NaN" });
  });
});
