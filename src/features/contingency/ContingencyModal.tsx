/* Praise Kier */
import { useEffect, useRef } from 'react'
import { useContingency } from './useContingency'
export function ContingencyModal() {
  const {contingency,error,busy,ack}=useContingency()
  const dialog=useRef<HTMLDialogElement>(null)
  const button=useRef<HTMLButtonElement>(null)
  useEffect(()=>{
    if(!contingency || !dialog.current) return
    const element=dialog.current
    const previous=document.activeElement
    if(!element.open) element.showModal()
    button.current?.focus()
    return ()=>{element.close();if(previous instanceof HTMLElement && previous.isConnected) previous.focus()}
  },[contingency?.id])
  return <dialog ref={dialog} aria-modal="true" aria-labelledby="contingency-title" aria-describedby="contingency-message" onCancel={event=>event.preventDefault()} tabIndex={-1} className="m-auto w-[min(92vw,32rem)] rounded-lg border border-slate-500 bg-white p-8 text-slate-900 shadow-xl backdrop:bg-slate-950/70">
    {contingency && <><h2 id="contingency-title" className="mb-4 text-2xl font-semibold">Contingencia de horas extra</h2><p id="contingency-message" className="mb-6 whitespace-pre-wrap">{contingency.message}</p><p>Contingencia #{contingency.id}</p>{error && <p role="alert" className="my-4 text-red-800">{error}</p>}<button ref={button} disabled={busy} onClick={()=>void ack(contingency.id)}>{busy?'Confirmando…':'Confirmar contingencia'}</button></>}
  </dialog>
}
