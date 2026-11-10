import { useState, useSyncExternalStore } from 'react'
import type { ReactNode } from 'react'
import { Link, NavLink, Outlet, useNavigate } from 'react-router-dom'
import { getAuthSnapshot, logout, subscribeAuth } from '../core/auth/authService'
import { getEventStatus, subscribeEventStatus } from '../core/events/eventService'

export function Layout({ children }: { children?: ReactNode }) {
  const session = useSyncExternalStore(subscribeAuth, getAuthSnapshot)
  const [busy, setBusy] = useState(false)
  const events = useSyncExternalStore(subscribeEventStatus, getEventStatus)
  const navigate = useNavigate()
  const signOut = async () => {
    setBusy(true)
    try {
      await logout()
    } catch {}
    navigate('/login', { replace: true })
  }
  return (
    <>
      <header className="site-header">
        <Link to="/" className="brand" aria-label="Lumon, inicio">
          <span className="brand-mark">L</span>
          <span>
            LUMON <small>INDUSTRIES</small>
          </span>
        </Link>
        <nav aria-label="Navegación principal">
          <NavLink to="/" end>
            Inicio
          </NavLink>
          <NavLink to="/files">Archivos</NavLink>
          <NavLink to="/refiners">Personal</NavLink>
          <NavLink to="/incidents">Incidencias</NavLink>
          <NavLink to="/estado">Estado</NavLink>
        </nav>
        <div className="account">
          <span className="muted small" title="Estado de eventos globales">
            SSE: {events}
          </span>
          <span className="muted small">{session.user?.team?.code ?? 'MDR'}</span>
          <button className="button secondary" disabled={busy} onClick={() => void signOut()}>
            Salir
          </button>
        </div>
      </header>
      <main className="main-content">
        <Outlet />
        {children}
      </main>
      <footer className="site-footer">
        LUMON INDUSTRIES · MACRODATA REFINEMENT <span>Refinamiento seguro</span>
      </footer>
    </>
  )
}
