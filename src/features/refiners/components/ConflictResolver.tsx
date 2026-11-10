/* Praise Kier */
import { useState } from 'react'
import type { Refiner, RefinerPatch } from '../types/refiners'
export interface RefinerConflict {
  original: Refiner
  local: RefinerPatch
  current: Refiner
  etag: string
}
export function ConflictResolver({
  conflict,
  busy,
  onResolve,
  onCancel,
}: {
  conflict: RefinerConflict
  busy: boolean
  onResolve: (patch: RefinerPatch) => void
  onCancel: () => void
}) {
  const [choices, setChoices] = useState<Record<string, 'local' | 'server'>>({})
  const fields = Object.keys(conflict.local) as Array<keyof RefinerPatch>
  function value(refiner: Refiner, key: keyof RefinerPatch) {
    if (key === 'departmentId') return refiner.department.name
    if (key === 'badgeMediaId') return refiner.badge?.url ?? 'Sin fotocheck'
    return refiner[key]
  }
  function resolve() {
    const patch = Object.fromEntries(
      Object.entries(conflict.local).filter(([key]) => choices[key] === 'local'),
    ) as RefinerPatch
    onResolve(patch)
  }
  return (
    <section
      aria-labelledby="conflict-title"
      className="my-6 space-y-4 rounded border-2 border-amber-700 p-4"
    >
      <h2 id="conflict-title" className="text-xl font-semibold" tabIndex={-1}>
        El expediente cambió
      </h2>
      <p>
        Elige qué valor conservar en cada campo antes de guardar contra la versión{' '}
        {conflict.current.version}.
      </p>
      <div className="overflow-x-auto">
        <table className="w-full text-left">
          <thead>
            <tr>
              {['Campo', 'Original', 'Tu cambio', 'Servidor', 'Conservar'].map((label) => (
                <th key={label} className="p-2">
                  {label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {fields.map((key) => (
              <tr key={key}>
                <th className="p-2">{key}</th>
                <td className="max-w-48 break-words p-2">
                  {String(value(conflict.original, key))}
                </td>
                <td className="max-w-48 break-words p-2">{String(conflict.local[key])}</td>
                <td className="max-w-48 break-words p-2">{String(value(conflict.current, key))}</td>
                <td className="p-2">
                  <label className="block">
                    <input
                      type="radio"
                      name={`resolve-${key}`}
                      checked={choices[key] === 'local'}
                      onChange={() => setChoices({ ...choices, [key]: 'local' })}
                    />{' '}
                    Mi cambio
                  </label>
                  <label className="block">
                    <input
                      type="radio"
                      name={`resolve-${key}`}
                      checked={choices[key] === 'server'}
                      onChange={() => setChoices({ ...choices, [key]: 'server' })}
                    />{' '}
                    Servidor
                  </label>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <button disabled={busy || fields.some((key) => !choices[key])} onClick={resolve}>
        Guardar resolución
      </button>{' '}
      <button disabled={busy} onClick={onCancel}>
        Volver al editor
      </button>
    </section>
  )
}
