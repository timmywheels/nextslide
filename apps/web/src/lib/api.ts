import type { CreateSessionResponse, SessionStatusResponse } from '@nextslide/types'

const API_BASE = import.meta.env.VITE_API_URL ?? ''

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const headers: Record<string, string> = options?.body
    ? { 'Content-Type': 'application/json' }
    : {}
  const res = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers,
  })
  if (!res.ok) {
    const text = await res.text().catch(() => res.statusText)
    throw new Error(`HTTP ${res.status}: ${text}`)
  }
  // DELETE returns 204 No Content
  if (res.status === 204) return undefined as unknown as T
  return res.json() as Promise<T>
}

export async function createSession(): Promise<CreateSessionResponse> {
  return request<CreateSessionResponse>('/api/sessions', { method: 'POST' })
}

export async function getSession(code: string): Promise<SessionStatusResponse> {
  return request<SessionStatusResponse>(`/api/sessions/${code}`)
}

export async function deleteSession(code: string): Promise<void> {
  return request<void>(`/api/sessions/${code}`, { method: 'DELETE' })
}
