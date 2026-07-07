import { resolve } from "node:path";
import { byText } from "../support/selectors";
import { dropFile } from "../support/drag-drop";

describe("cut video", () => {
  it("accepts a video dropped onto the window", async () => {
    const samplePath = resolve(import.meta.dirname, "../fixtures/sample.mp4");

    // Make sure the app has actually mounted and useFileDrop's listener is
    // registered before we emit — otherwise the drop event can fire into
    // the void on a freshly launched window.
    const dropZone = await byText("Drag & drop a video here");
    await dropZone.waitForDisplayed({ timeout: 10000 });

    await dropFile(samplePath);

    const filenameLabel = await byText("sample.mp4");
    await filenameLabel.waitForDisplayed({ timeout: 5000 });
  });

  it("rejects a dropped file with an unsupported extension", async () => {
    const unsupportedPath = resolve(import.meta.dirname, "../fixtures/unsupported.txt");

    await dropFile(unsupportedPath);

    const errorToast = await byText("Not a supported video file");
    await errorToast.waitForDisplayed({ timeout: 5000 });
  });
});
