/* Praise Kier */
import { Cp45Application } from "./features/cp45/Cp45Application";
import type { Cp45Runtime } from "./features/cp45/context";
function App({ runtime }: { runtime?: Cp45Runtime }) {
  if (runtime) return <Cp45Application runtime={runtime} />;
  return (
    <main className="cp45 min-h-screen bg-slate-50 p-8 text-slate-900">
      <div className="mx-auto max-w-3xl">
        <p className="font-mono tracking-widest">LUMON INDUSTRIES / PERSONAL</p>
        <h1 className="my-6 text-3xl font-semibold">
          Expedientes e incidencias
        </h1>
        <p>
          El acceso al Piso de Pruebas requiere una sesión activa de la consola.
        </p>
        <p className="my-4" role="status">
          La conexión con el módulo de sesión está pendiente de integración.
        </p>
        <a href="/refiners">Directorio de refinadores</a> ·{" "}
        <a href="/incidents">Incidencias</a>
      </div>
    </main>
  );
}
export default App;
