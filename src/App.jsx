import { Navigate, Route, Routes } from 'react-router-dom'
import AppLayout from './layouts/AppLayout'
import Home from './pages/Home'
import Login from './pages/Login'
import Signup from './pages/Signup'
import { useAuth } from './context/AuthContext'

function ProtectedRoute({ children }) {
  const { user, loading } = useAuth()
  if (loading) return <div className="loading-screen">Loading ConnectHub...</div>
  return user ? children : <Navigate to="/login" replace />
}

function PublicRoute({ children }) {
  const { user, loading } = useAuth()
  if (loading) return <div className="loading-screen">Loading ConnectHub...</div>
  return user ? <Navigate to="/" replace /> : children
}

export default function App() {
  return (
    <Routes>
      <Route element={<ProtectedRoute><AppLayout /></ProtectedRoute>}>
        <Route path="/" element={<Home />} />
        <Route path="/chats" element={<Home active="Chats" />} />
        <Route path="/media" element={<Home active="Media" />} />
        <Route path="/notifications" element={<Home active="Notifications" />} />
        <Route path="/profile" element={<Home active="Profile" />} />
      </Route>
      <Route path="/login" element={<PublicRoute><Login /></PublicRoute>} />
      <Route path="/signup" element={<PublicRoute><Signup /></PublicRoute>} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}