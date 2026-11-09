import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react'
import type { DragEvent, PointerEvent } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useSession } from '../auth/useSession'
import { bins, cellKey, fileSchema, refineSchema, rulesSchema } from '../lib/contracts'
import type { Bin, Cell, DataFile, Rules } from '../lib/contracts'
import { aborted, ApiError, message, request } from '../lib/http'
import { findGroup } from './groups'
import type { Group } from './groups'
import { TileStore } from './tiles'
import { VirtualGrid } from './VirtualGrid'
import { FloorClient } from '../floor/client'
import { FloorOverlay, FloorPanel } from '../floor/Floor'

export default function RefinePage() {
  const { id } = useParams()
  const { user } = useSession()
  const [loaded, setLoaded] = useState<{ file: DataFile; rules: Rules } | null>(null)
  const [failure, setFailure] = useState({ id: '', message: '' })
  const error = failure.id === id ? failure.message : ''
  const [retry, setRetry] = useState(0)
  const canRead = !!user?.permissions.includes('files:read')
  useEffect(() => {
    if (!canRead || !id || !/^[1-9]\d*$/.test(id)) return
    const controller = new AbortController()
    void Promise.all([request(`/files/${id}`, fileSchema, { signal: controller.signal }), request(`/files/${id}/rules`, rulesSchema, { signal: controller.signal })])
      .then(([file, rules]) => { if (!controller.signal.aborted) setLoaded({ file, rules }) })
      .catch(e => { if (!controller.signal.aborted) setFailure({ id, message: message(e) }) })
    return () => controller.abort()
  }, [id, retry, canRead])
  if (!canRead) return <h1>Sin permiso para leer archivos</h1>
  if (!id || !/^[1-9]\d*$/.test(id)) return <h1>Identificador de archivo inválido</h1>
  if (error) return <div role="alert">{error} <button onClick={() => { setFailure({ id: '', message: '' }); setRetry(n => n + 1) }}>Reintentar</button> <Link to="/files">Archivos</Link></div>
  if (!loaded || String(loaded.file.id) !== id) return <p role="status">Cargando archivo y reglas…</p>
  return <Console key={id} initial={loaded.file} rules={loaded.rules} canRefine={!!user?.permissions.includes('files:refine')} />
}

