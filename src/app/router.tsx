import { lazy, Suspense, useEffect, useState, useSyncExternalStore } from 'react'
import { BrowserRouter, Link, Navigate, Route, Routes, useLocation } from 'react-router-dom'
import { getAuthSnapshot, restoreAuth, subscribeAuth } from '../core/auth/authService'
import { apiRequest } from '../core/apiClient'
import { RouteBoundary } from '../components/RouteBoundary'
import { AuthPage } from '../features/auth/AuthPage'
import { StatusPage } from '../features/status/StatusPage'

const CoreIntegration = lazy(() => import('../integrations/CoreIntegration'))
const FilesPage = lazy(() => import('../files/FilesPage'))
const RefinePage = lazy(() => import('../files/RefinePage'))
const RefinersPage = lazy(() => import('../features/refiners/pages/RefinersPage.tsx'))
const RefinerDetailPage = lazy(() => import('../features/refiners/pages/RefinerDetailPage.tsx'))
const BadgeEditorPage = lazy(() => import('../features/refiners/pages/BadgeEditorPage.tsx'))
const RefinerEditPage = lazy(() => import('../features/refiners/pages/RefinerEditPage.tsx'))
const IncidentsPage = lazy(() => import('../features/incidents/pages/IncidentsPage.tsx'))
const NewIncidentPage = lazy(() => import('../features/incidents/pages/NewIncidentPage.tsx'))

function Private({
  children,
  permission,
}: {
  children: React.ReactNode
  permission?: string | string[]
}) {
  const session = useSyncExternalStore(subscribeAuth, getAuthSnapshot)
  const location = useLocation()
  if (session.status === 'loading') return <Loading />
  if (session.status !== 'authenticated') {
    const next = encodeURIComponent(location.pathname + location.search)
    return <Navigate to={'/login?next=' + next} replace />
  }
  const required = typeof permission === 'string' ? [permission] : (permission ?? [])
  const missing = required.find((name) => !session.user?.permissions?.includes(name))
  if (missing)
    return (
      <section className="panel">
        <h1>Sin permiso</h1>
        <p>Tu usuario no tiene el permiso {missing}.</p>
        <Link to="/">Volver al inicio</Link>
      </section>
    )
  return <>{children}</>
}

function Loading() {
  return (
    <main className="auth-screen">
      <section className="auth-card">
        <p className="eyebrow">LUMON INDUSTRIES</p>
        <h1>Conectando con Lumon…</h1>
        <p>Verificando tu sesión de forma segura.</p>
      </section>
    </main>
  )
}

function Home() {
  const session = useSyncExternalStore(subscribeAuth, getAuthSnapshot)
  return (
    <section className="home">
      <p className="eyebrow">MACRODATA REFINEMENT · ORIENTACIÓN</p>
      <h1>El trabajo es misterioso e importante.</h1>
      <p className="muted">
        Bienvenido al piso separado
        {session.user?.displayName ? ', ' + session.user.displayName : ''}. Consulta tu estado de
        producción o abre un módulo de refinamiento.
      </p>
      <div className="tiles">
        <Link className="tile" to="/files">
          <span>01 / DATOS</span>
          <strong>Archivos de refinamiento</strong>
          <small>Explorar y refinar</small>
        </Link>
        <Link className="tile" to="/refiners">
          <span>02 / PERSONAL</span>
          <strong>Expedientes</strong>
          <small>Directorio y fotochecks</small>
        </Link>
        <Link className="tile" to="/incidents">
          <span>03 / INCIDENCIAS</span>
          <strong>Reportes</strong>
          <small>Registrar y consultar</small>
        </Link>
        <Link className="tile" to="/estado">
          <span>04 / CONTROL</span>
          <strong>Estado del piso</strong>
          <small>Integraciones y clearance</small>
        </Link>
      </div>
    </section>
  )
}

