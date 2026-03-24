import React, { useEffect, useState, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '@/lib/supabase'
import { getPortalSession } from '@/hooks/usePortalAuth'
import PortalLayout from './PortalLayout'
import { UserPlus, CheckCircle2, Loader2, Clock, Check, X } from 'lucide-react'

interface SolicRow { id: string; dados: any; status: string; criado_em: string; observacoes_admin?: string }
interface FuncaoRow { id: string; nome: string }

export default function PortalSolicitacoes() {
  const nav = useNavigate()
  const session = getPortalSession()
  const obras = session?.obras_ids ?? []

  const [obraId, setObraId]   = useState(obras[0] ?? '')
  const [obrasData, setObrasData] = useState<{id:string;nome:string}[]>([])
  const [funcoes, setFuncoes] = useState<FuncaoRow[]>([])
  const [historico, setHistorico] = useState<SolicRow[]>([])
  const [aba, setAba]         = useState<'nova' | 'historico'>('nova')
  const [saving, setSaving]   = useState(false)
  const [sucesso, setSucesso] = useState(false)

  // Formulário
  const [nome, setNome]           = useState('')
  const [cpf, setCpf]             = useState('')
  const [funcaoId, setFuncaoId]   = useState('')
  const [tipoContr, setTipoContr] = useState('clt')
  const [admissao, setAdmissao]   = useState(new Date().toISOString().slice(0, 10))
  const [telefone, setTelefone]   = useState('')
  const [obs, setObs]             = useState('')

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

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!nome.trim()) return
    setSaving(true)
    const dados = { nome, cpf, funcao_id: funcaoId, tipo_contrato: tipoContr, data_admissao: admissao, telefone, observacoes: obs }
    const { error } = await supabase.from('portal_solicitacoes').insert({
      obra_id: obraId, tipo: 'novo_colaborador', dados, portal_usuario_id: session?.id,
    })
    setSaving(false)
    if (!error) {
      setSucesso(true); setNome(''); setCpf(''); setTelefone(''); setObs('')
      fetchHistorico()
      setTimeout(() => { setSucesso(false); setAba('historico') }, 1800)
    }
  }

  const statusBadge = (s: string) => {
    if (s === 'aprovado')  return { bg: '#dcfce7', cor: '#15803d', label: '✓ Aprovado',  icon: <Check size={12} /> }
    if (s === 'recusado')  return { bg: '#fee2e2', cor: '#dc2626', label: '✗ Recusado',  icon: <X size={12} /> }
    return                        { bg: '#fef3c7', cor: '#b45309', label: '⏳ Pendente', icon: <Clock size={12} /> }
  }

  return (
    <PortalLayout>
      <div style={{ padding: '16px 16px 8px' }}>
        <div style={{ fontWeight: 800, fontSize: 18, color: '#1e3a5f' }}>👷 Solicitar Colaborador</div>
        <div style={{ fontSize: 12, color: '#9ca3af' }}>Solicite o cadastro de um novo funcionário</div>
      </div>

      {obrasData.length > 1 && (
        <div style={{ padding: '0 16px 10px' }}>
          <select value={obraId} onChange={e => setObraId(e.target.value)}
            style={{ width: '100%', height: 40, border: '1px solid #e5e7eb', borderRadius: 8, padding: '0 12px', fontSize: 13, background: '#fff' }}>
            {obrasData.map(o => <option key={o.id} value={o.id}>{o.nome}</option>)}
          </select>
        </div>
      )}

      <div style={{ display: 'flex', margin: '0 16px 12px', background: '#f3f4f6', borderRadius: 10, padding: 4 }}>
        {(['nova', 'historico'] as const).map(a => (
          <button key={a} onClick={() => setAba(a)}
            style={{
              flex: 1, height: 36, border: 'none', borderRadius: 8, cursor: 'pointer', fontWeight: 700, fontSize: 13,
              background: aba === a ? '#fff' : 'transparent', color: aba === a ? '#1e3a5f' : '#9ca3af',
              boxShadow: aba === a ? '0 1px 4px rgba(0,0,0,0.1)' : 'none',
            }}>
            {a === 'nova' ? '+ Nova Solicitação' : `Minhas Solicitações (${historico.length})`}
          </button>
        ))}
      </div>

      {aba === 'nova' && (
        <form onSubmit={handleSubmit} style={{ padding: '0 16px 24px', display: 'flex', flexDirection: 'column', gap: 14 }}>
          {sucesso && (
            <div style={{ background: '#dcfce7', border: '1px solid #86efac', borderRadius: 10, padding: '12px 16px', display: 'flex', alignItems: 'center', gap: 8, color: '#15803d', fontWeight: 700 }}>
              <CheckCircle2 size={18} /> Solicitação enviada! Aguarde aprovação do administrador.
            </div>
          )}

          <div>
            <label style={{ fontSize: 12, fontWeight: 700, color: '#374151', display: 'block', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Nome Completo *</label>
            <input value={nome} onChange={e => setNome(e.target.value)} required placeholder="Nome do colaborador"
              style={{ width: '100%', height: 44, border: '1px solid #e5e7eb', borderRadius: 8, padding: '0 12px', fontSize: 14, boxSizing: 'border-box', background: '#fff' }} />
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <div>
              <label style={{ fontSize: 12, fontWeight: 700, color: '#374151', display: 'block', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.05em' }}>CPF</label>
              <input value={cpf} onChange={e => setCpf(e.target.value)} placeholder="000.000.000-00"
                style={{ width: '100%', height: 42, border: '1px solid #e5e7eb', borderRadius: 8, padding: '0 10px', fontSize: 13, boxSizing: 'border-box', background: '#fff' }} />
            </div>
            <div>
              <label style={{ fontSize: 12, fontWeight: 700, color: '#374151', display: 'block', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Telefone</label>
              <input value={telefone} onChange={e => setTelefone(e.target.value)} placeholder="(xx) xxxxx-xxxx"
                style={{ width: '100%', height: 42, border: '1px solid #e5e7eb', borderRadius: 8, padding: '0 10px', fontSize: 13, boxSizing: 'border-box', background: '#fff' }} />
            </div>
          </div>

          <div>
            <label style={{ fontSize: 12, fontWeight: 700, color: '#374151', display: 'block', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Função</label>
            <select value={funcaoId} onChange={e => setFuncaoId(e.target.value)}
              style={{ width: '100%', height: 44, border: '1px solid #e5e7eb', borderRadius: 8, padding: '0 12px', fontSize: 13, background: '#fff', boxSizing: 'border-box' }}>
              <option value="">Selecione a função…</option>
              {funcoes.map(f => <option key={f.id} value={f.id}>{f.nome}</option>)}
            </select>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <div>
              <label style={{ fontSize: 12, fontWeight: 700, color: '#374151', display: 'block', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Tipo Contrato</label>
              <select value={tipoContr} onChange={e => setTipoContr(e.target.value)}
                style={{ width: '100%', height: 42, border: '1px solid #e5e7eb', borderRadius: 8, padding: '0 8px', fontSize: 13, background: '#fff', boxSizing: 'border-box' }}>
                <option value="clt">CLT</option>
                <option value="autonomo">Autônomo</option>
                <option value="estagio">Estágio</option>
              </select>
            </div>
            <div>
              <label style={{ fontSize: 12, fontWeight: 700, color: '#374151', display: 'block', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Data Admissão</label>
              <input type="date" value={admissao} onChange={e => setAdmissao(e.target.value)}
                style={{ width: '100%', height: 42, border: '1px solid #e5e7eb', borderRadius: 8, padding: '0 10px', fontSize: 13, boxSizing: 'border-box', background: '#fff' }} />
            </div>
          </div>

          <div>
            <label style={{ fontSize: 12, fontWeight: 700, color: '#374151', display: 'block', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Observações</label>
            <textarea value={obs} onChange={e => setObs(e.target.value)} rows={3}
              placeholder="Informações adicionais sobre o colaborador…"
              style={{ width: '100%', border: '1px solid #e5e7eb', borderRadius: 8, padding: '10px 12px', fontSize: 13, boxSizing: 'border-box', background: '#fff', resize: 'vertical' }} />
          </div>

          <button type="submit" disabled={saving || !nome.trim()}
            style={{
              height: 50, background: saving ? '#94a3b8' : '#15803d', color: '#fff',
              border: 'none', borderRadius: 12, fontSize: 16, fontWeight: 700,
              cursor: saving ? 'not-allowed' : 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
            }}>
            {saving ? <><Loader2 size={18} className="animate-spin" /> Enviando…</> : <><UserPlus size={18} /> Enviar Solicitação</>}
          </button>
        </form>
      )}

      {aba === 'historico' && (
        <div style={{ padding: '0 16px 24px' }}>
          {historico.length === 0 ? (
            <div style={{ background: '#fff', borderRadius: 12, padding: 32, textAlign: 'center', color: '#9ca3af' }}>
              Nenhuma solicitação enviada ainda
            </div>
          ) : historico.map(s => {
            const badge = statusBadge(s.status)
            return (
              <div key={s.id} style={{ background: '#fff', borderRadius: 12, border: `2px solid ${badge.bg}`, marginBottom: 8, padding: '12px 14px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                  <div>
                    <div style={{ fontWeight: 700, fontSize: 14, color: '#111' }}>👷 {s.dados?.nome ?? '—'}</div>
                    <div style={{ fontSize: 11, color: '#9ca3af', marginTop: 2 }}>
                      {s.dados?.cpf && <span style={{ marginRight: 8 }}>{s.dados.cpf}</span>}
                      {funcoes.find(f => f.id === s.dados?.funcao_id)?.nome}
                    </div>
                  </div>
                  <span style={{ background: badge.bg, color: badge.cor, borderRadius: 6, padding: '3px 8px', fontSize: 11, fontWeight: 700, display: 'flex', alignItems: 'center', gap: 4 }}>
                    {badge.icon} {badge.label}
                  </span>
                </div>
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
