import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import session from 'express-session'
import connectPgSimple from 'connect-pg-simple'
import pg from 'pg'

const { Pool } = pg
const dataPath = path.join(path.dirname(fileURLToPath(import.meta.url)), 'data', 'users.json')
const postsPath = path.join(path.dirname(fileURLToPath(import.meta.url)), 'data', 'posts.json')
const messagesPath = path.join(path.dirname(fileURLToPath(import.meta.url)), 'data', 'messages.json')
const pool = process.env.DATABASE_URL ? new Pool({ connectionString: process.env.DATABASE_URL, ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : undefined }) : null

export async function initializeStore() {
  if (pool) {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS users (
        id TEXT PRIMARY KEY,
        username TEXT NOT NULL,
        username_normalized TEXT NOT NULL UNIQUE,
        display_name TEXT NOT NULL,
        password_hash TEXT NOT NULL,
        profile_image TEXT,
        created_at TIMESTAMPTZ NOT NULL
      )
    `)
    await pool.query(`
      CREATE TABLE IF NOT EXISTS posts (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        body TEXT NOT NULL,
        created_at TIMESTAMPTZ NOT NULL
      )
    `)
    await pool.query(`
      CREATE TABLE IF NOT EXISTS messages (
        id TEXT PRIMARY KEY,
        sender_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        recipient_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        body TEXT,
        video_url TEXT,
        media_type TEXT,
        created_at TIMESTAMPTZ NOT NULL,
        CHECK (body IS NOT NULL OR video_url IS NOT NULL)
      )
    `)
    await pool.query('ALTER TABLE messages ADD COLUMN IF NOT EXISTS media_type TEXT')
  }
}

export async function findUserById(id) {
  if (pool) {
    const { rows } = await pool.query('SELECT * FROM users WHERE id = $1', [id])
    return rows[0] ? fromDatabase(rows[0]) : null
  }
  return (await readUsers()).find((user) => user.id === id) || null
}

export async function findUserByUsername(usernameNormalized) {
  if (pool) {
    const { rows } = await pool.query('SELECT * FROM users WHERE username_normalized = $1', [usernameNormalized])
    return rows[0] ? fromDatabase(rows[0]) : null
  }
  return (await readUsers()).find((user) => user.usernameNormalized === usernameNormalized) || null
}

export async function searchUsers(query, currentUserId) {
  const normalizedQuery = query.trim().toLowerCase()
  if (pool) {
    const { rows } = await pool.query(
      `SELECT * FROM users
       WHERE id <> $1 AND (username_normalized LIKE $2 OR LOWER(display_name) LIKE $2)
       ORDER BY display_name LIMIT 20`,
      [currentUserId, `%${normalizedQuery}%`],
    )
    return rows.map(publicPostUser)
  }
  return (await readUsers())
    .filter((user) => user.id !== currentUserId && (user.usernameNormalized.includes(normalizedQuery) || user.displayName.toLowerCase().includes(normalizedQuery)))
    .slice(0, 20)
    .map(publicPostUser)
}

export async function createUser(user) {
  if (pool) {
    await pool.query(
      `INSERT INTO users (id, username, username_normalized, display_name, password_hash, profile_image, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [user.id, user.username, user.usernameNormalized, user.displayName, user.passwordHash, user.profileImage, user.createdAt],
    )
    return user
  }
  const users = await readUsers()
  users.push(user)
  await writeUsers(users)
  return user
}

export async function listPosts() {
  if (pool) {
    const { rows } = await pool.query(`
      SELECT posts.*, users.username, users.display_name, users.profile_image
      FROM posts JOIN users ON users.id = posts.user_id
      ORDER BY posts.created_at DESC
    `)
    return rows.map(fromDatabasePost)
  }
  const [posts, users] = await Promise.all([readPosts(), readUsers()])
  const usersById = new Map(users.map((user) => [user.id, user]))
  return posts
    .map((post) => ({ ...post, user: usersById.get(post.userId) }))
    .filter((post) => post.user)
    .sort((left, right) => new Date(right.createdAt) - new Date(left.createdAt))
    .map((post) => ({
      id: post.id,
      body: post.body,
      createdAt: post.createdAt,
      user: publicPostUser(post.user),
    }))
}

