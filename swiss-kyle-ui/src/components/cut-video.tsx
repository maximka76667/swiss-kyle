import { useState } from 'react'
import { open } from '@tauri-apps/plugin-dialog'
import { invoke } from '@tauri-apps/api/core'
import { Upload, FolderOpen } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { VideoPlayer } from '@/components/video-player'
import { ToolPage } from '@/components/tool-page'
import { cn } from '@/lib/utils'
import type { Tool } from '@/types/jobs'

interface Props {
  onJobSubmitted: (id: string, tool: Tool, input: string, output: string) => void
}

function basename(path: string): string {
  return path.split(/[\\/]/).pop() ?? path
}

export function CutVideo({ onJobSubmitted }: Props) {
  const [inputPath, setInputPath] = useState<string | null>(null)
  const [outputName, setOutputName] = useState('output.mp4')
  const [startSecs, setStartSecs] = useState(0)
  const [endSecs, setEndSecs] = useState(0)
  const [isDragging, setIsDragging] = useState(false)
  const [error, setError] = useState<string | null>(null)

  function applyFile(path: string) {
    setInputPath(path)
    const filename = path.split(/[\\/]/).pop() ?? 'output'
    const ext = filename.includes('.') ? filename.slice(filename.lastIndexOf('.')) : '.mp4'
    const stem = filename.slice(0, filename.lastIndexOf('.')) || filename
    setOutputName(`${stem}-cut${ext}`)
    setStartSecs(0)
    setEndSecs(0)
    setError(null)
  }

  async function pickFile() {
    const path = await open({
      multiple: false,
      filters: [{ name: 'Video', extensions: ['mp4', 'mov', 'mkv', 'webm'] }],
    })
    if (typeof path === 'string') applyFile(path)
  }

  function handleDragOver(e: React.DragEvent) {
    e.preventDefault()
    setIsDragging(true)
  }

  function handleDragLeave(e: React.DragEvent) {
    if (!e.currentTarget.contains(e.relatedTarget as Node)) setIsDragging(false)
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault()
    setIsDragging(false)
    const file = e.dataTransfer.files[0]
    if (!file) return
    const path = (file as any).path as string | undefined
    if (path) applyFile(path)
  }

  async function submit() {
    if (!inputPath) {
      setError('Pick a video file first')
      return
    }
    setError(null)
    try {
      const id = await invoke<string>('submit_cut_job', {
        input: inputPath,
        output: outputName,
        startSecs,
        endSecs,
      })
      onJobSubmitted(id, 'cut-video', inputPath, outputName)
    } catch (e) {
      setError(`Failed: ${e}`)
    }
  }

  return (
    <ToolPage
      title="Cut Video"
      description={
        <>
          Trim a video to a specific time range using ffmpeg. Supports .mp4, .mov, .mkv, and .webm.{' '}
          Output is saved to{' '}
          <button
            className="inline-flex items-center gap-1 underline decoration-dotted hover:text-foreground transition-colors"
            onClick={() => invoke('open_output_folder', { subfolder: 'cut-video' })}
          >
            <FolderOpen className="h-3 w-3" />
            ~/Documents/swiss-kyle/cut-video/
          </button>
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
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
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

        {error && <p className="text-sm text-destructive">{error}</p>}
      </div>
    </ToolPage>
  )
}
