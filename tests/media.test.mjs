import { test } from 'node:test'
import assert from 'node:assert/strict'
import { sha256 } from '../src/features/media/imageHasher.ts'
import { dimensionsFor, validateCrop, validateImage, verifyWebP, exportWebP, processImage } from '../src/features/media/imageProcessor.ts'
test('SHA-256 hashes final bytes', async () => {
  assert.equal(await sha256(new Blob(['abc'])), 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad')
})
test('badge and incident output constraints include boundaries', () => {
  assert.deepEqual(dimensionsFor(2000,1000,'BADGE'), { width:512,height:512 })
  assert.deepEqual(dimensionsFor(2000,1000,'INCIDENT'), { width:1600,height:800 })
  assert.deepEqual(dimensionsFor(100,200,'INCIDENT'), { width:400,height:800 })
  assert.throws(() => dimensionsFor(0,1,'INCIDENT'))
  assert.throws(() => dimensionsFor(10000,10000,'INCIDENT'))
  assert.throws(() => validateCrop({x:1,y:0,size:512},512,512))
})
test('invalid, empty and oversized inputs are rejected', () => {
  for (const blob of [new Blob(['x'],{type:'image/svg+xml'}),new Blob([],{type:'image/png'}),new Blob([new Uint8Array(21*1024*1024)],{type:'image/jpeg'})]) assert.throws(() => validateImage(blob))
})
test('WebP rejects PNG fallback, overflow, malformed RIFF and metadata', async () => {
  await assert.rejects(verifyWebP(new Blob(['png'],{type:'image/png'}),120000))
  await assert.rejects(verifyWebP(new Blob(['bad'],{type:'image/webp'}),1))
  await assert.rejects(verifyWebP(new Blob(['bad'],{type:'image/webp'}),120000))
  const bytes = new Uint8Array(20); bytes.set(new TextEncoder().encode('RIFF')); new DataView(bytes.buffer).setUint32(4,12,true); bytes.set(new TextEncoder().encode('WEBPEXIF'),8)
  await assert.rejects(verifyWebP(new Blob([bytes],{type:'image/webp'}),120000),/metadatos/)
})
test('null and throwing canvas exports report errors', async () => {
  await assert.rejects(exportWebP({toBlob(callback){callback(null)}},0.8),/exportar/)
  await assert.rejects(exportWebP({toBlob(){throw new Error('security')}},0.8),/exportar/)
})
test('decoding errors do not claim success', async () => {
  globalThis.createImageBitmap = async () => { throw new Error('decode') }
  await assert.rejects(processImage(new Blob(['x'],{type:'image/jpeg'}),'BADGE'),/decodificar/)
})
