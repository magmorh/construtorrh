import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import type { User } from '@supabase/supabase-js'

export function useAuth() {
  const [user, setUser]       = useState<User | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    // Carrega sessão inicial — SEMPRE chama setLoading(false) ao final
    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user ?? null)
      setLoading(false)
    }).catch(() => {
      setLoading(false)
    })

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_e, session) => {
      setUser(session?.user ?? null)
    })

    return () => subscription.unsubscribe()
  }, [])

  const signIn = async (email: string, password: string) => {
    const { data, error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) throw error

    // Verifica se o usuário está ativo — com timeout de segurança
    if (data.user) {
      try {
        const { data: profile } = await supabase
          .from('profiles')
          .select('ativo')
          .eq('id', data.user.id)
          .single()

        // Se encontrou o perfil e ativo === false → bloqueia
        if (profile && profile.ativo === false) {
          await supabase.auth.signOut()
          throw new Error('Usuário inativo. Entre em contato com o administrador.')
        }
      } catch (err: any) {
        // Se o erro for o nosso próprio lançamento de "inativo", propaga
        if (err?.message?.includes('inativo')) throw err
        // Qualquer outro erro (ex: tabela não acessível) → deixa passar
        console.warn('Aviso: não foi possível verificar status do usuário', err)
      }
    }
  }

  const signOut = async () => {
    await supabase.auth.signOut()
  }

  return { user, loading, signIn, signOut }
}
