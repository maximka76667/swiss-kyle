import { execSync } from "node:child_process";

function nativeWindowTitle(): string {
  return execSync(
    'powershell -NoProfile -Command "(Get-Process -Name app -ErrorAction SilentlyContinue).MainWindowTitle"',
    { encoding: "utf8" },
  ).trim();
}

describe("app launches", () => {
  it("loads the frontend document", async () => {
    await browser.waitUntil(async () => (await browser.getTitle()) !== "", {
      timeout: 10000,
      timeoutMsg: "document title never populated",
      interval: 300,
    });
    const title = await browser.getTitle();
    expect(title).toBe("ui");
  });

  // Native window title is only checked on Windows: reading it on Linux
  // needs a real window manager (e.g. Xvfb + wmctrl) and would only be
  // confirming Tauri's own cross-platform behavior, not app logic.
  (process.platform === "win32" ? it : it.skip)(
    "opens a native window with the expected title",
    async () => {
      await browser.waitUntil(() => nativeWindowTitle() !== "", {
        timeout: 10000,
        timeoutMsg: "native window title never populated",
        interval: 300,
      });
      expect(nativeWindowTitle()).toBe("Swiss Kyle");
    },
  );
});
