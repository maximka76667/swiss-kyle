import { resolve } from "node:path";
import { byText } from "../support/selectors";
import { dropFile } from "../support/drag-drop";
import { openTool } from "../support/navigate";

describe("merge pdfs", () => {
  it("rejects a dropped file that isn't a PDF", async () => {
    await openTool("Merge PDFs");

    const dropZone = await byText("Drag & drop PDFs here");
    await dropZone.waitForDisplayed({ timeout: 10000 });

    const unsupportedPath = resolve(import.meta.dirname, "../fixtures/unsupported.txt");
    await dropFile(unsupportedPath);

    const errorToast = await byText("Not a PDF");
    await errorToast.waitForDisplayed({ timeout: 5000 });
  });
});
