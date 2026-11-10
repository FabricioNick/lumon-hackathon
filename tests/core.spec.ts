import { expect, test } from '@playwright/test'
import type { Page } from '@playwright/test'

const user = {
  id: 17,
  email: 'member@example.test',
  displayName: 'Cuadrilla MDR',
  team: { code: 'TEAM-007', name: 'Pruebas MDR' },
  role: { code: 'SUPERVISOR', name: 'Supervisor' },
  permissions: ['files:read', 'files:refine', 'refiners:read', 'team:manage'],
  clearance: { granted: false, grantedAt: null },
}
const pair = { accessToken: 'old-access', refreshToken: 'refresh-1', expiresIn: 180 }
const rotated = { accessToken: 'new-access', refreshToken: 'refresh-2', expiresIn: 180 }
const roster = {
  members: [
    { name: 'Estudiante Uno', code: 'A001' },
    { name: 'Estudiante Dos', code: 'A002' },
    { name: 'Estudiante Tres', code: 'A003' },
  ],
  complete: true,
  locked: false,
}

async function mockLumon(page: Page, options: { expired?: boolean; permissions?: string[] } = {}) {
  let refreshCalls = 0
  const requests: {
    path: string
    method: string
    body: unknown
    build?: string
    authorization?: string
  }[] = []
  await page.route('**/api/v1/**', async (route) => {
    const request = route.request()
    const path = new URL(request.url()).pathname.replace('/api/v1', '')
    const method = request.method()
    const body = request.postData() ? (request.postDataJSON() as unknown) : null
    requests.push({
      path,
      method,
      body,
      build: request.headers()['x-lumon-build'],
      authorization: request.headers().authorization,
    })
    const json = (value: unknown, status = 200) =>
      route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(value) })
    if (path === '/meta/health') return json({ status: 'UP' })
    if (path === '/auth/login' || path === '/auth/register')
      return json(pair, path === '/auth/register' ? 201 : 200)
    if (path === '/auth/refresh') {
      refreshCalls++
      return json(rotated)
    }
    if (path === '/auth/logout') return route.fulfill({ status: 204, body: '' })
    if (path === '/auth/me')
      return json({ ...user, permissions: options.permissions ?? user.permissions })
    if (path === '/events/tickets')
      return json({ error: 'CLEARANCE_REQUIRED', message: 'Locked' }, 403)
    if (
      options.expired &&
      ['/integrations/status', '/clearance', '/team/roster'].includes(path) &&
      request.headers().authorization !== 'Bearer new-access'
    ) {
      return json({ error: 'TOKEN_EXPIRED', message: 'Expired' }, 401)
    }
    if (path === '/integrations/status') return json({ deploy: {}, storage: {}, clearance: {} })
    if (path === '/clearance') return json({ granted: false })
    if (path === '/team/roster' && method === 'GET') return json(roster)
    return json({ error: 'NOT_FOUND', message: 'Missing mock' }, 404)
  })
  return {
    requests,
    get refreshCalls() {
      return refreshCalls
    },
  }
}

test('private deep link returns to original query, access token stays memory-only, logout revokes', async ({
  page,
}) => {
  const network = await mockLumon(page)
  await page.goto('/estado?tab=deploy')
  await expect(page).toHaveURL(/\/login\?next=/)
  await page.getByLabel('Correo electrónico').fill('member@example.test')
  await page.getByLabel('Contraseña').fill('password123')
  await page.getByRole('button', { name: 'Ingresar al piso' }).click()
  await expect(page).toHaveURL(/\/estado\?tab=deploy$/)
  await expect(page.getByRole('heading', { name: 'Estado del piso' })).toBeVisible()
  expect(await page.evaluate(() => localStorage.getItem('lumon.refresh'))).toBe('refresh-1')
  expect(await page.evaluate(() => localStorage.getItem('lumon.access'))).toBeNull()
  expect(await page.evaluate(() => sessionStorage.getItem('lumon.access'))).toBeNull()
  expect(
    network.requests.filter((r) => r.path === '/auth/login').every((r) => r.build === 'dev'),
  ).toBe(true)
  await page.getByRole('button', { name: 'Salir' }).click()
  await expect(page).toHaveURL(/\/login/)
  expect(network.requests.find((r) => r.path === '/auth/logout')?.body).toEqual({
    refreshToken: 'refresh-1',
  })
  expect(await page.evaluate(() => localStorage.getItem('lumon.refresh'))).toBeNull()
})

