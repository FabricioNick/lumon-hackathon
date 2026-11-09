import { cellKey, tileSchema } from '../lib/contracts'
import type { Bin, Cell, DataFile, Tile } from '../lib/contracts'
import { aborted, delay, request } from '../lib/http'

type Pending = { controller: AbortController; promise: Promise<Tile>; readers: number }
export class TileStore {
  readonly file: DataFile
  private cache = new Map<string, Tile>()
  private pending = new Map<string, Pending>()
  private visible = new Set<string>()
  private patches = new Map<string, string>()
  private listeners = new Set<() => void>()
  private revision = 0
  private running = 0
  private disposed = false
  errors = new Map<string, string>()
  constructor(file: DataFile) { this.file = file }
  subscribe = (callback: () => void) => { this.listeners.add(callback); return () => { this.listeners.delete(callback) } }
  snapshot = () => this.revision
  private emit() { this.revision++; for (const callback of this.listeners) callback() }
  key(r: number, c: number) { return `${Math.floor(r / this.file.tileSize)}:${Math.floor(c / this.file.tileSize)}` }
  peek(r: number, c: number) { return this.cache.get(this.key(r, c)) }
  cell(r: number, c: number) {
    const tile = this.peek(r, c)
    if (!tile) return undefined
    const index = (r - tile.originRow) * tile.cols + c - tile.originCol
    return { value: Number(tile.values[index]), tremor: tile.tremors[index], bin: this.patches.get(cellKey({ r, c })) ?? tile.bins[index] }
  }
  private async load(key: string, signal: AbortSignal): Promise<Tile> {
    while (this.running >= 4) await delay(25, signal)
    signal.throwIfAborted(); this.running++
    try {
      const [tr, tc] = key.split(':').map(Number)
      const raw = await request(`/files/${this.file.id}/tiles/${tr}/${tc}`, tileSchema, { signal })
      signal.throwIfAborted()
      const tremors = Uint8Array.from(atob(raw.tremor), char => char.charCodeAt(0))
      if (raw.tileRow !== tr || raw.tileCol !== tc || raw.originRow !== tr * this.file.tileSize || raw.originCol !== tc * this.file.tileSize || raw.rows !== Math.min(this.file.tileSize, this.file.rows - raw.originRow) || raw.cols !== Math.min(this.file.tileSize, this.file.cols - raw.originCol) || tremors.length !== raw.values.length || tremors.some(n => n > 100)) throw new Error('Bloque inválido recibido de la API.')
      const tile = { ...raw, tremors }
      const previous = this.cache.get(key)
      if (!previous || tile.version >= previous.version) { this.cache.delete(key); this.cache.set(key, tile) }
      this.errors.delete(key)
      // Bounded LRU; viewport tiles remain pinned.
      for (const cachedKey of this.cache.keys()) {
        if (this.cache.size <= 64) break
        if (!this.visible.has(cachedKey)) this.cache.delete(cachedKey)
      }
      this.emit(); return this.cache.get(key) ?? tile
    } finally { this.running-- }
  }
  private ensure(key: string): Pending {
    const existing = this.pending.get(key)
    if (existing) return existing
    const controller = new AbortController()
    const promise = this.load(key, controller.signal).catch(error => {
      if (!aborted(error)) { this.errors.set(key, error instanceof Error ? error.message : 'No se pudo cargar el bloque.'); this.emit() }
      throw error
    }).finally(() => {
      if (this.pending.get(key) === entry) this.pending.delete(key)
      // Re-entry while an aborted fetch was settling must not strand a visible tile.
      if (!this.disposed && controller.signal.aborted && this.visible.has(key) && !this.cache.has(key)) this.startVisible(key)
    })
    const entry: Pending = { controller, readers: 0, promise }
    this.pending.set(key, entry)
    return entry
  }
  private startVisible(key: string) { if (!this.cache.has(key) && !this.errors.has(key)) void this.ensure(key).promise.catch(() => {}) }
  viewport(keys: Set<string>) {
    this.visible = keys
    for (const [key, entry] of this.pending) if (!keys.has(key) && entry.readers === 0) entry.controller.abort()
    for (const key of keys) this.startVisible(key)
  }
  async read(r: number, c: number, signal: AbortSignal): Promise<NonNullable<ReturnType<TileStore['cell']>>> {
    signal.throwIfAborted()
    const cached = this.cell(r, c); if (cached) return cached
    const key = this.key(r, c)
    let entry = this.ensure(key)
    if (entry.controller.signal.aborted) { await entry.promise.catch(() => {}); signal.throwIfAborted(); entry = this.ensure(key) }
    entry.readers++
    const cancel = () => { if (entry.readers === 1 && !this.visible.has(key)) entry.controller.abort() }
    signal.addEventListener('abort', cancel, { once: true })
    try {
      await entry.promise; signal.throwIfAborted()
      const cell = this.cell(r, c)
      if (!cell) throw new Error('El bloque dejó de estar disponible. Selecciona el grupo de nuevo.')
      return cell
    } finally { entry.readers--; signal.removeEventListener('abort', cancel) }
  }
  retry() { this.errors.clear(); for (const key of this.visible) this.startVisible(key); this.emit() }
  mark(cells: Cell[], bin: Bin) {
    const symbol = { WO: 'W', FC: 'F', DR: 'D', MA: 'M' }[bin]
    for (const cell of cells) this.patches.set(cellKey(cell), symbol)
    this.emit()
  }
  invalidate(cells?: Cell[]) {
    const keys = cells ? new Set(cells.map(cell => this.key(cell.r, cell.c))) : new Set([...this.cache.keys(), ...this.pending.keys()])
    for (const key of keys) { this.cache.delete(key); this.errors.delete(key); this.pending.get(key)?.controller.abort() }
    for (const key of this.visible) this.startVisible(key)
    this.emit()
  }
  activate() { this.disposed = false }
  dispose() { this.disposed = true; this.visible.clear(); for (const entry of this.pending.values()) entry.controller.abort(); this.listeners.clear() }
}
