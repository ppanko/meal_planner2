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
const contractSql = readFileSync(resolve(
  process.cwd(),
  'supabase/contracts/20260819020000_contract_versioned_sync.sql',
), 'utf8')

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

async function createTestDatabase() {
  const db = await PGlite.create()

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

  return db
}

async function installLegacyStateSchema(db: PGlite) {
  await db.exec(`
    create table public.meal_planner_members (
      user_id uuid primary key references auth.users(id) on delete cascade
    );
    create function public.is_meal_planner_authorized()
    returns boolean
    language sql
    stable
    security definer
    set search_path = public, pg_temp
    as $$
      select auth.uid() is not null and exists (
        select 1 from public.meal_planner_members where user_id = auth.uid()
      );
    $$;
    revoke all on function public.is_meal_planner_authorized() from public;
    grant execute on function public.is_meal_planner_authorized() to authenticated;

    create table public.meal_planner_state (
      id text primary key,
      state jsonb not null,
      updated_at timestamptz not null default now()
    );
    grant select, insert, update on table public.meal_planner_state to authenticated;
    alter table public.meal_planner_state enable row level security;
    create policy "household can read meal planner"
      on public.meal_planner_state for select to authenticated
      using ((select public.is_meal_planner_authorized()));
    create policy "household can create meal planner"
      on public.meal_planner_state for insert to authenticated
      with check ((select public.is_meal_planner_authorized()));
    create policy "household can update meal planner"
      on public.meal_planner_state for update to authenticated
      using ((select public.is_meal_planner_authorized()))
      with check ((select public.is_meal_planner_authorized()));
  `)
}

