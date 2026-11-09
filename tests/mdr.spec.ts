import { expect, test } from '@playwright/test'
import { cells, login, setup } from './fixtures'

test('virtualization, cross-tile selection, idempotent retry and progress', async ({ page }) => {
  const fixture = await setup(page, { chaos: true })
  await login(page)
  const cell = page.locator('[data-cell="15:15"]')
  await expect(cell).toContainText('1')
  await cell.click()
  await expect(page.getByRole('status').filter({ hasText: '3 celdas seleccionadas' })).toBeVisible()
  await expect(page.getByRole('gridcell', { selected: true })).toHaveCount(3)
  const bin = page.getByRole('button', { name: /MA.*Refinar en MA/ })
  await bin.dblclick()
  await expect(page.getByRole('status').filter({ hasText: 'Grupo refinado en MA' })).toBeVisible()
  const mutations = fixture.calls.filter((c) => c.path.endsWith('/refinements'))
  expect(mutations).toHaveLength(2)
  expect(mutations[0].key).toBe(mutations[1].key)
  expect(mutations[0].body).toEqual({ bin: 'MA', cells })
  await expect(cell).toHaveText('M')
  expect(await page.getByRole('gridcell').count()).toBeLessThanOrEqual(2500)
  await page.getByRole('grid').evaluate((node) => {
    node.scrollTop = 14000
    node.scrollLeft = 14000
  })
  await expect(page).toHaveURL(/r=388&c=388/)
  expect(await page.getByRole('gridcell').count()).toBeLessThanOrEqual(2500)
  expect(fixture.calls.filter((c) => c.path.includes('/tiles/')).length).toBeLessThan(40)
  await page.screenshot({ path: 'test-results/mdr.png', fullPage: true })
})

test('keyboard retains focus and uses real row/column indices', async ({ page }) => {
  await setup(page)
  await login(page)
  const cell = page.locator('[data-cell="15:15"]')
  await expect(cell).toContainText('1')
  await cell.focus()
  await page.keyboard.press('Control+End')
  const last = page.locator('[data-cell="511:511"]')
  await expect(last).toBeFocused()
  await expect(last).toHaveAttribute('aria-colindex', '512')
  await expect(last.locator('..')).toHaveAttribute('aria-rowindex', '512')
  expect(await page.getByRole('gridcell').count()).toBeLessThanOrEqual(2500)
  await page.keyboard.press('Home')
  await expect(page.locator('[data-cell="511:0"]')).toBeFocused()
  await page.keyboard.press('PageUp')
  await expect(page.locator('[data-cell="511:0"]')).not.toBeFocused()
})

test('file filters sanitize URL, debounce and restore navigation', async ({ page }) => {
  const fixture = await setup(page)
  await login(page, '/files?page=-4&size=999&status=bad&sort=bad')
  await expect(page).toHaveURL(/page=0&size=10&sort=updatedAt%2Cdesc/)
  await page.getByLabel('Buscar').fill('empty')
  await expect(page.getByText('No hay archivos que coincidan.')).toBeVisible()
  expect(fixture.calls.filter((c) => c.path === '/files')).toHaveLength(2)
  await page.goBack()
  await expect(page.getByLabel('Buscar')).toHaveValue('')
  await page.getByRole('combobox', { name: 'Estado', exact: true }).selectOption('COMPLETE')
  await expect(page).toHaveURL(/status=COMPLETE/)
})

test('permissions allow reading without refining', async ({ page }) => {
  const fixture = await setup(page, { write: false })
  await login(page)
  await expect(page.getByText(/Modo lectura/)).toBeVisible()
  const cell = page.locator('[data-cell="15:15"]')
  await expect(cell).toContainText('1')
  await cell.click()
  await expect(page.getByRole('button', { name: /Refinar en MA/ })).toBeDisabled()
  expect(fixture.calls.some((c) => c.path.endsWith('/refinements'))).toBe(false)
})

test('429 pauses newly scheduled tiles across viewport changes', async ({ page }) => {
  const fixture = await setup(page, { rate: true })
  await login(page)
  await expect.poll(() => fixture.rateAt).toBeGreaterThan(0)
  await page.getByRole('grid').evaluate((node) => {
    node.scrollTop = 9000
    node.scrollLeft = 9000
  })
  await expect(page.locator('[data-cell="250:250"]')).toHaveText('0')
  const after = fixture.calls.filter(
    (c) => c.path.includes('/tiles/') && c.time > fixture.rateAt + 100,
  )
  expect(after.length).toBeGreaterThan(0)
  expect(after.every((c) => c.time >= fixture.rateAt + 990)).toBe(true)
})

