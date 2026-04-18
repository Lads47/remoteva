import { generateApiKey } from "../src/lib/apiKey";
const k = generateApiKey();
console.log("PLAINTEXT=" + k.plaintext);
console.log("HASH=" + k.hash);
console.log("PREFIX=" + k.prefix);
