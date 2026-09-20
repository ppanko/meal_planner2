import { useEffect, useRef, useState } from 'react'
import type { KeyboardEvent as ReactKeyboardEvent } from 'react'
import { createHouseholdInvite } from './api'
import type { HouseholdInvite } from './types'

export function InviteHouseholdModal({ onClose }: { onClose: () => void }) {
  const [invite, setInvite] = useState<HouseholdInvite | null>(null)
  const [message, setMessage] = useState('')
  const [creating, setCreating] = useState(false)
  const dialogRef = useRef<HTMLDivElement>(null)
  const closeButtonRef = useRef<HTMLButtonElement>(null)
  const createButtonRef = useRef<HTMLButtonElement>(null)
  const inviteLinkRef = useRef<HTMLInputElement>(null)
  const restoreFocusRef = useRef<HTMLElement | null>(null)

  useEffect(() => {
    restoreFocusRef.current = document.activeElement instanceof HTMLElement
      ? document.activeElement
      : null
    createButtonRef.current?.focus()
    return () => restoreFocusRef.current?.focus()
  }, [])

  useEffect(() => {
    if (invite) {
      inviteLinkRef.current?.focus()
      inviteLinkRef.current?.select()
    }
  }, [invite])

  const inviteUrl = invite
    ? (() => {
        const url = new URL(import.meta.env.BASE_URL, window.location.href)
        url.hash = `invite=${invite.token}`
        return url.toString()
      })()
    : ''

  async function createInvite() {
    if (creating) return
    closeButtonRef.current?.focus()
    setCreating(true)
    setMessage('')
    try {
      setInvite(await createHouseholdInvite())
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Could not create an invitation.')
    } finally {
      setCreating(false)
    }
  }

  async function copyInvite() {
    if (!inviteUrl || !navigator.clipboard) return
    await navigator.clipboard.writeText(inviteUrl)
    setMessage('Invitation link copied.')
  }

  function handleDialogKeyDown(event: ReactKeyboardEvent<HTMLDivElement>) {
    if (event.key === 'Escape') {
      event.preventDefault()
      onClose()
      return
    }
    if (event.key !== 'Tab') return

    const focusable = [...(dialogRef.current?.querySelectorAll<HTMLElement>(
      'button:not([disabled]), input:not([disabled]), [href], select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
    ) ?? [])]
    if (focusable.length === 0) return

    const first = focusable[0]
    const last = focusable[focusable.length - 1]
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault()
      last.focus()
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault()
      first.focus()
    }
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div
        ref={dialogRef}
        className="modal invite-household-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="invite-household-title"
        onClick={(event) => event.stopPropagation()}
        onKeyDown={handleDialogKeyDown}
      >
        <div className="modal-header">
          <div>
            <div className="eyebrow">HOUSEHOLDS</div>
            <h2 id="invite-household-title">Invite household</h2>
          </div>
          <button ref={closeButtonRef} type="button" onClick={onClose} aria-label="Close">×</button>
        </div>

        <p>
          Create a one-time link, then send it using your normal email app. The
          recipient will name their household and receive its join code.
        </p>

        {!invite ? (
          <button
            ref={createButtonRef}
            className="primary"
            type="button"
            onClick={() => void createInvite()}
            disabled={creating}
          >
            {creating ? 'Creating…' : 'Create invite'}
          </button>
        ) : (
          <div className="invite-household-result">
            <label>
              Invitation link
              <input
                ref={inviteLinkRef}
                type="text"
                readOnly
                value={inviteUrl}
                onFocus={(event) => event.currentTarget.select()}
              />
            </label>
            <p className="auth-footnote">
              Expires {new Date(invite.expiresAt).toLocaleString()} and can be used once.
            </p>
            <button className="primary" type="button" onClick={() => void copyInvite()}>
              Copy link
            </button>
          </div>
        )}

        {message && <div className="auth-message" role="status">{message}</div>}
      </div>
    </div>
  )
}
