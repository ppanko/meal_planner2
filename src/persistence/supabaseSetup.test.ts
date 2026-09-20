import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const root = process.cwd()
const sql = readFileSync(resolve(root, 'supabase/setup.sql'), 'utf8')
const versionedMigration = readFileSync(
  resolve(root, 'supabase/migrations/20260819000000_versioned_sync.sql'),
  'utf8',
)
const hardeningMigration = readFileSync(
  resolve(root, 'supabase/migrations/20260819010000_harden_state_boundary.sql'),
  'utf8',
)
const householdMigration = readFileSync(
  resolve(root, 'supabase/migrations/20260915000000_multi_household_expansion.sql'),
  'utf8',
)
const deployWorkflow = readFileSync(resolve(root, '.github/workflows/deploy.yml'), 'utf8')
const pullRequestWorkflow = readFileSync(resolve(root, '.github/workflows/ci.yml'), 'utf8')
const setupDoc = readFileSync(resolve(root, 'SUPABASE_SETUP.md'), 'utf8')
const rolloutDoc = readFileSync(resolve(root, 'docs/VERSIONED_SYNC_ROLLOUT.md'), 'utf8')
const securityTracker = readFileSync(resolve(root, 'docs/SECURITY_RELIABILITY_TRACKER.md'), 'utf8')
const obsoleteContract = resolve(root, 'supabase/contracts/20260819020000_contract_versioned_sync.sql')

describe('Supabase sync and household setup', () => {
  it('requires version-checked RPC writes and bounded validated payloads', () => {
    expect(sql).toContain('revision bigint not null default 0')
    expect(sql).toContain('create or replace function public.save_meal_planner_state')
    expect(sql).toContain('if current_row.revision <> expected_revision then')
    expect(sql).toContain("'conflict'::text")
    expect(sql).toContain('grant select on table public.meal_planner_state to authenticated;')
    expect(sql).toContain('octet_length(value::text) <= 750000')
    expect(sql).toContain("('__proto__', 'prototype', 'constructor')")
    expect(sql).toContain('nesting_depth > 32')
    expect(sql).toContain('expected_revision is null or expected_revision < 0')
    expect(sql).toContain('mutation_id is null')
    expect(sql).toContain('not public.meal_planner_state_is_valid(requested_state)')
  })

  it('archives confirmed states and makes mutation retries idempotent', () => {
    expect(sql).toContain('create table if not exists public.meal_planner_state_versions')
    expect(sql).toContain('if current_row.last_mutation_id = mutation_id then')
    expect(sql).toContain('insert into public.meal_planner_state_versions')
    expect(sql).toContain('limit 50')
  })

  it('preserves immutable August expansion migrations', () => {
    expect(versionedMigration).toContain("values ('versioned_sync', 'expand')")
    expect(versionedMigration).toContain('create or replace function public.save_meal_planner_state')
    expect(hardeningMigration).toContain('guard_legacy_meal_planner_write')
    expect(hardeningMigration).toContain('grant insert, update on table public.meal_planner_state')
    expect(hardeningMigration).toContain("requested_id is distinct from 'household'")
  })

  it('adds a household-aware expansion without editing the old migration boundary', () => {
    expect(householdMigration).toContain('create table if not exists public.meal_planner_households')
    expect(householdMigration).toContain('create table if not exists public.meal_planner_admins')
    expect(householdMigration).toContain('create table if not exists public.meal_planner_invites')
    expect(householdMigration).toContain('add column if not exists household_id uuid')
    expect(householdMigration).toContain('create or replace function public.can_access_meal_planner_state')
    expect(householdMigration).toContain('create or replace function public.get_my_meal_planner_household')
    expect(householdMigration).toContain('create or replace function public.create_meal_planner_invite')
    expect(householdMigration).toContain('create or replace function public.redeem_meal_planner_invite')
    expect(householdMigration).toContain('create or replace function public.enroll_meal_planner_household')
    expect(householdMigration).toContain('if not public.can_access_meal_planner_state(requested_id) then')
    expect(householdMigration).not.toContain("requested_id is distinct from 'household'")
  })

  it('removes the hard single-state constraint while keeping legacy writes legacy-only', () => {
    for (const source of [sql, householdMigration]) {
      expect(source).toContain('drop constraint if exists meal_planner_household_state_id')
      expect(source).not.toContain('add constraint meal_planner_household_state_id')
      expect(source).toContain("household.state_id = 'household'")
      expect(source).toContain("id = 'household'")
      expect(source).toContain('drop policy if exists "household can create meal planner"')
      expect(source).toContain('drop policy if exists "household can update meal planner"')
    }
  })

  it('locks household metadata behind RLS/RPCs and stores only credential hashes', () => {
    for (const table of [
      'meal_planner_households',
      'meal_planner_admins',
      'meal_planner_invites',
      'meal_planner_members',
    ]) {
      expect(sql).toContain(`alter table public.${table} enable row level security;`)
      expect(sql).toContain(`revoke all on table public.${table} from anon, authenticated;`)
      expect(householdMigration).toContain(`alter table public.${table} enable row level security;`)
      expect(householdMigration).toContain(`revoke all on table public.${table} from anon, authenticated;`)
    }

    expect(householdMigration).toContain('extensions.gen_random_bytes(32)')
    expect(householdMigration).toContain('extensions.gen_random_bytes(12)')
    expect(householdMigration).toContain("extensions.digest(invite_token, 'sha256')")
    expect(householdMigration).toContain("extensions.digest(join_code, 'sha256')")
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
      expect(sql).toContain(`jsonb_typeof(value -> '${field}') is not distinct from '${type}'`)
      expect(hardeningMigration).toContain(`jsonb_typeof(value -> '${field}') is not distinct from '${type}'`)
    }
  })

  it('retires the obsolete August contract and documents a later household-aware contract', () => {
    expect(existsSync(obsoleteContract)).toBe(false)
    expect(readdirSync(resolve(root, 'supabase/migrations')))
      .not.toContain('20260819020000_contract_versioned_sync.sql')
    expect(rolloutDoc).not.toContain('git mv supabase/contracts/20260819020000_contract_versioned_sync.sql')
    expect(rolloutDoc).toContain('new later-timestamped contract migration')
    expect(securityTracker).toContain('previously prepared August contract is superseded')
    expect(deployWorkflow).not.toContain('Contract SQL remains under supabase/contracts')
  })

  it('documents owner bootstrap, manual admin designation, and household invites', () => {
    expect(setupDoc).toContain('meal_planner_admins')
    expect(setupDoc).toContain('Invite household')
    expect(setupDoc).toContain('seven days')
    expect(setupDoc).toContain('household-specific')
    expect(sql).toContain('meal_planner_admins')
    expect(sql).toContain("'household',\n  'Household'")
  })

  it('does not reopen legacy writes when setup initializes a fresh project', () => {
    expect(sql).toContain("when to_regclass('public.meal_planner_state') is null then 'contract'")
    expect(sql).not.toContain('grant select, insert, update on table public.meal_planner_state')
    expect(sql).toContain("where id = 'versioned_sync' and phase = 'expand'")
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