export async function createPost(post) {
  if (pool) {
    await pool.query(
      'INSERT INTO posts (id, user_id, body, created_at) VALUES ($1, $2, $3, $4)',
      [post.id, post.userId, post.body, post.createdAt],
    )
    return post
  }
  const posts = await readPosts()
  posts.push(post)
  await writePosts(posts)
  return post
}

export async function deletePost(id, userId) {
  if (pool) {
    const result = await pool.query('DELETE FROM posts WHERE id = $1 AND user_id = $2', [id, userId])
    return result.rowCount > 0
  }
  const posts = await readPosts()
  const remaining = posts.filter((post) => !(post.id === id && post.userId === userId))
  if (remaining.length === posts.length) return false
  await writePosts(remaining)
  return true
}

export async function listMessages(userId, otherUserId) {
  if (pool) {
    const { rows } = await pool.query(
      `SELECT messages.*, sender.username AS sender_username, sender.display_name AS sender_display_name,
       recipient.username AS recipient_username, recipient.display_name AS recipient_display_name
       FROM messages JOIN users sender ON sender.id = messages.sender_id
       JOIN users recipient ON recipient.id = messages.recipient_id
       WHERE (sender_id = $1 AND recipient_id = $2) OR (sender_id = $2 AND recipient_id = $1)
       ORDER BY created_at`,
      [userId, otherUserId],
    )
    return rows.map(fromDatabaseMessage)
  }
  return (await readMessages())
    .filter((message) => (message.senderId === userId && message.recipientId === otherUserId) || (message.senderId === otherUserId && message.recipientId === userId))
    .sort((left, right) => new Date(left.createdAt) - new Date(right.createdAt))
}

export async function createMessage(message) {
  if (pool) {
    await pool.query(
      'INSERT INTO messages (id, sender_id, recipient_id, body, video_url, media_type, created_at) VALUES ($1, $2, $3, $4, $5, $6, $7)',
      [message.id, message.senderId, message.recipientId, message.body, message.mediaUrl, message.mediaType, message.createdAt],
    )
    return message
  }
  const messages = await readMessages()
  messages.push(message)
  await writeMessages(messages)
  return message
}

async function readUsers() {
  try { return JSON.parse(await fs.readFile(dataPath, 'utf8')) } catch { return [] }
}

async function writeUsers(users) {
  await fs.mkdir(path.dirname(dataPath), { recursive: true })
  await fs.writeFile(dataPath, JSON.stringify(users, null, 2))
}

async function readPosts() {
  try { return JSON.parse(await fs.readFile(postsPath, 'utf8')) } catch { return [] }
}

async function writePosts(posts) {
  await fs.mkdir(path.dirname(postsPath), { recursive: true })
  await fs.writeFile(postsPath, JSON.stringify(posts, null, 2))
}

async function readMessages() {
  try { return JSON.parse(await fs.readFile(messagesPath, 'utf8')) } catch { return [] }
}

async function writeMessages(messages) {
  await fs.mkdir(path.dirname(messagesPath), { recursive: true })
  await fs.writeFile(messagesPath, JSON.stringify(messages, null, 2))
}

function publicPostUser(user) {
  return { id: user.id, username: user.username, displayName: user.displayName, profileImage: user.profileImage || null }
}

function fromDatabasePost(row) {
  return {
    id: row.id,
    body: row.body,
    createdAt: row.created_at,
    user: { id: row.user_id, username: row.username, displayName: row.display_name, profileImage: row.profile_image || null },
  }
}

function fromDatabaseMessage(row) {
  return {
    id: row.id,
    senderId: row.sender_id,
    recipientId: row.recipient_id,
    body: row.body,
    mediaUrl: row.video_url,
    mediaType: row.media_type || (row.video_url ? 'video/mp4' : null),
    createdAt: row.created_at,
    sender: { username: row.sender_username, displayName: row.sender_display_name },
    recipient: { username: row.recipient_username, displayName: row.recipient_display_name },
  }
}

function fromDatabase(row) {
  return {
    id: row.id,
    username: row.username,
    usernameNormalized: row.username_normalized,
    displayName: row.display_name,
    passwordHash: row.password_hash,
    profileImage: row.profile_image,
    createdAt: row.created_at,
  }
}

const PgSession = connectPgSimple(session)
export const sessionStore = pool ? new PgSession({ pool, createTableIfMissing: true }) : undefined

export const usingDatabase = Boolean(pool)
