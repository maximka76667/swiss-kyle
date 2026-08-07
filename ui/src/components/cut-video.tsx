import { useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { toast } from "sonner";
import { Button } from "@shadcn/components/ui/button";
import { Input } from "@shadcn/components/ui/input";
import { Label } from "@shadcn/components/ui/label";
import { VideoPlayer } from "@/components/video-player";
import { ToolPage } from "@/components/tool-page";
import { OutputFolderLink } from "@/components/output-folder-link";
import { FileDropZone } from "@/components/file-drop-zone";
import { basename } from "@/lib/utils";
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

export function CutVideo({ onJobSubmitted }: Props) {
  const [inputPath, setInputPath] = useState<string | null>(null);
  const [outputName, setOutputName] = useState("output.mp4");
  const [startSecs, setStartSecs] = useState(0);
  const [endSecs, setEndSecs] = useState(0);

  function applyFile(path: string) {
    const ext = extOf(path);
    setInputPath(path);
    const filename = basename(path);
    const stem = filename.slice(0, filename.lastIndexOf(".")) || filename;
    setOutputName(`${stem}-cut.${ext}`);
    setStartSecs(0);
    setEndSecs(0);
  }

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
      const id = await invoke<string>("submit_cut_job", {
        input: inputPath,
        output: outputName,
        startSecs,
        endSecs,
      });
      onJobSubmitted(id, "cut-video", inputPath, outputName);
    } catch (e) {
      toast.error(`Failed to submit job: ${e}`);
    }
  }

  return (
    <ToolPage
      title="Cut Video"
      description={
        <>
          Trim a video to a specific time range using ffmpeg. Supports .mp4,
          .mov, .mkv, and .webm. Output is saved to{" "}
          <OutputFolderLink subfolder="cut-video" />
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
              key={inputPath}
              filePath={inputPath}
              startSecs={startSecs}
              endSecs={endSecs}
              onRangeChange={(s, e) => {
                setStartSecs(s);
                setEndSecs(e);
              }}
            />

            <div className="flex gap-4">
              <div className="flex flex-1 flex-col gap-2">
                <Label htmlFor="start-secs">Start (s)</Label>
                <Input
                  id="start-secs"
                  type="number"
                  value={startSecs}
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

            <Button type="button" onClick={submit}>
              Submit job
            </Button>
          </>
        )}
      </div>
    </ToolPage>
  );
}
