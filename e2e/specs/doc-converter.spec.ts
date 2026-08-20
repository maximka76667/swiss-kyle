import { resolve } from "node:path";
import { byText } from "../support/selectors";
import { dropFile } from "../support/drag-drop";
import { openTool } from "../support/navigate";
import { jsClick } from "../support/click";

describe("doc converter", () => {
  it("rejects a dropped file with an unsupported extension", async () => {
    await openTool("Doc Converter");

    const dropZone = await byText("Drag & drop a document here");
    await dropZone.waitForDisplayed({ timeout: 10000 });

    const unsupportedPath = resolve(
      import.meta.dirname,
      "../fixtures/unsupported.txt",
    );
    await dropFile(unsupportedPath);

    const errorToast = await byText("Not a supported document file");
    await errorToast.waitForDisplayed({ timeout: 5000 });
  });

  it("reaches a Failed status instead of hanging on a corrupt docx (#4)", async () => {
    // empty.docx is the empty (0-byte) file attached to
    // github.com/maximka76667/swiss-kyle/issues/4. Its .docx extension
    // passes the drop-zone's extension-only validation, so the job gets
    // submitted and reaches convert_document.rs's pandoc path (md/html
    // output, not the LibreOffice/Word pdf path), where pandoc exits
    // non-zero on the empty container. The regression this guards against
    // is the job never resolving to a terminal state in the UI.
    await openTool("Doc Converter");

    const dropZone = await byText("Drag & drop a document here");
    await dropZone.waitForDisplayed({ timeout: 10000 });

    const emptyPath = resolve(import.meta.dirname, "../fixtures/empty.docx");
    await dropFile(emptyPath);

    const filenameLabel = await byText("empty.docx");
    await filenameLabel.waitForDisplayed({ timeout: 5000 });

    const formatSelect = await $("#doc-to-format");
    await formatSelect.selectByAttribute("value", "html");

    // Not byText: "Convert" also matches the page title ("Document
    // Converter") and description text, both of which sort before the
    // actual button in document order.
    const submitButton = await $("//button[contains(text(), 'Convert')]");
    await jsClick(submitButton);

    const failedBadge = await byText("Failed");
    await failedBadge.waitForDisplayed({ timeout: 20000 });
  });
});
