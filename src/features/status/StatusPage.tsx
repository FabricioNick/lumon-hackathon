import { useCallback, useEffect, useState, useSyncExternalStore } from 'react'
import { ApiError, apiRequest } from '../../core/apiClient'
import { getAuthSnapshot, subscribeAuth } from '../../core/auth/authService'
import { API_BASE_URL, BUILD } from '../../core/config'

interface DeployChallenge { token: string; path?: string }
function formatError(error: unknown) {
  return error instanceof ApiError ? `${error.code} (${error.status}): ${error.message}` : error instanceof Error ? error.message : 'Error inesperado'
}
function Format({ data }: { data: unknown }) {
  return <pre>{JSON.stringify(data, null, 2) ?? 'Sin datos'}</pre>
}

export function StatusPage() {
  const session = useSyncExternalStore(subscribeAuth, getAuthSnapshot)
  const [online, setOnline] = useState<'checking' | 'online' | 'offline'>('checking')
  const [integrations, setIntegrations] = useState<unknown>(null)
  const [clearance, setClearance] = useState<unknown>(null)
  const [roster, setRoster] = useState<unknown>(null)
  const [rosterBody, setRosterBody] = useState('{\n  "members": [\n    { "name": "", "studentCode": "" },\n    { "name": "", "studentCode": "" },\n    { "name": "", "studentCode": "" }\n  ]\n}')
  const [challenge, setChallenge] = useState<DeployChallenge | null>(null)
  const [message, setMessage] = useState('')
  const [working, setWorking] = useState(false)

  const refresh = useCallback(async () => {
    const [a, b, c] = await Promise.allSettled([
      apiRequest('/integrations/status'),
      apiRequest('/clearance'),
      apiRequest('/team/roster')
    ])
    if (a.status === 'fulfilled') setIntegrations(a.value)
    if (b.status === 'fulfilled') setClearance(b.value)
    if (c.status === 'fulfilled') setRoster(c.value)
  }, [])

  useEffect(() => { void refresh() }, [refresh])
  useEffect(() => {
    let active = true
    let timer: ReturnType<typeof setTimeout>
    let attempt = 0
    const check = async () => {
      try {
        await apiRequest('/meta/health', { auth: false, retry: false })
        if (!active) return
        setOnline('online')
        attempt = 0
      } catch {
        if (!active) return
        setOnline('offline')
        attempt++
      }
      timer = setTimeout(() => { void check() }, attempt ? Math.min(2000 * 2 ** attempt, 30000) : 30000)
    }
    void check()
    return () => { active = false; clearTimeout(timer) }
  }, [])

  const act = async (action: () => Promise<unknown>, success: string) => {
    setWorking(true)
    setMessage('')
    try {
      const response = await action()
      setMessage(success)
      if (response !== undefined) setMessage(success + '\n' + JSON.stringify(response, null, 2))
      await refresh()
    } catch (error) { setMessage(formatError(error)) }
    finally { setWorking(false) }
  }

  const requestChallenge = async () => {
    setWorking(true)
    setMessage('')
    try {
      const result = await apiRequest<DeployChallenge>('/integrations/deploy/challenge', {
        method: 'POST', body: { origin: window.location.origin }, retry: false
      })
      setChallenge(result)
      setMessage('Challenge recibido. Publica el token antes de verificar el dominio.')
    } catch (error) { setMessage(formatError(error)) }
    finally { setWorking(false) }
  }

  const submitRoster = () => {
    let body: unknown
    try { body = JSON.parse(rosterBody) as unknown }
    catch { setMessage('JSON de integrantes inválido.'); return }
    void act(() => apiRequest('/team/roster', { method: 'PUT', body, retry: false }), 'Cuadrilla inscrita.')
  }

  return <div className="status-page">
    <div className="page-heading">
      <div><p className="eyebrow">SALA DE BIENESTAR · CP3 / CP6</p><h1>Estado del piso</h1></div>
      <button className="button secondary" onClick={() => void refresh()}>Actualizar estado</button>
    </div>
    <div className="stats">
      <div className="stat"><span className="eyebrow">Build</span><strong className="value">{BUILD}</strong><small className="muted">SHA del despliegue</small></div>
      <div className="stat"><span className="eyebrow">API</span><strong className="value">{online === 'online' ? 'En línea' : online === 'offline' ? 'Sin conexión' : 'Conectando…'}</strong><small className="muted">{API_BASE_URL || 'Sin configurar'}</small></div>
      <div className="stat"><span className="eyebrow">Cuadrilla</span><strong className="value">{session.user?.team?.code ?? 'Pendiente'}</strong><small className="muted">{session.user?.team?.name ?? 'Sin asignar'}</small></div>
    </div>
    {message && <pre role="status" className="notice">{message}</pre>}
    <div className="section-grid">
      <section className="panel">
        <p className="eyebrow">Integraciones</p><h2>Estado de producción</h2>
        <Format data={integrations} />
        <div className="row-buttons"><button className="button secondary" disabled={working} onClick={() => void requestChallenge()}>Solicitar challenge</button><button className="button primary" disabled={working} onClick={() => void act(() => apiRequest('/integrations/deploy/verify', { method: 'POST', body: { origin: location.origin }, retry: false }), 'Dominio verificado.')}>Verificar dominio</button></div>
        {challenge && <div className="stack">
          <p>Publica exclusivamente este token en <code>public/.well-known/lumon-verification.txt</code> y vuelve a desplegar antes de verificar.</p>
          <textarea aria-label="Token de verificación" readOnly value={challenge.token} rows={2}/>
          <button className="button secondary" onClick={() => void navigator.clipboard.writeText(challenge.token)}>Copiar token</button>
          {challenge.path && <p className="muted small">Ruta esperada: {challenge.path}</p>}
        </div>}
      </section>
      <section className="panel">
        <p className="eyebrow">Autorización</p><h2>Revisión automática</h2>
        <Format data={clearance} />
        <p className="muted small">Ejecutar únicamente desde la app desplegada. CP2 requiere actividad real con caos e idempotencia.</p>
        <button className="button primary" disabled={working || location.hostname === 'localhost'} onClick={() => void act(() => apiRequest('/clearance/check', { method: 'POST', retry: false }), 'Revisión ejecutada.')}>Abrir el Piso de Pruebas</button>
      </section>
      <section className="panel">
        <p className="eyebrow">Rondas · CP3</p><h2>Inscripción de los tres integrantes</h2>
        <p className="muted small">Ajusta el cuerpo JSON según el esquema de PUT /team/roster en Swagger. Los nombres y códigos reales son obligatorios.</p>
        <textarea value={rosterBody} onChange={event => setRosterBody(event.target.value)} aria-label="Cuerpo JSON para inscripción de la cuadrilla" rows={10}/>
        <button className="button primary" disabled={working} onClick={submitRoster}>Inscribir integrantes</button>
        <h3>Inscripción actual</h3><Format data={roster}/>
      </section>
      <section className="panel">
        <p className="eyebrow">Acceso</p><h2>Permisos de tu cuenta</h2>
        <p className="muted">Rol: {session.user?.role?.name ?? 'No definido'}</p>
        <Format data={session.user?.permissions ?? []}/>
        <p className="muted small">Las acciones se habilitan por permissions, no por el nombre del rol.</p>
      </section>
    </div>
  </div>
}
