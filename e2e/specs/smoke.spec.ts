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

  it("opens a native window with the expected title", async () => {
    await browser.waitUntil(() => nativeWindowTitle() !== "", {
      timeout: 10000,
      timeoutMsg: "native window title never populated",
      interval: 300,
    });
    expect(nativeWindowTitle()).toBe("Swiss Kyle");
  });
});
