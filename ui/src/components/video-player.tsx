import { useEffect, useRef, useState } from 'react'
import { invoke } from '@tauri-apps/api/core'
import { TimelineSlider } from '@/components/timeline-slider'

interface VideoPlayerProps {
  filePath: string
  startSecs: number
  endSecs: number
  onRangeChange: (start: number, end: number) => void
}

export function VideoPlayer({ filePath, startSecs, endSecs, onRangeChange }: VideoPlayerProps) {
  const [duration, setDuration] = useState(0)
  const [currentTime, setCurrentTime] = useState(0)
  const [src, setSrc] = useState('')
  const videoRef = useRef<HTMLVideoElement>(null)
  // Prevents canplay/durationchange firing mid-playback from resetting the range
  const rangeInitialized = useRef(false)

  useEffect(() => {
    setSrc('')
    invoke<string>('get_stream_url', { path: filePath }).then(setSrc)
  }, [filePath])

  useEffect(() => {
    setDuration(0)
    setCurrentTime(0)
    rangeInitialized.current = false
    const video = videoRef.current
    if (!video || !src) return

    function trySetDuration() {
      if (rangeInitialized.current) return
      const d = video!.duration
      if (d && isFinite(d) && d > 0) {
        rangeInitialized.current = true
        setDuration(d)
        onRangeChange(0, d)
      }
    }

    function onTimeUpdate() {
      setCurrentTime(video!.currentTime)
    }

    function onError() {
      console.error('VideoPlayer: error loading video', video!.error)
    }

    video.addEventListener('loadedmetadata', trySetDuration)
    video.addEventListener('durationchange', trySetDuration)
    video.addEventListener('canplay', trySetDuration)
    video.addEventListener('timeupdate', onTimeUpdate)
    video.addEventListener('error', onError)
    trySetDuration()

    return () => {
      video.removeEventListener('loadedmetadata', trySetDuration)
      video.removeEventListener('durationchange', trySetDuration)
      video.removeEventListener('canplay', trySetDuration)
      video.removeEventListener('timeupdate', onTimeUpdate)
      video.removeEventListener('error', onError)
    }
  }, [filePath, src])

  // Seek to start when the start handle is moved
  useEffect(() => {
    if (videoRef.current && duration > 0) {
      videoRef.current.currentTime = startSecs
    }
  }, [startSecs])

  function seek(secs: number) {
    if (videoRef.current) {
      videoRef.current.currentTime = secs
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <video
        ref={videoRef}
        className="aspect-video w-full rounded-md bg-black"
        controls
        preload="metadata"
        src={src || undefined}
      />
      {duration > 0 && (
        <TimelineSlider
          duration={duration}
          startSecs={startSecs}
          endSecs={endSecs}
          currentTime={currentTime}
          onChange={onRangeChange}
          onSeek={seek}
        />
      )}
    </div>
  )
}
