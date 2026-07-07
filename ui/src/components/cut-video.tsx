import { useState } from 'react'
import { open } from '@tauri-apps/plugin-dialog'
import { invoke } from '@tauri-apps/api/core'
import { toast } from 'sonner'
import { Upload } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { VideoPlayer } from '@/components/video-player'
import { ToolPage } from '@/components/tool-page'
import { OutputFolderLink } from '@/components/output-folder-link'
import { cn } from '@/lib/utils'
import { useFileDrop } from '@/hooks/use-file-drop'
import type { Tool } from '@/types/jobs'

const VIDEO_EXTS = ['mp4', 'mov', 'mkv', 'webm']

interface Props {
  onJobSubmitted: (id: string, tool: Tool, input: string, output: string) => void
}

function basename(path: string): string {
  return path.split(/[\\/]/).pop() ?? path
}

function extOf(path: string): string {
  return basename(path).split('.').pop()?.toLowerCase() ?? ''
}

export function CutVideo({ onJobSubmitted }: Props) {
  const [inputPath, setInputPath] = useState<string | null>(null)
  const [outputName, setOutputName] = useState('output.mp4')
  const [startSecs, setStartSecs] = useState(0)
  const [endSecs, setEndSecs] = useState(0)

  function applyFile(path: string) {
    const ext = extOf(path)
    if (!VIDEO_EXTS.includes(ext)) {
      toast.error(`Not a supported video file: ${basename(path)}`, {
        description: `Expected one of: ${VIDEO_EXTS.map((e) => `.${e}`).join(', ')}`,
      })
      return
    }
    setInputPath(path)
    const filename = basename(path)
    const stem = filename.slice(0, filename.lastIndexOf('.')) || filename
    setOutputName(`${stem}-cut.${ext}`)
    setStartSecs(0)
    setEndSecs(0)
  }

  const { isDragging } = useFileDrop((paths) => {
    if (paths[0]) applyFile(paths[0])
  })

  async function pickFile() {
    const path = await open({
      multiple: false,
      filters: [{ name: 'Video', extensions: ['mp4', 'mov', 'mkv', 'webm'] }],
    })
    if (typeof path === 'string') applyFile(path)
  }

  async function submit() {
    if (!inputPath) {
      toast.error('Pick a video file first')
      return
    }
    try {
      const id = await invoke<string>('submit_cut_job', {
        input: inputPath,
        output: outputName,
        startSecs,
        endSecs,
      })
      onJobSubmitted(id, 'cut-video', inputPath, outputName)
    } catch (e) {
      toast.error(`Failed to submit job: ${e}`)
    }
  }

  return (
    <ToolPage
      title="Cut Video"
      description={
        <>
          Trim a video to a specific time range using ffmpeg. Supports .mp4, .mov, .mkv, and .webm.{' '}
          Output is saved to{' '}
          <OutputFolderLink subfolder="cut-video" />
        </>
      }
    >
      <div className="flex flex-col gap-5">
        <div
          className={cn(
            'flex cursor-pointer flex-col items-center justify-center gap-3 rounded-xl border-2 border-dashed p-12 transition-colors',
            isDragging
              ? 'border-primary bg-primary/5'
              : 'border-muted-foreground/30 bg-muted/20 hover:bg-muted/30',
          )}
          onClick={pickFile}
        >
          <Upload className="h-8 w-8 text-muted-foreground" />
          {inputPath ? (
            <p className="text-sm font-medium">{basename(inputPath)}</p>
          ) : (
            <div className="text-center">
              <p className="text-sm text-muted-foreground">Drag & drop a video here</p>
              <p className="mt-1 text-xs text-muted-foreground">or click to browse</p>
            </div>
          )}
        </div>

        {inputPath && (
          <>
            <VideoPlayer
              filePath={inputPath}
              startSecs={startSecs}
              endSecs={endSecs}
              onRangeChange={(s, e) => { setStartSecs(s); setEndSecs(e) }}
            />

            <div className="flex gap-4">
              <div className="flex flex-1 flex-col gap-2">
                <Label htmlFor="start-secs">Start (s)</Label>
                <Input
                  id="start-secs"
                  type="number"
                  value={startSecs}
                  onChange={(e) => setStartSecs(parseFloat(e.target.value) || 0)}
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
  )
}
