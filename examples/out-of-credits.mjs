import { aiPack, corePack, defineErrorsWith } from "@edgeproc/errors";

// Your app's error list: 10 everyday codes + 9 for calling an AI service.
const errors = defineErrorsWith({}, corePack, aiPack);

// A raw failure, e.g. what fetch() returned: "402 Payment Required".
const code = errors.classify({ status: 402 });

console.log(code);
console.log(errors.describe(code));
console.log(JSON.stringify(errors.toProblemDetails(code), null, 2));
