import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const css = readFileSync(join(process.cwd(), 'src/meals/MealLibraryManager.css'), 'utf8')

describe('library item action layout', () => {
  it('keeps edit and status/delete actions visible without shrinking into each other', () => {
    expect(css).toMatch(
      /\.library-item > div:first-child\s*\{[^}]*flex:\s*1 1 auto;[^}]*min-width:\s*0;/s,
    )
    expect(css).toMatch(
      /\.library-item-actions\s*\{[^}]*display:\s*flex;[^}]*align-items:\s*center;[^}]*justify-content:\s*flex-end;[^}]*gap:\s*\d+px;[^}]*flex:\s*0 0 auto;[^}]*white-space:\s*nowrap;/s,
    )
    expect(css).toMatch(
      /\.library-item-actions \.danger-text\s*\{[^}]*flex:\s*0 0 auto;[^}]*border:\s*0;[^}]*background:\s*transparent;[^}]*font-size:\s*10px;/s,
    )
  })
})
