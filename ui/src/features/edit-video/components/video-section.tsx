import type { RefObject } from "react";
import { CropOverlay } from "@/features/edit-video/components/crop-overlay";
import type { CropRect } from "@/types/jobs";

interface VideoSectionProps {
  videoRef: RefObject<HTMLVideoElement | null>;
  src: string;
  cropRect: CropRect | null;
  videoWidth: number;
  videoHeight: number;
  onCropChange: (crop: CropRect) => void;
}

export function VideoSection({
  videoRef,
  src,
  cropRect,
  videoWidth,
  videoHeight,
  onCropChange,
}: VideoSectionProps) {
  return (
    <div className="relative">
      <video
        ref={videoRef}
        className="aspect-video w-full rounded-md bg-black"
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
  );
}
