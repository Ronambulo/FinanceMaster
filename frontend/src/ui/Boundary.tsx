// Si una pantalla revienta, se muestra el estado Error en vez de una página en blanco.
import { Component, type ReactNode } from 'react'
import { ErrorState } from './kit'

export class Boundary extends Component<{ children: ReactNode; resetKey?: string }, { error: Error | null }> {
  state = { error: null as Error | null }
  static getDerivedStateFromError(error: Error) { return { error } }
  componentDidCatch(error: Error) { console.error(error) }
  componentDidUpdate(prev: { resetKey?: string }) {
    if (prev.resetKey !== this.props.resetKey && this.state.error) this.setState({ error: null })
  }
  render() {
    if (!this.state.error) return this.props.children
    return <ErrorState title="Algo ha fallado" text="Esta pantalla no se ha podido cargar." retry={() => window.location.reload()} retryLabel="Recargar"
      dismiss={() => { window.location.href = '/' }} dismissLabel="Ir a Inicio" />
  }
}
