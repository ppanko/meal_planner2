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
  'supabase/migrations/20260915000000_multi_household_expansion.sql',
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

const users = {
  legacy: '10000000-0000-4000-8000-000000000001',
  invited: '10000000-0000-4000-8000-000000000002',
  replay: '10000000-0000-4000-8000-000000000003',
  joiner: '10000000-0000-4000-8000-000000000004',
}

async function createTestDatabase() {
  const db = await PGlite.create()

  // PGlite executes PostgreSQL/PLpgSQL but does not install Supabase pgcrypto.
  // These deterministic helpers preserve the function signatures while making
  // each generated token distinct for the integration tests.
  await db.exec(`
    create role anon;
    create role authenticated;
    create schema auth;
    create schema extensions;
    create sequence extensions.test_random_sequence;
    create function extensions.gen_random_bytes(requested_length integer)
    returns bytea
    language plpgsql
    volatile
    as $$
    declare
      seed text;
    begin
      seed := md5(nextval('extensions.test_random_sequence')::text);
      return decode(substr(repeat(seed, 8), 1, requested_length * 2), 'hex');
    end;
    $$;
    create function extensions.digest(value text, algorithm text)
    returns bytea
    language sql
    immutable
    as $$ select decode(md5(value) || md5(value || algorithm), 'hex'); $$;
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

async function setUser(db: PGlite, userId: string) {
  await db.exec('reset role')
  await db.query("select set_config('request.jwt.claim.sub', $1, false)", [userId])
  await db.exec('set role authenticated')
}

async function clearUser(db: PGlite) {
  await db.exec('reset role')
  await db.query("select set_config('request.jwt.claim.sub', '', false)")
}

async function installLegacyStateSchema(db: PGlite) {
  await db.exec(`
    create table public.meal_planner_access (
      id text primary key,
      code_hash text not null,
      created_at timestamptz not null default now()
    );
    insert into public.meal_planner_access (id, code_hash)
    values (
      'household',
      encode(extensions.digest('legacy-code', 'sha256'), 'hex')
    );
    alter table public.meal_planner_access enable row level security;
    revoke all on table public.meal_planner_access from anon, authenticated;

    create table public.meal_planner_members (
      user_id uuid primary key references auth.users(id) on delete cascade,
      enrolled_at timestamptz not null default now()
    );
    alter table public.meal_planner_members enable row level security;
    revoke all on table public.meal_planner_members from anon, authenticated;

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

    create function public.enroll_meal_planner_device(access_code text)
    returns boolean
    language plpgsql
    security definer
    set search_path = public, extensions, pg_temp
    as $$
    begin
      if auth.uid() is null then return false; end if;
      if encode(extensions.digest(btrim(access_code), 'sha256'), 'hex') <>
         (select code_hash from public.meal_planner_access where id = 'household') then
        return false;
      end if;
      insert into public.meal_planner_members (user_id) values (auth.uid())
      on conflict (user_id) do nothing;
      return true;
    end;
    $$;
    revoke all on function public.enroll_meal_planner_device(text) from public;
    grant execute on function public.enroll_meal_planner_device(text) to authenticated;

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

it('executes fresh setup with household-scoped RPC state and no direct write bridge', async () => {
  const db = await createTestDatabase()
  const stateId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
  const mutationId = '20000000-0000-4000-8000-000000000001'
  const otherMutationId = '20000000-0000-4000-8000-000000000002'

  try {
    await db.exec(setupSql)
    for (const userId of Object.values(users)) {
      await db.query('insert into auth.users (id) values ($1)', [userId])
    }

    const bootstrapHashes = await db.query<{ access_hash: string; household_hash: string }>(`
      select access.code_hash as access_hash, household.code_hash as household_hash
      from public.meal_planner_access access
      join public.meal_planner_households household on household.state_id = access.id
      where access.id = 'household'
    `)
    expect(bootstrapHashes.rows[0].household_hash).toBe(bootstrapHashes.rows[0].access_hash)

    const phase = await db.query<{ phase: string }>(`
      select phase from public.meal_planner_release_state where id = 'versioned_sync'
    `)
    expect(phase.rows[0]).toEqual({ phase: 'contract' })

    const constraint = await db.query<{ count: number }>(`
      select count(*)::int as count
      from pg_constraint
      where conname = 'meal_planner_household_state_id'
    `)
    expect(constraint.rows[0]).toEqual({ count: 0 })

    const rls = await db.query<{ relname: string; relrowsecurity: boolean }>(`
      select relname, relrowsecurity
      from pg_class
      where relname in (
        'meal_planner_households',
        'meal_planner_admins',
        'meal_planner_invites',
        'meal_planner_members'
      )
      order by relname
    `)
    expect(rls.rows).toHaveLength(4)
    expect(rls.rows.every((row) => row.relrowsecurity)).toBe(true)

    await setUser(db, users.replay)
    await expect(db.query('select * from public.meal_planner_households'))
      .rejects.toThrow(/permission denied/)
    const nullLegacyEnrollment = await db.query<{ enrolled: boolean }>(`
      select public.enroll_meal_planner_device(null) as enrolled
    `)
    expect(nullLegacyEnrollment.rows[0]).toEqual({ enrolled: false })
    await clearUser(db)

    await db.query(`
      insert into public.meal_planner_households (id, state_id, name, code_hash)
      values ($1, $2, 'Fresh household', 'fresh-hash')
    `, [stateId, stateId])
    await db.query(`
      insert into public.meal_planner_members (user_id, household_id)
      values ($1, $2)
    `, [users.invited, stateId])

    await setUser(db, users.invited)
    const saved = await db.query<{ status: string; revision: number }>(`
      select status, revision
      from public.save_meal_planner_state($1, $2::jsonb, 0, $3)
    `, [stateId, JSON.stringify(validState), mutationId])
    expect(saved.rows[0]).toEqual({ status: 'saved', revision: 1 })

    await expect(db.query(`
      select status from public.save_meal_planner_state('household', $1::jsonb, 0, $2)
    `, [JSON.stringify(validState), otherMutationId])).rejects.toThrow('Not authorized')

    const directPolicies = await db.query<{ count: number }>(`
      select count(*)::int as count
      from pg_policies
      where schemaname = 'public'
        and tablename = 'meal_planner_state'
        and cmd in ('INSERT', 'UPDATE')
    `)
    expect(directPolicies.rows[0]).toEqual({ count: 0 })
  } finally {
    await clearUser(db)
    await db.close()
  }
}, 30000)

it('migrates the legacy household while isolating invited households and stale clients', async () => {
  const db = await createTestDatabase()
  const legacyMutation = '20000000-0000-4000-8000-000000000010'
  const invitedMutation = '20000000-0000-4000-8000-000000000011'

  try {
    await installLegacyStateSchema(db)
    for (const userId of Object.values(users)) {
      await db.query('insert into auth.users (id) values ($1)', [userId])
    }
    await db.query('insert into public.meal_planner_members (user_id) values ($1)', [users.legacy])

    await setUser(db, users.legacy)
    await db.query(`
      insert into public.meal_planner_state (id, state, updated_at)
      values ('household', $1::jsonb, now())
    `, [JSON.stringify(validState)])
    await clearUser(db)

    for (const migration of migrations) await db.exec(migration)

    const phase = await db.query<{ phase: string }>(`
      select phase from public.meal_planner_release_state where id = 'versioned_sync'
    `)
    expect(phase.rows[0]).toEqual({ phase: 'expand' })

    const member = await db.query<{ state_id: string }>(`
      select household.state_id
      from public.meal_planner_members member
      join public.meal_planner_households household on household.id = member.household_id
      where member.user_id = $1
    `, [users.legacy])
    expect(member.rows[0]).toEqual({ state_id: 'household' })

    await setUser(db, users.legacy)
    const legacyAuthorized = await db.query<{ allowed: boolean }>(`
      select public.is_meal_planner_authorized() as allowed
    `)
    expect(legacyAuthorized.rows[0]).toEqual({ allowed: true })

    await db.query(`
      update public.meal_planner_state
      set state = $1::jsonb
      where id = 'household'
    `, [JSON.stringify({ ...validState, plannerNotes: { monday: 'stale legacy write' } })])

    const afterLegacyWrite = await db.query<{ revision: number }>(`
      select revision from public.meal_planner_state where id = 'household'
    `)
    expect(afterLegacyWrite.rows[0]).toEqual({ revision: 1 })

    await setUser(db, users.invited)
    await expect(db.query('select * from public.create_meal_planner_invite()'))
      .rejects.toThrow('Not authorized')

    await db.exec('reset role')
    await db.query('insert into public.meal_planner_admins (user_id) values ($1)', [users.legacy])
    await setUser(db, users.legacy)
    const invite = await db.query<{ invite_token: string }>(`
      select invite_token from public.create_meal_planner_invite()
    `)
    expect(invite.rows[0]?.invite_token).toMatch(/^[a-f0-9]{64}$/)
    const invalidStateInvite = await db.query<{ invite_token: string }>(`
      select invite_token from public.create_meal_planner_invite()
    `)
    const invalidNameInvite = await db.query<{ invite_token: string }>(`
      select invite_token from public.create_meal_planner_invite()
    `)
    const expiredInvite = await db.query<{ invite_token: string }>(`
      select invite_token from public.create_meal_planner_invite()
    `)
    const lateFailureInvite = await db.query<{ invite_token: string }>(`
      select invite_token from public.create_meal_planner_invite()
    `)

    await db.exec('reset role')
    const storedInvite = await db.query<{
      token_hash: string
      expected_hash: string
      lifetime_seconds: number
    }>(`
      select
        token_hash,
        encode(extensions.digest($1, 'sha256'), 'hex') as expected_hash,
        extract(epoch from (expires_at - created_at))::int as lifetime_seconds
      from public.meal_planner_invites
      where token_hash = encode(extensions.digest($1, 'sha256'), 'hex')
    `, [invite.rows[0].invite_token])
    expect(storedInvite.rows[0].token_hash).toBe(storedInvite.rows[0].expected_hash)
    expect(storedInvite.rows[0].token_hash).not.toBe(invite.rows[0].invite_token)
    expect(storedInvite.rows[0].lifetime_seconds).toBe(7 * 24 * 60 * 60)
    await db.query(`
      update public.meal_planner_invites
      set expires_at = now() - interval '1 minute'
      where token_hash = encode(extensions.digest($1, 'sha256'), 'hex')
    `, [expiredInvite.rows[0].invite_token])

    await setUser(db, users.invited)
    await expect(db.query(`
      select * from public.redeem_meal_planner_invite($1, 'Invalid state', '{}'::jsonb)
    `, [invalidStateInvite.rows[0].invite_token])).rejects.toThrow('Invalid shared state payload')
    await expect(db.query(`
      select * from public.redeem_meal_planner_invite($1, $2, $3::jsonb)
    `, [invalidNameInvite.rows[0].invite_token, 'Invalid\nname', JSON.stringify(validState)]))
      .rejects.toThrow('Invalid household name')
    await expect(db.query(`
      select * from public.redeem_meal_planner_invite($1, 'Expired', $2::jsonb)
    `, [expiredInvite.rows[0].invite_token, JSON.stringify(validState)]))
      .rejects.toThrow('Invitation is invalid, expired, or already used')

    await db.exec('reset role')
    await db.exec(`
      create function public.fail_new_household_state_for_test()
      returns trigger
      language plpgsql
      as $$
      begin
        if new.id <> 'household' then
          raise exception 'Injected late state insert failure';
        end if;
        return new;
      end;
      $$;

      create trigger fail_new_household_state_for_test
      before insert on public.meal_planner_state
      for each row execute function public.fail_new_household_state_for_test();
    `)
    await setUser(db, users.invited)
    await expect(db.query(`
      select * from public.redeem_meal_planner_invite($1, 'Must roll back', $2::jsonb)
    `, [lateFailureInvite.rows[0].invite_token, JSON.stringify(validState)]))
      .rejects.toThrow('Injected late state insert failure')
    await db.exec('reset role')
    await db.exec(`
      drop trigger fail_new_household_state_for_test on public.meal_planner_state;
      drop function public.fail_new_household_state_for_test();
    `)

    const failedRedemptions = await db.query<{ households: number; members: number; redeemed: number }>(`
      select
        (select count(*)::int from public.meal_planner_households) as households,
        (select count(*)::int from public.meal_planner_members) as members,
        (select count(*)::int from public.meal_planner_invites where redeemed_at is not null) as redeemed
    `)
    expect(failedRedemptions.rows[0]).toEqual({ households: 1, members: 1, redeemed: 0 })

    await setUser(db, users.invited)
    const redeemed = await db.query<{
      household_id: string
      state_id: string
      household_name: string
      join_code: string
    }>(`
      select household_id, state_id, household_name, join_code
      from public.redeem_meal_planner_invite($1, ' Invited home ', $2::jsonb)
    `, [invite.rows[0].invite_token, JSON.stringify(validState)])
    expect(redeemed.rows[0]).toMatchObject({ household_name: 'Invited home' })
    expect(redeemed.rows[0]?.state_id).not.toBe('household')
    expect(redeemed.rows[0]?.join_code).toMatch(/^[a-f0-9]{24}$/)

    const newLegacyAuthorization = await db.query<{ allowed: boolean }>(`
      select public.is_meal_planner_authorized() as allowed
    `)
    expect(newLegacyAuthorization.rows[0]).toEqual({ allowed: false })

    const legacyRowsVisible = await db.query<{ count: number }>(`
      select count(*)::int as count
      from public.meal_planner_state
      where id = 'household'
    `)
    expect(legacyRowsVisible.rows[0]).toEqual({ count: 0 })

    const staleWrite = await db.query<{ id: string }>(`
      update public.meal_planner_state
      set state = $1::jsonb
      where id = 'household'
      returning id
    `, [JSON.stringify(validState)])
    expect(staleWrite.rows).toEqual([])

    await expect(db.query(`
      select status from public.save_meal_planner_state('household', $1::jsonb, 1, $2)
    `, [JSON.stringify(validState), invitedMutation])).rejects.toThrow('Not authorized')

    const ownSave = await db.query<{ status: string; revision: number }>(`
      select status, revision
      from public.save_meal_planner_state($1, $2::jsonb, 1, $3)
    `, [redeemed.rows[0].state_id, JSON.stringify({ ...validState, plannerNotes: { monday: 'own' } }), invitedMutation])
    expect(ownSave.rows[0]).toEqual({ status: 'saved', revision: 2 })
    const replayedSave = await db.query<{ status: string; revision: number }>(`
      select status, revision
      from public.save_meal_planner_state($1, $2::jsonb, 1, $3)
    `, [redeemed.rows[0].state_id, JSON.stringify({ ...validState, plannerNotes: { monday: 'own' } }), invitedMutation])
    expect(replayedSave.rows[0]).toEqual({ status: 'saved', revision: 2 })
    const conflictedSave = await db.query<{ status: string; revision: number }>(`
      select status, revision
      from public.save_meal_planner_state($1, $2::jsonb, 1, $3)
    `, [
      redeemed.rows[0].state_id,
      JSON.stringify({ ...validState, plannerNotes: { monday: 'conflict' } }),
      '20000000-0000-4000-8000-000000000012',
    ])
    expect(conflictedSave.rows[0]).toEqual({ status: 'conflict', revision: 2 })

    await expect(db.query(`
      select * from public.enroll_meal_planner_household('legacy-code')
    `)).rejects.toThrow('This user already belongs to another household')
    await expect(db.query(`
      select * from public.redeem_meal_planner_invite($1, 'Another', $2::jsonb)
    `, [invalidNameInvite.rows[0].invite_token, JSON.stringify(validState)]))
      .rejects.toThrow('This user already belongs to a household')

    await setUser(db, users.legacy)
    const invitedRowsVisible = await db.query<{ count: number }>(`
      select count(*)::int as count
      from public.meal_planner_state
      where id = $1
    `, [redeemed.rows[0].state_id])
    expect(invitedRowsVisible.rows[0]).toEqual({ count: 0 })
    await expect(db.query(`
      select status from public.save_meal_planner_state($1, $2::jsonb, 2, $3)
    `, [
      redeemed.rows[0].state_id,
      JSON.stringify(validState),
      '20000000-0000-4000-8000-000000000013',
    ])).rejects.toThrow('Not authorized')

    await setUser(db, users.replay)
    await expect(db.query(`
      select * from public.redeem_meal_planner_invite($1, 'Replay', $2::jsonb)
    `, [invite.rows[0].invite_token, JSON.stringify(validState)]))
      .rejects.toThrow('Invitation is invalid, expired, or already used')

    await setUser(db, users.joiner)
    const joined = await db.query<{ state_id: string; household_name: string }>(`
      select state_id, household_name
      from public.enroll_meal_planner_household($1)
    `, [redeemed.rows[0].join_code])
    expect(joined.rows[0]).toEqual({
      state_id: redeemed.rows[0].state_id,
      household_name: 'Invited home',
    })

    await setUser(db, users.replay)
    const nullLegacyEnrollment = await db.query<{ enrolled: boolean }>(`
      select public.enroll_meal_planner_device(null) as enrolled
    `)
    expect(nullLegacyEnrollment.rows[0]).toEqual({ enrolled: false })
    const householdBeforeValidCode = await db.query<{ count: number }>(`
      select count(*)::int as count
      from public.get_my_meal_planner_household()
    `)
    expect(householdBeforeValidCode.rows[0]).toEqual({ count: 0 })

    const legacyEnrolled = await db.query<{ enrolled: boolean }>(`
      select public.enroll_meal_planner_device('legacy-code') as enrolled
    `)
    expect(legacyEnrolled.rows[0]).toEqual({ enrolled: true })
    const replayHousehold = await db.query<{ state_id: string }>(`
      select state_id from public.get_my_meal_planner_household()
    `)
    expect(replayHousehold.rows[0]).toEqual({ state_id: 'household' })

    const directPolicies = await db.query<{ count: number }>(`
      select count(*)::int as count
      from pg_policies
      where schemaname = 'public'
        and tablename = 'meal_planner_state'
        and cmd in ('INSERT', 'UPDATE')
    `)
    expect(directPolicies.rows[0]).toEqual({ count: 2 })

    await setUser(db, users.legacy)
    const legacyRpc = await db.query<{ status: string; revision: number }>(`
      select status, revision
      from public.save_meal_planner_state('household', $1::jsonb, 1, $2)
    `, [JSON.stringify(validState), legacyMutation])
    expect(legacyRpc.rows[0]).toEqual({ status: 'saved', revision: 2 })
  } finally {
    await clearUser(db)
    await db.close()
  }
}, 30000)

it('keeps setup.sql rerunnable after the multi-household expansion', async () => {
  const db = await createTestDatabase()

  try {
    await installLegacyStateSchema(db)
    await db.query('insert into auth.users (id) values ($1)', [users.legacy])
    await db.query('insert into public.meal_planner_members (user_id) values ($1)', [users.legacy])
    await setUser(db, users.legacy)
    await db.query(`
      insert into public.meal_planner_state (id, state)
      values ('household', $1::jsonb)
    `, [JSON.stringify(validState)])
    await clearUser(db)

    for (const migration of migrations) await db.exec(migration)
    await db.exec(setupSql)
    await db.exec(setupSql)

    const phase = await db.query<{ phase: string }>(`
      select phase from public.meal_planner_release_state where id = 'versioned_sync'
    `)
    expect(phase.rows[0]).toEqual({ phase: 'expand' })

    const legacyHouseholds = await db.query<{ count: number }>(`
      select count(*)::int as count
      from public.meal_planner_households
      where state_id = 'household'
    `)
    expect(legacyHouseholds.rows[0]).toEqual({ count: 1 })

    const orphanMembers = await db.query<{ count: number }>(`
      select count(*)::int as count
      from public.meal_planner_members
      where household_id is null
    `)
    expect(orphanMembers.rows[0]).toEqual({ count: 0 })
  } finally {
    await clearUser(db)
    await db.close()
  }
}, 30000)
