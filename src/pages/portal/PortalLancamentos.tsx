import React, { useEffect, useState, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '@/lib/supabase'
import { getPortalSession } from '@/hooks/usePortalAuth'
import PortalLayout from './PortalLayout'
import {
  Pencil, Trash2, ChevronDown, ChevronUp, Loader2,
  CheckCircle2, Clock, AlertTriangle, X, Plus, Save,
  CalendarDays, Building2, User,
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
  // campos editáveis extras
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

const STATUS_BADGE: Record<string,{label:string;bg:string;cor:string}> = {
  rascunho:            { label:'Rascunho',      bg:'#f3f4f6', cor:'#6b7280' },
  em_fechamento:       { label:'Em Fechamento', bg:'#fef3c7', cor:'#b45309' },
  aguardando_aprovacao:{ label:'Aguardando',    bg:'#dbeafe', cor:'#1d4ed8' },
  aprovado:            { label:'Aprovado',      bg:'#dcfce7', cor:'#15803d' },
  liberado:            { label:'Liberado',      bg:'#d1fae5', cor:'#059669' },
  pago:                { label:'Pago',          bg:'#f0fdf4', cor:'#166534' },
  recusado:            { label:'Recusado',      bg:'#fee2e2', cor:'#dc2626' },
}

function fmtData(s: string) {
  if (!s) return '—'
  const [y,m,d] = s.split('-')
  return `${d}/${m}/${y}`
}
function fmtHH(h: number) {
  const hh = Math.floor(h)
  const mm = Math.round((h - hh) * 60)
  return `${String(hh).padStart(2,'0')}:${String(mm).padStart(2,'0')}`
}

// ─── Componente ──────────────────────────────────────────────────────────────
export default function PortalLancamentos() {
  const nav     = useNavigate()
  const session = getPortalSession()
  const obras   = session?.obras_ids ?? []

  // Filtros
  const hoje = new Date()
  const [ano, setAno]     = useState(hoje.getFullYear())
  const [mes, setMes]     = useState(hoje.getMonth() + 1)
  const [obraId, setObraId] = useState(obras[0] ?? '')
  const [obrasData, setObrasData] = useState<{id:string;nome:string}[]>([])

  // Lista
  const [lancamentos, setLancamentos] = useState<LancItem[]>([])
  const [loading, setLoading]         = useState(false)

  // Modal de edição
  const [editLanc, setEditLanc]   = useState<LancItem | null>(null)
  const [editDias, setEditDias]   = useState<DiaPonto[]>([])
  const [loadDias, setLoadDias]   = useState(false)
  const [saving, setSaving]       = useState(false)
  const [confirmDel, setConfirmDel] = useState<LancItem | null>(null)
  const [deleting, setDeleting]   = useState(false)

  // Campos editáveis do lançamento
  const [eDataIni, setEDataIni]   = useState('')
  const [eDataFim, setEDataFim]   = useState('')
  const [eObraId,  setEObraId]    = useState('')
  const [eObs,     setEObs]       = useState('')
  const [eStatus,  setEStatus]    = useState('')

  const mesRef = `${ano}-${String(mes).padStart(2,'0')}`

  // ── Obras ──────────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!session) { nav('/portal'); return }
    supabase.from('obras').select('id,nome')
      .in('id', obras.length ? obras : ['__none'])
      .in('status', ['ativo','em_andamento','andamento','ativo_com_pendencias'])
      .order('nome')
      .then(({ data }) => {
        if (data) {
          setObrasData(data)
          if (!obraId && data.length) setObraId(data[0].id)
        }
      })
  }, [])

  // ── Fetch lançamentos ──────────────────────────────────────────────────────
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
    setEditDias([])
    setLoadDias(true)

    const { data } = await supabase
      .from('registro_ponto')
      .select('id,data,horas_trabalhadas,horas_extras,falta,observacoes')
      .eq('lancamento_id', lanc.id)
      .order('data')

    const diasGerados: DiaPonto[] = []
    const cur = new Date(lanc.data_inicio + 'T12:00:00')
    const fim = new Date(lanc.data_fim   + 'T12:00:00')
    while (cur <= fim) {
      const ds = cur.toISOString().slice(0,10)
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

  // ── Atualizar dia no estado local ─────────────────────────────────────────
  function setDia(idx: number, field: keyof DiaPonto, val: any) {
    setEditDias(prev => prev.map((d,i) => i === idx ? { ...d, [field]: val } : d))
  }

  // ── Salvar edição ─────────────────────────────────────────────────────────
  async function salvarEdicao() {
    if (!editLanc) return
    setSaving(true)

    // 1. Atualizar ponto_lancamentos
    const { error: errLanc } = await supabase
      .from('ponto_lancamentos')
      .update({
        data_inicio:   eDataIni,
        data_fim:      eDataFim,
        obra_id:       eObraId,
        status:        eStatus,
        observacoes:   eObs || null,
      })
      .eq('id', editLanc.id)

    if (errLanc) { alert('Erro ao salvar lançamento: ' + errLanc.message); setSaving(false); return }

    // 2. Upsert cada dia em registro_ponto
    for (const dia of editDias) {
      const payload = {
        lancamento_id:     editLanc.id,
        colaborador_id:    editLanc.colaborador_id,
        obra_id:           eObraId,
        data:              dia.data,
        horas_trabalhadas: dia.horas_trabalhadas,
        horas_extras:      dia.horas_extras,
        falta:             dia.falta,
        observacoes:       dia.observacoes || null,
      }
      if (dia.id) {
        await supabase.from('registro_ponto').update(payload).eq('id', dia.id)
      } else {
        // Só inserir se houver horas ou falta marcada
        if (dia.horas_trabalhadas > 0 || dia.horas_extras > 0 || dia.falta) {
          const { data: inserted } = await supabase.from('registro_ponto').insert(payload).select('id').single()
          if (inserted) {
            setEditDias(prev => prev.map(d => d.data === dia.data ? { ...d, id: inserted.id } : d))
          }
        }
      }
    }

    setSaving(false)
    await fetchLancs()
    setEditLanc(null)
  }

  // ── Excluir lançamento ────────────────────────────────────────────────────
  async function excluirLanc() {
    if (!confirmDel) return
    setDeleting(true)
    // Apaga registros de ponto e produção primeiro
    await supabase.from('registro_ponto').delete().eq('lancamento_id', confirmDel.id)
    await supabase.from('ponto_producao').delete().eq('lancamento_id', confirmDel.id)
    await supabase.from('ponto_lancamentos').delete().eq('id', confirmDel.id)
    setDeleting(false)
    setConfirmDel(null)
    await fetchLancs()
  }

  // ── Helpers visuais ───────────────────────────────────────────────────────
  const INP: React.CSSProperties = {
    width:'100%', height:40, border:'2px solid #e5e7eb', borderRadius:8,
    padding:'0 12px', fontSize:13, boxSizing:'border-box', background:'#fff',
  }
  const SEL: React.CSSProperties = { ...INP, cursor:'pointer' }
  const DIAS_SEMANA = ['Dom','Seg','Ter','Qua','Qui','Sex','Sáb']

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <PortalLayout>
      <div style={{ padding:'16px 16px 32px', display:'flex', flexDirection:'column', gap:14 }}>

        {/* Título */}
        <div style={{ display:'flex', alignItems:'center', gap:10 }}>
          <div style={{ width:38,height:38,borderRadius:10,background:'#1e3a5f',
            display:'flex',alignItems:'center',justifyContent:'center' }}>
            <CalendarDays size={20} color="#fff"/>
          </div>
          <div>
            <div style={{ fontWeight:800, fontSize:16, color:'#1e3a5f' }}>Lançamentos de Ponto</div>
            <div style={{ fontSize:11, color:'#6b7280' }}>Visualize e edite os lançamentos da obra</div>
          </div>
        </div>

        {/* Filtros */}
        <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:8 }}>
          <div>
            <label style={{ fontSize:11, fontWeight:700, color:'#374151', display:'block', marginBottom:4 }}>MÊS</label>
            <select value={mes} onChange={e => setMes(Number(e.target.value))} style={SEL}>
              {MESES.map((m,i) => <option key={i} value={i+1}>{m}</option>)}
            </select>
          </div>
          <div>
            <label style={{ fontSize:11, fontWeight:700, color:'#374151', display:'block', marginBottom:4 }}>ANO</label>
            <select value={ano} onChange={e => setAno(Number(e.target.value))} style={SEL}>
              {[2024,2025,2026,2027].map(y => <option key={y} value={y}>{y}</option>)}
            </select>
          </div>
        </div>
        <div>
          <label style={{ fontSize:11, fontWeight:700, color:'#374151', display:'block', marginBottom:4 }}>OBRA</label>
          <select value={obraId} onChange={e => setObraId(e.target.value)} style={SEL}>
            <option value="">Todas as obras</option>
            {obrasData.map(o => <option key={o.id} value={o.id}>{o.nome}</option>)}
          </select>
        </div>

        {/* Lista de lançamentos */}
        {loading ? (
          <div style={{ textAlign:'center', padding:'30px 0', color:'#6b7280' }}>
            <Loader2 size={24} className="animate-spin" style={{ margin:'0 auto 8px', display:'block' }}/>
            <div style={{ fontSize:13 }}>Carregando…</div>
          </div>
        ) : lancamentos.length === 0 ? (
          <div style={{ textAlign:'center', padding:'30px 16px', background:'#f9fafb',
            border:'2px dashed #e5e7eb', borderRadius:12, color:'#9ca3af' }}>
            <CalendarDays size={32} style={{ margin:'0 auto 8px', display:'block', opacity:0.4 }}/>
            <div style={{ fontWeight:700, marginBottom:4 }}>Nenhum lançamento</div>
            <div style={{ fontSize:12 }}>Não há lançamentos para {MESES[mes-1]}/{ano} nesta obra.</div>
          </div>
        ) : (
          <div style={{ display:'flex', flexDirection:'column', gap:10 }}>
            {/* Contador */}
            <div style={{ fontSize:12, color:'#6b7280', fontWeight:600 }}>
              {lancamentos.length} lançamento{lancamentos.length !== 1 ? 's':''}
            </div>

            {lancamentos.map(lanc => {
              const badge = STATUS_BADGE[lanc.status] ?? { label: lanc.status, bg:'#f3f4f6', cor:'#6b7280' }
              const podeditar = ['rascunho','recusado','aguardando_aprovacao'].includes(lanc.status)
              return (
                <div key={lanc.id} style={{
                  background:'#fff', border:'1px solid #e5e7eb', borderRadius:12,
                  overflow:'hidden', boxShadow:'0 1px 4px rgba(0,0,0,0.06)',
                }}>
                  {/* Cabeçalho do card */}
                  <div style={{ padding:'12px 14px', display:'flex', justifyContent:'space-between', alignItems:'flex-start' }}>
                    <div style={{ flex:1, minWidth:0 }}>
                      <div style={{ display:'flex', alignItems:'center', gap:6, marginBottom:3 }}>
                        <User size={12} color="#6b7280"/>
                        <span style={{ fontWeight:700, fontSize:13, color:'#1e3a5f', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
                          {lanc.colaborador_nome}
                        </span>
                        {lanc.colaborador_chapa && (
                          <span style={{ fontSize:10, background:'#eff6ff', color:'#1d4ed8', borderRadius:4, padding:'1px 5px', fontWeight:600 }}>
                            {lanc.colaborador_chapa}
                          </span>
                        )}
                      </div>
                      <div style={{ fontSize:11, color:'#6b7280', marginBottom:4 }}>
                        {lanc.funcao_nome} · {lanc.tipo_contrato.toUpperCase()}
                      </div>
                      <div style={{ display:'flex', alignItems:'center', gap:5, fontSize:11, color:'#374151' }}>
                        <Building2 size={11} color="#6b7280"/>
                        <span style={{ overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{lanc.obra_nome}</span>
                      </div>
                      <div style={{ fontSize:11, color:'#6b7280', marginTop:3 }}>
                        📅 {fmtData(lanc.data_inicio)} → {fmtData(lanc.data_fim)}
                      </div>
                      {lanc.motivo_recusa && (
                        <div style={{ fontSize:11, background:'#fee2e2', color:'#dc2626', borderRadius:6,
                          padding:'4px 8px', marginTop:6, display:'flex', gap:5, alignItems:'flex-start' }}>
                          <AlertTriangle size={11} style={{ flexShrink:0, marginTop:1 }}/>
                          <span>{lanc.motivo_recusa}</span>
                        </div>
                      )}
                    </div>

                    {/* Badge status + ações */}
                    <div style={{ display:'flex', flexDirection:'column', alignItems:'flex-end', gap:8, marginLeft:8 }}>
                      <span style={{ background:badge.bg, color:badge.cor, fontSize:10, fontWeight:700,
                        borderRadius:6, padding:'3px 8px', whiteSpace:'nowrap' }}>
                        {badge.label}
                      </span>
                      <div style={{ display:'flex', gap:6 }}>
                        <button onClick={() => abrirEdicao(lanc)} title="Editar"
                          style={{ width:30, height:30, borderRadius:8, border:'2px solid #1d4ed8',
                            background:podeditar?'#eff6ff':'#f9fafb', color: podeditar?'#1d4ed8':'#9ca3af',
                            display:'flex', alignItems:'center', justifyContent:'center', cursor:'pointer' }}>
                          <Pencil size={13}/>
                        </button>
                        {podeditar && (
                          <button onClick={() => setConfirmDel(lanc)} title="Excluir"
                            style={{ width:30, height:30, borderRadius:8, border:'2px solid #dc2626',
                              background:'#fef2f2', color:'#dc2626',
                              display:'flex', alignItems:'center', justifyContent:'center', cursor:'pointer' }}>
                            <Trash2 size={13}/>
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* ══════════════════════════════════════════════════════════════════════
           MODAL EDIÇÃO DE LANÇAMENTO
      ══════════════════════════════════════════════════════════════════════ */}
      {editLanc && (
        <div style={{
          position:'fixed', inset:0, background:'rgba(0,0,0,0.55)', zIndex:200,
          display:'flex', alignItems:'flex-end', justifyContent:'center',
        }} onClick={e => { if (e.target===e.currentTarget) setEditLanc(null) }}>
          <div style={{
            background:'#fff', borderRadius:'18px 18px 0 0', width:'100%', maxWidth:480,
            maxHeight:'92dvh', overflowY:'auto', paddingBottom:32,
          }}>

            {/* Header */}
            <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center',
              padding:'16px 20px 12px', borderBottom:'1px solid #e5e7eb', position:'sticky', top:0, background:'#fff', zIndex:10 }}>
              <div>
                <div style={{ fontWeight:800, fontSize:15, color:'#1e3a5f' }}>✏️ Editar Lançamento</div>
                <div style={{ fontSize:11, color:'#6b7280', marginTop:2 }}>{editLanc.colaborador_nome}</div>
              </div>
              <button onClick={() => setEditLanc(null)} style={{
                width:34, height:34, borderRadius:50, border:'2px solid #e5e7eb',
                background:'#f9fafb', cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center',
              }}><X size={16} color="#6b7280"/></button>
            </div>

            <div style={{ padding:'16px 20px', display:'flex', flexDirection:'column', gap:14 }}>

              {/* ── Dados do lançamento ── */}
              <div style={{ background:'#f8fafc', border:'1px solid #e2e8f0', borderRadius:10, padding:'12px 14px' }}>
                <div style={{ fontWeight:700, fontSize:12, color:'#1e3a5f', marginBottom:10, textTransform:'uppercase', letterSpacing:0.5 }}>
                  📋 Dados do Lançamento
                </div>
                <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10 }}>
                  <div>
                    <label style={{ fontSize:11, fontWeight:700, color:'#374151', display:'block', marginBottom:4 }}>DATA INÍCIO</label>
                    <input type="date" value={eDataIni} onChange={e=>setEDataIni(e.target.value)} style={INP}/>
                  </div>
                  <div>
                    <label style={{ fontSize:11, fontWeight:700, color:'#374151', display:'block', marginBottom:4 }}>DATA FIM</label>
                    <input type="date" value={eDataFim} onChange={e=>setEDataFim(e.target.value)} style={INP}/>
                  </div>
                </div>
                <div style={{ marginTop:10 }}>
                  <label style={{ fontSize:11, fontWeight:700, color:'#374151', display:'block', marginBottom:4 }}>OBRA</label>
                  <select value={eObraId} onChange={e=>setEObraId(e.target.value)} style={SEL}>
                    {obrasData.map(o => <option key={o.id} value={o.id}>{o.nome}</option>)}
                  </select>
                </div>
                <div style={{ marginTop:10 }}>
                  <label style={{ fontSize:11, fontWeight:700, color:'#374151', display:'block', marginBottom:4 }}>STATUS</label>
                  <select value={eStatus} onChange={e=>setEStatus(e.target.value)} style={SEL}>
                    <option value="rascunho">Rascunho</option>
                    <option value="aguardando_aprovacao">Aguardando Aprovação</option>
                    <option value="em_fechamento">Em Fechamento</option>
                    <option value="recusado">Recusado</option>
                  </select>
                </div>
                <div style={{ marginTop:10 }}>
                  <label style={{ fontSize:11, fontWeight:700, color:'#374151', display:'block', marginBottom:4 }}>OBSERVAÇÕES</label>
                  <textarea value={eObs} onChange={e=>setEObs(e.target.value)} rows={2}
                    placeholder="Obs. do lançamento…"
                    style={{ ...INP, height:'auto', padding:'8px 12px', resize:'vertical', lineHeight:1.5 }}/>
                </div>
              </div>

              {/* ── Registro diário ── */}
              <div>
                <div style={{ fontWeight:700, fontSize:12, color:'#1e3a5f', marginBottom:10, textTransform:'uppercase', letterSpacing:0.5 }}>
                  📅 Registro Diário
                </div>

                {loadDias ? (
                  <div style={{ textAlign:'center', padding:'20px 0', color:'#6b7280' }}>
                    <Loader2 size={20} className="animate-spin" style={{ display:'block', margin:'0 auto 6px' }}/>
                    <div style={{ fontSize:12 }}>Carregando dias…</div>
                  </div>
                ) : (
                  <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
                    {editDias.map((dia, idx) => {
                      const dt = new Date(dia.data + 'T12:00:00')
                      const dow = dt.getDay()
                      const ehDom = dow === 0
                      const ehSab = dow === 6
                      const nomeDia = DIAS_SEMANA[dow]
                      const bgCard = dia.falta
                        ? '#fef2f2'
                        : ehDom ? '#f3f4f6'
                        : ehSab ? '#fefce8'
                        : '#f8fafc'
                      const borderCard = dia.falta
                        ? '#fecaca'
                        : ehDom ? '#d1d5db'
                        : ehSab ? '#fde68a'
                        : '#e2e8f0'
                      return (
                        <div key={dia.data} style={{
                          background:bgCard, border:`1px solid ${borderCard}`,
                          borderRadius:10, padding:'10px 12px',
                        }}>
                          {/* Linha topo: data + dia semana + toggle falta */}
                          <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:8 }}>
                            <div style={{ display:'flex', alignItems:'center', gap:8 }}>
                              <span style={{ fontWeight:800, fontSize:13, color:'#1e3a5f' }}>
                                {dt.toLocaleDateString('pt-BR',{day:'2-digit',month:'2-digit'})}
                              </span>
                              <span style={{
                                fontSize:10, fontWeight:700, borderRadius:5, padding:'2px 7px',
                                background: ehDom?'#e5e7eb': ehSab?'#fef9c3':'#eff6ff',
                                color: ehDom?'#6b7280': ehSab?'#92400e':'#1d4ed8',
                              }}>{nomeDia}</span>
                            </div>
                            {/* Toggle Falta */}
                            <label style={{ display:'flex', alignItems:'center', gap:5, cursor:'pointer' }}>
                              <span style={{ fontSize:11, fontWeight:600, color: dia.falta?'#dc2626':'#6b7280' }}>
                                {dia.falta ? '🔴 Falta' : 'Falta?'}
                              </span>
                              <div
                                onClick={() => setDia(idx, 'falta', !dia.falta)}
                                style={{
                                  width:36, height:20, borderRadius:10, cursor:'pointer',
                                  background: dia.falta ? '#dc2626' : '#d1d5db',
                                  position:'relative', transition:'background 0.2s',
                                }}>
                                <div style={{
                                  position:'absolute', top:2,
                                  left: dia.falta ? 18 : 2,
                                  width:16, height:16, borderRadius:'50%',
                                  background:'#fff', transition:'left 0.2s',
                                  boxShadow:'0 1px 3px rgba(0,0,0,0.2)',
                                }}/>
                              </div>
                            </label>
                          </div>

                          {/* Horas normais + extras — desabilitado se falta */}
                          {!dia.falta && (
                            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:8, marginBottom:8 }}>
                              <div>
                                <label style={{ fontSize:10, fontWeight:700, color:'#374151', display:'block', marginBottom:3 }}>H. NORMAIS</label>
                                <input
                                  type="number" min={0} max={24} step={0.5}
                                  value={dia.horas_trabalhadas || ''}
                                  onChange={e => setDia(idx,'horas_trabalhadas', parseFloat(e.target.value)||0)}
                                  placeholder="0"
                                  style={{ ...INP, height:36, fontSize:14, fontWeight:700, textAlign:'center', color:'#1d4ed8' }}
                                />
                              </div>
                              <div>
                                <label style={{ fontSize:10, fontWeight:700, color:'#374151', display:'block', marginBottom:3 }}>H. EXTRAS</label>
                                <input
                                  type="number" min={0} max={12} step={0.5}
                                  value={dia.horas_extras || ''}
                                  onChange={e => setDia(idx,'horas_extras', parseFloat(e.target.value)||0)}
                                  placeholder="0"
                                  style={{ ...INP, height:36, fontSize:14, fontWeight:700, textAlign:'center', color:'#7c3aed' }}
                                />
                              </div>
                            </div>
                          )}

                          {/* Observação do dia */}
                          <input
                            type="text"
                            value={dia.observacoes}
                            onChange={e => setDia(idx,'observacoes', e.target.value)}
                            placeholder="Obs. do dia (opcional)"
                            style={{ ...INP, height:34, fontSize:12, color:'#374151' }}
                          />
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>

              {/* Botões */}
              <div style={{ display:'flex', gap:10, paddingTop:4 }}>
                <button onClick={() => setEditLanc(null)} style={{
                  flex:1, height:46, borderRadius:10, border:'2px solid #e5e7eb',
                  background:'#f9fafb', color:'#374151', fontWeight:700, fontSize:13, cursor:'pointer',
                }}>Cancelar</button>
                <button onClick={salvarEdicao} disabled={saving} style={{
                  flex:2, height:46, borderRadius:10, border:'none',
                  background: saving ? '#94a3b8' : '#1e3a5f',
                  color:'#fff', fontWeight:800, fontSize:14, cursor: saving?'not-allowed':'pointer',
                  display:'flex', alignItems:'center', justifyContent:'center', gap:8,
                }}>
                  {saving ? <><Loader2 size={16} className="animate-spin"/>Salvando…</> : <><Save size={16}/>Salvar Alterações</>}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════════════
           CONFIRM EXCLUSÃO
      ══════════════════════════════════════════════════════════════════════ */}
      {confirmDel && (
        <div style={{
          position:'fixed', inset:0, background:'rgba(0,0,0,0.55)', zIndex:300,
          display:'flex', alignItems:'center', justifyContent:'center', padding:24,
        }}>
          <div style={{ background:'#fff', borderRadius:16, padding:24, maxWidth:360, width:'100%' }}>
            <div style={{ fontSize:32, textAlign:'center', marginBottom:12 }}>🗑</div>
            <div style={{ fontWeight:800, fontSize:16, textAlign:'center', color:'#1e3a5f', marginBottom:8 }}>
              Excluir Lançamento?
            </div>
            <div style={{ fontSize:13, color:'#6b7280', textAlign:'center', marginBottom:6 }}>
              {confirmDel.colaborador_nome}
            </div>
            <div style={{ fontSize:12, color:'#6b7280', textAlign:'center', marginBottom:18 }}>
              {fmtData(confirmDel.data_inicio)} → {fmtData(confirmDel.data_fim)}
            </div>
            <div style={{ background:'#fff7ed', border:'1px solid #fed7aa', borderRadius:8, padding:'8px 12px',
              fontSize:12, color:'#9a3412', marginBottom:18 }}>
              ⚠️ Todos os registros de horas e produção deste período serão excluídos permanentemente.
            </div>
            <div style={{ display:'flex', gap:10 }}>
              <button onClick={() => setConfirmDel(null)} style={{
                flex:1, height:44, borderRadius:10, border:'2px solid #e5e7eb',
                background:'#f9fafb', fontWeight:700, fontSize:13, cursor:'pointer',
              }}>Cancelar</button>
              <button onClick={excluirLanc} disabled={deleting} style={{
                flex:1, height:44, borderRadius:10, border:'none',
                background: deleting ? '#94a3b8' : '#dc2626',
                color:'#fff', fontWeight:800, fontSize:13, cursor: deleting?'not-allowed':'pointer',
              }}>
                {deleting ? 'Excluindo…' : '🗑 Confirmar'}
              </button>
            </div>
          </div>
        </div>
      )}
    </PortalLayout>
  )
}
