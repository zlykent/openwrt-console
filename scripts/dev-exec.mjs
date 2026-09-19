// Dev helper: run a single command on the configured device over SSH and
// print stdout/stderr. Used for verification and config safety-net checks.
// Usage: node scripts/dev-exec.mjs "<shell command>"
import { readFileSync, writeSync } from "node:fs";
import { Client } from "ssh2";

const env = {};
for (const line of readFileSync(new URL("../.env.local", import.meta.url), "utf8").split(/\r?\n/)) {
  const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
  if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, "");
}

const cmd = process.argv[2];
if (!cmd) {
  console.error("usage: node scripts/dev-exec.mjs \"<command>\"");
  process.exit(2);
}

const conn = new Client();
conn
  .on("ready", () => {
    conn.exec(cmd, (err, stream) => {
      if (err) {
        console.error("EXEC_ERR", err.message);
        conn.end();
        process.exit(1);
      }
      let out = "";
      let eout = "";
      stream.on("data", (d) => (out += d.toString()));
      stream.stderr.on("data", (d) => (eout += d.toString()));
      stream.on("close", () => {
        // Synchronous writes: `process.stdout.write` followed by `process.exit`
        // truncates long output when stdout is a pipe rather than a tty, which
        // silently loses the tail of the evidence this script exists to collect.
        writeSync(1, out);
        if (eout) writeSync(2, eout);
        conn.end();
        process.exit(0);
      });
    });
  })
  .on("error", (e) => {
    console.error("CONN_ERR", e.message);
    process.exit(1);
  })
  .connect({
    host: env.OWRT_HOST,
    port: Number(env.OWRT_PORT || 22),
    username: env.OWRT_USER,
    password: env.OWRT_PASSWORD,
    readyTimeout: 15000,
  });
