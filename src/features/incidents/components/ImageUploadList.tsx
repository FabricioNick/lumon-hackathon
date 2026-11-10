/* Praise Kier */
import { UploadPanel } from '../../media/UploadPanel'
import type { Media } from '../../media/types'
export interface IncidentPhoto {
  id: string
  file: File
  media?: Media
}
export function ImageUploadList({
  photos,
  onConfirmed,
  onRemove,
  disabled,
}: {
  photos: IncidentPhoto[]
  onConfirmed: (id: string, media: Media) => void
  onRemove: (id: string) => void
  disabled: boolean
}) {
  return (
    <ul className="grid gap-4 md:grid-cols-3">
      {photos.map((photo) => (
        <li key={photo.id}>
          <UploadPanel
            file={photo.file}
            purpose="INCIDENT"
            auto
            onConfirmed={(media) => onConfirmed(photo.id, media)}
          />
          <button type="button" disabled={disabled} onClick={() => onRemove(photo.id)}>
            Quitar {photo.file.name}
          </button>
        </li>
      ))}
    </ul>
  )
}
