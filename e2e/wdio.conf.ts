import { spawn, execSync, type ChildProcess } from "node:child_process";
import { createConnection } from "node:net";
import { resolve } from "node:path";

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
        application: resolve(import.meta.dirname, "../target/debug/app.exe"),
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
    viteProcess = spawn("bun", ["dev"], {
      cwd: resolve(import.meta.dirname, "../ui"),
      stdio: "ignore",
    });
    await waitForPort(5173);

    tauriDriverProcess = spawn("tauri-driver", [], {
      stdio: "ignore",
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
  onComplete: () => {
    for (const proc of [viteProcess, tauriDriverProcess]) {
      if (proc?.pid) {
        try {
          execSync(`taskkill /pid ${proc.pid} /T /F`);
        } catch {
          // already dead
        }
      }
    }
  },
};
