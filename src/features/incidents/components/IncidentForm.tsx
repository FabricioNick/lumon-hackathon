/* Praise Kier */
import { useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useCp45 } from '../../cp45/runtime'
import type { Severity } from '../../cp45/contracts'
import { ApiError, errorMessage } from '../../cp45/http'
import { ImagePicker } from '../../media/ImagePicker'
import { ImageUploadList } from './ImageUploadList'
import type { IncidentPhoto } from './ImageUploadList'
import { incidentsApi } from '../services/incidentsApi'
const severities: Severity[]=['LOW','MEDIUM','HIGH','CRITICAL']
export function IncidentForm() {
  const {request}=useCp45()
  const navigate=useNavigate()
  const [title,setTitle]=useState('')
  const [description,setDescription]=useState('')
  const [severity,setSeverity]=useState<Severity>('LOW')
  const [fileId,setFileId]=useState('')
  const [photos,setPhotos]=useState<IncidentPhoto[]>([])
  const [error,setError]=useState('')
  const [busy,setBusy]=useState(false)
  const lock=useRef(false)
  const retryAt=useRef(0)
  const ready=photos.length>=1 && photos.length<=3 && photos.every(photo=>photo.media)
  function select(files:File[]) {
    if (photos.length+files.length>3) {setError('Se permiten entre 1 y 3 fotografías.');return}
    setPhotos(current=>[...current,...files.map(file=>({id:crypto.randomUUID(),file}))]);setError('')
  }
  async function submit() {
    if (lock.current || !ready) return
    if (Date.now()<retryAt.current) {setError(`Espera ${Math.ceil((retryAt.current-Date.now())/1000)} s antes de reintentar.`);return}
    if (title.trim().length<3 || !description.trim() || fileId && (!Number.isSafeInteger(Number(fileId)) || Number(fileId)<1)) {setError('Revisa el título, descripción y archivo relacionado.');return}
    lock.current=true;setBusy(true);setError('')
    try {
      await incidentsApi(request).create({title:title.trim(),description:description.trim(),severity,fileId:fileId?Number(fileId):null,mediaIds:photos.flatMap(photo=>photo.media?[photo.media.mediaId]:[])})
      navigate('/incidents')
    } catch(e) {if(e instanceof ApiError) retryAt.current=Date.now()+e.retryAfter;setError(errorMessage(e))}
    finally {lock.current=false;setBusy(false)}
  }
  return <form onSubmit={event=>{event.preventDefault();void submit()}} className="space-y-5">
    <fieldset disabled={busy} className="space-y-4"><legend className="sr-only">Datos de la incidencia</legend>
      <label className="block">Título<input required minLength={3} maxLength={120} value={title} onChange={event=>setTitle(event.target.value)}/></label>
      <label className="block">Descripción<textarea required maxLength={4000} rows={5} value={description} onChange={event=>setDescription(event.target.value)}/></label>
      <label className="block">Severidad<select value={severity} onChange={event=>{const value=event.target.value;if(severities.some(item=>item===value)) setSeverity(value as Severity)}}>{severities.map(value=><option key={value}>{value}</option>)}</select></label>
      <label className="block">ID del archivo relacionado (opcional)<input type="number" min={1} step={1} value={fileId} onChange={event=>setFileId(event.target.value)}/></label>
    </fieldset>
    <section aria-label="Fotografías"><h2 className="text-xl font-semibold">Evidencia fotográfica</h2><p>1 a 3 imágenes WebP · lado mayor de 800 a 1600 píxeles · hasta 300 KB por imagen.</p><ImagePicker onFiles={select} multiple disabled={busy || photos.length>=3}/>
    <ImageUploadList photos={photos} disabled={busy} onRemove={id=>setPhotos(current=>current.filter(photo=>photo.id!==id))} onConfirmed={(id,media)=>setPhotos(current=>current.map(photo=>photo.id===id?{...photo,media}:photo))}/></section>
    {!ready && <p role="status">Confirma de 1 a 3 fotografías antes de enviar.</p>}{error && <p role="alert">{error}</p>}<button type="submit" disabled={!ready || busy}>{busy?'Enviando…':'Crear incidencia'}</button>
  </form>
}
