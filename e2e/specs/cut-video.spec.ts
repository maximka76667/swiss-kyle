import { basename, resolve } from "node:path";
import { byText } from "../support/selectors";
import { dropFile } from "../support/drag-drop";
import { jsClick } from "../support/click";
import { countDecodedVideoFrames } from "../support/ffmpeg";

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
    const unsupportedPath = resolve(
      import.meta.dirname,
      "../fixtures/unsupported.txt",
    );

    await dropFile(unsupportedPath);

    const errorToast = await byText("Not a supported video file");
    await errorToast.waitForDisplayed({ timeout: 5000 });
  });

  it("processes a submitted cut job to completion", async () => {
    // sample.mp4 is 3s long; cut a 1s range so ffmpeg has real work to do.
    const endSecs = await $("#end-secs");
    await endSecs.setValue("1");

    const submitButton = await byText("Submit job");
    await jsClick(submitButton);

    // Job history sidebar is open by default (SidebarProvider's defaultOpen).
    const doneBadge = await byText("Done");
    await doneBadge.waitForDisplayed({ timeout: 20000 });
  });

  it("keeps the video stream when cutting a real phone-recorded clip", async () => {
    // This exact clip is what originally surfaced a real bug (fixed in
    // 8b35908, see edit_video.rs, formerly cut_video.rs): phone recordings can space
    // keyframes far enough apart that a short `-c copy` cut contains none
    // at all, so ffmpeg wrote an audio-only file and still exited 0 — a
    // "Done" status can't tell that apart from a real cut, only decoding
    // the output and counting actual video frames can.
    const mobilePath = resolve(
      import.meta.dirname,
      "../fixtures/phone-sparse-keyframes.mp4",
    );
    await dropFile(mobilePath);

    const filenameLabel = await byText("phone-sparse-keyframes.mp4");
    await filenameLabel.waitForDisplayed({ timeout: 5000 });

    // Fixture is ~4.12s; cut a 1s range well within it.
    const endSecs = await $("#end-secs");
    await endSecs.setValue("1");

    // Not byText("Done"): the previous test already left a "Done" badge in
    // the job history sidebar, so a plain contains(text(), 'Done') match
    // resolves against that stale badge instantly instead of waiting for
    // this job — the test would then read the output file before ffmpeg
    // finished writing it. Track the count and wait for it to grow instead.
    const doneCountBefore = await $$("//*[contains(text(), 'Done')]").length;

    const submitButton = await byText("Submit job");
    await jsClick(submitButton);

    await browser.waitUntil(
      async () =>
        (await $$("//*[contains(text(), 'Done')]").length) > doneCountBefore,
      { timeout: 20000, timeoutMsg: "expected the cut job to complete" },
    );

    const outputPath = resolve(
      import.meta.dirname,
      "../../.development/output/edit-video/phone-sparse-keyframes-edit.mp4",
    );
    expect(countDecodedVideoFrames(outputPath)).toBeGreaterThan(0);
  });

  it("submits successfully without touching any controls", async () => {
    // Default/untouched job: drop a video, change nothing (no trim, no
    // crop), and submit as soon as it's possible to. Regresses if metadata
    // loading is slow enough to make "Submit job" feel stuck disabled, or
    // if an untouched submission is broken/slow for some other reason.
    const samplePath = resolve(import.meta.dirname, "../fixtures/sample.mp4");
    await dropFile(samplePath);

    const filenameLabel = await byText("sample.mp4");
    await filenameLabel.waitForDisplayed({ timeout: 5000 });

    const submitButton = await $("button*=Submit job");
    await submitButton.waitForEnabled({ timeout: 10000 });

    const doneCountBefore = await $$("//*[contains(text(), 'Done')]").length;
    await jsClick(submitButton);

    await browser.waitUntil(
      async () =>
        (await $$("//*[contains(text(), 'Done')]").length) > doneCountBefore,
      { timeout: 20000, timeoutMsg: "expected the untouched job to complete" },
    );
  });

  it("stays usable after loading several videos in a row", async () => {
    // Drop one video, then another, then another — without waiting for any
    // of the earlier ones to finish processing. Each new drop resets
    // metadata-derived state (edit-video.tsx's applyFile); this must not
    // leave "Submit job" or the trim inputs permanently stuck disabled once
    // the *latest* video's own metadata has loaded.
    const paths = [
      resolve(import.meta.dirname, "../fixtures/sample.mp4"),
      resolve(import.meta.dirname, "../fixtures/phone-sparse-keyframes.mp4"),
      resolve(import.meta.dirname, "../fixtures/sample.mp4"),
    ];

    const submitButton = await $("button*=Submit job");
    const endSecsInput = await $("#end-secs");

    for (const path of paths) {
      await dropFile(path);

      const label = await byText(basename(path));
      await label.waitForDisplayed({ timeout: 5000 });

      await submitButton.waitForEnabled({ timeout: 10000 });
      expect(await endSecsInput.isEnabled()).toBe(true);
    }

    // Submit whichever video ended up loaded last and confirm the pipeline
    // still actually works, not just that the button looks enabled.
    const doneCountBefore = await $$("//*[contains(text(), 'Done')]").length;
    await jsClick(submitButton);

    await browser.waitUntil(
      async () =>
        (await $$("//*[contains(text(), 'Done')]").length) > doneCountBefore,
      {
        timeout: 20000,
        timeoutMsg: "expected the job after repeated loads to complete",
      },
    );
  });
});
