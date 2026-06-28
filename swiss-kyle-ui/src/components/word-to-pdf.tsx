import { useState } from 'react'
import { open } from '@tauri-apps/plugin-dialog'
import { invoke } from '@tauri-apps/api/core'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

interface Props {
  onJobSubmitted: (id: string, input: string, output: string) => void
}

export function WordToPdf({ onJobSubmitted }: Props) {
  const [inputPath, setInputPath] = useState<string | null>(null)
  const [outputName, setOutputName] = useState('output.pdf')
  const [error, setError] = useState<string | null>(null)

  async function pickFile() {
    const path = await open({
      multiple: false,
      filters: [{ name: 'Documents', extensions: ['docx', 'doc', 'odt', 'md', 'html', 'txt'] }],
    })
    if (typeof path === 'string') {
      setInputPath(path)
      const stem = path.split(/[\\/]/).pop()?.replace(/\.[^.]+$/, '') ?? 'output'
      setOutputName(`${stem}.pdf`)
      setError(null)
    }
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
      onJobSubmitted(id, inputPath, outputName)
    } catch (e) {
      setError(`Failed: ${e}`)
    }
  }

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-5 p-6">
      <div className="flex items-center gap-3">
        <Button type="button" onClick={pickFile}>
          Choose document
        </Button>
        <span className="truncate text-sm text-muted-foreground">
          {inputPath ?? 'No file selected'}
        </span>
      </div>

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

      {error && <p className="text-sm text-destructive">{error}</p>}
    </div>
  )
}
