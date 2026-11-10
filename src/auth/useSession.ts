import { useSyncExternalStore } from 'react'
import { getAuthSnapshot, subscribeAuth } from '../core/auth/authService'
export function useSession() {
  const session = useSyncExternalStore(subscribeAuth, getAuthSnapshot)
  return { user: session.user, loading: session.status === 'loading', error: session.error }
import type { Me } from '../lib/contracts'

export function useSession() {
  const session = useSyncExternalStore(subscribeAuth, getAuthSnapshot)
  return { user: session.user as unknown as Me | null, loading: session.status === 'loading', error: session.error ?? '' }
}
