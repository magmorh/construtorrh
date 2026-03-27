// Hook de autenticação do Portal Externo
// Sessão armazenada em localStorage, sem usar Supabase Auth

export interface PortalUser {
  id: string
  login: string
  nome: string | null
  obras_ids: string[]
  obra_nome?: string | null  // nome da primeira/principal obra para exibição no header
}

const KEY = 'portal_session'

export function getPortalSession(): PortalUser | null {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return null
    return JSON.parse(raw) as PortalUser
  } catch {
    return null
  }
}

export function setPortalSession(u: PortalUser) {
  localStorage.setItem(KEY, JSON.stringify(u))
}

export function clearPortalSession() {
  localStorage.removeItem(KEY)
}