test('register follows Swagger payload, and permission-denied deep links do not render modules', async ({
  page,
}) => {
  const network = await mockLumon(page, { permissions: ['team:manage'] })
  await page.goto('/register')
  await page.getByLabel('Nombre de la cuadrilla').fill('Pruebas MDR')
  await page.getByLabel('Correo electrónico').fill('member@example.test')
  await page.getByLabel('Contraseña').fill('password123')
  await page.getByRole('button', { name: 'Registrar cuadrilla' }).click()
  await expect(page).toHaveURL('/')
  expect(network.requests.find((r) => r.path === '/auth/register')?.body).toEqual({
    teamName: 'Pruebas MDR',
    email: 'member@example.test',
    password: 'password123',
  })
  await page.goto('/files')
  await expect(page.getByText('Sin permiso')).toBeVisible()
})

test('simultaneous expired status requests trigger exactly one refresh and retry with new access', async ({
  page,
}) => {
  const network = await mockLumon(page, { expired: true })
  await page.goto('/login')
  await page.getByLabel('Correo electrónico').fill('member@example.test')
  await page.getByLabel('Contraseña').fill('password123')
  await page.getByRole('button', { name: 'Ingresar al piso' }).click()
  await expect(page).toHaveURL('/')
  await page.goto('/estado')
  await expect(page.getByRole('heading', { name: 'Estado del piso' })).toBeVisible()
  await expect
    .poll(
      () =>
        network.requests.filter(
          (r) => r.path === '/team/roster' && r.authorization === 'Bearer new-access',
        ).length,
    )
    .toBeGreaterThan(0)
  expect(network.refreshCalls).toBe(1)
  expect(await page.evaluate(() => localStorage.getItem('lumon.refresh'))).toBe('refresh-2')
  const refresh = network.requests.find((r) => r.path === '/auth/refresh')
  expect(refresh?.body).toEqual({ refreshToken: 'refresh-1' })
})

test('cross-tab refresh rotates only once and logout closes both tabs within two seconds', async ({
  context,
}) => {
  let refreshCount = 0
  let expired = false
  const logoutBodies: unknown[] = []
  await context.route('**/api/v1/**', async (route) => {
    const req = route.request()
    const path = new URL(req.url()).pathname.replace('/api/v1', '')
    const json = (value: unknown, status = 200) =>
      route.fulfill({
        status,
        contentType: 'application/json',
        body: JSON.stringify(value),
      })
    if (path === '/meta/health') return json({ status: 'UP' })
    if (path === '/auth/login') return json(pair)
    if (expired && req.headers().authorization === 'Bearer old-access' && path !== '/auth/refresh')
      return json({ error: 'TOKEN_EXPIRED', message: 'Expired' }, 401)
    if (path === '/auth/me') return json(user)
    if (path === '/auth/refresh') {
      refreshCount++
      if (req.postDataJSON().refreshToken !== pair.refreshToken) {
        return json({ error: 'REFRESH_REUSED', message: 'Token reused' }, 401)
      }
      return json(rotated)
    }
    if (path === '/auth/logout') {
      logoutBodies.push(req.postDataJSON() as unknown)
      return route.fulfill({ status: 204, body: '' })
    }
    if (path === '/events/tickets')
      return json({ error: 'CLEARANCE_REQUIRED', message: 'Locked' }, 403)
    if (path === '/integrations/status') return json({ deploy: {}, storage: {}, clearance: {} })
    if (path === '/clearance') return json({ granted: false })
    if (path === '/team/roster') return json(roster)
    return json({ error: 'NOT_FOUND', message: 'Not configured' }, 404)
  })

  const first = await context.newPage()
  await first.goto('/login')
  await first.getByLabel('Correo electrónico').fill('member@example.test')
  await first.getByLabel('Contraseña').fill('password123')
  await first.getByRole('button', { name: 'Ingresar al piso' }).click()
  await expect(first).toHaveURL('/')

  const second = await context.newPage()
  await second.goto('/estado')
  await expect(second.getByRole('heading', { name: 'Estado del piso' })).toBeVisible()
  expect(refreshCount).toBe(0)
  expired = true
  await Promise.all([first.goto('/estado'), second.reload()])
  await expect(first.getByRole('heading', { name: 'Estado del piso' })).toBeVisible()
  await expect(second.getByRole('heading', { name: 'Estado del piso' })).toBeVisible()
  await expect.poll(() => refreshCount).toBe(1)

  await first.getByRole('button', { name: 'Salir' }).click()
  await expect(first).toHaveURL(/\/login/)
  await expect(second).toHaveURL(/\/login/, { timeout: 2000 })
  expect(logoutBodies).toEqual([{ refreshToken: rotated.refreshToken }])
  expect(await second.evaluate(() => localStorage.getItem('lumon.refresh'))).toBeNull()
})

