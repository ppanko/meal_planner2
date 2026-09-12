import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const focusCss = readFileSync(join(process.cwd(), 'src/mobile-focus.css'), 'utf8')

describe('mobile focus sizing', () => {
  it('keeps modal controls at 16px so iOS does not auto-zoom them on focus', () => {
    expect(focusCss).toMatch(
      /\.modal input,\s*\.modal select,\s*\.modal textarea\s*\{[^}]*font-size:\s*16px;/s,
    )
  })
})
