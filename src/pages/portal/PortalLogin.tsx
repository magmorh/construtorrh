import React, { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '@/lib/supabase'
import { setPortalSession } from '@/hooks/usePortalAuth'
import { HardHat, Eye, EyeOff, Loader2, Key, Lock } from 'lucide-react'

// SHA-256 via Web Crypto
async function sha256(msg: string) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(msg))
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('')
}

// ─── Modos do formulário ─────────────────────────────────────────────────────
type LoginMode = 'gestor' | 'colaborador'

// ─── Estado de troca de senha ─────────────────────────────────────────────────
interface TrocaSenhaState {
  acessoId: string
  cpf: string
  colaboradorId: string
  nomeColaborador: string
}

// ─── Campo CPF formatado ──────────────────────────────────────────────────────
function formatarCPF(valor: string) {
  const d = valor.replace(/\D/g, '').slice(0, 11)
  if (d.length <= 3) return d
  if (d.length <= 6) return `${d.slice(0,3)}.${d.slice(3)}`
  if (d.length <= 9) return `${d.slice(0,3)}.${d.slice(3,6)}.${d.slice(6)}`
  return `${d.slice(0,3)}.${d.slice(3,6)}.${d.slice(6,9)}-${d.slice(9,11)}`
}

export default function PortalLogin() {
  const nav = useNavigate()

  // ── modo e estado geral ──
  const [modo, setModo]             = useState<LoginMode>('gestor')
  const [loading, setLoading]       = useState(false)
  const [erro, setErro]             = useState('')

  // ── campos gestor (login existente) ──
  const [loginGestor, setLoginGestor] = useState('')
  const [senhaGestor, setSenhaGestor] = useState('')
  const [showSenhaG, setShowSenhaG]   = useState(false)

  // ── campos colaborador (CPF) ──
  const [cpfInput, setCpfInput]       = useState('')
  const [senhaCpf, setSenhaCpf]       = useState('')
  const [showSenhaC, setShowSenhaC]   = useState(false)

  // ── troca de senha obrigatória ──
  const [trocaSenha, setTrocaSenha]   = useState<TrocaSenhaState | null>(null)
  const [novaSenha, setNovaSenha]     = useState('')
  const [confirmSenha, setConfirmSenha] = useState('')
  const [showNova, setShowNova]       = useState(false)
  const [salvandoSenha, setSalvandoSenha] = useState(false)

  // ────────────────────────────────────────────────────────────────────────────
  // LOGIN — GESTOR (fluxo original: tabela portal_usuarios)
  // ────────────────────────────────────────────────────────────────────────────
  async function handleLoginGestor(e: React.FormEvent) {
    e.preventDefault()
    if (!loginGestor.trim() || !senhaGestor.trim()) { setErro('Preencha login e senha'); return }
    setLoading(true); setErro('')

    const hash = await sha256(senhaGestor.trim())

    const { data, error } = await supabase
      .from('portal_usuarios')
      .select('id, login, nome, obras_ids, ativo, senha_hash')
      .eq('login', loginGestor.trim().toLowerCase())
      .eq('ativo', true)
      .single()

    setLoading(false)

    if (error || !data) { setErro('Login inválido ou usuário inativo'); return }
    if (data.senha_hash !== hash) { setErro('Senha incorreta'); return }

    const obrasIds: string[] = data.obras_ids ?? []
    let obraNome: string | null = null
    if (obrasIds.length > 0) {
      const { data: obraData } = await supabase
        .from('obras').select('nome').eq('id', obrasIds[0]).single()
      obraNome = obraData?.nome ?? null
    }

    setPortalSession({ id: data.id, login: data.login, nome: data.nome, obras_ids: obrasIds, obra_nome: obraNome })
    nav('/portal/home')
  }

  // ────────────────────────────────────────────────────────────────────────────
  // LOGIN — COLABORADOR (CPF → tabela colaborador_acessos)
  // ────────────────────────────────────────────────────────────────────────────
  async function handleLoginColaborador(e: React.FormEvent) {
    e.preventDefault()
    const cpfSoNum = cpfInput.replace(/\D/g, '')
    if (cpfSoNum.length !== 11) { setErro('CPF inválido — informe os 11 dígitos'); return }
    if (!senhaCpf.trim()) { setErro('Informe a senha'); return }
    setLoading(true); setErro('')

    const hash = await sha256(senhaCpf.trim())

    // Buscar acesso pelo CPF
    const { data: acesso, error: errAcesso } = await supabase
      .from('colaborador_acessos')
      .select('id, colaborador_id, cpf, senha_hash, must_change_password, ativo, colaboradores(id, nome, status)')
      .eq('cpf', cpfSoNum)
      .single()

    setLoading(false)

    if (errAcesso || !acesso) { setErro('CPF não encontrado ou sem acesso cadastrado'); return }
    if (!acesso.ativo) { setErro('Acesso desativado. Contate o RH.'); return }
    if (acesso.senha_hash !== hash) { setErro('Senha incorreta'); return }

    // Verificar se precisa trocar a senha
    if (acesso.must_change_password) {
      setTrocaSenha({
        acessoId: acesso.id,
        cpf: cpfSoNum,
        colaboradorId: acesso.colaborador_id,
        nomeColaborador: (acesso.colaboradores as any)?.nome ?? 'Colaborador',
      })
      return
    }

    // Login completo — registrar ultimo_acesso e criar sessão
    await supabase
      .from('colaborador_acessos')
      .update({ ultimo_acesso: new Date().toISOString() })
      .eq('id', acesso.id)

    const colab = acesso.colaboradores as any
    setPortalSession({
      id:        acesso.colaborador_id,
      login:     cpfSoNum,
      nome:      colab?.nome ?? null,
      obras_ids: [],
      obra_nome: null,
    })
    nav('/portal/home')
  }

  // ────────────────────────────────────────────────────────────────────────────
  // TROCA DE SENHA OBRIGATÓRIA
  // ────────────────────────────────────────────────────────────────────────────
  async function handleTrocarSenha(e: React.FormEvent) {
    e.preventDefault()
    if (!trocaSenha) return
    if (novaSenha.length < 6) { setErro('A senha deve ter ao menos 6 caracteres'); return }
    if (novaSenha !== confirmSenha) { setErro('As senhas não conferem'); return }

    setSalvandoSenha(true); setErro('')

    const novoHash = await sha256(novaSenha)

    const { error } = await supabase
      .from('colaborador_acessos')
      .update({
        senha_hash: novoHash,
        must_change_password: false,
        ultimo_acesso: new Date().toISOString(),
      })
      .eq('id', trocaSenha.acessoId)

    setSalvandoSenha(false)

    if (error) { setErro('Erro ao salvar nova senha. Tente novamente.'); return }

    // Sessão criada após troca de senha bem-sucedida
    setPortalSession({
      id:        trocaSenha.colaboradorId,
      login:     trocaSenha.cpf,
      nome:      trocaSenha.nomeColaborador,
      obras_ids: [],
      obra_nome: null,
    })
    nav('/portal/home')
  }

  // ────────────────────────────────────────────────────────────────────────────
  // RENDER
  // ────────────────────────────────────────────────────────────────────────────

  const cardStyle: React.CSSProperties = {
    width: '100%', maxWidth: 400, background: '#fff', borderRadius: 20,
    boxShadow: '0 20px 60px rgba(0,0,0,0.3)', overflow: 'hidden',
  }

  const inputStyle: React.CSSProperties = {
    width: '100%', height: 48, border: '2px solid #e5e7eb', borderRadius: 10,
    padding: '0 14px', fontSize: 15, boxSizing: 'border-box',
    outline: 'none', background: '#f9fafb', transition: 'border-color 0.2s',
  }

  const labelStyle: React.CSSProperties = {
    fontSize: 12, fontWeight: 700, color: '#374151', display: 'block',
    marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.05em',
  }

  return (
    <div style={{
      minHeight: '100dvh', background: 'linear-gradient(135deg, #1e3a5f 0%, #2d6a4f 100%)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      padding: '24px 16px', fontFamily: 'sans-serif',
    }}>
      <div style={cardStyle}>

        {/* ── Header ─────────────────────────────────────────────────────── */}
        <div style={{
          background: 'linear-gradient(135deg, #1e3a5f, #2d6a4f)',
          padding: '28px 24px 24px', textAlign: 'center',
        }}>
          <div style={{
            width: 56, height: 56, background: 'rgba(255,255,255,0.15)',
            borderRadius: '50%', display: 'flex', alignItems: 'center',
            justifyContent: 'center', margin: '0 auto 12px',
          }}>
            {trocaSenha ? <Lock size={28} color="#fff" /> : <HardHat size={28} color="#fff" />}
          </div>
          <div style={{ color: '#fff', fontWeight: 900, fontSize: 20, letterSpacing: '-0.5px' }}>
            {trocaSenha ? 'Criar Nova Senha' : 'Portal da Obra'}
          </div>
          <div style={{ color: 'rgba(255,255,255,0.7)', fontSize: 12, marginTop: 3 }}>
            {trocaSenha
              ? `Bem-vindo(a), ${trocaSenha.nomeColaborador}`
              : 'ConstrutorRH · Acesso Restrito'
            }
          </div>
        </div>

        {/* ── Seletor de modo (apenas quando não está em trocaSenha) ─────── */}
        {!trocaSenha && (
          <div style={{ display: 'flex', borderBottom: '1px solid #e5e7eb' }}>
            <button
              type="button"
              onClick={() => { setModo('gestor'); setErro('') }}
              style={{
                flex: 1, padding: '12px 0', fontSize: 13, fontWeight: modo === 'gestor' ? 700 : 500,
                border: 'none', background: 'none', cursor: 'pointer',
                color: modo === 'gestor' ? '#1e3a5f' : '#9ca3af',
                borderBottom: modo === 'gestor' ? '2px solid #1e3a5f' : '2px solid transparent',
                marginBottom: -1, transition: 'all 0.2s',
              }}
            >
              👷 Gestor de Obra
            </button>
            <button
              type="button"
              onClick={() => { setModo('colaborador'); setErro('') }}
              style={{
                flex: 1, padding: '12px 0', fontSize: 13, fontWeight: modo === 'colaborador' ? 700 : 500,
                border: 'none', background: 'none', cursor: 'pointer',
                color: modo === 'colaborador' ? '#1e3a5f' : '#9ca3af',
                borderBottom: modo === 'colaborador' ? '2px solid #1e3a5f' : '2px solid transparent',
                marginBottom: -1, transition: 'all 0.2s',
              }}
            >
              🪪 Colaborador (CPF)
            </button>
          </div>
        )}

        {/* ── Alerta de erro ─────────────────────────────────────────────── */}
        {erro && (
          <div style={{ margin: '16px 24px 0', background:'#fef2f2', border:'1px solid #fecaca', borderRadius:10, padding:'10px 14px', fontSize:13, color:'#dc2626', fontWeight:600, textAlign:'center' }}>
            {erro}
          </div>
        )}

        {/* ══════════════════════════════════════════════════════════════════
            FORM: TROCA DE SENHA OBRIGATÓRIA
        ══════════════════════════════════════════════════════════════════ */}
        {trocaSenha && (
          <form onSubmit={handleTrocarSenha} style={{ padding: '24px' }}>
            <div style={{ background:'#fef3c7', border:'1px solid #fcd34d', borderRadius:10, padding:'10px 14px', fontSize:12, color:'#92400e', marginBottom:20, fontWeight:600 }}>
              🔐 Este é seu primeiro acesso. Crie uma senha pessoal para continuar.
            </div>

            <div style={{ marginBottom: 16 }}>
              <label style={labelStyle}>Nova Senha</label>
              <div style={{ position: 'relative' }}>
                <input
                  type={showNova ? 'text' : 'password'}
                  value={novaSenha}
                  onChange={e => setNovaSenha(e.target.value)}
                  placeholder="Mínimo 6 caracteres"
                  autoComplete="new-password"
                  style={{ ...inputStyle, paddingRight: 44 }}
                  onFocus={e => (e.target.style.borderColor = '#1e3a5f')}
                  onBlur={e => (e.target.style.borderColor = '#e5e7eb')}
                />
                <button type="button" onClick={() => setShowNova(s => !s)}
                  style={{ position:'absolute', right:12, top:'50%', transform:'translateY(-50%)', background:'none', border:'none', cursor:'pointer', color:'#9ca3af', padding:4 }}>
                  {showNova ? <EyeOff size={18}/> : <Eye size={18}/>}
                </button>
              </div>
            </div>

            <div style={{ marginBottom: 24 }}>
              <label style={labelStyle}>Confirme a Nova Senha</label>
              <input
                type="password"
                value={confirmSenha}
                onChange={e => setConfirmSenha(e.target.value)}
                placeholder="Repita a senha"
                autoComplete="new-password"
                style={inputStyle}
                onFocus={e => (e.target.style.borderColor = '#1e3a5f')}
                onBlur={e => (e.target.style.borderColor = '#e5e7eb')}
              />
              {confirmSenha && novaSenha !== confirmSenha && (
                <p style={{ fontSize:11, color:'#dc2626', marginTop:4 }}>As senhas não conferem</p>
              )}
            </div>

            <button type="submit" disabled={salvandoSenha}
              style={{ width:'100%', height:50, background: salvandoSenha ? '#94a3b8' : 'linear-gradient(135deg, #1e3a5f, #2d6a4f)', color:'#fff', border:'none', borderRadius:12, fontSize:15, fontWeight:700, cursor: salvandoSenha ? 'not-allowed' : 'pointer', display:'flex', alignItems:'center', justifyContent:'center', gap:8 }}>
              {salvandoSenha ? <><Loader2 size={18} className="animate-spin"/>Salvando…</> : <><Key size={17}/>Salvar Senha e Entrar</>}
            </button>
          </form>
        )}

        {/* ══════════════════════════════════════════════════════════════════
            FORM: LOGIN GESTOR
        ══════════════════════════════════════════════════════════════════ */}
        {!trocaSenha && modo === 'gestor' && (
          <form onSubmit={handleLoginGestor} style={{ padding: '24px' }}>
            <div style={{ marginBottom: 16 }}>
              <label style={labelStyle}>ID / Login</label>
              <input
                type="text" value={loginGestor} onChange={e => setLoginGestor(e.target.value)}
                autoComplete="username" autoCapitalize="none"
                placeholder="Seu ID de acesso"
                style={inputStyle}
                onFocus={e => (e.target.style.borderColor = '#1e3a5f')}
                onBlur={e => (e.target.style.borderColor = '#e5e7eb')}
              />
            </div>

            <div style={{ marginBottom: 24 }}>
              <label style={labelStyle}>Senha</label>
              <div style={{ position: 'relative' }}>
                <input
                  type={showSenhaG ? 'text' : 'password'}
                  value={senhaGestor} onChange={e => setSenhaGestor(e.target.value)}
                  autoComplete="current-password" placeholder="Sua senha"
                  style={{ ...inputStyle, paddingRight: 44 }}
                  onFocus={e => (e.target.style.borderColor = '#1e3a5f')}
                  onBlur={e => (e.target.style.borderColor = '#e5e7eb')}
                />
                <button type="button" onClick={() => setShowSenhaG(s => !s)}
                  style={{ position:'absolute', right:12, top:'50%', transform:'translateY(-50%)', background:'none', border:'none', cursor:'pointer', color:'#9ca3af', padding:4 }}>
                  {showSenhaG ? <EyeOff size={18}/> : <Eye size={18}/>}
                </button>
              </div>
            </div>

            <button type="submit" disabled={loading}
              style={{ width:'100%', height:50, background: loading ? '#94a3b8' : 'linear-gradient(135deg, #1e3a5f, #2d6a4f)', color:'#fff', border:'none', borderRadius:12, fontSize:16, fontWeight:700, cursor: loading ? 'not-allowed' : 'pointer', display:'flex', alignItems:'center', justifyContent:'center', gap:8 }}>
              {loading ? <><Loader2 size={18} className="animate-spin"/>Verificando…</> : 'Entrar no Portal'}
            </button>
          </form>
        )}

        {/* ══════════════════════════════════════════════════════════════════
            FORM: LOGIN COLABORADOR (CPF)
        ══════════════════════════════════════════════════════════════════ */}
        {!trocaSenha && modo === 'colaborador' && (
          <form onSubmit={handleLoginColaborador} style={{ padding: '24px' }}>
            <div style={{ marginBottom: 16 }}>
              <label style={labelStyle}>CPF</label>
              <input
                type="text"
                inputMode="numeric"
                value={cpfInput}
                onChange={e => setCpfInput(formatarCPF(e.target.value))}
                autoComplete="username"
                placeholder="000.000.000-00"
                maxLength={14}
                style={inputStyle}
                onFocus={e => (e.target.style.borderColor = '#1e3a5f')}
                onBlur={e => (e.target.style.borderColor = '#e5e7eb')}
              />
            </div>

            <div style={{ marginBottom: 24 }}>
              <label style={labelStyle}>Senha</label>
              <div style={{ position: 'relative' }}>
                <input
                  type={showSenhaC ? 'text' : 'password'}
                  value={senhaCpf} onChange={e => setSenhaCpf(e.target.value)}
                  autoComplete="current-password" placeholder="Sua senha (padrão: 123)"
                  style={{ ...inputStyle, paddingRight: 44 }}
                  onFocus={e => (e.target.style.borderColor = '#1e3a5f')}
                  onBlur={e => (e.target.style.borderColor = '#e5e7eb')}
                />
                <button type="button" onClick={() => setShowSenhaC(s => !s)}
                  style={{ position:'absolute', right:12, top:'50%', transform:'translateY(-50%)', background:'none', border:'none', cursor:'pointer', color:'#9ca3af', padding:4 }}>
                  {showSenhaC ? <EyeOff size={18}/> : <Eye size={18}/>}
                </button>
              </div>
              <p style={{ fontSize:11, color:'#9ca3af', marginTop:5 }}>
                Primeiro acesso? Use a senha <strong>123</strong> — o sistema pedirá para você criar uma senha pessoal.
              </p>
            </div>

            <button type="submit" disabled={loading}
              style={{ width:'100%', height:50, background: loading ? '#94a3b8' : 'linear-gradient(135deg, #1e3a5f, #2d6a4f)', color:'#fff', border:'none', borderRadius:12, fontSize:16, fontWeight:700, cursor: loading ? 'not-allowed' : 'pointer', display:'flex', alignItems:'center', justifyContent:'center', gap:8 }}>
              {loading ? <><Loader2 size={18} className="animate-spin"/>Verificando…</> : 'Entrar com CPF'}
            </button>
          </form>
        )}

        {/* ── Rodapé ─────────────────────────────────────────────────────── */}
        {!trocaSenha && (
          <p style={{ textAlign:'center', fontSize:11, color:'#9ca3af', padding:'0 24px 20px', margin:0 }}>
            Acesso fornecido pelo RH · ConstrutorRH
          </p>
        )}
      </div>
    </div>
  )
}
