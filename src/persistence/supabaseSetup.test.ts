import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const sql = readFileSync(resolve(process.cwd(), 'supabase/setup.sql'), 'utf8')
const migration = readFileSync(
  resolve(process.cwd(), 'supabase/migrations/20260819000000_versioned_sync.sql'),
  'utf8',
)
const deployWorkflow = readFileSync(resolve(process.cwd(), '.github/workflows/deploy.yml'), 'utf8')

describe('Supabase sync migration', () => {
  it('requires version-checked RPC writes instead of direct client updates', () => {
    expect(sql).toContain('revision bigint not null default 0')
    expect(sql).toContain('create or replace function public.save_meal_planner_state')
    expect(sql).toContain('if current_row.revision <> expected_revision then')
    expect(sql).toContain("'conflict'::text")
    expect(sql).toContain('grant select on table public.meal_planner_state to authenticated;')
    expect(sql).not.toContain('grant select, insert, update on table public.meal_planner_state to authenticated;')
  })

  it('archives confirmed states and makes mutation retries idempotent', () => {
    expect(sql).toContain('create table if not exists public.meal_planner_state_versions')
    expect(sql).toContain('if current_row.last_mutation_id = mutation_id then')
    expect(sql).toContain('insert into public.meal_planner_state_versions')
    expect(sql).toContain('limit 50')
  })

  it('ships the same versioned-write protections as a tracked migration', () => {
    expect(migration).toContain('add column if not exists revision bigint not null default 0')
    expect(migration).toContain('create table if not exists public.meal_planner_state_versions')
    expect(migration).toContain('create or replace function public.save_meal_planner_state')
    expect(migration).toContain('if current_row.revision <> expected_revision then')
    expect(migration).toContain('limit 50')
    expect(migration).not.toContain('grant select, insert, update')
  })

  it('applies tracked migrations only after the app passes its release gates', () => {
    const testIndex = deployWorkflow.indexOf('run: npm test')
    const buildIndex = deployWorkflow.indexOf('run: npm run build')
    const dryRunIndex = deployWorkflow.indexOf('run: supabase db push --dry-run')
    const pushIndex = deployWorkflow.indexOf('run: supabase db push\n')
    const deployIndex = deployWorkflow.indexOf('uses: actions/deploy-pages@v4')

    expect(testIndex).toBeGreaterThan(-1)
    expect(buildIndex).toBeGreaterThan(testIndex)
    expect(dryRunIndex).toBeGreaterThan(buildIndex)
    expect(pushIndex).toBeGreaterThan(dryRunIndex)
    expect(deployIndex).toBeGreaterThan(pushIndex)
    expect(deployWorkflow).toContain('uses: supabase/setup-cli@v1')
    expect(deployWorkflow).toContain('SUPABASE_DB_PASSWORD: ${{ secrets.SUPABASE_DB_PASSWORD }}')
  })
})
