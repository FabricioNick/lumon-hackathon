/* Praise Kier */
import { useEffect } from 'react'
import type { ReactNode } from 'react'
import { Cp45Context, useCp45 } from './context'
import type { Cp45Runtime } from './context'
import { clearRefinerVersions } from '../refiners/services/refinerVersions'
export function Cp45Provider({ runtime, children }: { runtime: Cp45Runtime; children: ReactNode }) {
  useEffect(
    () => () => clearRefinerVersions(runtime.request),
    [runtime.request, runtime.sessionKey],
  )
  return (
    <Cp45Context.Provider key={`${runtime.sessionKey}:${runtime.userId}`} value={runtime}>
      {children}
    </Cp45Context.Provider>
  )
}
export function Permission({ name, children }: { name: string; children: ReactNode }) {
  return useCp45().permissions.includes(name) ? children : <p role="alert">Sin permiso: {name}</p>
}

export function Permissions({
  permissions,
  children,
}: {
  permissions: string[]
  children: ReactNode
}) {
  return permissions.reduceRight<ReactNode>(
    (child, name) => <Permission name={name}>{child}</Permission>,
    children,
  )
}
