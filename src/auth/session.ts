import { z } from 'zod'
import { configureAuth, request, setAccess } from '../lib/http'
import { meSchema, tokensSchema } from '../lib/contracts'
import type { Me } from '../lib/contracts'

const storageKey = 'lumon.refresh'
let access: string | null = null
let current: { user: Me | null; loading: boolean; error: string } = { user: null, loading: true, error: '' }
const listeners = new Set<() => void>()
const channel = typeof BroadcastChannel === 'undefined' ? null : new BroadcastChannel('lumon.session')
const emit = () => { for (const listener of listeners) listener() }
export const subscribe = (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener) } }
export const snapshot = () => current
function clear(reason: string, broadcast = true) {
  access = null; setAccess(null); localStorage.removeItem(storageKey)
  current = { user: null, loading: false, error: reason }; emit()
  if (broadcast) channel?.postMessage({ type: 'logout', reason })
}
const pairMessage = z.object({ type: z.literal('tokens'), pair: tokensSchema })
channel?.addEventListener('message', event => {
  const parsed = pairMessage.safeParse(event.data)
  if (parsed.success) { access = parsed.data.pair.accessToken; setAccess(access) }
  else if (z.object({ type: z.literal('logout') }).safeParse(event.data).success) clear('La sesión se cerró en otra pestaña.', false)
})
let renewal: Promise<void> | null = null
async function renew(old: string | null) {
  if (access && access !== old) return
  if (renewal) return renewal
  renewal = navigator.locks.request('lumon.refresh', async () => {
    // Give BroadcastChannel deliveries a task turn after acquiring the cross-tab lock.
    await new Promise(resolve => setTimeout(resolve, 0))
    if (access && access !== old) return
    const refreshToken = localStorage.getItem(storageKey)
    if (!refreshToken) throw new Error('Inicia sesión para continuar.')
    // Remove BEFORE dispatch: an ambiguous network failure must never reuse a consumed token.
    localStorage.removeItem(storageKey)
    try {
      const pair = await request('/auth/refresh', tokensSchema, { method: 'POST', body: { refreshToken }, public: true, retry: false })
      localStorage.setItem(storageKey, pair.refreshToken); access = pair.accessToken; setAccess(access)
      channel?.postMessage({ type: 'tokens', pair })
    } catch (error) { clear('No se pudo renovar la sesión. Inicia sesión de nuevo.'); throw error }
  }).finally(() => { renewal = null })
  return renewal
}
configureAuth(renew, reason => clear(`Sesión no válida (${reason}). Inicia sesión de nuevo.`))
let bootstrap: Promise<void> | null = null
export function restore() {
  bootstrap ??= (async () => {
    try {
      if (!access && localStorage.getItem(storageKey)) await renew(null)
      const user = access ? await request('/auth/me', meSchema) : null
      current = { user, loading: false, error: '' }; emit()
    } catch { current = { ...current, loading: false }; emit() }
  })()
  return bootstrap
}
export async function login(email: string, password: string) {
  const pair = await request('/auth/login', tokensSchema, { method: 'POST', body: { email, password }, public: true })
  access = pair.accessToken; setAccess(access); localStorage.setItem(storageKey, pair.refreshToken)
  channel?.postMessage({ type: 'tokens', pair })
  const user = await request('/auth/me', meSchema)
  current = { user, loading: false, error: '' }; emit()
}
export async function logout() {
  await navigator.locks.request('lumon.refresh', async () => {
    const refreshToken = localStorage.getItem(storageKey)
    try { if (refreshToken) await request('/auth/logout', z.unknown(), { method: 'POST', body: { refreshToken }, public: true }) }
    finally { clear('Sesión cerrada.') }
  })
}
