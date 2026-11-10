import { z } from 'zod'
import { rawRequest, request } from '../lib/http'
export { ApiError } from '../lib/http'
export interface ApiOptions extends Omit<RequestInit, 'body'> {
  body?: unknown
  auth?: boolean
  retry?: boolean
}
export async function apiResponse(path: string, init: RequestInit = {}): Promise<Response> {
  return rawRequest(path, {
    method: init.method,
    headers: init.headers,
    body: init.body ?? undefined,
    signal: init.signal ?? undefined,
  })
}
export async function apiRequest<T>(path: string, options: ApiOptions = {}): Promise<T> {
  return (await request(path, z.unknown(), {
    method: options.method,
    body: options.body,
    headers: options.headers,
    signal: options.signal ?? undefined,
    public: options.auth === false,
    retry: options.retry,
  })) as T
}
export const apiClient = apiRequest
