// One-off fixup: the AppError codemod emitted default imports for named exports.
import { readFileSync, writeFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

const ROOT = new URL("../src/lib", import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1");

function walk(dir) {
  const out = [];
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) out.push(...walk(p));
    else if (name.endsWith(".ts")) out.push(p);
  }
  return out;
}

let n = 0;
for (const file of walk(ROOT)) {
  const src = readFileSync(file, "utf8");
  const next = src
    .replace('import AppError from "@/lib/api/errors";', 'import { AppError } from "@/lib/api/errors";')
    .replace(
      'import DeviceCommandError from "@/lib/api/errors";',
      'import { DeviceCommandError } from "@/lib/api/errors";',
    );
  if (next !== src) {
    writeFileSync(file, next, "utf8");
    n += 1;
  }
}
console.log("fixed", n);
