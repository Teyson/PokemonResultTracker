export class ApiError extends Error {}

export async function api<T = unknown>(path: string, opts: RequestInit = {}): Promise<T | null> {
  const r = await fetch(path, {
    headers: { 'Content-Type': 'application/json' },
    ...opts
  });
  if (!r.ok) {
    let message = '';
    try {
      const body = await r.json();
      message = body?.error ?? '';
    } catch {
      // ignore — not JSON
    }
    throw new ApiError(message || `Request failed (${r.status})`);
  }
  return r.status === 204 ? null : ((await r.json()) as T);
}
