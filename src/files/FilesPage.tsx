/* Praise Kier */
import { subscribeEvents } from '../core/events/eventService'
import { useEffect, useEffectEvent, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import type { z } from 'zod'
import { useSession } from '../auth/useSession'
import { pageSchema } from '../lib/contracts'
import { aborted, message, request } from '../lib/http'
import { fileQuery } from './query'

export default function FilesPage() {
  const { user } = useSession()
  const [params, setParams] = useSearchParams()
  const query = fileQuery(params).toString()
  const canonical = new URLSearchParams(query)
  const urlSearch = canonical.get('q') ?? ''
  const [draft, setDraft] = useState({ url: urlSearch, value: urlSearch })
  if (draft.url !== urlSearch) setDraft({ url: urlSearch, value: urlSearch })
  const search = draft.url === urlSearch ? draft.value : urlSearch
  const [result, setResult] = useState<{ query: string; data: z.infer<typeof pageSchema> } | null>(
    null,
  )
  const [failure, setFailure] = useState({ query: '', retry: 0, message: '' })
  const [retry, setRetry] = useState(0)
  useEffect(() => subscribeEvents(event => {
    if (['refinement.created', 'file.completed', 'stream.reset'].includes(event.type)) setRetry(n => n + 1)
  }), [])
  const canRead = user?.permissions.includes('files:read')
  useEffect(() => {
    if (params.toString() !== query) setParams(query, { replace: true })
  }, [query, params, setParams])
  const error = failure.query === query && failure.retry === retry ? failure.message : ''
  useEffect(() => {
    if (search.trim() === urlSearch) return
    const timer = setTimeout(() => {
      setParams((previous) => {
        const next = fileQuery(previous)
        next.set('page', '0')
        if (search.trim()) next.set('q', search.trim().slice(0, 60))
        else next.delete('q')
        return next
      })
    }, 350)
    return () => clearTimeout(timer)
  }, [search, urlSearch, setParams])
  const applyPage = useEffectEvent((data: z.infer<typeof pageSchema>, requestedQuery: string) => {
    if (data.totalPages > 0 && data.page >= data.totalPages) {
      const next = new URLSearchParams(requestedQuery)
      next.set('page', String(data.totalPages - 1))
      setParams(next, { replace: true })
      return
    }
    setResult({ query: requestedQuery, data })
  })
  useEffect(() => {
    if (!canRead) return
    const controller = new AbortController()
    void request(`/files?${query}`, pageSchema, { signal: controller.signal })
      .then((data) => {
        if (!controller.signal.aborted) {
          applyPage(data, query)
        }
      })
      .catch((e) => {
        if (!aborted(e) && !controller.signal.aborted)
          setFailure({ query, retry, message: message(e) })
      })
    return () => controller.abort()
  }, [query, retry, canRead])
  if (!canRead) return <h1>Sin permiso para leer archivos</h1>
  function change(key: string, value: string) {
    const next = new URLSearchParams(query)
    next.set(key, value)
    if (key !== 'page') next.set('page', '0')
    setParams(next)
  }
  const data = result?.query === query ? result.data : null
  return (
    <>
      <h1>Archivos de macrodatos</h1>
      <div className="flex flex-wrap gap-4 my-6">
        <label>
          Buscar
          <input
            value={search}
            maxLength={60}
            onChange={(e) => setDraft({ url: urlSearch, value: e.target.value })}
            type="search"
          />
        </label>
        <label>
          Estado
          <select
            value={canonical.get('status') ?? ''}
            onChange={(e) => change('status', e.target.value)}
          >
            <option value="">Todos</option>
            <option value="ACTIVE">Activos</option>
            <option value="COMPLETE">Completos</option>
          </select>
        </label>
        <label>
          Orden
          <select value={canonical.get('sort')!} onChange={(e) => change('sort', e.target.value)}>
            <option value="updatedAt,desc">Última actualización</option>
            <option value="name,asc">Nombre</option>
            <option value="progress,desc">Progreso</option>
          </select>
        </label>
        <label>
          Por página
          <select value={canonical.get('size')!} onChange={(e) => change('size', e.target.value)}>
            {[10, 25, 50].map((n) => (
              <option key={n}>{n}</option>
            ))}
          </select>
        </label>
      </div>
      {error ? (
        <div role="alert">
          {error} <button onClick={() => setRetry((n) => n + 1)}>Reintentar</button>
        </div>
      ) : !data ? (
        <p role="status">Cargando archivos…</p>
      ) : (
        <>
          <p role="status">
            {data.totalElements} archivos · Página {data.page + 1} de {Math.max(1, data.totalPages)}
          </p>
          <ul className="grid gap-3 my-5">
            {data.content.map((file) => (
              <li key={file.id} className="border border-teal-800 rounded p-4">
                <Link className="text-xl" to={`/files/${file.id}/refine`}>
                  {file.name}
                </Link>
                <p>
                  {file.rows} × {file.cols} · {file.status === 'COMPLETE' ? 'Completo' : 'Activo'} ·{' '}
                  {(file.progress.overall * 100).toFixed(1)} %
                </p>
                <progress
                  aria-label={`Progreso de ${file.name}`}
                  value={file.progress.overall}
                  max={1}
                />
              </li>
            ))}
          </ul>
          {!data.content.length && <p>No hay archivos que coincidan.</p>}
          <nav aria-label="Paginación" className="flex gap-3">
            <button
              disabled={data.page === 0}
              onClick={() => change('page', String(data.page - 1))}
            >
              Anterior
            </button>
            <button
              disabled={data.page + 1 >= data.totalPages}
              onClick={() => change('page', String(data.page + 1))}
            >
              Siguiente
            </button>
          </nav>
        </>
      )}
    </>
  )
}
