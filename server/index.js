import 'dotenv/config'
import bcrypt from 'bcryptjs'
import cors from 'cors'
import express from 'express'
import session from 'express-session'
import { randomUUID } from 'node:crypto'
import { createUser, findUserById, findUserByUsername, initializeStore, sessionStore, usingDatabase } from './store.js'

const app = express()
const port = Number(process.env.PORT || 3001)
const isProduction = process.env.NODE_ENV === 'production'
const configuredOrigins = (process.env.FRONTEND_URL || process.env.CLIENT_ORIGIN || '')
  .split(',')
  .map((origin) => origin.trim())
  .filter(Boolean)
const allowedOrigins = [...new Set([
  'http://localhost:5173',
  'https://connecthub-08.netlify.app',
  ...configuredOrigins,
])]

app.set('trust proxy', 1)
app.use(cors({ origin: allowedOrigins, credentials: true }))
app.use(express.json({ limit: '1mb' }))
app.use(session({
  name: 'connecthub.sid',
  secret: process.env.SESSION_SECRET || 'connecthub-local-development-secret',
  resave: false,
  saveUninitialized: false,
  store: sessionStore,
  cookie: {
    httpOnly: true,
    sameSite: isProduction ? 'none' : 'lax',
    secure: isProduction,
    maxAge: 1000 * 60 * 60 * 24 * 7,
  },
}))

function publicUser(user) {
  return { id: user.id, username: user.username, displayName: user.displayName, profileImage: user.profileImage || null }
}

function validUsername(username) {
  return /^[a-zA-Z0-9_]{3,20}$/.test(username)
}

app.get('/api/health', (_req, res) => res.json({ status: 'ok' }))

app.get('/api/auth/me', async (req, res, next) => {
  try {
    if (!req.session.userId) return res.status(401).json({ error: 'Not authenticated' })
    const user = await findUserById(req.session.userId)
    if (!user) return res.status(401).json({ error: 'Not authenticated' })
    res.json({ user: publicUser(user) })
  } catch (error) { next(error) }
})

app.post('/api/auth/signup', async (req, res, next) => {
  try {
    const { displayName, username, password, confirmPassword, profileImage } = req.body
    const rawUsername = String(username || '').trim()
    const normalized = rawUsername.toLowerCase()
    if (!displayName?.trim()) return res.status(400).json({ error: 'Display name is required.' })
    if (!validUsername(rawUsername)) return res.status(400).json({ error: 'Username must be 3–20 characters using letters, numbers, or underscores.' })
    if (password !== confirmPassword) return res.status(400).json({ error: 'Passwords do not match.' })
    if (typeof password !== 'string' || password.length < 8) return res.status(400).json({ error: 'Password must be at least 8 characters.' })
    if (await findUserByUsername(normalized)) return res.status(409).json({ error: 'Username already exists.' })
    const user = {
      id: randomUUID(),
      username: rawUsername,
      usernameNormalized: normalized,
      displayName: displayName.trim(),
      passwordHash: await bcrypt.hash(password, 12),
      profileImage: profileImage || null,
      createdAt: new Date().toISOString(),
    }
    await createUser(user)
    req.session.userId = user.id
    res.status(201).json({ user: publicUser(user) })
  } catch (error) { next(error) }
})

app.post('/api/auth/login', async (req, res, next) => {
  try {
    const normalized = String(req.body.username || '').trim().toLowerCase()
    const user = await findUserByUsername(normalized)
    if (!user || !(await bcrypt.compare(String(req.body.password || ''), user.passwordHash))) return res.status(401).json({ error: 'Incorrect username or password.' })
    req.session.userId = user.id
    res.json({ user: publicUser(user) })
  } catch (error) { next(error) }
})

app.post('/api/auth/logout', (req, res, next) => {
  req.session.destroy((error) => error ? next(error) : res.status(204).end())
})

app.use((error, _req, res, _next) => {
  console.error(error)
  res.status(500).json({ error: 'Internal server error.' })
})

await initializeStore()
app.listen(port, '0.0.0.0', () => console.log(`ConnectHub API listening on port ${port} (${usingDatabase ? 'PostgreSQL' : 'JSON fallback'})`))
