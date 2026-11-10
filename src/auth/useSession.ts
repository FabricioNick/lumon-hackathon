import { useSyncExternalStore } from 'react'
import { getAuthSnapshot, subscribeAuth } from '../core/auth/authService'
export function useSession() {
 const session = useSyncExternalStore(subscribeAuth, getAuthSnapshot)
 return { user: session.user, loading: session.status === 'loading', error: session.error }
}
