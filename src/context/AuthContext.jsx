import { createContext, useContext, useEffect, useState } from 'react'

const AuthContext = createContext(null)
function getApiBaseUrl() {
  const configuredUrl = import.meta.env.VITE_API_URL?.trim()
  if (!configuredUrl) return '/api'
  const normalizedUrl = configuredUrl.replace(/\/+$/, '')
  return normalizedUrl.endsWith('/api') ? normalizedUrl : `${normalizedUrl}/api`
}

const apiBaseUrl = getApiBaseUrl()
const api = (path, options = {}) => fetch(`${apiBaseUrl}${path}`, { ...options, credentials: 'include', headers: { Accept: 'application/json', 'Content-Type': 'application/json', ...(options.headers || {}) } })

async function readApiResponse(response) {
  const body = await response.text()
  if (!body) return {}
  try {
    return JSON.parse(body)
  } catch {
    throw new Error(response.ok
      ? 'The server returned an invalid response. Check the API deployment.'
      : `The API returned ${response.status} ${response.statusText}. Check VITE_API_URL and the backend deployment.`)
  }
}

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null)
  const [loading, setLoading] = useState(true)
  useEffect(() => {
    api('/auth/me')
      .then(async (response) => response.ok ? readApiResponse(response) : null)
      .then((data) => setUser(data?.user || null))
      .catch(() => setUser(null))
      .finally(() => setLoading(false))
  }, [])
  async function authenticate(path, details) {
    let response
    try {
      response = await api(path, { method: 'POST', body: JSON.stringify(details) })
    } catch {
      throw new Error('The server is unavailable. Start it with npm run dev:all and try again.')
    }
    const data = await readApiResponse(response)
    if (!response.ok) throw new Error(data.error || 'Authentication failed.')
    setUser(data.user)
  }
  async function login(credentials) { await authenticate('/auth/login', credentials) }
  async function signup(details) { await authenticate('/auth/signup', details) }
  async function logout() {
    try { await api('/auth/logout', { method: 'POST' }) } finally { setUser(null) }
  }
  return <AuthContext.Provider value={{ user, loading, login, signup, logout }}>{children}</AuthContext.Provider>
}
export function useAuth() { return useContext(AuthContext) }