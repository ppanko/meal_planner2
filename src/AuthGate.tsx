import { useEffect, useState } from 'react'
import type { FormEvent, ReactNode } from 'react'
import type { Session } from '@supabase/supabase-js'
import { supabase, supabaseConfigured } from './supabase'

async function checkEnrollment(session: Session | null): Promise<boolean> {
  if (!session) return false

  const { data, error } = await supabase.rpc('is_meal_planner_authorized')

  if (error) {
    console.warn('Could not check meal-planner enrollment.', error)
    return false
  }

  return data === true
}

export default function AuthGate({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null)
  const [enrolled, setEnrolled] = useState(false)
  const [checking, setChecking] = useState(true)
  const [accessCode, setAccessCode] = useState('')
  const [message, setMessage] = useState('')
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    let mounted = true

    async function refresh(nextSession: Session | null) {
      const isEnrolled = await checkEnrollment(nextSession)

      if (!mounted) return
      setSession(nextSession)
      setEnrolled(isEnrolled)
      setChecking(false)
    }

    void supabase.auth.getSession().then(({ data }) => {
      void refresh(data.session)
    })

    const { data: listener } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      void refresh(nextSession)
    })

    return () => {
      mounted = false
      listener.subscription.unsubscribe()
    }
  }, [])

  async function enrollDevice(event: FormEvent) {
    event.preventDefault()

    const code = accessCode.trim()
    if (!code || submitting) return

    setSubmitting(true)
    setMessage('')

    let activeSession = session

    if (!activeSession) {
      const { data, error } = await supabase.auth.signInAnonymously()

      if (error) {
        setSubmitting(false)
        setMessage(error.message)
        return
      }

      activeSession = data.session
      setSession(data.session)
    }

    if (!activeSession) {
      setSubmitting(false)
      setMessage('Could not create a device session.')
      return
    }

    const { data, error } = await supabase.rpc('enroll_meal_planner_device', {
      access_code: code,
    })

    setSubmitting(false)

    if (error) {
      setMessage(error.message)
      return
    }

    if (data !== true) {
      setMessage('That household access code is not valid.')
      return
    }

    setAccessCode('')
    setEnrolled(true)
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

  if (session && enrolled) {
    return <>{children}</>
  }

  return (
    <div className="auth-screen">
      <form className="auth-card" onSubmit={enrollDevice}>
        <div className="eyebrow">HOUSEHOLD</div>
        <h1>Meal Planner</h1>
        <p>
          Enter the household access code once on this device. No email or
          password is required.
        </p>

        <label>
          Household code
          <input
            type="password"
            autoComplete="off"
            value={accessCode}
            onChange={(event) => setAccessCode(event.target.value)}
            placeholder="Household access code"
            required
            autoFocus
          />
        </label>

        <button className="primary auth-submit" type="submit" disabled={submitting}>
          {submitting ? 'Connecting…' : 'Connect this device'}
        </button>

        {message && <div className="auth-message">{message}</div>}

        <p className="auth-footnote">
          This device stays connected as long as its browser storage is kept.
        </p>
      </form>
    </div>
  )
}
