import { config } from '../lib/config'
import { ticketSchema } from '../lib/contracts'
import type { Cell } from '../lib/contracts'
import { ApiError, message, request } from '../lib/http'
import { floorMessage } from './protocol'
import type { Claim, Member, Outgoing } from './protocol'

export type FloorState = { status: 'connecting' | 'ready' | 'syncing' | 'offline' | 'stopped'; message: string; members: Member[]; claims: Claim[]; own: string | null }
type PendingClaim = { id: string; seed: Cell; resolve: (claim: Claim | null) => void; reject: (error: Error) => void; timer: ReturnType<typeof setTimeout>; promise: Promise<Claim | null> }
export class FloorClient {
  private fileId: number
  private socket: WebSocket | null = null
  private controller = new AbortController()
  private disposed = false
  private timer: ReturnType<typeof setTimeout> | undefined
  private heartbeat: ReturnType<typeof setInterval> | undefined
  private reconnects = 0
  private invalidTickets = 0
  private seq: number | null = null
  private pongAt = 0
  private syncAt = 0
  private pending: PendingClaim | null = null
  private cursorAt = 0
  private cursorTimer: ReturnType<typeof setTimeout> | undefined
  private lastCursor: Cell | null = null
  private stateListeners = new Set<() => void>()
  private cursorListeners = new Set<() => void>()
  private cursors: Member[] = []
  private state: FloorState = { status: 'connecting', message: 'Conectando al piso…', members: [], claims: [], own: null }
  constructor(fileId: number) { this.fileId = fileId }
  subscribe = (callback: () => void) => { this.stateListeners.add(callback); return () => { this.stateListeners.delete(callback) } }
  subscribeCursors = (callback: () => void) => { this.cursorListeners.add(callback); return () => { this.cursorListeners.delete(callback) } }
  snapshot = () => this.state
  cursorSnapshot = () => this.cursors
  private update(update: Partial<FloorState>) { this.state = { ...this.state, ...update }; for (const listener of this.stateListeners) listener() }
  private emitCursors() { for (const listener of this.cursorListeners) listener() }
  private send(data: Outgoing) {
    if (this.socket?.readyState !== WebSocket.OPEN) return false
    this.socket.send(JSON.stringify(data)); return true
  }
  async start() {
    if (this.disposed) { this.disposed = false; this.controller = new AbortController() }
    const signal = this.controller.signal
    this.update({ status: 'connecting', message: 'Conectando al piso…' })
    try {
      const ticket = await request('/floor/tickets', ticketSchema, { method: 'POST', body: { fileId: this.fileId }, signal })
      if (this.disposed || signal.aborted) return
      const socket = new WebSocket(`${config.ws}/floor/ws?ticket=${encodeURIComponent(ticket.ticket)}`)
      this.socket = socket
      socket.onopen = () => {
        if (this.disposed || socket !== this.socket) return
        this.pongAt = Date.now(); this.syncAt = Date.now(); this.seq = null
        this.update({ status: 'syncing', message: 'Sincronizando el piso…' })
        this.heartbeat = setInterval(() => {
          if ((this.state.status === 'syncing' && Date.now() - this.syncAt > 15000) || Date.now() - this.pongAt > 25000) { socket.close(4000, 'Heartbeat timeout'); return }
          this.send({ type: 'ping', t: Date.now() })
          if (this.state.own) { this.send({ type: 'renew', claimId: this.state.own }); this.send({ type: 'resync' }) }
          const claims = this.state.claims.filter(claim => Date.parse(claim.expiresAt) > Date.now())
          if (claims.length !== this.state.claims.length) this.update({ claims, own: claims.some(c => c.claimId === this.state.own) ? this.state.own : null })
        }, 10000)
      }
      socket.onmessage = event => {
        if (this.disposed || socket !== this.socket) return
        try {
          const parsed = floorMessage.safeParse(JSON.parse(String(event.data)))
          if (!parsed.success) { this.resync(); return }
          const data = parsed.data
          if (data.type === 'pong') { this.pongAt = Date.now(); return }
          if (data.type === 'snapshot') {
            if (this.seq !== null && data.seq < this.seq) return
            this.seq = data.seq; this.reconnects = 0; this.invalidTickets = 0
            this.cursors = data.members; this.emitCursors()
            const claims = data.claims.filter(c => Date.parse(c.expiresAt) > Date.now())
            this.update({ status: 'ready', message: 'Piso conectado', members: data.members, claims, own: claims.some(c => c.claimId === this.state.own) ? this.state.own : null })
            return
          }
          if ('seq' in data && data.seq !== undefined) {
            if (this.seq === null || data.seq > this.seq + 1) {
              // A delayed grant can be the first packet revealing a gap. Never keep an unowned lease.
              if (data.type === 'claim.granted') this.send({ type: 'release', claimId: data.claimId })
              this.resync(); return
            }
            if (data.seq <= this.seq) {
              if (data.type === 'claim.granted' && data.claimId !== this.state.own) {
                this.send({ type: 'release', claimId: data.claimId })
                if (this.pending?.id === data.requestId) this.rejectPending(new Error('La reserva quedó desactualizada. Vuelve a seleccionar el grupo.'))
              }
              return
            }
            this.seq = data.seq
          }
          if (data.type === 'claim.denied') {
            if (this.pending?.id === data.requestId) this.rejectPending(new Error(data.reason === 'HELD' ? `${data.holder?.displayName ?? 'Otro refinador'} tiene este grupo. Espera o elige otro.` : 'El grupo ya no está disponible. Vuelve a seleccionarlo.'))
            return
          }
          if (data.type === 'claim.released') {
            this.update({ claims: this.state.claims.filter(c => c.claimId !== data.claimId), own: this.state.own === data.claimId ? null : this.state.own }); return
          }
          if (this.state.status !== 'ready') return
          if (data.type === 'cursor') {
            this.cursors = this.cursors.map(member => member.userId === data.userId ? { ...member, r: data.r, c: data.c } : member); this.emitCursors()
          } else if (data.type === 'member.joined') {
            const member = { userId: data.userId, displayName: data.displayName, r: null, c: null }
            const members = [...this.state.members.filter(m => m.userId !== member.userId), member]
            this.cursors = [...this.cursors.filter(m => m.userId !== member.userId), member]; this.emitCursors(); this.update({ members })
          } else if (data.type === 'member.left') {
            this.cursors = this.cursors.filter(m => m.userId !== data.userId); this.emitCursors()
            this.update({ members: this.state.members.filter(m => m.userId !== data.userId), claims: this.state.claims.filter(c => c.userId !== data.userId) })
          } else if (data.type === 'claim.granted' || data.type === 'claim.updated') {
            if (data.type === 'claim.granted' && this.pending?.id !== data.requestId) { this.send({ type: 'release', claimId: data.claimId }); return }
            this.update({ claims: [...this.state.claims.filter(c => c.claimId !== data.claimId), data], ...(data.type === 'claim.granted' ? { own: data.claimId } : {}) })
            if (data.type === 'claim.granted' && this.pending) { const pending = this.pending; this.pending = null; clearTimeout(pending.timer); pending.resolve(data) }
          }
        } catch { this.resync() }
      }
      socket.onerror = () => { this.update({ message: 'Error de conexión al piso; esperando reconexión.' }) }
      socket.onclose = event => {
        clearInterval(this.heartbeat)
        if (socket !== this.socket || this.disposed) return
        this.socket = null; this.seq = null; this.rejectPending(new Error('Se perdió la conexión al piso. Puedes reintentar por HTTP.'))
        this.cursors = []; this.emitCursors()
        this.update({ status: 'offline', members: [], claims: [], own: null, message: `Piso desconectado (${event.code}). Refinamiento HTTP disponible.` })
        if ([4400,4403,4404,4423].includes(event.code) || (event.code === 4401 && ++this.invalidTickets > 1)) {
          this.update({ status: 'stopped', message: `Piso no disponible: ${event.reason || event.code}. Refinamiento HTTP disponible.` }); return
        }
        this.schedule(event.code === 4429 ? 10000 : 0)
      }
    } catch (e) {
      if (this.disposed || signal.aborted) return
      const terminal = e instanceof ApiError && [400,401,403,404,423].includes(e.status)
      this.update({ status: terminal ? 'stopped' : 'offline', message: `${message(e)} Refinamiento HTTP disponible.` })
      if (!terminal) this.schedule(e instanceof ApiError ? e.retryAfterMs : 0)
    }
  }
  private schedule(minimum = 0) {
    clearTimeout(this.timer)
    this.timer = setTimeout(() => void this.start(), Math.max(minimum, Math.min(30000, 1000 * 2 ** this.reconnects++)) + Math.random() * 700)
  }
  private resync() {
    if (this.state.status === 'syncing') return
    this.rejectPending(new Error('El piso se está sincronizando. Reintenta cuando termine.'))
    if (this.state.own) this.send({ type: 'release', claimId: this.state.own })
    this.cursors = []; this.emitCursors()
    this.syncAt = Date.now()
    this.update({ status: 'syncing', message: 'Recuperando estado del piso…', members: [], claims: [], own: null })
    this.send({ type: 'resync' })
  }
  cursor = (cell: Cell) => {
    this.lastCursor = cell
    if (this.cursorTimer || this.state.status !== 'ready') return
    this.cursorTimer = setTimeout(() => {
      this.cursorTimer = undefined
      if (this.state.status === 'ready' && this.lastCursor) { this.send({ type: 'cursor', ...this.lastCursor }); this.cursorAt = Date.now() }
    }, Math.max(0, 120 - (Date.now() - this.cursorAt)))
  }
  reserve(seed: Cell): Promise<Claim | null> {
    if (this.state.status !== 'ready') {
      if (this.state.status === 'syncing') return Promise.reject(new Error('El piso se está sincronizando. Espera y reintenta.'))
      return Promise.resolve(null)
    }
    const own = this.state.claims.find(c => c.claimId === this.state.own && Date.parse(c.expiresAt) > Date.now() && c.cells.some(cell => cell.r === seed.r && cell.c === seed.c))
    if (own) return Promise.resolve(own)
    if (this.pending?.seed.r === seed.r && this.pending.seed.c === seed.c) return this.pending.promise
    this.release()
    const id = crypto.randomUUID()
    let resolve!: PendingClaim['resolve'], reject!: PendingClaim['reject']
    const promise = new Promise<Claim | null>((yes,no) => { resolve = yes; reject = no })
    const timer = setTimeout(() => { if (this.pending?.id === id) this.rejectPending(new Error('La reserva tardó demasiado. Reintenta; las respuestas antiguas se descartarán.')) }, 8000)
    this.pending = { id, seed, resolve, reject, promise, timer }
    this.send({ type: 'claim', requestId: id, ...seed }); return promise
  }
  private rejectPending(error: Error) {
    if (!this.pending) return
    const pending = this.pending; this.pending = null; clearTimeout(pending.timer); pending.reject(error)
  }
  release = () => {
    this.rejectPending(new Error('Reserva cancelada.'))
    if (this.state.own) this.send({ type: 'release', claimId: this.state.own })
    this.update({ claims: this.state.claims.filter(c => c.claimId !== this.state.own), own: null })
  }
  dispose() {
    this.disposed = true; this.release(); this.controller.abort()
    clearTimeout(this.timer); clearTimeout(this.cursorTimer); clearInterval(this.heartbeat)
    this.socket?.close(1000, 'Leaving file'); this.socket = null
    this.stateListeners.clear(); this.cursorListeners.clear()
  }
}
