import { describe, expect, it } from 'vitest'
import focusCss from './mobile-focus.css?raw'

describe('mobile focus sizing', () => {
  it('keeps modal controls at 16px so iOS does not auto-zoom them on focus', () => {
    expect(focusCss).toMatch(
      /\.modal input,\s*\.modal select,\s*\.modal textarea\s*\{[^}]*font-size:\s*16px;/s,
    )
  })
})
