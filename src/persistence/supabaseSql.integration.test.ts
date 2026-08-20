// @vitest-environment node

import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { PGlite } from '@electric-sql/pglite'
import { expect, it } from 'vitest'

const setupSql = readFileSync(resolve(process.cwd(), 'supabase/setup.sql'), 'utf8')
  .replace('create extension if not exists pgcrypto with schema extensions;', '')
const migrations = [
  'supabase/migrations/20260819000000_versioned_sync.sql',
  'supabase/migrations/20260819010000_harden_state_boundary.sql',
].map((path) => readFileSync(resolve(process.cwd(), path), 'utf8'))

const validState = {
  ingredients: [],
  meals: [],
  planner: {},
  shoppingChecked: {},
  manualShoppingItems: {},
  proteinCategories: [],
  plannerRowsByWeek: {},
  shoppingHistory: [],
  plannerNotes: {},
  shoppingPurchasesByWeek: {},
  shoppingDismissedByWeek: {},
  shoppingCategories: [],
  shoppingCategoryOrder: [],
}

it('executes the Supabase schema and enforces the state-write boundary', async () => {
  const db = await PGlite.create()
  const userId = '10000000-0000-4000-8000-000000000001'
  const mutationId = '20000000-0000-4000-8000-000000000001'
  const nextMutationId = '20000000-0000-4000-8000-000000000002'
  const saveQuery = 'select status, revision from public.save_meal_planner_state($1, $2::jsonb, $3, $4)'

  try {
    // PGlite executes real PostgreSQL and PL/pgSQL. These two deterministic
    // functions replace pgcrypto only for the one-time access-code bootstrap;
    // none of the state-boundary behavior under test depends on their output.
    await db.exec(`
      create role anon;
      create role authenticated;
      create schema auth;
      create schema extensions;
      create function extensions.gen_random_bytes(requested_length integer)
      returns bytea
      language sql
      immutable
      as $$ select decode(repeat('00', requested_length), 'hex'); $$;
      create function extensions.digest(value text, algorithm text)
      returns bytea
      language sql
      immutable
      as $$ select decode(repeat('00', 32), 'hex'); $$;
      create table auth.users (id uuid primary key);
      create function auth.uid()
      returns uuid
      language sql
      stable
      as $$
        select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid;
      $$;
      create publication supabase_realtime;
    `)

    await db.exec(setupSql)
    for (const migration of migrations) await db.exec(migration)

    await db.query('insert into auth.users (id) values ($1)', [userId])
    await db.query("select set_config('request.jwt.claim.sub', $1, false)", [userId])

    await expect(db.query(saveQuery, [
      'household', JSON.stringify(validState), 0, mutationId,
    ])).rejects.toThrow('Not authorized')

    await db.query('insert into public.meal_planner_members (user_id) values ($1)', [userId])

    const saved = await db.query(saveQuery, [
      'household', JSON.stringify(validState), 0, mutationId,
    ])
    expect(saved.rows[0]).toMatchObject({ status: 'saved', revision: 1 })

    const replayed = await db.query(saveQuery, [
      'household', JSON.stringify(validState), 0, mutationId,
    ])
    expect(replayed.rows[0]).toMatchObject({ status: 'saved', revision: 1 })

    const conflict = await db.query(saveQuery, [
      'household', JSON.stringify(validState), 0, nextMutationId,
    ])
    expect(conflict.rows[0]).toMatchObject({ status: 'conflict', revision: 1 })

    await expect(db.query(saveQuery, [
      'other-household', JSON.stringify(validState), 0, nextMutationId,
    ])).rejects.toThrow('Invalid shared state ID')
    await expect(db.query(saveQuery, [
      'household', JSON.stringify(validState), -1, nextMutationId,
    ])).rejects.toThrow('Invalid expected revision')
    await expect(db.query(saveQuery, [
      'household', JSON.stringify(validState), 1, null,
    ])).rejects.toThrow('Mutation ID is required')
    await expect(db.query(saveQuery, [
      'household', JSON.stringify({ ...validState, meals: {} }), 1, nextMutationId,
    ])).rejects.toThrow('Invalid shared state payload')
    await expect(db.query(saveQuery, [
      'household',
      JSON.stringify({ ...validState, planner: JSON.parse('{"__proto__": {}}') }),
      1,
      nextMutationId,
    ])).rejects.toThrow('Invalid shared state payload')
    await expect(db.query(saveQuery, [
      'household',
      JSON.stringify({ ...validState, padding: 'x'.repeat(760000) }),
      1,
      nextMutationId,
    ])).rejects.toThrow('Invalid shared state payload')

    const policy = await db.query<{ qual: string }>(`
      select qual
      from pg_policies
      where schemaname = 'public'
        and tablename = 'meal_planner_state'
        and policyname = 'household can read meal planner'
    `)
    expect(policy.rows[0]?.qual).toContain("id = 'household'::text")

    const directWritePolicies = await db.query<{ count: number }>(`
      select count(*)::int as count
      from pg_policies
      where schemaname = 'public'
        and tablename = 'meal_planner_state'
        and cmd in ('INSERT', 'UPDATE')
    `)
    expect(directWritePolicies.rows[0]).toEqual({ count: 0 })
  } finally {
    await db.close()
  }
}, 30000)
