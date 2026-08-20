import { basename } from "node:path";
import {
  SAMPLE,
  PHONE,
  type Corner,
  loadVideo,
  cropOnce,
} from "../support/crop-test-helpers";

describe("crop video stress", () => {
  it("drags every corner, across different videos, with nothing else happening in between", async function () {
    this.timeout(90000);

    // No submit, no cut, no click of any kind. Cycles through all four
    // handles (not just "se") and alternates fixtures, so a bug specific
    // to one corner's hit-test area or one video's dimensions/aspect ratio
    // wouldn't hide behind always exercising the same handle on the same
    // file.
    const corners: Corner[] = ["nw", "ne", "sw", "se"];
    const videos = [SAMPLE, PHONE];

    for (const [i, corner] of corners.entries()) {
      const path = videos[i % videos.length];
      await loadVideo(path);
      await cropOnce(corner, `for corner "${corner}" on ${basename(path)}`);
    }
  });

  it("drags more than one corner on the same selection", async function () {
    this.timeout(60000);

    // Adjusting from two different corners in a row, without re-dropping,
    // exercises the crop rect being read back and adjusted a second time
    // rather than every drag always starting from the untouched
    // full-frame default.
    for (const path of [SAMPLE, PHONE]) {
      await loadVideo(path);
      await cropOnce(
        "se",
        `after the first corner drag (se) on ${basename(path)}`,
      );
      await cropOnce(
        "nw",
        `after the second corner drag (nw) on ${basename(path)}`,
      );
    }
  });
});
