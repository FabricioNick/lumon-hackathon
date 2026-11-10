import { execFileSync } from 'node:child_process'
import tailwindcss from '@tailwindcss/vite'
import { defineConfig, loadEnv } from 'vite'
export default defineConfig(({ mode, command }) => {
  const env = loadEnv(mode, process.cwd(), '')
  const build =
    command === 'serve'
      ? 'dev'
      : env.VITE_BUILD_SHA ||
        env.VERCEL_GIT_COMMIT_SHA?.slice(0, 7) ||
        env.GITHUB_SHA?.slice(0, 7) ||
        execFileSync('git', ['rev-parse', '--short=7', 'HEAD'], { encoding: 'utf8' }).trim()
  if (command === 'build' && !/^[a-f0-9]{7}$/.test(build)) throw new Error('Build SHA inválido')
  return {
    plugins: [react(), tailwindcss()],
    define: {
      __LUMON_BUILD__: JSON.stringify(build),
      'import.meta.env.VITE_BUILD_SHA': JSON.stringify(build),
    },
  }
})
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

function buildSha(command: string) {
  if (command === 'serve') return 'dev'
  const fromHost = process.env.VERCEL_GIT_COMMIT_SHA || process.env.GITHUB_SHA
  if (fromHost) return fromHost.slice(0, 7)
  try { return execFileSync('git', ['rev-parse', '--short=7', 'HEAD'], { encoding: 'utf8' }).trim() }
  catch { return 'dev' }
}

export default defineConfig(({ command }) => ({
  plugins: [react(), tailwindcss()],
  define: { __LUMON_BUILD__: JSON.stringify(buildSha(command)), 'import.meta.env.VITE_BUILD_SHA': JSON.stringify(buildSha(command)) }
}))
