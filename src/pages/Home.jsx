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
  if (active === 'Chats') return <PersistentChatView />
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
    <header className="topbar"><div><p className="eyebrow">Your private network</p><h1>{active === 'Home' ? `Good morning, ${user?.displayName?.split(' ')[0] || 'there'}` : active}</h1></div><div className="topbar-actions"><button className="search-pill" type="button" onClick={() => window.location.assign('/chats')}>⌕ <span>Find a friend</span><kbd>⌘ K</kbd></button><button className="notification-button" type="button" aria-label="Notifications" onClick={() => window.location.assign('/notifications')}>♧</button><div className="mini-avatar avatar-user">{initials}</div></div></header>
    {active !== 'Home' ? <section className="empty-panel"><div className="empty-symbol">{active === 'Chats' ? '◌' : active === 'Media' ? '▧' : active === 'Notifications' ? '♧' : '◉'}</div><h2>{active}</h2><p>This space is ready for the next phase of ConnectHub.</p></section> : <div className="feed-layout"><section className="feed-column">
      <form className="composer" onSubmit={submit}><div className="mini-avatar avatar-user">{initials}</div><textarea value={body} onChange={(event) => setBody(event.target.value)} placeholder="Share something with your circle..." maxLength="500" aria-label="Post content" /><button className="composer-action" type="submit" disabled={busy || !body.trim()} aria-label="Publish post">{busy ? '...' : '＋'}</button></form>
      {error && <p className="form-error feed-error">{error}</p>}
      {loading ? <p className="feed-status">Loading your feed...</p> : posts.length === 0 ? <section className="feed-empty"><span>＋</span><h2>Your feed starts here</h2><p>Share a thought with your circle. Posts from real members will appear here.</p></section> : posts.map((post) => <Post key={post.id} post={post} currentUserId={user?.id} onDelete={removePost} />)}
    </section></div>}
  </div>
}

function Post({ post, currentUserId, onDelete }) {
  const owner = post.user?.id === currentUserId
  return <article className="post-card"><div className="post-header"><div className="mini-avatar avatar-user">{initialsFor(post.user?.displayName)}</div><div className="post-author"><strong>{post.user?.displayName}</strong><span>@{post.user?.username} · {formatTime(post.createdAt)}</span></div>{owner && <button className="dots-button" type="button" onClick={() => onDelete(post.id)} title="Delete post" aria-label="Delete post">×</button>}</div><p className="post-caption">{post.body}</p></article>
}