test('floor tickets, claims, cursor throttle and sequence gap recovery', async ({ page }) => {
  const fixture = await setup(page, { floor: true })
  await login(page)
  await expect(page.getByText('Piso conectado', { exact: true })).toBeVisible()
  const cell = page.locator('[data-cell="15:15"]')
  await expect(cell).toContainText('1')
  await cell.click()
  await expect(page.getByText(/Tester: 3 celdas reservadas/)).toBeVisible()
  expect(fixture.frames.some((f) => f.type === 'claim')).toBe(true)
  fixture.send({ type: 'member.joined', seq: 8, userId: 45, displayName: 'Lost member' })
  await expect.poll(() => fixture.frames.some((f) => f.type === 'resync')).toBe(true)
  await expect(page.getByText('Piso conectado', { exact: true })).toBeVisible()
  await expect(page.getByText(/Tester: 3 celdas reservadas/)).toHaveCount(0)
  fixture.send({
    type: 'claim.updated',
    seq: 10,
    claimId: 'peer-claim',
    userId: 31,
    displayName: 'Peer',
    cells,
    expiresAt: new Date(Date.now() + 15000).toISOString(),
  })
  await expect(page.getByRole('button', { name: /Refinar en MA/ })).toBeDisabled()
  await expect(page.getByText('Reservado por Peer.', { exact: false })).toBeVisible()
  for (let n = 0; n < 20; n++) fixture.send({ type: 'cursor', userId: 31, r: 20, c: n })
  await page.getByRole('button', { name: 'Cancelar', exact: true }).click()
  expect(fixture.calls.filter((c) => c.path.endsWith('/refinements'))).toHaveLength(0)
})

test('terminal close stops retries, restart obtains a fresh ticket', async ({ page }) => {
  const fixture = await setup(page, { floor: true })
  await login(page)
  await expect(page.getByText('Piso conectado', { exact: true })).toBeVisible()
  fixture.socket?.close({ code: 1012, reason: 'restart' })
  await expect.poll(() => fixture.calls.filter((c) => c.path === '/floor/tickets').length).toBe(2)
  await expect(page.getByText('Piso conectado', { exact: true })).toBeVisible()
  fixture.socket?.close({ code: 4403, reason: 'FORBIDDEN' })
  await expect(page.getByText(/Piso no disponible: FORBIDDEN/)).toBeVisible()
  await page.waitForTimeout(1800)
  expect(fixture.calls.filter((c) => c.path === '/floor/tickets')).toHaveLength(2)
})

test('reduced motion keeps scary cells distinct without animation', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await setup(page)
  await login(page)
  const cell = page.locator('[data-cell="15:15"]')
  await expect(cell).toHaveClass(/scary/)
  expect(await cell.locator('span').evaluate((node) => getComputedStyle(node).animationName)).toBe(
    'none',
  )
})

test('native drag-and-drop refines the selected group', async ({ page }) => {
  const fixture = await setup(page)
  await login(page)
  const cell = page.locator('[data-cell="15:15"]')
  await expect(cell).toContainText('1')
  await cell.click()
  const target = page.getByRole('button', { name: /Refinar en MA/ })
  await expect(target).toBeEnabled()
  await cell.dragTo(target)
  await expect(page.getByRole('status').filter({ hasText: 'Grupo refinado en MA' })).toBeVisible()
  expect(fixture.calls.filter((c) => c.path.endsWith('/refinements'))).toHaveLength(1)
})

test('409 reloads affected tiles and clears obsolete selection', async ({ page }) => {
  const fixture = await setup(page)
  await page.route('**/files/42/refinements', (route) =>
    route.fulfill({
      status: 409,
      json: {
        error: 'ALREADY_REFINED',
        message: 'Already refined',
        details: {
          tiles: [
            [0, 0],
            [0, 1],
            [1, 1],
          ],
        },
      },
    }),
  )
  await login(page)
  const cell = page.locator('[data-cell="15:15"]')
  await expect(cell).toContainText('1')
  await cell.click()
  await expect(page.getByRole('button', { name: /Refinar en MA/ })).toBeEnabled()
  const before = fixture.calls.filter((c) => c.path.includes('/tiles/')).length
  await page.getByRole('button', { name: /Refinar en MA/ }).click()
  await expect(
    page.getByRole('status').filter({ hasText: 'El grupo ya fue refinado' }),
  ).toBeVisible()
  await expect(page.getByRole('gridcell', { selected: true })).toHaveCount(0)
  await expect
    .poll(() => fixture.calls.filter((c) => c.path.includes('/tiles/')).length)
    .toBeGreaterThan(before)
})

