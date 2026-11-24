import { useContext } from 'react'
import { RallyContext } from '../context/contexts'

export function useRally() {
  const ctx = useContext(RallyContext)
  if (!ctx) {
    throw new Error('useRally must be used within a RallyProvider')
  }
  return ctx
}

