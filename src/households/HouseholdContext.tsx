import { createContext, useContext } from 'react'
import type { ReactNode } from 'react'
import type { HouseholdSession } from './types'
import './households.css'

const HouseholdContext = createContext<HouseholdSession | null>(null)

export function HouseholdProvider({
  value,
  children,
}: {
  value: HouseholdSession
  children: ReactNode
}) {
  return <HouseholdContext.Provider value={value}>{children}</HouseholdContext.Provider>
}

export function useHouseholdSession(): HouseholdSession {
  const value = useContext(HouseholdContext)
  if (!value) throw new Error('Household session is unavailable.')
  return value
}
