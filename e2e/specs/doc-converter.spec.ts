import { resolve } from "node:path";
import { byText } from "../support/selectors";
import { dropFile } from "../support/drag-drop";
import { openTool } from "../support/navigate";

describe("doc converter", () => {
  it("rejects a dropped file with an unsupported extension", async () => {
    await openTool("Doc Converter");

    const dropZone = await byText("Drag & drop a document here");
    await dropZone.waitForDisplayed({ timeout: 10000 });

    const unsupportedPath = resolve(import.meta.dirname, "../fixtures/unsupported.txt");
    await dropFile(unsupportedPath);

    const errorToast = await byText("Not a supported document file");
    await errorToast.waitForDisplayed({ timeout: 5000 });
  });
});
