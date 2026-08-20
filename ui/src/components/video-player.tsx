import { useEffect, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { TimelineSlider } from "@/features/edit-video/components/timeline-slider";
import { VideoSection } from "@/features/edit-video/components/video-section";
import { VideoControls } from "@/features/edit-video/components/video-controls";
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
  const [isPlaying, setIsPlaying] = useState(false);
  const [volume, setVolume] = useState(1);
  const [isMuted, setIsMuted] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  // Prevents canplay/durationchange firing mid-playback from resetting the
  // trim range or the native video dimensions.
  const rangeInitialized = useRef(false);
  // Dragging the seek slider fires far more pointer-move events than the
  // video can actually seek to — each one forces a real decode, so doing
  // it on every event pegs the UI. Coalescing to one seek per animation
  // frame keeps it responsive without dropping the drag on the floor.
  const pendingSeek = useRef<number | null>(null);
  const seekRafId = useRef<number | null>(null);

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

    function onPlay() {
      setIsPlaying(true);
    }

    function onPause() {
      setIsPlaying(false);
    }

    function onVolumeChange() {
      setVolume(video!.volume);
      setIsMuted(video!.muted);
    }

    video.addEventListener("loadedmetadata", trySetDuration);
    video.addEventListener("durationchange", trySetDuration);
    video.addEventListener("canplay", trySetDuration);
    video.addEventListener("timeupdate", onTimeUpdate);
    video.addEventListener("error", onError);
    video.addEventListener("play", onPlay);
    video.addEventListener("pause", onPause);
    video.addEventListener("volumechange", onVolumeChange);
    trySetDuration();

    return () => {
      video.removeEventListener("loadedmetadata", trySetDuration);
      video.removeEventListener("durationchange", trySetDuration);
      video.removeEventListener("canplay", trySetDuration);
      video.removeEventListener("timeupdate", onTimeUpdate);
      video.removeEventListener("error", onError);
      video.removeEventListener("play", onPlay);
      video.removeEventListener("pause", onPause);
      video.removeEventListener("volumechange", onVolumeChange);
    };
  }, [src]);

  // Seek to start when the start handle is moved
  useEffect(() => {
    if (videoRef.current && duration > 0) {
      videoRef.current.currentTime = startSecs;
    }
  }, [startSecs]);

  useEffect(() => {
    return () => {
      if (seekRafId.current !== null) cancelAnimationFrame(seekRafId.current);
    };
  }, []);

  function seek(secs: number) {
    pendingSeek.current = secs;
    if (seekRafId.current !== null) return;
    seekRafId.current = requestAnimationFrame(() => {
      seekRafId.current = null;
      if (pendingSeek.current !== null && videoRef.current) {
        videoRef.current.currentTime = pendingSeek.current;
      }
      pendingSeek.current = null;
    });
  }

  function togglePlay() {
    const video = videoRef.current;
    if (!video) return;
    if (video.paused) {
      video.play();
    } else {
      video.pause();
    }
  }

  function toggleMute() {
    const video = videoRef.current;
    if (!video) return;
    video.muted = !video.muted;
  }

  function changeVolume(v: number) {
    const video = videoRef.current;
    if (!video) return;
    video.volume = v;
    // Dragging the slider back up from 0 should also drop out of a prior
    // explicit mute — otherwise the video stays silently muted at a
    // nonzero-looking volume level, since `muted` and `volume` are
    // independent video properties.
    video.muted = v === 0;
  }

  return (
    <div className="flex flex-col gap-3">
      <VideoSection
        videoRef={videoRef}
        src={src}
        cropRect={cropRect}
        videoWidth={videoWidth}
        videoHeight={videoHeight}
        onCropChange={onCropChange}
      />
      {duration > 0 && (
        <VideoControls
          isPlaying={isPlaying}
          currentTime={currentTime}
          duration={duration}
          volume={volume}
          isMuted={isMuted}
          onTogglePlay={togglePlay}
          onSeek={seek}
          onToggleMute={toggleMute}
          onChangeVolume={changeVolume}
        />
      )}
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
