import React, { useEffect, useState, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '@/lib/supabase'
import { getPortalSession } from '@/hooks/usePortalAuth'
import PortalLayout from './PortalLayout'
import {
  Pencil, Trash2, Loader2, CheckCircle2, AlertTriangle,
  X, Save, CalendarDays, Building2, User, Clock,
  TrendingUp, BarChart2, AlertCircle, ChevronDown, ChevronUp,
} from 'lucide-react'

// ─── Tipos ───────────────────────────────────────────────────────────────────
interface LancItem {
  id: string
  colaborador_id: string
  colaborador_nome: string
  colaborador_chapa: string | null
  funcao_nome: string
  tipo_contrato: string
  obra_id: string
  obra_nome: string
  mes_referencia: string
  data_inicio: string
  data_fim: string
  status: string
  motivo_recusa: string | null
  observacoes: string | null
}

interface DiaPonto {
  id?: string
  data: string
  horas_trabalhadas: number
  horas_extras: number
  falta: boolean
  observacoes: string
}

const MESES = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho',
               'Julho','Agosto','Setembro','Outubro','Novembro','Dezembro']

const STATUS_META: Record<string, { label:string; bg:string; cor:string; emoji:string; editavel:boolean }> = {
  rascunho:             { label:'Rascunho',       bg:'#f3f4f6', cor:'#6b7280', emoji:'📝', editavel:true },
  em_fechamento:        { label:'Em Fechamento',  bg:'#fef3c7', cor:'#b45309', emoji:'🔒', editavel:false },
  aguardando_aprovacao: { label:'Aguardando',     bg:'#dbeafe', cor:'#1d4ed8', emoji:'⏳', editavel:true },
  aprovado:             { label:'Aprovado',       bg:'#dcfce7', cor:'#15803d', emoji:'✅', editavel:false },
  liberado:             { label:'Liberado',       bg:'#d1fae5', cor:'#059669', emoji:'🟢', editavel:false },
  pago:                 { label:'Pago',           bg:'#f0fdf4', cor:'#166534', emoji:'💰', editavel:false },
  recusado:             { label:'Recusado',       bg:'#fee2e2', cor:'#dc2626', emoji:'❌', editavel:true },
}

function fmtData(s: string) {
  if (!s) return '—'
  const [y,m,d] = s.split('-')
  return `${d}/${m}/${y}`
}
function fmtHH(h: number) {
  if (!h) return '0:00'
  const hh = Math.floor(h)
  const mm = Math.round((h - hh) * 60)
  return `${hh}:${String(mm).padStart(2,'0')}`
}

const DIAS_SEM = ['Dom','Seg','Ter','Qua','Qui','Sex','Sáb']

const INP: React.CSSProperties = {
  width:'100%', height:40, border:'2px solid #e5e7eb', borderRadius:8,
  padding:'0 12px', fontSize:13, boxSizing:'border-box', background:'#fff',
  outline:'none',
}
const SEL: React.CSSProperties = { ...INP, cursor:'pointer' }

