import { aiPack, corePack, defineErrorsWith } from "@edgeproc/errors";

// Your app's list of error codes: 10 everyday ones + 9 for calling an AI service.
const errors = defineErrorsWith({}, corePack, aiPack);

// Three raw failures, the way they actually reach a catch block.
const failures = [
  { status: 402 }, // fetch() got "402 Payment Required"
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
