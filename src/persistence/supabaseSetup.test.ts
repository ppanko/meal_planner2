import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const sql = readFileSync(resolve(process.cwd(), 'supabase/setup.sql'), 'utf8')

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
})
