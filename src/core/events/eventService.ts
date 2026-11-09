import { apiRequest } from '../apiClient'
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
    lastEventId = event.id
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
async function consumeStream(ticket: string, signal: AbortSignal) {
  const url = new URL(API_BASE_URL + '/events/stream')
  url.searchParams.set('ticket', ticket)
  if (lastEventId) url.searchParams.set('lastEventId', lastEventId)
  const controller = new AbortController()
  const abort = () => controller.abort()
  signal.addEventListener('abort', abort, { once: true })
  let lastByte = Date.now()
  const watchdog = setInterval(() => { if (Date.now() - lastByte > 45000) controller.abort() }, 5000)
  try {
    const response = await fetch(url, { headers: { Accept: 'text/event-stream' }, signal: controller.signal })
    if (!response.ok || !response.body) throw new Error('Stream HTTP ' + response.status)
    changeStatus('live')
    const reader = response.body.getReader()
    const decoder = new TextDecoder()
    let pending = ''
    let type = 'message'
    let id = ''
    let data: string[] = []
    const dispatch = () => {
      if (data.length) {
        const text = data.join('\n')
        let parsed: unknown = text
        try { parsed = JSON.parse(text) as unknown } catch {}
        accept({ id, type, data: parsed })
      }
      type = 'message'; id = ''; data = []
    }
    while (!signal.aborted) {
      const { value, done } = await reader.read()
      if (done) break
      lastByte = Date.now()
      pending += decoder.decode(value, { stream: true })
      let end = pending.indexOf('\n')
      while (end >= 0) {
        const line = pending.slice(0, end).replace(/\r$/, '')
        pending = pending.slice(end + 1)
        if (!line) dispatch()
        else if (!line.startsWith(':')) {
          const colon = line.indexOf(':')
          const field = colon < 0 ? line : line.slice(0, colon)
          const value = colon < 0 ? '' : line.slice(colon + 1).replace(/^ /, '')
          if (field === 'event') type = value
          if (field === 'id') id = value
          if (field === 'data') data.push(value)
        }
        end = pending.indexOf('\n')
      }
    }
    await reader.cancel().catch(() => undefined)
  } finally {
    clearInterval(watchdog)
    signal.removeEventListener('abort', abort)
    controller.abort()
  }
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
      await consumeStream(ticket, signal)
    } catch (error) {
      if (signal.aborted) break
      if (error && typeof error === 'object' && 'status' in error && error.status === 423) {
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
