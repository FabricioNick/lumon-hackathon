/* Praise Kier */
import { useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { Permission } from '../../cp45/runtime'
import { Feedback } from '../../cp45/ui'
import { ImagePicker } from '../../media/ImagePicker'
import { UploadPanel } from '../../media/UploadPanel'
import type { Crop, Media } from '../../media/types'
import { ImageCropper } from '../components/ImageCropper'
import { ConflictResolver } from '../components/ConflictResolver'
import { useRefinerEditor } from '../useRefinerEditor'
export default function BadgeEditorPage() {
  const {id=''}=useParams()
  const navigate=useNavigate()
  const editor=useRefinerEditor(id)
  const [file,setFile]=useState<File>()
  const [crop,setCrop]=useState<Crop>()
  const [media,setMedia]=useState<Media>()
  function select(files:File[]) {setFile(files[0]);setCrop(undefined);setMedia(undefined)}
  async function save() {if (media && await editor.save({badgeMediaId:media.mediaId})) navigate(`/refiners/${id}`)}
  return <Permission name="refiners:write"><Permission name="media:upload"><Link to={`/refiners/${id}`}>← Expediente</Link><h1 className="my-6 text-3xl font-semibold">Editar fotocheck</h1><Feedback loading={editor.loading} error={editor.error} retry={editor.reload}/>{editor.snapshot && <><p>{editor.snapshot.refiner.fullName} · WebP 512 × 512 · máximo 120 KB</p>{editor.remoteChanged && <p role="status">El expediente cambió mientras editabas. Al guardar se comprobará la versión.</p>}
    {!editor.conflict && <><ImagePicker onFiles={select} disabled={editor.busy}/>{file && !crop && <ImageCropper key={`${file.name}-${file.lastModified}`} file={file} onConfirm={setCrop} onCancel={()=>setFile(undefined)}/>}{file && crop && <UploadPanel key={`${file.name}-${file.lastModified}-${crop.x}-${crop.y}-${crop.size}`} file={file} purpose="BADGE" crop={crop} onConfirmed={setMedia}/>}
    {media && <button disabled={editor.busy} onClick={()=>void save()}>{editor.busy?'Guardando…':'Guardar fotocheck confirmado'}</button>}</>}
    {editor.conflict && <ConflictResolver key={editor.conflict.etag} conflict={editor.conflict} busy={editor.busy} onCancel={editor.cancelConflict} onResolve={patch=>{void editor.resolve(patch).then(ok=>{if(ok) navigate(`/refiners/${id}`)})}}/>}</>}</Permission></Permission>
}
