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
  // A reply that is not Zentra's JSON (the host's own error page: a crash, a timeout) is still a
  // server error, never mistaken for a wallet or network failure
  const result = await response.json().catch(() => null)
  if (!result)
    throw new RequestError(response.status === 504 ? 'timeout' : 'serverError', response.status)
  if (!response.ok)
    throw new RequestError(result.error, response.status)
  return result
}
export function errorText(error) {
  const key = error instanceof RequestError ? error.code : error instanceof DOMException && error.name === 'AbortError' ? 'cancelled' : 'network'
  return site.agents.errors[key] || site.agents.errors.serverError
}
