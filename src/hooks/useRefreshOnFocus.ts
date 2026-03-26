import { useEffect, useRef } from 'react'
import { useLocation } from 'react-router-dom'

/**
 * Executa `fn` sempre que:
 * 1. O pathname mudar (navegação entre rotas)
 * 2. A aba/janela voltar ao foco (visibilitychange)
 *
 * Use em componentes de página para manter dados sempre atualizados.
 */
export function useRefreshOnFocus(fn: () => void) {
  const location = useLocation()
  const fnRef = useRef(fn)
  fnRef.current = fn

  // Atualiza ao mudar de rota (pathname)
  useEffect(() => {
    fnRef.current()
  }, [location.pathname])

  // Atualiza ao focar a aba do navegador
  useEffect(() => {
    function handleVisibility() {
      if (document.visibilityState === 'visible') fnRef.current()
    }
    document.addEventListener('visibilitychange', handleVisibility)
    return () => document.removeEventListener('visibilitychange', handleVisibility)
  }, [])
}
