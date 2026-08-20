import { Play, Pause, Volume2, VolumeX } from "lucide-react";
import { Button } from "@shadcn/components/ui/button";
import { Slider } from "@shadcn/components/ui/slider";
import { formatTime } from "@/lib/utils";

interface VideoControlsProps {
  isPlaying: boolean;
  currentTime: number;
  duration: number;
  volume: number;
  isMuted: boolean;
  onTogglePlay: () => void;
  onSeek: (secs: number) => void;
  onToggleMute: () => void;
  onChangeVolume: (v: number) => void;
}

export function VideoControls({
  isPlaying,
  currentTime,
  duration,
  volume,
  isMuted,
  onTogglePlay,
  onSeek,
  onToggleMute,
  onChangeVolume,
}: VideoControlsProps) {
  return (
    <div className="flex items-center gap-2">
      <Button
        type="button"
        variant="outline"
        size="icon-sm"
        onClick={onTogglePlay}
        aria-label={isPlaying ? "Pause" : "Play"}
      >
        {isPlaying ? <Pause /> : <Play />}
      </Button>
      <Slider
        className="flex-1"
        min={0}
        max={duration}
        step={duration / 100}
        value={currentTime}
        onValueChange={(v) => onSeek(v as number)}
        aria-label="Seek"
      />
      <span className="text-xs text-muted-foreground tabular-nums">
        {formatTime(currentTime)} / {formatTime(duration)}
      </span>
      <div className="group/volume relative flex items-center">
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          onClick={onToggleMute}
          aria-label={isMuted || volume === 0 ? "Unmute" : "Mute"}
        >
          {isMuted || volume === 0 ? <VolumeX /> : <Volume2 />}
        </Button>
        {/* pb-2, not mb-2 — keeps the gap inside the hoverable box. */}
        <div className="absolute bottom-full left-1/2 z-20 hidden -translate-x-1/2 pb-2 group-hover/volume:flex group-focus-within/volume:flex">
          <div className="rounded-md border border-border bg-popover p-2 shadow-md">
            <Slider
              orientation="vertical"
              className="h-24"
              value={isMuted ? 0 : volume * 100}
              onValueChange={(v) => onChangeVolume((v as number) / 100)}
              aria-label="Volume"
            />
          </div>
        </div>
      </div>
    </div>
  );
}