function Console({ initial, rules, canRefine }: { initial: DataFile; rules: Rules; canRefine: boolean }) {
  const { user } = useSession()
  const [floor] = useState(() => new FloorClient(initial.id))
  const floorState = useSyncExternalStore(floor.subscribe, floor.snapshot)
  const [file, setFile] = useState(initial)
  const [store] = useState(() => new TileStore(initial))
  const [group, setGroup] = useState<Group | null>(null)
  const [selecting, setSelecting] = useState(false)
  const [busy, setBusy] = useState(false)
  const [notice, setNotice] = useState('')
  const selection = useRef<AbortController | null>(null)
  const mutation = useRef<AbortController | null>(null)
  const busyRef = useRef(false)
  const groupRef = useRef<Group | null>(null)
  const intents = useRef(new Map<string, string>())
  const alive = useRef(true)
  const currentFile = useRef(file)
  useEffect(() => { currentFile.current = file }, [file])
  const pointerCleanup = useRef<(() => void) | null>(null)
  useEffect(() => {
    alive.current = true
    store.activate()
    return () => { alive.current = false; store.dispose(); selection.current?.abort(); mutation.current?.abort(); pointerCleanup.current?.() }
  }, [store])
  useEffect(() => {
    void floor.start()
    return () => floor.dispose()
  }, [floor])
  const cancel = useCallback(() => {
    if (busyRef.current) return
    selection.current?.abort(); floor?.release(); groupRef.current = null; setGroup(null); setSelecting(false); setNotice('Selección cancelada.')
  }, [floor])
  useEffect(() => { const key = (e: globalThis.KeyboardEvent) => { if (e.key === 'Escape') cancel() }; window.addEventListener('keydown', key); return () => window.removeEventListener('keydown', key) }, [cancel])
  useEffect(() => {
    if (!store) return
    const controller = new AbortController()
    let timer: ReturnType<typeof setTimeout>
    const sync = async () => {
      try {
        const fresh = await request(`/files/${initial.id}`, fileSchema, { signal: controller.signal })
        if (!controller.signal.aborted && !busyRef.current && fresh.refinedGroups >= currentFile.current.refinedGroups && fresh.mistakes >= currentFile.current.mistakes) {
          if (fresh.refinedGroups > currentFile.current.refinedGroups) { store.invalidate(); cancel() }
          setFile(fresh)
        }
      } catch (e) { if (!aborted(e)) { /* The HTTP retry policy runs before the next poll. Grid remains usable. */ } }
      if (!controller.signal.aborted) timer = setTimeout(() => void sync(), 15000)
    }
    timer = setTimeout(() => void sync(), 15000)
    return () => { controller.abort(); clearTimeout(timer) }
  }, [initial.id, store, cancel])
  const select = useCallback((cell: Cell) => {
    if (!store || busyRef.current) return
    if (groupRef.current?.cells.some(selected => selected.r === cell.r && selected.c === cell.c)) return
    selection.current?.abort(); floor?.release()
    const controller = new AbortController(); selection.current = controller
    groupRef.current = null; setGroup(null); setSelecting(true); setNotice('Buscando el grupo completo…')
    void findGroup(cell, initial, rules, (r, c, signal) => store.read(r, c, signal), controller.signal).then(found => {
      if (controller.signal.aborted) return
      groupRef.current = found; setGroup(found)
      if (canRefine && !found.noise && found.cells.length) void floor?.reserve(found.cells[0]).catch(e => { if (!controller.signal.aborted) setNotice(message(e)) })
      setNotice(found.cells.length ? found.noise ? `Ruido: ${found.cells.length} celdas; se admiten de ${rules.minGroupSize} a ${rules.maxGroupSize}.` : `${found.cells.length} celdas seleccionadas. Caja correcta: ${found.bin}.` : 'Esta celda no pertenece a un grupo pendiente.')
    }).catch(e => { if (!controller.signal.aborted) setNotice(message(e)) }).finally(() => { if (!controller.signal.aborted) setSelecting(false) })
  }, [store, initial, rules, floor, canRefine])
  async function refine(bin: Bin) {
    const selected = groupRef.current
    if (!selected || selected.noise || !selected.cells.length || !canRefine || busyRef.current || !store) return
    busyRef.current = true; setBusy(true); setNotice('Guardando refinamiento…')
    const signature = `${bin}|${selected.cells.map(cellKey).sort().join(',')}`
    const key = intents.current.get(signature) ?? crypto.randomUUID(); intents.current.set(signature, key)
    const controller = new AbortController(); mutation.current = controller
    try {
      await floor?.reserve(selected.cells[0])
      controller.signal.throwIfAborted()
      const result = await request(`/files/${initial.id}/refinements`, refineSchema, { method: 'POST', body: { bin, cells: selected.cells }, key, signal: controller.signal })
      if (!alive.current) return
      floor?.release(); store.mark(selected.cells, result.bin)
      setFile(previous => ({ ...previous, ...result.file, progress: Object.fromEntries(Object.entries(previous.progress).map(([k,v]) => [k, Math.max(v, result.file.progress[k as keyof typeof previous.progress])])) as DataFile['progress'], mistakes: Math.max(previous.mistakes, result.file.mistakes), refinedGroups: Math.max(previous.refinedGroups, result.file.refinedGroups) }))
      groupRef.current = null; setGroup(null); setNotice(`Grupo refinado en ${result.bin}.`)
    } catch (e) {
      if (!alive.current || aborted(e)) return
      if (e instanceof ApiError && e.status === 409) {
        floor?.release(); store.invalidate(selected.cells); groupRef.current = null; setGroup(null)
        setNotice(e.code === 'GROUP_CLAIMED' ? 'Otro refinador tiene este grupo reservado. Espera a que lo libere o elige otro grupo.' : 'El grupo ya fue refinado. Se están actualizando sus bloques; selecciona otro grupo.')
      } else if (e instanceof ApiError && e.status === 422) {
        setNotice(e.code === 'WRONG_BIN' ? `Caja incorrecta. Usa ${selected.bin}. Repetir esta misma intención no sumará otro error.` : `${e.message} Vuelve a seleccionar el grupo completo.`)
        const fresh = await request(`/files/${initial.id}`, fileSchema, { signal: controller.signal }).catch(() => null)
        if (fresh && alive.current && fresh.refinedGroups >= currentFile.current.refinedGroups) setFile(fresh)
        if (e.code !== 'WRONG_BIN') { store.invalidate(selected.cells); groupRef.current = null; setGroup(null) }
      } else setNotice(`${message(e)} Puedes reintentar: se conservará la misma clave de idempotencia.`)
    } finally { busyRef.current = false; if (alive.current) setBusy(false) }
  }
  const holder = floorState.claims.find(claim => claim.userId !== user?.id && claim.cells.some(cell => group?.cells.some(selected => selected.r === cell.r && selected.c === cell.c)))
  const selectedKeys = useMemo(() => new Set(group?.cells.map(cellKey) ?? []), [group])
  const cursor = useCallback((cell: Cell) => floor?.cursor(cell), [floor])
  const overlay = useMemo(() => floor && user ? <FloorOverlay client={floor} userId={user.id} /> : null, [floor, user])
  function drag(event: DragEvent) {
    if (holder || !groupRef.current || groupRef.current.noise || !canRefine || busyRef.current) { event.preventDefault(); return }
    event.dataTransfer.setData('application/x-lumon-group', String(initial.id)); event.dataTransfer.effectAllowed = 'move'
  }
  function pointer(event: PointerEvent) {
    if (holder || event.pointerType === 'mouse' || !groupRef.current || groupRef.current.noise || !canRefine) return
    pointerCleanup.current?.()
    const startX = event.clientX, startY = event.clientY
    const end = (e: globalThis.PointerEvent) => {
      cleanup()
      if (Math.hypot(e.clientX - startX, e.clientY - startY) < 8) return
      const target = document.elementFromPoint(e.clientX, e.clientY)?.closest<HTMLElement>('[data-bin]')?.dataset.bin
      if (bins.includes(target as Bin)) void refine(target as Bin)
    }
    const cleanup = () => { window.removeEventListener('pointerup', end); window.removeEventListener('pointercancel', cleanup) }
    pointerCleanup.current = cleanup; window.addEventListener('pointerup', end, { once: true }); window.addEventListener('pointercancel', cleanup, { once: true })
  }
  if (!store) return <p role="status">Preparando bloques…</p>
  return <><Link to="/files">← Archivos</Link><div className="flex flex-wrap justify-between items-center gap-3 mt-4"><h1>{file.name}</h1><p>{file.refinedGroups}/{file.totalGroups} grupos · {file.mistakes} errores</p></div>
    {file.status === 'COMPLETE' || file.progress.overall >= 1 ? <section role="status" className="border border-teal-500 p-8"><h2>Archivo completado</h2><p>100 % de los grupos refinados.</p><Link to="/files">Continuar con otro archivo</Link></section> : <>
      {!canRefine && <p>Modo lectura: no tienes el permiso files:refine.</p>}
      <p className="text-sm">Umbral {rules.tremorThreshold} · Conectividad {rules.connectivity} · Tamaño {rules.minGroupSize}–{rules.maxGroupSize} · {rules.binning.strategy}</p>
      {floor && <FloorPanel client={floor} />}
      <VirtualGrid overlay={overlay} store={store} rules={rules} selected={selectedKeys} disabled={busy} onSelect={select} onCursor={cursor} onDrag={drag} onPointer={pointer} />
      <div className="my-3 flex gap-4 items-center"><p role="status" aria-live="polite" className="min-h-8">{notice}</p><button disabled={busy || (!group && !selecting)} onClick={cancel}>Cancelar</button></div>
      {holder && <p role="alert">Reservado por {holder.displayName}. Espera a que lo libere o selecciona otro grupo.</p>}
      <div className="bins grid grid-cols-2 md:grid-cols-4 gap-3 sticky bottom-0 z-10 bg-[#071d24] py-2">{bins.map(bin => <button key={bin} data-bin={bin} disabled={!!holder || floorState.status === 'syncing' || !canRefine || busy || selecting || !group || group.noise || !group.cells.length}
        className="bin p-4" onClick={() => void refine(bin)} onDragOver={event => { if (event.dataTransfer.types.includes('application/x-lumon-group')) { event.preventDefault(); event.dataTransfer.dropEffect = 'move' } }}
        onDrop={event => { event.preventDefault(); if (event.dataTransfer.getData('application/x-lumon-group') === String(initial.id)) void refine(bin) }}>
        <span className="text-xl">{bin}</span><span className="block">{(file.progress[bin] * 100).toFixed(1)} %</span><progress aria-label={`Progreso ${bin}`} value={file.progress[bin]} max={1} /><span className="block text-sm">{busy ? 'Guardando…' : `Refinar en ${bin}`}</span>
      </button>)}</div>
    </>}</>
}
