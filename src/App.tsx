import { Component, lazy, Suspense, useEffect, useState } from 'react'
import type { ReactNode, FormEvent } from 'react'
import { BrowserRouter, Link, Navigate, Outlet, Route, Routes, useLocation } from 'react-router-dom'
import { login, logout, restore } from './auth/session'
import { useSession } from './auth/useSession'
import { message } from './lib/http'

const Files = lazy(() => import('./files/FilesPage'))
const Refine = lazy(() => import('./files/RefinePage'))

class Boundary extends Component<{ children: ReactNode }, { error: boolean }> {
  state = { error: false }
  static getDerivedStateFromError() { return { error: true } }
  render() { return this.state.error ? <main><h1>No se pudo mostrar la página</h1><a href="/files">Volver a archivos</a></main> : this.props.children }
}
function Private() {
  const session = useSession()
  const location = useLocation()
  if (session.loading) return <p role="status">Restaurando sesión…</p>
  if (!session.user) return <Navigate to={`/login?returnTo=${encodeURIComponent(location.pathname + location.search)}`} replace />
  return <><header className="flex flex-wrap items-center justify-between gap-4 border-b border-teal-800 p-5"><Link to="/files" className="font-bold tracking-widest">LUMON / MDR</Link><span>{session.user.displayName}</span><button onClick={() => void logout().catch(() => {})}>Cerrar sesión</button></header><main><Outlet /></main></>
}
function Login() {
  const session = useSession()
  const location = useLocation()
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const target = new URLSearchParams(location.search).get('returnTo') ?? '/files'
  if (session.loading) return <p role="status">Restaurando sesión…</p>
  if (session.user) return <Navigate to={target.startsWith('/') && !target.startsWith('//') && !target.includes('\\') ? target : '/files'} replace />
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (busy) return
    const data = new FormData(event.currentTarget); setBusy(true); setError('')
    try { await login(String(data.get('email')), String(data.get('password'))) } catch (e) { setError(message(e)) } finally { setBusy(false) }
  }
  return <main className="max-w-md mx-auto"><h1>Acceso a Macrodata Refinement</h1><p>{session.error}</p><form onSubmit={submit} className="grid gap-4 mt-6"><label>Email<input name="email" type="email" autoComplete="username" required /></label><label>Contraseña<input name="password" type="password" autoComplete="current-password" required /></label><button disabled={busy}>{busy ? 'Entrando…' : 'Entrar'}</button>{error && <p role="alert">{error}</p>}</form></main>
}
export default function App() {
  useEffect(() => { void restore() }, [])
  return <Boundary><BrowserRouter><Suspense fallback={<p role="status">Cargando…</p>}><Routes><Route path="/login" element={<Login />} /><Route element={<Private />}><Route path="/files" element={<Files />} /><Route path="/files/:id/refine" element={<Refine />} /></Route><Route path="/" element={<Navigate to="/files" replace />} /><Route path="*" element={<main><h1>Página no encontrada</h1><Link to="/files">Archivos</Link></main>} /></Routes></Suspense></BrowserRouter></Boundary>
}
