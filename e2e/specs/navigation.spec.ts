import { byText } from "../support/selectors";
import { openTool } from "../support/navigate";

describe("navigation", () => {
  it("opens Doc Converter", async () => {
    await openTool("Doc Converter");
    const marker = await byText("Drag & drop a document here");
    await marker.waitForDisplayed({ timeout: 5000 });
  });

  it("opens Merge PDFs", async () => {
    await openTool("Merge PDFs");
    const marker = await byText("Drag & drop PDFs here");
    await marker.waitForDisplayed({ timeout: 5000 });
  });

  it("opens Diagnostics", async () => {
    await openTool("Diagnostics");
    const marker = await byText("Job Log");
    await marker.waitForDisplayed({ timeout: 5000 });
  });

  it("opens Cut Video", async () => {
    await openTool("Cut Video");
    const marker = await byText("Drag & drop a video here");
    await marker.waitForDisplayed({ timeout: 5000 });
  });
});
