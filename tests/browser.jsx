import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { MemoryRouter } from 'react-router-dom'
import { Cp45Provider } from '../src/features/cp45/runtime'
import { Cp45Router } from '../src/features/cp45/routes'
import '../src/index.css'
// Deterministic test data only; this fixture is not part of the production entry point.
const department = { id: 3, code: 'MDR', name: 'Macrodatos' }
let refiner = {
  id: 7,
  fullName: 'Irving <img src=x onerror=alert(1)>',
  department,
  title: 'Refinador',
  extension: '4512',
  bio: '<script>unsafe</script>',
  profileUrl: 'javascript:alert(1)',
  badge: null,
  version: 4,
  updatedAt: '2026-11-09T20:00:00Z',
}
const listeners = new Set()
const harness = {
  calls: [],
  conflict: false,
  failAck: true,
  requests: 0,
  failIncident: true,
  emit: (event) => listeners.forEach((listener) => listener(event)),
}
window.testHarness = harness
const uploadFixture = new URLSearchParams(location.search).has('uploads')
const tickets = new Map()
let ticketNumber = 0
if (uploadFixture) {
  // Transport double only in this test entry. Production uses native XMLHttpRequest.
  window.XMLHttpRequest = class {
    constructor() {
      this.upload = {}
      this.status = 200
      this.responseText = '{"Key":"fixture"}'
    }
    open() {}
    setRequestHeader() {}
    send(body) {
      this.timer = setTimeout(() => {
        this.upload.onprogress?.({
          lengthComputable: true,
          loaded: body.size,
          total: body.size,
        })
        this.onload?.()
      }, 25)
    }
    abort() {
      clearTimeout(this.timer)
      this.onabort?.()
    }
  }
}
const runtime = {
  storage: uploadFixture
    ? {
        provider: 'SUPABASE',
        projectUrl: 'https://test.supabase.co',
        publicKey: 'sb_publishable_fixture',
      }
    : undefined,
  userId: 12,
  sessionKey: 'test-session',
  permissions: new URLSearchParams(location.search).has('denied')
    ? []
    : ['refiners:read', 'refiners:write', 'media:upload', 'incidents:read', 'incidents:create'],
  subscribe: (listener) => {
    listeners.add(listener)
    return () => listeners.delete(listener)
  },
  request: async (path, init = {}) => {
    harness.calls.push({
      path,
      method: init.method ?? 'GET',
      headers: init.headers,
      body: init.body,
    })
    if (init.signal?.aborted) throw new DOMException('Cancelled', 'AbortError')
    if (path === '/media/tickets') {
      const body = JSON.parse(init.body)
      const ticketId = `mt_fixture${++ticketNumber}`
      tickets.set(ticketId, body)
      return Response.json(
        {
          ticketId,
          expiresAt: new Date(Date.now() + 600000).toISOString(),
          provider: 'SUPABASE',
          objectPath: `TEAM-007/${body.purpose.toLowerCase()}/${ticketId}.webp`,
          bucket: 'lumon-media',
          constraints: {
            contentType: 'image/webp',
            maxBytes: body.purpose === 'BADGE' ? 122880 : 307200,
          },
        },
        { status: 201 },
      )
    }
    if (path.startsWith('/media/tickets/') && path.endsWith('/confirm')) {
      const ticketId = path.split('/')[3]
      const source = tickets.get(ticketId)
      return Response.json(
        {
          mediaId: Number(ticketId.replace('mt_fixture', '')),
          url: JSON.parse(init.body).url,
          width: source.width,
          height: source.height,
          purpose: source.purpose,
        },
        { status: 201 },
      )
    }
    if (path === '/incidents' && init.method === 'POST') {
      if (harness.failIncident)
        return Response.json(
          {
            error: 'SERVICE_UNAVAILABLE',
            message: 'Reporte no guardado; reintenta',
          },
          { status: 503 },
        )
      return Response.json(
        {
          id: 5,
          ...JSON.parse(init.body),
          photos: [],
          createdBy: { id: 12, displayName: 'Test' },
          createdAt: new Date().toISOString(),
        },
        { status: 201 },
      )
    }
    if (path === '/departments') return Response.json([department])
    if (path.startsWith('/refiners?'))
      return Response.json({
        content: [refiner],
        page: 0,
        size: 10,
        totalPages: 2,
        totalElements: 11,
      })
    if (path === '/refiners/7' && init.method === 'PATCH') {
      if (harness.conflict) {
        harness.conflict = false
        refiner = { ...refiner, title: 'Supervisor del servidor', version: 5 }
        return Response.json(
          { error: 'VERSION_CONFLICT', details: { current: refiner } },
          { status: 412, headers: { ETag: '"5"' } },
        )
      }
      if (init.headers['If-Match'] !== `"${refiner.version}"`)
        return Response.json({ error: 'VERSION_CONFLICT' }, { status: 412 })
      refiner = {
        ...refiner,
        ...JSON.parse(init.body),
        version: refiner.version + 1,
      }
      return Response.json(refiner, {
        headers: { ETag: `"${refiner.version}"` },
      })
    }
    if (path === '/refiners/7')
      return Response.json(refiner, {
        headers: { ETag: `"${refiner.version}"` },
      })
    if (path.startsWith('/incidents?'))
      return Response.json({
        content: [],
        page: 0,
        size: 10,
        totalPages: 0,
        totalElements: 0,
      })
    if (path.startsWith('/contingency/'))
      return harness.failAck
        ? Response.json(
            { error: 'SERVICE_UNAVAILABLE', message: 'Intenta otra vez' },
            { status: 503 },
          )
        : new Response(null, { status: 204 })
    return Response.json({ error: 'TEST_UNHANDLED_PATH' }, { status: 404 })
  },
}
const route = new URLSearchParams(location.search).get('route') ?? '/refiners'
createRoot(document.getElementById('root')).render(
  <StrictMode>
    <Cp45Provider runtime={runtime}>
      <MemoryRouter initialEntries={[route]}>
        <Cp45Router />
      </MemoryRouter>
    </Cp45Provider>
  </StrictMode>,
)
