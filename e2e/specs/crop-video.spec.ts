import { resolve } from "node:path";
import { byText } from "../support/selectors";
import { dropFile } from "../support/drag-drop";
import { jsClick } from "../support/click";
import { getVideoDimensions } from "../support/ffmpeg";
import { dragCropHandle } from "../support/crop";

describe("crop video", () => {
  it("dragging a crop handle changes the selection", async () => {
    const samplePath = resolve(import.meta.dirname, "../fixtures/sample.mp4");
    await dropFile(samplePath);

    const filenameLabel = await byText("sample.mp4");
    await filenameLabel.waitForDisplayed({ timeout: 5000 });

    const sourceDimensions = getVideoDimensions(samplePath);
    expect(sourceDimensions).not.toBeNull();

    await dragCropHandle("se", -80, -80);

    // The indicator only renders once the selection differs from the
    // untouched full-frame default (edit-video.tsx's cropChanged check) —
    // its presence, with dimensions smaller than the source, proves the
    // handler actually moved the crop rect, independent of job submission.
    const indicator = await $("[data-crop-indicator]");
    await indicator.waitForDisplayed({ timeout: 5000 });
    const text = await indicator.getText();
    const match = text.match(/Crop: (\d+)×(\d+) at (\d+),(\d+)/);
    expect(match).not.toBeNull();
    expect(Number(match![1])).toBeLessThan(sourceDimensions!.width);
    expect(Number(match![2])).toBeLessThan(sourceDimensions!.height);
  });

  it("crops a video to a smaller region", async () => {
    const samplePath = resolve(import.meta.dirname, "../fixtures/sample.mp4");
    await dropFile(samplePath);

    const filenameLabel = await byText("sample.mp4");
    await filenameLabel.waitForDisplayed({ timeout: 5000 });

    const sourceDimensions = getVideoDimensions(samplePath);
    expect(sourceDimensions).not.toBeNull();

    await dragCropHandle("se", -80, -80);

    const doneCountBefore = await $$("//*[contains(text(), 'Done')]").length;

    const submitButton = await byText("Submit job");
    await jsClick(submitButton);

    await browser.waitUntil(
      async () =>
        (await $$("//*[contains(text(), 'Done')]").length) > doneCountBefore,
      { timeout: 20000, timeoutMsg: "expected the crop job to complete" },
    );

    const outputPath = resolve(
      import.meta.dirname,
      "../../.development/output/edit-video/sample-edit.mp4",
    );
    const outputDimensions = getVideoDimensions(outputPath);
    expect(outputDimensions).not.toBeNull();
    expect(outputDimensions!.width).toBeLessThan(sourceDimensions!.width);
    expect(outputDimensions!.height).toBeLessThan(sourceDimensions!.height);
  });
});
