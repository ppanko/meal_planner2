import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const css = readFileSync(join(process.cwd(), 'src/styles.css'), 'utf8')

describe('library item action layout', () => {
  it('keeps edit and status/delete actions visible without shrinking into each other', () => {
    expect(css).toMatch(
      /\.library-item > div:first-child\s*\{[^}]*flex:\s*1 1 auto;[^}]*min-width:\s*0;/s,
    )
    expect(css).toMatch(
      /\.library-item-actions\s*\{[^}]*display:\s*flex;[^}]*align-items:\s*center;[^}]*gap:\s*\d+px;[^}]*flex:\s*0 0 auto;/s,
    )
    expect(css).toMatch(
      /\.library-item-actions \.danger-text\s*\{[^}]*border:\s*0;[^}]*background:\s*transparent;[^}]*font-size:\s*10px;/s,
    )
  })
})
