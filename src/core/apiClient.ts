import { API_BASE_URL, BUILD, assertApiConfigured } from './config'
import { clearTokens, getAccessToken, refreshAccessToken } from './auth/tokenStore'

export interface LumonErrorBody {
  error?: string
  message?: string
  details?: unknown
  requestId?: string
}
export class ApiError extends Error {
  status: number
  code: string
  details: unknown
  requestId?: string

  constructor(status: number, code: string, message: string, details: unknown = null, requestId?: string) {
    super(message)
    this.name = 'ApiError'
    this.status = status
    this.code = code
    this.details = details
    this.requestId = requestId
  }
}
export interface ApiOptions extends Omit<RequestInit, 'body'> {
  body?: unknown
  auth?: boolean
  retry?: boolean
}
function contentBody(body: unknown, headers: Headers): BodyInit | undefined {
  if (body === undefined || body === null) return undefined
  if (body instanceof FormData || body instanceof Blob || body instanceof URLSearchParams) return body
  if (typeof body === 'string') return body
  headers.set('Content-Type', 'application/json')
  return JSON.stringify(body)
}
async function readResponse<T>(response: Response): Promise<T> {
  if (response.status === 204) return undefined as T
  const text = await response.text()
  const data: unknown = text ? (() => { try { return JSON.parse(text) as unknown } catch { return text } })() : null
  if (!response.ok) {
    const body = data && typeof data === 'object' ? data as LumonErrorBody : {}
    throw new ApiError(response.status, body.error ?? 'HTTP_ERROR', body.message ?? `Error HTTP ${response.status}`, body.details, body.requestId)
  }
  return data as T
}
function retryDelay(response: Response, attempt: number) {
  const retryAfter = response.headers.get('Retry-After')
  if (retryAfter) {
    const seconds = Number(retryAfter)
    if (Number.isFinite(seconds)) return Math.max(0, seconds * 1000)
    const date = Date.parse(retryAfter)
    if (Number.isFinite(date)) return Math.max(0, date - Date.now())
  }
  return Math.min(1000 * 2 ** attempt, 8000)
}
function pause(ms: number, signal?: AbortSignal | null) {
  return new Promise<void>((resolve, reject) => {
    if (signal?.aborted) { reject(new DOMException('Aborted', 'AbortError')); return }
    const timeout = setTimeout(() => { signal?.removeEventListener('abort', abort); resolve() }, ms)
    function abort() {
      clearTimeout(timeout)
      reject(new DOMException('Aborted', 'AbortError'))
    }
    signal?.addEventListener('abort', abort, { once: true })
  })
}
export async function apiRequest<T>(path: string, options: ApiOptions = {}): Promise<T> {
  assertApiConfigured()
  const { auth = true, retry = true, body, ...init } = options
  const method = (init.method ?? 'GET').toUpperCase()
  const url = /^https?:\/\//.test(path) ? path : `${API_BASE_URL}${path.startsWith('/') ? path : '/' + path}`
  if (new URL(url).origin !== new URL(API_BASE_URL).origin) throw new Error('El cliente HTTP solo admite la API de Lumon.')
  let refreshed = false
  for (let attempt = 0; ; attempt++) {
    const headers = new Headers(init.headers)
    headers.set('X-Lumon-Build', BUILD)
    const payload = contentBody(body, headers)
    if (auth) {
      const access = getAccessToken()
      if (access) headers.set('Authorization', `Bearer ${access}`)
    }
    const response = await fetch(url, { ...init, method, headers, body: payload })
    if (response.status === 401 && auth && !refreshed) {
      const failure: unknown = await response.clone().json().catch(() => null)
      const code = failure && typeof failure === 'object' && 'error' in failure ? String(failure.error) : ''
      if (code === 'TOKEN_EXPIRED') {
        refreshed = true
        const token = await refreshAccessToken()
        if (token) continue
        clearTokens()
      }
      if (['SESSION_REVOKED', 'REFRESH_REUSED', 'TOKEN_INVALID'].includes(code)) clearTokens()
    }
    if (retry && method === 'GET' && attempt < 3 && [429, 503].includes(response.status)) {
      await response.body?.cancel()
      await pause(retryDelay(response, attempt), init.signal)
      continue
    }
    return readResponse<T>(response)
  }
}
export const apiClient = apiRequest
