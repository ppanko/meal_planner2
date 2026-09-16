import { useEffect, useRef, useState } from 'react'
import type { FormEvent, ReactNode } from 'react'
import type { Session } from '@supabase/supabase-js'
import { supabase, supabaseConfigured } from './supabase'
import {
  enrollHousehold,
  getMyHousehold,
  redeemHouseholdInvite,
} from './households/api'
import { HouseholdProvider } from './households/HouseholdContext'
import type { HouseholdSession } from './households/types'

function inviteTokenFromHash(): string | null {
  const params = new URLSearchParams(window.location.hash.replace(/^#/, ''))
  return params.get('invite')?.trim() || null
}

const CONTROL_CHARACTER_PATTERN = /[\u0000-\u001f\u007f-\u009f]/

export default function AuthGate({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null)
  const [household, setHousehold] = useState<HouseholdSession | null>(null)
  const [checking, setChecking] = useState(true)
  const [accessCode, setAccessCode] = useState('')
  const [householdName, setHouseholdName] = useState('')
  const [message, setMessage] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [joinCode, setJoinCode] = useState<string | null>(null)
  const [continueCurrentHousehold, setContinueCurrentHousehold] = useState(false)
  const mountedRef = useRef(true)
  const resolutionGeneration = useRef(0)
  const activeSessionRef = useRef<Session | null>(null)
  const householdRef = useRef<HouseholdSession | null>(null)
  const submissionGenerationRef = useRef(0)
  const inviteToken = inviteTokenFromHash()

  useEffect(() => {
    mountedRef.current = true

    async function refresh(nextSession: Session | null, generation: number) {
      if (!mountedRef.current || generation !== resolutionGeneration.current) return
      activeSessionRef.current = nextSession
      setSession(nextSession)
      householdRef.current = null
      setHousehold(null)
      setChecking(true)

      let resolved: HouseholdSession | null = null
      if (nextSession) {
        try {
          resolved = await getMyHousehold()
        } catch (error) {
          console.warn('Could not check meal-planner enrollment.', error)
        }
      }

      if (!mountedRef.current || generation !== resolutionGeneration.current) return
      householdRef.current = resolved
      setHousehold(resolved)
      setChecking(false)
    }

    async function revalidate(nextSession: Session, generation: number) {
      if (!mountedRef.current || generation !== resolutionGeneration.current) return
      activeSessionRef.current = nextSession
      setSession(nextSession)

      try {
        const resolved = await getMyHousehold()
        if (!mountedRef.current || generation !== resolutionGeneration.current) return
        householdRef.current = resolved
        setHousehold(resolved)
      } catch (error) {
        if (!mountedRef.current || generation !== resolutionGeneration.current) return
        console.warn('Could not revalidate meal-planner enrollment.', error)
      }
    }

    const initialGeneration = ++resolutionGeneration.current
    void supabase.auth.getSession().then(({ data }) => {
      void refresh(data.session, initialGeneration)
    })

    const { data: listener } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      const previousUserId = activeSessionRef.current?.user.id ?? null
      const nextUserId = nextSession?.user.id ?? null
      const identityChanged = previousUserId !== nextUserId
      const generation = ++resolutionGeneration.current
      if (identityChanged) {
        householdRef.current = null
        setHousehold(null)
        setChecking(true)
        setAccessCode('')
        setHouseholdName('')
        setMessage('')
        setJoinCode(null)
        setContinueCurrentHousehold(false)
        if (previousUserId !== null) {
          submissionGenerationRef.current += 1
          setSubmitting(false)
        }
      }
      const hasResolvedHousehold = householdRef.current !== null
      activeSessionRef.current = nextSession
      if (!identityChanged && nextSession && hasResolvedHousehold) {
        queueMicrotask(() => void revalidate(nextSession, generation))
      } else {
        queueMicrotask(() => void refresh(nextSession, generation))
      }
    })

    return () => {
      mountedRef.current = false
      resolutionGeneration.current += 1
      submissionGenerationRef.current += 1
      activeSessionRef.current = null
      householdRef.current = null
      listener.subscription.unsubscribe()
    }
  }, [])

  async function ensureSession(): Promise<Session | null> {
    const existingSession = activeSessionRef.current
    if (existingSession) return existingSession

    const generation = resolutionGeneration.current

    const { data, error } = await supabase.auth.signInAnonymously()
    if (error) {
      if (
        resolutionGeneration.current === generation
        && activeSessionRef.current === null
      ) setMessage(error.message)
      return null
    }

    const signedInSession = data.session
    if (!signedInSession) return null

    const currentSession = activeSessionRef.current
    if (
      resolutionGeneration.current !== generation
      && currentSession?.user.id !== signedInSession.user.id
    ) return null

    if (!currentSession) {
      activeSessionRef.current = signedInSession
      setSession(signedInSession)
    }
    return activeSessionRef.current
  }

  function commitHousehold(activeSession: Session, nextHousehold: HouseholdSession): boolean {
    const currentSession = activeSessionRef.current
    if (currentSession?.user.id !== activeSession.user.id) return false

    resolutionGeneration.current += 1
    setSession(currentSession)
    householdRef.current = nextHousehold
    setHousehold(nextHousehold)
    setChecking(false)
    return true
  }

  function isActiveIdentity(candidateSession: Session): boolean {
    return activeSessionRef.current?.user.id === candidateSession.user.id
  }

  function isActiveSubmission(generation: number, candidateSession: Session): boolean {
    return submissionGenerationRef.current === generation
      && isActiveIdentity(candidateSession)
  }

  async function enrollDevice(event: FormEvent) {
    event.preventDefault()

    const code = accessCode.trim()
    if (!code || submitting) return

    const submissionGeneration = ++submissionGenerationRef.current
    setSubmitting(true)
    setMessage('')

    const activeSession = await ensureSession()
    if (!activeSession) {
      if (submissionGenerationRef.current === submissionGeneration) setSubmitting(false)
      return
    }
    if (!isActiveSubmission(submissionGeneration, activeSession)) return

    try {
      const enrolled = await enrollHousehold(code)
      if (!isActiveSubmission(submissionGeneration, activeSession)) return
      if (!enrolled) {
        setMessage('That household access code is not valid.')
        return
      }

      setAccessCode('')
      commitHousehold(activeSession, enrolled)
    } catch (error) {
      if (isActiveSubmission(submissionGeneration, activeSession)) {
        setMessage(error instanceof Error ? error.message : 'Could not connect this device.')
      }
    } finally {
      if (isActiveSubmission(submissionGeneration, activeSession)) setSubmitting(false)
    }
  }

  async function redeemInvite(event: FormEvent) {
    event.preventDefault()

    const name = householdName.trim()
    if (!inviteToken || !name || submitting) return
    if ([...name].length > 80) {
      setMessage('Household name must be 80 characters or fewer.')
      return
    }
    if (CONTROL_CHARACTER_PATTERN.test(name)) {
      setMessage('Enter a household name without control characters.')
      return
    }

    const submissionGeneration = ++submissionGenerationRef.current
    setSubmitting(true)
    setMessage('')

    const activeSession = await ensureSession()
    if (!activeSession) {
      if (submissionGenerationRef.current === submissionGeneration) setSubmitting(false)
      return
    }
    if (!isActiveSubmission(submissionGeneration, activeSession)) return

    try {
      const redeemed = await redeemHouseholdInvite(inviteToken, name)
      if (!isActiveSubmission(submissionGeneration, activeSession)) return
      if (!commitHousehold(activeSession, redeemed)) return
      setHouseholdName('')
      setJoinCode(redeemed.joinCode)
      window.history.replaceState(
        null,
        '',
        `${window.location.pathname}${window.location.search}`,
      )
    } catch (error) {
      if (isActiveSubmission(submissionGeneration, activeSession)) {
        setMessage(error instanceof Error ? error.message : 'Could not create the household.')
      }
    } finally {
      if (isActiveSubmission(submissionGeneration, activeSession)) setSubmitting(false)
    }
  }

  async function copyJoinCode() {
    if (!joinCode || !navigator.clipboard) return
    await navigator.clipboard.writeText(joinCode)
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

  if (joinCode && household) {
    return (
      <div className="auth-screen">
        <div className="auth-card">
          <div className="eyebrow">HOUSEHOLD CREATED</div>
          <h1>{household.householdName}</h1>
          <p>
            Save this household code. It connects another device or household
            member to this same planner.
          </p>
          <div className="auth-code" aria-label="Household join code">{joinCode}</div>
          <button className="secondary" type="button" onClick={() => void copyJoinCode()}>
            Copy code
          </button>
          <button className="primary auth-submit" type="button" onClick={() => setJoinCode(null)}>
            Open planner
          </button>
        </div>
      </div>
    )
  }

  if (inviteToken && household && !continueCurrentHousehold) {
    return (
      <div className="auth-screen">
        <div className="auth-card">
          <div className="eyebrow">INVITATION</div>
          <h1>Already connected</h1>
          <p>
            This browser is already connected to {household.householdName}. Open
            this invitation on an unenrolled browser or device to create the new household.
          </p>
          <button
            className="primary auth-submit"
            type="button"
            onClick={() => setContinueCurrentHousehold(true)}
          >
            Continue to planner
          </button>
        </div>
      </div>
    )
  }

  if (session && household) {
    return <HouseholdProvider value={household}>{children}</HouseholdProvider>
  }

  if (inviteToken) {
    return (
      <div className="auth-screen">
        <form className="auth-card" onSubmit={redeemInvite}>
          <div className="eyebrow">INVITATION</div>
          <h1>Create household</h1>
          <p>Name the household that will use this planner.</p>

          <label>
            Household name
            <input
              type="text"
              autoComplete="organization"
              value={householdName}
              onChange={(event) => setHouseholdName(event.target.value)}
              required
              autoFocus
            />
          </label>

          <button className="primary auth-submit" type="submit" disabled={submitting}>
            {submitting ? 'Creating…' : 'Create household'}
          </button>

          {message && <div className="auth-message">{message}</div>}
        </form>
      </div>
    )
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
