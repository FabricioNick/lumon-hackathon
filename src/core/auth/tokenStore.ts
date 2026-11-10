import { API_BASE_URL, BUILD } from '../config'

export interface TokenPair {
  accessToken: string
  refreshToken: string
  expiresIn?: number
}

type SessionMessage =
  { type: 'tokens'; tokens: TokenPair } | { type: 'logout' } | { type: 'request-tokens' }
const REFRESH_KEY = 'lumon.refresh'
const SESSION_KEY = 'lumon.session-id'
export function getSessionKey() {
  return localStorage.getItem(SESSION_KEY) ?? ''
}
  | { type: 'tokens'; tokens: TokenPair }
  | { type: 'logout' }
  | { type: 'request-tokens' }

const REFRESH_KEY = 'lumon.refresh'
const LOGOUT_KEY = 'lumon.logout'
let accessToken: string | null = null
let refreshing: Promise<string | null> | null = null
const listeners = new Set<() => void>()
const channel =
  typeof BroadcastChannel !== 'undefined' ? new BroadcastChannel('lumon.session') : null

function notify() {
  listeners.forEach((listener) => listener())
}
function readRefresh() {
  try {
    return localStorage.getItem(REFRESH_KEY)
  } catch {
    return null
  }
}
export function hasRefreshToken() {
  return Boolean(readRefresh())
}
export function getAccessToken() {
  return accessToken
}
export function getRefreshToken() {
  return readRefresh()
}
export function subscribeSession(listener: () => void) {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}
export function setTokens(tokens: TokenPair, broadcast = true) {
  if (!getSessionKey()) localStorage.setItem(SESSION_KEY, crypto.randomUUID())
  accessToken = tokens.accessToken
  try {
    localStorage.setItem(REFRESH_KEY, tokens.refreshToken)
  } catch {}
  if (broadcast) channel?.postMessage({ type: 'tokens', tokens } satisfies SessionMessage)
  notify()
}
const channel = typeof BroadcastChannel !== 'undefined' ? new BroadcastChannel('lumon.session') : null

function notify() {
  listeners.forEach(listener => listener())
}

function readRefresh() {
  try { return localStorage.getItem(REFRESH_KEY) } catch { return null }
}

export function hasRefreshToken() { return Boolean(readRefresh()) }
export function getRefreshToken() { return readRefresh() }
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
    localStorage.removeItem(SESSION_KEY)
    if (broadcast) localStorage.setItem(LOGOUT_KEY, String(Date.now()))
  } catch {}
  if (broadcast) channel?.postMessage({ type: 'logout' } satisfies SessionMessage)
  notify()
}

channel?.addEventListener('message', (event: MessageEvent<SessionMessage>) => {
  if (event.data?.type === 'tokens') setTokens(event.data.tokens, false)
  if (event.data?.type === 'logout') clearTokens(false)
  if (event.data?.type === 'request-tokens' && accessToken && readRefresh()) {
    channel?.postMessage({
      type: 'tokens',
      tokens: { accessToken, refreshToken: readRefresh()! },
    } satisfies SessionMessage)
  }
})
if (typeof window !== 'undefined')
  window.addEventListener('storage', (event) => {
    if (event.key === LOGOUT_KEY && event.newValue) clearTokens(false)
  })
