import { useCallback, useEffect, useRef, useState } from 'react'
import type { DependencyList } from 'react'
import { errorMessage } from './http'
export function useResource<T>(
  load: (signal: AbortSignal) => Promise<T>,
  dependencies: DependencyList,
) {
  const [data, setData] = useState<T>()
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [revision, setRevision] = useState(0)
  const loader = useRef(load)
  loader.current = load
  useEffect(() => {
    const controller = new AbortController()
    setData(undefined)
    setLoading(true)
    setError('')
    void loader
      .current(controller.signal)
      .then((value) => {
        if (!controller.signal.aborted) setData(value)
      })
      .catch((e: unknown) => {
        if (!controller.signal.aborted) setError(errorMessage(e))
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false)
      })
    return () => controller.abort()
    // Dependencies describe the identity of the resource; load uses the latest closure.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...dependencies, revision])
  const reload = useCallback(() => setRevision((value) => value + 1), [])
  return { data, loading, error, reload }
}
