import React, { useEffect, useState, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '@/lib/supabase'
import { getPortalSession } from '@/hooks/usePortalAuth'
import PortalLayout from './PortalLayout'
import { HardHat, Loader2, CheckCircle2, Trash2 } from 'lucide-react'

interface Obra       { id: string; nome: string }
interface Colaborador{ id: string; nome: string; chapa: string }
interface PlaybookItem { id: string; descricao: string; unidade: string }
interface LancRow    { id: string; obra_id: string; data_inicio: string; data_fim: string }
interface ProducaoRow{
  id: string; criado_em: string; quantidade: number; valor_unitario: number | null
  obs: string | null; colaboradores?: { nome: string }; playbook_itens?: { descricao: string; unidade: string }
  sincronizado_em: string | null
}

export default function PortalProducao() {
  const nav     = useNavigate()
  const session = getPortalSession()
  const obrasIds = session?.obras_ids ?? []

  const [obrasData, setObrasData]     = useState<Obra[]>([])
  const [obraId, setObraId]           = useState('')
  const [colaboradores, setColabs]    = useState<Colaborador[]>([])
  const [playbook, setPlaybook]       = useState<PlaybookItem[]>([])
  const [lancamentos, setLancamentos] = useState<LancRow[]>([])
  const [historico, setHistorico]     = useState<ProducaoRow[]>([])
  const [aba, setAba]                 = useState<'nova' | 'historico'>('nova')
  const [saving, setSaving]           = useState(false)
  const [sucesso, setSucesso]         = useState(false)
  const [erroMsg, setErroMsg]         = useState('')
  const [deletandoId, setDeletandoId] = useState<string|null>(null)

  // Formulário
  const [colabId, setColabId]         = useState('')
  const [playbookId, setPlaybookId]   = useState('')
  const [quantidade, setQuantidade]   = useState('')
  const [dataRef, setDataRef]         = useState(new Date().toISOString().slice(0, 10))
  const [obs, setObs]                 = useState('')

  // Carregar dados base
  const loadBase = useCallback(async () => {
    if (!obrasIds.length) return
    const { data: obs2 } = await supabase.from('obras').select('id,nome').in('id', obrasIds).order('nome')
    if (obs2) { setObrasData(obs2); if (!obraId && obs2.length) setObraId(obs2[0].id) }
  }, [obrasIds.join(',')])

  const loadObra = useCallback(async (oid: string) => {
    if (!oid) return
    const [{ data: c }, { data: pb }, { data: lc }] = await Promise.all([
      supabase.from('colaboradores').select('id,nome,chapa').eq('obra_id', oid).eq('status','ativo').order('nome'),
      supabase.from('playbook_itens').select('id,descricao,unidade').eq('obra_id', oid).order('descricao'),
      supabase.from('ponto_lancamentos').select('id,obra_id,data_inicio,data_fim').eq('obra_id', oid).order('data_inicio'),
    ])
    setColabs(c ?? []); setPlaybook(pb ?? []); setLancamentos(lc ?? [])
    setColabId(''); setPlaybookId('')
  }, [])

  const loadHistorico = useCallback(async (oid: string) => {
    if (!oid) return
    const { data } = await supabase
      .from('portal_producao')
      .select('id,criado_em,quantidade,valor_unitario,obs,sincronizado_em,colaboradores(nome),playbook_itens(descricao,unidade)')
      .eq('obra_id', oid)
      .order('criado_em', { ascending: false })
      .limit(60)
    setHistorico((data ?? []) as any[])
  }, [])

  useEffect(() => { if (!session) { nav('/portal'); return } loadBase() }, [])
  useEffect(() => { if (obraId) { loadObra(obraId); loadHistorico(obraId) } }, [obraId])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!colabId || !playbookId || !quantidade) return
    setSaving(true); setErroMsg('')

    // Encontra lançamento que cobre dataRef
    const lanc = lancamentos.find(l => l.data_inicio <= dataRef && dataRef <= l.data_fim)

    const { error } = await supabase.from('portal_producao').insert({
      obra_id: obraId, colaborador_id: colabId,
      playbook_item_id: playbookId,
      quantidade: parseFloat(quantidade),
      data: dataRef, obs: obs || null,
      portal_usuario_id: session?.id,
      lancamento_id: lanc?.id ?? null,
    })
    setSaving(false)
    if (error) {
      setErroMsg('Erro ao salvar: ' + error.message)
      return
    }
    setSucesso(true); setQuantidade(''); setObs(''); setErroMsg('')
    loadHistorico(obraId)
    setTimeout(() => { setSucesso(false); setAba('historico') }, 1600)
  }

  async function excluir(id: string, sync: string | null) {
    if (sync) { alert('Este lançamento já foi aprovado pelo RH e não pode mais ser excluído.'); return }
    if (!confirm('Excluir este lançamento de produção?')) return
    setDeletandoId(id)
    await supabase.from('portal_producao').delete().eq('id', id)
    setDeletandoId(null); loadHistorico(obraId)
  }

  const pbSel = playbook.find(p => p.id === playbookId)

  return (
    <PortalLayout>
      <div style={{ padding: '16px 16px 8px' }}>
        <div style={{ fontWeight: 800, fontSize: 18, color: '#1e3a5f' }}>📐 Lançar Produção</div>
        <div style={{ fontSize: 12, color: '#9ca3af' }}>Registre a produção de um colaborador na obra</div>
      </div>

      {/* Seletor de obra */}
      {obrasData.length > 1 && (
        <div style={{ padding: '0 16px 10px' }}>
          <select value={obraId} onChange={e => setObraId(e.target.value)}
            style={{ width: '100%', height: 40, border: '1px solid #e5e7eb', borderRadius: 8, padding: '0 12px', fontSize: 13, background: '#fff' }}>
            {obrasData.map(o => <option key={o.id} value={o.id}>{o.nome}</option>)}
          </select>
        </div>
      )}
      {obrasData.length === 1 && (
        <div style={{ padding: '0 16px 8px', fontSize: 12, fontWeight: 700, color: '#6b7280' }}>🏗️ {obrasData[0]?.nome}</div>
      )}

      {/* Abas */}
      <div style={{ display: 'flex', margin: '0 16px 12px', background: '#f3f4f6', borderRadius: 10, padding: 4 }}>
        {(['nova', 'historico'] as const).map(a => (
          <button key={a} onClick={() => setAba(a)} style={{
            flex: 1, height: 36, border: 'none', borderRadius: 8, cursor: 'pointer', fontWeight: 700, fontSize: 13,
            background: aba === a ? '#fff' : 'transparent', color: aba === a ? '#1e3a5f' : '#9ca3af',
            boxShadow: aba === a ? '0 1px 4px rgba(0,0,0,0.1)' : 'none',
          }}>
            {a === 'nova' ? '+ Novo Lançamento' : `Histórico (${historico.length})`}
          </button>
        ))}
      </div>

      {/* ── FORMULÁRIO ── */}
      {aba === 'nova' && (
        <form onSubmit={handleSubmit} style={{ padding: '0 16px 32px', display: 'flex', flexDirection: 'column', gap: 14 }}>
          {sucesso && (
            <div style={{ background: '#dcfce7', border: '1px solid #86efac', borderRadius: 10, padding: '12px 16px', display: 'flex', alignItems: 'center', gap: 8, color: '#15803d', fontWeight: 700 }}>
              <CheckCircle2 size={18} /> Produção lançada com sucesso!
            </div>
          )}
          {erroMsg && (
            <div style={{ background: '#fee2e2', border: '1px solid #fca5a5', borderRadius: 10, padding: '12px 16px', color: '#dc2626', fontWeight: 700, fontSize: 13 }}>
              ⚠️ {erroMsg}
            </div>
          )}

          {/* Colaborador */}
          <div>
            <label style={{ fontSize: 12, fontWeight: 700, color: '#374151', display: 'block', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              Colaborador *
            </label>
            <select value={colabId} onChange={e => setColabId(e.target.value)} required
              style={{ width: '100%', height: 44, border: '1px solid #e5e7eb', borderRadius: 8, padding: '0 12px', fontSize: 13, background: '#fff', boxSizing: 'border-box' }}>
              <option value="">Selecione o colaborador…</option>
              {colaboradores.map(c => <option key={c.id} value={c.id}>{c.nome} {c.chapa ? `(${c.chapa})` : ''}</option>)}
            </select>
            {colaboradores.length === 0 && obraId && (
              <div style={{ fontSize: 11, color: '#f97316', marginTop: 4 }}>⚠️ Nenhum colaborador ativo nesta obra</div>
            )}
          </div>

          {/* Serviço (Playbook) */}
          <div>
            <label style={{ fontSize: 12, fontWeight: 700, color: '#374151', display: 'block', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              Serviço / Item de Produção *
            </label>
            <select value={playbookId} onChange={e => setPlaybookId(e.target.value)} required
              style={{ width: '100%', height: 44, border: '1px solid #e5e7eb', borderRadius: 8, padding: '0 12px', fontSize: 13, background: '#fff', boxSizing: 'border-box' }}>
              <option value="">Selecione o serviço…</option>
              {playbook.map(p => <option key={p.id} value={p.id}>{p.descricao} ({p.unidade})</option>)}
            </select>
            {playbook.length === 0 && obraId && (
              <div style={{ fontSize: 11, color: '#9ca3af', marginTop: 4 }}>Nenhum item de produção cadastrado para esta obra</div>
            )}
          </div>

          {/* Quantidade + Unidade */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <div>
              <label style={{ fontSize: 12, fontWeight: 700, color: '#374151', display: 'block', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Quantidade *</label>
              <input type="number" value={quantidade} onChange={e => setQuantidade(e.target.value)} required min="0.01" step="0.01"
                placeholder="0.00"
                style={{ width: '100%', height: 44, border: '1px solid #e5e7eb', borderRadius: 8, padding: '0 12px', fontSize: 15, fontWeight: 700, boxSizing: 'border-box', background: '#fff' }} />
            </div>
            <div>
              <label style={{ fontSize: 12, fontWeight: 700, color: '#374151', display: 'block', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Unidade</label>
              <div style={{ height: 44, border: '1px solid #e5e7eb', borderRadius: 8, padding: '0 12px', fontSize: 14, display: 'flex', alignItems: 'center', background: '#f9fafb', color: '#6b7280', fontWeight: 700 }}>
                {pbSel?.unidade ?? '—'}
              </div>
            </div>
          </div>

          {/* Data de referência */}
          <div>
            <label style={{ fontSize: 12, fontWeight: 700, color: '#374151', display: 'block', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Data de Referência *</label>
            <input type="date" value={dataRef} onChange={e => setDataRef(e.target.value)} required
              style={{ width: '100%', height: 44, border: '1px solid #e5e7eb', borderRadius: 8, padding: '0 12px', fontSize: 13, boxSizing: 'border-box', background: '#fff' }} />
            {(() => {
              const lanc = lancamentos.find(l => l.data_inicio <= dataRef && dataRef <= l.data_fim)
              return lanc ? (
                <div style={{ fontSize: 11, color: '#15803d', marginTop: 4 }}>✓ Lançamento encontrado: {lanc.data_inicio.split('-').reverse().join('/')} → {lanc.data_fim.split('-').reverse().join('/')}</div>
              ) : (
                <div style={{ fontSize: 11, color: '#9ca3af', marginTop: 4 }}>ℹ️ Nenhum lançamento aberto para esta data — será vinculado depois</div>
              )
            })()}
          </div>

          {/* Observação */}
          <div>
            <label style={{ fontSize: 12, fontWeight: 700, color: '#374151', display: 'block', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Observação</label>
            <textarea value={obs} onChange={e => setObs(e.target.value)} rows={2}
              placeholder="Detalhes adicionais…"
              style={{ width: '100%', border: '1px solid #e5e7eb', borderRadius: 8, padding: '10px 12px', fontSize: 13, boxSizing: 'border-box', background: '#fff', resize: 'vertical' }} />
          </div>

          <button type="submit" disabled={saving || !colabId || !playbookId || !quantidade} style={{
            height: 52, background: saving ? '#94a3b8' : '#1e3a5f', color: '#fff',
            border: 'none', borderRadius: 12, fontSize: 16, fontWeight: 700,
            cursor: saving ? 'not-allowed' : 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
          }}>
            {saving ? <><Loader2 size={18} className="animate-spin" /> Salvando…</> : <><HardHat size={18} /> Lançar Produção</>}
          </button>
        </form>
      )}

      {/* ── HISTÓRICO ── */}
      {aba === 'historico' && (
        <div style={{ padding: '0 16px 32px' }}>
          {historico.length === 0 ? (
            <div style={{ background: '#fff', borderRadius: 12, padding: 32, textAlign: 'center', color: '#9ca3af' }}>
              Nenhum lançamento de produção registrado ainda
            </div>
          ) : historico.map(h => {
            const pb = (h as any).playbook_itens
            const colab = (h as any).colaboradores
            const jaSync = !!h.sincronizado_em
            return (
              <div key={h.id} style={{ background: '#fff', borderRadius: 12, border: `1px solid ${jaSync?'#86efac':'#e5e7eb'}`, marginBottom: 8, padding: '14px 16px', position: 'relative' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: 700, fontSize: 14, color: '#111' }}>{colab?.nome ?? '—'}</div>
                    <div style={{ fontSize: 13, color: '#374151', marginTop: 2 }}>
                      📐 {pb?.descricao ?? '—'}
                    </div>
                    <div style={{ fontSize: 13, fontWeight: 700, color: '#1e3a5f', marginTop: 4 }}>
                      {h.quantidade} {pb?.unidade ?? ''}
                    </div>
                    {h.obs && <div style={{ fontSize: 11, color: '#9ca3af', marginTop: 4, fontStyle: 'italic' }}>{h.obs}</div>}
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 6 }}>
                    {jaSync ? (
                      <span style={{ background: '#dcfce7', color: '#15803d', borderRadius: 5, padding: '2px 8px', fontSize: 11, fontWeight: 700 }}>✓ Sincronizado</span>
                    ) : (
                      <span style={{ background: '#fef3c7', color: '#b45309', borderRadius: 5, padding: '2px 8px', fontSize: 11, fontWeight: 700 }}>⏳ Pendente</span>
                    )}
                    {!jaSync && (
                      <button onClick={() => excluir(h.id, h.sincronizado_em)} disabled={deletandoId === h.id}
                        style={{ background: 'none', border: '1px solid #fca5a5', borderRadius: 6, padding: '3px 8px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4, color: '#dc2626', fontSize: 11 }}>
                        <Trash2 size={12} /> {deletandoId===h.id?'…':'Excluir'}
                      </button>
                    )}
                  </div>
                </div>
                <div style={{ fontSize: 10, color: '#9ca3af', marginTop: 6 }}>
                  {new Date(h.criado_em).toLocaleString('pt-BR')}
                </div>
              </div>
            )
          })}
        </div>
      )}
    </PortalLayout>
  )
}
