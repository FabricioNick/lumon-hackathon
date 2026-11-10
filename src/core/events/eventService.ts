import { apiRequest, ApiError } from '../apiClient'
import { clearTokens } from '../auth/tokenStore'
import { API_BASE_URL } from '../config'

export interface LumonEvent { id: string; type: string; data: unknown }
export type EventConnection = 'offline' | 'connecting' | 'live' | 'locked' | 'reconnecting'
const callbacks = new Set<(event: LumonEvent) => void>()
const statusCallbacks = new Set<() => void>()
let connection: EventConnection = 'offline'
let lastEventId = ''
const seen = new Set<string>()
const channel = typeof BroadcastChannel !== 'undefined' ? new BroadcastChannel('lumon.events') : null

export function getEventStatus() { return connection }
export function subscribeEventStatus(listener: () => void) {
  statusCallbacks.add(listener)
  return () => { statusCallbacks.delete(listener) }
}
export function subscribeEvents(listener: (event: LumonEvent) => void) {
  callbacks.add(listener)
  return () => { callbacks.delete(listener) }
}
function changeStatus(status: EventConnection, publish = true) {
  connection = status
  statusCallbacks.forEach(listener => listener())
  if (publish) channel?.postMessage({ kind: 'status', status })
}
function accept(event: LumonEvent, publish = true) {
  if (event.id && seen.has(event.id)) return
  if (event.id) {
    if (/^\d+$/.test(event.id) && (!lastEventId || BigInt(event.id) > BigInt(lastEventId))) lastEventId = event.id
    seen.add(event.id)
    if (seen.size > 3000) seen.delete(seen.values().next().value ?? '')
  }
  if (event.type === 'session.revoked') clearTokens()
  callbacks.forEach(listener => listener(event))
  window.dispatchEvent(new CustomEvent('lumon-event', { detail: event }))
  if (publish) channel?.postMessage({ kind: 'event', event })
}
channel?.addEventListener('message', event => {
  const message: unknown = event.data
  if (!message || typeof message !== 'object') return
  if ('kind' in message && message.kind === 'event' && 'event' in message) {
    const payload = message.event as LumonEvent
    if (payload && typeof payload.type === 'string') accept(payload, false)
  }
  if ('kind' in message && message.kind === 'status' && 'status' in message) {
    changeStatus(message.status as EventConnection, false)
  }
})
function sleep(ms: number, signal: AbortSignal) {
  return new Promise<void>(resolve => {
    if (signal.aborted) { resolve(); return }
    const timer = setTimeout(done, ms)
    function done() { clearTimeout(timer); signal.removeEventListener('abort', done); resolve() }
    signal.addEventListener('abort', done, { once: true })
  })
}
function connectStream(ticket: string, signal: AbortSignal) {
  return new Promise<void>(resolve => {
    const url = new URL(API_BASE_URL + '/events/stream')
    url.searchParams.set('ticket', ticket)
    if (lastEventId) url.searchParams.set('lastEventId', lastEventId)
    const source = new EventSource(url.toString())
    let closed = false
    function close() {
      if (closed) return
      closed = true
      signal.removeEventListener('abort', close)
      source.close()
      resolve()
    }
    function handle(type: string, message: MessageEvent<string>) {
      let data: unknown = message.data
      try { data = JSON.parse(message.data) as unknown } catch {}
      accept({ type, data, id: message.lastEventId || '' })
      if (type === 'stream.superseded') close()
    }
    source.onopen = () => changeStatus('live')
    source.onerror = close
    source.onmessage = event => handle('message', event)
    for (const type of ['refiner.updated', 'refinement.created', 'file.completed', 'contingency.activated', 'contingency.resolved', 'session.revoked', 'stream.reset', 'stream.superseded']) {
      source.addEventListener(type, event => handle(type, event as MessageEvent<string>))
    }
    signal.addEventListener('abort', close, { once: true })
    if (signal.aborted) close()
  })
}
async function streamLoop(signal: AbortSignal) {
  let attempt = 0
  while (!signal.aborted) {
    changeStatus(attempt ? 'reconnecting' : 'connecting')
    try {
      const response: unknown = await apiRequest('/events/tickets', { method: 'POST', retry: false, signal })
      const ticket = response && typeof response === 'object'
        ? ('ticket' in response ? response.ticket : 'token' in response ? response.token : null) : null
      if (typeof ticket !== 'string' || !ticket) throw new Error('Ticket SSE inválido.')
      attempt = 0
      await connectStream(ticket, signal)
    } catch (error) {
      if (signal.aborted) break
      if (error instanceof ApiError && error.status === 423) {
        changeStatus('locked')
        await sleep(30000, signal)
        continue
      }
    }
    attempt++
    await sleep(Math.min(1000 * 2 ** attempt, 30000), signal)
  }
  changeStatus('offline')
}
export function startGlobalEvents() {
  const controller = new AbortController()
  let running = false
  const elect = async () => {
    if (running || controller.signal.aborted) return
    running = true
    try {
      if (navigator.locks?.request) {
        await navigator.locks.request('lumon.sse.leader', { ifAvailable: true, signal: controller.signal }, async lock => {
          if (lock) await streamLoop(controller.signal)
        })
      } else await streamLoop(controller.signal)
    } catch {}
    finally { running = false }
  }
  void elect()
  const timer = setInterval(() => { void elect() }, 6000)
  return () => {
    controller.abort()
    clearInterval(timer)
  }
}
