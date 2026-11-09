/* Praise Kier */
import { useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { useCp45, Permission } from '../../cp45/runtime'
import { Feedback, useResource } from '../../cp45/ui'
import { refinersApi } from '../services/refinersApi'
import { useRefinerEditor } from '../useRefinerEditor'
import { ConflictResolver } from '../components/ConflictResolver'
import type { Refiner, RefinerPatch } from '../types/refiners'
function EditForm({refiner,busy,onSave}:{refiner:Refiner;busy:boolean;onSave:(patch:RefinerPatch)=>void}) {
  const {request}=useCp45()
  const departments=useResource(signal=>refinersApi(request).departments(signal),[request])
  const [title,setTitle]=useState(refiner.title)
  const [extension,setExtension]=useState(refiner.extension)
  const [bio,setBio]=useState(refiner.bio)
  const [departmentId,setDepartmentId]=useState(refiner.department.id)
  function submit() {
    const patch: RefinerPatch={}
    if(title!==refiner.title) patch.title=title
    if(extension!==refiner.extension) patch.extension=extension
    if(bio!==refiner.bio) patch.bio=bio
    if(departmentId!==refiner.department.id) patch.departmentId=departmentId
    onSave(patch)
  }
  return <form onSubmit={event=>{event.preventDefault();submit()}} className="space-y-4"><fieldset disabled={busy} className="space-y-4"><legend className="sr-only">Editar datos de {refiner.fullName}</legend>
    <label className="block">Cargo<input required minLength={1} maxLength={200} value={title} onChange={event=>setTitle(event.target.value)}/></label>
    <label className="block">Anexo<input required pattern="[0-9]{3,6}" inputMode="numeric" minLength={3} maxLength={6} value={extension} onChange={event=>setExtension(event.target.value)}/></label>
    <label className="block">Biografía<textarea maxLength={2000} rows={6} value={bio} onChange={event=>setBio(event.target.value)}/></label>
    <Feedback {...departments} retry={departments.reload}/><label className="block">Departamento<select value={departmentId} onChange={event=>setDepartmentId(Number(event.target.value))}>{!departments.data?.some(d=>d.id===refiner.department.id) && <option value={refiner.department.id}>{refiner.department.name}</option>}{departments.data?.map(d=><option key={d.id} value={d.id}>{d.name}</option>)}</select></label>
    <button type="submit">{busy?'Guardando…':'Guardar cambios'}</button></fieldset></form>
}
export default function RefinerEditPage() {
  const {id=''}=useParams()
  const navigate=useNavigate()
  const editor=useRefinerEditor(id)
  return <Permission name="refiners:write"><Link to={`/refiners/${id}`}>← Expediente</Link><h1 className="my-6 text-3xl font-semibold">Editar expediente</h1><Feedback loading={editor.loading} error={editor.error} retry={editor.reload}/>
    {editor.remoteChanged && <p role="status" className="my-4 rounded border border-amber-700 p-3">Otra persona modificó este expediente. Tus cambios están conservados; al guardar se comprobará el ETag.</p>}
    {editor.snapshot && <div hidden={!!editor.conflict}><EditForm key={id} refiner={editor.snapshot.refiner} busy={editor.busy} onSave={patch=>{void editor.save(patch).then(ok=>{if(ok)navigate(`/refiners/${id}`)})}}/></div>}
    {editor.conflict && <ConflictResolver key={editor.conflict.etag} conflict={editor.conflict} busy={editor.busy} onCancel={editor.cancelConflict} onResolve={patch=>{void editor.resolve(patch).then(ok=>{if(ok)navigate(`/refiners/${id}`)})}}/>}
  </Permission>
}
