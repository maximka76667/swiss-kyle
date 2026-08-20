/** Restricts `v` to the inclusive range `[min, max]`. */
export function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v));
}

export interface Letterbox {
  scale: number;
  offsetX: number;
  offsetY: number;
}

/**
 * Computes the scale factor and x/y offset of a `contentWidth`×`contentHeight`
 * box centered and scaled to fit inside `elRect` without distortion — i.e.
 * the same placement CSS `object-fit: contain` produces. Multiply a
 * content-space coordinate by `scale` and add the offset to get its position
 * within `elRect`; subtract the offset and divide by `scale` to go the other
 * way.
 *
 * Exists because a `<video>` (or anything else using `object-fit: contain`)
 * only fills its box exactly when their aspect ratios match — otherwise the
 * actually-visible content is a smaller, centered sub-rect, not the full
 * box. An overlay positioned on top (e.g. a crop-selection rectangle) has to
 * map through this or it drifts away from the real content whenever the
 * aspect ratios differ (e.g. a portrait clip inside a 16:9 box).
 */
export function letterbox(
  elRect: { width: number; height: number },
  contentWidth: number,
  contentHeight: number,
): Letterbox {
  const scale = Math.min(
    elRect.width / contentWidth,
    elRect.height / contentHeight,
  );
  return {
    scale,
    offsetX: (elRect.width - contentWidth * scale) / 2,
    offsetY: (elRect.height - contentHeight * scale) / 2,
  };
}
