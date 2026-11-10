/* Praise Kier */
import { useResource } from '../../cp45/useResource'
import { Link, useSearchParams } from 'react-router-dom'
import { useCp45 } from '../../cp45/context'
import { Permission } from '../../cp45/runtime'
import { pageParams, safeUrl } from '../../cp45/http'
import { Feedback, Pagination } from '../../cp45/ui'
import { incidentsApi } from '../services/incidentsApi'
export default function IncidentsPage() {
  const { request, permissions } = useCp45()
  const [params] = useSearchParams()
  const { page, size } = pageParams(params)
  const resource = useResource(
    (signal) => incidentsApi(request).list(page, size, signal),
    [request, page, size],
  )
  return (
    <Permission name="incidents:read">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
        <h1 className="text-3xl font-semibold">Incidencias</h1>
        {permissions.includes('incidents:create') && permissions.includes('media:upload') && (
          <Link to="/incidents/new">Reportar incidencia</Link>
        )}
      </div>
      <Feedback {...resource} retry={resource.reload} />
      {resource.data && (
        <>
          <div className="space-y-6">
            {resource.data.content.map((incident) => (
              <article
                key={incident.id}
                className="space-y-3 rounded border border-slate-300 bg-white p-5"
              >
                <h2 className="text-xl font-semibold">{incident.title}</h2>
                <p>
                  Severidad: {incident.severity}
                  {incident.file ? ` · Archivo: ${incident.file.name}` : ''}
                </p>
                <p className="whitespace-pre-wrap">{incident.description}</p>
                <div className="flex flex-wrap gap-4">
                  {incident.photos.map(
                    (photo) =>
                      safeUrl(photo.url) && (
                        <a
                          href={safeUrl(photo.url)}
                          target="_blank"
                          rel="noopener noreferrer"
                          key={photo.mediaId}
                        >
                          <img
                            src={safeUrl(photo.url)}
                            width={photo.width}
                            height={photo.height}
                            loading="lazy"
                            alt={`Evidencia ${photo.mediaId} de ${incident.title}`}
                            className="h-40 w-52 object-contain"
                          />
                        </a>
                      ),
                  )}
                </div>
                <p className="text-sm">
                  {incident.createdBy.displayName} · {new Date(incident.createdAt).toLocaleString()}
                </p>
              </article>
            ))}
          </div>
          {resource.data.content.length === 0 && <p>No hay incidencias registradas.</p>}
          <Pagination totalPages={resource.data.totalPages} />
        </>
      )}
    </Permission>
  )
}
