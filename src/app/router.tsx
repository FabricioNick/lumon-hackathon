/* Praise Kier */
import { lazy, Suspense, useEffect, useMemo, useSyncExternalStore } from 'react'
import { BrowserRouter, Link, Navigate, Route, Routes, useLocation } from 'react-router-dom'
import { getAuthSnapshot, restoreAuth, subscribeAuth } from '../core/auth/authService'
import { Layout } from '../components/Layout'
import { RouteBoundary } from '../components/RouteBoundary'
import { AuthPage } from '../features/auth/AuthPage'
import { StatusPage } from '../features/status/StatusPage'

const GlobalEvents = lazy(() => import('../core/events/GlobalEvents'))
const Files = lazy(() => import('../files/FilesPage'))
const Refine = lazy(() => import('../files/RefinePage'))
import { createCp45Routes } from '../features/cp45/routeDefinitions'
import { Cp45Provider } from '../features/cp45/runtime'
import type { Cp45Runtime, FloorEvent } from '../features/cp45/context'
import { apiResponse } from '../core/apiClient'
import { subscribeEvents } from '../core/events/eventService'
import { storageConfigFromEnv } from '../features/media/storageConfig'
import { ContingencyModal } from '../features/contingency/ContingencyModal'
import '../features/cp45/styles.css'
function RuntimeLayout() {
 const { user } = useSyncExternalStore(subscribeAuth, getAuthSnapshot)
 const runtime = useMemo<Cp45Runtime>(() => ({
  request: apiResponse, storage: storageConfigFromEnv(), userId: user?.id ?? null,
  sessionKey: `${user?.team?.code ?? ''}:${user?.id ?? ''}`, permissions: user?.permissions ?? [],
  subscribe: listener => subscribeEvents(event => {
   if (['refiner.updated', 'contingency.activated', 'contingency.resolved', 'stream.reset', 'session.revoked'].includes(event.type))
    listener({ type: event.type, eventId: Number(event.id), data: event.data } as FloorEvent)
  })
 }), [user])
 return <Cp45Provider runtime={runtime}><Layout><Suspense fallback={null}><GlobalEvents /></Suspense><ContingencyModal /></Layout></Cp45Provider>
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
  useEffect(() => { void restoreAuth() }, [])
  return <BrowserRouter>
    <Routes>
      <Route path="/login" element={<AuthPage mode="login" />} />
      <Route path="/register" element={<AuthPage mode="register" />} />
      <Route element={<Private><RuntimeLayout /></Private>}>
        <Route index element={<RouteBoundary><Home /></RouteBoundary>} />
        <Route path="/estado" element={<RouteBoundary><StatusPage /></RouteBoundary>} />
        <Route path="/files" element={<RouteBoundary><Suspense fallback={<p role="status">Cargando…</p>}><Files /></Suspense></RouteBoundary>} />
        <Route path="/files/:id/refine" element={<RouteBoundary><Suspense fallback={<p role="status">Cargando…</p>}><Refine /></Suspense></RouteBoundary>} />
        {createCp45Routes().map(route => <Route key={route.path} path={route.path} element={<RouteBoundary><div className="cp45 bg-slate-50 text-slate-900 p-6"><Suspense fallback={<p role="status">Cargando…</p>}>{route.element}</Suspense></div></RouteBoundary>} />)}
        <Route path="*" element={<section className="panel"><h1>404 · Archivo no encontrado</h1><Link to="/">Regresar</Link></section>} />
      </Route>
    </Routes>
  </BrowserRouter>
}
export default AppRoutes
