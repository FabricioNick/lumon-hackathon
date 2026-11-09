import { execFileSync } from 'node:child_process'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { defineConfig, loadEnv } from 'vite'

export default defineConfig(({ mode, command }) => {
  const env = loadEnv(mode, process.cwd(), '')
  const build = command === 'serve' ? 'dev' : (env.VITE_BUILD_SHA || execFileSync('git', ['rev-parse', '--short=7', 'HEAD'], { encoding: 'utf8' }).trim())
  if (command === 'build' && !/^[a-f0-9]{7}$/.test(build)) throw new Error('VITE_BUILD_SHA debe ser el SHA de 7 caracteres del commit.')
  return { plugins: [react(), tailwindcss()], define: { 'import.meta.env.VITE_BUILD_SHA': JSON.stringify(build) } }
})