test('status submits real contract shapes, rejects duplicate roster codes and shows storage setup pending', async ({
  page,
}) => {
  const network = await mockLumon(page)
  const writes: { path: string; body: unknown }[] = []
  await page.route('**/integrations/deploy/*', async (route) => {
    const request = route.request()
    const path = new URL(request.url()).pathname
    writes.push({ path, body: request.postData() ? request.postDataJSON() : null })
    await route.fulfill({
      json: path.endsWith('/challenge')
        ? {
            token: 'fixture-public-challenge',
            wellKnownPath: '/.well-known/lumon-verification.txt',
            expiresAt: '2099-01-01T00:00:00Z',
          }
        : { verified: true },
    })
  })
  await page.goto('/login?next=%2Festado')
  await page.getByLabel('Correo electrónico').fill('member@example.test')
  await page.getByLabel('Contraseña').fill('password123')
  await page.getByRole('button', { name: 'Ingresar al piso' }).click()
  await expect(page.getByLabel('Integrante 1')).toHaveValue('Estudiante Uno')
  await page.getByLabel('Código UTEC').nth(1).fill('a001')
  await page.getByRole('button', { name: 'Inscribir integrantes' }).click()
  await expect(page.getByRole('status')).toContainText('deben ser únicos')
  expect(network.requests.filter((r) => r.method === 'PUT')).toHaveLength(0)
  await page.getByRole('button', { name: 'Verificar storage configurado' }).click()
  await expect(page.getByRole('status')).toContainText('Configura las variables públicas')
  await page.getByLabel('Origen de producción').fill('https://fixture.example.test/path')
  await page.getByRole('button', { name: 'Solicitar challenge' }).click()
  await expect(page.getByRole('status')).toContainText('origen HTTPS sin rutas')
  expect(writes).toHaveLength(0)
  await page.getByLabel('Origen de producción').fill('https://fixture.example.test')
  await page.getByRole('button', { name: 'Solicitar challenge' }).click()
  await expect(page.getByLabel('Token de verificación')).toHaveValue('fixture-public-challenge')
  expect(writes[0]).toEqual({
    path: '/api/v1/integrations/deploy/challenge',
    body: { origin: 'https://fixture.example.test' },
  })
  await page.getByRole('button', { name: 'Verificar dominio' }).click()
  await expect.poll(() => writes.length).toBe(2)
  expect(writes[1]).toEqual({ path: '/api/v1/integrations/deploy/verify', body: null })
  await expect(page.getByRole('button', { name: 'Abrir el Piso de Pruebas' })).toBeDisabled()
})
