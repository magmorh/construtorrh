import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/hooks/useAuth'

// ─── Roles disponíveis ────────────────────────────────────────────────────────
export type Role = 'admin' | 'rh' | 'obra' | 'visualizador'

export interface Profile {
  id: string
  nome: string
  email: string
  role: Role
  ativo: boolean
}

// ─── Mapa de permissões por role ──────────────────────────────────────────────
export const ROLE_PERMISSIONS: Record<Role, {
  canCreate: boolean
  canEdit: boolean
  canDelete: boolean
  canViewFinanceiro: boolean
  label: string
  color: string
  bg: string
}> = {
  admin: {
    canCreate: true, canEdit: true, canDelete: true, canViewFinanceiro: true,
    label: 'Administrador', color: '#7c3aed', bg: '#f5f3ff',
  },
  rh: {
    canCreate: true, canEdit: true, canDelete: false, canViewFinanceiro: true,
    label: 'RH', color: '#0369a1', bg: '#e0f2fe',
  },
  obra: {
    canCreate: true, canEdit: false, canDelete: false, canViewFinanceiro: false,
    label: 'Obra', color: '#b45309', bg: '#fef3c7',
  },
  visualizador: {
    canCreate: false, canEdit: false, canDelete: false, canViewFinanceiro: false,
    label: 'Visualizador', color: '#4b5563', bg: '#f3f4f6',
  },
}

export const ROLE_DESCRIPTIONS: Record<Role, string[]> = {
  admin:       ['Acesso total', 'Criar / Editar / Excluir', 'Financeiro visível', 'Gerenciar usuários'],
  rh:          ['Criar e editar registros', 'Visualizar tudo', 'Financeiro visível', 'Não pode excluir'],
  obra:        ['Registrar ocorrências', 'Visualizar própria obra', 'Sem acesso financeiro', 'Não pode editar/excluir'],
  visualizador:['Apenas visualização', 'Sem criação/edição', 'Sem financeiro', 'Sem exclusão'],
}

// ─── Hook ─────────────────────────────────────────────────────────────────────
export function useProfile() {
  const { user } = useAuth()
  const [profile, setProfile] = useState<Profile | null>(null)
  const [loading,  setLoading]  = useState(true)

  useEffect(() => {
    if (!user) { setProfile(null); setLoading(false); return }

    supabase.from('profiles').select('*').eq('id', user.id).single()
      .then(({ data, error }) => {
        if (error || !data) {
          // Se não tem perfil ainda → assume admin (primeiro usuário)
          setProfile({ id: user.id, nome: user.email ?? 'Usuário', email: user.email ?? '', role: 'admin', ativo: true })
        } else {
          setProfile(data as Profile)
        }
        setLoading(false)
      })
  }, [user])

  const permissions = profile ? ROLE_PERMISSIONS[profile.role] : {
    canCreate: false, canEdit: false, canDelete: false, canViewFinanceiro: false,
    label: '', color: '', bg: '',
  }

  const isAdmin = profile?.role === 'admin'

  return { profile, loading, permissions, isAdmin }
}
