import React, { useEffect, useState, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '@/lib/supabase'
import { getPortalSession } from '@/hooks/usePortalAuth'
import PortalLayout from './PortalLayout'
import ColabSearchSelect from '@/components/ColabSearchSelect'
import { ShieldCheck, Plus, Trash2, CheckCircle2, Loader2, Clock, Check, X, AlertTriangle } from 'lucide-react'

interface EpiItem { id: string; nome: string; quantidade: string; obs: string }
interface SolicRow { id: string; itens: EpiItem[]; status: string; urgencia: string; observacoes?: string; criado_em: string; aprovado_nome?: string }
interface ColabRow { id: string; nome: string }

const TIPOS_EPI = [
  'Capacete','Óculos de Proteção','Luvas','Colete Refletivo','Botina de Segurança',
  'Protetor Auricular','Máscara PFF2','Cinto de Segurança','Protetor Solar',
  'Impermeável','Calça de Proteção','Mangote','Outro',
]

const I: React.CSSProperties = { width:'100%', height:40, border:'1px solid #d1d5db', borderRadius:7, padding:'0 10px', fontSize:13, boxSizing:'border-box', background:'#fff', color:'#111' }
const S: React.CSSProperties = { ...I, cursor:'pointer' }

function novoItem(): EpiItem { return { id: crypto.randomUUID(), nome:'', quantidade:'1', obs:'' } }

export default function PortalEpis() {
  const nav     = useNavigate()
  const session = getPortalSession()
  const obras   = session?.obras_ids ?? []

  const [obraId,    setObraId]    = useState(obras[0] ?? '')
  const [obrasData, setObrasData] = useState<{ id:string; nome:string }[]>([])
  const [colabs,    setColabs]    = useState<ColabRow[]>([])
  const [aba,       setAba]       = useState<'nova'|'historico'>('nova')
  const [historico, setHistorico] = useState<SolicRow[]>([])
  const [saving,    setSaving]    = useState(false)
  const [sucesso,   setSucesso]   = useState(false)

  // form
  const [colabId,   setColabId]   = useState('')
  const [urgencia,  setUrgencia]  = useState<'normal'|'urgente'|'critico'>('normal')
  const [itens,     setItens]     = useState<EpiItem[]>([novoItem()])
  const [obs,       setObs]       = useState('')

  const fetchObras = useCallback(async () => {
    if (!obras.length) return
    const { data } = await supabase.from('obras').select('id,nome').in('id', obras).order('nome')
    if (data) setObrasData(data)
  }, [obras.join(',')])

  const fetchColabs = useCallback(async () => {
    if (!obraId) return
    const { data } = await supabase.from('colaboradores').select('id,nome')
      .eq('obra_id', obraId).eq('status','ativo').order('nome')
    if (data) setColabs(data)
  }, [obraId])

  const fetchHistorico = useCallback(async () => {
    if (!obraId) return
    const { data } = await supabase.from('portal_epi_solicitacoes')
      .select('id,itens,status,urgencia,observacoes,criado_em,aprovado_nome')
      .eq('obra_id', obraId).order('criado_em', { ascending: false })
    if (data) setHistorico(data)
  }, [obraId])

  useEffect(() => { if (!session) { nav('/portal'); return }; fetchObras() }, [])
  useEffect(() => { fetchColabs(); fetchHistorico() }, [fetchColabs, fetchHistorico])

  function addItem()  { setItens(p => [...p, novoItem()]) }
  function remItem(id: string) { setItens(p => p.filter(x => x.id !== id)) }
  function updItem(id: string, field: keyof EpiItem, val: string) {
    setItens(p => p.map(x => x.id === id ? { ...x, [field]: val } : x))
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    const itensValidos = itens.filter(x => x.nome.trim())
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
    if (error) {
      alert('Erro ao enviar solicitação: ' + error.message)
      return
    }
    setSucesso(true)
    setItens([novoItem()]); setObs(''); setColabId(''); setUrgencia('normal')
    fetchHistorico()
    setTimeout(() => { setSucesso(false); setAba('historico') }, 1800)
  }

  const ugColor = (u: string) => u === 'critico' ? '#dc2626' : u === 'urgente' ? '#f97316' : '#16a34a'
  const ugLabel = (u: string) => u === 'critico' ? '🔴 Crítico' : u === 'urgente' ? '🟠 Urgente' : '🟢 Normal'
  const stBadge = (s: string) => {
    if (s === 'aprovado'  || s === 'atendido') return { bg:'#dcfce7', cor:'#15803d', label: s === 'atendido' ? '✓ Atendido' : '✓ Aprovado' }
    if (s === 'recusado')  return { bg:'#fee2e2', cor:'#dc2626', label:'✗ Recusado' }
    return                         { bg:'#fef3c7', cor:'#b45309', label:'⏳ Pendente' }
  }

  return (
    <PortalLayout>
      <div style={{ padding:'16px 16px 8px' }}>
        <div style={{ fontWeight:800, fontSize:17, color:'#1e3a5f' }}>🦺 Solicitar EPIs</div>
        <div style={{ fontSize:12, color:'#9ca3af', marginTop:2 }}>Solicite equipamentos de proteção para a obra</div>
      </div>

      {obrasData.length > 1 && (
        <div style={{ padding:'0 16px 10px' }}>
          <select value={obraId} onChange={e => setObraId(e.target.value)} style={S}>
            {obrasData.map(o => <option key={o.id} value={o.id}>{o.nome}</option>)}
          </select>
        </div>
      )}

      {/* Abas */}
      <div style={{ display:'flex', margin:'0 16px 12px', background:'#f3f4f6', borderRadius:10, padding:4 }}>
        {(['nova','historico'] as const).map(a => (
          <button key={a} onClick={() => setAba(a)} style={{
            flex:1, height:34, border:'none', borderRadius:7, cursor:'pointer',
            fontWeight:700, fontSize:13,
            background:aba===a?'#fff':'transparent',
            color:aba===a?'#1e3a5f':'#9ca3af',
            boxShadow:aba===a?'0 1px 4px rgba(0,0,0,0.1)':'none',
          }}>
            {a === 'nova' ? '+ Nova Solicitação' : `Histórico (${historico.length})`}
          </button>
        ))}
      </div>

      {/* ── FORMULÁRIO ── */}
      {aba === 'nova' && (
        <form onSubmit={handleSubmit} style={{ padding:'0 16px 32px', display:'flex', flexDirection:'column', gap:12 }}>
          {sucesso && (
            <div style={{ background:'#dcfce7', border:'1px solid #86efac', borderRadius:10,
              padding:'12px 16px', display:'flex', alignItems:'center', gap:8, color:'#15803d', fontWeight:700 }}>
              <CheckCircle2 size={17} /> Solicitação enviada com sucesso!
            </div>
          )}

          {/* Colaborador + Urgência */}
          <div>
            <label style={{ fontSize:11, fontWeight:700, color:'#374151', display:'block', marginBottom:4, textTransform:'uppercase' }}>
              Colaborador (opcional)
            </label>
            <ColabSearchSelect
              colabs={colabs}
              value={colabId}
              onChange={setColabId}
              label="Colaborador (opcional)"
              opcional
              opcionalLabel="Para toda a equipe / obra"
            />
          </div>

          <div>
            <label style={{ fontSize:11, fontWeight:700, color:'#374151', display:'block', marginBottom:6, textTransform:'uppercase' }}>
              Urgência
            </label>
            <div style={{ display:'flex', gap:8 }}>
              {(['normal','urgente','critico'] as const).map(u => (
                <button key={u} type="button" onClick={() => setUrgencia(u)} style={{
                  flex:1, height:38, border:`2px solid ${urgencia===u ? ugColor(u) : '#e5e7eb'}`,
                  borderRadius:8, cursor:'pointer', fontWeight:700, fontSize:12,
                  background:urgencia===u ? ugColor(u) + '18' : '#fff',
                  color:urgencia===u ? ugColor(u) : '#6b7280',
                }}>
                  {ugLabel(u)}
                </button>
              ))}
            </div>
          </div>

          {/* Itens */}
          <div>
            <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:8 }}>
              <label style={{ fontSize:11, fontWeight:700, color:'#374151', textTransform:'uppercase' }}>
                EPIs Solicitados *
              </label>
              <button type="button" onClick={addItem} style={{
                display:'flex', alignItems:'center', gap:4, fontSize:12,
                padding:'4px 10px', borderRadius:6, border:'1px solid #1e3a5f',
                background:'#eff6ff', color:'#1e3a5f', cursor:'pointer', fontWeight:700,
              }}>
                <Plus size={13} /> Adicionar
              </button>
            </div>

            {itens.map((item, idx) => (
              <div key={item.id} style={{ background:'#f9fafb', border:'1px solid #e5e7eb', borderRadius:10,
                padding:'10px 12px', marginBottom:8 }}>
                <div style={{ display:'flex', gap:8, marginBottom:6 }}>
                  <div style={{ flex:1 }}>
                    <label style={{ fontSize:10, fontWeight:700, color:'#6b7280', display:'block', marginBottom:3 }}>EPI *</label>
                    <select value={item.nome} onChange={e => updItem(item.id,'nome',e.target.value)} style={{ ...S, height:36, fontSize:12 }}>
                      <option value="">Selecione…</option>
                      {TIPOS_EPI.map(t => <option key={t} value={t}>{t}</option>)}
                    </select>
                    {item.nome === 'Outro' && (
                      <input value={item.obs} onChange={e => updItem(item.id,'obs',e.target.value)}
                        placeholder="Descreva o EPI" style={{ ...I, height:34, fontSize:12, marginTop:4 }} />
                    )}
                  </div>
                  <div style={{ width:64 }}>
                    <label style={{ fontSize:10, fontWeight:700, color:'#6b7280', display:'block', marginBottom:3 }}>Qtd.</label>
                    <input type="number" min="1" value={item.quantidade}
                      onChange={e => updItem(item.id,'quantidade',e.target.value)}
                      style={{ ...I, height:36, fontSize:13, textAlign:'center' }} />
                  </div>
                  {itens.length > 1 && (
                    <button type="button" onClick={() => remItem(item.id)} style={{
                      alignSelf:'flex-end', width:34, height:36, border:'1px solid #fca5a5',
                      background:'#fff', borderRadius:7, cursor:'pointer', color:'#dc2626',
                      display:'flex', alignItems:'center', justifyContent:'center',
                    }}>
                      <Trash2 size={13} />
                    </button>
                  )}
                </div>
                {item.nome !== 'Outro' && (
                  <input value={item.obs} onChange={e => updItem(item.id,'obs',e.target.value)}
                    placeholder={`Observação sobre ${item.nome || 'o item'} (opcional)`}
                    style={{ ...I, height:34, fontSize:12 }} />
                )}
              </div>
            ))}
          </div>

          <div>
            <label style={{ fontSize:11, fontWeight:700, color:'#374151', display:'block', marginBottom:4, textTransform:'uppercase' }}>
              Observações gerais
            </label>
            <textarea value={obs} onChange={e => setObs(e.target.value)} rows={3}
              placeholder="Contexto adicional para o responsável…"
              style={{ width:'100%', border:'1px solid #d1d5db', borderRadius:7, padding:'9px 10px', fontSize:13, boxSizing:'border-box', background:'#fff', resize:'vertical' }} />
          </div>

          <button type="submit" disabled={saving || itens.every(x => !x.nome.trim())} style={{
            marginTop:4, height:50, background:saving?'#94a3b8':'#1e3a5f', color:'#fff',
            border:'none', borderRadius:12, fontSize:15, fontWeight:700, cursor:saving?'not-allowed':'pointer',
            display:'flex', alignItems:'center', justifyContent:'center', gap:8,
          }}>
            {saving ? <><Loader2 size={17} className="animate-spin"/>Enviando…</> : <><ShieldCheck size={17}/>Enviar Solicitação de EPI</>}
          </button>
        </form>
      )}

      {/* ── HISTÓRICO ── */}
      {aba === 'historico' && (
        <div style={{ padding:'0 16px 24px', display:'flex', flexDirection:'column', gap:8 }}>
          {historico.length === 0 ? (
            <div style={{ background:'#fff', borderRadius:12, padding:32, textAlign:'center', color:'#9ca3af' }}>
              Nenhuma solicitação de EPI enviada
            </div>
          ) : historico.map(s => {
            const b = stBadge(s.status)
            return (
              <div key={s.id} style={{ background:'#fff', border:`1px solid #e5e7eb`, borderLeft:`4px solid ${b.cor}`, borderRadius:10, padding:'12px 14px' }}>
                <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start' }}>
                  <div style={{ flex:1 }}>
                    <div style={{ display:'flex', gap:6, alignItems:'center', flexWrap:'wrap', marginBottom:4 }}>
                      <span style={{ fontWeight:700, fontSize:13 }}>🦺 {s.itens?.length ?? 0} item(s)</span>
                      <span style={{ fontSize:11, fontWeight:700, color:ugColor(s.urgencia) }}>{ugLabel(s.urgencia)}</span>
                    </div>
                    <div style={{ display:'flex', flexWrap:'wrap', gap:4 }}>
                      {(s.itens ?? []).map((it, i) => (
                        <span key={i} style={{ background:'#eff6ff', color:'#1d4ed8', borderRadius:5, padding:'2px 7px', fontSize:11 }}>
                          {it.nome} ×{it.quantidade}
                        </span>
                      ))}
                    </div>
                    {s.observacoes && <div style={{ fontSize:11, color:'#6b7280', marginTop:4 }}>{s.observacoes}</div>}
                    {s.aprovado_nome && (
                      <div style={{ fontSize:10, color:'#15803d', marginTop:4 }}>✓ Por: {s.aprovado_nome}</div>
                    )}
                  </div>
                  <span style={{ background:b.bg, color:b.cor, borderRadius:5, padding:'2px 8px', fontSize:11, fontWeight:700, marginLeft:8, whiteSpace:'nowrap' }}>
                    {b.label}
                  </span>
                </div>
                <div style={{ fontSize:10, color:'#9ca3af', marginTop:6 }}>
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
