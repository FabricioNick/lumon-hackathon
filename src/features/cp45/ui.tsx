/* Praise Kier */
import { useEffect, useRef, useState } from 'react'
import type { DependencyList } from 'react'
import { errorMessage, pageParams } from './http'
import { useSearchParams } from 'react-router-dom'
export function useResource<T>(load: (signal: AbortSignal) => Promise<T>, dependencies: DependencyList) {
  const [data, setData] = useState<T>()
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [revision, setRevision] = useState(0)
  const loader = useRef(load)
  loader.current = load
  useEffect(() => {
    const controller = new AbortController()
    setData(undefined); setLoading(true); setError('')
    void loader.current(controller.signal).then(value => {
      if (!controller.signal.aborted) setData(value)
    }).catch((e: unknown) => { if (!controller.signal.aborted) setError(errorMessage(e)) })
      .finally(() => { if (!controller.signal.aborted) setLoading(false) })
    return () => controller.abort()
    // Dependencies describe the identity of the resource; load uses the latest closure.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...dependencies, revision])
  return { data, loading, error, reload: () => setRevision(value => value + 1) }
}
export function Feedback({ loading, error, retry }: { loading: boolean; error: string; retry: () => void }) {
  return <>{loading && <p role="status" className="min-h-24 p-6">Cargando…</p>}{error && <div role="alert" className="my-4 rounded border border-red-700 p-4"><p>{error}</p><button type="button" onClick={retry}>Reintentar</button></div>}</>
}
export function Pagination({ totalPages }: { totalPages: number }) {
  const [params, setParams] = useSearchParams()
  const { page, size } = pageParams(params)
  function move(next: number) { const copy = new URLSearchParams(params); copy.set('page', String(next)); setParams(copy) }
  return <nav aria-label="Paginación" className="my-6 flex flex-wrap items-center gap-4">
    <button type="button" disabled={page === 0} onClick={() => move(page - 1)}>Anterior</button>
    <span>Página {page + 1} de {Math.max(1, totalPages)}</span>
    <button type="button" disabled={page + 1 >= totalPages} onClick={() => move(page + 1)}>Siguiente</button>
    <label>Por página <select value={size} onChange={event => { const copy = new URLSearchParams(params); copy.set('size', event.target.value); copy.set('page', '0'); setParams(copy) }}>{[10,25,50].map(n => <option key={n}>{n}</option>)}</select></label>
  </nav>
}