function AppRoutes() {
  const [health, setHealth] = useState<'checking' | 'online' | 'offline'>('checking')
  const [manualRetry, setManualRetry] = useState(0)
  useEffect(() => {
    void restoreAuth()
  }, [])
  useEffect(() => {
    let active = true
    let timer: ReturnType<typeof setTimeout>
    let attempts = 0
    let controller: AbortController | null = null
    const check = async () => {
      controller = new AbortController()
      const timeout = setTimeout(() => controller?.abort(), 10000)
      try {
        await apiRequest('/meta/health', { auth: false, retry: false, signal: controller.signal })
        if (!active) return
        setHealth('online')
        attempts = 0
        timer = setTimeout(() => {
          void check()
        }, 30000)
      } catch {
        if (!active) return
        attempts++
        setHealth('offline')
        timer = setTimeout(
          () => {
            void check()
          },
          Math.min(2000 * 2 ** (attempts - 1), 30000),
        )
      } finally {
        clearTimeout(timeout)
      }
    }
    void check()
    return () => {
      active = false
      controller?.abort()
      clearTimeout(timer)
    }
  }, [manualRetry])
  if (health !== 'online')
    return (
      <main className="auth-screen">
        <section className="auth-card">
          <p className="eyebrow">LUMON INDUSTRIES</p>
          <h1>Conectando con Lumon…</h1>
          <p className="muted">
            {health === 'offline'
              ? 'No responde el servicio. Se reintentará la conexión automáticamente.'
              : 'Verificando el estado del servidor.'}
          </p>
          {health === 'offline' && (
            <button
              type="button"
              className="button primary"
              onClick={() => {
                setHealth('checking')
                setManualRetry((previous) => previous + 1)
              }}
            >
              Reintentar ahora
            </button>
          )}
        </section>
      </main>
    )
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<AuthPage mode="login" />} />
        <Route path="/register" element={<AuthPage mode="register" />} />
        <Route
          element={
            <Private>
              <Suspense fallback={<Loading />}>
                <CoreIntegration />
              </Suspense>
            </Private>
          }
        >
          <Route
            index
            element={
              <RouteBoundary>
                <Home />
              </RouteBoundary>
            }
          />
          <Route
            path="/estado"
            element={
              <RouteBoundary>
                <StatusPage />
              </RouteBoundary>
            }
          />
          <Route
            path="/files"
            element={
              <RouteBoundary>
                <Private permission="files:read">
                  <Suspense fallback={<p className="panel">Cargando archivos…</p>}>
                    <FilesPage />
                  </Suspense>
                </Private>
              </RouteBoundary>
            }
          />
          <Route
            path="/files/:id/refine"
            element={
              <RouteBoundary>
                <Private permission="files:read">
                  <Suspense fallback={<p className="panel">Cargando refinamiento…</p>}>
                    <RefinePage />
                  </Suspense>
                </Private>
              </RouteBoundary>
            }
          />
          <Route
            path="/refiners"
            element={
              <RouteBoundary>
                <Private permission="refiners:read">
                  <Suspense fallback={<p className="panel">Cargando módulo…</p>}>
                    <RefinersPage />
                  </Suspense>
                </Private>
              </RouteBoundary>
            }
          />
          <Route
            path="/refiners/:id"
            element={
              <RouteBoundary>
                <Private permission="refiners:read">
                  <Suspense fallback={<p className="panel">Cargando módulo…</p>}>
                    <RefinerDetailPage />
                  </Suspense>
                </Private>
              </RouteBoundary>
            }
          />
          <Route
            path="/refiners/:id/badge"
            element={
              <RouteBoundary>
                <Private permission={['refiners:read', 'refiners:write', 'media:upload']}>
                  <Suspense fallback={<p className="panel">Cargando módulo…</p>}>
                    <BadgeEditorPage />
                  </Suspense>
                </Private>
              </RouteBoundary>
            }
          />
          <Route
            path="/refiners/:id/edit"
            element={
              <RouteBoundary>
                <Private permission={['refiners:read', 'refiners:write']}>
                  <Suspense fallback={<p className="panel">Cargando módulo…</p>}>
                    <RefinerEditPage />
                  </Suspense>
                </Private>
              </RouteBoundary>
            }
          />
          <Route
            path="/incidents"
            element={
              <RouteBoundary>
                <Private permission="incidents:read">
                  <Suspense fallback={<p className="panel">Cargando módulo…</p>}>
                    <IncidentsPage />
                  </Suspense>
                </Private>
              </RouteBoundary>
            }
          />
          <Route
            path="/incidents/new"
            element={
              <RouteBoundary>
                <Private permission={['incidents:create', 'media:upload']}>
                  <Suspense fallback={<p className="panel">Cargando módulo…</p>}>
                    <NewIncidentPage />
                  </Suspense>
                </Private>
              </RouteBoundary>
            }
          />
          <Route
            path="*"
            element={
              <section className="panel">
                <h1>404 · Archivo no encontrado</h1>
                <Link to="/">Regresar</Link>
              </section>
            }
          />
        </Route>
      </Routes>
    </BrowserRouter>
  )
}
export default AppRoutes
