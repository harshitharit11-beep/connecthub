import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import session from 'express-session'
import connectPgSimple from 'connect-pg-simple'
import pg from 'pg'

const { Pool } = pg
const dataPath = path.join(path.dirname(fileURLToPath(import.meta.url)), 'data', 'users.json')
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

async function readUsers() {
  try { return JSON.parse(await fs.readFile(dataPath, 'utf8')) } catch { return [] }
}

async function writeUsers(users) {
  await fs.mkdir(path.dirname(dataPath), { recursive: true })
  await fs.writeFile(dataPath, JSON.stringify(users, null, 2))
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
