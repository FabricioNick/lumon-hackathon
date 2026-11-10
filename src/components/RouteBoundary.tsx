import { Component } from 'react'
import type { ErrorInfo, ReactNode } from 'react'

export class RouteBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false }
  static getDerivedStateFromError() {
    return { failed: true }
  }
  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('Route error', error, info.componentStack)
  }
  render() {
    if (this.state.failed)
      return (
        <section className="panel">
          <h1>Ocurrió un error</h1>
          <p>No se pudo mostrar esta sección.</p>
          <a href="/">Volver al inicio</a>
        </section>
      )
    return this.props.children
  }
}
