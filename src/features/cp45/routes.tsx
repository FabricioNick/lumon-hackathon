/* Praise Kier */
import { Suspense } from "react";
import { Link, Outlet, useRoutes } from "react-router-dom";
import { createCp45Routes } from "./routeDefinitions";
import { ContingencyModal } from "../contingency/ContingencyModal";
import "./styles.css";
export function Cp45Layout() {
  return (
    <div className="cp45 min-h-screen bg-slate-50 text-slate-900">
      <a href="#module-content" className="sr-only focus:not-sr-only">
        Saltar al contenido
      </a>
      <header className="border-b border-slate-300 bg-slate-900 px-6 py-5 text-white">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-4">
          <p className="font-mono text-xl tracking-wider">LUMON / PERSONAL</p>
          <nav aria-label="Personal" className="flex gap-6">
            <Link to="/refiners">Refinadores</Link>
            <Link to="/incidents">Incidencias</Link>
          </nav>
        </div>
      </header>
      <main id="module-content" className="mx-auto max-w-6xl px-4 py-8 sm:px-8">
        <Suspense fallback={<p role="status">Cargando módulo…</p>}>
          <Outlet />
        </Suspense>
      </main>
      <ContingencyModal />
    </div>
  );
}
export function Cp45Router() {
  return useRoutes([
    {
      element: <Cp45Layout />,
      children: [
        ...createCp45Routes(),
        {
          path: "*",
          element: (
            <>
              <h1 className="text-3xl font-semibold">Personal de Lumon</h1>
              <p className="my-4">Consulta expedientes y reportes del piso.</p>
              <Link to="/refiners">Abrir directorio</Link>
            </>
          ),
        },
      ],
    },
  ]);
}
