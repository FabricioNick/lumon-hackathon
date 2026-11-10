import { chromium } from 'playwright'
import { createRequire } from 'node:module'
import { resolve, join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { tmpdir } from 'node:os'
const lighthousePackage = resolve(process.env.LIGHTHOUSE_PACKAGE ?? 'node_modules/lighthouse')
const requireLighthouse = createRequire(join(lighthousePackage, 'package.json'))
const { default: puppeteer } = await import(
  pathToFileURL(requireLighthouse.resolve('puppeteer-core')).href
)
const { startFlow } = await import(pathToFileURL(join(lighthousePackage, 'core/index.js')).href)
import { writeFile, mkdir, mkdtemp, rm } from 'node:fs/promises'
const profile = await mkdtemp(join(tmpdir(), 'lumon-lighthouse-'))
const origin = process.env.LUMON_AUDIT_ORIGIN ?? 'http://127.0.0.1:5190'
const context = await chromium.launchPersistentContext(profile, {
  headless: true,
  args: ['--remote-debugging-port=9223', '--no-sandbox'],
  viewport: { width: 1280, height: 900 },
})
const page = context.pages()[0]
const refiner = {
  id: 7,
  fullName: 'Irving Test',
  department: { id: 3, code: 'MDR', name: 'Macrodatos' },
  title: 'Refinador',
  extension: '4512',
  bio: 'Datos de prueba',
  profileUrl: null,
  badge: null,
  version: 4,
  updatedAt: '2026-11-09T20:00:00Z',
}
const file = {
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
await context.route('**/api/v1/**', async (route) => {
  const path = new URL(route.request().url()).pathname.replace('/api/v1', '')
  const json = (data, status = 200) => route.fulfill({ status, json: data })
  if (path === '/meta/health') return json({ status: 'UP' })
  if (path === '/auth/login' || path === '/auth/refresh')
    return json({ accessToken: 'fixture-access', refreshToken: 'fixture-refresh', expiresIn: 180 })
  if (path === '/auth/me')
    return json({
      id: 12,
      displayName: 'QA fixture',
      permissions: ['files:read', 'refiners:read'],
      clearance: { granted: false },
    })
  if (path === '/files')
    return json({ content: [file], page: 0, size: 10, totalPages: 1, totalElements: 1 })
  if (path === '/departments') return json([refiner.department])
  if (path === '/refiners')
    return json({ content: [refiner], page: 0, size: 10, totalPages: 1, totalElements: 1 })
  return json({ error: 'CLEARANCE_REQUIRED', message: 'Fixture denied' }, 403)
})
const browser = await puppeteer.connect({ browserURL: 'http://127.0.0.1:9223' })
const target = (await browser.pages())[0]
const flow = await startFlow(target, {
  name: 'QA final: build local con fixtures explícitos',
  flags: { onlyCategories: ['accessibility'] },
})
const results = []
try {
  for (const route of ['login', 'files', 'refiners']) {
    await page.goto(origin + '/' + route)
    if (route === 'login') await page.getByRole('button', { name: 'Ingresar al piso' }).waitFor()
    if (route === 'files') {
      await page.getByLabel('Correo electrónico').fill('fixture@example.test')
      await page.getByLabel('Contraseña').fill('fixture-password')
      await page.getByRole('button', { name: 'Ingresar al piso' }).click()
      await page.getByRole('heading', { name: 'Archivos de macrodatos' }).waitFor()
    }
    if (route === 'refiners')
      await page.getByRole('heading', { name: 'Directorio de refinadores' }).waitFor()
    if (new URL(page.url()).pathname !== '/' + route)
      throw Error('Unexpected redirect ' + page.url())
    await flow.snapshot({ name: '/' + route + ' (fixture session)' })
    const { steps } = await flow.createFlowResult()
    const lhr = steps.at(-1).lhr
    const failed = lhr.categories.accessibility.auditRefs
      .map(({ id }) => lhr.audits[id])
      .filter((a) => a.score !== null && a.score < 1)
      .map((a) => ({ id: a.id, title: a.title, details: a.details }))
    results.push({
      route,
      url: page.url(),
      heading: await page.locator('h1').innerText(),
      lighthouseVersion: lhr.lighthouseVersion,
      mode: 'snapshot',
      session: 'fixture (no backend account)',
      score: lhr.categories.accessibility.score * 100,
      labelContentNameMismatch: lhr.audits['label-content-name-mismatch'].score,
      failed,
    })
  }
  await mkdir('docs/qa', { recursive: true })
  await writeFile('docs/qa/lighthouse-local.json', JSON.stringify(results, null, 2))
  await writeFile(join(tmpdir(), 'lumon-qa-lighthouse.html'), await flow.generateReport())
  if (results.some((r) => r.score < 90)) process.exitCode = 1
  console.log(JSON.stringify(results, null, 2))
} finally {
  await browser.disconnect()
  await context.close()
  await rm(profile, { recursive: true, force: true })
}
