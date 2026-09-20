import { supabase } from '../supabase'
import { normalizeState } from '../persistence/normalizeState'
import type { HouseholdInvite, HouseholdSession, RedeemedHousehold } from './types'

type HouseholdRow = {
  household_id?: string
  state_id?: string
  household_name?: string
  is_admin?: boolean
  join_code?: string
  invite_token?: string
  expires_at?: string
}

function firstRow(data: unknown): HouseholdRow | null {
  if (Array.isArray(data)) return (data[0] as HouseholdRow | undefined) ?? null
  return data && typeof data === 'object' ? data as HouseholdRow : null
}

function toHouseholdSession(row: HouseholdRow | null): HouseholdSession | null {
  if (!row?.household_id || !row.state_id || !row.household_name) return null
  return {
    householdId: row.household_id,
    stateId: row.state_id,
    householdName: row.household_name,
    isAdmin: row.is_admin === true,
  }
}

export async function getMyHousehold(): Promise<HouseholdSession | null> {
  const { data, error } = await supabase.rpc('get_my_meal_planner_household')
  if (error) throw error
  return toHouseholdSession(firstRow(data))
}

export async function enrollHousehold(accessCode: string): Promise<HouseholdSession | null> {
  const { data, error } = await supabase.rpc('enroll_meal_planner_household', {
    access_code: accessCode,
  })
  if (error) throw error
  return toHouseholdSession(firstRow(data))
}

export async function createHouseholdInvite(): Promise<HouseholdInvite> {
  const { data, error } = await supabase.rpc('create_meal_planner_invite')
  if (error) throw error

  const row = firstRow(data)
  if (!row?.invite_token || !row.expires_at) {
    throw new Error('Supabase returned an invalid invitation response.')
  }

  return {
    token: row.invite_token,
    expiresAt: row.expires_at,
  }
}

export async function redeemHouseholdInvite(
  token: string,
  householdName: string,
): Promise<RedeemedHousehold> {
  const { data, error } = await supabase.rpc('redeem_meal_planner_invite', {
    invite_token: token,
    requested_household_name: householdName.trim(),
    initial_state: normalizeState({}),
  })
  if (error) throw error

  const row = firstRow(data)
  const household = toHouseholdSession(row)
  if (!household || !row?.join_code) {
    throw new Error('Supabase returned an invalid household response.')
  }

  return {
    ...household,
    joinCode: row.join_code,
  }
}
