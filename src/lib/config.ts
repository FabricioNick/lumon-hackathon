function endpoint(value: unknown, protocols: string[]): string {
  if (typeof value !== 'string' || !value) throw new Error('Configura VITE_API_BASE_URL y VITE_WS_BASE_URL en .env.')
  const url = new URL(value)
  if (!protocols.includes(url.protocol) || url.username || url.password || url.search || url.hash) throw new Error('URL de configuración inválida.')
  return value.replace(/\/+$/, '')
}
export const config = {
  get api() { return endpoint(import.meta.env.VITE_API_BASE_URL, ['http:', 'https:']) },
  get ws() { return endpoint(import.meta.env.VITE_WS_BASE_URL, ['ws:', 'wss:']) },
  build: import.meta.env.VITE_BUILD_SHA as string,
}