function PersistentChatView() {
  const { user } = useAuth()
  const [query, setQuery] = useState('')
  const [friends, setFriends] = useState([])
  const [results, setResults] = useState([])
  const [friend, setFriend] = useState(null)
  const [messages, setMessages] = useState([])
  const [busy, setBusy] = useState(false)
  const [uploadingMedia, setUploadingMedia] = useState(false)
  const [selectedFile, setSelectedFile] = useState(null)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [uploadingMedia, setUploadingMedia] = useState(false)

  useEffect(() => {
    fetch(`${apiBaseUrl}/friends`, { credentials: 'include' })
      .then(readResponse)
      .then((data) => {
        const savedId = window.localStorage.getItem('connecthub.selectedFriend')
        const savedFriend = (data.friends || []).find((item) => item.id === savedId)
        setFriends(data.friends || [])
        if (savedFriend) setFriend(savedFriend)
      })
      .catch((cause) => setError(cause.message))
  }, [])

  useEffect(() => {
    if (query.trim().length < 2) { setResults([]); return undefined }
    const controller = new AbortController()
    const timer = setTimeout(() => fetch(`${apiBaseUrl}/users/search?q=${encodeURIComponent(query)}`, { credentials: 'include', signal: controller.signal })
      .then(readResponse).then((data) => setResults(data.users || []))
      .catch((cause) => { if (cause.name !== 'AbortError') setError(cause.message) }), 250)
    return () => { clearTimeout(timer); controller.abort() }
  }, [query])

  useEffect(() => {
    if (!friend) return undefined
    window.localStorage.setItem('connecthub.selectedFriend', friend.id)
    let cancelled = false
    async function refreshMessages() {
      if (document.hidden) return
      try {
        const data = await readResponse(await fetch(`${apiBaseUrl}/messages/${friend.id}`, { credentials: 'include' }))
        if (!cancelled) setMessages(data.messages || [])
      } catch (cause) {
        if (!cancelled) setError(cause.message)
      }
    }
    refreshMessages()
    const interval = window.setInterval(refreshMessages, 3000)
    window.addEventListener('focus', refreshMessages)
    document.addEventListener('visibilitychange', refreshMessages)
    return () => {
      cancelled = true
      window.clearInterval(interval)
      window.removeEventListener('focus', refreshMessages)
      document.removeEventListener('visibilitychange', refreshMessages)
    }
  }, [friend])

  function selectFriend(person) {
    setFriend(person); setQuery(''); setResults([]); setError('')
  }

  async function addFriend(person) {
    try {
      const data = await readResponse(await fetch(`${apiBaseUrl}/friends/${person.id}`, { method: 'POST', credentials: 'include' }))
      setFriends((current) => current.some((item) => item.id === data.friend.id) ? current : [...current, data.friend])
      selectFriend(data.friend)
    } catch (cause) { setError(cause.message) }
  }

  async function sendMessage(event) {
    event.preventDefault()
    if (!friend || (!body.trim() && !selectedFile) || busy) return
    setBusy(true); setError('')
    try {
      let uploadedMedia = null
      if (selectedFile) {
        setUploadingMedia(true)
        const formData = new FormData()
        formData.append('media', selectedFile)
        uploadedMedia = await readResponse(await fetch(`${apiBaseUrl}/media/upload`, { method: 'POST', credentials: 'include', body: formData }))
        setUploadingMedia(false)
      }
      const data = await readResponse(await fetch(`${apiBaseUrl}/messages/${friend.id}`, {
        method: 'POST', credentials: 'include', headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
        body: JSON.stringify({ body: body.trim() || null, mediaUrl: uploadedMedia?.url || null, mediaType: uploadedMedia?.mimeType || null, fileName: uploadedMedia?.originalName || null, type: uploadedMedia?.type || 'text' }),
      }))
      setMessages((current) => [...current, data.message]); setBody(''); setSelectedFile(null); event.target.reset()
    } catch (cause) { setError(cause.message) } finally { setUploadingMedia(false); setBusy(false) }
  }

  function selectMedia(event) {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return
    const allowedTypes = ['image/jpeg', 'image/jpg', 'image/png', 'video/mp4']
    if (!allowedTypes.includes(file.type)) return setError('Only JPG, PNG and MP4 files are allowed.')
    if (file.size > 50 * 1024 * 1024) return setError('File is too large. Maximum size is 50 MB.')
    setError(''); setSelectedFile(file)
  }

  function mediaUrl(message) { return `${apiBaseUrl.replace(/\/api$/, '')}${message.mediaUrl || message.videoUrl}` }

  return <div className="page-wrap"><header className="topbar"><div><p className="eyebrow">Private messages</p><h1>Chats</h1></div></header><div className="chat-layout"><section className="chat-friends"><label className="chat-search">⌕<input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search by name or username" /></label>{query.trim().length >= 2 && results.map((person) => <div className="friend-result" key={person.id}><span className="mini-avatar avatar-user">{initialsFor(person.displayName)}</span><span><strong>{person.displayName}</strong><small>@{person.username}</small></span><button className="friend-action" type="button" onClick={() => friends.some((item) => item.id === person.id) ? selectFriend(person) : addFriend(person)}>{friends.some((item) => item.id === person.id) ? 'Open' : 'Add'}</button></div>)}<h3 className="friends-title">My friends</h3>{friends.map((person) => <button className={`friend-result ${friend?.id === person.id ? 'selected' : ''}`} key={person.id} type="button" onClick={() => selectFriend(person)}><span className="mini-avatar avatar-user">{initialsFor(person.displayName)}</span><span><strong>{person.displayName}</strong><small>@{person.username}</small></span></button>)}{!friends.length && !results.length && <p className="chat-hint">Search for someone and add them as a friend.</p>}</section><section className="chat-panel">{friend ? <><div className="chat-heading"><div className="mini-avatar avatar-user">{initialsFor(friend.displayName)}</div><div><strong>{friend.displayName}</strong><span>@{friend.username}</span></div></div><div className="message-list">{messages.length ? messages.map((message) => <div className={`message ${message.senderId === user.id ? 'mine' : ''}`} key={message.id}>{message.body && <p>{message.body}</p>}{(message.mediaUrl || message.videoUrl) && (message.type === 'image' || message.mediaType?.startsWith('image/')) ? <img src={mediaUrl(message)} alt={message.fileName || 'Shared image'} loading="lazy" /> : (message.mediaUrl || message.videoUrl) && <video controls preload="metadata" src={mediaUrl(message)} />}</div>) : <p className="chat-hint">No messages yet. Say hello.</p>}</div><form className="message-form" onSubmit={sendMessage}><input value={body} onChange={(event) => setBody(event.target.value)} placeholder="Write a message..." /><label className={`video-button ${busy ? 'disabled' : ''}`}>＋ Media<input type="file" accept="image/jpeg,image/png,image/jpg,video/mp4" disabled={busy} onChange={selectMedia} /></label>{media && <small className="selected-media">{media.name}</small>}{uploadingMedia && <small className="uploading-media">Uploading...</small>}<button className="primary-button" type="submit" disabled={busy || (!body.trim() && !media)}>{busy ? (uploadingMedia ? 'Uploading...' : 'Sending...') : 'Send'} <span>→</span></button></form></> : <div className="chat-placeholder"><span>◌</span><h2>Your conversations</h2><p>Add a friend to start messaging.</p></div>}</section></div>{error && <p className="form-error feed-error">{error}</p>}</div>
}

