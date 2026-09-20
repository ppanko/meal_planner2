export type HouseholdSession = {
  householdId: string
  stateId: string
  householdName: string
  isAdmin: boolean
}

export type HouseholdInvite = {
  token: string
  expiresAt: string
}

export type RedeemedHousehold = HouseholdSession & {
  joinCode: string
}
