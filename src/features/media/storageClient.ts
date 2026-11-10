import type { MediaTicket } from './types'
import { isRecord, safeUrl } from '../cp45/http'
export type StorageConfig =
  | { provider: 'SUPABASE'; projectUrl: string; publicKey: string }
  | {
      provider: 'CLOUDINARY'
      cloudName: string
      uploadPreset: string
      uploadUrl: string
    }

function publicKeyOnly(key: string) {
  if (key.startsWith('sb_secret_'))
    throw new Error('Solo se permite una clave pública del storage.')
  if (key.startsWith('sb_publishable_')) return
  try {
    const payload: unknown = JSON.parse(
      atob(key.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')),
    )
    if (!isRecord(payload) || payload.role !== 'anon') throw new Error('role')
  } catch {
    throw new Error('Configura una clave publicable o anon de Supabase.')
  }
}
export function xhrUpload(
  url: string,
  body: Blob | FormData,
  headers: Record<string, string>,
  signal: AbortSignal,
  progress: (percent: number) => void,
): Promise<unknown> {
  return new Promise((resolve, reject) => {
    if (signal.aborted) {
      reject(new DOMException('Subida cancelada.', 'AbortError'))
      return
    }
    const xhr = new XMLHttpRequest()
    const cleanup = () => signal.removeEventListener('abort', abort)
    const abort = () => xhr.abort()
    xhr.open('POST', url)
    xhr.timeout = 120000
    for (const [key, value] of Object.entries(headers)) xhr.setRequestHeader(key, value)
    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable) progress(Math.round((event.loaded / event.total) * 100))
    }
    xhr.onerror = () => {
      cleanup()
      reject(new Error('Error de conectividad con el storage.'))
    }
    xhr.ontimeout = () => {
      cleanup()
      reject(new Error('La subida agotó el tiempo de espera.'))
    }
    xhr.onabort = () => {
      cleanup()
      reject(new DOMException('Subida cancelada.', 'AbortError'))
    }
    xhr.onload = () => {
      cleanup()
      if (xhr.status < 200 || xhr.status >= 300) {
        reject(new Error(`Storage rechazó el archivo (HTTP ${xhr.status}).`))
        return
      }
      try {
        resolve(xhr.responseText ? (JSON.parse(xhr.responseText) as unknown) : null)
      } catch {
        reject(new Error('Respuesta inesperada del storage.'))
      }
    }
    signal.addEventListener('abort', abort, { once: true })
    xhr.send(body)
  })
}
export async function uploadToStorage(
  ticket: MediaTicket,
  blob: Blob,
  config: StorageConfig,
  signal: AbortSignal,
  progress: (percent: number) => void,
) {
  if (config.provider !== ticket.provider)
    throw new Error('El proveedor del ticket no coincide con el storage configurado.')
  if (Date.parse(ticket.expiresAt) <= Date.now())
    throw new Error('El ticket de subida ha expirado. Reintenta para obtener otro.')
  if (ticket.provider === 'SUPABASE' && config.provider === 'SUPABASE') {
    publicKeyOnly(config.publicKey)
    if (
      !ticket.objectPath ||
      !ticket.bucket ||
      ticket.objectPath.split('/').some((part) => part === '..' || !part)
    )
      throw new Error('Destino de ticket inválido.')
    const project = safeUrl(config.projectUrl)?.replace(/\/$/, '')
    if (!project || !project.startsWith('https://'))
      throw new Error('Configura la URL HTTPS de Supabase.')
    const path = `${encodeURIComponent(ticket.bucket)}/${ticket.objectPath.split('/').map(encodeURIComponent).join('/')}`
    const headers: Record<string, string> = {
      apikey: config.publicKey,
      'Content-Type': 'image/webp',
      'x-upsert': 'false',
    }
    if (!config.publicKey.startsWith('sb_publishable_'))
      headers.Authorization = `Bearer ${config.publicKey}`
    await xhrUpload(`${project}/storage/v1/object/${path}`, blob, headers, signal, progress)
    return `${project}/storage/v1/object/public/${path}`
  }
  if (ticket.provider === 'CLOUDINARY' && config.provider === 'CLOUDINARY') {
    if (
      !ticket.uploadPublicId ||
      !ticket.expectedPublicId ||
      !config.uploadPreset ||
      !safeUrl(config.uploadUrl)?.startsWith('https://')
    )
      throw new Error('Configura el preset unsigned y URL HTTPS de Cloudinary.')
    const body = new FormData()
    body.append('file', blob, 'image.webp')
    body.append('upload_preset', config.uploadPreset)
    body.append('public_id', ticket.uploadPublicId)
    const response = await xhrUpload(config.uploadUrl, body, {}, signal, progress)
    if (
      !isRecord(response) ||
      response.public_id !== ticket.expectedPublicId ||
      typeof response.secure_url !== 'string' ||
      response.format !== 'webp'
    )
      throw new Error('Cloudinary no devolvió el destino exacto del ticket.')
    const url = new URL(response.secure_url)
    if (
      url.protocol !== 'https:' ||
      url.hostname !== 'res.cloudinary.com' ||
      !url.pathname.startsWith(`/${config.cloudName}/image/upload/`)
    )
      throw new Error('Cloudinary devolvió una URL inesperada.')
    return url.href
  }
  throw new Error('Proveedor de storage no compatible.')
}
