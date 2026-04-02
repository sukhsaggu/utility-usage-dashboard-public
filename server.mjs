/**
 * Serves the built SPA and a simple API to store dashboard data so it's shared across browsers.
 * Optional auth: set DASHBOARD_USER + DASHBOARD_PASSWORD (e.g. from K8s secret) to require login.
 * GET/POST /gas-dashboard/api/dashboard-data — JSON file in DATA_PATH (default /data/dashboard-data.json).
 * GET /gas-dashboard/api/environment — public when auth on (badge on login screen).
 * POST /gas-dashboard/api/login | /api/logout, GET /api/session — session cookie (HttpOnly, Path=/gas-dashboard).
 */
import express from 'express'
import cookieParser from 'cookie-parser'
import crypto from 'crypto'
import path from 'path'
import fs from 'fs'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const DATA_PATH = process.env.DATA_PATH || path.join(__dirname, 'data', 'dashboard-data.json')
const PORT = parseInt(process.env.PORT || '80', 10)
const BASE = '/gas-dashboard'
const COOKIE_NAME = 'dashboard_sid'
const SESSION_MAX_MS = 7 * 24 * 3600 * 1000

const DASHBOARD_USER = (process.env.DASHBOARD_USER || '').trim()
const DASHBOARD_PASSWORD = (process.env.DASHBOARD_PASSWORD || '').trim()
const AUTH_ENABLED = Boolean(DASHBOARD_USER && DASHBOARD_PASSWORD)

const sessions = new Map()

const app = express()
app.use(express.json({ limit: '10mb' }))
app.use(cookieParser())

function newSessionId() {
  return crypto.randomBytes(24).toString('hex')
}

function sessionValid(sid) {
  if (!sid || typeof sid !== 'string') return false
  const row = sessions.get(sid)
  if (!row || Date.now() > row.exp) {
    sessions.delete(sid)
    return false
  }
  return true
}

function safePasswordEq(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string') return false
  const ba = Buffer.from(a, 'utf8')
  const bb = Buffer.from(b, 'utf8')
  if (ba.length !== bb.length) return false
  return crypto.timingSafeEqual(ba, bb)
}

function ensureDataDir() {
  const dir = path.dirname(DATA_PATH)
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
}

function readData() {
  try {
    const raw = fs.readFileSync(DATA_PATH, 'utf8')
    const data = JSON.parse(raw)
    return data && typeof data === 'object' ? data : { gas: { sources: [] }, electricity: { sources: [] } }
  } catch {
    return { gas: { sources: [] }, electricity: { sources: [] } }
  }
}

function writeData(data) {
  ensureDataDir()
  fs.writeFileSync(DATA_PATH, JSON.stringify(data, null, 2), 'utf8')
}

function isPublicApiPath(p) {
  return (
    p === `${BASE}/api/login` ||
    p === `${BASE}/api/logout` ||
    p === `${BASE}/api/session` ||
    p === `${BASE}/api/environment`
  )
}

app.post(`${BASE}/api/login`, (req, res) => {
  if (!AUTH_ENABLED) {
    return res.json({ ok: true, skipped: true })
  }
  const username =
    typeof req.body?.username === 'string' ? req.body.username.trim().toLowerCase() : ''
  const password =
    typeof req.body?.password === 'string' ? req.body.password.trim() : ''
  const userOk =
    username === DASHBOARD_USER.toLowerCase() && safePasswordEq(password, DASHBOARD_PASSWORD)
  if (userOk) {
    const sid = newSessionId()
    sessions.set(sid, { exp: Date.now() + SESSION_MAX_MS })
    res.cookie(COOKIE_NAME, sid, {
      httpOnly: true,
      sameSite: 'lax',
      path: BASE,
      maxAge: SESSION_MAX_MS,
    })
    return res.json({ ok: true })
  }
  res.status(401).json({ error: 'Invalid username or password' })
})

app.post(`${BASE}/api/logout`, (req, res) => {
  const sid = req.cookies?.[COOKIE_NAME]
  if (sid) sessions.delete(sid)
  res.clearCookie(COOKIE_NAME, { path: BASE })
  res.json({ ok: true })
})

app.get(`${BASE}/api/session`, (req, res) => {
  if (!AUTH_ENABLED) {
    return res.json({ authenticated: true, authDisabled: true })
  }
  const sid = req.cookies?.[COOKIE_NAME]
  if (sessionValid(sid)) {
    return res.json({ authenticated: true, username: DASHBOARD_USER })
  }
  res.json({ authenticated: false })
})

app.use((req, res, next) => {
  if (!AUTH_ENABLED) return next()
  if (!req.path.startsWith(`${BASE}/api/`)) return next()
  if (isPublicApiPath(req.path)) return next()
  const sid = req.cookies?.[COOKIE_NAME]
  if (!sessionValid(sid)) {
    return res.status(401).json({ error: 'unauthorized' })
  }
  next()
})

app.get(`${BASE}/api/environment`, (req, res) => {
  const environment = (process.env.DEPLOY_ENV || 'local').trim().toLowerCase()
  const version = (process.env.APP_IMAGE_VERSION || '').trim()
  const body = { environment }
  if (version) body.version = version
  res.json(body)
})

app.get(`${BASE}/api/dashboard-data`, (req, res) => {
  try {
    const data = readData()
    res.json(data)
  } catch (e) {
    res.status(500).json({ error: String(e.message) })
  }
})

app.post(`${BASE}/api/dashboard-data`, (req, res) => {
  try {
    const body = req.body
    const data = {
      gas: body?.gas && typeof body.gas === 'object' ? body.gas : { sources: [] },
      electricity: body?.electricity && typeof body.electricity === 'object' ? body.electricity : { sources: [] },
    }
    writeData(data)
    res.json({ ok: true })
  } catch (e) {
    res.status(500).json({ error: String(e.message) })
  }
})

app.use(BASE, express.static(path.join(__dirname, 'dist'), { index: 'index.html' }))

app.listen(PORT, () => {
  console.log(`Listening on ${PORT}, data at ${DATA_PATH}, auth ${AUTH_ENABLED ? 'on' : 'off'}`)
})
