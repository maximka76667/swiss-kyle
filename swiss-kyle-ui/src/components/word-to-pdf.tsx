import { useState } from 'react'
import { open } from '@tauri-apps/plugin-dialog'
import { invoke } from '@tauri-apps/api/core'
import { FolderOpen } from 'lucide-react'
import { Upload } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { ToolPage } from '@/components/tool-page'
import { cn } from '@/lib/utils'
import type { Tool } from '@/types/jobs'

interface Props {
  onJobSubmitted: (id: string, tool: Tool, input: string, output: string) => void
}

function basename(path: string): string {
  return path.split(/[\\/]/).pop() ?? path
}

export function WordToPdf({ onJobSubmitted }: Props) {
  const [inputPath, setInputPath] = useState<string | null>(null)
  const [outputName, setOutputName] = useState('output.pdf')
  const [isDragging, setIsDragging] = useState(false)
  const [error, setError] = useState<string | null>(null)

  function applyFile(path: string) {
    setInputPath(path)
    const stem = path.split(/[\\/]/).pop()?.replace(/\.[^.]+$/, '') ?? 'output'
    setOutputName(`${stem}.pdf`)
    setError(null)
  }

  async function pickFile() {
    const path = await open({
      multiple: false,
      filters: [{ name: 'Documents', extensions: ['docx', 'doc', 'odt', 'md', 'html', 'txt'] }],
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
      setError('Pick a document file first')
      return
    }
    setError(null)
    try {
      const id = await invoke<string>('submit_word_to_pdf_job', {
        input: inputPath,
        output: outputName,
      })
      onJobSubmitted(id, 'word-to-pdf', inputPath, outputName)
    } catch (e) {
      setError(`Failed: ${e}`)
    }
  }

  return (
    <ToolPage
      title="PDF Converter"
      description={
        <>
          Convert documents into PDF using pandoc and typst. Supports .docx, .doc, .odt, .md, .html, and .txt.{' '}
          Output is saved to{' '}
          <button
            className="inline-flex items-center gap-1 underline decoration-dotted hover:text-foreground transition-colors"
            onClick={() => invoke('open_output_folder', { subfolder: 'convert-to-pdf' })}
          >
            <FolderOpen className="h-3 w-3" />
            ~/Documents/swiss-kyle/convert-to-pdf/
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
              <p className="text-sm text-muted-foreground">Drag & drop a document here</p>
              <p className="mt-1 text-xs text-muted-foreground">or click to browse</p>
            </div>
          )}
        </div>

        {inputPath && (
          <>
            <div className="flex flex-col gap-2">
              <Label htmlFor="pdf-output-name">Output filename</Label>
              <Input
                id="pdf-output-name"
                value={outputName}
                onChange={(e) => setOutputName(e.target.value)}
              />
            </div>

            <Button type="button" onClick={submit}>
              Convert to PDF
            </Button>
          </>
        )}

        {error && <p className="text-sm text-destructive">{error}</p>}
      </div>
    </ToolPage>
  )
}
