import { useState } from 'react'
import { createHouseholdInvite } from './api'
import type { HouseholdInvite } from './types'

export function InviteHouseholdModal({ onClose }: { onClose: () => void }) {
  const [invite, setInvite] = useState<HouseholdInvite | null>(null)
  const [message, setMessage] = useState('')
  const [creating, setCreating] = useState(false)

  const inviteUrl = invite
    ? (() => {
        const url = new URL(import.meta.env.BASE_URL, window.location.origin)
        url.hash = `invite=${invite.token}`
        return url.toString()
      })()
    : ''

  async function createInvite() {
    if (creating) return
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

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div
        className="modal invite-household-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="invite-household-title"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="modal-header">
          <div>
            <div className="eyebrow">HOUSEHOLDS</div>
            <h2 id="invite-household-title">Invite household</h2>
          </div>
          <button type="button" onClick={onClose} aria-label="Close">×</button>
        </div>

        <p>
          Create a one-time link, then send it using your normal email app. The
          recipient will name their household and receive its join code.
        </p>

        {!invite ? (
          <button className="primary" type="button" onClick={() => void createInvite()} disabled={creating}>
            {creating ? 'Creating…' : 'Create invite'}
          </button>
        ) : (
          <div className="invite-household-result">
            <label>
              Invitation link
              <input type="text" readOnly value={inviteUrl} onFocus={(event) => event.currentTarget.select()} />
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
