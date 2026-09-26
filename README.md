# @edgeproc/errors

Give every error in your JavaScript or TypeScript app one fixed code and one clear message, the same on every screen.

**`npm install @edgeproc/errors`** (Node 22.13 or newer, no dependencies).

[![CI](https://github.com/hseshadr/errors/actions/workflows/ci.yml/badge.svg)](https://github.com/hseshadr/errors/actions/workflows/ci.yml)
[![npm](https://img.shields.io/npm/v/@edgeproc/errors)](https://www.npmjs.com/package/@edgeproc/errors)
[![License: MIT](https://img.shields.io/github/license/hseshadr/errors)](LICENSE)

In most apps, every `catch` block writes its own error message, so one problem
shows up in several different ways. An AI provider says "402 Payment Required",
and one screen says "out of credits" while another says "check your model
settings". Your logs use a third wording and your API sends a fourth. Nobody can
search the logs for one failure, and users get told the wrong thing.

This package gives you one list of error codes for your whole app. You hand it
whatever failed (an HTTP status, a thrown error, a network drop) and it gives
back one code such as `ai.provider.out_of_credits`, one sentence a person can
read, and the same error as a standard JSON body your API can send.
It does not log, retry, or report errors. Your app still decides what to do with them.

**Technical docs:** [Architecture](docs/ARCHITECTURE.md) · [API guide](docs/API.md) · [Getting started for developers](docs/GETTING_STARTED.md)

## Try it

1. Make an empty project and install the package:

   ```bash
   mkdir try-errors && cd try-errors && npm init -y >/dev/null && npm install @edgeproc/errors
   ```

2. Save this as `try.mjs` (it is also [`examples/try.mjs`](examples/try.mjs)):

```js
import { aiPack, corePack, defineErrorsWith } from "@edgeproc/errors";

// Your app's list of error codes: 10 everyday ones + 9 for calling an AI service.
// Both lists claim some statuses (401, 404, 429, 5xx, timeouts). The list you
// pass first wins those, so here a 429 is http.rate_limited, not the ai.* code.
const errors = defineErrorsWith({}, corePack, aiPack);

// Four raw failures, the way they actually reach a catch block.
const failures = [
  { status: 402 }, // fetch() got "402 Payment Required"
  { status: 429 }, // fetch() got "429 Too Many Requests"
  new TypeError("Failed to fetch"), // the network dropped
  { status: 418, message: "I'm a teapot" }, // something nobody planned for
];

for (const raw of failures) {
  const code = errors.classify(raw);
  console.log(code.padEnd(28), errors.describe(code));
}

// The same error as a JSON body your API can send back.
const body = errors.toProblemDetails("ai.provider.out_of_credits");
console.log(JSON.stringify(body));

// An Error you can throw. Its .message is the code, so logs stay searchable.
// The sentence comes from describe().
const err = errors.create("config.missing", { field: "API_KEY" });
console.log(err.message);
console.log(errors.describe(err.code, err.params));
```

3. Run `node try.mjs`. This is the real output from the code in this
   repository:

```text
ai.provider.out_of_credits   Your provider account is out of credits. Add credits and try again.
http.rate_limited            Too many requests. Wait a moment and try again.
net.unreachable              Couldn't reach the server. Check your connection and try again.
internal.unknown             Something went wrong. Try again.
{"type":"ai.provider.out_of_credits","title":"Your provider account is out of credits. Add credits and try again.","status":402}
config.missing
A required setting is missing: API_KEY.
```

Each failure got one code and one sentence. The 429 went to `corePack`'s
`http.rate_limited` because `corePack` is listed first (see
[Which list of codes to start from](#which-list-of-codes-to-start-from)). The
teapot matched nothing, so it fell back to `internal.unknown` instead of showing
a raw error. The JSON line is the standard error format for web APIs (RFC 9457,
"Problem Details"), ready to send from a server.

The last two lines are an error you can `throw`. Its `.message` is the code
(`config.missing`), not the sentence, so the same failure always logs the same
searchable text. To show the sentence, call
`errors.describe(err.code, err.params)`.

To show the sentence in another language, pass your own translation function
(for example i18next's `t`) as the third argument to `describe`. The
[API guide](docs/API.md) shows how, plus how to add your own codes.

## How it works

You build one list of codes when your app starts. Each code has a category, an
English sentence, and optional rules for spotting it, such as "HTTP status 402"
or "the error message mentions a timeout". `classify` looks at the failure you
pass in (its `status`, its `name`, and its message) and runs only the rules on
your list, so it returns one code from that list. `describe` turns a code into a
sentence, and `toProblemDetails` turns it into the JSON body. There is no hidden
global list and no network or file access. The logic is about 260 lines of TypeScript.

## Which list of codes to start from

The package ships four ready-made lists. They are optional. You can also write
every code yourself.

| List          | Codes | Use it when                                                              |
| ------------- | ----- | ------------------------------------------------------------------------ |
| `corePack`    | 10    | Almost always. Everyday codes for HTTP errors, network drops, timeouts, and bad config. |
| `aiPack`      | 9     | Your app calls an AI model provider: no key, bad key, out of credits, rate limited. |
| `bundlePack`  | 5     | Your app downloads and checks a file on the device, such as a model or a data set. |
| `starterPack` | 18    | Only for the older apps that already use it. New code should use `corePack`. |

Lists combine: every code from every list you pass is registered. If two lists
define the same code, you get a `DuplicateCodeError` when the app starts, never a
silent winner. Order only matters when two different codes claim the same
status. In the example above, `corePack` comes first, so a 429 becomes
`http.rate_limited` and only the 402 reaches `aiPack`. If a registry only
handles calls to an AI provider, put `aiPack` first and a 429 becomes
`ai.provider.rate_limited`. The [Architecture](docs/ARCHITECTURE.md) doc lists
every status the two share.

`aiPack` has no catch-all code, so `defineErrorsWith({}, aiPack)` on its own
throws and tells you to add `corePack` or pick one of your codes as the
`fallbackCode`.

## What it does not do

- It does not log, retry, or report errors, and it does not send anything
  anywhere. Pair it with your logger or an error tracker.
- It cannot guess a cause that only your app knows about. Add a code with a rule
  for it.
- It does not escape messages for HTML. Escape them where you render them. Values
  you pass in become part of the message and the JSON body, so never pass a
  secret.
- It is tested on Node only. It has no Node-only imports, so a bundler can ship
  it to a browser, but no browser test runs in CI.
- It is pre-1.0. Code names are treated as a stable contract, but the API can
  still change between minor versions. See the [CHANGELOG](CHANGELOG.md).

## When to use something else

| If you need | Use |
| --- | --- |
| One or two error screens in a small app | A few hand-written messages. This would be overkill. |
| Only HTTP status to text, in one language | A small `switch (status)` helper |
| Collecting errors, alerts, and dashboards | An error tracker such as Sentry. It pairs well with this: log the code this package gives you. |
| One set of error codes shared by your screens, logs, and API responses | `@edgeproc/errors` |

## Install

```bash
npm install @edgeproc/errors    # or: pnpm add @edgeproc/errors
```

It needs Node 22.13 or newer and has no dependencies. There is nothing to
configure. The only setting is which code to return when nothing matches (see
the [API guide](docs/API.md)).

## Develop

```bash
git clone https://github.com/hseshadr/errors.git && cd errors
corepack enable && pnpm install
pnpm gate
```

`pnpm gate` runs lint, type checks, the tests with a 100% coverage bar, and the
build. It is the same command CI runs and takes under 20 seconds. Start with
[Getting started for developers](docs/GETTING_STARTED.md), which covers the Node
version to use, a map of the code, and a walkthrough of a first change.

## More detail

- [Architecture](docs/ARCHITECTURE.md): how `classify` picks a code, the four
  lists, the JSON body's safety rules, the security model, and what the tests prove.
- [API guide](docs/API.md): every export, with examples for your own codes,
  translations, custom fallbacks, and throwing a coded error.
- [Getting started for developers](docs/GETTING_STARTED.md): from a fresh clone
  to a passing build and your first change.
- [Interactive architecture map](docs/architecture/index.html): the same design
  as a clickable diagram.
- [Examples](examples/): `try.mjs` (above), `out-of-credits.mjs`, and
  `quickstart.mjs`, which adds your own code and a Spanish translation.
- [SECURITY.md](SECURITY.md): the threat model and how to report a problem.
- [CONTRIBUTING.md](CONTRIBUTING.md): the rules for changes.
- [CHANGELOG](CHANGELOG.md): what changed in each version.

## License

MIT. See [LICENSE](LICENSE).
