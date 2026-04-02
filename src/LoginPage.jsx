import { useState, useEffect } from 'react'
import { fetchRuntimeEnv } from './runtimeEnv.js'
import RuntimeEnvBadge from './RuntimeEnvBadge.jsx'

const API_BASE = (typeof import.meta !== 'undefined' && import.meta.env?.BASE_URL) || '/gas-dashboard/'

const C = {
  text: '#111827',
  muted: '#6b7280',
  border: '#e5e7eb',
  card: '#fff',
  accent: '#2563eb',
}

export default function LoginPage({ onLoggedIn }) {
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [runtime, setRuntime] = useState(null)

  useEffect(() => {
    let cancelled = false
    fetchRuntimeEnv(API_BASE).then((info) => {
      if (!cancelled) setRuntime(info)
    })
    return () => { cancelled = true }
  }, [])

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')
    setBusy(true)
    try {
      const base = API_BASE.replace(/\/$/, '')
      const res = await fetch(`${base}/api/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ username: username.trim(), password: password.trim() }),
      })
      const ct = res.headers.get('content-type') || ''
      const data = ct.includes('application/json') ? await res.json().catch(() => ({})) : {}
      if (res.ok && (data.ok || data.skipped)) {
        onLoggedIn()
        return
      }
      if (!ct.includes('application/json') && !res.ok) {
        setError(`Sign-in failed (HTTP ${res.status}). Open a URL that ends with /gas-dashboard/`)
        return
      }
      setError(data.error || 'Invalid username or password')
    } catch {
      setError('Could not reach server')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div
      style={{
        minHeight: '100vh',
        background: '#f9fafb',
        fontFamily: 'system-ui, sans-serif',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 24,
      }}
    >
      <div
        style={{
          width: '100%',
          maxWidth: 380,
          background: C.card,
          borderRadius: 16,
          border: `1px solid ${C.border}`,
          boxShadow: '0 4px 24px rgba(0,0,0,0.06)',
          padding: '32px 28px',
        }}
      >
        <div
          style={{
            display: 'flex',
            flexWrap: 'wrap',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 10,
            marginBottom: 14,
          }}
        >
          <div style={{ fontSize: 11, color: C.muted, fontWeight: 600 }}>Environment</div>
          <RuntimeEnvBadge env={runtime?.environment} version={runtime?.version} />
        </div>
        <div style={{ fontSize: 22, fontWeight: 800, color: C.text, marginBottom: 6 }}>Utility dashboard</div>
        <div style={{ fontSize: 13, color: C.muted, marginBottom: 24 }}>Sign in to continue</div>
        <form onSubmit={handleSubmit}>
          <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: C.muted, marginBottom: 6 }}>
            Username
            <input
              type="text"
              name="username"
              autoComplete="username"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              disabled={busy}
              style={{
                display: 'block',
                width: '100%',
                marginTop: 6,
                padding: '10px 12px',
                fontSize: 15,
                border: `1px solid ${C.border}`,
                borderRadius: 8,
                boxSizing: 'border-box',
              }}
            />
          </label>
          <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: C.muted, marginTop: 16, marginBottom: 6 }}>
            Password
            <input
              type="password"
              name="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              disabled={busy}
              style={{
                display: 'block',
                width: '100%',
                marginTop: 6,
                padding: '10px 12px',
                fontSize: 15,
                border: `1px solid ${C.border}`,
                borderRadius: 8,
                boxSizing: 'border-box',
              }}
            />
          </label>
          {error ? (
            <div style={{ marginTop: 14, fontSize: 13, color: '#b91c1c' }}>{error}</div>
          ) : null}
          <button
            type="submit"
            disabled={busy || !username.trim() || !password}
            style={{
              marginTop: 22,
              width: '100%',
              padding: '12px 16px',
              fontSize: 15,
              fontWeight: 700,
              color: '#fff',
              background: busy ? '#93c5fd' : C.accent,
              border: 'none',
              borderRadius: 10,
              cursor: busy || !username.trim() || !password ? 'not-allowed' : 'pointer',
            }}
          >
            {busy ? 'Signing in…' : 'Sign in'}
          </button>
        </form>
      </div>
    </div>
  )
}
