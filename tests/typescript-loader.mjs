import { stripTypeScriptTypes } from 'node:module'
import { readFile } from 'node:fs/promises'
export async function resolve(specifier, context, nextResolve) {
  if (specifier.startsWith('.') && context.parentURL?.includes('/src/') && !/\.[a-z]+$/.test(specifier)) {
    for (const suffix of ['.ts','.tsx']) {
      try { return await nextResolve(specifier + suffix, context) } catch {}
    }
  }
  return nextResolve(specifier, context)
}
export async function load(url, context, nextLoad) {
  if (/\.tsx?$/.test(url)) {
    const source = await readFile(new URL(url), 'utf8')
    return { format: 'module', shortCircuit: true, source: stripTypeScriptTypes(source, { mode: 'strip' }) }
  }
  return nextLoad(url, context)
}
