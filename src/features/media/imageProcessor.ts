import type { Crop, MediaPurpose, PreparedImage } from './types'
export const IMAGE_LIMITS = { BADGE: 122880, INCIDENT: 307200 } as const
export function validateImage(file: Blob) {
  if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) throw new Error('Selecciona una imagen JPEG, PNG o WebP.')
  if (!file.size || file.size > 20 * 1024 * 1024) throw new Error('La imagen debe pesar entre 1 byte y 20 MB.')
}
export function dimensionsFor(width: number, height: number, purpose: MediaPurpose) {
  if (!Number.isFinite(width) || !Number.isFinite(height) || width < 1 || height < 1 || width * height > 40_000_000) throw new Error('Dimensiones inválidas o imagen de más de 40 megapíxeles.')
  if (purpose === 'BADGE') return { width: 512, height: 512 }
  const longSide = Math.min(1600, Math.max(800, Math.max(width, height)))
  const scale = longSide / Math.max(width, height)
  return { width: Math.max(1, Math.round(width * scale)), height: Math.max(1, Math.round(height * scale)) }
}
export function validateCrop(crop: Crop, width: number, height: number) {
  if (![crop.x,crop.y,crop.size].every(Number.isFinite) || crop.size <= 0 || crop.x < 0 || crop.y < 0 || crop.x + crop.size > width + 0.01 || crop.y + crop.size > height + 0.01) throw new Error('El recorte está fuera de la imagen.')
}
/** Canvas creates new pixels; independently reject metadata chunks in the resulting RIFF. */
export async function verifyWebP(blob: Blob, maxBytes: number) {
  if (blob.type !== 'image/webp') throw new Error('Este navegador no permite exportar WebP.')
  if (!blob.size || blob.size > maxBytes) throw new Error('La imagen supera el peso máximo permitido.')
  const data = new Uint8Array(await blob.arrayBuffer())
  const view = new DataView(data.buffer)
  const text = (start: number, end: number) => String.fromCharCode(...data.subarray(start,end))
  if (data.length < 20 || text(0,4) !== 'RIFF' || text(8,12) !== 'WEBP' || view.getUint32(4,true) + 8 !== data.length) throw new Error('El navegador generó un WebP inválido.')
  let offset = 12
  let hasPixels = false
  while (offset < data.length) {
    if (offset + 8 > data.length) throw new Error('WebP truncado.')
    const chunk = text(offset,offset + 4)
    const length = view.getUint32(offset + 4,true)
    if (['EXIF','XMP ','ICCP'].includes(chunk)) throw new Error('La imagen exportada contiene metadatos.')
    if (['VP8 ','VP8L'].includes(chunk)) hasPixels = true
    offset += 8 + length + (length % 2)
    if (offset > data.length) throw new Error('WebP truncado.')
  }
  if (!hasPixels) throw new Error('WebP sin píxeles.')
}
export function exportWebP(canvas: HTMLCanvasElement, quality: number): Promise<Blob> {
  return new Promise((resolve,reject) => {
    try { canvas.toBlob(blob => blob ? resolve(blob) : reject(new Error('No se pudo exportar la imagen.')), 'image/webp', quality) }
    catch { reject(new Error('No se pudo exportar la imagen.')) }
  })
}
export async function processImage(file: Blob, purpose: MediaPurpose, crop?: Crop): Promise<PreparedImage> {
  validateImage(file)
  let bitmap: ImageBitmap
  try { bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' }) }
  catch { throw new Error('No se pudo decodificar la imagen seleccionada.') }
  try {
    const dimensions = dimensionsFor(bitmap.width, bitmap.height, purpose)
    const canvas = document.createElement('canvas')
    canvas.width = dimensions.width; canvas.height = dimensions.height
    const context = canvas.getContext('2d')
    if (!context) throw new Error('Canvas no está disponible en este navegador.')
    context.fillStyle = '#ffffff'; context.fillRect(0,0,canvas.width,canvas.height)
    if (purpose === 'BADGE') {
      const side = Math.min(bitmap.width,bitmap.height)
      const selected = crop ?? { x: (bitmap.width - side) / 2, y: (bitmap.height - side) / 2, size: side }
      validateCrop(selected, bitmap.width, bitmap.height)
      context.drawImage(bitmap, selected.x, selected.y, selected.size, selected.size, 0,0,512,512)
    } else context.drawImage(bitmap,0,0,canvas.width,canvas.height)
    let blob: Blob | undefined
    for (const quality of [0.92,0.82,0.72,0.62,0.52,0.42,0.32,0.25]) {
      blob = await exportWebP(canvas, quality)
      if (blob.type !== 'image/webp') throw new Error('Este navegador no permite exportar WebP.')
      if (blob.size <= IMAGE_LIMITS[purpose]) break
    }
    if (!blob) throw new Error('No se generó la imagen.')
    await verifyWebP(blob, IMAGE_LIMITS[purpose])
    const output = await createImageBitmap(blob)
    try { if (output.width !== canvas.width || output.height !== canvas.height) throw new Error('La imagen final no tiene las dimensiones esperadas.') }
    finally { output.close() }
    return { blob, ...dimensions, purpose }
  } finally { bitmap.close() }
}
