import type { Page, WebSocketRoute } from '@playwright/test'
export const file = {
  id: 42,
  name: 'Test macrodata',
  rows: 512,
  cols: 512,
  tileSize: 16,
  status: 'ACTIVE',
  progress: { WO: 0, FC: 0, DR: 0, MA: 0, overall: 0 },
  refinedGroups: 0,
  totalGroups: 2,
  mistakes: 0,
  updatedAt: '2026-11-09T12:00:00Z',
}
export const rules = {
  tremorThreshold: 64,
  connectivity: 8,
  minGroupSize: 3,
  maxGroupSize: 40,
  binning: { strategy: 'DIGIT_SUM_MOD', order: ['DR', 'WO', 'MA', 'FC'] },
}
export const cells = [
  { r: 15, c: 15 },
  { r: 15, c: 16 },
  { r: 16, c: 16 },
]
export function tile(tr: number, tc: number, refined = false) {
  const values: string[] = [],
    tremors: number[] = [],
    bins: string[] = []
  for (let r = tr * 16; r < (tr + 1) * 16; r++)
    for (let c = tc * 16; c < (tc + 1) * 16; c++) {
      const i = cells.findIndex((cell) => cell.r === r && cell.c === c)
      values.push(i >= 0 ? String(i + 1) : '0')
      tremors.push(i >= 0 ? 80 : 0)
      bins.push(i >= 0 && refined ? 'M' : '.')
    }
  return {
    tileRow: tr,
    tileCol: tc,
    originRow: tr * 16,
    originCol: tc * 16,
    rows: 16,
    cols: 16,
    values: values.join(''),
    tremor: Buffer.from(tremors).toString('base64'),
    bins: bins.join(''),
    version: refined ? 2 : 1,
  }
}
export async function setup(
  page: Page,
  options: { write?: boolean; floor?: boolean; chaos?: boolean; rate?: boolean } = {},
) {
  const calls: { path: string; time: number; key?: string; body?: unknown }[] = []
  const frames: Record<string, unknown>[] = []
  let socket: WebSocketRoute | undefined,
    seq = 1,
    refined = false,
    refineAttempts = 0,
    rateTriggered = false,
    rateAt = 0
  let renewals = 0
  const me = {
    id: 12,
    displayName: 'Tester',
    permissions: options.write === false ? ['files:read'] : ['files:read', 'files:refine'],
    clearance: { granted: !!options.floor },
  }
  await page.route('**/api/v1/**', async (route) => {
    const req = route.request(),
      path = new URL(req.url()).pathname.replace('/api/v1', '')
    const body: unknown = req.postData() ? req.postDataJSON() : undefined
    calls.push({ path, time: Date.now(), key: req.headers()['idempotency-key'], body })
    const json = (data: unknown, status = 200, headers = {}) =>
      route.fulfill({ status, json: data, headers })
    if (path === '/meta/health') return json({ status: 'UP' })
    if (path === '/auth/login' || path === '/auth/refresh')
      return json({ accessToken: 'test-access', refreshToken: 'test-refresh', expiresIn: 180 })
    if (path === '/auth/me') return json(me)
    if (path === '/auth/logout') return json(null)
    if (path === '/files') {
      const query = new URL(req.url()).searchParams
      return json({
        content: query.get('q') === 'empty' ? [] : [file],
        totalElements: 30,
        totalPages: 3,
        page: Number(query.get('page') ?? 0),
        size: Number(query.get('size') ?? 10),
      })
    }
    if (path === '/files/42')
      return json(
        refined
          ? { ...file, refinedGroups: 1, progress: { ...file.progress, MA: 1, overall: 0.5 } }
          : file,
      )
    if (path === '/files/42/rules') return json(rules)
    if (path.includes('/tiles/')) {
      if (options.rate && !rateTriggered) {
        rateTriggered = true
        rateAt = Date.now()
        return json({ error: 'RATE_LIMITED', message: 'Wait' }, 429, { 'Retry-After': '1' })
      }
      const parts = path.split('/')
      return json(tile(Number(parts[4]), Number(parts[5]), refined))
    }
    if (path === '/files/42/refinements') {
      refineAttempts++
      refined = true
      if (options.chaos && refineAttempts === 1)
        return json(
          { error: 'SERVICE_UNAVAILABLE', message: 'Guardado pero respuesta perdida' },
          503,
          { 'Retry-After': '1' },
        )
      return json(
        {
          refinementId: 1,
          bin: 'MA',
          size: 3,
          file: {
            progress: { WO: 0, FC: 0, DR: 0, MA: 1, overall: 0.5 },
            refinedGroups: 1,
            totalGroups: 2,
            mistakes: 0,
            status: 'ACTIVE',
          },
        },
        201,
      )
    }
    if (path === '/floor/tickets')
      return options.floor
        ? json({ ticket: `ticket-${calls.length}`, expiresIn: 30 }, 201)
        : json({ error: 'CLEARANCE_REQUIRED', message: 'Piso cerrado' }, 423)
    return json({ error: 'NOT_FOUND', message: path }, 404)
  })
  await page.routeWebSocket('**/floor/ws?*', (ws) => {
    socket = ws
    ws.send(
      JSON.stringify({
        type: 'snapshot',
        seq,
        members: [{ userId: 31, displayName: 'Peer', r: 2, c: 2 }],
        claims: [],
      }),
    )
    ws.onMessage((raw) => {
      const data = JSON.parse(String(raw)) as Record<string, unknown>
      frames.push(data)
      if (data.type === 'ping') ws.send(JSON.stringify({ type: 'pong', t: data.t }))
      if (data.type === 'renew') renewals++
      if (data.type === 'resync')
        ws.send(
          JSON.stringify({
            type: 'snapshot',
            seq,
            members: [{ userId: 31, displayName: 'Peer', r: 2, c: 2 }],
            claims: [],
          }),
        )
      if (data.type === 'claim')
        ws.send(
          JSON.stringify({
            type: 'claim.granted',
            seq: ++seq,
            requestId: data.requestId,
            claimId: 'owned',
            userId: 12,
            displayName: 'Tester',
            cells,
            expiresAt: new Date(Date.now() + 15000).toISOString(),
          }),
        )
      if (data.type === 'release')
        ws.send(
          JSON.stringify({ type: 'claim.released', seq: ++seq, claimId: data.claimId, userId: 12 }),
        )
    })
  })
  return {
    calls,
    frames,
    get socket() {
      return socket
    },
    get rateAt() {
      return rateAt
    },
    get renewals() {
      return renewals
    },
    send(data: Record<string, unknown>) {
      if (typeof data.seq === 'number') seq = data.seq
      socket?.send(JSON.stringify(data))
    },
  }
}
export async function login(page: Page, path = '/files/42/refine?r=12&c=12') {
  await page.goto(path)
  await page.getByLabel(/Correo electrónico|Email/i).fill('test@example.test')
  await page.getByLabel('Contraseña').fill('password')
  await page.getByRole('button', { name: /Ingresar al piso|Entrar/i }).click()
}
