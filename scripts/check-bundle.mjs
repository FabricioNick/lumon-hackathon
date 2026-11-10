import { readFileSync } from 'node:fs'
import { gzipSync } from 'node:zlib'

const manifest = JSON.parse(readFileSync('dist/.vite/manifest.json', 'utf8'))
const files = new Set()
function visit(key) {
  const chunk = manifest[key]
  if (!chunk) throw new Error(`Missing manifest entry: ${key}`)
  if (files.has(chunk.file)) return
  files.add(chunk.file)
  for (const dependency of chunk.imports ?? []) visit(dependency)
}
const entries = Object.keys(manifest).filter((key) => manifest[key].isEntry)
if (!entries.length) throw new Error('No initial JavaScript entry found')
entries.forEach(visit)
let total = 0
for (const file of files) {
  if (!file.endsWith('.js')) continue
  const size = gzipSync(readFileSync(`dist/${file}`)).length
  total += size
  console.log(`${file}: ${size} bytes gzip`)
}
console.log(`Initial JavaScript (including static imports): ${total} bytes gzip`)
if (total > 180 * 1024) process.exit(1)
