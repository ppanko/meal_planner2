import { useEffect, useState } from 'react'
import type { FormEvent, ReactNode } from 'react'
import type { Session } from '@supabase/supabase-js'
import { allowedEmails, supabase, supabaseConfigured } from './supabase'

export default function AuthGate({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null)
  const [checking, setChecking] = useState(true)
  const [email, setEmail] = useState('')
  const [message, setMessage] = useState('')
  const [sending, setSending] = useState(false)

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

  const sessionEmail = session?.user.email?.toLowerCase() ?? ''
  const sessionAllowed = sessionEmail && (allowedEmails.length === 0 || allowedEmails.includes(sessionEmail))

  useEffect(() => {
    if (session && !sessionAllowed) {
      void supabase.auth.signOut()
      setMessage('This email is not authorized for this meal planner.')
    }
  }, [session, sessionAllowed])

  async function sendMagicLink(event: FormEvent) {
    event.preventDefault()
    setMessage('')

    const normalized = email.trim().toLowerCase()
    if (!normalized) return

    if (allowedEmails.length > 0 && !allowedEmails.includes(normalized)) {
      setMessage('This email is not authorized for this meal planner.')
      return
    }

    setSending(true)

    const redirectTo = new URL(import.meta.env.BASE_URL, window.location.origin).toString()
    const { error } = await supabase.auth.signInWithOtp({
      email: normalized,
      options: { emailRedirectTo: redirectTo },
    })

    setSending(false)

    if (error) {
      setMessage(error.message)
      return
    }

    setMessage('Check your email and tap the sign-in link. You should only need to do this once on this device.')
  }

  if (!supabaseConfigured) {
    return (
      <div className="auth-screen">
        <div className="auth-card">
          <div className="eyebrow">SETUP REQUIRED</div>
          <h1>Meal Planner</h1>
          <p>Supabase is not configured. Copy <code>.secrets.example</code> to <code>.secrets</code> and fill in the project values.</p>
        </div>
      </div>
    )
  }

  if (checking) {
    return <div className="loading-screen"><div className="loading-card">Opening Meal Planner…</div></div>
  }

  if (session && sessionAllowed) {
    return <>{children}</>
  }

  return (
    <div className="auth-screen">
      <form className="auth-card" onSubmit={sendMagicLink}>
        <div className="eyebrow">HOUSEHOLD</div>
        <h1>Meal Planner</h1>
        <p>Enter your household email. We’ll send a sign-in link; the session stays saved on this device.</p>

        <label>
          Email
          <input
            type="email"
            autoComplete="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            placeholder="you@example.com"
            required
            autoFocus
          />
        </label>

        <button className="primary auth-submit" type="submit" disabled={sending}>
          {sending ? 'Sending…' : 'Email sign-in link'}
        </button>

        {message && <div className="auth-message">{message}</div>}
      </form>
    </div>
  )
}
