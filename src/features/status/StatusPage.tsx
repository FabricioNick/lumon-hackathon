/* Praise Kier */
import { useCallback, useEffect, useState, useSyncExternalStore } from 'react'
import { ApiError, apiRequest } from '../../core/apiClient'
import { getAuthSnapshot, subscribeAuth } from '../../core/auth/authService'
import { storageConfigFromEnv } from '../media/storageConfig'
import { API_BASE_URL, BUILD } from '../../core/config'

interface DeployChallenge {
  token: string
  wellKnownPath: string
  expiresAt: string
}
interface RosterMember {
  name: string
  code: string
}
interface RosterResponse {
  members: RosterMember[]
  complete: boolean
  locked: boolean
}
const emptyMembers = (): RosterMember[] => Array.from({ length: 3 }, () => ({ name: '', code: '' }))

function formatError(error: unknown) {
  return error instanceof ApiError
    ? `${error.code} (${error.status}): ${error.message}`
    : error instanceof Error
      ? error.message
      : 'Error inesperado'
import { useCallback, useEffect, useState, useSyncExternalStore } from 'react'
import { ApiError, apiRequest } from '../../core/apiClient'
import { getAuthSnapshot, subscribeAuth } from '../../core/auth/authService'
import { API_BASE_URL, BUILD } from '../../core/config'

interface DeployChallenge { token: string; wellKnownPath: string; expiresAt: string }
interface RosterMember { name: string; code: string }
interface RosterResponse { members: RosterMember[]; complete: boolean; locked: boolean }
const emptyMembers = (): RosterMember[] => Array.from({ length: 3 }, () => ({ name: '', code: '' }))

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
  const [roster, setRoster] = useState<RosterResponse | null>(null)
  const [members, setMembers] = useState<RosterMember[]>(emptyMembers)
  const [challenge, setChallenge] = useState<DeployChallenge | null>(null)
  const [deploymentOrigin, setDeploymentOrigin] = useState('')
  const [message, setMessage] = useState('')
  const [working, setWorking] = useState(false)

  const [chaos, setChaos] = useState(1)
  const refresh = useCallback(async () => {
    const [a, b, c] = await Promise.allSettled([
      apiRequest('/integrations/status'),
      apiRequest('/clearance'),
      apiRequest<RosterResponse>('/team/roster'),
    ])
    const errors = [a, b, c]
      .filter((result) => result.status === 'rejected')
      .map((result) => (result.status === 'rejected' ? formatError(result.reason) : ''))
    if (errors.length) setMessage(errors.join('\n'))
      apiRequest<RosterResponse>('/team/roster')
    ])
    if (a.status === 'fulfilled') setIntegrations(a.value)
    if (b.status === 'fulfilled') setClearance(b.value)
    if (c.status === 'fulfilled') {
      setRoster(c.value)
      if (Array.isArray(c.value.members) && c.value.members.length === 3)
        setMembers(c.value.members)
    }
  }, [])

  useEffect(() => {
    queueMicrotask(() => {
      void refresh()
    })
  }, [refresh])
      if (Array.isArray(c.value.members) && c.value.members.length === 3) setMembers(c.value.members)
    }
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
      timer = setTimeout(
        () => {
          void check()
        },
        attempt ? Math.min(2000 * 2 ** attempt, 30000) : 30000,
      )
    }
    void check()
    return () => {
      active = false
      clearTimeout(timer)
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
      setMessage(
        response === undefined ? success : success + '\n' + JSON.stringify(response, null, 2),
      )
      await refresh()
    } catch (error) {
      setMessage(formatError(error))
    } finally {
      setWorking(false)
    }
      setMessage(response === undefined ? success : success + '\n' + JSON.stringify(response, null, 2))
      await refresh()
    } catch (error) { setMessage(formatError(error)) }
    finally { setWorking(false) }
  }

  const requestChallenge = async () => {
    setWorking(true)
    setMessage('')
    try {
      const origin = deploymentOrigin.trim() || window.location.origin
      const parsed = new URL(origin)
      if (parsed.protocol !== 'https:' || parsed.origin !== origin)
        throw new Error('Escribe un origen HTTPS sin rutas, por ejemplo https://mi-app.vercel.app')
      const result = await apiRequest<DeployChallenge>('/integrations/deploy/challenge', {
        method: 'POST',
        body: { origin },
        retry: false,
      })
      setChallenge(result)
      setMessage('Challenge recibido. Publica el token antes de verificar el dominio.')
    } catch (error) {
      setMessage(formatError(error))
    } finally {
      setWorking(false)
    }
  }

  const saveRoster = () => {
    const valid =
      members.length === 3 &&
      members.every(
        (member) =>
          member.name.trim().length >= 3 && /^[A-Za-z0-9-]{1,20}$/.test(member.code.trim()),
      )
    if (!valid) {
      setMessage('Completa los tres nombres (3 o más caracteres) y los tres códigos alfanuméricos.')
      return
    }
    const body = {
      members: members.map((member) => ({ name: member.name.trim(), code: member.code.trim() })),
    }
    void act(
      () => apiRequest('/team/roster', { method: 'PUT', body, retry: false }),
      'Los tres integrantes quedaron inscritos.',
    )
  }

  const editMember = (index: number, field: keyof RosterMember, value: string) => {
    setMembers((previous) =>
      previous.map((member, i) => (i === index ? { ...member, [field]: value } : member)),
    )
  }

  return (
    <div className="status-page">
      <div className="page-heading">
        <div>
          <p className="eyebrow">SALA DE BIENESTAR · CP3 / CP6</p>
          <h1>Estado del piso</h1>
        </div>
        <button className="button secondary" disabled={working} onClick={() => void refresh()}>
          Actualizar estado
        </button>
      </div>
      <div className="stats">
        <div className="stat">
          <span className="eyebrow">Build</span>
          <strong className="value">{BUILD}</strong>
          <small className="muted">SHA del despliegue</small>
        </div>
        <div className="stat">
          <span className="eyebrow">API</span>
          <strong className="value">
            {online === 'online'
              ? 'En línea'
              : online === 'offline'
                ? 'Sin conexión'
                : 'Conectando…'}
          </strong>
          <small className="muted">{API_BASE_URL || 'Sin configurar'}</small>
        </div>
        <div className="stat">
          <span className="eyebrow">Cuadrilla</span>
          <strong className="value">{session.user?.team?.code ?? 'Pendiente'}</strong>
          <small className="muted">{session.user?.team?.name ?? 'Sin asignar'}</small>
        </div>
      </div>
      {message && (
        <pre role="status" className="notice">
          {message}
        </pre>
      )}
      <div className="section-grid">
        <section className="panel">
          <h2>Pruebas de resiliencia</h2>
          <label>
            Nivel de caos
            <select value={chaos} onChange={(event) => setChaos(Number(event.target.value))}>
              <option value={0}>0 — Sin caos</option>
              <option value={1}>1 — Evaluación</option>
              <option value={2}>2 — Intenso</option>
            </select>
          </label>
          <button
            className="button primary"
            disabled={working}
            onClick={() =>
              void act(
                () =>
                  apiRequest('/workspace/chaos', {
                    method: 'PUT',
                    body: { level: chaos },
                    retry: false,
                  }),
                'Caos actualizado.',
              )
            }
          >
            Aplicar caos
          </button>
          <button
            className="button secondary"
            disabled={working || !session.user?.permissions.includes('team:manage')}
            onClick={() =>
              void act(async () => {
                const storage = storageConfigFromEnv()
                if (!storage)
                  throw new Error(
                    'Configura las variables públicas del storage y vuelve a construir.',
                  )
                const body =
                  storage.provider === 'SUPABASE'
                    ? { ...storage, bucket: import.meta.env.VITE_SUPABASE_BUCKET }
                    : {
                        provider: storage.provider,
                        cloudName: storage.cloudName,
                        uploadPreset: storage.uploadPreset,
                      }
                return apiRequest('/integrations/storage', { method: 'PUT', body, retry: false })
              }, 'Storage verificado.')
            }
          >
            Verificar storage configurado
          </button>
        </section>

        <section className="panel">
          <p className="eyebrow">Integraciones</p>
          <h2>Estado de producción</h2>
          <Format data={integrations} />
          <label className="field">
            Origen de producción
            <input
              type="url"
              value={deploymentOrigin}
              onChange={(event) => setDeploymentOrigin(event.target.value)}
              placeholder="https://su-app.vercel.app"
            />
            <small className="muted">
              Puedes pedir y verificar el challenge desde localhost; coloca aquí la URL HTTPS de
              Vercel.
            </small>
          </label>
          <div className="row-buttons">
            <button
              className="button secondary"
              disabled={working}
              onClick={() => void requestChallenge()}
            >
              Solicitar challenge
            </button>
            <button
              className="button primary"
              disabled={working}
              onClick={() =>
                void act(
                  () => apiRequest('/integrations/deploy/verify', { method: 'POST', retry: false }),
                  'Dominio verificado.',
                )
              }
            >
              Verificar dominio
            </button>
          </div>
          {challenge && (
            <div className="stack">
              <p>
                Publica exclusivamente este token en{' '}
                <code>public/.well-known/lumon-verification.txt</code>, comprueba la URL pública y
                vuelve a verificar. El token es público, pero las credenciales de login no.
              </p>
              <textarea
                aria-label="Token de verificación"
                readOnly
                value={challenge.token}
                rows={2}
              />
              <button
                className="button secondary"
                onClick={() => void navigator.clipboard.writeText(challenge.token)}
              >
                Copiar token
              </button>
              <p className="muted small">
                Ruta: {challenge.wellKnownPath}. Vence:{' '}
                {new Date(challenge.expiresAt).toLocaleString()}.
              </p>
            </div>
          )}
        </section>
        <section className="panel">
          <p className="eyebrow">Autorización</p>
          <h2>Revisión automática</h2>
          <Format data={clearance} />
          <p className="muted small">
            Solo funciona en producción, tras verificar dominio y completar CP1 y CP2.
          </p>
          <button
            className="button primary"
            disabled={working || location.hostname === 'localhost'}
            onClick={() =>
              void act(
                () => apiRequest('/clearance/check', { method: 'POST', retry: false }),
                'Revisión ejecutada.',
              )
            }
          >
            Abrir el Piso de Pruebas
          </button>
        </section>
        <section className="panel">
          <p className="eyebrow">Rondas · CP3</p>
          <h2>Inscripción de los tres integrantes</h2>
          {roster?.locked && (
            <p className="notice">
              La inscripción fue bloqueada por el sorteo. No es posible cambiarla.
            </p>
          )}
          <div className="stack">
            {members.map((member, index) => (
              <div className="row-buttons" key={index}>
                <label className="field" style={{ flex: 2 }}>
                  Integrante {index + 1}
                  <input
                    value={member.name}
                    maxLength={80}
                    disabled={roster?.locked}
                    onChange={(event) => editMember(index, 'name', event.target.value)}
                    placeholder="Nombre y apellido"
                  />
                </label>
                <label className="field" style={{ flex: 1 }}>
                  Código UTEC
                  <input
                    value={member.code}
                    maxLength={20}
                    disabled={roster?.locked}
                    onChange={(event) => editMember(index, 'code', event.target.value)}
                    placeholder="Código"
                  />
                </label>
              </div>
            ))}
          </div>
          <button
            className="button primary"
            disabled={
              working || roster?.locked || !session.user?.permissions?.includes('team:manage')
            }
            onClick={saveRoster}
          >
            Inscribir integrantes
          </button>
          <p className="muted small">
            Estado:{' '}
            {roster?.complete ? 'Los tres integrantes están inscritos.' : 'Pendiente de completar.'}
          </p>
        </section>
        <section className="panel">
          <p className="eyebrow">Acceso</p>
          <h2>Permisos de tu cuenta</h2>
          <p className="muted">Rol: {session.user?.role?.name ?? 'No definido'}</p>
          <Format data={session.user?.permissions ?? []} />
          <p className="muted small">
            Las acciones se habilitan por permissions, no por el nombre del rol.
          </p>
        </section>
      </div>
    </div>
  )
      if (parsed.protocol !== 'https:' || parsed.origin !== origin) throw new Error('Escribe un origen HTTPS sin rutas, por ejemplo https://mi-app.vercel.app')
      const result = await apiRequest<DeployChallenge>('/integrations/deploy/challenge', {
        method: 'POST', body: { origin }, retry: false
      })
      setChallenge(result)
      setMessage('Challenge recibido. Publica el token antes de verificar el dominio.')
    } catch (error) { setMessage(formatError(error)) }
    finally { setWorking(false) }
  }

  const saveRoster = () => {
    const valid = members.length === 3 && members.every(member => member.name.trim().length >= 3 && /^[A-Za-z0-9-]{1,20}$/.test(member.code.trim()))
    if (!valid) { setMessage('Completa los tres nombres (3 o más caracteres) y los tres códigos alfanuméricos.'); return }
    const body = { members: members.map(member => ({ name: member.name.trim(), code: member.code.trim() })) }
    void act(() => apiRequest('/team/roster', { method: 'PUT', body, retry: false }), 'Los tres integrantes quedaron inscritos.')
  }

  const editMember = (index: number, field: keyof RosterMember, value: string) => {
    setMembers(previous => previous.map((member, i) => i === index ? { ...member, [field]: value } : member))
  }

  return <div className="status-page">
    <div className="page-heading">
      <div><p className="eyebrow">SALA DE BIENESTAR · CP3 / CP6</p><h1>Estado del piso</h1></div>
      <button className="button secondary" disabled={working} onClick={() => void refresh()}>Actualizar estado</button>
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
        <label className="field">Origen de producción
          <input type="url" value={deploymentOrigin} onChange={event => setDeploymentOrigin(event.target.value)} placeholder="https://su-app.vercel.app" />
          <small className="muted">Puedes pedir y verificar el challenge desde localhost; coloca aquí la URL HTTPS de Vercel.</small>
        </label>
        <div className="row-buttons">
          <button className="button secondary" disabled={working} onClick={() => void requestChallenge()}>Solicitar challenge</button>
          <button className="button primary" disabled={working} onClick={() => void act(() => apiRequest('/integrations/deploy/verify', { method: 'POST', retry: false }), 'Dominio verificado.')}>Verificar dominio</button>
        </div>
        {challenge && <div className="stack">
          <p>Publica exclusivamente este token en <code>public/.well-known/lumon-verification.txt</code>, comprueba la URL pública y vuelve a verificar. El token es público, pero las credenciales de login no.</p>
          <textarea aria-label="Token de verificación" readOnly value={challenge.token} rows={2}/>
          <button className="button secondary" onClick={() => void navigator.clipboard.writeText(challenge.token)}>Copiar token</button>
          <p className="muted small">Ruta: {challenge.wellKnownPath}. Vence: {new Date(challenge.expiresAt).toLocaleString()}.</p>
        </div>}
      </section>
      <section className="panel">
        <p className="eyebrow">Autorización</p><h2>Revisión automática</h2>
        <Format data={clearance} />
        <p className="muted small">Solo funciona en producción, tras verificar dominio y completar CP1 y CP2.</p>
        <button className="button primary" disabled={working || location.hostname === 'localhost'} onClick={() => void act(() => apiRequest('/clearance/check', { method: 'POST', retry: false }), 'Revisión ejecutada.')}>Abrir el Piso de Pruebas</button>
      </section>
      <section className="panel">
        <p className="eyebrow">Rondas · CP3</p><h2>Inscripción de los tres integrantes</h2>
        {roster?.locked && <p className="notice">La inscripción fue bloqueada por el sorteo. No es posible cambiarla.</p>}
        <div className="stack">
          {members.map((member, index) => <div className="row-buttons" key={index}>
            <label className="field" style={{ flex: 2 }}>Integrante {index + 1}
              <input value={member.name} maxLength={80} disabled={roster?.locked} onChange={event => editMember(index, 'name', event.target.value)} placeholder="Nombre y apellido" />
            </label>
            <label className="field" style={{ flex: 1 }}>Código UTEC
              <input value={member.code} maxLength={20} disabled={roster?.locked} onChange={event => editMember(index, 'code', event.target.value)} placeholder="Código" />
            </label>
          </div>)}
        </div>
        <button className="button primary" disabled={working || roster?.locked || !session.user?.permissions?.includes('team:manage')} onClick={saveRoster}>Inscribir integrantes</button>
        <p className="muted small">Estado: {roster?.complete ? 'Los tres integrantes están inscritos.' : 'Pendiente de completar.'}</p>
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
