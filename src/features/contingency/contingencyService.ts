import type { Cp45Runtime, FloorEvent } from '../cp45/runtime'
import { ApiError, emptyResponse, isRecord } from '../cp45/http'
export type Contingency = Extract<FloorEvent,{type:'contingency.activated'}>['data']
interface Snapshot { pending: Contingency[]; resolved: number[] }
function isContingency(value:unknown):value is Contingency {
  return isRecord(value) && Number.isSafeInteger(value.id) && Number(value.id)>0 && Number.isSafeInteger(value.userId) && value.status==='ACTIVE' && typeof value.message==='string' && typeof value.createdAt==='string'
}
/** Tab transport only. The CP1 event bus remains the only owner of the SSE connection. */
export class ContingencyService {
  private runtime: Cp45Runtime
  private pending = new Map<number,Contingency>()
  private resolved = new Set<number>()
  private channel: BroadcastChannel | undefined
  private unsubscribe: () => void
  private listeners = new Set<(items:Contingency[])=>void>()
  private retryAt = new Map<number,number>()
  private active = new Set<number>()
  constructor(runtime:Cp45Runtime) {
    this.runtime=runtime
    if (typeof BroadcastChannel!=='undefined' && runtime.userId!==null) {
      this.channel=new BroadcastChannel(`lumon.cp45.contingency.${encodeURIComponent(runtime.sessionKey)}.${runtime.userId}`)
      this.channel.onmessage=event=>this.receive(event.data as unknown)
      this.channel.postMessage({type:'request'})
    }
    this.unsubscribe=runtime.subscribe(event=>{
      if(event.type==='contingency.activated' && event.data.userId===runtime.userId) this.add(event.data,true)
      if(event.type==='contingency.resolved' && event.data.userId===runtime.userId) this.resolve(event.data.id,true)
      if(event.type==='session.revoked') {this.pending.clear();this.resolved.clear();this.notify()}
    })
  }
  private notify() { const items=[...this.pending.values()].sort((a,b)=>a.id-b.id);this.listeners.forEach(listener=>listener(items)) }
  private add(item:Contingency,broadcast:boolean) {
    if(item.userId!==this.runtime.userId || this.resolved.has(item.id) || this.pending.has(item.id)) return
    this.pending.set(item.id,item);this.notify()
    if(broadcast) this.channel?.postMessage({type:'activate',item})
  }
  private resolve(id:number,broadcast:boolean) {
    if(this.resolved.has(id)) return
    this.resolved.add(id);this.pending.delete(id);this.retryAt.delete(id);this.notify()
    if(broadcast) this.channel?.postMessage({type:'resolve',id})
  }
  private receive(message:unknown) {
    if(!isRecord(message)) return
    if(message.type==='request') {
      const snapshot:Snapshot={pending:[...this.pending.values()],resolved:[...this.resolved]}
      this.channel?.postMessage({type:'snapshot',...snapshot})
    }
    if(message.type==='activate' && isContingency(message.item)) this.add(message.item,false)
    if(message.type==='resolve' && Number.isSafeInteger(message.id) && Number(message.id)>0) this.resolve(Number(message.id),false)
    if(message.type==='snapshot' && Array.isArray(message.pending) && Array.isArray(message.resolved)) {
      for(const id of message.resolved) if(Number.isSafeInteger(id) && Number(id)>0) this.resolve(Number(id),false)
      for(const item of message.pending) if(isContingency(item)) this.add(item,false)
    }
  }
  listen(listener:(items:Contingency[])=>void) {this.listeners.add(listener);listener([...this.pending.values()]);return ()=>{this.listeners.delete(listener)}}
  async ack(id:number) {
    if(this.active.has(id)) return
    if(Date.now()<(this.retryAt.get(id)??0)) throw new Error(`Espera ${Math.ceil(((this.retryAt.get(id)??0)-Date.now())/1000)} s antes de confirmar otra vez.`)
    this.active.add(id)
    try {
      await emptyResponse(await this.runtime.request(`/contingency/${id}/ack`,{method:'POST'}))
      this.resolve(id,true)
    } catch(error) {
      if(error instanceof ApiError) this.retryAt.set(id,Date.now()+error.retryAfter)
      throw error
    } finally {this.active.delete(id)}
  }
  dispose() {this.unsubscribe();this.channel?.close();this.listeners.clear()}
}
