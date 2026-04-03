import { useState, useEffect, useCallback } from 'react'
import App from './App.jsx'
import LoginPage from './LoginPage.jsx'

const API_BASE = (typeof import.meta !== 'undefined' && import.meta.env?.BASE_URL) || '/gas-dashboard/'

async function fetchSession() {
  const base = API_BASE.replace(/\/$/, '')
  try {
    const res = await fetch(`${base}/api/session`, { credentials: 'include' })
    // Vite dev / preview: no Express API on this origin → 404. Treat as "auth off" like the server when DASHBOARD_USER is unset.
    if (res.status === 404) {
      return { authenticated: true, authDisabled: true }
    }
    if (!res.ok) return { authenticated: false, authDisabled: false }
    return await res.json()
  } catch {
    // Network / CORS / bad JSON — no usable session API; same as local-only dev.
    return { authenticated: true, authDisabled: true }
  }
}

export default function AuthShell() {
  const [status, setStatus] = useState('checking')

  const refresh = useCallback(() => {
    setStatus('checking')
    fetchSession()
      .then((data) => {
        if (data.authDisabled) setStatus('authed')
        else if (data.authenticated) setStatus('authed')
        else setStatus('anon')
      })
      .catch(() => setStatus('anon'))
  }, [])

  useEffect(() => {
    refresh()
  }, [refresh])

  const handleLoggedIn = useCallback(() => {
    setStatus('authed')
  }, [])

  const handleLogout = useCallback(async () => {
    const base = API_BASE.replace(/\/$/, '')
    try {
      await fetch(`${base}/api/logout`, { method: 'POST', credentials: 'include' })
    } catch {
      // ignore
    }
    setStatus('anon')
  }, [])

  if (status === 'checking') {
    return (
      <div
        style={{
          minHeight: '100vh',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontFamily: 'system-ui, sans-serif',
          color: '#6b7280',
          fontSize: 14,
        }}
      >
        Loading…
      </div>
    )
  }

  if (status === 'anon') {
    return <LoginPage onLoggedIn={handleLoggedIn} />
  }

  return <App onLogout={handleLogout} />
}
