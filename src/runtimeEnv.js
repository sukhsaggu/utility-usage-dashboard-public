/** Public GET /api/environment — works before login. */
export async function fetchRuntimeEnv(apiBase) {
  const base = (apiBase || '/gas-dashboard/').replace(/\/$/, '')
  try {
    const res = await fetch(`${base}/api/environment`, { credentials: 'include' })
    if (!res.ok) return null
    const data = await res.json()
    const e = typeof data?.environment === 'string' ? data.environment.trim().toLowerCase() : ''
    const v = typeof data?.version === 'string' ? data.version.trim() : ''
    if (!e) return null
    return { environment: e, version: v || null }
  } catch {
    return null
  }
}
