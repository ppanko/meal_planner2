import { useEffect, useState } from 'react'
import type { FormEvent, ReactNode } from 'react'
import type { Session } from '@supabase/supabase-js'
import { allowedEmails, supabase, supabaseConfigured } from './supabase'

export default function AuthGate({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null)
  const [checking, setChecking] = useState(true)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [message, setMessage] = useState('')
  const [signingIn, setSigningIn] = useState(false)

  useEffect(() => {
    let mounted = true

    void supabase.auth.getSession().then(({ data }) => {
      if (!mounted) return

      setSession(data.session)
      setChecking(false)
    })

    const { data: listener } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession)
      setChecking(false)
    })

    return () => {
      mounted = false
      listener.subscription.unsubscribe()
    }
  }, [])

  const sessionEmail = session?.user.email?.trim().toLowerCase() ?? ''
  const sessionAllowed =
    Boolean(sessionEmail) &&
    (allowedEmails.length === 0 || allowedEmails.includes(sessionEmail))

  useEffect(() => {
    if (session && !sessionAllowed) {
      void supabase.auth.signOut()
      setMessage('This email is not authorized for this meal planner.')
    }
  }, [session, sessionAllowed])

  async function signIn(event: FormEvent) {
    event.preventDefault()
    setMessage('')

    const normalizedEmail = email.trim().toLowerCase()

    if (!normalizedEmail || !password) return

    if (
      allowedEmails.length > 0 &&
      !allowedEmails.includes(normalizedEmail)
    ) {
      setMessage('This email is not authorized for this meal planner.')
      return
    }

    setSigningIn(true)

    const { error } = await supabase.auth.signInWithPassword({
      email: normalizedEmail,
      password,
    })

    setSigningIn(false)

    if (error) {
      setMessage('Unable to sign in. Check your email and password.')
      return
    }

    setPassword('')
  }

  if (!supabaseConfigured) {
    return (
      <div className="auth-screen">
        <div className="auth-card">
          <div className="eyebrow">SETUP REQUIRED</div>
          <h1>Meal Planner</h1>
          <p>
            Supabase is not configured. Copy <code>.secrets.example</code> to{' '}
            <code>.secrets</code> and fill in the project values.
          </p>
        </div>
      </div>
    )
  }

  if (checking) {
    return (
      <div className="loading-screen">
        <div className="loading-card">Opening Meal Planner…</div>
      </div>
    )
  }

  if (session && sessionAllowed) {
    return <>{children}</>
  }

  return (
    <div className="auth-screen">
      <form className="auth-card" onSubmit={signIn}>
        <div className="eyebrow">HOUSEHOLD</div>
        <h1>Meal Planner</h1>
        <p>
          Sign in once on this device. Your session will stay saved unless you
          explicitly sign out or clear browser data.
        </p>

        <label>
          Email
          <input
            type="email"
            autoComplete="username"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            placeholder="you@example.com"
            required
            autoFocus
          />
        </label>

        <label>
          Password
          <input
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            required
          />
        </label>

        <button
          className="primary auth-submit"
          type="submit"
          disabled={signingIn}
        >
          {signingIn ? 'Signing in…' : 'Sign in'}
        </button>

        {message && <div className="auth-message">{message}</div>}
      </form>
    </div>
  )
}