test('422 wrong-bin double activation reuses the same intent', async ({ page }) => {
  await setup(page)
  const keys: string[] = []
  await page.route('**/files/42/refinements', (route) => {
    keys.push(route.request().headers()['idempotency-key'])
    return route.fulfill({
      status: 422,
      json: { error: 'WRONG_BIN', message: 'Wrong bin', details: { mistakes: 1 } },
    })
  })
  await login(page)
  const cell = page.locator('[data-cell="15:15"]')
  await expect(cell).toContainText('1')
  await cell.click()
  const wrong = page.getByRole('button', { name: /Refinar en WO/ })
  await expect(wrong).toBeEnabled()
  await wrong.click()
  await expect(page.getByRole('status').filter({ hasText: 'Caja incorrecta' })).toBeVisible()
  await expect(wrong).toBeEnabled()
  await wrong.click()
  await expect.poll(() => keys.length).toBe(2)
  expect(new Set(keys).size).toBe(1)
})

test('stale list response cannot replace newer filters', async ({ page }) => {
  await setup(page)
  await page.route('**/api/v1/files?*', async (route) => {
    const q = new URL(route.request().url()).searchParams.get('q')
    if (q === 'slow') {
      await new Promise((resolve) => setTimeout(resolve, 1200))
      await route.fulfill({
        json: { content: [], totalElements: 999, totalPages: 100, page: 0, size: 10 },
      })
      return
    }
    await route.fallback()
  })
  await login(page, '/files')
  await page.getByLabel('Buscar').fill('slow')
  await expect(page).toHaveURL(/q=slow/)
  await page.getByLabel('Buscar').fill('empty')
  await expect(page.getByText('No hay archivos que coincidan.')).toBeVisible()
  await page.waitForTimeout(1300)
  await expect(page.getByRole('status')).toContainText('30 archivos')
  await expect(page).toHaveURL(/q=empty/)
})

test('heartbeat renews reservations and sends pings', async ({ page }) => {
  const fixture = await setup(page, { floor: true })
  await login(page)
  const cell = page.locator('[data-cell="15:15"]')
  await expect(cell).toContainText('1')
  await cell.click()
  await expect(page.getByText(/Tester: 3 celdas reservadas/)).toBeVisible()
  await expect
    .poll(() => fixture.frames.some((f) => f.type === 'ping'), { timeout: 13000 })
    .toBe(true)
  expect(fixture.frames.some((f) => f.type === 'renew')).toBe(true)
})

test('concurrent expired requests share one refresh and never persist access token', async ({
  page,
}) => {
  const fixture = await setup(page)
  const expired = new Set<string>()
  await page.route(/\/api\/v1\/files\/42(?:\/rules)?$/, async (route) => {
    const path = new URL(route.request().url()).pathname
    if (!expired.has(path)) {
      expired.add(path)
      return route.fulfill({ status: 401, json: { error: 'TOKEN_EXPIRED', message: 'Expired' } })
    }
    return route.fallback()
  })
  await login(page)
  await expect(page.getByRole('grid')).toBeVisible()
  expect(fixture.calls.filter((c) => c.path === '/auth/refresh')).toHaveLength(1)
  const stored = await page.evaluate(() =>
    JSON.stringify({ local: { ...localStorage }, session: { ...sessionStorage } }),
  )
  expect(stored).not.toContain('test-access')
})

