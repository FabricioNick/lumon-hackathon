import { test, expect } from '@playwright/test'
import type { Page } from '@playwright/test'
import { setup, login } from './fixtures'

const refiner = {
  id: 7,
  fullName: 'Irving <script>alert(1)</script>',
  department: { id: 3, code: 'MDR', name: 'Macrodatos' },
  title: 'Refinador',
  extension: '4512',
  bio: '<img src=x onerror=alert(1)>',
  profileUrl: 'javascript:alert(1)',
  badge: null,
  version: 4,
  updatedAt: '2026-11-09T20:00:00Z',
}
async function personnel(page: Page) {
  await setup(page)
  await page.route('**/auth/me', (route) =>
    route.fulfill({
      json: {
        id: 12,
        displayName: 'Tester',
        role: { code: 'CUSTOM', name: 'Custom' },
        permissions: [
          'files:read',
          'files:refine',
          'refiners:read',
          'refiners:write',
          'media:upload',
          'incidents:read',
          'incidents:create',
          'team:manage',
        ],
        clearance: { granted: true },
      },
    }),
  )
  await page.route('**/departments', (route) => route.fulfill({ json: [refiner.department] }))
  await page.route('**/refiners?*', (route) =>
    route.fulfill({
      json: { content: [refiner], page: 0, size: 10, totalPages: 1, totalElements: 1 },
    }),
  )
  await page.route('**/refiners/7', (route) =>
    route.fulfill({ json: refiner, headers: { ETag: '"4"' } }),
  )
  await page.route('**/incidents?*', (route) =>
    route.fulfill({ json: { content: [], page: 0, size: 10, totalPages: 0, totalElements: 0 } }),
  )
}