it('executes the Supabase schema and enforces the state-write boundary', async () => {
  const db = await createTestDatabase()
  const userId = '10000000-0000-4000-8000-000000000001'
  const mutationId = '20000000-0000-4000-8000-000000000001'
  const nextMutationId = '20000000-0000-4000-8000-000000000002'
  const saveQuery = 'select status, revision from public.save_meal_planner_state($1, $2::jsonb, $3, $4)'

  try {
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

it('bridges legacy upserts through expansion and removes them only at contract', async () => {
  const db = await createTestDatabase()
  const userId = '10000000-0000-4000-8000-000000000001'
  const mutationId = '20000000-0000-4000-8000-000000000003'
  const saveQuery = 'select status, revision from public.save_meal_planner_state($1, $2::jsonb, $3, $4)'

  try {
    // This is the relevant surface of the schema used by the currently
    // deployed direct-upsert client, before versioned-sync migrations exist.
    await installLegacyStateSchema(db)

    await db.query('insert into auth.users (id) values ($1)', [userId])
    await db.query('insert into public.meal_planner_members (user_id) values ($1)', [userId])
    await db.query("select set_config('request.jwt.claim.sub', $1, false)", [userId])

    await db.exec('set role authenticated')
    await db.query(`
      insert into public.meal_planner_state (id, state, updated_at)
      values ($1, $2::jsonb, now())
    `, ['household', JSON.stringify(validState)])
    await db.exec('reset role')

    // If the first migration succeeds and the second one fails, the deployed
    // client must retain exactly its old direct-write behavior.
    await db.exec(migrations[0])
    await db.exec('set role authenticated')
    await db.query(`
      update public.meal_planner_state
      set state = $1::jsonb, updated_at = now()
      where id = 'household'
    `, [JSON.stringify({ ...validState, plannerNotes: { monday: 'partial' } })])
    const partialExpansion = await db.query<{ revision: number }>(`
      select revision from public.meal_planner_state where id = 'household'
    `)
    expect(partialExpansion.rows[0]).toEqual({ revision: 0 })
    await db.exec('reset role')

    await db.exec(migrations[1])

    const phase = await db.query<{ phase: string }>(`
      select phase from public.meal_planner_release_state where id = 'versioned_sync'
    `)
    expect(phase.rows[0]).toEqual({ phase: 'expand' })

    const expansionPolicies = await db.query<{ count: number }>(`
      select count(*)::int as count
      from pg_policies
      where schemaname = 'public'
        and tablename = 'meal_planner_state'
        and cmd in ('INSERT', 'UPDATE')
    `)
    expect(expansionPolicies.rows[0]).toEqual({ count: 2 })

    await db.exec('set role authenticated')
    await db.query(`
      insert into public.meal_planner_state (id, state, updated_at)
      values ($1, $2::jsonb, now())
      on conflict (id) do update
      set state = excluded.state, updated_at = excluded.updated_at
    `, ['household', JSON.stringify({ ...validState, plannerNotes: { monday: 'legacy' } })])

    const afterLegacyWrites = await db.query<{ revision: number }>(`
      select revision from public.meal_planner_state where id = 'household'
    `)
    expect(afterLegacyWrites.rows[0]).toEqual({ revision: 1 })
    await db.exec('reset role')

    const archivedLegacyState = await db.query<{ revision: number }>(`
      select revision from public.meal_planner_state_versions order by revision
    `)
    expect(archivedLegacyState.rows).toEqual([{ revision: 0 }])

    await db.exec('set role authenticated')
    const saved = await db.query(saveQuery, [
      'household', JSON.stringify(validState), 1, mutationId,
    ])
    expect(saved.rows[0]).toMatchObject({ status: 'saved', revision: 2 })
    await db.exec('reset role')

    await db.exec(contractSql)

    const contracted = await db.query<{ phase: string }>(`
      select phase from public.meal_planner_release_state where id = 'versioned_sync'
    `)
    expect(contracted.rows[0]).toEqual({ phase: 'contract' })

    const contractPolicies = await db.query<{ count: number }>(`
      select count(*)::int as count
      from pg_policies
      where schemaname = 'public'
        and tablename = 'meal_planner_state'
        and cmd in ('INSERT', 'UPDATE')
    `)
    expect(contractPolicies.rows[0]).toEqual({ count: 0 })

    const compatibilityTrigger = await db.query<{ count: number }>(`
      select count(*)::int as count
      from pg_trigger
      where tgrelid = 'public.meal_planner_state'::regclass
        and tgname = 'guard_legacy_meal_planner_write'
        and not tgisinternal
    `)
    expect(compatibilityTrigger.rows[0]).toEqual({ count: 0 })

    const validatorExecute = await db.query<{ allowed: boolean }>(`
      select has_function_privilege(
        'authenticated',
        'public.meal_planner_state_is_valid(jsonb)',
        'EXECUTE'
      ) as allowed
    `)
    expect(validatorExecute.rows[0]).toEqual({ allowed: false })

    await db.exec('set role authenticated')
    await expect(db.query(`
      update public.meal_planner_state set state = $1::jsonb where id = 'household'
    `, [JSON.stringify(validState)])).rejects.toThrow(/permission denied/i)

    const rpcAfterContract = await db.query(saveQuery, [
      'household', JSON.stringify(validState), 2,
      '20000000-0000-4000-8000-000000000004',
    ])
    expect(rpcAfterContract.rows[0]).toMatchObject({ status: 'saved', revision: 3 })
  } finally {
    await db.close()
  }
}, 30000)

it('keeps setup.sql safe to rerun against an expansion-phase database', async () => {
  const db = await createTestDatabase()
  const userId = '10000000-0000-4000-8000-000000000001'
  const mutationId = '20000000-0000-4000-8000-000000000005'

  try {
    await installLegacyStateSchema(db)
    await db.query('insert into auth.users (id) values ($1)', [userId])
    await db.query('insert into public.meal_planner_members (user_id) values ($1)', [userId])
    await db.query("select set_config('request.jwt.claim.sub', $1, false)", [userId])
    await db.exec('set role authenticated')
    await db.query(`
      insert into public.meal_planner_state (id, state)
      values ($1, $2::jsonb)
    `, ['household', JSON.stringify(validState)])
    await db.exec('reset role')

    await db.exec(setupSql)
    await db.exec(setupSql)

    const phase = await db.query<{ phase: string }>(`
      select phase from public.meal_planner_release_state where id = 'versioned_sync'
    `)
    expect(phase.rows[0]).toEqual({ phase: 'expand' })

    await db.exec('set role authenticated')
    await db.query(`
      update public.meal_planner_state
      set state = $1::jsonb
      where id = 'household'
    `, [JSON.stringify({ ...validState, plannerNotes: { monday: 'rerun' } })])

    const saved = await db.query<{ revision: number }>(`
      select revision
      from public.save_meal_planner_state($1, $2::jsonb, $3, $4)
    `, ['household', JSON.stringify(validState), 1, mutationId])
    expect(saved.rows[0]).toEqual({ revision: 2 })
    const mutation = await db.query<{ last_mutation_id: string }>(`
      select last_mutation_id
      from public.meal_planner_state
      where id = 'household'
    `)
    expect(mutation.rows[0]).toEqual({ last_mutation_id: mutationId })
  } finally {
    await db.close()
  }
}, 30000)
