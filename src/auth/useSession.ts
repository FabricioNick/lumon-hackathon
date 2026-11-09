import { useSyncExternalStore } from 'react'
import { snapshot, subscribe } from './session'
export function useSession() { return useSyncExternalStore(subscribe, snapshot) }