test('scroll cancels obsolete tiles and cached tiles are reused', async ({ page }) => {
  const fixture = await setup(page)
  const cancelled: string[] = []
  page.on('requestfailed', (req) => {
    if (req.url().includes('/tiles/')) cancelled.push(req.url())
  })
  await page.route('**/tiles/**', async (route) => {
    if (!route.request().url().endsWith('/0/0'))
      await new Promise((resolve) => setTimeout(resolve, 500))
    await route.fallback()
  })
  await login(page)
  await expect(page.locator('[data-cell="15:15"]')).toContainText('1')
  await page.getByRole('grid').evaluate((node) => {
    node.scrollTop = 9000
    node.scrollLeft = 9000
  })
  await expect.poll(() => cancelled.length).toBeGreaterThan(0)
  await expect(page.locator('[data-cell="250:250"]')).toHaveText('0')
  const cachedRequests = fixture.calls.filter((c) => c.path.endsWith('/tiles/0/0')).length
  await page.getByRole('grid').evaluate((node) => {
    node.scrollTop = 432
    node.scrollLeft = 432
  })
  await expect(page.locator('[data-cell="15:15"]')).toContainText('1')
  expect(fixture.calls.filter((c) => c.path.endsWith('/tiles/0/0'))).toHaveLength(cachedRequests)
})

test('completion shows final state and removes active grid', async ({ page }) => {
  await setup(page)
  await page.route('**/files/42/refinements', (route) =>
    route.fulfill({
      status: 201,
      json: {
        refinementId: 1,
        bin: 'MA',
        size: 3,
        file: {
          progress: { WO: 1, FC: 1, DR: 1, MA: 1, overall: 1 },
          refinedGroups: 2,
          totalGroups: 2,
          mistakes: 0,
          status: 'COMPLETE',
        },
      },
    }),
  )
  await login(page)
  const cell = page.locator('[data-cell="15:15"]')
  await expect(cell).toContainText('1')
  await cell.click()
  await page.getByRole('button', { name: /Refinar en MA/ }).click()
  await expect(page.getByRole('heading', { name: 'Archivo completado' })).toBeVisible()
  await expect(page.getByRole('grid')).toHaveCount(0)
})

test('claim denial never submits HTTP', async ({ page }) => {
  const fixture = await setup(page, { floor: true })
  await page.routeWebSocket('**/floor/ws?*', (ws) => {
    ws.send(JSON.stringify({ type: 'snapshot', seq: 1, members: [], claims: [] }))
    ws.onMessage((raw) => {
      const data = JSON.parse(String(raw)) as Record<string, unknown>
      if (data.type === 'claim')
        ws.send(
          JSON.stringify({
            type: 'claim.denied',
            requestId: data.requestId,
            reason: 'HELD',
            holder: { userId: 31, displayName: 'Peer' },
          }),
        )
    })
  })
  await login(page)
  const cell = page.locator('[data-cell="15:15"]')
  await expect(cell).toContainText('1')
  await cell.click()
  await expect(page.getByRole('status').filter({ hasText: 'Peer tiene este grupo' })).toBeVisible()
  await page.getByRole('button', { name: /Refinar en MA/ }).click()
  await expect(page.getByRole('status').filter({ hasText: 'Peer tiene este grupo' })).toBeVisible()
  expect(fixture.calls.filter((c) => c.path.endsWith('/refinements'))).toHaveLength(0)
})

test('late claim grant after cancellation is released and never becomes a ghost', async ({
  page,
}) => {
  await setup(page, { floor: true })
  const messages: Record<string, unknown>[] = []
  await page.routeWebSocket('**/floor/ws?*', (ws) => {
    ws.send(JSON.stringify({ type: 'snapshot', seq: 1, members: [], claims: [] }))
    ws.onMessage((raw) => {
      const data = JSON.parse(String(raw)) as Record<string, unknown>
      messages.push(data)
      if (data.type === 'claim')
        setTimeout(
          () =>
            ws.send(
              JSON.stringify({
                type: 'claim.granted',
                seq: 2,
                requestId: data.requestId,
                claimId: 'late',
                userId: 12,
                displayName: 'Tester',
                cells,
                expiresAt: new Date(Date.now() + 15000).toISOString(),
              }),
            ),
          800,
        )
    })
  })
  await login(page)
  const cell = page.locator('[data-cell="15:15"]')
  await expect(cell).toContainText('1')
  await cell.click()
  await expect.poll(() => messages.some((m) => m.type === 'claim')).toBe(true)
  await page.getByRole('button', { name: 'Cancelar', exact: true }).click()
  await expect
    .poll(() => messages.some((m) => m.type === 'release' && m.claimId === 'late'))
    .toBe(true)
  await expect(page.getByText(/Tester: 3 celdas reservadas/)).toHaveCount(0)
  await expect(page.getByRole('gridcell', { selected: true })).toHaveCount(0)
})
