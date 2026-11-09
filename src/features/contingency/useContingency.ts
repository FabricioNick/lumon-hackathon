import { useEffect, useRef, useState } from 'react'
import { useCp45 } from '../cp45/runtime'
import { errorMessage } from '../cp45/http'
import { ContingencyService } from './contingencyService'
import type { Contingency } from './contingencyService'
export function useContingency() {
  const runtime=useCp45()
  const service=useRef<ContingencyService | null>(null)
  const [items,setItems]=useState<Contingency[]>([])
  const [error,setError]=useState('')
  const [busy,setBusy]=useState(false)
  useEffect(()=>{
    const current=new ContingencyService(runtime)
    service.current=current
    const unsubscribe=current.listen(setItems)
    return ()=>{unsubscribe();current.dispose();service.current=null}
  },[runtime])
  async function ack(id:number) {
    if(busy || !service.current) return
    setBusy(true);setError('')
    try {await service.current.ack(id)} catch(e) {setError(errorMessage(e))} finally {setBusy(false)}
  }
  return {contingency:items[0],error,busy,ack}
}
