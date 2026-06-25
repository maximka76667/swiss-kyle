import { useEffect, useState } from 'react'
import { open } from '@tauri-apps/plugin-dialog'
import { invoke } from '@tauri-apps/api/core'
import { listen } from '@tauri-apps/api/event'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

type JobStatus =
  | 'Received'
  | { Processing: { percent: number } }
  | 'Done'
  | { Failed: { reason: string } }

type JobStatusEvent = {
  id: string
  status: JobStatus
}

type TrackedJob = {
  id: string
  output: string
  status: string
}

function describeStatus(status: JobStatus): string {
  if (status === 'Received') return 'Worker received job'
  if (status === 'Done') return 'Done'
  if ('Processing' in status) return `Processing... ${status.Processing.percent.toFixed(0)}%`
  return `Failed: ${status.Failed.reason}`
}

function App() {
  const [inputPath, setInputPath] = useState<string | null>(null)
  const [outputName, setOutputName] = useState('output.mp4')
  const [startSecs, setStartSecs] = useState('0')
  const [endSecs, setEndSecs] = useState('10')
  const [error, setError] = useState<string | null>(null)
  const [jobs, setJobs] = useState<TrackedJob[]>([])

  useEffect(() => {
    const unlisten = listen<JobStatusEvent>('job-status', (event) => {
      setJobs((prev) =>
        prev.map((job) =>
          job.id === event.payload.id
            ? { ...job, status: describeStatus(event.payload.status) }
            : job,
        ),
      )
    })
    return () => {
      unlisten.then((f) => f())
    }
  }, [])

  async function pickFile() {
    const path = await open({
      multiple: false,
      filters: [{ name: 'Video', extensions: ['mp4', 'mov', 'mkv', 'webm'] }],
    })
    if (typeof path === 'string') {
      setInputPath(path)
    }
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
        startSecs: parseFloat(startSecs),
        endSecs: parseFloat(endSecs),
      })
      setJobs((prev) => [...prev, { id, output: outputName, status: 'Submitted' }])
    } catch (e) {
      setError(`Failed: ${e}`)
    }
  }

  return (
    <main className="mx-auto flex max-w-md flex-col gap-4 p-8">
      <h1 className="text-2xl font-medium">Cut Video</h1>

      <div className="flex items-center gap-3">
        <Button type="button" onClick={pickFile}>
          Choose video
        </Button>
        <span className="text-sm text-muted-foreground">
          {inputPath ?? 'No file selected'}
        </span>
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor="output-name">Output filename</Label>
        <Input
          id="output-name"
          value={outputName}
          onChange={(e) => setOutputName(e.target.value)}
        />
      </div>

      <div className="flex gap-4">
        <div className="flex flex-1 flex-col gap-2">
          <Label htmlFor="start-secs">Start (s)</Label>
          <Input
            id="start-secs"
            type="number"
            value={startSecs}
            onChange={(e) => setStartSecs(e.target.value)}
          />
        </div>
        <div className="flex flex-1 flex-col gap-2">
          <Label htmlFor="end-secs">End (s)</Label>
          <Input
            id="end-secs"
            type="number"
            value={endSecs}
            onChange={(e) => setEndSecs(e.target.value)}
          />
        </div>
      </div>

      <Button type="button" onClick={submit}>
        Submit job
      </Button>

      {error && <p className="text-sm text-muted-foreground">{error}</p>}

      {jobs.length > 0 && (
        <ul className="flex flex-col gap-1">
          {jobs.map((job) => (
            <li key={job.id} className="text-sm text-muted-foreground">
              {job.output}: {job.status}
            </li>
          ))}
        </ul>
      )}
    </main>
  )
}

export default App
