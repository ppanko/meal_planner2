import { afterEach, describe, expect, it } from 'vitest'
import './styles.css'
import './mobile-focus.css'

afterEach(() => {
  document.body.replaceChildren()
})

describe('modal form control sizing', () => {
  it('does not let modal controls inherit the 11px label font size', () => {
    const modal = document.createElement('div')
    modal.className = 'modal'
    modal.innerHTML = `
      <label>Name<input /></label>
      <label>Type<select><option>Dinner</option></select></label>
      <label>Notes<textarea></textarea></label>
    `
    document.body.append(modal)

    for (const control of modal.querySelectorAll('input, select, textarea')) {
      expect(getComputedStyle(control).fontSize).toBe('16px')
    }
  })
})
