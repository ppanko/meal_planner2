import { afterEach, describe, expect, it } from 'vitest'
import baseCss from './styles.css?raw'
import focusCss from './mobile-focus.css?raw'

let styleElement: HTMLStyleElement | null = null

afterEach(() => {
  document.body.replaceChildren()
  styleElement?.remove()
  styleElement = null
})

describe('modal form control sizing', () => {
  it('keeps modal controls at 16px so iOS does not auto-zoom them on focus', () => {
    styleElement = document.createElement('style')
    styleElement.textContent = `${baseCss}\n${focusCss}`
    document.head.append(styleElement)

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
