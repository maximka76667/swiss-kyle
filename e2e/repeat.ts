// Repeatedly runs the full e2e suite against the already-built app binary,
// to check for flakiness across many runs without rebuilding each time.
// Usage: bun repeat.ts [count]   (defaults to 10)
import { spawnSync } from "node:child_process";
import { resolve } from "node:path";

const COUNT = Number(process.argv[2] ?? 10);
const wdioBin = resolve(
  import.meta.dirname,
  `node_modules/.bin/wdio${process.platform === "win32" ? ".cmd" : ""}`,
);

let passed = 0;
const failedRuns: number[] = [];

for (let i = 1; i <= COUNT; i++) {
  console.log(`\n=== Run ${i}/${COUNT} ===`);
  const result = spawnSync(wdioBin, ["run", "./wdio.conf.ts"], {
    cwd: import.meta.dirname,
    stdio: "inherit",
  });
  if (result.status === 0) {
    passed++;
  } else {
    failedRuns.push(i);
  }
}

console.log(`\n=== SUMMARY: ${passed}/${COUNT} passed ===`);
if (failedRuns.length > 0) {
  console.log(`Failed runs: ${failedRuns.join(", ")}`);
}
process.exit(failedRuns.length > 0 ? 1 : 0);
