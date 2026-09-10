import 'dotenv/config'
import bcrypt from 'bcryptjs'
import cors from 'cors'
import express from 'express'
import session from 'express-session'
import multer from 'multer'
import { randomUUID } from 'node:crypto'
import { v2 as cloudinary } from 'cloudinary'
import streamifier from 'streamifier'
import { addFriend, createMessage, createPost, createUser, deletePost, findUserById, findUserByUsername, initializeStore, listFriends, listMessages, listPosts, searchUsers, sessionStore, usingDatabase } from './store.js'

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
const mediaUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 50 * 1024 * 1024 },
  fileFilter: (_req, file, callback) => callback(['video/mp4', 'image/png', 'image/jpeg', 'image/jpg'].includes(file.mimetype) ? null : new Error('File type is not supported.'), false),
})
cloudinary.config({ cloud_name: process.env.CLOUDINARY_CLOUD_NAME, api_key: process.env.CLOUDINARY_API_KEY, api_secret: process.env.CLOUDINARY_API_SECRET })

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

async function authenticatedUser(req) {
  if (!req.session.userId) return null
  return findUserById(req.session.userId)
}

async function requireAuth(req, res, next) {
  try {
    const user = await authenticatedUser(req)
    if (!user) return res.status(401).json({ error: 'Not authenticated' })
    req.authenticatedUser = user
    next()
  } catch (error) { next(error) }
}

app.get('/api/health', (_req, res) => res.json({ status: 'ok' }))

app.get('/api/render-test', (_req, res) => {
  res.json({
    status: 'working',
    message: 'Render is running the latest ConnectHub code'
  })
})

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

app.get('/api/posts', async (_req, res, next) => {
  try { res.json({ posts: await listPosts() }) } catch (error) { next(error) }
})

app.post('/api/posts', async (req, res, next) => {
  try {
    const user = await authenticatedUser(req)
    if (!user) return res.status(401).json({ error: 'Not authenticated' })
    const body = String(req.body.body || '').trim()
    if (!body) return res.status(400).json({ error: 'Write something before posting.' })
    if (body.length > 500) return res.status(400).json({ error: 'Posts must be 500 characters or fewer.' })
    const post = { id: randomUUID(), userId: user.id, body, createdAt: new Date().toISOString() }
    await createPost(post)
    res.status(201).json({ post: { ...post, user: publicUser(user) } })
  } catch (error) { next(error) }
})

app.delete('/api/posts/:id', async (req, res, next) => {
  try {
    const user = await authenticatedUser(req)
    if (!user) return res.status(401).json({ error: 'Not authenticated' })
    const removed = await deletePost(req.params.id, user.id)
    if (!removed) return res.status(404).json({ error: 'Post not found.' })
    res.status(204).end()
  } catch (error) { next(error) }
})

app.get('/api/users/search', async (req, res, next) => {
  try {
    const user = await authenticatedUser(req)
    if (!user) return res.status(401).json({ error: 'Not authenticated' })
    const query = String(req.query.q || '').trim()
    if (query.length < 2) return res.json({ users: [] })
    res.json({ users: await searchUsers(query, user.id) })
  } catch (error) { next(error) }
})

app.get('/api/friends', async (req, res, next) => {
  try {
    const user = await authenticatedUser(req)
    if (!user) return res.status(401).json({ error: 'Not authenticated' })
    res.json({ friends: await listFriends(user.id) })
  } catch (error) { next(error) }
})

app.post('/api/friends/:userId', async (req, res, next) => {
  try {
    const user = await authenticatedUser(req)
    if (!user) return res.status(401).json({ error: 'Not authenticated' })
    if (user.id === req.params.userId) return res.status(400).json({ error: 'You cannot add yourself.' })
    const friend = await findUserById(req.params.userId)
    if (!friend) return res.status(404).json({ error: 'User not found.' })
    await addFriend(user.id, friend.id)
    res.status(201).json({ friend: publicUser(friend) })
  } catch (error) { next(error) }
})

app.post('/api/media/upload', requireAuth, mediaUpload.single('media'), async (req, res, next) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'No media file selected.' })
    if (!process.env.CLOUDINARY_CLOUD_NAME || !process.env.CLOUDINARY_API_KEY || !process.env.CLOUDINARY_API_SECRET) return res.status(503).json({ error: 'Media storage is not configured on the server.' })
    const resourceType = req.file.mimetype.startsWith('video/') ? 'video' : 'image'
    const result = await new Promise((resolve, reject) => {
      const uploadStream = cloudinary.uploader.upload_stream({ resource_type: resourceType, folder: 'connecthub/media' }, (error, value) => error ? reject(error) : resolve(value))
      streamifier.createReadStream(req.file.buffer).pipe(uploadStream)
    })
    res.json({ success: true, url: result.secure_url, publicId: result.public_id, type: resourceType, mimeType: req.file.mimetype, originalName: req.file.originalname, size: req.file.size })
  } catch (error) {
    console.error('Media upload error:', error)
    next(error)
  }
})

app.get('/api/messages/:userId', async (req, res, next) => {
  try {
    const user = await authenticatedUser(req)
    if (!user) return res.status(401).json({ error: 'Not authenticated' })
    if (!await findUserById(req.params.userId)) return res.status(404).json({ error: 'Friend not found.' })
    res.json({ messages: await listMessages(user.id, req.params.userId) })
  } catch (error) { next(error) }
})

app.post('/api/messages/:userId', async (req, res, next) => {
  try {
    const user = await authenticatedUser(req)
    if (!user) return res.status(401).json({ error: 'Not authenticated' })
    const recipient = await findUserById(req.params.userId)
    if (!recipient) return res.status(404).json({ error: 'Friend not found.' })
    const body = String(req.body.body || '').trim()
    const mediaUrl = typeof req.body.mediaUrl === 'string' ? req.body.mediaUrl.trim() : ''
    const mediaType = typeof req.body.mediaType === 'string' ? req.body.mediaType : null
    const fileName = typeof req.body.fileName === 'string' ? req.body.fileName : null
    if (!body && !mediaUrl) return res.status(400).json({ error: 'Write a message or attach a JPG, PNG, or MP4 file.' })
    if (mediaUrl && !['image', 'video'].includes(req.body.type)) return res.status(400).json({ error: 'A valid media type is required.' })
    const message = {
      id: randomUUID(), senderId: user.id, recipientId: recipient.id, body: body || null,
      mediaUrl: mediaUrl || null, mediaType, fileName, type: req.body.type || 'text', createdAt: new Date().toISOString(),
    }
    await createMessage(message)
    res.status(201).json({ message })
  } catch (error) {
    next(error)
  }
})

app.use((error, _req, res, _next) => {
  console.error(error)
  if (error instanceof multer.MulterError && error.code === 'LIMIT_FILE_SIZE') return res.status(413).json({ error: 'File is too large. Maximum size is 50 MB.' })
  if (error.message === 'File type is not supported.') return res.status(400).json({ error: 'Only JPG, PNG and MP4 files are supported.' })
  res.status(500).json({ error: 'Internal server error.' })
})

await initializeStore()
app.listen(port, '0.0.0.0', () => console.log(`ConnectHub API listening on port ${port} (${usingDatabase ? 'PostgreSQL' : 'JSON fallback'})`))
