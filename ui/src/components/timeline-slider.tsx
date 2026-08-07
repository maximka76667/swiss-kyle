import { useRef } from "react";

function formatTime(secs: number): string {
  const m = Math.floor(secs / 60);
  const s = Math.floor(secs % 60);
  const ds = Math.floor((secs % 1) * 10);
  return `${m}:${s.toString().padStart(2, "0")}.${ds}`;
}

interface TimelineSliderProps {
  duration: number;
  startSecs: number;
  endSecs: number;
  currentTime: number;
  onChange: (start: number, end: number) => void;
  onSeek: (secs: number) => void;
}

export function TimelineSlider({
  duration,
  startSecs,
  endSecs,
  currentTime,
  onChange,
  onSeek,
}: TimelineSliderProps) {
  const containerRef = useRef<HTMLDivElement>(null);

  const startPct = (startSecs / duration) * 100;
  const endPct = (endSecs / duration) * 100;
  const playPct = (currentTime / duration) * 100;

  function secsAt(rect: DOMRect, clientX: number): number {
    const pct = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
    return Math.round(pct * duration * 10) / 10;
  }

  function handleHandlePointerDown(e: React.PointerEvent<HTMLDivElement>) {
    e.preventDefault();
    e.stopPropagation();
    e.currentTarget.setPointerCapture(e.pointerId);
  }

  function handlePointerMove(
    e: React.PointerEvent<HTMLDivElement>,
    applyChange: (secs: number) => void,
  ) {
    if (!e.currentTarget.hasPointerCapture(e.pointerId)) return;
    const rect = containerRef.current!.getBoundingClientRect();
    applyChange(secsAt(rect, e.clientX));
  }

  return (
    <div className="flex flex-col gap-1.5">
      <div
        ref={containerRef}
        className="relative h-12 select-none cursor-pointer"
        onPointerDown={(e) =>
          onSeek(secsAt(e.currentTarget.getBoundingClientRect(), e.clientX))
        }
      >
        {/* Track */}
        <div className="absolute inset-0 overflow-hidden rounded bg-muted">
          {/* Dim: before start */}
          <div
            className="absolute inset-y-0 left-0 bg-background/60"
            style={{ width: `${startPct}%` }}
          />
          {/* Dim: after end */}
          <div
            className="absolute inset-y-0 right-0 bg-background/60"
            style={{ width: `${100 - endPct}%` }}
          />
          {/* Selected region border */}
          <div
            className="pointer-events-none absolute inset-y-0 border-y-2 border-primary"
            style={{ left: `${startPct}%`, width: `${endPct - startPct}%` }}
          />
        </div>

        {/* Playhead */}
        <div
          className="pointer-events-none absolute inset-y-0 z-20 w-0.5 bg-red-500"
          style={{ left: `${playPct}%` }}
        />

        {/* Left handle */}
        <div
          className="absolute inset-y-0 z-10 flex w-3 cursor-ew-resize items-center justify-center rounded-l bg-primary"
          style={{ left: `${startPct}%`, transform: "translateX(-100%)" }}
          onPointerDown={handleHandlePointerDown}
          onPointerMove={(e) =>
            handlePointerMove(e, (secs) =>
              onChange(Math.min(secs, endSecs - 0.1), endSecs),
            )
          }
        >
          <div className="h-3 w-px rounded bg-primary-foreground/50" />
        </div>

        {/* Right handle */}
        <div
          className="absolute inset-y-0 z-10 flex w-3 cursor-ew-resize items-center justify-center rounded-r bg-primary"
          style={{ left: `${endPct}%` }}
          onPointerDown={handleHandlePointerDown}
          onPointerMove={(e) =>
            handlePointerMove(e, (secs) =>
              onChange(startSecs, Math.max(secs, startSecs + 0.1)),
            )
          }
        >
          <div className="h-3 w-px rounded bg-primary-foreground/50" />
        </div>
      </div>

      {/* Time labels */}
      <div className="flex justify-between text-xs text-muted-foreground">
        <span>{formatTime(startSecs)}</span>
        <span>{formatTime(currentTime)}</span>
        <span>{formatTime(endSecs)}</span>
      </div>
    </div>
  );
}
