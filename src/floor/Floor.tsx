import { memo, useSyncExternalStore } from 'react'
import type { FloorClient } from './client'
import { CELL } from '../files/VirtualGrid'

export const FloorPanel = memo(function FloorPanel({ client }: { client: FloorClient }) {
  const state = useSyncExternalStore(client.subscribe, client.snapshot)
  return <aside aria-label="Piso compartido" className="border border-teal-800 rounded p-3 my-3"><p role="status">{state.message}</p><p>{state.members.length ? `Presentes: ${state.members.map(m => m.displayName).join(', ')}` : 'Sin presencia disponible'}</p>{state.claims.length > 0 && <ul aria-label="Reservas">{state.claims.map(claim => <li key={claim.claimId}>{claim.displayName}: {claim.cells.length} celdas reservadas{state.own === claim.claimId ? ' (tu reserva)' : ''}</li>)}</ul>}</aside>
})
export const FloorOverlay = memo(function FloorOverlay({ client, userId }: { client: FloorClient; userId: number }) {
  const state = useSyncExternalStore(client.subscribe, client.snapshot)
  const cursors = useSyncExternalStore(client.subscribeCursors, client.cursorSnapshot)
  return <div aria-hidden="true" className="pointer-events-none absolute inset-0 overflow-hidden">
    {state.claims.filter(c => c.userId !== userId).flatMap(claim => claim.cells.map(cell => <div key={`${claim.claimId}:${cell.r}:${cell.c}`} className="absolute border-2 border-orange-400 bg-orange-400/15" style={{ left: cell.c * CELL, top: cell.r * CELL, width: CELL, height: CELL }} title={`Reservado por ${claim.displayName}`} />))}
    {cursors.filter(m => m.userId !== userId && m.r !== null && m.c !== null).map(member => <div key={member.userId} className="absolute border-2 border-fuchsia-400" style={{ left: member.c! * CELL, top: member.r! * CELL, width: CELL, height: CELL }}><span className="absolute top-full left-0 text-xs bg-fuchsia-950 text-white whitespace-nowrap px-1">{member.displayName}</span></div>)}
  </div>
})
