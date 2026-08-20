import { basename, resolve } from "node:path";
import { byText } from "./selectors";
import { dropFile } from "./drag-drop";
import { dragCropHandle } from "./crop";

export const SAMPLE = resolve(import.meta.dirname, "../fixtures/sample.mp4");
export const PHONE = resolve(
  import.meta.dirname,
  "../fixtures/phone-sparse-keyframes.mp4",
);

export type Corner = "nw" | "ne" | "sw" | "se";

// Pulls each corner inward toward the frame's center, regardless of which
// corner it is — sign of dx/dy has to flip per corner or e.g. "ne" would
// drag itself off the video entirely instead of shrinking the selection.
const CORNER_DELTAS: Record<Corner, [number, number]> = {
  nw: [40, 40],
  ne: [-40, 40],
  sw: [40, -40],
  se: [-40, -40],
};

export async function loadVideo(path: string) {
  await dropFile(path);
  const label = await byText(basename(path));
  await label.waitForDisplayed({ timeout: 5000 });
  await $("button*=Submit job").waitForEnabled({ timeout: 10000 });
}

export async function cropOnce(corner: Corner, context: string) {
  const [dx, dy] = CORNER_DELTAS[corner];
  await dragCropHandle(corner, dx, dy);
  const indicator = await $("[data-crop-indicator]");
  await indicator.waitForDisplayed({
    timeout: 5000,
    timeoutMsg: `crop indicator never appeared ${context}`,
  });
}
