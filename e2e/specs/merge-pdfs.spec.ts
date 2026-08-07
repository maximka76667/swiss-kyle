import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { byText } from "../support/selectors";
import { dropFile } from "../support/drag-drop";
import { openTool } from "../support/navigate";
import { jsClick } from "../support/click";

describe("merge pdfs", () => {
  it("rejects a dropped file that isn't a PDF", async () => {
    await openTool("Merge PDFs");

    const dropZone = await byText("Drag & drop PDFs here");
    await dropZone.waitForDisplayed({ timeout: 10000 });

    const unsupportedPath = resolve(
      import.meta.dirname,
      "../fixtures/unsupported.txt",
    );
    await dropFile(unsupportedPath);

    const errorToast = await byText("Not a PDF");
    await errorToast.waitForDisplayed({ timeout: 5000 });
  });

  it("overwrites the previous output on a repeat merge with the same title", async () => {
    // pdfcpu refuses to overwrite by default; merge_pdfs.rs passes --force
    // specifically so re-running a merge with an unchanged output title
    // succeeds and actually replaces the file, instead of failing the job.
    // Merging (a, b) then (b, a) into the same "merged" output title proves
    // both: the second submit doesn't fail, and the file on disk was really
    // rewritten (reversing page order changes the output bytes) rather than
    // the job reporting success without touching the existing file.
    const outputPath = resolve(
      import.meta.dirname,
      "../../.development/output/merge-pdfs/merged.pdf",
    );

    const sampleA = resolve(import.meta.dirname, "../fixtures/sample-a.pdf");
    const sampleB = resolve(import.meta.dirname, "../fixtures/sample-b.pdf");
    await dropFile(sampleA);
    await dropFile(sampleB);

    const secondFile = await byText("sample-b.pdf");
    await secondFile.waitForDisplayed({ timeout: 5000 });

    // Not byText: "Merge {entries.length > 0 ? `(${count})` : ''}" renders
    // as two separate DOM text nodes ("Merge " and "(2)"), which byText's
    // `contains(text(), ...)` can't see across — text() only inspects one
    // child text node at a time. `.` (element string-value) concatenates
    // descendant text nodes, and matching on the literal "(" excludes the
    // sidebar nav item, which is also a <button> reading "Merge PDFs".
    const submitButton = await $("//button[contains(., 'Merge (')]");
    await jsClick(submitButton);

    const firstDone = await byText("Done");
    await firstDone.waitForDisplayed({ timeout: 20000 });
    const firstResult = readFileSync(outputPath);

    // Swap the row order (a, b) -> (b, a) via the list's own reorder
    // control, then resubmit against the same output title.
    const moveUp = await $('button[title="Move up"]:not([disabled])');
    await jsClick(moveUp);
    await jsClick(submitButton);

    await browser.waitUntil(
      async () => (await $$("//*[contains(text(), 'Done')]").length) >= 2,
      {
        timeout: 20000,
        timeoutMsg:
          "expected the second merge (same output title) to also complete instead of failing on an overwrite refusal",
      },
    );
    const secondResult = readFileSync(outputPath);

    expect(Buffer.compare(firstResult, secondResult)).not.toBe(0);
  });
});
