import React, { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '@/lib/supabase'
import { setGestorSession } from '@/hooks/useGestorAuth'
import { HardHat, Eye, EyeOff, Loader2, BarChart3 } from 'lucide-react'

async function sha256(msg: string) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(msg))
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('')
}

export default function GestorLogin() {
  const nav = useNavigate()
  const [login, setLogin]       = useState('')
  const [senha, setSenha]       = useState('')
  const [showSenha, setShowSenha] = useState(false)
  const [loading, setLoading]   = useState(false)
  const [erro, setErro]         = useState('')

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault()
    if (!login.trim() || !senha.trim()) { setErro('Preencha o código e a senha'); return }
    setLoading(true); setErro('')

    const hash = await sha256(senha.trim())

    const { data, error } = await supabase
      .from('gestor_usuarios')
      .select('id, login, nome, obras_ids, ativo, senha_hash, nivel')
      .eq('login', login.trim().toLowerCase())
      .eq('ativo', true)
      .single()

    setLoading(false)

    if (error || !data) { setErro('Código inválido ou acesso inativo'); return }
    if (data.senha_hash !== hash) { setErro('Senha incorreta'); return }

    setGestorSession({
      id:        data.id,
      login:     data.login,
      nome:      data.nome,
      obras_ids: data.obras_ids ?? [],
      nivel:     data.nivel ?? 'gestor',
    })
    nav('/gestor')
  }

  const inputStyle: React.CSSProperties = {
    width: '100%', height: 50, border: '2px solid #e5e7eb', borderRadius: 12,
    padding: '0 14px', fontSize: 15, boxSizing: 'border-box',
    outline: 'none', background: '#f9fafb', color: '#0f172a',
    transition: 'border-color 0.2s',
  }

  return (
    <div style={{
      minHeight: '100dvh',
      background: 'linear-gradient(135deg, #0f172a 0%, #1e3a5f 50%, #1a4731 100%)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      padding: '24px 16px', fontFamily: 'system-ui, sans-serif',
    }}>
      {/* Card */}
      <div style={{
        width: '100%', maxWidth: 400, background: '#fff', borderRadius: 24,
        boxShadow: '0 24px 80px rgba(0,0,0,0.4)', overflow: 'hidden',
      }}>

        {/* Header */}
        <div style={{
          background: 'linear-gradient(135deg, #0f172a 0%, #1e3a5f 60%, #1a4731 100%)',
          padding: '36px 28px 30px', textAlign: 'center', position: 'relative',
        }}>
          {/* Ícones decorativos */}
          <div style={{ position: 'absolute', top: 16, right: 20, opacity: 0.12, fontSize: 48 }}>📊</div>
          <div style={{ position: 'absolute', top: 20, left: 16, opacity: 0.10, fontSize: 40 }}>🏗️</div>

          <div style={{
            width: 72, height: 72,
            background: 'linear-gradient(135deg, rgba(251,191,36,0.25), rgba(251,191,36,0.15))',
            border: '2px solid rgba(251,191,36,0.4)',
            borderRadius: '50%', display: 'flex', alignItems: 'center',
            justifyContent: 'center', margin: '0 auto 18px',
          }}>
            <BarChart3 size={34} color="#fbbf24" />
          </div>
          <div style={{ color: '#fff', fontWeight: 900, fontSize: 24, letterSpacing: '-0.5px' }}>
            Portal do Gestor
          </div>
          <div style={{ color: 'rgba(255,255,255,0.6)', fontSize: 13, marginTop: 6 }}>
            ConstrutorRH · Acesso Restrito
          </div>
        </div>

        {/* Form */}
        <form onSubmit={handleLogin} style={{ padding: '32px 28px 28px' }}>
          {erro && (
            <div style={{
              background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 10,
              padding: '11px 14px', fontSize: 13, color: '#dc2626',
              marginBottom: 20, fontWeight: 600, textAlign: 'center',
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
            }}>
              ⚠️ {erro}
            </div>
          )}

          {/* Código */}
          <div style={{ marginBottom: 16 }}>
            <label style={{
              fontSize: 11, fontWeight: 800, color: '#374151', display: 'block',
              marginBottom: 7, textTransform: 'uppercase', letterSpacing: '0.08em',
            }}>
              Código de Acesso
            </label>
            <input
              type="text" value={login} onChange={e => setLogin(e.target.value)}
              autoComplete="username" autoCapitalize="none" autoCorrect="off"
              placeholder="Ex.: GEST-001"
              style={inputStyle}
              onFocus={e => e.target.style.borderColor = '#1e3a5f'}
              onBlur={e => e.target.style.borderColor = '#e5e7eb'}
            />
          </div>

          {/* Senha */}
          <div style={{ marginBottom: 24 }}>
            <label style={{
              fontSize: 11, fontWeight: 800, color: '#374151', display: 'block',
              marginBottom: 7, textTransform: 'uppercase', letterSpacing: '0.08em',
            }}>
              Senha
            </label>
            <div style={{ position: 'relative' }}>
              <input
                type={showSenha ? 'text' : 'password'}
                value={senha} onChange={e => setSenha(e.target.value)}
                autoComplete="current-password"
                placeholder="••••••••"
                style={{ ...inputStyle, paddingRight: 48 }}
                onFocus={e => e.target.style.borderColor = '#1e3a5f'}
                onBlur={e => e.target.style.borderColor = '#e5e7eb'}
              />
              <button
                type="button" onClick={() => setShowSenha(p => !p)}
                style={{
                  position: 'absolute', right: 14, top: '50%', transform: 'translateY(-50%)',
                  background: 'none', border: 'none', cursor: 'pointer', color: '#9ca3af', padding: 0,
                }}
              >
                {showSenha ? <EyeOff size={18} /> : <Eye size={18} />}
              </button>
            </div>
          </div>

          {/* Botão */}
          <button
            type="submit" disabled={loading}
            style={{
              width: '100%', height: 52, borderRadius: 12, border: 'none',
              background: loading
                ? '#94a3b8'
                : 'linear-gradient(135deg, #0f172a 0%, #1e3a5f 60%, #1a4731 100%)',
              color: '#fff', fontWeight: 800, fontSize: 15,
              cursor: loading ? 'not-allowed' : 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10,
              boxShadow: loading ? 'none' : '0 4px 20px rgba(15,23,42,0.4)',
              transition: 'opacity 0.2s',
            }}
          >
            {loading
              ? <><Loader2 size={18} style={{ animation: 'spin 1s linear infinite' }} /> Verificando…</>
              : <><BarChart3 size={18} /> Acessar Portal</>
            }
          </button>
        </form>

        {/* Footer */}
        <div style={{
          padding: '12px 28px 20px', textAlign: 'center',
          fontSize: 11, color: '#9ca3af',
          borderTop: '1px solid #f1f5f9',
        }}>
          Acesso exclusivo para gestores autorizados · ConstrutorRH
        </div>
      </div>

      {/* Animação spin */}
      <style>{`@keyframes spin { from{transform:rotate(0deg)} to{transform:rotate(360deg)} }`}</style>
    </div>
  )
}
