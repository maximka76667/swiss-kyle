import { useEffect, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { TimelineSlider } from "@/components/timeline-slider";
import { CropOverlay } from "@/components/crop-overlay";
import type { CropRect } from "@/types/jobs";

interface VideoPlayerProps {
  filePath: string;
  startSecs: number;
  endSecs: number;
  onRangeChange: (start: number, end: number) => void;
  cropRect: CropRect | null;
  onCropChange: (crop: CropRect) => void;
  onDimensionsKnown: (width: number, height: number) => void;
  // Comes from the parent's own metadata-loaded tracking, not this
  // component's local `duration`/`videoWidth` state — those only reset on
  // remount (this component is keyed by filePath), so re-dropping a file
  // whose path happens not to change would leave them stale, wrongly
  // reporting the slider as still usable against the previous load's values.
  metadataLoaded: boolean;
}

export function VideoPlayer({
  filePath,
  startSecs,
  endSecs,
  onRangeChange,
  cropRect,
  onCropChange,
  onDimensionsKnown,
  metadataLoaded,
}: VideoPlayerProps) {
  const [duration, setDuration] = useState(0);
  const [currentTime, setCurrentTime] = useState(0);
  const [videoWidth, setVideoWidth] = useState(0);
  const [videoHeight, setVideoHeight] = useState(0);
  const [src, setSrc] = useState("");
  const videoRef = useRef<HTMLVideoElement>(null);
  // Prevents canplay/durationchange firing mid-playback from resetting the
  // trim range or the native video dimensions.
  const rangeInitialized = useRef(false);

  useEffect(() => {
    invoke<string>("get_stream_url", { path: filePath }).then(setSrc);
  }, [filePath]);

  useEffect(() => {
    const video = videoRef.current;
    if (!video || !src) return;

    function trySetDuration() {
      if (rangeInitialized.current) return;
      const d = video!.duration;
      const w = video!.videoWidth;
      const h = video!.videoHeight;
      if (d && isFinite(d) && d > 0 && w > 0 && h > 0) {
        rangeInitialized.current = true;
        setDuration(d);
        setVideoWidth(w);
        setVideoHeight(h);
        onRangeChange(0, d);
        onDimensionsKnown(w, h);
      }
    }

    function onTimeUpdate() {
      setCurrentTime(video!.currentTime);
    }

    function onError() {
      console.error("VideoPlayer: error loading video", video!.error);
    }

    video.addEventListener("loadedmetadata", trySetDuration);
    video.addEventListener("durationchange", trySetDuration);
    video.addEventListener("canplay", trySetDuration);
    video.addEventListener("timeupdate", onTimeUpdate);
    video.addEventListener("error", onError);
    trySetDuration();

    return () => {
      video.removeEventListener("loadedmetadata", trySetDuration);
      video.removeEventListener("durationchange", trySetDuration);
      video.removeEventListener("canplay", trySetDuration);
      video.removeEventListener("timeupdate", onTimeUpdate);
      video.removeEventListener("error", onError);
    };
  }, [src]);

  // Seek to start when the start handle is moved
  useEffect(() => {
    if (videoRef.current && duration > 0) {
      videoRef.current.currentTime = startSecs;
    }
  }, [startSecs]);

  function seek(secs: number) {
    if (videoRef.current) {
      videoRef.current.currentTime = secs;
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="relative">
        <video
          ref={videoRef}
          className="aspect-video w-full rounded-md bg-black"
          controls
          preload="metadata"
          src={src || undefined}
        />
        {cropRect && videoWidth > 0 && videoHeight > 0 && (
          <CropOverlay
            videoWidth={videoWidth}
            videoHeight={videoHeight}
            crop={cropRect}
            onChange={onCropChange}
          />
        )}
      </div>
      {duration > 0 && (
        <TimelineSlider
          duration={duration}
          startSecs={startSecs}
          endSecs={endSecs}
          currentTime={currentTime}
          onChange={onRangeChange}
          onSeek={seek}
          disabled={!metadataLoaded}
        />
      )}
    </div>
  );
}
