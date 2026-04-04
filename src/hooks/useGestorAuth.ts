// Hook de autenticação do Portal do Gestor
// Sessão armazenada em localStorage — independente do Supabase Auth

export interface GestorUser {
  id: string
  login: string
  nome: string | null
  obras_ids: string[]   // obras que este gestor pode visualizar (vazio = todas)
  nivel: 'gestor' | 'master'
}

const KEY = 'gestor_session'

export function getGestorSession(): GestorUser | null {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return null
    return JSON.parse(raw) as GestorUser
  } catch {
    return null
  }
}

export function setGestorSession(u: GestorUser) {
  localStorage.setItem(KEY, JSON.stringify(u))
}

export function clearGestorSession() {
  localStorage.removeItem(KEY)
}
