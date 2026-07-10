import { spawn, execSync, type ChildProcess } from "node:child_process";
import { createConnection } from "node:net";
import { resolve } from "node:path";
import { mkdir, writeFile } from "node:fs/promises";

let viteProcess: ChildProcess | undefined;
let tauriDriverProcess: ChildProcess | undefined;

// Empirically tuned via binary search — see wiki/issues/webview2-session-crash-on-fast-relaunch.
const SESSION_TEARDOWN_DELAY_MS = 4000;

function waitForPort(
  port: number,
  host = "127.0.0.1",
  timeoutMs = 30000,
): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  return new Promise((resolve, reject) => {
    const tryConnect = () => {
      const socket = createConnection(port, host);
      socket.once("connect", () => {
        socket.destroy();
        resolve();
      });
      socket.once("error", () => {
        socket.destroy();
        if (Date.now() > deadline) {
          reject(new Error(`vite dev server never opened port ${port}`));
        } else {
          setTimeout(tryConnect, 300);
        }
      });
    };
    tryConnect();
  });
}

export const config: WebdriverIO.Config = {
  hostname: "127.0.0.1",
  port: 4444,
  path: "/",
  specs: ["./specs/**/*.spec.ts"],
  maxInstances: 1,
  capabilities: [
    {
      // @ts-expect-error tauri-driver capability, not part of the standard WebDriver type
      "tauri:options": {
        // Cargo package is named "app" (see src-tauri/Cargo.toml); mainBinaryName
        // in tauri.conf.json only renames the bundled output, not this raw
        // `cargo build` artifact. Windows appends .exe, Linux/macOS don't.
        application: resolve(
          import.meta.dirname,
          `../target/debug/app${process.platform === "win32" ? ".exe" : ""}`,
        ),
      },
    },
  ],
  logLevel: "info",
  framework: "mocha",
  mochaOpts: {
    ui: "bdd",
    timeout: 60000,
  },
  reporters: ["spec"],
  onPrepare: async () => {
    // detached: true (POSIX only) makes each process its own group leader, so
    // its own children (bun's actual vite/node, tauri-driver's spawned
    // WebKitWebDriver+app) land in that same group and can be killed as a
    // unit via `process.kill(-pid, ...)` in onComplete below — without ever
    // touching this wdio process's own group, which must exit normally to
    // report the real pass/fail status. No effect on Windows, where taskkill
    // /T walks the process tree itself instead.
    const detached = process.platform !== "win32";

    viteProcess = spawn("bun", ["dev"], {
      cwd: resolve(import.meta.dirname, "../ui"),
      stdio: "ignore",
      detached,
    });
    await waitForPort(5173);

    tauriDriverProcess = spawn("tauri-driver", [], {
      stdio: "ignore",
      detached,
    });
    await waitForPort(4444);
  },
  after: async () => {
    // WDIO tears down a session by force-terminating the app process, which
    // skips the RunEvent::ExitRequested cleanup that kills nats-server/worker
    // sidecars (see lib.rs). Close the window ourselves so every spec leaves
    // a clean process list for the next one (e.g. sidecars.spec.ts's checks).
    try {
      await browser.execute(() => {
        return (window as any).__TAURI_INTERNALS__.invoke(
          "plugin:window|close",
          {
            label: "main",
          },
        );
      });
    } catch (e) {
      console.log(`[after hook] window already closed, skipping: ${e}`);
    }

    // Launching a fresh session too soon after this one crashes the next
    // app.exe almost immediately (~1.5s after launch, well before its own
    // sidecars finish starting) — see wiki/issues/webview2-session-crash-on-fast-relaunch
    // for how this was diagnosed. Not based on any observable condition (the
    // app process itself disappears from the OS process list almost
    // instantly regardless, well before whatever WebView2-internal resource
    // is actually still settling), so this is a plain empirically-tuned
    // delay, not a wait on real state.
    await new Promise((r) => setTimeout(r, SESSION_TEARDOWN_DELAY_MS));
  },
  afterTest: async (test, _context, { passed }) => {
    if (passed) return;
    try {
      const source = await browser.getPageSource();
      const dir = resolve(import.meta.dirname, ".artifacts");
      await mkdir(dir, { recursive: true });
      const file = resolve(
        dir,
        `${test.parent}-${test.title}`.replace(/[^\w.-]+/g, "_") + ".html",
      );
      await writeFile(file, source);
      console.log(`[afterTest] saved page source for failing test to ${file}`);
    } catch (e) {
      console.log(`[afterTest] failed to capture page source: ${e}`);
    }
  },
  onComplete: () => {
    for (const proc of [viteProcess, tauriDriverProcess]) {
      if (!proc?.pid) continue;
      try {
        if (process.platform === "win32") {
          execSync(`taskkill /pid ${proc.pid} /T /F`);
        } else {
          // negative pid = signal the whole group this process leads (see
          // the `detached` note in onPrepare above), not just itself.
          process.kill(-proc.pid, "SIGKILL");
        }
      } catch {
        // already dead
      }
    }
  },
};
