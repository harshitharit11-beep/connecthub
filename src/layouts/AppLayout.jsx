import { NavLink, Outlet } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'

const navItems = [
  ['Home', '/', '⌂'],
  ['Chats', '/chats', '◌'],
  ['Media', '/media', '▧'],
  ['Notifications', '/notifications', '♧'],
  ['Profile', '/profile', '◉'],
]

export default function AppLayout() {
  const { user, logout } = useAuth()
  const initials = user?.displayName?.split(/\s+/).map((part) => part[0]).join('').slice(0, 2).toUpperCase() || 'U'
  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand-lockup"><span className="brand-mark">+</span><span>Connect<span className="brand-accent">Hub</span></span></div>
        <p className="sidebar-kicker">Your private network</p>
        <nav className="primary-nav" aria-label="Main navigation">
          {navItems.map(([label, path, icon]) => <NavLink key={label} to={path} className={({ isActive }) => isActive ? 'nav-item active' : 'nav-item'}><span className="nav-icon">{icon}</span>{label}</NavLink>)}
        </nav>
        <div className="sidebar-footer"><div className="mini-avatar avatar-user">{initials}</div><div><strong>{user.displayName}</strong><span>@{user.username}</span></div><button className="icon-button" onClick={logout} aria-label="Log out" title="Log out">↪</button></div>
      </aside>
      <main className="main-content"><Outlet /></main>
      <nav className="mobile-nav" aria-label="Mobile navigation">
        {navItems.map(([label, path, icon]) => <NavLink key={label} to={path} aria-label={label} className={({ isActive }) => isActive ? 'mobile-nav-item active' : 'mobile-nav-item'}><span>{icon}</span></NavLink>)}
        <NavLink to="/profile" aria-label="Profile" className="mobile-nav-item"><span>◉</span></NavLink>
      </nav>
    </div>
  )
}