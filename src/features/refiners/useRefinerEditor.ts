import { useCallback, useEffect, useRef, useState } from 'react'
import { rememberRefiner } from './services/refinerVersions'
import { useCp45 } from '../cp45/context'
import { ApiError, errorMessage } from '../cp45/http'
import { refinersApi } from './services/refinersApi'
import type { RefinerSnapshot } from './services/refinersApi'
import type { RefinerConflict } from './components/ConflictResolver'
import type { RefinerPatch } from './types/refiners'
export function useRefinerEditor(id: string) {
  const { request, subscribe } = useCp45()
  const [snapshot, setSnapshot] = useState<RefinerSnapshot>()
  const [conflict, setConflict] = useState<RefinerConflict>()
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [loading, setLoading] = useState(true)
  const [remoteVersion, setRemoteVersion] = useState(0)
  const [revision, setRevision] = useState(0)
  const lock = useRef(false)
  const floor = useRef(0)
  const reload = useCallback(() => setRevision((n) => n + 1), [])
  useEffect(() => {
    const controller = new AbortController()
    floor.current = 0
    queueMicrotask(() => {
      if (!controller.signal.aborted) {
        setLoading(true)
        setError('')
        setSnapshot(undefined)
        setConflict(undefined)
        setRemoteVersion(0)
      }
    })
    void refinersApi(request)
      .get(id, controller.signal)
      .then((value) => {
        if (!controller.signal.aborted) {
          setSnapshot(value)
          floor.current = Math.max(floor.current, value.refiner.version)
        }
      })
      .catch((e: unknown) => {
        if (!controller.signal.aborted) setError(errorMessage(e))
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false)
      })
    return () => controller.abort()
  }, [id, request, revision])
  useEffect(
    () =>
      subscribe((event) => {
        if (event.type === 'refiner.updated') rememberRefiner(request, event.data.refiner)
        if (
          event.type === 'refiner.updated' &&
          event.data.id === Number(id) &&
          event.data.version > floor.current
        ) {
          floor.current = event.data.version
          setRemoteVersion(event.data.version)
        }
        if (event.type === 'stream.reset') setRemoteVersion(Number.MAX_SAFE_INTEGER)
      }),
    [subscribe, id, request],
  )
  async function save(patch: RefinerPatch, base = snapshot): Promise<boolean> {
    if (lock.current || !base) return false
    lock.current = true
    setBusy(true)
    setError('')
    try {
      if (!base.etag)
        throw new Error(
          'ETag ausente. El backend debe exponer ETag por CORS; vuelve a cargar el expediente.',
        )
      if (Object.keys(patch).length === 0) {
        setSnapshot(base)
        setConflict(undefined)
        setRemoteVersion(0)
        return true
      }
      const updated = await refinersApi(request).patch(id, patch, base.etag)
      if (updated.refiner.version < floor.current) {
        setRemoteVersion(floor.current)
      } else {
        floor.current = updated.refiner.version
        setRemoteVersion(0)
      }
      setSnapshot(updated)
      setConflict(undefined)
      return true
    } catch (e) {
      if (e instanceof ApiError && e.status === 412) {
        try {
          const current = await refinersApi(request).get(id)
          if (!current.etag) throw new Error('El servidor no expone el ETag actualizado.')
          setConflict({
            original: base.refiner,
            local: patch,
            current: current.refiner,
            etag: current.etag,
          })
        } catch (fetchError) {
          setError(errorMessage(fetchError))
        }
      } else setError(errorMessage(e))
      return false
    } finally {
      lock.current = false
      setBusy(false)
    }
  }
  async function resolve(patch: RefinerPatch) {
    if (!conflict) return false
    return save(patch, { refiner: conflict.current, etag: conflict.etag })
  }
  return {
    snapshot,
    conflict,
    error,
    busy,
    loading,
    remoteChanged: !!snapshot && remoteVersion > snapshot.refiner.version,
    save,
    resolve,
    cancelConflict: () => setConflict(undefined),
    reload,
  }
}
