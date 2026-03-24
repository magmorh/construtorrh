import React, { useEffect, useState, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '@/lib/supabase'
import { getPortalSession } from '@/hooks/usePortalAuth'
import PortalLayout from './PortalLayout'
import { UserPlus, CheckCircle2, Loader2, Clock, Check, X, ChevronDown, ChevronUp } from 'lucide-react'

interface SolicRow { id: string; dados: any; status: string; criado_em: string; observacoes_admin?: string }
interface FuncaoRow { id: string; nome: string }

// ── helper: seção colapsável ──────────────────────────────────────────────────
function Secao({ titulo, children, defaultOpen = true }: { titulo: string; children: React.ReactNode; defaultOpen?: boolean }) {
  const [open, setOpen] = useState(defaultOpen)
  return (
    <div style={{ border: '1px solid #e5e7eb', borderRadius: 10, overflow: 'hidden', marginBottom: 2 }}>
      <button type="button" onClick={() => setOpen(o => !o)}
        style={{ width: '100%', padding: '12px 14px', background: '#f9fafb', border: 'none', cursor: 'pointer', display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontWeight: 700, fontSize: 13, color: '#1e3a5f' }}>
        {titulo}
        {open ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
      </button>
      {open && <div style={{ padding: '14px', display: 'flex', flexDirection: 'column', gap: 12 }}>{children}</div>}
    </div>
  )
}

// ── helper: campo input ────────────────────────────────────────────────────────
function Campo({ label, required, children }: { label: string; required?: boolean; children: React.ReactNode }) {
  return (
    <div>
      <label style={{ fontSize: 11, fontWeight: 700, color: '#374151', display: 'block', marginBottom: 5, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
        {label}{required && <span style={{ color: '#dc2626' }}> *</span>}
      </label>
      {children}
    </div>
  )
}

const INPUT_STYLE: React.CSSProperties = {
  width: '100%', height: 42, border: '1px solid #e5e7eb', borderRadius: 8,
  padding: '0 11px', fontSize: 13, boxSizing: 'border-box', background: '#fff',
}
const SELECT_STYLE: React.CSSProperties = { ...INPUT_STYLE, cursor: 'pointer' }

export default function PortalSolicitacoes() {
  const nav = useNavigate()
  const session = getPortalSession()
  const obras = session?.obras_ids ?? []

  const [obraId, setObraId]     = useState(obras[0] ?? '')
  const [obrasData, setObrasData] = useState<{id:string;nome:string}[]>([])
  const [funcoes, setFuncoes]   = useState<FuncaoRow[]>([])
  const [historico, setHistorico] = useState<SolicRow[]>([])
  const [aba, setAba]           = useState<'nova' | 'historico'>('nova')
  const [saving, setSaving]     = useState(false)
  const [sucesso, setSucesso]   = useState(false)

  // ── Dados Pessoais ──────────────────────────────────────────────────────────
  const [nome, setNome]               = useState('')
  const [cpf, setCpf]                 = useState('')
  const [rg, setRg]                   = useState('')
  const [pisNit, setPisNit]           = useState('')
  const [dataNasc, setDataNasc]       = useState('')
  const [genero, setGenero]           = useState('')
  const [estadoCivil, setEstadoCivil] = useState('')
  const [telefone, setTelefone]       = useState('')
  const [email, setEmail]             = useState('')
  const [ctpsNumero, setCtpsNumero]   = useState('')
  const [ctpsSerie, setCtpsSerie]     = useState('')

  // ── Endereço ────────────────────────────────────────────────────────────────
  const [cep, setCep]           = useState('')
  const [endereco, setEndereco] = useState('')
  const [cidade, setCidade]     = useState('')
  const [estado, setEstado]     = useState('')

  // ── Contrato ────────────────────────────────────────────────────────────────
  const [funcaoId, setFuncaoId]       = useState('')
  const [tipoContr, setTipoContr]     = useState('clt')
  const [admissao, setAdmissao]       = useState(new Date().toISOString().slice(0, 10))

  // ── Bancário ────────────────────────────────────────────────────────────────
  const [banco, setBanco]       = useState('')
  const [agencia, setAgencia]   = useState('')
  const [conta, setConta]       = useState('')
  const [tipoConta, setTipoConta] = useState('corrente')
  const [pixTipo, setPixTipo]   = useState('')
  const [pixChave, setPixChave] = useState('')

  // ── VT ──────────────────────────────────────────────────────────────────────
  const [vtModalidade, setVtModalidade] = useState('nenhum')
  const [vtGasolina, setVtGasolina]     = useState('')
  const [vtCartaoTipo, setVtCartaoTipo] = useState('')
  const [vtCartaoNum, setVtCartaoNum]   = useState('')
  const [vtTrechoIda, setVtTrechoIda]   = useState('')   // simplificado para portal
  const [vtTrechoVolta, setVtTrechoVolta] = useState('')

  // ── Observações ─────────────────────────────────────────────────────────────
  const [obs, setObs] = useState('')

  const fetchObras = useCallback(async () => {
    if (!obras.length) return
    const { data: d } = await supabase.from('obras').select('id,nome').in('id', obras).order('nome')
    if (d) setObrasData(d)
  }, [obras.join(',')])

  const fetchFuncoes = useCallback(async () => {
    const { data: d } = await supabase.from('funcoes').select('id,nome').eq('ativo', true).order('nome')
    if (d) setFuncoes(d)
  }, [])

  const fetchHistorico = useCallback(async () => {
    if (!obraId) return
    const { data: d } = await supabase
      .from('portal_solicitacoes')
      .select('id,dados,status,criado_em,observacoes_admin')
      .eq('obra_id', obraId)
      .eq('tipo', 'novo_colaborador')
      .order('criado_em', { ascending: false })
    if (d) setHistorico(d)
  }, [obraId])

  useEffect(() => { if (!session) { nav('/portal'); return } fetchObras(); fetchFuncoes() }, [])
  useEffect(() => { fetchHistorico() }, [fetchHistorico])

  function resetForm() {
    setNome(''); setCpf(''); setRg(''); setPisNit(''); setDataNasc(''); setGenero(''); setEstadoCivil('')
    setTelefone(''); setEmail(''); setCtpsNumero(''); setCtpsSerie('')
    setCep(''); setEndereco(''); setCidade(''); setEstado('')
    setFuncaoId(''); setTipoContr('clt'); setAdmissao(new Date().toISOString().slice(0, 10))
    setBanco(''); setAgencia(''); setConta(''); setTipoConta('corrente'); setPixTipo(''); setPixChave('')
    setVtModalidade('nenhum'); setVtGasolina(''); setVtCartaoTipo(''); setVtCartaoNum('')
    setVtTrechoIda(''); setVtTrechoVolta(''); setObs('')
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!nome.trim()) return
    setSaving(true)
    const dados = {
      nome, cpf, rg, pis_nit: pisNit, data_nascimento: dataNasc, genero, estado_civil: estadoCivil,
      telefone, email, ctps_numero: ctpsNumero, ctps_serie: ctpsSerie,
      cep, endereco, cidade, estado,
      funcao_id: funcaoId, tipo_contrato: tipoContr, data_admissao: admissao,
      banco, agencia, conta, tipo_conta: tipoConta, pix_tipo: pixTipo, pix_chave: pixChave,
      vt_modalidade: vtModalidade, vt_gasolina_valor_dia: vtGasolina,
      vt_cartao_tipo: vtCartaoTipo, vt_cartao_numero: vtCartaoNum,
      vt_trecho_ida: vtTrechoIda, vt_trecho_volta: vtTrechoVolta,
      observacoes: obs,
    }
    const { error } = await supabase.from('portal_solicitacoes').insert({
      obra_id: obraId, tipo: 'novo_colaborador', dados, portal_usuario_id: session?.id,
    })
    setSaving(false)
    if (!error) {
      setSucesso(true); resetForm(); fetchHistorico()
      setTimeout(() => { setSucesso(false); setAba('historico') }, 1800)
    }
  }

  const statusBadge = (s: string) => {
    if (s === 'aprovado') return { bg: '#dcfce7', cor: '#15803d', label: '✓ Aprovado',  icon: <Check size={12} /> }
    if (s === 'recusado') return { bg: '#fee2e2', cor: '#dc2626', label: '✗ Recusado',  icon: <X size={12} /> }
    return                       { bg: '#fef3c7', cor: '#b45309', label: '⏳ Pendente', icon: <Clock size={12} /> }
  }

  return (
    <PortalLayout>
      <div style={{ padding: '16px 16px 8px' }}>
        <div style={{ fontWeight: 800, fontSize: 18, color: '#1e3a5f' }}>👷 Solicitar Colaborador</div>
        <div style={{ fontSize: 12, color: '#9ca3af' }}>Preencha os dados do novo funcionário para cadastro</div>
      </div>

      {obrasData.length > 1 && (
        <div style={{ padding: '0 16px 10px' }}>
          <select value={obraId} onChange={e => setObraId(e.target.value)} style={SELECT_STYLE}>
            {obrasData.map(o => <option key={o.id} value={o.id}>{o.nome}</option>)}
          </select>
        </div>
      )}

      {/* Abas */}
      <div style={{ display: 'flex', margin: '0 16px 12px', background: '#f3f4f6', borderRadius: 10, padding: 4 }}>
        {(['nova', 'historico'] as const).map(a => (
          <button key={a} onClick={() => setAba(a)} style={{
            flex: 1, height: 36, border: 'none', borderRadius: 8, cursor: 'pointer', fontWeight: 700, fontSize: 13,
            background: aba === a ? '#fff' : 'transparent', color: aba === a ? '#1e3a5f' : '#9ca3af',
            boxShadow: aba === a ? '0 1px 4px rgba(0,0,0,0.1)' : 'none',
          }}>
            {a === 'nova' ? '+ Nova Solicitação' : `Minhas Solicitações (${historico.length})`}
          </button>
        ))}
      </div>

      {/* ── FORMULÁRIO COMPLETO ── */}
      {aba === 'nova' && (
        <form onSubmit={handleSubmit} style={{ padding: '0 16px 32px', display: 'flex', flexDirection: 'column', gap: 10 }}>
          {sucesso && (
            <div style={{ background: '#dcfce7', border: '1px solid #86efac', borderRadius: 10, padding: '12px 16px', display: 'flex', alignItems: 'center', gap: 8, color: '#15803d', fontWeight: 700 }}>
              <CheckCircle2 size={18} /> Solicitação enviada! Aguarde aprovação do administrador.
            </div>
          )}

          {/* Dados Pessoais */}
          <Secao titulo="👤 Dados Pessoais">
            <Campo label="Nome Completo" required>
              <input value={nome} onChange={e => setNome(e.target.value)} required placeholder="Nome completo" style={INPUT_STYLE} />
            </Campo>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              <Campo label="CPF">
                <input value={cpf} onChange={e => setCpf(e.target.value)} placeholder="000.000.000-00" style={INPUT_STYLE} />
              </Campo>
              <Campo label="RG">
                <input value={rg} onChange={e => setRg(e.target.value)} placeholder="00.000.000-0" style={INPUT_STYLE} />
              </Campo>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              <Campo label="PIS/NIT">
                <input value={pisNit} onChange={e => setPisNit(e.target.value)} placeholder="000.00000.00-0" style={INPUT_STYLE} />
              </Campo>
              <Campo label="Data de Nascimento">
                <input type="date" value={dataNasc} onChange={e => setDataNasc(e.target.value)} style={INPUT_STYLE} />
              </Campo>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              <Campo label="Gênero">
                <select value={genero} onChange={e => setGenero(e.target.value)} style={SELECT_STYLE}>
                  <option value="">Selecione…</option>
                  <option value="M">Masculino</option>
                  <option value="F">Feminino</option>
                  <option value="outro">Outro</option>
                </select>
              </Campo>
              <Campo label="Estado Civil">
                <select value={estadoCivil} onChange={e => setEstadoCivil(e.target.value)} style={SELECT_STYLE}>
                  <option value="">Selecione…</option>
                  <option value="solteiro">Solteiro(a)</option>
                  <option value="casado">Casado(a)</option>
                  <option value="divorciado">Divorciado(a)</option>
                  <option value="viuvo">Viúvo(a)</option>
                  <option value="uniao_estavel">União Estável</option>
                </select>
              </Campo>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              <Campo label="Telefone">
                <input value={telefone} onChange={e => setTelefone(e.target.value)} placeholder="(xx) xxxxx-xxxx" style={INPUT_STYLE} />
              </Campo>
              <Campo label="E-mail">
                <input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="email@exemplo.com" style={INPUT_STYLE} />
              </Campo>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              <Campo label="CTPS Número">
                <input value={ctpsNumero} onChange={e => setCtpsNumero(e.target.value)} placeholder="00000000" style={INPUT_STYLE} />
              </Campo>
              <Campo label="CTPS Série">
                <input value={ctpsSerie} onChange={e => setCtpsSerie(e.target.value)} placeholder="0000" style={INPUT_STYLE} />
              </Campo>
            </div>
          </Secao>

          {/* Endereço */}
          <Secao titulo="📍 Endereço" defaultOpen={false}>
            <div style={{ display: 'grid', gridTemplateColumns: '120px 1fr', gap: 10 }}>
              <Campo label="CEP">
                <input value={cep} onChange={e => setCep(e.target.value)} placeholder="00000-000" style={INPUT_STYLE} />
              </Campo>
              <Campo label="Endereço">
                <input value={endereco} onChange={e => setEndereco(e.target.value)} placeholder="Rua, número, bairro" style={INPUT_STYLE} />
              </Campo>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 80px', gap: 10 }}>
              <Campo label="Cidade">
                <input value={cidade} onChange={e => setCidade(e.target.value)} placeholder="Cidade" style={INPUT_STYLE} />
              </Campo>
              <Campo label="UF">
                <input value={estado} onChange={e => setEstado(e.target.value.toUpperCase().slice(0,2))} placeholder="SP" maxLength={2} style={INPUT_STYLE} />
              </Campo>
            </div>
          </Secao>

          {/* Contrato */}
          <Secao titulo="📋 Contrato">
            <Campo label="Função" required>
              <select value={funcaoId} onChange={e => setFuncaoId(e.target.value)} style={SELECT_STYLE}>
                <option value="">Selecione a função…</option>
                {funcoes.map(f => <option key={f.id} value={f.id}>{f.nome}</option>)}
              </select>
            </Campo>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              <Campo label="Tipo de Contrato">
                <select value={tipoContr} onChange={e => setTipoContr(e.target.value)} style={SELECT_STYLE}>
                  <option value="clt">CLT</option>
                  <option value="autonomo">Autônomo</option>
                  <option value="estagio">Estágio</option>
                </select>
              </Campo>
              <Campo label="Data de Admissão">
                <input type="date" value={admissao} onChange={e => setAdmissao(e.target.value)} style={INPUT_STYLE} />
              </Campo>
            </div>
          </Secao>

          {/* Dados Bancários */}
          <Secao titulo="🏦 Dados Bancários" defaultOpen={false}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              <Campo label="Banco">
                <input value={banco} onChange={e => setBanco(e.target.value)} placeholder="Ex.: 001 – Banco do Brasil" style={INPUT_STYLE} />
              </Campo>
              <Campo label="Tipo de Conta">
                <select value={tipoConta} onChange={e => setTipoConta(e.target.value)} style={SELECT_STYLE}>
                  <option value="corrente">Corrente</option>
                  <option value="poupanca">Poupança</option>
                </select>
              </Campo>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              <Campo label="Agência">
                <input value={agencia} onChange={e => setAgencia(e.target.value)} placeholder="0000" style={INPUT_STYLE} />
              </Campo>
              <Campo label="Conta">
                <input value={conta} onChange={e => setConta(e.target.value)} placeholder="00000-0" style={INPUT_STYLE} />
              </Campo>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              <Campo label="Tipo de PIX">
                <select value={pixTipo} onChange={e => setPixTipo(e.target.value)} style={SELECT_STYLE}>
                  <option value="">Nenhum</option>
                  <option value="cpf">CPF</option>
                  <option value="telefone">Telefone</option>
                  <option value="email">E-mail</option>
                  <option value="aleatoria">Chave Aleatória</option>
                </select>
              </Campo>
              <Campo label="Chave PIX">
                <input value={pixChave} onChange={e => setPixChave(e.target.value)} placeholder="Chave PIX" style={INPUT_STYLE} />
              </Campo>
            </div>
          </Secao>

          {/* Vale Transporte */}
          <Secao titulo="🚌 Vale Transporte" defaultOpen={false}>
            <Campo label="Modalidade VT">
              <select value={vtModalidade} onChange={e => setVtModalidade(e.target.value)} style={SELECT_STYLE}>
                <option value="nenhum">Não tem VT</option>
                <option value="cartao">Cartão VT</option>
                <option value="gasolina">Reembolso Gasolina</option>
                <option value="dinheiro">Dinheiro</option>
              </select>
            </Campo>
            {vtModalidade === 'gasolina' && (
              <Campo label="Valor diário (gasolina)">
                <input type="number" value={vtGasolina} onChange={e => setVtGasolina(e.target.value)} placeholder="0.00" step="0.01" style={INPUT_STYLE} />
              </Campo>
            )}
            {(vtModalidade === 'cartao' || vtModalidade === 'dinheiro') && (<>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                <Campo label="Empresa do Cartão">
                  <input value={vtCartaoTipo} onChange={e => setVtCartaoTipo(e.target.value)} placeholder="Ex.: Ótimo, BHBus" style={INPUT_STYLE} />
                </Campo>
                <Campo label="Número do Cartão">
                  <input value={vtCartaoNum} onChange={e => setVtCartaoNum(e.target.value)} placeholder="0000000000" style={INPUT_STYLE} />
                </Campo>
              </div>
              <Campo label="Trechos Ida (descrição)">
                <input value={vtTrechoIda} onChange={e => setVtTrechoIda(e.target.value)} placeholder="Ex.: Terminal → Obra (R$ 4,50)" style={INPUT_STYLE} />
              </Campo>
              <Campo label="Trechos Volta (descrição)">
                <input value={vtTrechoVolta} onChange={e => setVtTrechoVolta(e.target.value)} placeholder="Ex.: Obra → Terminal (R$ 4,50)" style={INPUT_STYLE} />
              </Campo>
            </>)}
          </Secao>

          {/* Observações */}
          <div>
            <label style={{ fontSize: 11, fontWeight: 700, color: '#374151', display: 'block', marginBottom: 5, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Observações</label>
            <textarea value={obs} onChange={e => setObs(e.target.value)} rows={3}
              placeholder="Informações adicionais…"
              style={{ width: '100%', border: '1px solid #e5e7eb', borderRadius: 8, padding: '10px 12px', fontSize: 13, boxSizing: 'border-box', background: '#fff', resize: 'vertical' }} />
          </div>

          <button type="submit" disabled={saving || !nome.trim()} style={{
            height: 52, background: saving ? '#94a3b8' : '#15803d', color: '#fff',
            border: 'none', borderRadius: 12, fontSize: 16, fontWeight: 700,
            cursor: saving ? 'not-allowed' : 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
          }}>
            {saving ? <><Loader2 size={18} className="animate-spin" /> Enviando…</> : <><UserPlus size={18} /> Enviar Solicitação de Cadastro</>}
          </button>
        </form>
      )}

      {/* ── HISTÓRICO ── */}
      {aba === 'historico' && (
        <div style={{ padding: '0 16px 24px' }}>
          {historico.length === 0 ? (
            <div style={{ background: '#fff', borderRadius: 12, padding: 32, textAlign: 'center', color: '#9ca3af' }}>
              Nenhuma solicitação enviada ainda
            </div>
          ) : historico.map(s => {
            const badge = statusBadge(s.status)
            return (
              <div key={s.id} style={{ background: '#fff', borderRadius: 12, border: `2px solid ${badge.bg}`, marginBottom: 10, padding: '14px 16px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 700, fontSize: 14, color: '#111' }}>👷 {s.dados?.nome ?? '—'}</div>
                    <div style={{ fontSize: 11, color: '#9ca3af', marginTop: 2, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                      {s.dados?.cpf && <span>{s.dados.cpf}</span>}
                      {funcoes.find(f => f.id === s.dados?.funcao_id)?.nome && (
                        <span style={{ background: '#eff6ff', color: '#1d4ed8', borderRadius: 4, padding: '0 5px' }}>
                          {funcoes.find(f => f.id === s.dados?.funcao_id)?.nome}
                        </span>
                      )}
                      {s.dados?.tipo_contrato && <span style={{ textTransform: 'uppercase' }}>{s.dados.tipo_contrato}</span>}
                    </div>
                  </div>
                  <span style={{ background: badge.bg, color: badge.cor, borderRadius: 6, padding: '3px 9px', fontSize: 11, fontWeight: 700, display: 'flex', alignItems: 'center', gap: 4, flexShrink: 0, marginLeft: 8 }}>
                    {badge.icon} {badge.label}
                  </span>
                </div>
                {s.dados?.telefone && (
                  <div style={{ fontSize: 11, color: '#374151', marginTop: 6 }}>📞 {s.dados.telefone}</div>
                )}
                {s.observacoes_admin && (
                  <div style={{ marginTop: 8, background: '#f9fafb', borderRadius: 6, padding: '8px 10px', fontSize: 12, color: '#374151', fontStyle: 'italic' }}>
                    💬 Admin: {s.observacoes_admin}
                  </div>
                )}
                <div style={{ fontSize: 10, color: '#9ca3af', marginTop: 6 }}>
                  Enviado em {new Date(s.criado_em).toLocaleString('pt-BR')}
                </div>
              </div>
            )
          })}
        </div>
      )}
    </PortalLayout>
  )
}