test('unified direct routes retain query, use permissions and render untrusted fields as text', async ({
  page,
}) => {
  await personnel(page)
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  await login(page, '/refiners/7?from=directory')
  await expect(page).toHaveURL(/\/refiners\/7\?from=directory$/)
  await expect(page.getByRole('heading', { name: refiner.fullName })).toBeVisible()
  await expect(page.locator('a[href^="javascript:"]')).toHaveCount(0)
  await page.getByRole('link', { name: 'Personal', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Directorio de refinadores' })).toBeVisible()
  await page.getByRole('link', { name: 'Incidencias', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Incidencias', exact: true })).toBeVisible()
  expect(errors).toEqual([])
})

test('ETag conflict survives shared transport and requires an explicit resolution', async ({
  page,
}) => {
  await personnel(page)
  let version = 4
  const matches: string[] = []
  await page.route('**/refiners/7', (route) => {
    if (route.request().method() === 'PATCH') {
      matches.push(route.request().headers()['if-match'])
      if (matches.length === 1) {
        version = 5
        return route.fulfill({
          status: 412,
          json: {
            error: 'VERSION_CONFLICT',
            message: 'Changed',
            details: { current: { ...refiner, version } },
          },
          headers: { ETag: '"5"' },
        })
      }
      version = 6
    }
    return route.fulfill({
      json: { ...refiner, version, title: version === 5 ? 'Supervisor' : refiner.title },
      headers: { ETag: `"${version}"` },
    })
  })
  await login(page, '/refiners/7/edit')
  await page.getByLabel('Cargo', { exact: true }).fill('Mi cargo')
  await page.getByRole('button', { name: 'Guardar cambios' }).click()
  await expect(page.getByRole('heading', { name: 'El expediente cambió' })).toBeVisible()
  expect(matches).toEqual(['"4"'])
  await page.getByRole('radio', { name: 'Mi cambio' }).check()
  await page.getByRole('button', { name: 'Guardar resolución' }).click()
  await expect(page).toHaveURL(/\/refiners\/7$/)
  expect(matches).toEqual(['"4"', '"5"'])
})

test('two tabs rotate a single-use refresh once and logout propagates', async ({
  page,
  context,
}) => {
  await setup(page)
  let refreshes = 0
  await context.route('**/auth/refresh', async (route) => {
    refreshes++
    await new Promise((resolve) => setTimeout(resolve, 150))
    await route.fulfill({
      json: { accessToken: 'rotated-access', refreshToken: 'rotated-refresh', expiresIn: 90 },
    })
  })
  await login(page, '/files')
  await expect(page.getByRole('heading', { name: 'Archivos de macrodatos' })).toBeVisible()
  const peer = await context.newPage()
  await setup(peer)
  // Page routes take precedence over context routes, so intercept rotation on both tabs.
  for (const tab of [page, peer])
    await tab.route('**/auth/refresh', async (route) => {
      refreshes++
      await new Promise((resolve) => setTimeout(resolve, 150))
      await route.fulfill({
        json: { accessToken: 'rotated-access', refreshToken: 'rotated-refresh', expiresIn: 90 },
      })
    })
  await peer.goto('/files')
  await expect(peer.getByRole('heading', { name: 'Archivos de macrodatos' })).toBeVisible()
  expect(refreshes).toBe(0)
  for (const tab of [page, peer])
    await tab.route(/\/files\/42(?:\/rules)?$/, (route) => {
      if (route.request().headers().authorization === 'Bearer test-access')
        return route.fulfill({ status: 401, json: { error: 'TOKEN_EXPIRED', message: 'expired' } })
      return route.fallback()
    })
  await Promise.all([
    page.getByRole('link', { name: 'Test macrodata' }).click(),
    peer.getByRole('link', { name: 'Test macrodata' }).click(),
  ])
  await expect(page.getByRole('grid')).toBeVisible()
  await expect(peer.getByRole('grid')).toBeVisible()
  expect(refreshes).toBe(1)
  await page.getByRole('button', { name: 'Salir', exact: true }).click()
  await expect(peer.getByRole('button', { name: 'Ingresar al piso' })).toBeVisible({
    timeout: 2000,
  })
})

test('an ambiguous refresh failure is consumed once and ends the session', async ({ page }) => {
  await setup(page)
  let refreshes = 0
  await page.route('**/auth/refresh', (route) => {
    refreshes++
    return route.abort('failed')
  })
  await page.route(/\/files\/42(?:\/rules)?$/, (route) =>
    route.fulfill({ status: 401, json: { error: 'TOKEN_EXPIRED', message: 'expired' } }),
  )
  await login(page)
  await expect(page.getByRole('button', { name: 'Ingresar al piso' })).toBeVisible()
  expect(refreshes).toBe(1)
  expect(await page.evaluate(() => localStorage.getItem('lumon.refresh'))).toBeNull()
})

test('one native SSE leader distributes contingency and preserves failed acknowledgement', async ({
  page,
  context,
}) => {
  await personnel(page)
  let streams = 0
  const event = {
    id: 81,
    userId: 12,
    status: 'ACTIVE',
    createdAt: new Date().toISOString(),
    message: 'Atención compartida',
  }
  await page.route('**/events/tickets', (route) =>
    route.fulfill({ status: 201, json: { ticket: 'evt_fixture', expiresIn: 30 } }),
  )
  await page.route('**/events/stream?*', (route) => {
    streams++
    return route.fulfill({
      contentType: 'text/event-stream',
      body: `id: 1\nevent: contingency.activated\ndata: ${JSON.stringify(event)}\n\n`,
    })
  })
  await login(page, '/files')
  await page.waitForTimeout(1300)
  console.log('SSE_DIAGNOSTIC', JSON.stringify({
    streams,
    status: await page.locator('header').innerText().catch(() => 'NO_HEADER'),
    dialog: await page.locator('dialog').count(),
    url: page.url()
  }))
  await expect(page.getByRole('dialog')).toBeVisible()
  const peer = await context.newPage()
  await personnel(peer)
  await peer.route('**/events/tickets', (route) =>
    route.fulfill({ status: 201, json: { ticket: 'evt_peer', expiresIn: 30 } }),
  )
  await peer.route('**/events/stream?*', (route) => {
    streams++
    return route.fulfill({ contentType: 'text/event-stream', body: ': lumon\n\n' })
  })
  await peer.goto('/files')
  await expect(peer.getByRole('dialog')).toBeVisible()
  expect(streams).toBe(1)
  await peer.keyboard.press('Escape')
  await expect(peer.getByRole('dialog')).toBeVisible()
  await peer.route('**/contingency/81/ack', (route) =>
    route.fulfill({ status: 503, json: { error: 'SERVICE_UNAVAILABLE', message: 'Reintenta' } }),
  )
  await peer.getByRole('button', { name: 'Confirmar contingencia' }).click()
  await expect(peer.getByRole('alert')).toContainText('Reintenta')
  await expect(peer.getByRole('dialog')).toBeVisible()
  await peer.route('**/contingency/81/ack', (route) => route.fulfill({ status: 204 }))
  await peer.getByRole('button', { name: 'Confirmar contingencia' }).click()
  await expect(peer.getByRole('dialog')).not.toBeVisible()
  await expect(page.getByRole('dialog')).not.toBeVisible()
  const beforeTakeover = streams
  await page.close()
  await expect.poll(() => streams).toBeGreaterThan(beforeTakeover)
})

test('failed profile lookup returns to a usable login instead of an endless loading state', async ({
  page,
}) => {
  await setup(page)
  await page.route('**/auth/me', (route) =>
    route.fulfill({ status: 403, json: { error: 'FORBIDDEN', message: 'No profile' } }),
  )
  await login(page, '/refiners')
  await expect(page.getByRole('button', { name: 'Ingresar al piso' })).toBeEnabled()
  await expect(page.getByRole('alert')).toContainText('No profile')
})

test('shared events update CP2 and stream reset reloads its current state', async ({ page }) => {
  const fixture = await setup(page)
  await login(page)
  await expect(page.getByRole('grid')).toBeVisible()
  const before = fixture.calls.filter((call) => call.path === '/files/42').length
  await page.evaluate(() => {
    const bus = new BroadcastChannel('lumon.events')
    bus.postMessage({
      kind: 'event',
      scope: localStorage.getItem('lumon.session-id'),
      event: {
        id: '101',
        type: 'stream.reset',
        data: { reason: 'OUT_OF_BUFFER', message: 'Reload' },
      },
    })
    bus.close()
  })
  await expect
    .poll(() => fixture.calls.filter((call) => call.path === '/files/42').length)
    .toBeGreaterThan(before)
  await expect(page.getByRole('grid')).toBeVisible()
})
