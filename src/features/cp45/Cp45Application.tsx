/* Praise Kier */
import { Component } from "react";
import type { ReactNode } from "react";
import { BrowserRouter } from "react-router-dom";
import { Cp45Provider } from "./runtime";
import type { Cp45Runtime } from "./context";
import { Cp45Router } from "./routes";
class ModuleErrorBoundary extends Component<
  { children: ReactNode },
  { failed: boolean }
> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  render() {
    if (this.state.failed)
      return (
        <main className="cp45 p-8">
          <h1>No se pudo mostrar el módulo</h1>
          <p>Tus datos enviados se conservan en el servidor.</p>
          <a href="/refiners">Volver al directorio</a>
        </main>
      );
    return this.props.children;
  }
}
/** Standalone host for local integration. Existing applications may mount cp45Routes instead. */
export function Cp45Application({ runtime }: { runtime: Cp45Runtime }) {
  return (
    <ModuleErrorBoundary>
      <Cp45Provider runtime={runtime}>
        <BrowserRouter>
          <Cp45Router />
        </BrowserRouter>
      </Cp45Provider>
    </ModuleErrorBoundary>
  );
}
