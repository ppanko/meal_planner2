import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const sql = readFileSync(resolve(process.cwd(), 'supabase/setup.sql'), 'utf8')
const migration = readFileSync(
  resolve(process.cwd(), 'supabase/migrations/20260819000000_versioned_sync.sql'),
  'utf8',
)
const hardeningMigration = readFileSync(
  resolve(process.cwd(), 'supabase/migrations/20260819010000_harden_state_boundary.sql'),
  'utf8',
)
const deployWorkflow = readFileSync(resolve(process.cwd(), '.github/workflows/deploy.yml'), 'utf8')
const pullRequestWorkflow = readFileSync(resolve(process.cwd(), '.github/workflows/ci.yml'), 'utf8')

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

  it('constrains reads and writes to one bounded, valid household state', () => {
    for (const source of [sql, hardeningMigration]) {
      expect(source).toContain("requested_id is distinct from 'household'")
      expect(source).toContain('octet_length(value::text) <= 750000')
      expect(source).toContain("('__proto__', 'prototype', 'constructor')")
      expect(source).toContain('nesting_depth > 32')
      expect(source).toContain('expected_revision is null or expected_revision < 0')
      expect(source).toContain('mutation_id is null')
      expect(source).toContain('not public.meal_planner_state_is_valid(requested_state)')
      expect(source).toContain("id = 'household'")
      expect(source).toContain('drop policy if exists "household can create meal planner"')
      expect(source).toContain('drop policy if exists "household can update meal planner"')
    }
  })

  it('requires all persisted top-level collection types at the server boundary', () => {
    const requiredTypes = {
      ingredients: 'array',
      meals: 'array',
      planner: 'object',
      shoppingChecked: 'object',
      manualShoppingItems: 'object',
      proteinCategories: 'array',
      plannerRowsByWeek: 'object',
      shoppingHistory: 'array',
      plannerNotes: 'object',
      shoppingPurchasesByWeek: 'object',
      shoppingDismissedByWeek: 'object',
      shoppingCategories: 'array',
      shoppingCategoryOrder: 'array',
    }

    for (const [field, type] of Object.entries(requiredTypes)) {
      expect(hardeningMigration).toContain(
        `jsonb_typeof(value -> '${field}') is not distinct from '${type}'`,
      )
    }
  })

  it('isolates migration credentials and orders release jobs behind verification', () => {
    const verifyIndex = deployWorkflow.indexOf('  verify:')
    const migrateIndex = deployWorkflow.indexOf('  migrate:')
    const deployIndex = deployWorkflow.indexOf('  deploy:')
    const verifyJob = deployWorkflow.slice(verifyIndex, migrateIndex)
    const migrateJob = deployWorkflow.slice(migrateIndex, deployIndex)
    const deployJob = deployWorkflow.slice(deployIndex)

    expect(deployWorkflow).toContain('permissions: {}')
    expect(verifyJob).toContain('run: npm test')
    expect(verifyJob).toContain('run: npm run build')
    expect(verifyJob).not.toContain('SUPABASE_ACCESS_TOKEN')
    expect(verifyJob).not.toContain('SUPABASE_DB_PASSWORD')
    expect(migrateJob).toContain('needs: verify')
    expect(migrateJob).toContain('run: supabase db push --dry-run')
    expect(migrateJob).toContain('run: supabase db push')
    expect(migrateJob).toContain('SUPABASE_DB_PASSWORD: ${{ secrets.SUPABASE_DB_PASSWORD }}')
    expect(deployJob).toContain('needs: migrate')
    expect(deployJob).not.toContain('SUPABASE_ACCESS_TOKEN')
    expect(deployJob).not.toContain('SUPABASE_DB_PASSWORD')
    expect(deployJob).toContain('pages: write')
    expect(deployJob).toContain('id-token: write')
  })

  it('pins every third-party action and the Supabase CLI version', () => {
    const uses = [...`${deployWorkflow}\n${pullRequestWorkflow}`.matchAll(/^\s*uses:\s+([^\s#]+)/gm)]
      .map((match) => match[1])

    expect(uses.length).toBeGreaterThan(0)
    expect(uses.every((action) => /@[a-f0-9]{40}$/.test(action))).toBe(true)
    expect(deployWorkflow).toContain('version: 2.100.0')
    expect(deployWorkflow).not.toContain('version: latest')
  })
})
