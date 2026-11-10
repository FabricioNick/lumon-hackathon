import { apiRequest } from '../apiClient'
import {
  clearTokens,
  getAccessToken,
  getRefreshToken,
  hasRefreshToken,
  isTokenPair,
  refreshAccessToken,
  requestPeerAccess,
  setTokens,
  subscribeSession,
  withRefreshLock,
} from './tokenStore'

export interface LumonUser {
  id?: number | string
  email?: string
  displayName?: string
  team?: { code: string; name: string }
  role?: { code: string; name: string }
  permissions?: string[]
  clearance?: { granted: boolean; grantedAt?: string | null }
}
export interface RegisterPayload {
  teamName: string
  email: string
  password: string
}
export interface LoginPayload {
  email: string
  password: string
}
export type AuthStatus = 'loading' | 'anonymous' | 'authenticated'
export interface AuthSnapshot {
  status: AuthStatus
  user: LumonUser | null
  error: string | null
}
let snapshot: AuthSnapshot = { status: 'loading', user: null, error: null }
const listeners = new Set<() => void>()
let restoring: Promise<void> | null = null
function update(next: AuthSnapshot) {
  snapshot = next
  listeners.forEach((listener) => listener())
}
export function getAuthSnapshot() {
  return snapshot
}
export function subscribeAuth(listener: () => void) {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}
export function hasPermission(permission: string) {
  return Boolean(snapshot.user?.permissions?.includes(permission))
}
export async function loadProfile() {
  const user = await apiRequest<LumonUser>('/auth/me')
  update({ status: 'authenticated', user, error: null })
  return user
}
export async function restoreAuth() {
  if (restoring) return restoring
  restoring = (async () => {
    if (!hasRefreshToken()) {
      update({ status: 'anonymous', user: null, error: null })
      return
    }
    update({ ...snapshot, status: 'loading' })
    try {
      if (!getAccessToken()) await requestPeerAccess()
      if (!getAccessToken()) await refreshAccessToken()
      await loadProfile()
    } catch (error) {
      if (!hasRefreshToken())
        update({
          status: 'anonymous',
          user: null,
          error: error instanceof Error ? error.message : 'Sesión no disponible.',
        })
      else
        update({
          status: 'anonymous',
          user: null,
          error: 'No se pudo restaurar la sesión. Intenta de nuevo.',
        })
    }
  })().finally(() => {
    restoring = null
  })
  return restoring
}
async function startSession(
  path: '/auth/login' | '/auth/register',
  body: LoginPayload | RegisterPayload,
) {
  const result: unknown = await apiRequest<unknown>(path, {
    method: 'POST',
    body,
    auth: false,
    retry: false,
  })
  if (!isTokenPair(result)) throw new Error('Lumon no devolvió un par válido de tokens.')
  update({ status: 'loading', user: null, error: null })
  setTokens(result)
  try {
    await loadProfile()
  } catch (error) {
    clearTokens()
    update({
      status: 'anonymous',
      user: null,
      error: error instanceof Error ? error.message : 'No se pudo cargar el perfil.',
    })
    throw error
  }
}
export function login(body: LoginPayload) {
  return startSession('/auth/login', body)
}
export function register(body: RegisterPayload) {
  return startSession('/auth/register', body)
}
export async function logout() {
  try {
    await withRefreshLock(async () => {
      const refreshToken = getRefreshToken()
      try {
        if (refreshToken)
          await apiRequest<void>('/auth/logout', {
            method: 'POST',
            body: { refreshToken },
            auth: false,
            retry: false,
          })
      } finally {
        clearTokens()
        update({ status: 'anonymous', user: null, error: null })
      }
    })
  } finally {
    if (snapshot.status !== 'anonymous') {
      clearTokens()
      update({ status: 'anonymous', user: null, error: null })
    }
  }
}
subscribeSession(() => {
  if (!hasRefreshToken() && snapshot.status !== 'anonymous') {
    update({ status: 'anonymous', user: null, error: 'La sesión se cerró o fue revocada.' })
  } else if (hasRefreshToken() && getAccessToken() && snapshot.status === 'anonymous') {
    update({ status: 'loading', user: null, error: null })
    void loadProfile().catch(() =>
      update({
        status: 'anonymous',
        user: null,
        error: 'No se pudo restaurar la sesión en esta pestaña.',
      }),
    )
  }
})
