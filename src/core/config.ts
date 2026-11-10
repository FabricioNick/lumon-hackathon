declare const __LUMON_BUILD__: string

export const BUILD = typeof __LUMON_BUILD__ !== 'undefined' ? __LUMON_BUILD__ : 'dev'
export const API_BASE_URL = import.meta.env.VITE_API_BASE_URL?.replace(/\/$/, '') ?? ''
export const WS_BASE_URL = import.meta.env.VITE_WS_BASE_URL?.replace(/\/$/, '') ?? ''

export function assertApiConfigured() {
  if (!API_BASE_URL) throw new Error('Falta VITE_API_BASE_URL en la configuración.')
}
