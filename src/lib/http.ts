import { z } from 'zod'
import { config } from './config'
import { getAccessToken, refreshAccessToken, clearTokens } from '../core/auth/tokenStore'

const errorSchema = z.object({
  error: z.string(),
  message: z.string(),
  details: z.unknown().optional(),
})
export class ApiError extends Error {
  status: number
  code: string
  details: unknown
  retryAfterMs: number
  constructor(status: number, code: string, message: string, details?: unknown, retryAfterMs = 0) {
    super(message)
    this.status = status
    this.code = code
    this.details = details
    this.retryAfterMs = retryAfterMs
  }
}
export function message(error: unknown): string {
  if (error instanceof z.ZodError) return 'La API devolvió datos incompatibles con el contrato.'
  return error instanceof Error ? error.message : 'Error inesperado.'
}
export function aborted(error: unknown) {
  return error instanceof DOMException && error.name === 'AbortError'
}
export function delay(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    signal?.throwIfAborted()
    const cancel = () => {
      clearTimeout(timer)
      reject(new DOMException('Cancelado', 'AbortError'))
    }
    const timer = setTimeout(() => {
      signal?.removeEventListener('abort', cancel)
      resolve()
    }, ms)
    signal?.addEventListener('abort', cancel, { once: true })
  })
}
let blockedUntil = 0
const rateChannel =
  typeof BroadcastChannel === 'undefined' ? null : new BroadcastChannel('lumon.rate-limit')
rateChannel?.addEventListener('message', (event) => {
  if (typeof event.data === 'number' && Number.isFinite(event.data))
    blockedUntil = Math.max(blockedUntil, event.data)
})
function retryAfter(value: string | null): number {
  if (!value) return 1000
  const n = Number(value)
  return Number.isFinite(n)
    ? Math.max(0, n * 1000)
    : Math.max(0, Date.parse(value) - Date.now()) || 1000
}
// Shared gate: a 429 pauses ALL new requests, including queued tiles.
async function gate(signal?: AbortSignal) {
  while (blockedUntil > Date.now()) await delay(blockedUntil - Date.now(), signal)
}
export interface Options {
  headers?: HeadersInit
  method?: string
  body?: unknown
  signal?: AbortSignal
  key?: string
  public?: boolean
  retry?: boolean
}
export async function rawRequest(path: string, options: Options = {}): Promise<Response> {
  const retryable =
    options.retry !== false && (!options.method || options.method === 'GET' || !!options.key)
  let refreshed = false
  for (let attempt = 0; ; attempt++) {
    await gate(options.signal)
    options.signal?.throwIfAborted()
    const usedToken = getAccessToken()
    let response: Response
    try {
      response = await fetch(`${config.api}${path}`, {
        method: options.method ?? 'GET',
        signal: AbortSignal.any([
          ...(options.signal ? [options.signal] : []),
          AbortSignal.timeout(20000),
        ]),
        headers: {
          ...Object.fromEntries(new Headers(options.headers)),
          'X-Lumon-Build': config.build,
          ...(!options.public && usedToken ? { Authorization: `Bearer ${usedToken}` } : {}),
          ...(options.body !== undefined ? { 'Content-Type': 'application/json' } : {}),
          ...(options.key ? { 'Idempotency-Key': options.key } : {}),
        },
        body:
          options.body === undefined
            ? undefined
            : typeof options.body === 'string'
              ? options.body
              : JSON.stringify(options.body),
      })
    } catch (error) {
      if (aborted(error) || !retryable || attempt >= 4) throw error
      await delay(Math.min(16000, 500 * 2 ** attempt) + Math.random() * 300, options.signal)
      continue
    }
    if (response.status === 429) {
      blockedUntil = Math.max(
        blockedUntil,
        Date.now() + retryAfter(response.headers.get('Retry-After')),
      )
      rateChannel?.postMessage(blockedUntil)
    }
    if ((response.status === 429 || response.status === 503) && retryable && attempt < 5) {
      await delay(
        Math.max(
          retryAfter(response.headers.get('Retry-After')),
          Math.min(16000, 500 * 2 ** attempt),
        ) +
          Math.random() * 300,
        options.signal,
      )
      continue
    }
    let body: unknown
    try {
      body = response.status === 204 ? null : await response.clone().json()
    } catch (error) {
      if (!retryable || attempt >= 4 || options.signal?.aborted) throw error
      await delay(500 * 2 ** attempt, options.signal)
      continue
    }
    if (response.ok) return response
    const parsed = errorSchema.safeParse(body)
    const code = parsed.success ? parsed.data.error : 'HTTP_ERROR'
    if (!options.public && response.status === 401) {
      if (code === 'TOKEN_EXPIRED' && !refreshed) {
        refreshed = true
        if (getAccessToken() === usedToken) await refreshAccessToken()
        continue
      }
      clearTokens()
    }
    return response
  }
}
export async function request<T>(
  path: string,
  schema: z.ZodType<T>,
  options: Options = {},
): Promise<T> {
  const response = await rawRequest(path, options)
  const body: unknown = response.status === 204 ? null : await response.json()
  if (!response.ok) {
    const parsed = errorSchema.safeParse(body)
    throw new ApiError(
      response.status,
      parsed.success ? parsed.data.error : 'HTTP_ERROR',
      parsed.success ? parsed.data.message : `Error HTTP ${response.status}`,
      parsed.success ? parsed.data.details : undefined,
      retryAfter(response.headers.get('Retry-After')),
    )
  }
  return schema.parse(body)
}
