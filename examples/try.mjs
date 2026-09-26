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
