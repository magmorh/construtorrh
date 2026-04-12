import React, { useEffect, useState, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '@/lib/supabase'
import { getPortalSession } from '@/hooks/usePortalAuth'
import PortalLayout from './PortalLayout'
import ColabSearchSelect from '@/components/ColabSearchSelect'
import { ShieldCheck, Plus, Trash2, CheckCircle2, Loader2, ChevronDown } from 'lucide-react'

// ─── Tipos ───────────────────────────────────────────────────────────────────

interface CatalogoEpi {
  id: string
  nome: string
  categoria: string
  requer_tamanho: boolean
  requer_numero: boolean   // nº de calçado
  ativo: boolean
}

interface EpiItem {
  id: string
  epi_catalogo_id: string   // referência ao catálogo
  nome: string              // desnormalizado para exibição
  requer_tamanho: boolean
  requer_numero: boolean
  tamanho: string
  numero: string
  quantidade: string
  obs: string
}

interface SolicRow {
  id: string
  itens: EpiItem[]
  status: string
  urgencia: string
  observacoes?: string
  criado_em: string
  aprovado_nome?: string
}

interface ColabRow { id: string; nome: string }

// ─── Constantes ──────────────────────────────────────────────────────────────

const TAMANHOS_VESTUARIO = ['PP', 'P', 'M', 'G', 'GG', 'XG', 'XGG', 'ÚNICO']
const NUMEROS_CALCADO    = ['34','35','36','37','38','39','40','41','42','43','44','45','46']

const I: React.CSSProperties = {
  width: '100%', height: 40, border: '1px solid #d1d5db', borderRadius: 7,
  padding: '0 10px', fontSize: 13, boxSizing: 'border-box', background: '#fff', color: '#111',
}
const S: React.CSSProperties = { ...I, cursor: 'pointer', appearance: 'none' as any }

function novoItem(): EpiItem {
  return {
    id: crypto.randomUUID(),
    epi_catalogo_id: '', nome: '',
    requer_tamanho: false, requer_numero: false,
    tamanho: '', numero: '', quantidade: '1', obs: '',
  }
}

// ─── Componente principal ────────────────────────────────────────────────────

export default function PortalEpis() {
  const nav     = useNavigate()
  const session = getPortalSession()
  const obras   = session?.obras_ids ?? []

  const [obraId,    setObraId]    = useState(obras[0] ?? '')
  const [obrasData, setObrasData] = useState<{ id: string; nome: string }[]>([])
  const [colabs,    setColabs]    = useState<ColabRow[]>([])
  const [catalogo,  setCatalogo]  = useState<CatalogoEpi[]>([])
  const [aba,       setAba]       = useState<'nova' | 'historico'>('nova')
  const [historico, setHistorico] = useState<SolicRow[]>([])
  const [saving,    setSaving]    = useState(false)
  const [sucesso,   setSucesso]   = useState(false)
  const [loadCat,   setLoadCat]   = useState(false)

  // form
  const [colabId,  setColabId]  = useState('')
  const [urgencia, setUrgencia] = useState<'normal' | 'urgente' | 'critico'>('normal')
  const [itens,    setItens]    = useState<EpiItem[]>([novoItem()])
  const [obs,      setObs]      = useState('')

  // ── fetch ──────────────────────────────────────────────────────────────────

  const fetchObras = useCallback(async () => {
    if (!obras.length) return
    const { data } = await supabase.from('obras').select('id,nome').in('id', obras).order('nome')
    if (data) { setObrasData(data); if (data.length) setObraId(data[0].id) }
  }, [obras.join(',')])

  const fetchColabs = useCallback(async () => {
    if (!obraId) return
    const { data } = await supabase.from('colaboradores').select('id,nome')
      .eq('obra_id', obraId).eq('status', 'ativo').order('nome')
    if (data) setColabs(data)
  }, [obraId])

  const fetchCatalogo = useCallback(async () => {
    setLoadCat(true)
    const { data } = await supabase.from('epi_catalogo')
      .select('id,nome,categoria,requer_tamanho,requer_numero,ativo')
      .eq('ativo', true)
      .order('categoria').order('nome')
    if (data) setCatalogo(data)
    setLoadCat(false)
  }, [])

  const fetchHistorico = useCallback(async () => {
    if (!obraId) return
    const { data } = await supabase.from('portal_epi_solicitacoes')
      .select('id,itens,status,urgencia,observacoes,criado_em,aprovado_nome')
      .eq('obra_id', obraId).order('criado_em', { ascending: false })
    if (data) setHistorico(data)
  }, [obraId])

  useEffect(() => { if (!session) { nav('/portal'); return }; fetchObras(); fetchCatalogo() }, [])
  useEffect(() => { fetchColabs(); fetchHistorico() }, [fetchColabs, fetchHistorico])

  // ── manipulação de itens ───────────────────────────────────────────────────

  function addItem()  { setItens(p => [...p, novoItem()]) }
  function remItem(id: string) { setItens(p => p.filter(x => x.id !== id)) }

  function updItem(id: string, field: keyof EpiItem, val: string) {
    setItens(p => p.map(x => x.id === id ? { ...x, [field]: val } : x))
  }

  function selecionarEpi(id: string, epiId: string) {
    const epi = catalogo.find(c => c.id === epiId)
    if (!epi) {
      setItens(p => p.map(x => x.id === id ? {
        ...x, epi_catalogo_id: '', nome: '', requer_tamanho: false, requer_numero: false, tamanho: '', numero: '',
      } : x))
      return
    }
    setItens(p => p.map(x => x.id === id ? {
      ...x,
      epi_catalogo_id: epi.id,
      nome: epi.nome,
      requer_tamanho: epi.requer_tamanho,
      requer_numero: epi.requer_numero,
      tamanho: '',   // reset ao trocar EPI
      numero: '',
    } : x))
  }

  // ── submit ─────────────────────────────────────────────────────────────────

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    const itensValidos = itens.filter(x => x.epi_catalogo_id)
    if (!itensValidos.length) return
    setSaving(true)
    const { error } = await supabase.from('portal_epi_solicitacoes').insert({
      obra_id: obraId,
      colaborador_id: colabId || null,
      portal_usuario_id: session?.id,
      status: 'pendente',
      urgencia, itens: itensValidos, observacoes: obs || null,
    })
    setSaving(false)
    if (error) { alert('Erro ao enviar: ' + error.message); return }
    setSucesso(true)
    setItens([novoItem()]); setObs(''); setColabId(''); setUrgencia('normal')
    fetchHistorico()
    setTimeout(() => { setSucesso(false); setAba('historico') }, 1800)
  }

  // ── helpers visuais ────────────────────────────────────────────────────────

  const ugColor = (u: string) => u === 'critico' ? '#dc2626' : u === 'urgente' ? '#f97316' : '#16a34a'
  const ugLabel = (u: string) => u === 'critico' ? '🔴 Crítico' : u === 'urgente' ? '🟠 Urgente' : '🟢 Normal'

  const stBadge = (s: string) => {
    if (s === 'aprovado' || s === 'atendido') return { bg: '#dcfce7', cor: '#15803d', label: s === 'atendido' ? '✓ Atendido' : '✓ Aprovado' }
    if (s === 'recusado') return { bg: '#fee2e2', cor: '#dc2626', label: '✗ Recusado' }
    return { bg: '#fef3c7', cor: '#b45309', label: '⏳ Pendente' }
  }

  // Agrupar catálogo por categoria para o select com optgroup
  const categorias = [...new Set(catalogo.map(e => e.categoria))].sort()

  return (
    <PortalLayout>
      <div style={{ padding: '16px 16px 8px' }}>
        <div style={{ fontWeight: 800, fontSize: 17, color: '#1e3a5f' }}>🦺 Solicitar EPIs</div>
        <div style={{ fontSize: 12, color: '#9ca3af', marginTop: 2 }}>Solicite equipamentos de proteção para a obra</div>
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

      {/* ══════════════ ABA: NOVA SOLICITAÇÃO ══════════════ */}
      {aba === 'nova' && (
        <form onSubmit={handleSubmit} style={{ padding: '0 16px 32px', display: 'flex', flexDirection: 'column', gap: 12 }}>
          {sucesso && (
            <div style={{ background: '#dcfce7', border: '1px solid #86efac', borderRadius: 10, padding: '12px 16px', display: 'flex', alignItems: 'center', gap: 8, color: '#15803d', fontWeight: 700 }}>
              <CheckCircle2 size={17} /> Solicitação enviada com sucesso!
            </div>
          )}

          {/* Colaborador */}
          <div>
            <ColabSearchSelect
              colabs={colabs}
              value={colabId}
              onChange={setColabId}
              label="Colaborador (opcional)"
              opcional
              opcionalLabel="Para toda a equipe / obra"
            />
          </div>

          {/* Urgência */}
          <div>
            <label style={{ fontSize: 11, fontWeight: 700, color: '#374151', display: 'block', marginBottom: 6, textTransform: 'uppercase' }}>
              Urgência
            </label>
            <div style={{ display: 'flex', gap: 8 }}>
              {(['normal', 'urgente', 'critico'] as const).map(u => (
                <button key={u} type="button" onClick={() => setUrgencia(u)} style={{
                  flex: 1, height: 38, border: `2px solid ${urgencia === u ? ugColor(u) : '#e5e7eb'}`,
                  borderRadius: 8, cursor: 'pointer', fontWeight: 700, fontSize: 12,
                  background: urgencia === u ? ugColor(u) + '18' : '#fff',
                  color: urgencia === u ? ugColor(u) : '#6b7280',
                }}>
                  {ugLabel(u)}
                </button>
              ))}
            </div>
          </div>

          {/* Itens de EPI */}
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
              <label style={{ fontSize: 11, fontWeight: 700, color: '#374151', textTransform: 'uppercase' }}>
                EPIs Solicitados *
              </label>
              <button type="button" onClick={addItem} style={{
                display: 'flex', alignItems: 'center', gap: 4, fontSize: 12,
                padding: '4px 10px', borderRadius: 6, border: '1px solid #1e3a5f',
                background: '#eff6ff', color: '#1e3a5f', cursor: 'pointer', fontWeight: 700,
              }}>
                <Plus size={13} /> Adicionar
              </button>
            </div>

            {loadCat && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: '#64748b', fontSize: 13, padding: '8px 0' }}>
                <Loader2 size={14} style={{ animation: 'spin 1s linear infinite' }} /> Carregando catálogo de EPIs…
              </div>
            )}

            {itens.map((item) => (
              <div key={item.id} style={{ background: '#f9fafb', border: '1px solid #e5e7eb', borderRadius: 10, padding: '12px 12px', marginBottom: 8 }}>
                {/* Linha 1: EPI + Qtd + botão remover */}
                <div style={{ display: 'flex', gap: 8, marginBottom: item.requer_tamanho || item.requer_numero ? 8 : 0 }}>
                  {/* Select do EPI */}
                  <div style={{ flex: 1 }}>
                    <label style={{ fontSize: 10, fontWeight: 700, color: '#6b7280', display: 'block', marginBottom: 3 }}>EPI *</label>
                    <div style={{ position: 'relative' }}>
                      <select
                        value={item.epi_catalogo_id}
                        onChange={e => selecionarEpi(item.id, e.target.value)}
                        style={{ ...S, height: 36, fontSize: 12, paddingRight: 28 }}
                      >
                        <option value="">Selecione o EPI…</option>
                        {categorias.map(cat => (
                          <optgroup key={cat} label={`📦 ${cat}`}>
                            {catalogo.filter(e => e.categoria === cat).map(e => (
                              <option key={e.id} value={e.id}>{e.nome}</option>
                            ))}
                          </optgroup>
                        ))}
                      </select>
                      <ChevronDown size={13} style={{ position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none', color: '#6b7280' }} />
                    </div>
                  </div>

                  {/* Quantidade */}
                  <div style={{ width: 68 }}>
                    <label style={{ fontSize: 10, fontWeight: 700, color: '#6b7280', display: 'block', marginBottom: 3 }}>Qtd.</label>
                    <input
                      type="number" min="1" value={item.quantidade}
                      onChange={e => updItem(item.id, 'quantidade', e.target.value)}
                      style={{ ...I, height: 36, fontSize: 13, textAlign: 'center' }}
                    />
                  </div>

                  {/* Remover */}
                  {itens.length > 1 && (
                    <button type="button" onClick={() => remItem(item.id)} style={{
                      alignSelf: 'flex-end', width: 36, height: 36, border: '1px solid #fca5a5',
                      background: '#fff', borderRadius: 7, cursor: 'pointer', color: '#dc2626',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                    }}>
                      <Trash2 size={13} />
                    </button>
                  )}
                </div>

                {/* Linha 2: Tamanho + Nº Calçado (condicional) */}
                {(item.requer_tamanho || item.requer_numero) && (
                  <div style={{ display: 'flex', gap: 8, marginBottom: 6 }}>
                    {item.requer_tamanho && (
                      <div style={{ flex: 1 }}>
                        <label style={{ fontSize: 10, fontWeight: 700, color: '#1e3a5f', display: 'block', marginBottom: 3 }}>
                          👕 Tamanho *
                        </label>
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
                          {TAMANHOS_VESTUARIO.map(tam => (
                            <button
                              key={tam} type="button"
                              onClick={() => updItem(item.id, 'tamanho', item.tamanho === tam ? '' : tam)}
                              style={{
                                padding: '5px 10px', borderRadius: 7, fontSize: 12, fontWeight: 700,
                                border: `2px solid ${item.tamanho === tam ? '#1e3a5f' : '#e5e7eb'}`,
                                background: item.tamanho === tam ? '#1e3a5f' : '#fff',
                                color: item.tamanho === tam ? '#fff' : '#374151',
                                cursor: 'pointer', minWidth: 38,
                              }}
                            >
                              {tam}
                            </button>
                          ))}
                        </div>
                      </div>
                    )}
                    {item.requer_numero && (
                      <div style={{ flex: 1 }}>
                        <label style={{ fontSize: 10, fontWeight: 700, color: '#1e3a5f', display: 'block', marginBottom: 3 }}>
                          👟 Nº Calçado *
                        </label>
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
                          {NUMEROS_CALCADO.map(n => (
                            <button
                              key={n} type="button"
                              onClick={() => updItem(item.id, 'numero', item.numero === n ? '' : n)}
                              style={{
                                padding: '5px 8px', borderRadius: 7, fontSize: 12, fontWeight: 700,
                                border: `2px solid ${item.numero === n ? '#0369a1' : '#e5e7eb'}`,
                                background: item.numero === n ? '#0369a1' : '#fff',
                                color: item.numero === n ? '#fff' : '#374151',
                                cursor: 'pointer', minWidth: 38,
                              }}
                            >
                              {n}
                            </button>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {/* Observação do item */}
                <input
                  value={item.obs}
                  onChange={e => updItem(item.id, 'obs', e.target.value)}
                  placeholder={item.nome ? `Observação sobre ${item.nome} (opcional)` : 'Observação (opcional)'}
                  style={{ ...I, height: 34, fontSize: 12 }}
                />
              </div>
            ))}
          </div>

          {/* Observações gerais */}
          <div>
            <label style={{ fontSize: 11, fontWeight: 700, color: '#374151', display: 'block', marginBottom: 4, textTransform: 'uppercase' }}>
              Observações gerais
            </label>
            <textarea value={obs} onChange={e => setObs(e.target.value)} rows={3}
              placeholder="Contexto adicional para o responsável…"
              style={{ width: '100%', border: '1px solid #d1d5db', borderRadius: 7, padding: '9px 10px', fontSize: 13, boxSizing: 'border-box', background: '#fff', resize: 'vertical', fontFamily: 'inherit' }} />
          </div>

          <button
            type="submit"
            disabled={saving || itens.every(x => !x.epi_catalogo_id)}
            style={{
              marginTop: 4, height: 50,
              background: saving ? '#94a3b8' : 'linear-gradient(135deg,#1e3a5f,#0369a1)',
              color: '#fff', border: 'none', borderRadius: 12,
              fontSize: 15, fontWeight: 700, cursor: saving ? 'not-allowed' : 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
              boxShadow: saving ? 'none' : '0 4px 12px rgba(30,58,95,0.3)',
            }}
          >
            {saving
              ? <><Loader2 size={17} style={{ animation: 'spin 1s linear infinite' }} />Enviando…</>
              : <><ShieldCheck size={17} />Enviar Solicitação de EPI</>}
          </button>
        </form>
      )}

      {/* ══════════════ ABA: HISTÓRICO ══════════════ */}
      {aba === 'historico' && (
        <div style={{ padding: '0 16px 24px', display: 'flex', flexDirection: 'column', gap: 8 }}>
          {historico.length === 0 ? (
            <div style={{ background: '#fff', borderRadius: 12, padding: 32, textAlign: 'center', color: '#9ca3af' }}>
              Nenhuma solicitação de EPI enviada
            </div>
          ) : historico.map(s => {
            const b = stBadge(s.status)
            return (
              <div key={s.id} style={{ background: '#fff', border: '1px solid #e5e7eb', borderLeft: `4px solid ${b.cor}`, borderRadius: 10, padding: '12px 14px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap', marginBottom: 6 }}>
                      <span style={{ fontWeight: 700, fontSize: 13 }}>🦺 {s.itens?.length ?? 0} item(s)</span>
                      <span style={{ fontSize: 11, fontWeight: 700, color: ugColor(s.urgencia) }}>{ugLabel(s.urgencia)}</span>
                    </div>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
                      {(s.itens ?? []).map((it, i) => (
                        <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 4, background: '#eff6ff', borderRadius: 6, padding: '3px 8px' }}>
                          <span style={{ color: '#1d4ed8', fontSize: 12, fontWeight: 700 }}>{it.nome}</span>
                          <span style={{ color: '#64748b', fontSize: 11 }}>×{it.quantidade}</span>
                          {it.tamanho && (
                            <span style={{ background: '#1e3a5f', color: '#fff', borderRadius: 4, padding: '0 5px', fontSize: 10, fontWeight: 700 }}>
                              {it.tamanho}
                            </span>
                          )}
                          {it.numero && (
                            <span style={{ background: '#0369a1', color: '#fff', borderRadius: 4, padding: '0 5px', fontSize: 10, fontWeight: 700 }}>
                              nº {it.numero}
                            </span>
                          )}
                        </div>
                      ))}
                    </div>
                    {s.observacoes && <div style={{ fontSize: 11, color: '#6b7280', marginTop: 5 }}>{s.observacoes}</div>}
                    {s.aprovado_nome && <div style={{ fontSize: 10, color: '#15803d', marginTop: 4 }}>✓ Por: {s.aprovado_nome}</div>}
                  </div>
                  <span style={{ background: b.bg, color: b.cor, borderRadius: 5, padding: '2px 8px', fontSize: 11, fontWeight: 700, marginLeft: 8, whiteSpace: 'nowrap' }}>
                    {b.label}
                  </span>
                </div>
                <div style={{ fontSize: 10, color: '#9ca3af', marginTop: 6 }}>
                  {new Date(s.criado_em).toLocaleString('pt-BR')}
                </div>
              </div>
            )
          })}
        </div>
      )}
    </PortalLayout>
  )
}
