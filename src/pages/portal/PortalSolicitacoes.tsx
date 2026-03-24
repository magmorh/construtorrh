import React, { useEffect, useState, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '@/lib/supabase'
import { getPortalSession } from '@/hooks/usePortalAuth'
import PortalLayout from './PortalLayout'
import { UserPlus, CheckCircle2, Loader2, Clock, Check, X, ChevronDown, ChevronUp, Trash2, Plus } from 'lucide-react'

interface SolicRow { id: string; dados: any; status: string; criado_em: string; observacoes_admin?: string }
interface FuncaoRow { id: string; nome: string }

// ── Tipos VT — idênticos ao sistema ──────────────────────────────────────────
interface VtTrecho {
  id: string
  nome_linha: string
  tipo_veiculo: string
  valor: string
  tem_integracao: boolean
}
type VtModalidade = 'nenhum' | 'gasolina' | 'transporte'

function novoTrecho(): VtTrecho {
  return { id: crypto.randomUUID(), nome_linha: '', tipo_veiculo: 'onibus', valor: '', tem_integracao: false }
}

const VEICULOS = [
  { v: 'onibus',  label: '🚌 Ônibus' },
  { v: 'metro',   label: '🚇 Metrô' },
  { v: 'trem',    label: '🚆 Trem' },
  { v: 'brt',     label: '🚍 BRT' },
  { v: 'outro',   label: '🚐 Outro' },
]

// ── helpers UI ────────────────────────────────────────────────────────────────
function Secao({ titulo, children, defaultOpen = true }: { titulo: string; children: React.ReactNode; defaultOpen?: boolean }) {
  const [open, setOpen] = useState(defaultOpen)
  return (
    <div style={{ border: '1px solid #e5e7eb', borderRadius: 10, overflow: 'hidden', marginBottom: 2 }}>
      <button type="button" onClick={() => setOpen(o => !o)}
        style={{ width: '100%', padding: '12px 14px', background: '#f9fafb', border: 'none', cursor: 'pointer',
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          fontWeight: 700, fontSize: 13, color: '#1e3a5f' }}>
        {titulo}
        {open ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
      </button>
      {open && <div style={{ padding: '14px', display: 'flex', flexDirection: 'column', gap: 12 }}>{children}</div>}
    </div>
  )
}

function Campo({ label, required, children }: { label: string; required?: boolean; children: React.ReactNode }) {
  return (
    <div>
      <label style={{ fontSize: 11, fontWeight: 700, color: '#374151', display: 'block', marginBottom: 5,
        textTransform: 'uppercase', letterSpacing: '0.05em' }}>
        {label}{required && <span style={{ color: '#dc2626' }}> *</span>}
      </label>
      {children}
    </div>
  )
}

const INP: React.CSSProperties = {
  width: '100%', height: 42, border: '1px solid #e5e7eb', borderRadius: 8,
  padding: '0 11px', fontSize: 13, boxSizing: 'border-box', background: '#fff',
}
const SEL: React.CSSProperties = { ...INP, cursor: 'pointer' }

// ── Linha de trecho VT ────────────────────────────────────────────────────────
function TrechoRow({ trecho, onChange, onRemove }: {
  trecho: VtTrecho; onChange: (t: VtTrecho) => void; onRemove: () => void
}) {
  return (
    <div style={{ background: '#f9fafb', border: '1px solid #e5e7eb', borderRadius: 8, padding: '10px 12px', display: 'flex', flexDirection: 'column', gap: 8 }}>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
        <Campo label="Linha / Nome">
          <input value={trecho.nome_linha} onChange={e => onChange({ ...trecho, nome_linha: e.target.value })}
            placeholder="Ex.: Linha 1 Verde…" style={INP} />
        </Campo>
        <Campo label="Veículo">
          <select value={trecho.tipo_veiculo} onChange={e => onChange({ ...trecho, tipo_veiculo: e.target.value })} style={SEL}>
            {VEICULOS.map(v => <option key={v.v} value={v.v}>{v.label}</option>)}
          </select>
        </Campo>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr auto', gap: 8, alignItems: 'flex-end' }}>
        <Campo label="Valor (R$)">
          <input type="number" step="0.01" min="0" value={trecho.valor}
            onChange={e => onChange({ ...trecho, valor: e.target.value })}
            placeholder="0,00" style={INP} />
        </Campo>
        <Campo label="Integração">
          <button type="button" onClick={() => onChange({ ...trecho, tem_integracao: !trecho.tem_integracao })}
            style={{ width: '100%', height: 42, borderRadius: 8, cursor: 'pointer', fontSize: 13, fontWeight: 600,
              border: `1px solid ${trecho.tem_integracao ? '#0891b2' : '#e5e7eb'}`,
              background: trecho.tem_integracao ? 'rgba(8,145,178,0.1)' : '#fff',
              color: trecho.tem_integracao ? '#0891b2' : '#9ca3af' }}>
            {trecho.tem_integracao ? '🔗 Com integração' : '— Sem integração'}
          </button>
        </Campo>
        <button type="button" onClick={onRemove}
          style={{ width: 42, height: 42, borderRadius: 8, border: '1px solid #fca5a5', background: '#fff5f5',
            cursor: 'pointer', color: '#dc2626', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <Trash2 size={15} />
        </button>
      </div>
    </div>
  )
}

function calcTotal(trechos: VtTrecho[]) {
  return trechos.reduce((s, t) => s + (parseFloat(t.valor) || 0), 0)
}

// ─────────────────────────────────────────────────────────────────────────────
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
  const [funcaoId, setFuncaoId]   = useState('')
  const [tipoContr, setTipoContr] = useState('clt')
  const [admissao, setAdmissao]   = useState(new Date().toISOString().slice(0, 10))

  // ── Bancário ────────────────────────────────────────────────────────────────
  const [banco, setBanco]           = useState('')
  const [agencia, setAgencia]       = useState('')
  const [conta, setConta]           = useState('')
  const [tipoConta, setTipoConta]   = useState('corrente')
  const [pixTipo, setPixTipo]       = useState('')
  const [pixChave, setPixChave]     = useState('')

  // ── VT — igual ao sistema ───────────────────────────────────────────────────
  const [vtMod, setVtMod]             = useState<VtModalidade>('nenhum')
  const [vtGasolina, setVtGasolina]   = useState('')
  const [vtCartaoTipo, setVtCartaoTipo] = useState('')
  const [vtCartaoNum, setVtCartaoNum]   = useState('')
  const [vtTrechosIda, setVtTrechosIda]     = useState<VtTrecho[]>([])
  const [vtTrechosVolta, setVtTrechosVolta] = useState<VtTrecho[]>([])

  // ── Observações ─────────────────────────────────────────────────────────────
  const [obs, setObs] = useState('')

  // ── helpers VT ──────────────────────────────────────────────────────────────
  const mudarMod = (m: VtModalidade) => {
    setVtMod(m)
    setVtGasolina(''); setVtCartaoTipo(''); setVtCartaoNum('')
    setVtTrechosIda([]); setVtTrechosVolta([])
  }
  const addTrecho = (dir: 'ida' | 'volta') => {
    if (dir === 'ida') setVtTrechosIda(p => [...p, novoTrecho()])
    else               setVtTrechosVolta(p => [...p, novoTrecho()])
  }
  const updTrecho = (dir: 'ida' | 'volta', idx: number, t: VtTrecho) => {
    if (dir === 'ida') setVtTrechosIda(p => p.map((x, i) => i === idx ? t : x))
    else               setVtTrechosVolta(p => p.map((x, i) => i === idx ? t : x))
  }
  const remTrecho = (dir: 'ida' | 'volta', idx: number) => {
    if (dir === 'ida') setVtTrechosIda(p => p.filter((_, i) => i !== idx))
    else               setVtTrechosVolta(p => p.filter((_, i) => i !== idx))
  }

  // ── fetch ───────────────────────────────────────────────────────────────────
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
    setNome(''); setCpf(''); setRg(''); setPisNit(''); setDataNasc('')
    setGenero(''); setEstadoCivil(''); setTelefone(''); setEmail('')
    setCtpsNumero(''); setCtpsSerie('')
    setCep(''); setEndereco(''); setCidade(''); setEstado('')
    setFuncaoId(''); setTipoContr('clt')
    setAdmissao(new Date().toISOString().slice(0, 10))
    setBanco(''); setAgencia(''); setConta('')
    setTipoConta('corrente'); setPixTipo(''); setPixChave('')
    mudarMod('nenhum'); setObs('')
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!nome.trim()) return
    setSaving(true)

    // Estrutura IDÊNTICA ao FormData do sistema
    const dados = {
      nome, cpf, rg, pis_nit: pisNit,
      data_nascimento: dataNasc, genero, estado_civil: estadoCivil,
      telefone, email,
      ctps_numero: ctpsNumero, ctps_serie: ctpsSerie,
      cep, endereco, cidade, estado,
      funcao_id: funcaoId, tipo_contrato: tipoContr, data_admissao: admissao,
      banco, agencia, conta, tipo_conta: tipoConta,
      pix_tipo: pixTipo, pix_chave: pixChave,
      // VT — igual ao sistema
      vt_modalidade: vtMod,
      vt_gasolina_valor_dia: vtGasolina,
      vt_cartao_tipo: vtCartaoTipo,
      vt_cartao_numero: vtCartaoNum,
      vt_trechos_ida:   vtTrechosIda,
      vt_trechos_volta: vtTrechosVolta,
      observacoes: obs,
    }

    const { error } = await supabase.from('portal_solicitacoes').insert({
      obra_id: obraId, tipo: 'novo_colaborador', dados,
      portal_usuario_id: session?.id,
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

  const totalIda    = calcTotal(vtTrechosIda)
  const totalVolta  = calcTotal(vtTrechosVolta)
  const totalDiario = totalIda + totalVolta

  return (
    <PortalLayout>
      <div style={{ padding: '16px 16px 8px' }}>
        <div style={{ fontWeight: 800, fontSize: 18, color: '#1e3a5f' }}>👷 Solicitar Colaborador</div>
        <div style={{ fontSize: 12, color: '#9ca3af' }}>Preencha os dados do novo funcionário para cadastro</div>
      </div>

      {obrasData.length > 1 && (
        <div style={{ padding: '0 16px 10px' }}>
          <select value={obraId} onChange={e => setObraId(e.target.value)} style={SEL}>
            {obrasData.map(o => <option key={o.id} value={o.id}>{o.nome}</option>)}
          </select>
        </div>
      )}

      {/* Abas */}
      <div style={{ display: 'flex', margin: '0 16px 12px', background: '#f3f4f6', borderRadius: 10, padding: 4 }}>
        {(['nova', 'historico'] as const).map(a => (
          <button key={a} onClick={() => setAba(a)} style={{
            flex: 1, height: 36, border: 'none', borderRadius: 8, cursor: 'pointer', fontWeight: 700, fontSize: 13,
            background: aba === a ? '#fff' : 'transparent',
            color: aba === a ? '#1e3a5f' : '#9ca3af',
            boxShadow: aba === a ? '0 1px 4px rgba(0,0,0,0.1)' : 'none',
          }}>
            {a === 'nova' ? '+ Nova Solicitação' : `Minhas Solicitações (${historico.length})`}
          </button>
        ))}
      </div>

      {/* ── FORMULÁRIO ── */}
      {aba === 'nova' && (
        <form onSubmit={handleSubmit} style={{ padding: '0 16px 32px', display: 'flex', flexDirection: 'column', gap: 10 }}>
          {sucesso && (
            <div style={{ background: '#dcfce7', border: '1px solid #86efac', borderRadius: 10, padding: '12px 16px',
              display: 'flex', alignItems: 'center', gap: 8, color: '#15803d', fontWeight: 700 }}>
              <CheckCircle2 size={18} /> Solicitação enviada! Aguarde aprovação do administrador.
            </div>
          )}

          {/* ── DADOS PESSOAIS ── */}
          <Secao titulo="👤 Dados Pessoais">
            <Campo label="Nome Completo" required>
              <input value={nome} onChange={e => setNome(e.target.value)} required placeholder="Nome completo" style={INP} />
            </Campo>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              <Campo label="CPF">
                <input value={cpf} onChange={e => setCpf(e.target.value)} placeholder="000.000.000-00" style={INP} />
              </Campo>
              <Campo label="RG">
                <input value={rg} onChange={e => setRg(e.target.value)} placeholder="00.000.000-0" style={INP} />
              </Campo>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              <Campo label="PIS/NIT">
                <input value={pisNit} onChange={e => setPisNit(e.target.value)} placeholder="000.00000.00-0" style={INP} />
              </Campo>
              <Campo label="Data de Nascimento">
                <input type="date" value={dataNasc} onChange={e => setDataNasc(e.target.value)} style={INP} />
              </Campo>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              <Campo label="Sexo">
                <select value={genero} onChange={e => setGenero(e.target.value)} style={SEL}>
                  <option value="">Selecione…</option>
                  <option value="M">Masculino</option>
                  <option value="F">Feminino</option>
                </select>
              </Campo>
              <Campo label="Estado Civil">
                <select value={estadoCivil} onChange={e => setEstadoCivil(e.target.value)} style={SEL}>
                  <option value="">Selecione…</option>
                  <option value="solteiro">Solteiro(a)</option>
                  <option value="casado">Casado(a)</option>
                  <option value="divorciado">Divorciado(a)</option>
                  <option value="viuvo">Viúvo(a)</option>
                  <option value="uniao_estavel">União estável</option>
                </select>
              </Campo>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              <Campo label="Telefone">
                <input value={telefone} onChange={e => setTelefone(e.target.value)} placeholder="(00) 00000-0000" style={INP} />
              </Campo>
              <Campo label="E-mail">
                <input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="email@exemplo.com" style={INP} />
              </Campo>
            </div>
          </Secao>

          {/* ── ENDEREÇO ── */}
          <Secao titulo="📍 Endereço" defaultOpen={false}>
            <div style={{ display: 'grid', gridTemplateColumns: '120px 1fr', gap: 10 }}>
              <Campo label="CEP">
                <input value={cep} onChange={e => setCep(e.target.value)} placeholder="00000-000" style={INP} />
              </Campo>
              <Campo label="Endereço">
                <input value={endereco} onChange={e => setEndereco(e.target.value)} placeholder="Rua, número, complemento" style={INP} />
              </Campo>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 80px', gap: 10 }}>
              <Campo label="Cidade">
                <input value={cidade} onChange={e => setCidade(e.target.value)} placeholder="Belo Horizonte" style={INP} />
              </Campo>
              <Campo label="UF">
                <input value={estado} onChange={e => setEstado(e.target.value.toUpperCase().slice(0,2))} placeholder="MG" maxLength={2} style={INP} />
              </Campo>
            </div>
          </Secao>

          {/* ── CONTRATO ── */}
          <Secao titulo="📋 Contrato">
            <Campo label="Função" required>
              <select value={funcaoId} onChange={e => setFuncaoId(e.target.value)} style={SEL}>
                <option value="">Selecione a função…</option>
                {funcoes.map(f => <option key={f.id} value={f.id}>{f.nome}</option>)}
              </select>
            </Campo>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              <Campo label="Tipo de Contrato">
                <select value={tipoContr} onChange={e => setTipoContr(e.target.value)} style={SEL}>
                  <option value="clt">CLT</option>
                  <option value="autonomo">Autônomo / PJ</option>
                  <option value="estagio">Estágio</option>
                </select>
              </Campo>
              <Campo label="Data de Admissão">
                <input type="date" value={admissao} onChange={e => setAdmissao(e.target.value)} style={INP} />
              </Campo>
            </div>

            {/* CTPS dentro de Contrato, igual ao sistema */}
            <div style={{ marginTop: 4, paddingTop: 10, borderTop: '1px dashed #e5e7eb' }}>
              <div style={{ fontSize: 10, fontWeight: 700, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 8 }}>CTPS</div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                <Campo label="Nº CTPS">
                  <input value={ctpsNumero} onChange={e => setCtpsNumero(e.target.value)} placeholder="0000000" inputMode="numeric" style={INP} />
                </Campo>
                <Campo label="Série CTPS">
                  <input value={ctpsSerie} onChange={e => setCtpsSerie(e.target.value)} placeholder="0000" inputMode="numeric" style={INP} />
                </Campo>
              </div>
            </div>
          </Secao>

          {/* ── DADOS BANCÁRIOS ── */}
          <Secao titulo="🏦 Dados Bancários" defaultOpen={false}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              <Campo label="Banco">
                <input value={banco} onChange={e => setBanco(e.target.value)} placeholder="Ex.: Banco do Brasil, Nubank…" style={INP} />
              </Campo>
              <Campo label="Tipo de Conta">
                <select value={tipoConta} onChange={e => setTipoConta(e.target.value)} style={SEL}>
                  <option value="corrente">Corrente</option>
                  <option value="poupanca">Poupança</option>
                  <option value="salario">Conta Salário</option>
                </select>
              </Campo>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              <Campo label="Agência">
                <input value={agencia} onChange={e => setAgencia(e.target.value)} placeholder="0000-0" style={INP} />
              </Campo>
              <Campo label="Conta">
                <input value={conta} onChange={e => setConta(e.target.value)} placeholder="00000000-0" style={INP} />
              </Campo>
            </div>

            {/* Chave PIX — igual ao sistema (botões de tipo) */}
            <div>
              <div style={{ fontSize: 10, fontWeight: 700, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 8 }}>Chave PIX</div>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 8 }}>
                {[
                  { v: 'cpf',            label: '🪪 CPF' },
                  { v: 'telefone',       label: '📱 Celular' },
                  { v: 'email',          label: '✉️ E-mail' },
                  { v: 'chave_aleatoria', label: '🔑 Aleatória' },
                ].map(t => (
                  <button key={t.v} type="button"
                    onClick={() => {
                      let chave = ''
                      if (t.v === 'cpf')      chave = cpf
                      if (t.v === 'telefone') chave = telefone
                      if (t.v === 'email')    chave = email
                      setPixTipo(t.v); setPixChave(chave)
                    }}
                    style={{ padding: '6px 12px', borderRadius: 20, fontSize: 12, fontWeight: 600, cursor: 'pointer',
                      border: `1px solid ${pixTipo === t.v ? '#1d4ed8' : '#e5e7eb'}`,
                      background: pixTipo === t.v ? 'rgba(29,78,216,0.08)' : '#fff',
                      color: pixTipo === t.v ? '#1d4ed8' : '#374151' }}>
                    {t.label}
                  </button>
                ))}
                {pixTipo && (
                  <button type="button" onClick={() => { setPixTipo(''); setPixChave('') }}
                    style={{ padding: '6px 10px', borderRadius: 20, fontSize: 12, cursor: 'pointer',
                      border: '1px solid #fca5a5', background: '#fff5f5', color: '#dc2626' }}>
                    ✕ Limpar
                  </button>
                )}
              </div>
              {pixTipo && (
                <input value={pixChave}
                  onChange={e => setPixChave(e.target.value)}
                  readOnly={pixTipo !== 'chave_aleatoria'}
                  placeholder={pixTipo === 'chave_aleatoria' ? 'Cole a chave aleatória aqui' : 'Preenchido automaticamente'}
                  style={{ ...INP, background: pixTipo !== 'chave_aleatoria' ? '#f3f4f6' : '#fff', fontFamily: 'monospace' }} />
              )}
            </div>
          </Secao>

          {/* ── VALE TRANSPORTE — igual ao sistema ── */}
          <Secao titulo="🚌 Vale Transporte" defaultOpen={false}>
            {/* Seletor de modalidade */}
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {([
                { v: 'nenhum',     label: '🚫 Não recebe',        cor: '#6b7280' },
                { v: 'gasolina',   label: '⛽ Aux. Gasolina',      cor: '#f59e0b' },
                { v: 'transporte', label: '🚌 Transp. Público',    cor: '#3b82f6' },
              ] as { v: VtModalidade; label: string; cor: string }[]).map(opt => (
                <button key={opt.v} type="button" onClick={() => mudarMod(opt.v)}
                  style={{ padding: '8px 14px', borderRadius: 20, fontSize: 13, fontWeight: 700, cursor: 'pointer',
                    border: `2px solid ${vtMod === opt.v ? opt.cor : '#e5e7eb'}`,
                    background: vtMod === opt.v ? `${opt.cor}18` : '#fff',
                    color: vtMod === opt.v ? opt.cor : '#6b7280' }}>
                  {opt.label}
                </button>
              ))}
            </div>

            {/* Gasolina */}
            {vtMod === 'gasolina' && (
              <Campo label="Valor diário (gasolina) R$">
                <input type="number" value={vtGasolina} onChange={e => setVtGasolina(e.target.value)}
                  step="0.01" min="0" placeholder="0,00" style={INP} />
              </Campo>
            )}

            {/* Transporte público — cartão + trechos estruturados */}
            {vtMod === 'transporte' && (
              <>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                  <Campo label="Empresa do Cartão">
                    <input value={vtCartaoTipo} onChange={e => setVtCartaoTipo(e.target.value)}
                      placeholder="Ex.: Ótimo, BHBus…" style={INP} />
                  </Campo>
                  <Campo label="Número do Cartão">
                    <input value={vtCartaoNum} onChange={e => setVtCartaoNum(e.target.value)}
                      placeholder="0000000000" style={INP} />
                  </Campo>
                </div>

                {/* Trechos IDA */}
                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                    <span style={{ fontSize: 12, fontWeight: 700, color: '#374151' }}>
                      ➡️ Trechos de Ida
                      {vtTrechosIda.length > 0 && (
                        <span style={{ marginLeft: 6, color: '#15803d', fontWeight: 400, fontSize: 11 }}>
                          Total: R$ {calcTotal(vtTrechosIda).toFixed(2)}
                        </span>
                      )}
                    </span>
                    <button type="button" onClick={() => addTrecho('ida')}
                      style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '4px 10px', borderRadius: 6,
                        border: '1px solid #16a34a', background: '#f0fdf4', color: '#15803d', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>
                      <Plus size={13} /> Adicionar
                    </button>
                  </div>
                  {vtTrechosIda.length === 0 && (
                    <div style={{ background: '#f9fafb', border: '1px dashed #d1d5db', borderRadius: 8, padding: '10px 14px', textAlign: 'center', fontSize: 12, color: '#9ca3af' }}>
                      Nenhum trecho de ida
                    </div>
                  )}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    {vtTrechosIda.map((t, i) => (
                      <TrechoRow key={t.id} trecho={t}
                        onChange={nt => updTrecho('ida', i, nt)}
                        onRemove={() => remTrecho('ida', i)} />
                    ))}
                  </div>
                </div>

                {/* Trechos VOLTA */}
                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                    <span style={{ fontSize: 12, fontWeight: 700, color: '#374151' }}>
                      ⬅️ Trechos de Volta
                      {vtTrechosVolta.length > 0 && (
                        <span style={{ marginLeft: 6, color: '#15803d', fontWeight: 400, fontSize: 11 }}>
                          Total: R$ {calcTotal(vtTrechosVolta).toFixed(2)}
                        </span>
                      )}
                    </span>
                    <button type="button" onClick={() => addTrecho('volta')}
                      style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '4px 10px', borderRadius: 6,
                        border: '1px solid #16a34a', background: '#f0fdf4', color: '#15803d', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>
                      <Plus size={13} /> Adicionar
                    </button>
                  </div>
                  {vtTrechosVolta.length === 0 && (
                    <div style={{ background: '#f9fafb', border: '1px dashed #d1d5db', borderRadius: 8, padding: '10px 14px', textAlign: 'center', fontSize: 12, color: '#9ca3af' }}>
                      Nenhum trecho de volta
                    </div>
                  )}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    {vtTrechosVolta.map((t, i) => (
                      <TrechoRow key={t.id} trecho={t}
                        onChange={nt => updTrecho('volta', i, nt)}
                        onRemove={() => remTrecho('volta', i)} />
                    ))}
                  </div>
                </div>

                {/* Resumo diário */}
                {totalDiario > 0 && (
                  <div style={{ background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: 8, padding: '10px 14px',
                    display: 'flex', justifyContent: 'space-between', fontSize: 13 }}>
                    <span style={{ color: '#1d4ed8', fontWeight: 600 }}>💰 Total diário</span>
                    <span style={{ fontWeight: 800, color: '#1d4ed8' }}>R$ {totalDiario.toFixed(2)}</span>
                  </div>
                )}
              </>
            )}
          </Secao>

          {/* ── OBSERVAÇÕES ── */}
          <div>
            <label style={{ fontSize: 11, fontWeight: 700, color: '#374151', display: 'block', marginBottom: 5, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Observações</label>
            <textarea value={obs} onChange={e => setObs(e.target.value)} rows={3}
              placeholder="Informações adicionais…"
              style={{ width: '100%', border: '1px solid #e5e7eb', borderRadius: 8, padding: '10px 12px', fontSize: 13, boxSizing: 'border-box', background: '#fff', resize: 'vertical' }} />
          </div>

          <button type="submit" disabled={saving || !nome.trim()} style={{
            height: 52, background: saving ? '#94a3b8' : '#15803d', color: '#fff',
            border: 'none', borderRadius: 12, fontSize: 16, fontWeight: 700,
            cursor: saving ? 'not-allowed' : 'pointer',
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
          }}>
            {saving
              ? <><Loader2 size={18} className="animate-spin" /> Enviando…</>
              : <><UserPlus size={18} /> Enviar Solicitação de Cadastro</>
            }
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
            const d = s.dados ?? {}
            return (
              <div key={s.id} style={{ background: '#fff', borderRadius: 12, border: `2px solid ${badge.bg}`, marginBottom: 10, padding: '14px 16px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 700, fontSize: 14, color: '#111' }}>👷 {d.nome ?? '—'}</div>
                    <div style={{ fontSize: 11, color: '#9ca3af', marginTop: 2, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                      {d.cpf && <span>{d.cpf}</span>}
                      {funcoes.find(f => f.id === d.funcao_id)?.nome && (
                        <span style={{ background: '#eff6ff', color: '#1d4ed8', borderRadius: 4, padding: '0 5px' }}>
                          {funcoes.find(f => f.id === d.funcao_id)?.nome}
                        </span>
                      )}
                      {d.tipo_contrato && <span style={{ textTransform: 'uppercase' }}>{d.tipo_contrato}</span>}
                      {d.data_admissao && <span>📅 {new Date(d.data_admissao + 'T12:00:00').toLocaleDateString('pt-BR')}</span>}
                    </div>
                  </div>
                  <span style={{ background: badge.bg, color: badge.cor, borderRadius: 6, padding: '3px 9px',
                    fontSize: 11, fontWeight: 700, display: 'flex', alignItems: 'center', gap: 4, flexShrink: 0, marginLeft: 8 }}>
                    {badge.icon} {badge.label}
                  </span>
                </div>
                {d.telefone && <div style={{ fontSize: 11, color: '#374151', marginTop: 6 }}>📞 {d.telefone}</div>}
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
