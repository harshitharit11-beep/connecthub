import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import AuthLayout from '../components/AuthLayout'
import { useAuth } from '../context/AuthContext'

export default function Login() {
	const { login } = useAuth()
	const navigate = useNavigate()
	const [form, setForm] = useState({ username: '', password: '' })
	const [error, setError] = useState('')
	const [busy, setBusy] = useState(false)
	async function submit(event) { event.preventDefault(); setError(''); setBusy(true); try { await login(form); navigate('/') } catch (cause) { setError(cause.message) } finally { setBusy(false) } }
	return <AuthLayout eyebrow="Welcome back" title={<>Good to see<br /><em>you again.</em></>} description="Your people, your moments, your private corner of the internet."><form className="auth-form" onSubmit={submit}><label>Username<input value={form.username} onChange={(event) => setForm({ ...form, username: event.target.value })} placeholder="Enter your username" autoComplete="username" required /></label><label>Password<input value={form.password} onChange={(event) => setForm({ ...form, password: event.target.value })} type="password" placeholder="Enter your password" autoComplete="current-password" required /></label>{error && <p className="form-error">{error}</p>}<div className="form-meta"><label className="check-label"><input type="checkbox" /> <span>Remember me</span></label><button type="button" className="text-button">Forgot password?</button></div><button className="primary-button" type="submit" disabled={busy}>{busy ? 'Logging in...' : 'Log in'} <span>→</span></button></form><p className="auth-switch">New to ConnectHub? <Link to="/signup">Create an account</Link></p></AuthLayout>
}