function ChatView() {
  const { user } = useAuth()
  const [query, setQuery] = useState('')
  const [friends, setFriends] = useState([])
  const [friend, setFriend] = useState(null)
  const [messages, setMessages] = useState([])
  const [body, setBody] = useState('')
  const [media, setMedia] = useState(null)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (query.trim().length < 2) { setFriends([]); return undefined }
    const controller = new AbortController()
    const timer = setTimeout(() => fetch(`${apiBaseUrl}/users/search?q=${encodeURIComponent(query)}`, { credentials: 'include', signal: controller.signal }).then(readResponse).then((data) => setFriends(data.users || [])).catch((cause) => { if (cause.name !== 'AbortError') setError(cause.message) }), 250)
    return () => { clearTimeout(timer); controller.abort() }
  }, [query])

  useEffect(() => {
    if (!friend) return undefined
    fetch(`${apiBaseUrl}/messages/${friend.id}`, { credentials: 'include' }).then(readResponse).then((data) => setMessages(data.messages || [])).catch((cause) => setError(cause.message))
  }, [friend])

  async function sendMessage(event) {
    event.preventDefault()
    if (!friend || (!body.trim() && !media) || busy) return
    setBusy(true); setError('')
    const form = new FormData()
    if (body.trim()) form.append('body', body)
    if (media) form.append('media', media)
    try {
      const response = await fetch(`${apiBaseUrl}/messages/${friend.id}`, { method: 'POST', credentials: 'include', body: form })
      const data = await readResponse(response)
      setMessages((current) => [...current, data.message]); setBody(''); setMedia(null); event.target.reset()
    } catch (cause) { setError(cause.message) } finally { setBusy(false) }
  }

  return <div className="page-wrap"><header className="topbar"><div><p className="eyebrow">Private messages</p><h1>Chats</h1></div></header><div className="chat-layout"><section className="chat-friends"><label className="chat-search">⌕<input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search by name or username" /></label>{friends.map((person) => <button className={`friend-result ${friend?.id === person.id ? 'selected' : ''}`} key={person.id} type="button" onClick={() => { setFriend(person); setQuery(''); setFriends([]) }}><span className="mini-avatar avatar-user">{initialsFor(person.displayName)}</span><span><strong>{person.displayName}</strong><small>@{person.username}</small></span></button>)}{!friend && <p className="chat-hint">Search for a real member to start a conversation.</p>}</section><section className="chat-panel">{friend ? <><div className="chat-heading"><div className="mini-avatar avatar-user">{initialsFor(friend.displayName)}</div><div><strong>{friend.displayName}</strong><span>@{friend.username}</span></div></div><div className="message-list">{messages.length ? messages.map((message) => <div className={`message ${message.senderId === user.id ? 'mine' : ''}`} key={message.id}>{message.body && <p>{message.body}</p>}{(message.mediaUrl || message.videoUrl) && (message.mediaType || 'video/mp4').startsWith('image/') ? <img src={`${apiBaseUrl.replace(/\/api$/, '')}${message.mediaUrl || message.videoUrl}`} alt="Shared attachment" loading="lazy" /> : (message.mediaUrl || message.videoUrl) && <video controls preload="metadata" src={`${apiBaseUrl.replace(/\/api$/, '')}${message.mediaUrl || message.videoUrl}`} />}</div>) : <p className="chat-hint">No messages yet. Say hello.</p>}</div><form className="message-form" onSubmit={sendMessage}><input value={body} onChange={(event) => setBody(event.target.value)} placeholder="Write a message..." /><label className="video-button">＋ Media<input type="file" accept="image/png,image/jpeg,video/mp4,.png,.jpg,.jpeg,.mp4" onChange={(event) => setMedia(event.target.files[0] || null)} /></label><button className="primary-button" type="submit" disabled={busy || (!body.trim() && !media)}>{busy ? 'Sending...' : 'Send'} <span>→</span></button></form></> : <div className="chat-placeholder"><span>◌</span><h2>Your conversations</h2><p>Find a friend to send messages, JPG, PNG, and MP4 files.</p></div>}</section></div>{error && <p className="form-error feed-error">{error}</p>}</div>
}