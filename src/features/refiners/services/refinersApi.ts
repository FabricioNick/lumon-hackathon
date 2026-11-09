import type { Cp45Runtime } from '../../cp45/runtime'
import { jsonResponse } from '../../cp45/http'
import type { Department, Refiner, RefinerPage, RefinerPatch } from '../types/refiners'
export type RefinerSnapshot = { refiner: Refiner; etag: string | null }
export function refinersApi(request: Cp45Runtime['request']) {
  return {
    departments: async (signal?: AbortSignal) => jsonResponse<Department[]>(await request('/departments', { signal })),
    list: async (params: URLSearchParams, signal?: AbortSignal) => jsonResponse<RefinerPage>(await request(`/refiners?${params}`, { signal })),
    get: async (id: string, signal?: AbortSignal): Promise<RefinerSnapshot> => {
      const response = await request(`/refiners/${encodeURIComponent(id)}`, { signal })
      return { refiner: await jsonResponse<Refiner>(response), etag: response.headers.get('ETag') }
    },
    patch: async (id: string, patch: RefinerPatch, etag: string): Promise<RefinerSnapshot> => {
      if (!etag || etag === '*') throw new Error('Se necesita el ETag exacto antes de guardar.')
      const response = await request(`/refiners/${encodeURIComponent(id)}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json', 'If-Match': etag }, body: JSON.stringify(patch) })
      return { refiner: await jsonResponse<Refiner>(response), etag: response.headers.get('ETag') }
    },
  }
}
