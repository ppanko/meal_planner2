import type { KeyboardEvent } from 'react'

export function PlannerRowEditor({ mobile = false, editing, value, onStart, onChange, onSave, onCancel }: {
  mobile?: boolean
  editing: boolean
  value: string
  onStart: () => void
  onChange: (value: string) => void
  onSave: () => void
  onCancel: () => void
}) {
  function handleKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === 'Enter') onSave()
    if (event.key === 'Escape') onCancel()
  }

  if (mobile) {
    return !editing ? (
      <button type="button" className="mobile-custom-row-trigger" onClick={onStart}>
        <span className="add-row-icon">+</span>
        <span><strong>Add custom row</strong><small>For guests, kids, dietary needs, or another meal</small></span>
      </button>
    ) : (
      <div className="mobile-custom-row-editor">
        <input value={value} onChange={(event) => onChange(event.target.value)} onKeyDown={handleKeyDown} placeholder="e.g. Kids, Vegetarian, Extra meal" aria-label="Optional new planner row name" autoFocus />
        <div className="mobile-custom-row-actions">
          <button type="button" className="secondary" onClick={onCancel}>Cancel</button>
          <button type="button" className="primary" onClick={onSave}>Add</button>
        </div>
      </div>
    )
  }

  return !editing ? (
    <button type="button" className="add-row-trigger" onClick={onStart}>
      <span className="add-row-icon">+</span>
      <span><strong>Add custom row</strong><small>For guests, kids, dietary needs, or another meal</small></span>
    </button>
  ) : (
    <div className="add-row-editor">
      <div className="add-row-editor-copy"><strong>New planner row</strong><small>Name is optional</small></div>
      <input value={value} onChange={(event) => onChange(event.target.value)} onKeyDown={handleKeyDown} placeholder="e.g. Guests" aria-label="Optional new planner row name" autoFocus />
      <div className="add-row-editor-actions">
        <button type="button" className="secondary" onClick={onCancel}>Cancel</button>
        <button type="button" className="primary" onClick={onSave}>Add</button>
      </div>
    </div>
  )
}
