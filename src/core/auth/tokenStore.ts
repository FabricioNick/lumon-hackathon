import { API_BASE_URL, BUILD } from '../config'

export interface TokenPair {
  accessToken: string
  refreshToken: string
  expiresIn?: number
}

type SessionMessage = { type: 'tokens'; tokens: TokenPair } | { type: 'logout' }
const REFRESH_KEY = 'lumon.refresh'
const LOGOUT_KEY = 'lumon.logout'
let accessToken: string | null = null
let refreshing: Promise<string | null> | null = null
const listeners = new Set<() => void>()
const channel = typeof BroadcastChannel !== 'undefined' ? new BroadcastChannel('lumon.session') : null

function notify() {
  listeners.forEach(listener => listener())
}
function readRefresh() {
  try { return localStorage.getItem(REFRESH_KEY) } catch { return null }
}
export function hasRefreshToken() { return Boolean(readRefresh()) }
export function getAccessToken() { return accessToken }
export function subscribeSession(listener: () => void) {
  listeners.add(listener)
  return () => { listeners.delete(listener) }
}
export function setTokens(tokens: TokenPair, broadcast = true) {
  accessToken = tokens.accessToken
  try { localStorage.setItem(REFRESH_KEY, tokens.refreshToken) } catch {}
  if (broadcast) channel?.postMessage({ type: 'tokens', tokens } satisfies SessionMessage)
  notify()
}
export function clearTokens(broadcast = true) {
  accessToken = null
  try {
    localStorage.removeItem(REFRESH_KEY)
    if (broadcast) localStorage.setItem(LOGOUT_KEY, String(Date.now()))
  } catch {}
  if (broadcast) channel?.postMessage({ type: 'logout' } satisfies SessionMessage)
  notify()
}
channel?.addEventListener('message', (event: MessageEvent<SessionMessage>) => {
  if (event.data?.type === 'tokens') setTokens(event.data.tokens, false)
  if (event.data?.type === 'logout') clearTokens(false)
})
if (typeof window !== 'undefined') window.addEventListener('storage', event => {
  if (event.key === LOGOUT_KEY && event.newValue) clearTokens(false)
})
export async function refreshAccessToken(): Promise<string | null> {
  if (refreshing) return refreshing
  refreshing = (async () => {
    const initialToken = readRefresh()
    if (!initialToken) return null
    const rotate = async () => {
      const latest = readRefresh()
      if (!latest) return null
      if (latest !== initialToken && accessToken) return accessToken
      const response = await fetch(API_BASE_URL + '/auth/refresh', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Lumon-Build': BUILD },
        body: JSON.stringify({ refreshToken: latest })
      })
      if (!response.ok) {
        const failure: unknown = await response.json().catch(() => null)
        const code = failure && typeof failure === 'object' && 'error' in failure ? String(failure.error) : ''
        if (['REFRESH_REUSED', 'SESSION_REVOKED', 'TOKEN_INVALID'].includes(code) || response.status === 401) clearTokens()
        throw new Error(code || 'No se pudo renovar la sesión.')
      }
      const tokens: unknown = await response.json()
      if (!isTokenPair(tokens)) throw new Error('Respuesta de renovación inválida.')
      setTokens(tokens)
      return tokens.accessToken
    }
    if (typeof navigator !== 'undefined' && navigator.locks?.request) {
      return navigator.locks.request('lumon.refresh', rotate)
    }
    return rotate()
  })().finally(() => { refreshing = null })
  return refreshing
}
export function isTokenPair(value: unknown): value is TokenPair {
  if (!value || typeof value !== 'object') return false
  const record = value as Record<string, unknown>
  return typeof record.accessToken === 'string' && typeof record.refreshToken === 'string'
}
