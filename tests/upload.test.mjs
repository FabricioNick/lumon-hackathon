import { test } from 'node:test'
import assert from 'node:assert/strict'
import { UploadTask } from '../src/features/media/uploadService.ts'
import { sha256 } from '../src/features/media/imageHasher.ts'
import { xhrUpload, uploadToStorage } from '../src/features/media/storageClient.ts'
const publicKey = 'sb_publishable_test_only'
const config = {
  provider: 'SUPABASE',
  projectUrl: 'https://test.supabase.co',
  publicKey,
}
function image() {
  // Structural fixture; real codec/dimensions are tested in Chrome, not this transport unit test.
  const data = new Uint8Array(22)
  data.set(new TextEncoder().encode('RIFF'))
  new DataView(data.buffer).setUint32(4, 14, true)
  data.set(new TextEncoder().encode('WEBPVP8 '), 8)
  new DataView(data.buffer).setUint32(16, 2, true)
  return {
    blob: new Blob([data], { type: 'image/webp' }),
    width: 512,
    height: 512,
    purpose: 'BADGE',
  }
}
function transport() {
  const uploads = []
  globalThis.XMLHttpRequest = class {
    constructor() {
      this.upload = {}
      this.headers = {}
      this.status = 200
      this.responseText = '{"Key":"uploaded"}'
    }
    open(method, url) {
      this.method = method
      this.url = url
    }
    setRequestHeader(key, value) {
      this.headers[key] = value
    }
    send(body) {
      uploads.push({ url: this.url, headers: this.headers, body })
      queueMicrotask(() => {
        if (!this.aborted) {
          this.upload.onprogress?.({
            lengthComputable: true,
            loaded: body.size,
            total: body.size,
          })
          this.onload()
        }
      })
    }
    abort() {
      this.aborted = true
      this.onabort?.()
    }
  }
  return uploads
}
function ticket(id = 'mt_test') {
  return {
    ticketId: id,
    expiresAt: new Date(Date.now() + 600000).toISOString(),
    provider: 'SUPABASE',
    objectPath: `TEAM-007/badge/${id}.webp`,
    bucket: 'lumon-media',
    constraints: {
      contentType: 'image/webp',
      width: 512,
      height: 512,
      maxBytes: 122880,
    },
  }
}
test('upload uses exact final bytes/hash, real progress callbacks and idempotent confirmation retry', async () => {
  const uploads = transport()
  const source = image()
  const calls = []
  let confirmAttempts = 0
  const request = async (path, init) => {
    calls.push({ path, body: JSON.parse(init.body) })
    if (path === '/media/tickets') return Response.json(ticket(), { status: 201 })
    confirmAttempts++
    if (confirmAttempts === 1)
      return Response.json({ error: 'SERVICE_UNAVAILABLE', message: 'Retry' }, { status: 503 })
    return Response.json(
      {
        mediaId: 30,
        url: 'https://test.supabase.co/media.webp',
        width: 512,
        height: 512,
        purpose: 'BADGE',
      },
      { status: 201 },
    )
  }
  const task = new UploadTask(source, config, request)
  const progress = []
  await assert.rejects(task.run(new AbortController().signal, (event) => progress.push(event)))
  assert.equal(uploads.length, 1)
  assert.equal(calls[0].body.sha256, await sha256(source.blob))
  assert.equal(calls[0].body.bytes, source.blob.size)
  assert.equal(uploads[0].body, source.blob)
  assert.equal(uploads[0].headers['x-upsert'], 'false')
  assert.equal(uploads[0].headers.Authorization, undefined)
  assert.ok(progress.some((event) => event.phase === 'uploading' && event.percent === 100))
  assert.ok(!progress.some((event) => event.phase === 'confirmed'))
  const media = await task.run(new AbortController().signal, (event) => progress.push(event))
  assert.equal(media.mediaId, 30)
  assert.equal(uploads.length, 1)
  assert.equal(calls.filter((call) => call.path === '/media/tickets').length, 1)
  assert.deepEqual(calls[1], calls[2])
  assert.equal(progress.at(-1).phase, 'confirmed')
})
test('expired confirmation obtains a new ticket and path on explicit retry', async () => {
  const uploads = transport()
  let tickets = 0,
    confirms = 0
  const request = async (path) => {
    if (path === '/media/tickets') return Response.json(ticket(`mt_${++tickets}`))
    if (++confirms === 1) return Response.json({ error: 'TICKET_EXPIRED' }, { status: 410 })
    return Response.json({
      mediaId: 1,
      width: 512,
      height: 512,
      purpose: 'BADGE',
    })
  }
  const task = new UploadTask(image(), config, request)
  await assert.rejects(task.run(new AbortController().signal, () => {}))
  await task.run(new AbortController().signal, () => {})
  assert.equal(tickets, 2)
  assert.equal(uploads.length, 2)
  assert.notEqual(uploads[0].url, uploads[1].url)
})
test('pre-cancelled uploads do not send, secret keys are rejected', async () => {
  const uploads = transport()
  const controller = new AbortController()
  controller.abort()
  await assert.rejects(
    xhrUpload('https://storage.test', image().blob, {}, controller.signal, () => {}),
    (e) => e.name === 'AbortError',
  )
  assert.equal(uploads.length, 0)
  await assert.rejects(
    uploadToStorage(
      ticket(),
      image().blob,
      { ...config, publicKey: 'sb_secret_forbidden' },
      new AbortController().signal,
      () => {},
    ),
    /pública/,
  )
  assert.equal(uploads.length, 0)
})
test('STORAGE_NOT_VERIFIED never uploads or claims a mediaId', async () => {
  const uploads = transport()
  const states = []
  const task = new UploadTask(image(), config, async () =>
    Response.json({ error: 'STORAGE_NOT_VERIFIED' }, { status: 424 }),
  )
  await assert.rejects(
    task.run(new AbortController().signal, (value) => states.push(value)),
    (error) => error.code === 'STORAGE_NOT_VERIFIED',
  )
  assert.equal(uploads.length, 0)
  assert.equal(states.at(-1).phase, 'error')
})
