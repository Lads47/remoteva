// Minifie src/lib/stat/tracker.src.js vers src/lib/stat/tracker.generated.ts.
// Usage : node scripts/stat-build-tracker.mjs
import fs from "node:fs";
import path from "node:path";
import { buildTracker } from "./stat-tracker-lib.mjs";

const out = path.join(process.cwd(), "src", "lib", "stat", "tracker.generated.ts");
const code = await buildTracker();
fs.writeFileSync(
  out,
  `// Généré par scripts/stat-build-tracker.mjs depuis tracker.src.js — ne pas modifier.\nexport const TRACKER_JS = ${JSON.stringify(code)};\n`
);
console.log(`tracker : ${Buffer.byteLength(code)} octets → ${path.relative(process.cwd(), out)}`);
