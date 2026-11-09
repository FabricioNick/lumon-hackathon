/* Praise Kier */
import { useResource } from "../../cp45/useResource";
import { useEffect } from "react";
import { Link, useParams } from "react-router-dom";
import { useCp45 } from "../../cp45/context";
import { Permission } from "../../cp45/runtime";
import { safeUrl } from "../../cp45/http";
import { Feedback } from "../../cp45/ui";
import { refinersApi } from "../services/refinersApi";
import { rememberRefiner } from "../services/refinerVersions";
import { Badge } from "../components/RefinerCard";
export default function RefinerDetailPage() {
  const { id = "" } = useParams();
  const { request, permissions, subscribe } = useCp45();
  const resource = useResource(
    (signal) => refinersApi(request).get(id, signal),
    [request, id],
  );
  const { reload } = resource;
  const version = resource.data?.refiner.version ?? 0;
  useEffect(
    () =>
      subscribe((event) => {
        if (event.type === "refiner.updated")
          rememberRefiner(request, event.data.refiner);
        if (
          event.type === "stream.reset" ||
          (event.type === "refiner.updated" &&
            event.data.id === Number(id) &&
            event.data.version > version)
        )
          reload();
      }),
    [subscribe, request, id, version, reload],
  );
  const refiner = resource.data?.refiner;
  return (
    <Permission name="refiners:read">
      <Link to="/refiners">← Directorio</Link>
      <Feedback {...resource} retry={resource.reload} />
      {refiner && (
        <article className="my-6 space-y-4">
          <h1 className="text-3xl font-semibold">{refiner.fullName}</h1>
          <Badge refiner={refiner} />
          <p>
            {refiner.department.name} · {refiner.title}
          </p>
          <p>Anexo: {refiner.extension}</p>
          <p className="whitespace-pre-wrap">{refiner.bio}</p>
          {safeUrl(refiner.profileUrl) && (
            <a
              href={safeUrl(refiner.profileUrl)}
              target="_blank"
              rel="noopener noreferrer"
            >
              Perfil externo
            </a>
          )}
          <p>
            Versión {refiner.version} ·{" "}
            {new Date(refiner.updatedAt).toLocaleString()}
          </p>
          {permissions.includes("refiners:write") && (
            <nav className="flex gap-6">
              <Link to={`/refiners/${id}/edit`}>Editar expediente</Link>
              {permissions.includes("media:upload") && (
                <Link to={`/refiners/${id}/badge`}>Editar fotocheck</Link>
              )}
            </nav>
          )}
        </article>
      )}
    </Permission>
  );
}
