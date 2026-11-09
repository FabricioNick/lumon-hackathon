/* Praise Kier */
import { Link } from "react-router-dom";
import { safeUrl } from "../../cp45/http";
import type { Refiner } from "../types/refiners";
export function Badge({ refiner }: { refiner: Refiner }) {
  const url = safeUrl(refiner.badge?.url);
  return url ? (
    <img
      src={url}
      alt={`Fotocheck de ${refiner.fullName}`}
      width={128}
      height={128}
      loading="lazy"
      className="h-32 w-32 rounded object-cover"
    />
  ) : (
    <div
      className="flex h-32 w-32 items-center justify-center rounded bg-slate-200 text-slate-600"
      aria-label="Sin fotocheck"
    >
      Sin foto
    </div>
  );
}
export function RefinerCard({ refiner }: { refiner: Refiner }) {
  return (
    <article className="flex gap-4 rounded border border-slate-300 bg-white p-5">
      <Badge refiner={refiner} />
      <div className="min-w-0 break-words">
        <h2 className="text-xl font-semibold">
          <Link to={`/refiners/${refiner.id}`}>{refiner.fullName}</Link>
        </h2>
        <p>{refiner.title}</p>
        <p>{refiner.department.name}</p>
        <p>Anexo {refiner.extension}</p>
      </div>
    </article>
  );
}
