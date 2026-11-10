/* Praise Kier */
import { lazy, Suspense, useMemo, useSyncExternalStore } from 'react'
import { getAuthSnapshot, subscribeAuth } from '../core/auth/authService'
import { Layout } from '../components/Layout'
import { Cp45Provider } from '../features/cp45/runtime'
import type { Cp45Runtime, FloorEvent } from '../features/cp45/context'
import { apiResponse } from '../core/apiClient'
import { subscribeEvents } from '../core/events/eventService'
import { getSessionKey } from '../core/auth/tokenStore'
import { storageConfigFromEnv } from '../features/media/storageConfig'
import { ContingencyModal } from '../features/contingency/ContingencyModal'
const GlobalEvents = lazy(() => import('../core/events/GlobalEvents'))
export default function CoreIntegration() {
  const { user } = useSyncExternalStore(subscribeAuth, getAuthSnapshot)
  const runtime = useMemo<Cp45Runtime>(
    () => ({
      request: apiResponse,
      storage: storageConfigFromEnv(),
      userId: user?.id ?? null,
      sessionKey: getSessionKey(),
      permissions: user?.permissions ?? [],
      subscribe: (listener) =>
        subscribeEvents((event) => {
          if (
            [
              'refiner.updated',
              'contingency.activated',
              'contingency.resolved',
              'stream.reset',
              'session.revoked',
            ].includes(event.type)
          )
            listener({
              type: event.type,
              eventId: Number(event.id),
              data: event.data,
            } as FloorEvent)
        }),
    }),
    [user],
  )
  return (
    <Cp45Provider runtime={runtime}>
      <Layout>
        <Suspense fallback={null}>
          <GlobalEvents />
        </Suspense>
        <ContingencyModal />
      </Layout>
    </Cp45Provider>
  )
}
