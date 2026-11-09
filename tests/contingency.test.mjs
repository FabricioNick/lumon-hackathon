import { test } from 'node:test'
import assert from 'node:assert/strict'
import { ContingencyService } from '../src/features/contingency/contingencyService.ts'
class LocalChannel {
  static channels=new Set()
  constructor(name){this.name=name;LocalChannel.channels.add(this)}
  postMessage(data){for(const channel of LocalChannel.channels)if(channel!==this && channel.name===this.name)queueMicrotask(()=>channel.onmessage?.({data}))}
  close(){LocalChannel.channels.delete(this)}
}
function runtime(request,sessionKey='session',userId=12){
  const listeners=new Set()
  return {runtime:{request,userId,sessionKey,permissions:[],subscribe:listener=>{listeners.add(listener);return ()=>listeners.delete(listener)}},emit:event=>listeners.forEach(listener=>listener(event))}
}
const tick=()=>new Promise(resolve=>setTimeout(resolve,0))
test('contingency targets, duplicates, failed ack and cross-tab accepted ack',async()=>{
  globalThis.BroadcastChannel=LocalChannel
  let fail=true;const calls=[]
  const source=runtime(async(path,init)=>{calls.push({path,init});return fail ? Response.json({error:'SERVICE_UNAVAILABLE'},{status:503}) : new Response(null,{status:204})})
  const other=runtime(source.runtime.request)
  const a=new ContingencyService(source.runtime);const b=new ContingencyService(other.runtime)
  let first=[],second=[];a.listen(items=>first=items);b.listen(items=>second=items)
  const data={id:9,userId:12,status:'ACTIVE',createdAt:'2026-11-09T20:00:00Z',message:'Confirma'}
  source.emit({type:'contingency.activated',eventId:100,data:{...data,userId:99}})
  assert.equal(first.length,0)
  source.emit({type:'contingency.activated',eventId:101,data});source.emit({type:'contingency.activated',eventId:101,data})
  await tick();assert.equal(first.length,1);assert.equal(second.length,1)
  await assert.rejects(a.ack(9));assert.equal(first.length,1);assert.equal(second.length,1)
  fail=false;await a.ack(9);await tick();assert.equal(first.length,0);assert.equal(second.length,0)
  source.emit({type:'contingency.activated',eventId:101,data});assert.equal(first.length,0)
  assert.equal(calls[0].path,'/contingency/9/ack');assert.equal(calls[0].init.method,'POST');assert.equal(calls[0].init.body,undefined)
  a.dispose();b.dispose()
})
test('new tabs obtain active state; other users and login scopes are isolated',async()=>{
  globalThis.BroadcastChannel=LocalChannel
  const source=runtime(async()=>new Response(null,{status:204}))
  const a=new ContingencyService(source.runtime)
  source.emit({type:'contingency.activated',eventId:10,data:{id:3,userId:12,status:'ACTIVE',createdAt:'today',message:'Activa'}})
  const b=new ContingencyService(runtime(source.runtime.request).runtime)
  const c=new ContingencyService(runtime(source.runtime.request,'other').runtime)
  let same=[],isolated=[];b.listen(items=>same=items);c.listen(items=>isolated=items)
  await tick();await tick();assert.equal(same.length,1);assert.equal(isolated.length,0)
  a.dispose();b.dispose();c.dispose()
})
