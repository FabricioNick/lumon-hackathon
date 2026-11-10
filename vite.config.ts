import { execFileSync } from 'node:child_process'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { defineConfig, loadEnv } from 'vite'
export default defineConfig(({ mode, command }) => {
  const env = loadEnv(mode, process.cwd(), '')
  const build = command === 'serve' ? 'dev' : (env.VITE_BUILD_SHA || env.VERCEL_GIT_COMMIT_SHA?.slice(0, 7) || env.GITHUB_SHA?.slice(0, 7) || execFileSync('git', ['rev-parse', '--short=7', 'HEAD'], { encoding: 'utf8' }).trim())
  if (command === 'build' && !/^[a-f0-9]{7}$/.test(build)) throw new Error('Build SHA inválido')
  return { plugins: [react(), tailwindcss()], define: { __LUMON_BUILD__: JSON.stringify(build), 'import.meta.env.VITE_BUILD_SHA': JSON.stringify(build) } }
})
