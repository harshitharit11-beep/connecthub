import { useEffect, useState } from 'react'
import { useAuth } from '../context/AuthContext'

function getApiBaseUrl() {
  const configuredUrl = import.meta.env.VITE_API_URL?.trim()
  if (!configuredUrl) return '/api'
  const normalizedUrl = configuredUrl.replace(/\/+$/, '')
  return normalizedUrl.endsWith('/api') ? normalizedUrl : `${normalizedUrl}/api`
}

const apiBaseUrl = getApiBaseUrl()

async function readResponse(response) {
  const body = await response.text()
  const data = body ? JSON.parse(body) : {}
  if (!response.ok) throw new Error(data.error || 'Something went wrong.')
  return data
}

function initialsFor(name) {
  return name?.split(/\s+/).map((part) => part[0]).join('').slice(0, 2).toUpperCase() || 'U'
}

function formatTime(value) {
  const elapsed = Math.max(0, Date.now() - new Date(value).getTime())
  const minutes = Math.floor(elapsed / 60000)
  if (minutes < 1) return 'just now'
  if (minutes < 60) return `${minutes} min ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours} hr ago`
  return new Date(value).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}

export default function Home({ active = 'Home' }) {
  const { user } = useAuth()
  const [posts, setPosts] = useState([])
  const [body, setBody] = useState('')
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const initials = initialsFor(user?.displayName)

  useEffect(() => {
    if (active !== 'Home') return
    fetch(`${apiBaseUrl}/posts`, { credentials: 'include', headers: { Accept: 'application/json' } })
      .then(readResponse)
      .then((data) => setPosts(data.posts || []))
      .catch((cause) => setError(cause.message))
      .finally(() => setLoading(false))
  }, [active])

  async function submit(event) {
    event.preventDefault()
    if (!body.trim() || busy) return
    setBusy(true)
    setError('')
    try {
      const response = await fetch(`${apiBaseUrl}/posts`, { method: 'POST', credentials: 'include', headers: { Accept: 'application/json', 'Content-Type': 'application/json' }, body: JSON.stringify({ body }) })
      const data = await readResponse(response)
      setPosts((current) => [data.post, ...current])
      setBody('')
    } catch (cause) { setError(cause.message) } finally { setBusy(false) }
  }

  async function removePost(id) {
    try {
      const response = await fetch(`${apiBaseUrl}/posts/${id}`, { method: 'DELETE', credentials: 'include' })
      await readResponse(response)
      setPosts((current) => current.filter((post) => post.id !== id))
    } catch (cause) { setError(cause.message) }
  }

  return <div className="page-wrap">
    <header className="topbar"><div><p className="eyebrow">Your private network</p><h1>{active === 'Home' ? `Good morning, ${user?.displayName?.split(' ')[0] || 'there'}` : active}</h1></div><div className="topbar-actions"><button className="search-pill" type="button">⌕ <span>Search ConnectHub</span><kbd>⌘ K</kbd></button><button className="notification-button" type="button" aria-label="Notifications">♧</button><div className="mini-avatar avatar-jules">{initials}</div></div></header>
    {active !== 'Home' ? <section className="empty-panel"><div className="empty-symbol">{active === 'Chats' ? '◌' : active === 'Media' ? '▧' : active === 'Notifications' ? '♧' : '◉'}</div><h2>{active}</h2><p>This space is ready for the next phase of ConnectHub.</p></section> : <div className="feed-layout"><section className="feed-column">
      <form className="composer" onSubmit={submit}><div className="mini-avatar avatar-jules">{initials}</div><textarea value={body} onChange={(event) => setBody(event.target.value)} placeholder="Share something with your circle..." maxLength="500" aria-label="Post content" /><button className="composer-action" type="submit" disabled={busy || !body.trim()} aria-label="Publish post">{busy ? '...' : '＋'}</button></form>
      {error && <p className="form-error feed-error">{error}</p>}
      {loading ? <p className="feed-status">Loading your feed...</p> : posts.length === 0 ? <section className="feed-empty"><span>＋</span><h2>Your feed starts here</h2><p>Share a thought with your circle. Posts from real members will appear here.</p></section> : posts.map((post) => <Post key={post.id} post={post} currentUserId={user?.id} onDelete={removePost} />)}
    </section></div>}
  </div>
}

function Post({ post, currentUserId, onDelete }) {
  const owner = post.user?.id === currentUserId
  return <article className="post-card"><div className="post-header"><div className="mini-avatar avatar-jules">{initialsFor(post.user?.displayName)}</div><div className="post-author"><strong>{post.user?.displayName}</strong><span>@{post.user?.username} · {formatTime(post.createdAt)}</span></div>{owner && <button className="dots-button" type="button" onClick={() => onDelete(post.id)} title="Delete post" aria-label="Delete post">×</button>}</div><p className="post-caption">{post.body}</p><div className="post-actions"><button type="button">♡ <span>Like</span></button><button type="button">◌ <span>Comment</span></button><button type="button">↗ <span>Share</span></button></div></article>
}