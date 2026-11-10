import { rememberRefiner } from './refinerVersions'
import type { Cp45Runtime } from '../../cp45/context'
import { jsonResponse } from '../../cp45/http'
import type { Department, Refiner, RefinerPage, RefinerPatch } from '../types/refiners'
export type RefinerSnapshot = { refiner: Refiner; etag: string | null }
export function refinersApi(request: Cp45Runtime['request']) {
  return {
    departments: async (signal?: AbortSignal) =>
      jsonResponse<Department[]>(await request('/departments', { signal })),
    list: async (params: URLSearchParams, signal?: AbortSignal) => {
      const page = await jsonResponse<RefinerPage>(await request(`/refiners?${params}`, { signal }))
      return {
        ...page,
        content: page.content.map((refiner) => rememberRefiner(request, refiner)),
      }
    },
    get: async (id: string, signal?: AbortSignal): Promise<RefinerSnapshot> => {
      const response = await request(`/refiners/${encodeURIComponent(id)}`, {
        signal,
      })
      const received = await jsonResponse<Refiner>(response)
      const newest = rememberRefiner(request, received)
      return {
        refiner: newest,
        etag: newest.version === received.version ? response.headers.get('ETag') : null,
      }
    },
    patch: async (id: string, patch: RefinerPatch, etag: string): Promise<RefinerSnapshot> => {
      if (!etag || etag === '*') throw new Error('Se necesita el ETag exacto antes de guardar.')
      const response = await request(`/refiners/${encodeURIComponent(id)}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', 'If-Match': etag },
        body: JSON.stringify(patch),
      })
      const received = await jsonResponse<Refiner>(response)
      const newest = rememberRefiner(request, received)
      return {
        refiner: newest,
        etag: newest.version === received.version ? response.headers.get('ETag') : null,
      }
    },
  }
}
