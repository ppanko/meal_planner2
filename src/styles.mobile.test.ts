import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const focusCss = readFileSync(join(process.cwd(), 'src/mobile-focus.css'), 'utf8')
const plannerMobileCss = readFileSync(join(process.cwd(), 'src/planner/PlannerView.mobile.css'), 'utf8')

describe('mobile focus sizing', () => {
  it('keeps modal controls at 16px so iOS does not auto-zoom them on focus', () => {
    expect(focusCss).toMatch(
      /\.modal input,\s*\.modal select,\s*\.modal textarea\s*\{[^}]*font-size:\s*16px;/s,
    )
  })
})

describe('mobile planner styling', () => {
  it('uses visible slate styling for the past-days control and day headers', () => {
    expect(plannerMobileCss).toMatch(
      /\.mobile-past-days-toggle\s*\{[^}]*background:\s*#eef1f3;[^}]*color:\s*#343a40;/s,
    )
    expect(plannerMobileCss).toMatch(
      /\.mobile-planner \.mobile-day-header,\s*\.mobile-planner \.day-header\s*\{[^}]*background:\s*#343a40;[^}]*color:\s*#fff;[^}]*border-bottom-color:\s*#343a40;/s,
    )
  })
})
