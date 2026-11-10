/* Praise Kier */
import { useState, useSyncExternalStore } from 'react'
import type { FormEvent } from 'react'
import { Link, Navigate, useNavigate, useSearchParams } from 'react-router-dom'
import { ApiError } from '../../core/apiClient'
import { getAuthSnapshot, login, register, subscribeAuth } from '../../core/auth/authService'

export function AuthPage({ mode }: { mode: 'login' | 'register' }) {
  const session = useSyncExternalStore(subscribeAuth, getAuthSnapshot)
  const [params] = useSearchParams()
  const navigate = useNavigate()
  const [teamName, setTeamName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [fields, setFields] = useState<Record<string, string>>({})
  const [busy, setBusy] = useState(false)
  const next = params.get('next') ?? params.get('returnTo')
  const destination =
    next?.startsWith('/') && !next.startsWith('//') && !next.includes('\\') ? next : '/'

  if (session.status === 'loading')
    return (
      <main className="auth-screen">
        <section className="auth-card">
          <p className="eyebrow">LUMON INDUSTRIES</p>
          <h1>Conectando con Lumon…</h1>
          <p>Restaurando la sesión de forma segura.</p>
        </section>
      </main>
    )
  if (session.status === 'authenticated') return <Navigate to={destination} replace />

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (busy) return
    setBusy(true)
    setError('')
    setFields({})
    try {
      if (mode === 'login') await login({ email, password })
      else await register({ teamName, email, password })
      navigate(destination, { replace: true })
    } catch (failure) {
      if (failure instanceof ApiError) {
        setError(`${failure.code}: ${failure.message}`)
        if (
          failure.details &&
          typeof failure.details === 'object' &&
          !Array.isArray(failure.details)
        ) {
          const details =
            'fields' in failure.details &&
            failure.details.fields &&
            typeof failure.details.fields === 'object'
              ? failure.details.fields
              : failure.details
          setFields(
            Object.fromEntries(Object.entries(details).map(([key, value]) => [key, String(value)])),
          )
        }
      } else setError(failure instanceof Error ? failure.message : 'No se pudo iniciar sesión.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <main className="auth-screen">
      <section className="auth-card">
        <Link to="/" className="auth-logo">
          <span className="brand-mark">L</span> LUMON INDUSTRIES
        </Link>
        <p className="eyebrow">
          {mode === 'register' ? 'NUEVA CUADRILLA MDR' : 'ACCESO AL PISO SEPARADO'}
        </p>
        <h1>{mode === 'register' ? 'Orientación inicial' : 'Bienvenido de regreso'}</h1>
        <p className="muted">
          {mode === 'register'
            ? 'Registra una sola cuadrilla para los tres integrantes.'
            : 'Ingresa con las credenciales asignadas a tu cuadrilla.'}
        </p>
        {session.error && (
          <p role="status" className="notice">
            {session.error}
          </p>
        )}
        {error && (
          <p role="alert" className="notice error">
            {error}
          </p>
        )}
        <form className="stack" onSubmit={(event) => void submit(event)}>
          {mode === 'register' && (
            <>
              <label>
                Nombre de la cuadrilla
                <input
                  required
                  value={teamName}
                  onChange={(e) => setTeamName(e.target.value)}
                  autoComplete="organization"
                />
                {fields.teamName && <small>{fields.teamName}</small>}
              </label>
            </>
          )}
          <label>
            Correo electrónico
            <input
              required
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoComplete="email"
            />
            {fields.email && <small>{fields.email}</small>}
          </label>
          <label>
            Contraseña
            <input
              required
              minLength={8}
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete={mode === 'register' ? 'new-password' : 'current-password'}
            />
            {fields.password && <small>{fields.password}</small>}
          </label>
          <button className="button primary wide" type="submit" disabled={busy}>
            {busy
              ? 'Conectando…'
              : mode === 'register'
                ? 'Registrar cuadrilla'
                : 'Ingresar al piso'}
          </button>
        </form>
        <div className="form-footer">
          {mode === 'register' ? (
            <>
              ¿Ya tienes una cuadrilla? <Link to="/login">Iniciar sesión</Link>
            </>
          ) : (
            <>
              ¿Primera visita? <Link to="/register">Registrar cuadrilla</Link>
            </>
          )}
        </div>
      </section>
      <aside className="auth-aside">
        <p className="eyebrow">MACRODATA REFINEMENT</p>
        <strong>El trabajo es misterioso e importante.</strong>
        <span>ORIENTACIÓN · PISO SEPARADO · 2026</span>
      </aside>
    </main>
  )
}
