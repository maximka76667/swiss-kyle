import { Socket } from "node:net";
import psList from "ps-list";

async function isProcessRunning(namePattern: string): Promise<boolean> {
  // Sidecar binaries keep their full filename, target triple included
  // (e.g. nats-server-x86_64-pc-windows-msvc.exe / nats-server-x86_64-unknown-linux-gnu),
  // so match with a substring rather than an exact name. ps-list works the
  // same way on Windows and Linux, no OS-specific process tool needed.
  //
  // Pass "swiss-kyle-worker", not "worker" — bare "worker" matches Linux's
  // own kernel worker threads (kworker/*, *_kthread_worker/*), which always
  // exist and never exit, so a check for "worker" alone silently always
  // returns true on Linux regardless of whether the actual sidecar is
  // running. Confirmed by direct investigation: this made the window-close
  // test wait out its full timeout and fail even though nats-server (a name
  // with no such collision) correctly reported dead within a second of the
  // real close. The worker binary is named "swiss-kyle-worker-<triple>"
  // specifically so this match can't collide with anything else again.
  const list = await psList();
  return list.some((p) => p.name.includes(namePattern));
}

function canConnect(port: number, host = "127.0.0.1"): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = new Socket();
    socket.setTimeout(1000);
    socket.once("connect", () => {
      socket.destroy();
      resolve(true);
    });
    socket.once("error", () => resolve(false));
    socket.once("timeout", () => {
      socket.destroy();
      resolve(false);
    });
    socket.connect(port, host);
  });
}

describe("sidecars", () => {
  it("spawns the nats-server process", async () => {
    await browser.waitUntil(() => isProcessRunning("nats-server"), {
      timeout: 45000,
      interval: 500,
      timeoutMsg: "nats-server never appeared in the process list",
    });
  });

  it("spawns worker processes", async () => {
    await browser.waitUntil(() => isProcessRunning("swiss-kyle-worker"), {
      timeout: 45000,
      interval: 500,
      timeoutMsg: "worker never appeared in the process list",
    });
  });

  it("accepts connections on the NATS port", async () => {
    await browser.waitUntil(() => canConnect(4222), {
      timeout: 45000,
      interval: 500,
      timeoutMsg: "NATS server never accepted a connection on port 4222",
    });
  });

  it("kills sidecars when the window is closed normally", async () => {
    // Ask Tauri itself to close the window, through the same IPC bridge the
    // app's own UI would use. This goes through the real
    // WindowEvent::CloseRequested -> RunEvent::ExitRequested path (which is
    // what actually runs the sidecar-cleanup code in lib.rs), identically on
    // Windows and Linux. No OS-specific window-manager tool involved.
    //
    // browser.closeWindow()/WDIO's own end-of-session teardown force-kill
    // the process instead and never give that cleanup handler a chance to
    // run, so they can't be used to test this.
    //
    // On Linux the window can close fast enough that the HTTP response for
    // *this very call* never gets sent — the webview serving the WebDriver
    // session is gone before it can reply, so the call itself throws
    // ("Session terminated without a reply" / "invalid session id"), even
    // though the close succeeded. Confirmed by direct investigation: process
    // snapshots taken every 150ms show the sidecars and app exiting cleanly,
    // in the right order, with no crash signal anywhere (no coredump, no
    // kernel log entry) — every single time, including with zero delay and
    // with the session kept continuously active via pings right up to the
    // close call. So this error is the expected shape of a successful close
    // on this platform, not a real failure — swallow it and verify the
    // actual thing under test (do the sidecars really die) below. Windows
    // apparently flushes the response before the teardown completes, so it
    // doesn't hit this, but nothing here should depend on that being
    // guaranteed.
    try {
      await browser.execute(() => {
        return (window as any).__TAURI_INTERNALS__.invoke("plugin:window|close", {
          label: "main",
        });
      });
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      const expected = /session terminated without a reply|invalid session id|page crash or hang/i;
      if (!expected.test(message)) throw e;
    }

    // Poll with plain waits, not browser.waitUntil: the WebDriver session
    // is no longer valid once the last window closes.
    const deadline = Date.now() + 15000;
    while (Date.now() < deadline) {
      if (
        !(await isProcessRunning("nats-server")) &&
        !(await isProcessRunning("swiss-kyle-worker"))
      ) {
        return;
      }
      await new Promise((r) => setTimeout(r, 500));
    }
    throw new Error(
      "nats-server/worker were still running after a normal window close",
    );
  });
});
