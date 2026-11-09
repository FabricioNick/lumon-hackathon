import { test } from 'node:test'
import assert from 'node:assert/strict'
import { refinersApi } from '../src/features/refiners/services/refinersApi.ts'
import { ApiError, jsonResponse, pageParams, safeUrl } from '../src/features/cp45/http.ts'
import { incidentsApi } from '../src/features/incidents/services/incidentsApi.ts'
test('refiner updates use the exact read ETag; a 412 is never retried automatically', async () => {
  const calls=[]
  const request=async(path,init)=>{calls.push({path,init});return new Response(JSON.stringify({error:'VERSION_CONFLICT',details:{current:{version:2}}}),{status:412,headers:{ETag:'"2"','Content-Type':'application/json'}})}
  await assert.rejects(refinersApi(request).patch('7',{title:'Nuevo'},'"1"'),e=>e instanceof ApiError && e.status===412 && e.etag==='"2"')
  assert.equal(calls.length,1)
  assert.equal(calls[0].init.headers['If-Match'],'"1"')
  await assert.rejects(refinersApi(request).patch('7',{title:'Nuevo'},'*'))
  assert.equal(calls.length,1)
})
test('reads retain ETag and abort signal, list uses server query',async()=>{
  const controller=new AbortController();const calls=[]
  const request=async(path,init)=>{calls.push({path,init});return Response.json({id:7,version:4},{headers:{ETag:'"4"'}})}
  const snapshot=await refinersApi(request).get('7',controller.signal)
  assert.equal(snapshot.etag,'"4"');assert.equal(calls[0].init.signal,controller.signal)
  await refinersApi(request).list(new URLSearchParams({page:'2',size:'25',departmentId:'3',q:'Irving'}),controller.signal)
  assert.equal(calls[1].path,'/refiners?page=2&size=25&departmentId=3&q=Irving')
})
test('safe URLs reject executable schemes and invalid pagination recovers',()=>{
  for(const url of ['javascript:alert(1)','data:text/html,x','//evil.example','bad']) assert.equal(safeUrl(url),undefined)
  assert.equal(safeUrl('https://example.com'),'https://example.com/')
  assert.deepEqual(pageParams(new URLSearchParams('page=-2&size=100')),{page:0,size:10})
})
test('Retry-After and clearance errors are preserved',async()=>{
  await assert.rejects(jsonResponse(new Response(JSON.stringify({error:'SERVICE_UNAVAILABLE',message:'Wait'}),{status:503,headers:{'Retry-After':'5'}})),e=>e.code==='SERVICE_UNAVAILABLE' && e.retryAfter===5000)
  await assert.rejects(jsonResponse(new Response(JSON.stringify({error:'CLEARANCE_REQUIRED'}),{status:423})),e=>e.status===423)
})
test('incidents serialize the official fields and use server pagination',async()=>{
  const calls=[];const request=async(path,init)=>{calls.push({path,init});return Response.json({id:1})}
  await incidentsApi(request).list(2,25)
  assert.equal(calls[0].path,'/incidents?page=2&size=25')
  const body={title:'Incidencia',description:'Reporte',severity:'HIGH',fileId:null,mediaIds:[9]}
  await incidentsApi(request).create(body)
  assert.deepEqual(JSON.parse(calls[1].init.body),body)
})
