import React, { useEffect, useState, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '@/lib/supabase'
import { getPortalSession } from '@/hooks/usePortalAuth'
import PortalLayout from './PortalLayout'
import { UserPlus, CheckCircle2, Loader2, Clock, Check, X, ChevronDown, ChevronUp } from 'lucide-react'

interface SolicRow { id: string; dados: any; status: string; criado_em: string; observacoes_admin?: string }
interface FuncaoRow { id: string; nome: string }

function Secao({ titulo, children, defaultOpen = true }: { titulo: string; children: React.ReactNode; defaultOpen?: boolean }) {
  const [open, setOpen] = useState(defaultOpen)
  return (
    <div style={{ border: '1px solid #e5e7eb', borderRadius: 10, overflow: 'hidden', marginBottom: 2 }}>
      <button type="button" onClick={() => setOpen(o => !o)}
        style={{ width: '100%', padding: '11px 14px', background: '#f9fafb', border: 'none', cursor: 'pointer',
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          fontWeight: 700, fontSize: 13, color: '#1e3a5f' }}>
        {titulo}
        {open ? <ChevronUp size={15} /> : <ChevronDown size={15} />}
      </button>
      {open && <div style={{ padding: '14px', display: 'flex', flexDirection: 'column', gap: 10 }}>{children}</div>}
    </div>
  )
}

function F({ label, required, half, children }: { label: string; required?: boolean; half?: boolean; children: React.ReactNode }) {
  return (
    <div style={{ flex: half ? '0 0 calc(50% - 5px)' : '1 1 100%' }}>
      <label style={{ fontSize: 11, fontWeight: 700, color: '#374151', display: 'block', marginBottom: 4,
        textTransform: 'uppercase', letterSpacing: '0.04em' }}>
        {label}{required && <span style={{ color: '#dc2626' }}> *</span>}
      </label>
      {children}
    </div>
  )
}

const I: React.CSSProperties = {
  width: '100%', height: 40, border: '1px solid #d1d5db', borderRadius: 7,
  padding: '0 10px', fontSize: 13, boxSizing: 'border-box', background: '#fff', color: '#111',
}
const S: React.CSSProperties = { ...I, cursor: 'pointer' }

export default function PortalSolicitacoes() {
  const nav     = useNavigate()
  const session = getPortalSession()
  const obras   = session?.obras_ids ?? []

  const [obraId,    setObraId]    = useState(obras[0] ?? '')
  const [obrasData, setObrasData] = useState<{ id: string; nome: string }[]>([])
  const [funcoes,   setFuncoes]   = useState<FuncaoRow[]>([])
  const [historico, setHistorico] = useState<SolicRow[]>([])
  const [aba,       setAba]       = useState<'nova' | 'historico'>('nova')
  const [saving,    setSaving]    = useState(false)
  const [sucesso,   setSucesso]   = useState(false)

  // ── Dados Pessoais ──────────────────────────────────────────────────────────
  const [nome,        setNome]        = useState('')
  const [cpf,         setCpf]         = useState('')
  const [rg,          setRg]          = useState('')
  const [pisNit,      setPisNit]      = useState('')
  const [dataNasc,    setDataNasc]    = useState('')
  const [genero,      setGenero]      = useState('')
  const [estadoCivil, setEstadoCivil] = useState('')
  const [telefone,    setTelefone]    = useState('')
  const [email,       setEmail]       = useState('')
  const [ctpsNum,     setCtpsNum]     = useState('')
  const [ctpsSerie,   setCtpsSerie]   = useState('')

  // ── Endereço ────────────────────────────────────────────────────────────────
  const [cep,      setCep]      = useState('')
  const [endereco, setEndereco] = useState('')
  const [cidade,   setCidade]   = useState('')
  const [uf,       setUf]       = useState('')

  // ── Contrato ────────────────────────────────────────────────────────────────
  const [funcaoId,  setFuncaoId]  = useState('')
  const [tipoContr, setTipoContr] = useState('clt')
  const [admissao,  setAdmissao]  = useState(new Date().toISOString().slice(0, 10))

  // ── Bancário ────────────────────────────────────────────────────────────────
  const [banco,     setBanco]     = useState('')
  const [agencia,   setAgencia]   = useState('')
  const [conta,     setConta]     = useState('')
  const [tipoConta, setTipoConta] = useState('corrente')
  const [pixTipo,   setPixTipo]   = useState('')
  const [pixChave,  setPixChave]  = useState('')

  // ── Vale Transporte ─────────────────────────────────────────────────────────
  const [vtMod,        setVtMod]        = useState('nenhum')
  const [vtGasolina,   setVtGasolina]   = useState('')
  const [vtCartaoTipo, setVtCartaoTipo] = useState('')
  const [vtCartaoNum,  setVtCartaoNum]  = useState('')
  const [vtTrechoIda,  setVtTrechoIda]  = useState('')
  const [vtTrechoVolta,setVtTrechoVolta]= useState('')

  // ── Observações ─────────────────────────────────────────────────────────────
  const [obs, setObs] = useState('')

  // ── fetch ────────────────────────────────────────────────────────────────────
  const fetchObras = useCallback(async () => {
    if (!obras.length) return
    const { data } = await supabase.from('obras').select('id,nome').in('id', obras).order('nome')
    if (data) setObrasData(data)
  }, [obras.join(',')])

  const fetchFuncoes = useCallback(async () => {
    const { data } = await supabase.from('funcoes').select('id,nome').eq('ativo', true).order('nome')
    if (data) setFuncoes(data)
  }, [])

  const fetchHistorico = useCallback(async () => {
    if (!obraId) return
    const { data } = await supabase
      .from('portal_solicitacoes')
      .select('id,dados,status,criado_em,observacoes_admin')
      .eq('obra_id', obraId).eq('tipo', 'novo_colaborador')
      .order('criado_em', { ascending: false })
    if (data) setHistorico(data)
  }, [obraId])

  useEffect(() => { if (!session) { nav('/portal'); return } fetchObras(); fetchFuncoes() }, [])
  useEffect(() => { fetchHistorico() }, [fetchHistorico])

  function reset() {
    setNome(''); setCpf(''); setRg(''); setPisNit(''); setDataNasc('')
    setGenero(''); setEstadoCivil(''); setTelefone(''); setEmail('')
    setCtpsNum(''); setCtpsSerie('')
    setCep(''); setEndereco(''); setCidade(''); setUf('')
    setFuncaoId(''); setTipoContr('clt')
    setAdmissao(new Date().toISOString().slice(0, 10))
    setBanco(''); setAgencia(''); setConta('')
    setTipoConta('corrente'); setPixTipo(''); setPixChave('')
    setVtMod('nenhum'); setVtGasolina(''); setVtCartaoTipo('')
    setVtCartaoNum(''); setVtTrechoIda(''); setVtTrechoVolta('')
    setObs('')
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!nome.trim()) return
    setSaving(true)
    const dados = {
      nome, cpf, rg, pis_nit: pisNit,
      data_nascimento: dataNasc, genero, estado_civil: estadoCivil,
      telefone, email,
      ctps_numero: ctpsNum, ctps_serie: ctpsSerie,
      cep, endereco, cidade, estado: uf,
      funcao_id: funcaoId, tipo_contrato: tipoContr, data_admissao: admissao,
      banco, agencia, conta, tipo_conta: tipoConta,
      pix_tipo: pixTipo, pix_chave: pixChave,
      vt_modalidade: vtMod,
      vt_gasolina_valor_dia: vtGasolina,
      vt_cartao_tipo: vtCartaoTipo, vt_cartao_numero: vtCartaoNum,
      vt_trecho_ida: vtTrechoIda, vt_trecho_volta: vtTrechoVolta,
      observacoes: obs,
    }
    const { error } = await supabase.from('portal_solicitacoes').insert({
      obra_id: obraId, tipo: 'novo_colaborador', dados,
      portal_usuario_id: session?.id,
    })
    setSaving(false)
    if (!error) {
      setSucesso(true); reset(); fetchHistorico()
      setTimeout(() => { setSucesso(false); setAba('historico') }, 1800)
    }
  }

  const badge = (s: string) => {
    if (s === 'aprovado') return { bg: '#dcfce7', cor: '#15803d', icon: <Check size={11} />, label: 'Aprovado' }
    if (s === 'recusado') return { bg: '#fee2e2', cor: '#dc2626', icon: <X size={11} />,     label: 'Recusado' }
    return                       { bg: '#fef3c7', cor: '#b45309', icon: <Clock size={11} />, label: 'Pendente' }
  }

  return (
    <PortalLayout>
      <div style={{ padding: '16px 16px 8px' }}>
        <div style={{ fontWeight: 800, fontSize: 17, color: '#1e3a5f' }}>👷 Solicitar Cadastro</div>
        <div style={{ fontSize: 12, color: '#9ca3af', marginTop: 2 }}>Preencha os dados para o RH cadastrar o colaborador</div>
      </div>

      {obrasData.length > 1 && (
        <div style={{ padding: '0 16px 10px' }}>
          <select value={obraId} onChange={e => setObraId(e.target.value)} style={S}>
            {obrasData.map(o => <option key={o.id} value={o.id}>{o.nome}</option>)}
          </select>
        </div>
      )}

      {/* Abas */}
      <div style={{ display: 'flex', margin: '0 16px 12px', background: '#f3f4f6', borderRadius: 10, padding: 4 }}>
        {(['nova', 'historico'] as const).map(a => (
          <button key={a} onClick={() => setAba(a)} style={{
            flex: 1, height: 34, border: 'none', borderRadius: 7, cursor: 'pointer',
            fontWeight: 700, fontSize: 13,
            background: aba === a ? '#fff' : 'transparent',
            color: aba === a ? '#1e3a5f' : '#9ca3af',
            boxShadow: aba === a ? '0 1px 4px rgba(0,0,0,0.1)' : 'none',
          }}>
            {a === 'nova' ? '+ Nova Solicitação' : `Histórico (${historico.length})`}
          </button>
        ))}
      </div>

      {/* ── FORMULÁRIO ── */}
      {aba === 'nova' && (
        <form onSubmit={handleSubmit} style={{ padding: '0 16px 32px', display: 'flex', flexDirection: 'column', gap: 8 }}>

          {sucesso && (
            <div style={{ background: '#dcfce7', border: '1px solid #86efac', borderRadius: 10,
              padding: '12px 16px', display: 'flex', alignItems: 'center', gap: 8, color: '#15803d', fontWeight: 700 }}>
              <CheckCircle2 size={17} /> Solicitação enviada! O RH receberá para cadastro.
            </div>
          )}

          {/* DADOS PESSOAIS */}
          <Secao titulo="👤 Dados Pessoais">
            <F label="Nome Completo" required>
              <input value={nome} onChange={e => setNome(e.target.value)} required placeholder="Nome completo" style={I} />
            </F>
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
              <F label="CPF" half>
                <input value={cpf} onChange={e => setCpf(e.target.value)} placeholder="000.000.000-00" inputMode="numeric" style={I} />
              </F>
              <F label="RG" half>
                <input value={rg} onChange={e => setRg(e.target.value)} placeholder="MG-00.000.000" style={I} />
              </F>
            </div>
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
              <F label="PIS / NIT" half>
                <input value={pisNit} onChange={e => setPisNit(e.target.value)} placeholder="000.00000.00-0" inputMode="numeric" style={I} />
              </F>
              <F label="Data de Nascimento" half>
                <input type="date" value={dataNasc} onChange={e => setDataNasc(e.target.value)} style={I} />
              </F>
            </div>
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
              <F label="Sexo" half>
                <select value={genero} onChange={e => setGenero(e.target.value)} style={S}>
                  <option value="">—</option>
                  <option value="M">Masculino</option>
                  <option value="F">Feminino</option>
                </select>
              </F>
              <F label="Estado Civil" half>
                <select value={estadoCivil} onChange={e => setEstadoCivil(e.target.value)} style={S}>
                  <option value="">—</option>
                  <option value="solteiro">Solteiro(a)</option>
                  <option value="casado">Casado(a)</option>
                  <option value="divorciado">Divorciado(a)</option>
                  <option value="viuvo">Viúvo(a)</option>
                  <option value="uniao_estavel">União estável</option>
                </select>
              </F>
            </div>
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
              <F label="Telefone" half>
                <input value={telefone} onChange={e => setTelefone(e.target.value)} placeholder="(00) 00000-0000" inputMode="tel" style={I} />
              </F>
              <F label="E-mail" half>
                <input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="email@exemplo.com" style={I} />
              </F>
            </div>
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
              <F label="Nº CTPS" half>
                <input value={ctpsNum} onChange={e => setCtpsNum(e.target.value)} placeholder="0000000" inputMode="numeric" style={I} />
              </F>
              <F label="Série CTPS" half>
                <input value={ctpsSerie} onChange={e => setCtpsSerie(e.target.value)} placeholder="0000" inputMode="numeric" style={I} />
              </F>
            </div>
          </Secao>

          {/* ENDEREÇO */}
          <Secao titulo="📍 Endereço" defaultOpen={false}>
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
              <F label="CEP" half>
                <input value={cep} onChange={e => setCep(e.target.value)} placeholder="00000-000" inputMode="numeric" style={I} />
              </F>
              <F label="UF" half>
                <input value={uf} onChange={e => setUf(e.target.value.toUpperCase().slice(0, 2))} placeholder="MG" maxLength={2} style={I} />
              </F>
            </div>
            <F label="Endereço">
              <input value={endereco} onChange={e => setEndereco(e.target.value)} placeholder="Rua, número, bairro" style={I} />
            </F>
            <F label="Cidade">
              <input value={cidade} onChange={e => setCidade(e.target.value)} placeholder="Belo Horizonte" style={I} />
            </F>
          </Secao>

          {/* CONTRATO */}
          <Secao titulo="📋 Contrato">
            <F label="Função" required>
              <select value={funcaoId} onChange={e => setFuncaoId(e.target.value)} style={S}>
                <option value="">Selecione…</option>
                {funcoes.map(f => <option key={f.id} value={f.id}>{f.nome}</option>)}
              </select>
            </F>
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
              <F label="Tipo de Contrato" half>
                <select value={tipoContr} onChange={e => setTipoContr(e.target.value)} style={S}>
                  <option value="clt">CLT</option>
                  <option value="autonomo">Autônomo / PJ</option>
                  <option value="estagio">Estágio</option>
                </select>
              </F>
              <F label="Data de Admissão" half>
                <input type="date" value={admissao} onChange={e => setAdmissao(e.target.value)} style={I} />
              </F>
            </div>
          </Secao>

          {/* BANCÁRIO */}
          <Secao titulo="🏦 Dados Bancários" defaultOpen={false}>
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
              <F label="Banco" half>
                <input value={banco} onChange={e => setBanco(e.target.value)} placeholder="Ex.: Nubank, BB…" style={I} />
              </F>
              <F label="Tipo de Conta" half>
                <select value={tipoConta} onChange={e => setTipoConta(e.target.value)} style={S}>
                  <option value="corrente">Corrente</option>
                  <option value="poupanca">Poupança</option>
                  <option value="salario">Conta Salário</option>
                </select>
              </F>
            </div>
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
              <F label="Agência" half>
                <input value={agencia} onChange={e => setAgencia(e.target.value)} placeholder="0000-0" style={I} />
              </F>
              <F label="Conta" half>
                <input value={conta} onChange={e => setConta(e.target.value)} placeholder="00000-0" style={I} />
              </F>
            </div>
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
              <F label="Tipo de PIX" half>
                <select value={pixTipo} onChange={e => setPixTipo(e.target.value)} style={S}>
                  <option value="">Nenhum</option>
                  <option value="cpf">CPF</option>
                  <option value="telefone">Telefone</option>
                  <option value="email">E-mail</option>
                  <option value="chave_aleatoria">Chave Aleatória</option>
                </select>
              </F>
              <F label="Chave PIX" half>
                <input value={pixChave} onChange={e => setPixChave(e.target.value)} placeholder="Chave PIX" style={I} />
              </F>
            </div>
          </Secao>

          {/* VALE TRANSPORTE */}
          <Secao titulo="🚌 Vale Transporte" defaultOpen={false}>
            <F label="Modalidade">
              <select value={vtMod} onChange={e => { setVtMod(e.target.value); setVtGasolina(''); setVtCartaoTipo(''); setVtCartaoNum(''); setVtTrechoIda(''); setVtTrechoVolta('') }} style={S}>
                <option value="nenhum">Não recebe VT</option>
                <option value="gasolina">Aux. Gasolina</option>
                <option value="transporte">Transporte Público</option>
              </select>
            </F>
            {vtMod === 'gasolina' && (
              <F label="Valor diário (R$)">
                <input type="number" value={vtGasolina} onChange={e => setVtGasolina(e.target.value)} step="0.01" min="0" placeholder="0,00" style={I} />
              </F>
            )}
            {vtMod === 'transporte' && (<>
              <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                <F label="Empresa do Cartão" half>
                  <input value={vtCartaoTipo} onChange={e => setVtCartaoTipo(e.target.value)} placeholder="Ex.: Ótimo, BHBus" style={I} />
                </F>
                <F label="Nº do Cartão" half>
                  <input value={vtCartaoNum} onChange={e => setVtCartaoNum(e.target.value)} placeholder="0000000000" style={I} />
                </F>
              </div>
              <F label="Trechos de Ida">
                <input value={vtTrechoIda} onChange={e => setVtTrechoIda(e.target.value)} placeholder="Ex.: Terminal → Obra (R$ 4,50)" style={I} />
              </F>
              <F label="Trechos de Volta">
                <input value={vtTrechoVolta} onChange={e => setVtTrechoVolta(e.target.value)} placeholder="Ex.: Obra → Terminal (R$ 4,50)" style={I} />
              </F>
            </>)}
          </Secao>

          {/* OBSERVAÇÕES */}
          <F label="Observações">
            <textarea value={obs} onChange={e => setObs(e.target.value)} rows={3}
              placeholder="Informações adicionais para o RH…"
              style={{ width: '100%', border: '1px solid #d1d5db', borderRadius: 7, padding: '9px 10px', fontSize: 13, boxSizing: 'border-box', background: '#fff', resize: 'vertical' }} />
          </F>

          <button type="submit" disabled={saving || !nome.trim()} style={{
            marginTop: 4, height: 50, background: saving ? '#94a3b8' : '#1e3a5f', color: '#fff',
            border: 'none', borderRadius: 12, fontSize: 15, fontWeight: 700,
            cursor: saving ? 'not-allowed' : 'pointer',
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
          }}>
            {saving ? <><Loader2 size={17} className="animate-spin" /> Enviando…</> : <><UserPlus size={17} /> Enviar para o RH</>}
          </button>
        </form>
      )}

      {/* ── HISTÓRICO ── */}
      {aba === 'historico' && (
        <div style={{ padding: '0 16px 24px', display: 'flex', flexDirection: 'column', gap: 8 }}>
          {historico.length === 0 ? (
            <div style={{ background: '#fff', borderRadius: 12, padding: 32, textAlign: 'center', color: '#9ca3af' }}>
              Nenhuma solicitação enviada ainda
            </div>
          ) : historico.map(s => {
            const b = badge(s.status)
            const d = s.dados ?? {}
            const fn = funcoes.find(f => f.id === d.funcao_id)
            return (
              <div key={s.id} style={{ background: '#fff', border: `1px solid ${b.bg}`, borderLeft: `4px solid ${b.cor}`, borderRadius: 10, padding: '12px 14px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div style={{ fontWeight: 700, fontSize: 14, color: '#111' }}>👷 {d.nome ?? '—'}</div>
                  <span style={{ background: b.bg, color: b.cor, borderRadius: 5, padding: '2px 8px', fontSize: 11, fontWeight: 700, display: 'flex', alignItems: 'center', gap: 3 }}>
                    {b.icon} {b.label}
                  </span>
                </div>
                <div style={{ fontSize: 11, color: '#6b7280', marginTop: 4, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  {d.cpf && <span>{d.cpf}</span>}
                  {fn && <span style={{ background: '#eff6ff', color: '#1d4ed8', borderRadius: 4, padding: '0 5px' }}>{fn.nome}</span>}
                  {d.tipo_contrato && <span style={{ textTransform: 'uppercase', fontWeight: 600 }}>{d.tipo_contrato}</span>}
                  {d.data_admissao && <span>📅 {new Date(d.data_admissao + 'T12:00:00').toLocaleDateString('pt-BR')}</span>}
                </div>
                {s.observacoes_admin && (
                  <div style={{ marginTop: 6, background: '#fef9c3', borderRadius: 5, padding: '6px 9px', fontSize: 11, color: '#713f12' }}>
                    💬 {s.observacoes_admin}
                  </div>
                )}
                <div style={{ fontSize: 10, color: '#9ca3af', marginTop: 5 }}>
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
