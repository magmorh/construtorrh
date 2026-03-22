import React from 'react'

interface State {
  hasError: boolean
  error: Error | null
}

export class ErrorBoundary extends React.Component<
  { children: React.ReactNode },
  State
> {
  constructor(props: { children: React.ReactNode }) {
    super(props)
    this.state = { hasError: false, error: null }
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error }
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error('[ErrorBoundary]', error, info)
  }

  render() {
    if (this.state.hasError) {
      return (
        <div style={{
          display: 'flex', flexDirection: 'column', alignItems: 'center',
          justifyContent: 'center', height: '100%', padding: 40, gap: 16,
          fontFamily: 'sans-serif',
        }}>
          <div style={{ fontSize: 48 }}>⚠️</div>
          <div style={{ fontSize: 18, fontWeight: 700, color: '#dc2626' }}>
            Erro ao carregar esta página
          </div>
          <div style={{
            fontSize: 13, color: '#6b7280', maxWidth: 480, textAlign: 'center',
            background: '#fef2f2', border: '1px solid #fecaca',
            borderRadius: 8, padding: '10px 16px',
          }}>
            {this.state.error?.message ?? 'Ocorreu um erro inesperado.'}
          </div>
          <button
            onClick={() => this.setState({ hasError: false, error: null })}
            style={{
              padding: '8px 20px', background: '#2563eb', color: '#fff',
              border: 'none', borderRadius: 6, cursor: 'pointer', fontSize: 14,
            }}
          >
            ↩ Tentar novamente
          </button>
        </div>
      )
    }
    return this.props.children
  }
}
