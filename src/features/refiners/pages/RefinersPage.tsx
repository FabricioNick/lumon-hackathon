/* Praise Kier */
import { useResource } from "../../cp45/useResource";
import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { useCp45 } from "../../cp45/context";
import { Permission } from "../../cp45/runtime";
import { Feedback, Pagination } from "../../cp45/ui";
import { pageParams } from "../../cp45/http";
import { refinersApi } from "../services/refinersApi";
import { rememberRefiner } from "../services/refinerVersions";
import { RefinerCard } from "../components/RefinerCard";
export default function RefinersPage() {
  const { request, subscribe } = useCp45();
  const [params, setParams] = useSearchParams();
  const query = (params.get("q") ?? "").slice(0, 60);
  const [search, setSearch] = useState(query);
  const { page, size } = pageParams(params);
  const rawDepartment = Number(params.get("departmentId"));
  const departmentId =
    Number.isSafeInteger(rawDepartment) && rawDepartment > 0
      ? String(rawDepartment)
      : "";
  const api = refinersApi(request);
  const departments = useResource(
    (signal) => api.departments(signal),
    [request],
  );
  const resource = useResource(
    (signal) => {
      const queryParams = new URLSearchParams({
        page: String(page),
        size: String(size),
      });
      if (query) queryParams.set("q", query);
      if (departmentId) queryParams.set("departmentId", departmentId);
      return api.list(queryParams, signal);
    },
    [request, page, size, query, departmentId],
  );
  const [previousQuery, setPreviousQuery] = useState(query);
  if (previousQuery !== query) {
    setPreviousQuery(query);
    setSearch(query);
  }
  useEffect(() => {
    if (search === query) return;
    const timeout = window.setTimeout(() => {
      const next = new URLSearchParams(params);
      if (search) next.set("q", search);
      else next.delete("q");
      next.set("page", "0");
      setParams(next, { replace: true });
    }, 350);
    return () => window.clearTimeout(timeout);
  }, [search, query, params, setParams]);
  const { reload } = resource;
  useEffect(
    () =>
      subscribe((event) => {
        if (event.type === "refiner.updated") {
          rememberRefiner(request, event.data.refiner);
          reload();
        }
        if (event.type === "stream.reset") reload();
      }),
    [subscribe, request, reload],
  );
  return (
    <Permission name="refiners:read">
      <h1 className="mb-6 text-3xl font-semibold">Directorio de refinadores</h1>
      <div className="flex flex-wrap gap-4">
        <label>
          Buscar
          <input
            type="search"
            maxLength={60}
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
        </label>
        <label>
          Departamento
          <select
            value={departmentId}
            onChange={(event) => {
              const next = new URLSearchParams(params);
              if (event.target.value)
                next.set("departmentId", event.target.value);
              else next.delete("departmentId");
              next.set("page", "0");
              setParams(next);
            }}
          >
            <option value="">Todos</option>
            {departments.data?.map((d) => (
              <option key={d.id} value={d.id}>
                {d.name}
              </option>
            ))}
          </select>
        </label>
      </div>
      <Feedback {...departments} retry={departments.reload} />
      <Feedback {...resource} retry={resource.reload} />
      {resource.data && (
        <>
          <p className="my-4" role="status">
            {resource.data.totalElements} expedientes
          </p>
          <div className="grid gap-4 lg:grid-cols-2">
            {resource.data.content.map((refiner) => (
              <RefinerCard key={refiner.id} refiner={refiner} />
            ))}
          </div>
          {resource.data.content.length === 0 && (
            <p>No se encontraron refinadores.</p>
          )}
          <Pagination totalPages={resource.data.totalPages} />
        </>
      )}
    </Permission>
  );
}
