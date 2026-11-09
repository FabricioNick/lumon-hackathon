import { lazy, Suspense, useEffect, useMemo, useState, useSyncExternalStore } from 'react'
import type { ComponentType } from 'react'
import { BrowserRouter, Link, Navigate, Route, Routes, useLocation } from 'react-router-dom'
import { getAuthSnapshot, restoreAuth, subscribeAuth } from '../core/auth/authService'
import { apiRequest } from '../core/apiClient'
import { Layout } from '../components/Layout'
import { RouteBoundary } from '../components/RouteBoundary'
import { AuthPage } from '../features/auth/AuthPage'
import { StatusPage } from '../features/status/StatusPage'

const GlobalEvents = lazy(() => import('../core/events/GlobalEvents'))
const modules = import.meta.glob<{ default: ComponentType }>('../features/**/pages/*Page.tsx')

function FeaturePage({ modulePath, label }: { modulePath: string; label: string }) {
  const Component = useMemo(() => {
    const loader = modules[modulePath]
    return loader ? lazy(loader) : null
  }, [modulePath])
  if (!Component) return (
    <section className="panel">
      <p className="eyebrow">Módulo en integración</p>
      <h1>{label}</h1>
      <p>Tu compañero está desarrollando este módulo en su rama. Aparecerá al integrar su Pull Request.</p>
    </section>
  )
  return <Suspense fallback={<p className="panel">Cargando {label}…</p>}><Component /></Suspense>
}

function Private({ children, permission }: { children: React.ReactNode; permission?: string }) {
  const session = useSyncExternalStore(subscribeAuth, getAuthSnapshot)
  const location = useLocation()
  if (session.status === 'loading') return <Loading />
  if (session.status !== 'authenticated') {
    const next = encodeURIComponent(location.pathname + location.search)
    return <Navigate to={'/login?next=' + next} replace />
  }
  if (permission && !session.user?.permissions?.includes(permission)) return (
    <section className="panel"><h1>Sin permiso</h1><p>Tu rol no tiene el permiso {permission}.</p><Link to="/">Volver al inicio</Link></section>
  )
  return <>{children}</>
}

function Loading() {
  return <main className="auth-screen"><section className="auth-card"><p className="eyebrow">LUMON INDUSTRIES</p><h1>Conectando con Lumon…</h1><p>Verificando tu sesión de forma segura.</p></section></main>
}

function Home() {
  const session = useSyncExternalStore(subscribeAuth, getAuthSnapshot)
  return (
    <section className="home">
      <p className="eyebrow">MACRODATA REFINEMENT · ORIENTACIÓN</p>
      <h1>El trabajo es misterioso e importante.</h1>
      <p className="muted">Bienvenido al piso separado{session.user?.displayName ? ', ' + session.user.displayName : ''}. Consulta tu estado de producción o abre un módulo de refinamiento.</p>
      <div className="tiles">
        <Link className="tile" to="/files"><span>01 / DATOS</span><strong>Archivos de refinamiento</strong><small>Explorar y refinar</small></Link>
        <Link className="tile" to="/refiners"><span>02 / PERSONAL</span><strong>Expedientes</strong><small>Directorio y fotochecks</small></Link>
        <Link className="tile" to="/incidents"><span>03 / INCIDENCIAS</span><strong>Reportes</strong><small>Registrar y consultar</small></Link>
        <Link className="tile" to="/estado"><span>04 / CONTROL</span><strong>Estado del piso</strong><small>Integraciones y clearance</small></Link>
      </div>
    </section>
  )
}

function AppRoutes() {
  const [health, setHealth] = useState<'checking' | 'online' | 'offline'>('checking')
  const [manualRetry, setManualRetry] = useState(0)
  useEffect(() => { void restoreAuth() }, [])
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
        timer = setTimeout(() => { void check() }, 30000)
      } catch {
        if (!active) return
        attempts++
        setHealth('offline')
        timer = setTimeout(() => { void check() }, Math.min(2000 * 2 ** (attempts - 1), 30000))
      } finally { clearTimeout(timeout) }
    }
    void check()
    return () => { active = false; controller?.abort(); clearTimeout(timer) }
  }, [manualRetry])
  if (health !== 'online') return <main className="auth-screen"><section className="auth-card">
    <p className="eyebrow">LUMON INDUSTRIES</p>
    <h1>Conectando con Lumon…</h1>
    <p className="muted">{health === 'offline' ? 'No responde el servicio. Se reintentará la conexión automáticamente.' : 'Verificando el estado del servidor.'}</p>
    {health === 'offline' && <button type="button" className="button primary" onClick={() => {
      setHealth('checking')
      setManualRetry(previous => previous + 1)
    }}>Reintentar ahora</button>}
  </section></main>
  return <BrowserRouter>
    <Routes>
      <Route path="/login" element={<AuthPage mode="login" />} />
      <Route path="/register" element={<AuthPage mode="register" />} />
      <Route element={<Private><Layout><Suspense fallback={null}><GlobalEvents /></Suspense></Layout></Private>}>
        <Route index element={<RouteBoundary><Home /></RouteBoundary>} />
        <Route path="/estado" element={<RouteBoundary><StatusPage /></RouteBoundary>} />
        <Route path="/files" element={<RouteBoundary><Private permission="files:read"><FeaturePage modulePath="../features/files/pages/FilesPage.tsx" label="Archivos" /></Private></RouteBoundary>} />
        <Route path="/files/:id/refine" element={<RouteBoundary><Private permission="files:refine"><FeaturePage modulePath="../features/files/pages/RefinePage.tsx" label="Refinamiento" /></Private></RouteBoundary>} />
        <Route path="/refiners" element={<RouteBoundary><Private permission="refiners:read"><FeaturePage modulePath="../features/refiners/pages/RefinersPage.tsx" label="Expedientes" /></Private></RouteBoundary>} />
        <Route path="/refiners/:id/badge" element={<RouteBoundary><Private permission="media:upload"><FeaturePage modulePath="../features/refiners/pages/BadgeEditorPage.tsx" label="Fotocheck" /></Private></RouteBoundary>} />
        <Route path="/refiners/:id/edit" element={<RouteBoundary><Private permission="refiners:write"><FeaturePage modulePath="../features/refiners/pages/RefinerEditPage.tsx" label="Editar expediente" /></Private></RouteBoundary>} />
        <Route path="/incidents" element={<RouteBoundary><Private permission="incidents:read"><FeaturePage modulePath="../features/incidents/pages/IncidentsPage.tsx" label="Incidencias" /></Private></RouteBoundary>} />
        <Route path="/incidents/new" element={<RouteBoundary><Private permission="incidents:create"><FeaturePage modulePath="../features/incidents/pages/NewIncidentPage.tsx" label="Nueva incidencia" /></Private></RouteBoundary>} />
        <Route path="*" element={<section className="panel"><h1>404 · Archivo no encontrado</h1><Link to="/">Regresar</Link></section>} />
      </Route>
    </Routes>
  </BrowserRouter>
}
export default AppRoutes
