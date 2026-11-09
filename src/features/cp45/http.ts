export class ApiError extends Error {
  readonly status: number
  readonly code: string
  readonly details: unknown
  readonly etag: string | null
  readonly retryAfter: number
  constructor(response: Response, body: unknown) {
    const data = isRecord(body) ? body : {}
    super(typeof data.message === 'string' ? data.message : `Error HTTP ${response.status}`)
    this.status = response.status
    this.code = typeof data.error === 'string' ? data.error : 'UNEXPECTED_RESPONSE'
    this.details = data.details
    this.etag = response.headers.get('ETag')
    const retry = response.headers.get('Retry-After')
    this.retryAfter = retry ? Math.max(0, Number.isFinite(Number(retry)) ? Number(retry) * 1000 : Date.parse(retry) - Date.now()) : 0
  }
}
export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
export async function jsonResponse<T>(response: Response): Promise<T> {
  const body: unknown = await response.json().catch(() => null)
  if (!response.ok) throw new ApiError(response, body)
  if (body === null) throw new Error('Respuesta JSON inesperada del servidor.')
  return body as T
}
export async function emptyResponse(response: Response) {
  if (!response.ok) throw new ApiError(response, await response.json().catch(() => null))
}
export function errorMessage(error: unknown) {
  if (error instanceof ApiError) {
    const special: Record<string, string> = {
      CLEARANCE_REQUIRED: 'El Piso de Pruebas sigue cerrado. Completa la revisión desde /estado.',
      STORAGE_NOT_VERIFIED: 'El storage del equipo todavía no está verificado.',
      MEDIA_VERIFICATION_FAILED: 'El servidor rechazó la imagen: comprueba formato, metadatos y configuración del storage.',
    }
    return `${special[error.code] ?? error.message} (${error.code})`
  }
  return error instanceof Error ? error.message : 'No se pudo completar la operación.'
}
export function safeUrl(value: string | null | undefined): string | undefined {
  if (!value) return undefined
  try { const url = new URL(value); return ['https:', 'http:'].includes(url.protocol) ? url.href : undefined } catch { return undefined }
}
export function pageParams(params: URLSearchParams) {
  const raw = Number(params.get('page') ?? 0)
  const page = Number.isSafeInteger(raw) && raw >= 0 ? raw : 0
  const size = [10, 25, 50].includes(Number(params.get('size'))) ? Number(params.get('size')) : 10
  return { page, size }
}
