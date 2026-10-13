import { site } from '@/config/site'
export class RequestError extends Error {
  code
  status
  constructor(code, status) {
    super(code)
    this.code = code
    this.status = status
  }
}
export async function api(path, method = 'GET', data, signal) {
  const response = await fetch(`/api/zentra/${path}`, {
    method, signal, cache: 'no-store', headers: data ? { 'Content-Type': 'application/json' } : undefined,
    body: data ? JSON.stringify(data) : undefined,
  })
  const result = await response.json()
  if (!response.ok)
    throw new RequestError(result.error, response.status)
  return result
}
export function errorText(error) {
  const key = error instanceof RequestError ? error.code : error instanceof DOMException && error.name === 'AbortError' ? 'cancelled' : 'network'
  return site.agents.errors[key] || site.agents.errors.serverError
}
