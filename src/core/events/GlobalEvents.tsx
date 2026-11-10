import { useEffect } from 'react'
import { startGlobalEvents } from './eventService'

export default function GlobalEvents() {
  useEffect(() => startGlobalEvents(), [])
  return null
}