// ─── Componente ──────────────────────────────────────────────────────────────
export default function PortalLancamentos() {
  const nav     = useNavigate()
  const session = getPortalSession()
  const obras   = session?.obras_ids ?? []

  const hoje = new Date()
  const [ano,       setAno]       = useState(hoje.getFullYear())
  const [mes,       setMes]       = useState(hoje.getMonth() + 1)
  const [obraId,    setObraId]    = useState(obras[0] ?? '')
  const [obrasData, setObrasData] = useState<{id:string;nome:string}[]>([])
  const [lancamentos, setLancamentos] = useState<LancItem[]>([])
  const [loading,   setLoading]   = useState(false)

  // Modal edição
  const [editLanc,   setEditLanc]   = useState<LancItem | null>(null)
  const [editDias,   setEditDias]   = useState<DiaPonto[]>([])
  const [loadDias,   setLoadDias]   = useState(false)
  const [saving,     setSaving]     = useState(false)
  const [saveOk,     setSaveOk]     = useState(false)
  const [saveErro,   setSaveErro]   = useState<string | null>(null)
  const [confirmDel, setConfirmDel] = useState<LancItem | null>(null)
  const [deleting,   setDeleting]   = useState(false)

  // Campos editáveis
  const [eDataIni, setEDataIni] = useState('')
  const [eDataFim, setEDataFim] = useState('')
  const [eObraId,  setEObraId]  = useState('')
  const [eObs,     setEObs]     = useState('')
  const [eStatus,  setEStatus]  = useState('')

  // Colapso de grupos de dias
  const [diasAbertos, setDiasAbertos] = useState(true)

  const mesRef = `${ano}-${String(mes).padStart(2,'0')}`

  // ── Obras ─────────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!session) { nav('/portal'); return }
    supabase.from('obras').select('id,nome')
      .in('id', obras.length ? obras : ['__none'])
      .order('nome')
      .then(({ data }) => {
        if (data) {
          setObrasData(data)
          if (!obraId && data.length) setObraId(data[0].id)
        }
      })
  }, [])

  // ── Fetch lançamentos ─────────────────────────────────────────────────────
  const fetchLancs = useCallback(async () => {
    if (!obraId) return
    setLoading(true)
    const { data } = await supabase
      .from('ponto_lancamentos')
      .select(`
        id, colaborador_id, obra_id, mes_referencia, data_inicio, data_fim,
        status, motivo_recusa, observacoes,
        colaboradores(nome, chapa, tipo_contrato, funcoes(nome)),
        obras(nome)
      `)
      .eq('obra_id', obraId)
      .eq('mes_referencia', mesRef)
      .order('data_inicio')
    setLancamentos((data ?? []).map((l: any) => ({
      id: l.id,
      colaborador_id: l.colaborador_id,
      colaborador_nome: l.colaboradores?.nome ?? '—',
      colaborador_chapa: l.colaboradores?.chapa ?? null,
      funcao_nome: l.colaboradores?.funcoes?.nome ?? '—',
      tipo_contrato: l.colaboradores?.tipo_contrato ?? '—',
      obra_id: l.obra_id,
      obra_nome: l.obras?.nome ?? '—',
      mes_referencia: l.mes_referencia,
      data_inicio: l.data_inicio,
      data_fim: l.data_fim,
      status: l.status ?? 'rascunho',
      motivo_recusa: l.motivo_recusa ?? null,
      observacoes: l.observacoes ?? null,
    })))
    setLoading(false)
  }, [obraId, mesRef])

  useEffect(() => { fetchLancs() }, [fetchLancs])

  // ── Abrir edição ──────────────────────────────────────────────────────────
  async function abrirEdicao(lanc: LancItem) {
    setEditLanc(lanc)
    setEDataIni(lanc.data_inicio)
    setEDataFim(lanc.data_fim)
    setEObraId(lanc.obra_id)
    setEObs(lanc.observacoes ?? '')
    setEStatus(lanc.status)
    setSaveOk(false)
    setSaveErro(null)
    setEditDias([])
    setLoadDias(true)
    setDiasAbertos(true)

    const { data } = await supabase
      .from('registro_ponto')
      .select('id,data,horas_trabalhadas,horas_extras,falta,observacoes')
      .eq('lancamento_id', lanc.id)
      .order('data')

    const diasGerados: DiaPonto[] = []
    const cur = new Date(lanc.data_inicio + 'T12:00:00')
    const fim = new Date(lanc.data_fim + 'T12:00:00')
    while (cur <= fim) {
      const ds  = cur.toISOString().slice(0,10)
      const reg = (data ?? []).find((r: any) => r.data === ds)
      diasGerados.push({
        id:                reg?.id,
        data:              ds,
        horas_trabalhadas: reg?.horas_trabalhadas ?? 0,
        horas_extras:      reg?.horas_extras ?? 0,
        falta:             reg?.falta ?? false,
        observacoes:       reg?.observacoes ?? '',
      })
      cur.setDate(cur.getDate() + 1)
    }
    setEditDias(diasGerados)
    setLoadDias(false)
  }

  function setDia(idx: number, field: keyof DiaPonto, val: any) {
    setEditDias(prev => prev.map((d,i) => i===idx ? { ...d, [field]:val } : d))
  }

  // Totais calculados
  const totalHN = editDias.reduce((s,d) => s + (d.falta ? 0 : d.horas_trabalhadas), 0)
  const totalHE = editDias.reduce((s,d) => s + (d.falta ? 0 : d.horas_extras), 0)
  const totalFaltas = editDias.filter(d => d.falta).length
  const diasUteis = editDias.filter(d => {
    const dow = new Date(d.data + 'T12:00:00').getDay()
    return dow !== 0 // exclui domingos
  }).length

  // ── Salvar edição ─────────────────────────────────────────────────────────
  async function salvarEdicao() {
    if (!editLanc) return
    if (eDataIni > eDataFim) { setSaveErro('Data início não pode ser maior que data fim.'); return }
    setSaving(true)
    setSaveOk(false)
    setSaveErro(null)

    const { error: errLanc } = await supabase
      .from('ponto_lancamentos')
      .update({ data_inicio:eDataIni, data_fim:eDataFim, obra_id:eObraId, status:eStatus, observacoes:eObs||null })
      .eq('id', editLanc.id)

    if (errLanc) { setSaveErro('Erro ao salvar: ' + errLanc.message); setSaving(false); return }

    for (const dia of editDias) {
      const payload = {
        lancamento_id:     editLanc.id,
        colaborador_id:    editLanc.colaborador_id,
        obra_id:           eObraId,
        data:              dia.data,
        horas_trabalhadas: dia.falta ? 0 : dia.horas_trabalhadas,
        horas_extras:      dia.falta ? 0 : dia.horas_extras,
        falta:             dia.falta,
        observacoes:       dia.observacoes || null,
      }
      if (dia.id) {
        await supabase.from('registro_ponto').update(payload).eq('id', dia.id)
      } else {
        if (dia.horas_trabalhadas > 0 || dia.horas_extras > 0 || dia.falta) {
          const { data: ins } = await supabase.from('registro_ponto').insert(payload).select('id').single()
          if (ins) setEditDias(prev => prev.map(d => d.data===dia.data ? { ...d, id:ins.id } : d))
        }
      }
    }

    setSaving(false)
    setSaveOk(true)
    await fetchLancs()
    setTimeout(() => { setEditLanc(null); setSaveOk(false) }, 1200)
  }

  // ── Excluir ───────────────────────────────────────────────────────────────
  async function excluirLanc() {
    if (!confirmDel) return
    setDeleting(true)
    await supabase.from('registro_ponto').delete().eq('lancamento_id', confirmDel.id)
    await supabase.from('ponto_producao').delete().eq('lancamento_id', confirmDel.id)
    await supabase.from('ponto_lancamentos').delete().eq('id', confirmDel.id)
    setDeleting(false)
    setConfirmDel(null)
    await fetchLancs()
  }

  // ── Estatísticas do mês ───────────────────────────────────────────────────
  const totalLancs  = lancamentos.length
  const lancsRec    = lancamentos.filter(l => l.status === 'recusado').length
  const lancsAguard = lancamentos.filter(l => l.status === 'aguardando_aprovacao').length
  const lancsOk     = lancamentos.filter(l => ['aprovado','liberado','pago'].includes(l.status)).length

  return (
    <PortalLayout>
      <div style={{ padding:'16px 16px 32px', display:'flex', flexDirection:'column', gap:14 }}>

        {/* Título */}
        <div style={{ display:'flex', alignItems:'center', gap:10 }}>
          <div style={{ width:38,height:38,borderRadius:10,background:'#0d3f56', display:'flex',alignItems:'center',justifyContent:'center' }}>
            <CalendarDays size={18} color="#fff"/>
          </div>
          <div>
            <div style={{ fontWeight:800, fontSize:16, color:'#1e293b' }}>Lançamentos de Ponto</div>
            <div style={{ fontSize:11, color:'#64748b' }}>Visualize e corrija os lançamentos</div>
          </div>
        </div>

        {/* Filtros */}
        <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:8 }}>
          <div>
            <label style={{ fontSize:10, fontWeight:800, color:'#374151', display:'block', marginBottom:4, letterSpacing:'0.04em' }}>MÊS</label>
            <select value={mes} onChange={e => setMes(Number(e.target.value))} style={SEL}>
              {MESES.map((m,i) => <option key={i} value={i+1}>{m}</option>)}
            </select>
          </div>
          <div>
            <label style={{ fontSize:10, fontWeight:800, color:'#374151', display:'block', marginBottom:4, letterSpacing:'0.04em' }}>ANO</label>
            <select value={ano} onChange={e => setAno(Number(e.target.value))} style={SEL}>
              {[2024,2025,2026,2027].map(y => <option key={y} value={y}>{y}</option>)}
            </select>
          </div>
        </div>
        <div>
          <label style={{ fontSize:10, fontWeight:800, color:'#374151', display:'block', marginBottom:4, letterSpacing:'0.04em' }}>OBRA</label>
          <select value={obraId} onChange={e => setObraId(e.target.value)} style={SEL}>
            {obrasData.map(o => <option key={o.id} value={o.id}>{o.nome}</option>)}
          </select>
        </div>

        {/* Cards de resumo */}
        {totalLancs > 0 && (
          <div style={{ display:'grid', gridTemplateColumns:'repeat(4,1fr)', gap:6 }}>
            {[
              { label:'Total',    val:totalLancs,  bg:'#eff6ff', cor:'#1d4ed8', icon:'📋' },
              { label:'Aguard.',  val:lancsAguard, bg:'#fef3c7', cor:'#b45309', icon:'⏳' },
              { label:'Recusad.', val:lancsRec,    bg:'#fef2f2', cor:'#dc2626', icon:'❌' },
              { label:'Aprova.',  val:lancsOk,     bg:'#f0fdf4', cor:'#16a34a', icon:'✅' },
            ].map(c => (
              <div key={c.label} style={{ background:c.bg, borderRadius:10, padding:'10px 8px', textAlign:'center' }}>
                <div style={{ fontSize:16, marginBottom:2 }}>{c.icon}</div>
                <div style={{ fontSize:18, fontWeight:800, color:c.cor }}>{c.val}</div>
                <div style={{ fontSize:9, fontWeight:700, color:c.cor, opacity:0.7 }}>{c.label}</div>
              </div>
            ))}
          </div>
        )}

        {/* Lista */}
        {loading ? (
          <div style={{ textAlign:'center', padding:'36px 0', color:'#6b7280' }}>
            <Loader2 size={26} className="animate-spin" style={{ margin:'0 auto 10px', display:'block' }}/>
            <div style={{ fontSize:13 }}>Carregando lançamentos…</div>
          </div>
        ) : lancamentos.length === 0 ? (
          <div style={{ textAlign:'center', padding:'36px 16px', background:'#f8fafc', border:'2px dashed #e2e8f0', borderRadius:14 }}>
            <CalendarDays size={36} style={{ margin:'0 auto 10px', display:'block', opacity:0.3 }}/>
            <div style={{ fontWeight:800, color:'#374151', marginBottom:4 }}>Nenhum lançamento</div>
            <div style={{ fontSize:12, color:'#9ca3af' }}>Não há lançamentos para {MESES[mes-1]}/{ano} nesta obra.</div>
          </div>
        ) : (
          <div style={{ display:'flex', flexDirection:'column', gap:10 }}>
            {lancamentos.map(lanc => {
              const meta = STATUS_META[lanc.status] ?? { label:lanc.status, bg:'#f3f4f6', cor:'#6b7280', emoji:'❓', editavel:false }
              return (
                <div key={lanc.id} style={{
                  background:'#fff', border:`1.5px solid ${meta.editavel?'#e2e8f0':'#f1f5f9'}`,
                  borderRadius:14, overflow:'hidden',
                  boxShadow: lanc.status==='recusado'?'0 0 0 2px #fecaca, 0 2px 8px rgba(0,0,0,0.05)':'0 2px 8px rgba(0,0,0,0.05)',
                }}>
                  {/* Barra de status no topo */}
                  <div style={{ height:3, background: lanc.status==='recusado'?'#ef4444': lanc.status==='aprovado'||lanc.status==='liberado'||lanc.status==='pago'?'#22c55e': lanc.status==='aguardando_aprovacao'?'#3b82f6':'#d1d5db' }}/>

                  <div style={{ padding:'12px 14px' }}>
                    {/* Linha 1: nome + badge */}
                    <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', gap:8 }}>
                      <div style={{ flex:1, minWidth:0 }}>
                        <div style={{ display:'flex', alignItems:'center', gap:6, marginBottom:2 }}>
                          <User size={12} color="#94a3b8"/>
                          <span style={{ fontWeight:800, fontSize:14, color:'#1e293b', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
                            {lanc.colaborador_nome}
                          </span>
                          {lanc.colaborador_chapa && (
                            <span style={{ fontSize:9, background:'#eff6ff', color:'#1d4ed8', borderRadius:4, padding:'1px 5px', fontWeight:700, flexShrink:0 }}>
                              #{lanc.colaborador_chapa}
                            </span>
                          )}
                        </div>
                        <div style={{ fontSize:11, color:'#64748b', marginBottom:4 }}>
                          {lanc.funcao_nome} · <span style={{ fontWeight:600 }}>{lanc.tipo_contrato.toUpperCase()}</span>
                        </div>
                        <div style={{ display:'flex', alignItems:'center', gap:4, fontSize:11, color:'#64748b' }}>
                          <Building2 size={11} color="#94a3b8"/>
                          <span style={{ overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{lanc.obra_nome}</span>
                        </div>
                      </div>

                      {/* Badge status */}
                      <div style={{ flexShrink:0, display:'flex', flexDirection:'column', alignItems:'flex-end', gap:6 }}>
                        <span style={{ background:meta.bg, color:meta.cor, fontSize:10, fontWeight:800, borderRadius:8, padding:'3px 9px', whiteSpace:'nowrap', display:'flex', alignItems:'center', gap:3 }}>
                          <span>{meta.emoji}</span> {meta.label}
                        </span>
                      </div>
                    </div>

                    {/* Período */}
                    <div style={{ display:'flex', alignItems:'center', gap:6, marginTop:8, padding:'6px 10px', background:'#f8fafc', borderRadius:8 }}>
                      <CalendarDays size={12} color="#94a3b8"/>
                      <span style={{ fontSize:11, fontWeight:600, color:'#374151' }}>
                        {fmtData(lanc.data_inicio)} → {fmtData(lanc.data_fim)}
                      </span>
                    </div>

                    {/* Motivo de recusa */}
                    {lanc.motivo_recusa && (
                      <div style={{ marginTop:8, background:'#fef2f2', border:'1px solid #fecaca', borderRadius:8, padding:'8px 10px', display:'flex', gap:6, alignItems:'flex-start' }}>
                        <AlertTriangle size={12} color="#dc2626" style={{ flexShrink:0, marginTop:1 }}/>
                        <div>
                          <div style={{ fontSize:10, fontWeight:800, color:'#dc2626', marginBottom:2 }}>MOTIVO DE RECUSA</div>
                          <div style={{ fontSize:11, color:'#dc2626' }}>{lanc.motivo_recusa}</div>
                        </div>
                      </div>
                    )}

                    {/* Ações */}
                    <div style={{ display:'flex', gap:8, marginTop:10 }}>
                      <button onClick={() => abrirEdicao(lanc)}
                        style={{
                          flex:1, height:36, borderRadius:9, border:`2px solid ${meta.editavel?'#0d3f56':'#e2e8f0'}`,
                          background: meta.editavel?'#0d3f5610':'#f9fafb',
                          color: meta.editavel?'#0d3f56':'#9ca3af',
                          fontWeight:700, fontSize:12, cursor:'pointer',
                          display:'flex', alignItems:'center', justifyContent:'center', gap:6,
                        }}>
                        <Pencil size={13}/>
                        {meta.editavel ? 'Editar / Corrigir' : 'Visualizar'}
                      </button>
                      {meta.editavel && (
                        <button onClick={() => setConfirmDel(lanc)}
                          style={{ width:36, height:36, borderRadius:9, border:'2px solid #fecaca', background:'#fef2f2', color:'#dc2626', cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center' }}>
                          <Trash2 size={14}/>
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* ══ MODAL EDIÇÃO ═════════════════════════════════════════════════════ */}
      {editLanc && (
        <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.60)', zIndex:200, display:'flex', alignItems:'flex-end', justifyContent:'center' }}
          onClick={e => { if (e.target===e.currentTarget) setEditLanc(null) }}>
          <div style={{ background:'#fff', borderRadius:'20px 20px 0 0', width:'100%', maxWidth:480, maxHeight:'95dvh', overflowY:'auto', paddingBottom:env_bottom() }}>

            {/* ── Header sticky ── */}
            <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center',
              padding:'16px 20px 12px', borderBottom:'1px solid #f1f5f9',
              position:'sticky', top:0, background:'#fff', zIndex:10,
              boxShadow:'0 2px 8px rgba(0,0,0,0.06)' }}>
              <div>
                <div style={{ fontWeight:800, fontSize:15, color:'#1e293b' }}>
                  {STATUS_META[editLanc.status]?.editavel ? '✏️ Editar Lançamento' : '👁 Visualizar Lançamento'}
                </div>
                <div style={{ fontSize:11, color:'#64748b', marginTop:1 }}>{editLanc.colaborador_nome}</div>
              </div>
              <button onClick={() => setEditLanc(null)}
                style={{ width:34,height:34,borderRadius:50,border:'2px solid #e2e8f0',background:'#f8fafc',cursor:'pointer',display:'flex',alignItems:'center',justifyContent:'center' }}>
                <X size={16} color="#64748b"/>
              </button>
            </div>

            <div style={{ padding:'16px 20px', display:'flex', flexDirection:'column', gap:14 }}>

              {/* Alerta recusa */}
              {editLanc.motivo_recusa && (
                <div style={{ background:'#fef2f2', border:'1.5px solid #fecaca', borderRadius:10, padding:'10px 14px', display:'flex', gap:8 }}>
                  <AlertCircle size={16} color="#dc2626" style={{ flexShrink:0, marginTop:1 }}/>
                  <div>
                    <div style={{ fontSize:11, fontWeight:800, color:'#dc2626', marginBottom:3 }}>MOTIVO DE RECUSA</div>
                    <div style={{ fontSize:12, color:'#dc2626' }}>{editLanc.motivo_recusa}</div>
                  </div>
                </div>
              )}

              {/* ── Card de resumo de totais ── */}
              {!loadDias && editDias.length > 0 && (
                <div style={{ background:'linear-gradient(135deg,#0d3f56,#0a3347)', borderRadius:14, padding:'14px 16px', color:'#fff' }}>
                  <div style={{ fontSize:10, fontWeight:700, color:'rgba(255,255,255,0.6)', marginBottom:10, letterSpacing:'0.05em' }}>RESUMO DO PERÍODO</div>
                  <div style={{ display:'grid', gridTemplateColumns:'repeat(4,1fr)', gap:10 }}>
                    {[
                      { label:'Dias úteis',    val:diasUteis,         unit:'dias',  color:'rgba(255,255,255,0.9)' },
                      { label:'H. Normais',    val:fmtHH(totalHN),   unit:'horas', color:'#93c5fd' },
                      { label:'H. Extras',     val:fmtHH(totalHE),   unit:'horas', color:'#a5f3fc' },
                      { label:'Faltas',        val:totalFaltas,       unit:'dias',  color: totalFaltas>0?'#fca5a5':'rgba(255,255,255,0.9)' },
                    ].map(s => (
                      <div key={s.label} style={{ textAlign:'center' }}>
                        <div style={{ fontSize:15, fontWeight:800, color:s.color }}>{String(s.val)}</div>
                        <div style={{ fontSize:9, color:'rgba(255,255,255,0.5)', marginTop:2 }}>{s.label}</div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* ── Dados do lançamento ── */}
              <div style={{ background:'#f8fafc', border:'1px solid #e2e8f0', borderRadius:12, padding:'14px 16px' }}>
                <div style={{ fontWeight:800, fontSize:11, color:'#0d3f56', marginBottom:12, textTransform:'uppercase', letterSpacing:'0.05em' }}>
                  📋 Dados do Lançamento
                </div>
                <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10 }}>
                  <div>
                    <label style={{ fontSize:10, fontWeight:800, color:'#374151', display:'block', marginBottom:4 }}>DATA INÍCIO</label>
                    <input type="date" value={eDataIni} onChange={e => setEDataIni(e.target.value)} style={INP}
                      disabled={!STATUS_META[editLanc.status]?.editavel}/>
                  </div>
                  <div>
                    <label style={{ fontSize:10, fontWeight:800, color:'#374151', display:'block', marginBottom:4 }}>DATA FIM</label>
                    <input type="date" value={eDataFim} onChange={e => setEDataFim(e.target.value)} style={INP}
                      disabled={!STATUS_META[editLanc.status]?.editavel}/>
                  </div>
                </div>
                <div style={{ marginTop:10 }}>
                  <label style={{ fontSize:10, fontWeight:800, color:'#374151', display:'block', marginBottom:4 }}>OBRA</label>
                  <select value={eObraId} onChange={e => setEObraId(e.target.value)} style={SEL}
                    disabled={!STATUS_META[editLanc.status]?.editavel}>
                    {obrasData.map(o => <option key={o.id} value={o.id}>{o.nome}</option>)}
                  </select>
                </div>
                {STATUS_META[editLanc.status]?.editavel && (
                  <div style={{ marginTop:10 }}>
                    <label style={{ fontSize:10, fontWeight:800, color:'#374151', display:'block', marginBottom:4 }}>STATUS</label>
                    <select value={eStatus} onChange={e => setEStatus(e.target.value)} style={SEL}>
                      <option value="rascunho">📝 Rascunho</option>
                      <option value="aguardando_aprovacao">⏳ Aguardando Aprovação</option>
                    </select>
                  </div>
                )}
                <div style={{ marginTop:10 }}>
                  <label style={{ fontSize:10, fontWeight:800, color:'#374151', display:'block', marginBottom:4 }}>OBSERVAÇÕES</label>
                  <textarea value={eObs} onChange={e => setEObs(e.target.value)} rows={2}
                    placeholder="Obs. do lançamento…" disabled={!STATUS_META[editLanc.status]?.editavel}
                    style={{ ...INP, height:'auto', padding:'8px 12px', resize:'vertical', lineHeight:1.6 }}/>
                </div>
              </div>

              {/* ── Registro diário ── */}
              <div>
                <button onClick={() => setDiasAbertos(v => !v)}
                  style={{ width:'100%', display:'flex', alignItems:'center', justifyContent:'space-between', background:'none', border:'none', cursor:'pointer', padding:0, marginBottom:10 }}>
                  <span style={{ fontWeight:800, fontSize:11, color:'#0d3f56', textTransform:'uppercase', letterSpacing:'0.05em' }}>
                    📅 Registro Diário ({editDias.length} dias)
                  </span>
                  {diasAbertos ? <ChevronUp size={16} color="#94a3b8"/> : <ChevronDown size={16} color="#94a3b8"/>}
                </button>

                {diasAbertos && (loadDias ? (
                  <div style={{ textAlign:'center', padding:'20px 0', color:'#6b7280' }}>
                    <Loader2 size={20} className="animate-spin" style={{ display:'block', margin:'0 auto 6px' }}/>
                    <div style={{ fontSize:12 }}>Carregando dias…</div>
                  </div>
                ) : (
                  <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
                    {editDias.map((dia, idx) => {
                      const dt  = new Date(dia.data + 'T12:00:00')
                      const dow = dt.getDay()
                      const ehDom = dow === 0
                      const ehSab = dow === 6
                      const nome  = DIAS_SEM[dow]
                      return (
                        <div key={dia.data} style={{
                          background: dia.falta?'#fef2f2': ehDom?'#f3f4f6': ehSab?'#fefce8':'#f8fafc',
                          border:`1px solid ${dia.falta?'#fecaca': ehDom?'#d1d5db': ehSab?'#fde68a':'#e2e8f0'}`,
                          borderRadius:10, padding:'10px 12px',
                        }}>
                          {/* Topo: data + toggle falta */}
                          <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom: dia.falta?0:8 }}>
                            <div style={{ display:'flex', alignItems:'center', gap:8 }}>
                              <span style={{ fontWeight:800, fontSize:14, color:'#1e293b' }}>
                                {dt.toLocaleDateString('pt-BR',{day:'2-digit',month:'2-digit'})}
                              </span>
                              <span style={{ fontSize:10, fontWeight:700, borderRadius:5, padding:'2px 7px',
                                background: ehDom?'#e5e7eb': ehSab?'#fef9c3':'#eff6ff',
                                color: ehDom?'#6b7280': ehSab?'#92400e':'#1d4ed8' }}>{nome}</span>
                              {dia.horas_trabalhadas>0 && !dia.falta && (
                                <span style={{ fontSize:10, fontWeight:600, color:'#1d4ed8' }}>{fmtHH(dia.horas_trabalhadas)}h</span>
                              )}
                            </div>

                            {/* Toggle falta */}
                            {STATUS_META[editLanc!.status]?.editavel && (
                              <label style={{ display:'flex', alignItems:'center', gap:5, cursor:'pointer' }}>
                                <span style={{ fontSize:10, fontWeight:700, color: dia.falta?'#dc2626':'#94a3b8' }}>
                                  {dia.falta ? '🔴 Falta' : 'Falta?'}
                                </span>
                                <div onClick={() => setDia(idx,'falta',!dia.falta)}
                                  style={{ width:38, height:22, borderRadius:11, cursor:'pointer',
                                    background: dia.falta?'#ef4444':'#d1d5db', position:'relative', transition:'background 0.2s' }}>
                                  <div style={{ position:'absolute', top:3,
                                    left: dia.falta?19:3,
                                    width:16, height:16, borderRadius:'50%',
                                    background:'#fff', transition:'left 0.2s',
                                    boxShadow:'0 1px 3px rgba(0,0,0,0.2)' }}/>
                                </div>
                              </label>
                            )}
                          </div>

                          {/* Horas — só se não for falta */}
                          {!dia.falta && (
                            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:8, marginBottom:8 }}>
                              <div>
                                <label style={{ fontSize:9, fontWeight:800, color:'#1d4ed8', display:'block', marginBottom:3, letterSpacing:'0.03em' }}>⏱ H. NORMAIS</label>
                                <input type="number" min={0} max={24} step={0.5}
                                  value={dia.horas_trabalhadas || ''}
                                  onChange={e => setDia(idx,'horas_trabalhadas', parseFloat(e.target.value)||0)}
                                  placeholder="0"
                                  disabled={!STATUS_META[editLanc!.status]?.editavel}
                                  style={{ ...INP, height:38, fontSize:15, fontWeight:800, textAlign:'center', color:'#1d4ed8' }}/>
                              </div>
                              <div>
                                <label style={{ fontSize:9, fontWeight:800, color:'#7c3aed', display:'block', marginBottom:3, letterSpacing:'0.03em' }}>⚡ H. EXTRAS</label>
                                <input type="number" min={0} max={12} step={0.5}
                                  value={dia.horas_extras || ''}
                                  onChange={e => setDia(idx,'horas_extras', parseFloat(e.target.value)||0)}
                                  placeholder="0"
                                  disabled={!STATUS_META[editLanc!.status]?.editavel}
                                  style={{ ...INP, height:38, fontSize:15, fontWeight:800, textAlign:'center', color:'#7c3aed' }}/>
                              </div>
                            </div>
                          )}

                          {/* Obs do dia */}
                          {STATUS_META[editLanc!.status]?.editavel && (
                            <input type="text" value={dia.observacoes}
                              onChange={e => setDia(idx,'observacoes',e.target.value)}
                              placeholder="Observação do dia (opcional)"
                              style={{ ...INP, height:34, fontSize:11, color:'#374151' }}/>
                          )}
                        </div>
                      )
                    })}
                  </div>
                ))}
              </div>

              {/* Erros e feedback */}
              {saveErro && (
                <div style={{ background:'#fef2f2', border:'1px solid #fecaca', borderRadius:10, padding:'10px 14px', display:'flex', gap:8 }}>
                  <AlertCircle size={15} color="#dc2626" style={{ flexShrink:0 }}/>
                  <span style={{ fontSize:12, color:'#dc2626' }}>{saveErro}</span>
                </div>
              )}
              {saveOk && (
                <div style={{ background:'#f0fdf4', border:'1px solid #bbf7d0', borderRadius:10, padding:'10px 14px', display:'flex', gap:8, alignItems:'center' }}>
                  <CheckCircle2 size={15} color="#22c55e"/>
                  <span style={{ fontSize:12, fontWeight:700, color:'#16a34a' }}>Salvo com sucesso! Fechando…</span>
                </div>
              )}

              {/* Botões */}
              {STATUS_META[editLanc.status]?.editavel && (
                <div style={{ display:'flex', gap:10, paddingTop:4 }}>
                  <button onClick={() => setEditLanc(null)}
                    style={{ flex:1, height:48, borderRadius:12, border:'2px solid #e2e8f0', background:'#f8fafc', color:'#374151', fontWeight:700, fontSize:13, cursor:'pointer' }}>
                    Cancelar
                  </button>
                  <button onClick={salvarEdicao} disabled={saving || saveOk}
                    style={{ flex:2, height:48, borderRadius:12, border:'none',
                      background: saving||saveOk?'#94a3b8':'#0d3f56',
                      color:'#fff', fontWeight:800, fontSize:14, cursor: saving||saveOk?'not-allowed':'pointer',
                      display:'flex', alignItems:'center', justifyContent:'center', gap:8 }}>
                    {saving ? <><Loader2 size={16} className="animate-spin"/>Salvando…</>
                     : saveOk ? <>✅ Salvo!</>
                     : <><Save size={16}/>Salvar Alterações</>}
                  </button>
                </div>
              )}
              {!STATUS_META[editLanc.status]?.editavel && (
                <button onClick={() => setEditLanc(null)}
                  style={{ width:'100%', height:48, borderRadius:12, border:'2px solid #e2e8f0', background:'#f8fafc', color:'#374151', fontWeight:700, fontSize:14, cursor:'pointer' }}>
                  Fechar
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ══ CONFIRM EXCLUSÃO ═════════════════════════════════════════════════ */}
      {confirmDel && (
        <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.60)', zIndex:300, display:'flex', alignItems:'center', justifyContent:'center', padding:20 }}>
          <div style={{ background:'#fff', borderRadius:20, padding:'28px 24px', maxWidth:360, width:'100%', boxShadow:'0 20px 60px rgba(0,0,0,0.30)' }}>
            <div style={{ fontSize:40, textAlign:'center', marginBottom:12 }}>🗑️</div>
            <div style={{ fontWeight:800, fontSize:17, textAlign:'center', color:'#1e293b', marginBottom:6 }}>Excluir Lançamento?</div>
            <div style={{ fontSize:13, color:'#64748b', textAlign:'center', marginBottom:4 }}>{confirmDel.colaborador_nome}</div>
            <div style={{ fontSize:12, color:'#94a3b8', textAlign:'center', marginBottom:16 }}>
              {fmtData(confirmDel.data_inicio)} → {fmtData(confirmDel.data_fim)}
            </div>
            <div style={{ background:'#fff7ed', border:'1px solid #fed7aa', borderRadius:10, padding:'10px 14px', fontSize:12, color:'#9a3412', marginBottom:20, display:'flex', gap:8 }}>
              <AlertTriangle size={14} color="#f97316" style={{ flexShrink:0, marginTop:1 }}/>
              <span>Todos os registros de horas e produção serão excluídos permanentemente.</span>
            </div>
            <div style={{ display:'flex', gap:10 }}>
              <button onClick={() => setConfirmDel(null)}
                style={{ flex:1, height:46, borderRadius:12, border:'2px solid #e2e8f0', background:'#f8fafc', fontWeight:700, fontSize:13, cursor:'pointer' }}>
                Cancelar
              </button>
              <button onClick={excluirLanc} disabled={deleting}
                style={{ flex:1, height:46, borderRadius:12, border:'none', background:deleting?'#94a3b8':'#ef4444', color:'#fff', fontWeight:800, fontSize:13, cursor:deleting?'not-allowed':'pointer' }}>
                {deleting ? 'Excluindo…' : 'Excluir'}
              </button>
            </div>
          </div>
        </div>
      )}
    </PortalLayout>
  )
}

function env_bottom() { return 'env(safe-area-inset-bottom, 24px)' }
