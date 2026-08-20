import { useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { toast } from "sonner";
import { Button } from "@shadcn/components/ui/button";
import { Input } from "@shadcn/components/ui/input";
import { Label } from "@shadcn/components/ui/label";
import { VideoPlayer } from "@/features/edit-video/components/video-player";
import { ToolPage } from "@/components/tool-page";
import { OutputFolderLink } from "@/components/output-folder-link";
import { FileDropZone } from "@/components/file-drop-zone";
import { basename } from "@/lib/utils";
import { CropRect } from "@/types/jobs";
import type { Tool } from "@/types/jobs";

const VIDEO_EXTS = ["mp4", "mov", "mkv", "webm"];

interface Props {
  onJobSubmitted: (
    id: string,
    tool: Tool,
    input: string,
    output: string,
  ) => void;
}

function extOf(path: string): string {
  return basename(path).split(".").pop()?.toLowerCase() ?? "";
}

export function EditVideo({ onJobSubmitted }: Props) {
  const [inputPath, setInputPath] = useState<string | null>(null);
  const [outputName, setOutputName] = useState("output.mp4");
  const [startSecs, setStartSecs] = useState(0);
  const [endSecs, setEndSecs] = useState(0);
  const [videoWidth, setVideoWidth] = useState(0);
  const [videoHeight, setVideoHeight] = useState(0);
  const [cropRect, setCropRect] = useState<CropRect | null>(null);
  // Keys VideoPlayer instead of inputPath: re-picking the same file leaves
  // inputPath unchanged, so React wouldn't remount it and its metadata
  // never reloads, leaving everything stuck disabled.
  const [loadId, setLoadId] = useState(0);

  function applyFile(path: string) {
    const ext = extOf(path);
    setInputPath(path);
    setLoadId((id) => id + 1);
    const filename = basename(path);
    const stem = filename.slice(0, filename.lastIndexOf(".")) || filename;
    setOutputName(`${stem}-edit.${ext}`);
    setStartSecs(0);
    setEndSecs(0);
    setVideoWidth(0);
    setVideoHeight(0);
    setCropRect(null);
  }

  // Video metadata (duration, native dimensions) loads asynchronously after
  // the file is picked — nothing that depends on it (trim range, crop,
  // submit) should be interactive before it's actually known, for real
  // users and not just because it happens to also give e2e tests a
  // reliable, semantically real "ready" signal to wait on.
  const metadataLoaded = videoWidth > 0 && videoHeight > 0;

  // Crop is always visible/adjustable (no separate enable step), but a
  // video whose crop was never touched should submit exactly like a
  // trim-only job — untouched, cropRect always equals the full native
  // frame, so sending it anyway would apply a real (if invisible) -vf crop
  // in the worker, quietly clipping 1px off any odd source dimension due
  // to libx264's even-dimension rounding.
  const cropChanged =
    cropRect !== null &&
    (cropRect.x !== 0 ||
      cropRect.y !== 0 ||
      cropRect.width !== videoWidth ||
      cropRect.height !== videoHeight);

  function validate(paths: string[]) {
    const path = paths[0];
    const ext = extOf(path);
    if (!VIDEO_EXTS.includes(ext)) {
      return {
        accepted: [],
        reject: {
          message: `Not a supported video file: ${basename(path)}`,
          description: `Expected one of: ${VIDEO_EXTS.map((e) => `.${e}`).join(", ")}`,
        },
      };
    }
    return { accepted: [path] };
  }

  async function submit() {
    if (!inputPath) {
      toast.error("Pick a video file first");
      return;
    }
    try {
      const id = await invoke<string>("submit_edit_video_job", {
        input: inputPath,
        output: outputName,
        startSecs,
        endSecs,
        crop: cropChanged ? cropRect : null,
      });
      onJobSubmitted(id, "edit-video", inputPath, outputName);
    } catch (e) {
      toast.error(`Failed to submit job: ${e}`);
    }
  }

  return (
    <ToolPage
      title="Edit Video"
      description={
        <>
          Trim and/or crop a video using ffmpeg. Supports .mp4, .mov, .mkv,
          and .webm. Output is saved to{" "}
          <OutputFolderLink subfolder="edit-video" />
        </>
      }
    >
      <div className="flex flex-col gap-5">
        <FileDropZone
          multiple={false}
          dialogFilter={{ name: "Video", extensions: VIDEO_EXTS }}
          validate={validate}
          onFiles={([path]) => applyFile(path)}
          prompt="Drag & drop a video here"
          hint="or click to browse"
          selectedLabel={inputPath ? basename(inputPath) : null}
        />

        {inputPath && (
          <>
            <VideoPlayer
              key={loadId}
              filePath={inputPath}
              startSecs={startSecs}
              endSecs={endSecs}
              onRangeChange={(s, e) => {
                setStartSecs(s);
                setEndSecs(e);
              }}
              cropRect={cropRect}
              onCropChange={setCropRect}
              metadataLoaded={metadataLoaded}
              onDimensionsKnown={(w, h) => {
                setVideoWidth(w);
                setVideoHeight(h);
                setCropRect(new CropRect(0, 0, w, h));
              }}
            />

            {cropChanged && cropRect && (
              <span
                data-crop-indicator
                className="text-xs text-muted-foreground"
              >
                Crop: {cropRect.width}×{cropRect.height} at {cropRect.x},
                {cropRect.y}
              </span>
            )}

            <div className="flex gap-4">
              <div className="flex flex-1 flex-col gap-2">
                <Label htmlFor="start-secs">Start (s)</Label>
                <Input
                  id="start-secs"
                  type="number"
                  value={startSecs}
                  disabled={!metadataLoaded}
                  onChange={(e) =>
                    setStartSecs(parseFloat(e.target.value) || 0)
                  }
                />
              </div>
              <div className="flex flex-1 flex-col gap-2">
                <Label htmlFor="end-secs">End (s)</Label>
                <Input
                  id="end-secs"
                  type="number"
                  value={endSecs}
                  disabled={!metadataLoaded}
                  onChange={(e) => setEndSecs(parseFloat(e.target.value) || 0)}
                />
              </div>
            </div>

            <div className="flex flex-col gap-2">
              <Label htmlFor="output-name">Output filename</Label>
              <Input
                id="output-name"
                value={outputName}
                onChange={(e) => setOutputName(e.target.value)}
              />
            </div>

            <Button type="button" disabled={!metadataLoaded} onClick={submit}>
              Submit job
            </Button>
          </>
        )}
      </div>
    </ToolPage>
  );
}
