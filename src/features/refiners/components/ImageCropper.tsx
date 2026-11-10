/* Praise Kier */
import { useEffect, useRef, useState } from 'react'
import type { Crop } from '../../media/types'
import { errorMessage } from '../../cp45/http'
export function ImageCropper({
  file,
  onConfirm,
  onCancel,
}: {
  file: File
  onConfirm: (crop: Crop) => void
  onCancel: () => void
}) {
  const canvas = useRef<HTMLCanvasElement>(null)
  const [bitmap, setBitmap] = useState<ImageBitmap>()
  const [error, setError] = useState('')
  const [zoom, setZoom] = useState(1)
  const [position, setPosition] = useState({ x: 50, y: 50 })
  const drag = useRef<{ x: number; y: number; px: number; py: number } | null>(null)
  const side = bitmap ? Math.min(bitmap.width, bitmap.height) / zoom : 1
  const crop: Crop = {
    x: bitmap ? ((bitmap.width - side) * position.x) / 100 : 0,
    y: bitmap ? ((bitmap.height - side) * position.y) / 100 : 0,
    size: side,
  }
  useEffect(() => {
    let disposed = false
    let decoded: ImageBitmap | undefined
    void createImageBitmap(file, { imageOrientation: 'from-image' })
      .then((value) => {
        decoded = value
        if (disposed) value.close()
        else if (value.width * value.height > 40_000_000) {
          value.close()
          setError('La imagen supera 40 megapíxeles.')
        } else setBitmap(value)
      })
      .catch((e: unknown) => {
        if (!disposed) setError(errorMessage(e))
      })
    return () => {
      disposed = true
      decoded?.close()
    }
  }, [file])
  useEffect(() => {
    const context = canvas.current?.getContext('2d')
    if (!context || !bitmap) return
    context.clearRect(0, 0, 320, 320)
    context.drawImage(bitmap, crop.x, crop.y, crop.size, crop.size, 0, 0, 320, 320)
  }, [bitmap, crop.x, crop.y, crop.size])
  const clamp = (value: number) => Math.max(0, Math.min(100, value))
  return (
    <section aria-label="Recortar fotocheck" className="space-y-4">
      <h2 className="text-xl font-semibold">Recorte cuadrado</h2>
      <p id="crop-help">
        Arrastra para mover la imagen. Con el foco en la vista previa, usa flechas y + / −. También
        puedes usar los controles.
      </p>
      {error && <p role="alert">{error}</p>}
      <canvas
        ref={canvas}
        width={320}
        height={320}
        tabIndex={0}
        role="img"
        aria-label="Vista previa del recorte"
        aria-describedby="crop-help"
        className="max-w-full touch-none rounded border-2 border-slate-700"
        onPointerDown={(event) => {
          if (!bitmap) return
          event.currentTarget.setPointerCapture(event.pointerId)
          drag.current = {
            x: event.clientX,
            y: event.clientY,
            px: position.x,
            py: position.y,
          }
        }}
        onPointerMove={(event) => {
          if (!drag.current || !bitmap) return
          const scale = side / event.currentTarget.getBoundingClientRect().width
          setPosition({
            x: clamp(
              drag.current.px -
                (((event.clientX - drag.current.x) * scale) / Math.max(1, bitmap.width - side)) *
                  100,
            ),
            y: clamp(
              drag.current.py -
                (((event.clientY - drag.current.y) * scale) / Math.max(1, bitmap.height - side)) *
                  100,
            ),
          })
        }}
        onPointerUp={() => {
          drag.current = null
        }}
        onPointerCancel={() => {
          drag.current = null
        }}
        onKeyDown={(event) => {
          const keys = ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', '+', '-', '=']
          if (!keys.includes(event.key)) return
          event.preventDefault()
          const step = event.shiftKey ? 10 : 2
          setPosition((p) => ({
            x: clamp(
              p.x + (event.key === 'ArrowLeft' ? -step : event.key === 'ArrowRight' ? step : 0),
            ),
            y: clamp(
              p.y + (event.key === 'ArrowUp' ? -step : event.key === 'ArrowDown' ? step : 0),
            ),
          }))
          if (event.key === '+' || event.key === '=') setZoom((z) => Math.min(4, z + 0.1))
          if (event.key === '-') setZoom((z) => Math.max(1, z - 0.1))
        }}
      />
      <label className="block">
        Zoom{' '}
        <input
          type="range"
          min={1}
          max={4}
          step={0.01}
          value={zoom}
          onChange={(event) => setZoom(Number(event.target.value))}
        />
      </label>
      <label className="block">
        Posición horizontal{' '}
        <input
          type="range"
          min={0}
          max={100}
          value={position.x}
          onChange={(event) => setPosition({ ...position, x: Number(event.target.value) })}
        />
      </label>
      <label className="block">
        Posición vertical{' '}
        <input
          type="range"
          min={0}
          max={100}
          value={position.y}
          onChange={(event) => setPosition({ ...position, y: Number(event.target.value) })}
        />
      </label>
      <div className="flex gap-4">
        <button disabled={!bitmap || !!error} onClick={() => onConfirm(crop)}>
          Confirmar recorte
        </button>
        <button onClick={onCancel}>Cancelar recorte</button>
      </div>
    </section>
  )
}
