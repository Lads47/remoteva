import path from "node:path";
import { transform } from "esbuild";
import fs from "node:fs";

export async function buildTracker() {
  const src = fs.readFileSync(path.join(process.cwd(), "src", "lib", "stat", "tracker.src.js"), "utf8");
  const { code } = await transform(src, { minify: true, target: "es2017", legalComments: "none" });
  return code.trim();
}
