/* Praise Kier */
import { useEffect, useRef } from 'react'
import { useContingency } from './useContingency'
export function ContingencyModal() {
  const { contingency, error, busy, ack } = useContingency()
  const dialog = useRef<HTMLDialogElement>(null)
  const button = useRef<HTMLButtonElement>(null)
  const contingencyId = contingency?.id
  useEffect(() => {
    if (!contingencyId || !dialog.current) return
    const element = dialog.current
    const previous = document.activeElement
    if (!element.open) element.showModal()
    button.current?.focus()
    return () => {
      element.close()
      if (previous instanceof HTMLElement && previous.isConnected) previous.focus()
    }
  }, [contingencyId])
  return (
    <dialog
      ref={dialog}
      aria-modal="true"
      aria-labelledby="contingency-title"
      aria-describedby="contingency-message"
      onCancel={(event) => event.preventDefault()}
      onKeyDown={(event) => {
        if (event.key !== 'Tab') return
        const controls = Array.from(
          event.currentTarget.querySelectorAll<HTMLElement>(
            'button:not(:disabled), [href], input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex="0"]',
          ),
        )
        const first = controls[0]
        const last = controls[controls.length - 1]
        if (!first || !last) {
          event.preventDefault()
          event.currentTarget.focus()
          return
        }
        if (
          event.shiftKey &&
          (document.activeElement === first || document.activeElement === event.currentTarget)
        ) {
          event.preventDefault()
          last.focus()
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault()
          first.focus()
        }
      }}
      tabIndex={-1}
      className="cp45 m-auto w-[min(92vw,32rem)] rounded-lg border border-slate-500 bg-white p-8 text-slate-900 shadow-xl backdrop:bg-slate-950/70"
    >
      {contingency && (
        <>
          <h2 id="contingency-title" className="mb-4 text-2xl font-semibold">
            Contingencia de horas extra
          </h2>
          <p id="contingency-message" className="mb-6 whitespace-pre-wrap">
            {contingency.message}
          </p>
          <p>Contingencia #{contingency.id}</p>
          {error && (
            <p role="alert" className="my-4 text-red-800">
              {error}
            </p>
          )}
          <button ref={button} disabled={busy} onClick={() => void ack(contingency.id)}>
            {busy ? 'Confirmando…' : 'Confirmar contingencia'}
          </button>
        </>
      )}
    </dialog>
  )
}
