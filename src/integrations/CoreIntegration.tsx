import { useMemo, useSyncExternalStore } from 'react'
import { Cp45Provider } from '../features/cp45/runtime'
import type { Cp45Runtime, FloorEvent } from '../features/cp45/context'
import type { StorageConfig } from '../features/media/storageClient'
import { ContingencyModal } from '../features/contingency/ContingencyModal'
import { Layout } from '../components/Layout'
import GlobalEvents from '../core/events/GlobalEvents'
import { getAuthSnapshot, subscribeAuth } from '../core/auth/authService'
import { API_BASE_URL, BUILD } from '../core/config'
import { clearTokens, getAccessToken, refreshAccessToken, subscribeSession } from '../core/auth/tokenStore'
import { subscribeEvents } from '../core/events/eventService'
import { configureAuth, setAccess } from '../lib/http'
import '../features/cp45/styles.css'

const cp2Refresh = async (previous: string | null) => {
  if (!getAccessToken() || getAccessToken() === previous) await refreshAccessToken()
  setAccess(getAccessToken())
}
configureAuth(cp2Refresh, () => clearTokens())
setAccess(getAccessToken())
subscribeSession(() => setAccess(getAccessToken()))

async function request(path: string, init: RequestInit = {}): Promise<Response> {
  const url = /^https?:\/\//.test(path) ? path : API_BASE_URL + (path.startsWith('/') ? path : '/' + path)
  const headers = new Headers(init.headers)
  headers.set('X-Lumon-Build', BUILD)
  const access = getAccessToken()
  if (access) headers.set('Authorization', 'Bearer ' + access)
  let response = await fetch(url, { ...init, headers })
  if (response.status === 401) {
    const payload: unknown = await response.clone().json().catch(() => null)
    const code = payload && typeof payload === 'object' && 'error' in payload ? String(payload.error) : ''
    if (code === 'TOKEN_EXPIRED') {
      const renewed = await refreshAccessToken()
      if (renewed) {
        headers.set('Authorization', 'Bearer ' + renewed)
        response = await fetch(url, { ...init, headers })
      }
    } else if (code === 'TOKEN_INVALID' || code === 'SESSION_REVOKED') clearTokens()
  }
  return response
}

function storage(): StorageConfig | undefined {
  const env = import.meta.env
  if (env.VITE_STORAGE_PROVIDER === 'SUPABASE' && env.VITE_SUPABASE_URL && env.VITE_SUPABASE_PUBLIC_KEY) {
    return { provider: 'SUPABASE', projectUrl: env.VITE_SUPABASE_URL, publicKey: env.VITE_SUPABASE_PUBLIC_KEY }
  }
  if (env.VITE_STORAGE_PROVIDER === 'CLOUDINARY' && env.VITE_CLOUDINARY_CLOUD_NAME && env.VITE_CLOUDINARY_UPLOAD_PRESET && env.VITE_CLOUDINARY_UPLOAD_URL) {
    return {
      provider: 'CLOUDINARY',
      cloudName: env.VITE_CLOUDINARY_CLOUD_NAME,
      uploadPreset: env.VITE_CLOUDINARY_UPLOAD_PRESET,
      uploadUrl: env.VITE_CLOUDINARY_UPLOAD_URL
    }
  }
  return undefined
}

function subscribe(listener: (event: FloorEvent) => void) {
  return subscribeEvents(event => {
    const names = ['refiner.updated', 'contingency.activated', 'contingency.resolved', 'stream.reset', 'session.revoked']
    if (!names.includes(event.type)) return
    listener({ type: event.type, eventId: Number(event.id) || 0, data: event.data } as FloorEvent)
  })
}

export default function CoreIntegration() {
  const session = useSyncExternalStore(subscribeAuth, getAuthSnapshot)
  const user = session.user
  const teamCode = user?.team?.code ?? ''
  const permissions = user?.permissions ?? []
  const runtime = useMemo<Cp45Runtime>(() => ({
    request,
    userId: typeof user?.id === 'number' ? user.id : null,
    sessionKey: teamCode + ':' + String(user?.id ?? ''),
    permissions,
    storage: storage(),
    subscribe
  }), [user?.id, teamCode, permissions])
  return <Cp45Provider runtime={runtime}>
    <Layout><GlobalEvents /><ContingencyModal /></Layout>
  </Cp45Provider>
}
