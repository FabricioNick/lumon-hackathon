/* Praise Kier */
import { useEffect, useRef, useState } from 'react'
import { useCp45 } from '../cp45/context'
import { errorMessage } from '../cp45/http'
import { processImage } from './imageProcessor'
import { UploadTask } from './uploadService'
import type { Crop, Media, MediaPurpose, PreparedImage, UploadProgress } from './types'
export function UploadPanel({
  file,
  purpose,
  crop,
  onConfirmed,
  auto = false,
}: {
  file: File
  purpose: MediaPurpose
  crop?: Crop
  onConfirmed: (media: Media) => void
  auto?: boolean
}) {
  const { request, storage } = useCp45()
  const [state, setState] = useState<UploadProgress>({
    phase: 'preparing',
    percent: 0,
  })
  const [error, setError] = useState('')
  const [preview, setPreview] = useState('')
  const [busy, setBusy] = useState(false)
  const controller = useRef<AbortController | null>(null)
  const task = useRef<UploadTask | null>(null)
  const prepared = useRef<PreparedImage | null>(null)
  const previewUrl = useRef('')
  const callback = useRef(onConfirmed)
  useEffect(() => {
    callback.current = onConfirmed
  }, [onConfirmed])
  const runRef = useRef<() => void>(() => {})
  async function run() {
    if (controller.current) return
    const current = new AbortController()
    controller.current = current
    setBusy(true)
    setError('')
    try {
      if (!storage) throw new Error('Falta conectar el storage verificado del equipo.')
      if (!prepared.current) {
        setState({ phase: 'preparing', percent: 0 })
        prepared.current = await processImage(file, purpose, crop)
        current.signal.throwIfAborted()
        previewUrl.current = URL.createObjectURL(prepared.current.blob)
        setPreview(previewUrl.current)
      }
      if (!task.current) task.current = new UploadTask(prepared.current, storage, request)
      const media = await task.current.run(current.signal, (progress) => {
        if (!current.signal.aborted) setState(progress)
      })
      if (!current.signal.aborted) callback.current(media)
    } catch (e) {
      if (current.signal.aborted) setState({ phase: 'cancelled', percent: 0 })
      else {
        setError(errorMessage(e))
        setState({ phase: 'error', percent: 0 })
      }
    } finally {
      if (controller.current === current) {
        controller.current = null
        setBusy(false)
      }
    }
  }
  useEffect(() => {
    runRef.current = () => {
      void run()
    }
  })
  useEffect(() => {
    const timer = auto ? window.setTimeout(() => runRef.current(), 0) : undefined
    return () => {
      window.clearTimeout(timer)
      controller.current?.abort()
      URL.revokeObjectURL(previewUrl.current)
    }
  }, [auto])
  const labels: Record<UploadProgress['phase'], string> = {
    preparing: 'Preparar imagen',
    ticket: 'Solicitando ticket',
    uploading: 'Subiendo',
    confirming: 'Verificando en servidor',
    confirmed: 'Imagen confirmada',
    error: 'Error',
    cancelled: 'Cancelada',
  }
  return (
    <div className="my-4 space-y-2 rounded border border-slate-300 p-4">
      <p className="break-all font-semibold">{file.name}</p>
      {preview && (
        <img
          src={preview}
          alt="Imagen procesada para subir"
          width={128}
          height={128}
          className="h-32 w-32 object-contain"
        />
      )}
      <p role="status">
        {labels[state.phase]}
        {state.phase === 'uploading' ? ` ${state.percent}%` : ''}
      </p>
      {state.phase === 'uploading' && (
        <progress value={state.percent} max={100} aria-label={`Subida de ${file.name}`} />
      )}
      {error && <p role="alert">{error}</p>}
      {state.phase !== 'confirmed' && (
        <button type="button" disabled={busy} onClick={() => void run()}>
          {state.phase === 'error' || state.phase === 'cancelled'
            ? 'Reintentar'
            : 'Procesar y subir'}
        </button>
      )}
      {busy && (
        <button type="button" onClick={() => controller.current?.abort()}>
          Cancelar subida
        </button>
      )}
    </div>
  )
}
