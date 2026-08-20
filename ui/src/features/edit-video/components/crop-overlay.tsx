import { useLayoutEffect, useRef, useState } from "react";
import { clamp, letterbox } from "@/features/edit-video/lib/utils";
import { CropRect } from "@/types/jobs";

interface CropOverlayProps {
  videoWidth: number; // native px
  videoHeight: number; // native px
  crop: CropRect; // native px
  onChange: (crop: CropRect) => void;
}

const MIN_SIZE = 20; // native px

type Corner = "nw" | "ne" | "sw" | "se";

export function CropOverlay({
  videoWidth,
  videoHeight,
  crop,
  onChange,
}: CropOverlayProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  // Drag bookkeeping lives in a ref, not state — same approach as
  // timeline-slider.tsx's handles: only pointer capture gates whether a
  // move event should apply, so there's nothing to keep in sync with React.
  const dragStart = useRef<{ x: number; y: number; crop: CropRect } | null>(
    null,
  );

  // containerRef.current is null on the first render (refs attach during
  // commit, after render), so the rect used for *rendering* the overlay's
  // position has to live in state and be measured post-mount — otherwise the
  // overlay stays a zero-size box until something unrelated happens to
  // re-render this component. ResizeObserver also keeps it correct across
  // window/element resizes, not just the initial mount.
  const [elRect, setElRect] = useState<DOMRect | null>(null);
  useLayoutEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const update = () => setElRect(el.getBoundingClientRect());
    update();
    const observer = new ResizeObserver(update);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  function toVideoPx(clientX: number, clientY: number) {
    const elRect = containerRef.current!.getBoundingClientRect();
    const { scale, offsetX, offsetY } = letterbox(
      elRect,
      videoWidth,
      videoHeight,
    );
    return {
      x: clamp((clientX - elRect.left - offsetX) / scale, 0, videoWidth),
      y: clamp((clientY - elRect.top - offsetY) / scale, 0, videoHeight),
    };
  }

  function startDrag(e: React.PointerEvent) {
    e.preventDefault();
    e.stopPropagation();
    e.currentTarget.setPointerCapture(e.pointerId);
    const { x, y } = toVideoPx(e.clientX, e.clientY);
    dragStart.current = { x, y, crop };
  }

  function handleBodyDrag(e: React.PointerEvent) {
    if (!e.currentTarget.hasPointerCapture(e.pointerId) || !dragStart.current)
      return;
    const { x, y } = toVideoPx(e.clientX, e.clientY);
    const { crop: start, x: startX, y: startY } = dragStart.current;
    const dx = x - startX;
    const dy = y - startY;
    onChange(
      new CropRect(
        clamp(start.x + dx, 0, videoWidth - start.width),
        clamp(start.y + dy, 0, videoHeight - start.height),
        start.width,
        start.height,
      ),
    );
  }

  function handleCornerDrag(corner: Corner, e: React.PointerEvent) {
    if (!e.currentTarget.hasPointerCapture(e.pointerId) || !dragStart.current)
      return;
    const { x, y } = toVideoPx(e.clientX, e.clientY);
    const start = dragStart.current.crop;
    const minSize = Math.max(
      MIN_SIZE,
      MIN_SIZE / letterbox(
        containerRef.current!.getBoundingClientRect(),
        videoWidth,
        videoHeight,
      ).scale,
    );

    let left = start.x;
    let top = start.y;
    let width: number;
    let height: number;
    const right = start.x + start.width;
    const bottom = start.y + start.height;

    if (corner === "nw" || corner === "sw") {
      left = clamp(x, 0, right - minSize);
      width = right - left;
    } else {
      const newRight = clamp(x, left + minSize, videoWidth);
      width = newRight - left;
    }
    if (corner === "nw" || corner === "ne") {
      top = clamp(y, 0, bottom - minSize);
      height = bottom - top;
    } else {
      const newBottom = clamp(y, top + minSize, videoHeight);
      height = newBottom - top;
    }

    onChange(new CropRect(left, top, width, height));
  }

  const { scale, offsetX, offsetY } = elRect
    ? letterbox(elRect, videoWidth, videoHeight)
    : { scale: 0, offsetX: 0, offsetY: 0 };

  const renderLeft = offsetX + crop.x * scale;
  const renderTop = offsetY + crop.y * scale;
  const renderWidth = crop.width * scale;
  const renderHeight = crop.height * scale;

  const cornerCursor: Record<Corner, string> = {
    nw: "cursor-nwse-resize",
    se: "cursor-nwse-resize",
    ne: "cursor-nesw-resize",
    sw: "cursor-nesw-resize",
  };
  // Corner brackets, not dots: an L-shaped pair of borders anchored flush
  // against the rect's own corner (no negative offset/centering transform,
  // unlike the previous dot handles) so they can't be clipped by the
  // container's overflow-hidden even when the crop touches the video edge.
  const cornerPosition: Record<Corner, string> = {
    nw: "top-0 left-0 border-t-4 border-l-4",
    ne: "top-0 right-0 border-t-4 border-r-4",
    sw: "bottom-0 left-0 border-b-4 border-l-4",
    se: "bottom-0 right-0 border-b-4 border-r-4",
  };

  return (
    // pointer-events-none here is required, not decorative: this div's box
    // otherwise fully covers the <video> and — even fully transparent —
    // still intercepts every click over that whole area by default. Only
    // the crop rect and its handles opt back in with pointer-events-auto.
    <div ref={containerRef} className="pointer-events-none absolute inset-0">
      <div
        className="pointer-events-auto absolute border border-white/70"
        style={{
          left: renderLeft,
          top: renderTop,
          width: renderWidth,
          height: renderHeight,
        }}
        onPointerDown={(e) => {
          startDrag(e);
        }}
        onPointerMove={handleBodyDrag}
      >
        {(["nw", "ne", "sw", "se"] as Corner[]).map((corner) => (
          <div
            key={corner}
            data-crop-handle={corner}
            // drop-shadow follows the border's actual rendered shape (unlike
            // box-shadow, which would just outline the div's full invisible
            // bounding box) — a dark rim around the white L itself, so it
            // stays visible over light/white video content.
            className={`absolute z-10 h-5 w-5 border-white [filter:drop-shadow(0_0_1px_black)_drop-shadow(0_0_1px_black)] ${cornerCursor[corner]} ${cornerPosition[corner]}`}
            onPointerDown={(e) => startDrag(e)}
            onPointerMove={(e) => handleCornerDrag(corner, e)}
          />
        ))}
      </div>
    </div>
  );
}