export async function refreshAccessToken(): Promise<string | null> {
  if (refreshing) return refreshing
  const initialAccess = accessToken
  const initialRefresh = readRefresh()
  refreshing = (async () => {
    if (!navigator.locks?.request)
      throw new Error('Este navegador requiere Web Locks para coordinar la sesión.')
    return navigator.locks.request('lumon.refresh', async () => {
      // A peer may have rotated while this request waited for the lock.
      if (accessToken && accessToken !== initialAccess) return accessToken
      if (readRefresh() !== initialRefresh || !accessToken) {
        channel?.postMessage({ type: 'request-tokens' } satisfies SessionMessage)
        const synced = await new Promise<string | null>((resolve) => {
          const stop = subscribeSession(() => {
            if (accessToken && accessToken !== initialAccess) finish(accessToken)
          })
          const timeout = setTimeout(() => finish(null), 150)
          function finish(value: string | null) {
            clearTimeout(timeout)
            stop()
            resolve(value)
          }
        })
        if (synced) return synced
      }
      const latest = readRefresh()
      if (!latest) return null
      // Consume locally before sending. A lost response must never reuse this token.
      localStorage.removeItem(REFRESH_KEY)
      const response = await fetch(API_BASE_URL + '/auth/refresh', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Lumon-Build': BUILD },
        body: JSON.stringify({ refreshToken: latest }),
        signal: AbortSignal.timeout(20000),
      })
      if (!response.ok) {
        const failure: unknown = await response.json().catch(() => null)
        const code =
          failure && typeof failure === 'object' && 'error' in failure ? String(failure.error) : ''
        throw new Error(code || 'No se pudo renovar la sesión.')
      }
      const tokens: unknown = await response.json()
      if (!isTokenPair(tokens)) throw new Error('Respuesta de renovación inválida.')
      setTokens(tokens)
      return tokens.accessToken
    })
  })()
    .catch((error) => {
      clearTokens()
      throw error
    })
    .finally(() => {
      refreshing = null
    })
  return refreshing
}
      tokens: { accessToken, refreshToken: readRefresh()! }
    } satisfies SessionMessage)
  }
})

if (typeof window !== 'undefined') window.addEventListener('storage', event => {
  if (event.key === LOGOUT_KEY && event.newValue) clearTokens(false)
})

export async function withRefreshLock<T>(action: () => Promise<T>): Promise<T> {
  if (typeof navigator !== 'undefined' && navigator.locks?.request) {
    return navigator.locks.request('lumon.refresh', action)
  }
  return action()
}

function waitForNewAccess(previous: string | null, timeoutMs = 900): Promise<string | null> {
  if (accessToken && accessToken !== previous) return Promise.resolve(accessToken)
  return new Promise(resolve => {
    let stop: () => void = () => {}
    const finish = (token: string | null) => {
      clearTimeout(timer)
      stop()
      resolve(token)
    }
    const timer = setTimeout(() => finish(null), timeoutMs)
    stop = subscribeSession(() => {
      if (accessToken && accessToken !== previous) finish(accessToken)
    })
    channel?.postMessage({ type: 'request-tokens' } satisfies SessionMessage)
  })
}

export async function refreshAccessToken(): Promise<string | null> {
  if (refreshing) return refreshing

  const initialToken = readRefresh()
  const previousAccess = accessToken
  if (!initialToken) return waitForNewAccess(previousAccess)

  refreshing = withRefreshLock(async () => {
    const currentToken = readRefresh()
    if (!currentToken) return waitForNewAccess(previousAccess)

    if (currentToken !== initialToken) {
      const updated = await waitForNewAccess(previousAccess)
      if (updated) return updated
    } else if (accessToken && accessToken !== previousAccess) {
      return accessToken
    }

    // A refresh token is single-use. Consume it before dispatching, so even a
    // network timeout cannot cause the same token to be submitted twice.
    try { localStorage.removeItem(REFRESH_KEY) } catch {}
    try {
      const response = await fetch(API_BASE_URL + '/auth/refresh', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Lumon-Build': BUILD },
        body: JSON.stringify({ refreshToken: currentToken })
      })

      const body: unknown = await response.json().catch(() => null)
      if (!response.ok) {
        const error = body && typeof body === 'object' && 'error' in body ? String(body.error) : ''
        throw new Error(error || 'No se pudo renovar la sesión.')
      }
      if (!isTokenPair(body)) throw new Error('Respuesta de renovación inválida.')

      setTokens(body)
      return body.accessToken
    } catch (error) {
      // An ambiguous failure cannot be retried with a consumed token.
      clearTokens()
      throw error
    }
  }).finally(() => { refreshing = null })

  return refreshing
}

export function isTokenPair(value: unknown): value is TokenPair {
  if (!value || typeof value !== 'object') return false
  const record = value as Record<string, unknown>
  return typeof record.accessToken === 'string' && typeof record.refreshToken === 'string'
}
