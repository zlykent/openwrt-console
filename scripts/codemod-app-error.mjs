// One-off codemod: turn deliberate `throw new Error(...)` sites in the device
// layer into `AppError` / `DeviceCommandError` so their operator-facing message
// survives `mapError` instead of being masked as "Something went wrong".
// Usage: node scripts/codemod-app-error.mjs [--dry]
import { readFileSync, writeFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const ROOT = new URL("../src/lib", import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1");
const DRY = process.argv.includes("--dry");

function walk(dir) {
  const out = [];
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    const st = statSync(p);
    if (st.isDirectory()) out.push(...walk(p));
    else if (name.endsWith(".ts") && !name.endsWith(".test.ts")) out.push(p);
  }
  return out;
}

const IMPORT_RE = /^import\s[\s\S]*?from\s+["'][^"']+["'];\s*$/gm;

let touched = 0;
for (const file of walk(ROOT)) {
  if (file.endsWith("api/errors.ts")) continue;
  let src = readFileSync(file, "utf8");
  if (!src.includes("throw new Error(")) continue;

  const used = new Set();
  src = src.replace(/throw new Error\(([^;\n]*)\);/g, (_m, arg) => {
    const cls = /\.std(err|out)\b/.test(arg) ? "DeviceCommandError" : "AppError";
    used.add(cls);
    return `throw new ${cls}(${arg});`;
  });
  if (used.size === 0) continue;

  // A comparator has to look at both operands; ranking by "is AppError" keeps
  // the import spec stable without an inconsistent sort.
  const names = [...used].sort((a, b) => Number(b === "AppError") - Number(a === "AppError"));
  const spec = names.length === 1 ? names[0] : `{ ${names.join(", ")} }`;
  const importLine = `import ${spec} from "@/lib/api/errors";`;

  if (!src.includes(importLine)) {
    let lastEnd = -1;
    for (const m of src.matchAll(IMPORT_RE)) lastEnd = m.index + m[0].length;
    if (lastEnd < 0) {
      // No import block: place the import after the leading file-level comment.
      const lead = src.match(/^\/\*\*[\s\S]*?\*\/\s*\n/);
      lastEnd = lead ? lead[0].length : 0;
    }
    // Trim trailing blank lines of the import block, then re-add one blank line.
    const head = src.slice(0, lastEnd).replace(/\s+$/, "");
    src = `${head}\n${importLine}\n${src.slice(lastEnd).replace(/^\s*\n/, "\n")}`;
  }

  touched += 1;
  const rel = relative(new URL("..", import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1"), file);
  console.log(`${DRY ? "[dry] " : ""}${rel}  ->  ${names.join(", ")}`);
  if (!DRY) writeFileSync(file, src, "utf8");
}
console.log(`${DRY ? "[dry] " : ""}files touched: ${touched}`);
