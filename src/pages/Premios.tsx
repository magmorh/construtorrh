import React, { useEffect, useState, useCallback, useMemo } from 'react'
import { useRefreshOnFocus } from '@/hooks/useRefreshOnFocus'
import { supabase } from '@/lib/supabase'
import { formatCurrency } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { SearchableSelect } from '@/components/ui/searchable-select'
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { toast } from 'sonner'
import {
  Gift, Plus, Search, Pencil, Trash2, ChevronLeft, ChevronRight,
  RefreshCw, CheckCircle2, XCircle, Trophy,
} from 'lucide-react'

// ─── tipos ───────────────────────────────────────────────────────────────────
type PremioRow = {
  id: string
  colaborador_id: string
  obra_id: string | null
  tipo: string | null
  descricao: string
  valor: number | null
  data: string
  competencia: string | null
  observacoes: string | null
  status: string
  pagamento_id: string | null
  colaboradores?: { nome: string; chapa: string | null }
  obras?: { nome: string } | null
}

type FormData = {
  colaborador_id: string
  obra_id: string
  tipo: string
  descricao: string
  valor: string
  data: string
  competencia: string
  observacoes: string
}

const TIPO_OPTIONS = ['Produtividade','Assiduidade','Segurança','Desempenho','Tempo de serviço','Outros']
const TIPO_EMOJI: Record<string, string> = {
  Produtividade: '⚡', Assiduidade: '📅', Segurança: '🦺',
  Desempenho: '🏆', 'Tempo de serviço': '⏱️', Outros: '🎁',
}

const MESES = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro']
function mesLabel(ym: string) { if (!ym) return '—'; const [y,m] = ym.split('-'); return `${MESES[+m-1]} / ${y}` }
function prevMes(ym: string) { const [y,m] = ym.split('-').map(Number); const d = new Date(y,m-2,1); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}` }
function nextMes(ym: string) { const [y,m] = ym.split('-').map(Number); const d = new Date(y,m,1); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}` }
function formatDate(d: string) { if (!d) return '—'; const [y,mo,day] = d.split('-'); return `${day}/${mo}/${y}` }

const STATUS_COR: Record<string,{bg:string;border:string;cor:string;label:string}> = {
  pendente:  { bg:'#fef3c7', border:'#fde68a', cor:'#b45309', label:'⏳ Pendente'  },
  aprovado:  { bg:'#dcfce7', border:'#bbf7d0', cor:'#15803d', label:'✅ Aprovado'  },
  pago:      { bg:'#eff6ff', border:'#bfdbfe', cor:'#1d4ed8', label:'💳 Pago'      },
  cancelado: { bg:'#fee2e2', border:'#fecaca', cor:'#dc2626', label:'❌ Cancelado' },
}

const EMPTY_FORM: FormData = {
  colaborador_id:'', obra_id:'', tipo:'', descricao:'', valor:'',
  data: new Date().toISOString().slice(0,10),
  competencia: new Date().toISOString().slice(0,7),
  observacoes:'',
}

// ─── componente ──────────────────────────────────────────────────────────────
export default function Premios() {
  const [rows,         setRows]         = useState<PremioRow[]>([])
  const [colaboradores,setColaboradores]= useState<{id:string;nome:string;chapa:string|null}[]>([])
  const [obras,        setObras]        = useState<{id:string;nome:string}[]>([])
  const [loading,      setLoading]      = useState(true)

  const [competencia,  setCompetencia]  = useState(new Date().toISOString().slice(0,7))
  const [busca,        setBusca]        = useState('')
  const [filtroStatus, setFiltroStatus] = useState<'todos'|'pendente'|'aprovado'|'pago'|'cancelado'>('todos')
  const [filtroTipo,   setFiltroTipo]   = useState('todos')
  const [filtroObra,   setFiltroObra]   = useState('todas')
  const [colabSel,     setColabSel]     = useState<{id:string;nome:string;chapa:string|null}|null>(null)
  const [abaStatus,    setAbaStatus]    = useState<'pendente'|'aprovado'|'pago'|'cancelado'>('pendente')

  const [modalOpen,    setModalOpen]    = useState(false)
  const [editando,     setEditando]     = useState<PremioRow|null>(null)
  const [form,         setForm]         = useState<FormData>(EMPTY_FORM)
  const [saving,       setSaving]       = useState(false)
  const [deleteId,     setDeleteId]     = useState<string|null>(null)
  const [aprovarRow,   setAprovarRow]   = useState<PremioRow|null>(null)
  const [cancelarRow,  setCancelarRow]  = useState<PremioRow|null>(null)

  // ─── fetch ─────────────────────────────────────────────────────────────────
  const fetchData = useCallback(async () => {
    setLoading(true)
    const [premRes, colRes, obrRes] = await Promise.all([
      supabase.from('premios').select('*, colaboradores(nome,chapa)').eq('competencia', competencia).order('created_at',{ascending:false}),
      supabase.from('colaboradores').select('id,nome,chapa').eq('status','ativo').order('nome'),
      supabase.from('obras').select('id,nome').order('nome'),
    ])
    if (premRes.error) { toast.error('Erro ao carregar prêmios'); setLoading(false); return }
    if (colRes.data) setColaboradores(colRes.data)
    if (obrRes.data) setObras(obrRes.data)
    const lista = (premRes.data as PremioRow[]) ?? []
    // sync status com pagamentos
    const comPag = lista.filter(r => r.pagamento_id && r.status !== 'pago')
    if (comPag.length > 0) {
      const ids = comPag.map(r => r.pagamento_id!)
      const { data: pgts } = await supabase.from('pagamentos').select('id,status').in('id', ids)
      const pagoIds = new Set((pgts??[]).filter(p=>p.status==='pago').map(p=>p.id))
      if (pagoIds.size > 0) {
        for (const r of comPag.filter(r=>pagoIds.has(r.pagamento_id!))) {
          await supabase.from('premios').update({status:'pago'}).eq('id',r.id)
        }
        lista.forEach(r => { if (r.pagamento_id && pagoIds.has(r.pagamento_id)) r.status = 'pago' })
      }
    }
    setRows(lista)
    setLoading(false)
  }, [competencia])

  useEffect(() => { fetchData() }, [fetchData])
  useRefreshOnFocus(fetchData)

  // ─── contadores por colaborador ───────────────────────────────────────────
  const contPorColab = useMemo(() => {
    const map: Record<string, {total:number;pendente:number;aprovado:number;pago:number;cancelado:number;valor:number}> = {}
    rows.forEach(r => {
      if (!map[r.colaborador_id]) map[r.colaborador_id] = {total:0,pendente:0,aprovado:0,pago:0,cancelado:0,valor:0}
      map[r.colaborador_id].total++
      map[r.colaborador_id].valor += r.valor ?? 0
      const st = (r.status ?? 'pendente') as keyof typeof map[string]
      if (st in map[r.colaborador_id]) (map[r.colaborador_id] as any)[st]++
    })
    return map
  }, [rows])

  // ─── lista de colaboradores com prêmios (sidebar) ─────────────────────────
  const colabsComPremio = useMemo(() => {
    const ids = new Set(rows.map(r => r.colaborador_id))
    return colaboradores.filter(c => ids.has(c.id))
  }, [colaboradores, rows])

  const colabsFiltrados = useMemo(() => {
    const q = busca.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'')
    return colabsComPremio.filter(c => {
      const nome = c.nome.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'')
      const chapa = (c.chapa ?? '').toLowerCase()
      if (q && !nome.includes(q) && !chapa.includes(q)) return false
      if (filtroStatus !== 'todos') {
        const cnt = contPorColab[c.id]
        if (!cnt || cnt[filtroStatus as keyof typeof cnt] === 0) return false
      }
      return true
    })
  }, [colabsComPremio, busca, filtroStatus, contPorColab])

  // ─── prêmios do colaborador selecionado ───────────────────────────────────
  const premiosDoColab = useMemo(() => {
    if (!colabSel) return []
    return rows.filter(r => {
      if (r.colaborador_id !== colabSel.id) return false
      if (r.status !== abaStatus) return false
      if (filtroTipo !== 'todos' && r.tipo !== filtroTipo) return false
      if (filtroObra !== 'todas' && r.obra_id !== filtroObra) return false
      return true
    })
  }, [rows, colabSel, abaStatus, filtroTipo, filtroObra])

  // ─── totais globais ───────────────────────────────────────────────────────
  const totais = useMemo(() => ({
    pendente:  rows.filter(r=>(r.status??'pendente')==='pendente').reduce((s,r)=>s+(r.valor??0),0),
    aprovado:  rows.filter(r=>r.status==='aprovado').reduce((s,r)=>s+(r.valor??0),0),
    pago:      rows.filter(r=>r.status==='pago').reduce((s,r)=>s+(r.valor??0),0),
    cancelado: rows.filter(r=>r.status==='cancelado').reduce((s,r)=>s+(r.valor??0),0),
    ct: {
      pendente:  rows.filter(r=>(r.status??'pendente')==='pendente').length,
      aprovado:  rows.filter(r=>r.status==='aprovado').length,
      pago:      rows.filter(r=>r.status==='pago').length,
      cancelado: rows.filter(r=>r.status==='cancelado').length,
    }
  }), [rows])

  // ─── modal helpers ─────────────────────────────────────────────────────────
  function setField(k: keyof FormData, v: string) { setForm(p => ({...p,[k]:v})) }

  function openCreate() {
    setEditando(null)
    setForm({...EMPTY_FORM, competencia, colaborador_id: colabSel?.id ?? ''})
    setModalOpen(true)
  }
  function openEdit(row: PremioRow) {
    if (row.status === 'pago') { toast.error('❌ Prêmio já pago — exclua o pagamento vinculado antes de editar.'); return }
    setEditando(row)
    setForm({
      colaborador_id: row.colaborador_id,
      obra_id:        row.obra_id ?? '',
      tipo:           row.tipo ?? '',
      descricao:      row.descricao ?? '',
      valor:          String(row.valor ?? ''),
      data:           row.data ?? '',
      competencia:    row.competencia ?? '',
      observacoes:    row.observacoes ?? '',
    })
    setModalOpen(true)
  }

  // ─── save ──────────────────────────────────────────────────────────────────
  async function handleSave() {
    if (!form.colaborador_id) return toast.error('Colaborador obrigatório')
    if (!form.descricao.trim()) return toast.error('Descrição obrigatória')
    if (!form.valor) return toast.error('Valor obrigatório')
    if (!form.data) return toast.error('Data obrigatória')
    setSaving(true)
    const payload: Record<string,unknown> = {
      colaborador_id: form.colaborador_id,
      tipo:           form.tipo || null,
      descricao:      form.descricao,
      valor:          parseFloat(form.valor) || null,
      competencia:    form.competencia || null,
      observacoes:    form.observacoes || null,
      status:         editando?.status ?? 'pendente',
    }
    if (form.obra_id)  payload.obra_id = form.obra_id
    if (form.data)     payload.data    = form.data
    const { error } = editando
      ? await supabase.from('premios').update(payload).eq('id', editando.id)
      : await supabase.from('premios').insert({...payload, status:'pendente'})
    setSaving(false)
    if (error) { toast.error('Erro ao salvar: ' + error.message); return }
    toast.success(editando ? '🏆 Prêmio atualizado!' : '🏆 Prêmio registrado!')
    setModalOpen(false); fetchData()
  }

  // ─── aprovar ───────────────────────────────────────────────────────────────
  // NOVO FLUXO: prêmio aprovado é integrado automaticamente ao fechamento de ponto.
  // NÃO cria pagamento avulso — o fechamento lê os prêmios aprovados e os soma ao salário.
  async function confirmarAprovar() {
    if (!aprovarRow) return
    const { error } = await supabase.from('premios')
      .update({ status: 'aprovado', pagamento_id: null })
      .eq('id', aprovarRow.id)
    if (error) { toast.error('Erro ao aprovar: ' + error.message); return }
    toast.success('✅ Prêmio aprovado! Será somado ao salário no fechamento de ponto.')
    setAprovarRow(null); fetchData(); setAbaStatus('aprovado')
  }

  // ─── cancelar ──────────────────────────────────────────────────────────────
  async function confirmarCancelar() {
    if (!cancelarRow) return
    // Prêmios aprovados não têm pagamento_id — apenas cancela o status
    const { error } = await supabase.from('premios')
      .update({ status: 'cancelado', pagamento_id: null })
      .eq('id', cancelarRow.id)
    if (error) { toast.error('Erro ao cancelar: ' + error.message); return }
    toast.success('Prêmio cancelado.')
    setCancelarRow(null); fetchData(); setAbaStatus('cancelado')
  }

  // ─── delete ────────────────────────────────────────────────────────────────
  async function handleDelete() {
    if (!deleteId) return
    const { error } = await supabase.from('premios').delete().eq('id', deleteId)
    setDeleteId(null)
    if (error) toast.error('Erro ao excluir')
    else { toast.success('Prêmio excluído!'); fetchData() }
  }

  // ─── render ────────────────────────────────────────────────────────────────
  return (
    <>
    <div style={{display:'flex', minHeight:'calc(100vh - 57px)', overflow:'hidden'}}>

      {/* ══════════ SIDEBAR ESQUERDA ══════════ */}
      <div style={{width:272, flexShrink:0, borderRight:'1px solid var(--border)', display:'flex', flexDirection:'column', overflow:'hidden'}}>

        {/* Cabeçalho sidebar */}
        <div style={{padding:'12px 12px 8px', background:'#1e3a5f', display:'flex', flexDirection:'column', gap:8}}>
          <div style={{display:'flex', alignItems:'center', justifyContent:'space-between'}}>
            <div style={{fontWeight:700, fontSize:13, color:'#fff', display:'flex', alignItems:'center', gap:6}}>
              <Trophy size={14} color="#f59e0b"/> Prêmios e Bonificações
            </div>
            {/* Navegação de mês */}
            <div style={{display:'flex', alignItems:'center', gap:4}}>
              <button onClick={()=>setCompetencia(prevMes(competencia))}
                style={{width:24, height:24, borderRadius:5, border:'1px solid #334155', background:'#0f172a', cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center', color:'#94a3b8'}}>
                <ChevronLeft size={12}/>
              </button>
              <span style={{fontWeight:700, fontSize:11, color:'#cbd5e1', whiteSpace:'nowrap', minWidth:72, textAlign:'center'}}>
                {mesLabel(competencia)}
              </span>
              <button onClick={()=>setCompetencia(nextMes(competencia))}
                style={{width:24, height:24, borderRadius:5, border:'1px solid #334155', background:'#0f172a', cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center', color:'#94a3b8'}}>
                <ChevronRight size={12}/>
              </button>
            </div>
          </div>

          {/* Busca */}
          <div style={{position:'relative'}}>
            <Search size={13} style={{position:'absolute', left:9, top:'50%', transform:'translateY(-50%)', color:'#9ca3af'}}/>
            <input value={busca} onChange={e=>setBusca(e.target.value)} placeholder="Nome ou chapa…"
              style={{width:'100%', height:33, border:'1px solid #334155', borderRadius:7, paddingLeft:28, paddingRight:8, fontSize:12, background:'#0f172a', color:'#fff', boxSizing:'border-box'}}/>
          </div>

          {/* Badges status */}
          <div style={{display:'flex', gap:4, flexWrap:'wrap'}}>
            {([
              {key:'todos'     as const, label:'todos',    val:rows.length,           bg:'rgba(255,255,255,.15)', cor:'#fff'},
              {key:'pendente'  as const, label:'pendentes', val:totais.ct.pendente,   bg:'rgba(251,191,36,.25)',  cor:'#fde68a'},
              {key:'aprovado'  as const, label:'aprovados', val:totais.ct.aprovado,   bg:'rgba(34,197,94,.25)',   cor:'#86efac'},
              {key:'pago'      as const, label:'pagos',     val:totais.ct.pago,       bg:'rgba(96,165,250,.25)',  cor:'#93c5fd'},
              {key:'cancelado' as const, label:'cancelados',val:totais.ct.cancelado,  bg:'rgba(248,113,113,.25)', cor:'#fca5a5'},
            ]).map(b=>(
              <button key={b.key}
                onClick={()=>setFiltroStatus(filtroStatus===b.key&&b.key!=='todos'?'todos':b.key)}
                style={{
                  background: filtroStatus===b.key ? b.bg : 'rgba(255,255,255,.07)',
                  border:`1.5px solid ${filtroStatus===b.key?b.cor:'transparent'}`,
                  borderRadius:5, padding:'2px 7px', fontSize:10, fontWeight:700,
                  color: filtroStatus===b.key?b.cor:'#94a3b8', cursor:'pointer',
                }}>
                {b.label}: {b.val}
              </button>
            ))}
          </div>
        </div>

        {/* Lista de colaboradores */}
        <div style={{flex:1, overflowY:'auto'}}>
          {loading
            ? <div style={{padding:16, textAlign:'center', fontSize:12, color:'var(--muted-foreground)'}}>Carregando…</div>
            : colabsFiltrados.length === 0
              ? <div style={{padding:24, textAlign:'center', fontSize:12, color:'var(--muted-foreground)'}}>
                  {busca || filtroStatus !== 'todos' ? 'Nenhum resultado' : 'Nenhum colaborador com prêmio neste mês'}
                </div>
              : colabsFiltrados.map(c => {
                  const cnt = contPorColab[c.id]
                  const ativo = colabSel?.id === c.id
                  return (
                    <button key={c.id} onClick={()=>{ setColabSel(c); setAbaStatus('pendente') }}
                      style={{
                        width:'100%', textAlign:'left', padding:'8px 10px',
                        border:'none', borderBottom:'1px solid var(--border)',
                        background: ativo ? 'var(--primary)' : 'transparent',
                        color: ativo ? '#fff' : 'var(--foreground)',
                        cursor:'pointer',
                      }}>
                      <div style={{display:'flex', alignItems:'center', justifyContent:'space-between', gap:4}}>
                        <div style={{fontSize:10, fontFamily:'monospace', fontWeight:700, opacity:0.6}}>{c.chapa??'—'}</div>
                        <div style={{display:'flex', gap:3}}>
                          {(cnt?.pendente??0) > 0 && (
                            <span style={{fontSize:9, background:ativo?'rgba(255,255,255,0.3)':'#fef3c7', color:ativo?'#fff':'#b45309', borderRadius:8, padding:'1px 5px', fontWeight:700}}>
                              ⏳{cnt.pendente}
                            </span>
                          )}
                          {(cnt?.aprovado??0) > 0 && (
                            <span style={{fontSize:9, background:ativo?'rgba(255,255,255,0.3)':'#dcfce7', color:ativo?'#fff':'#15803d', borderRadius:8, padding:'1px 5px', fontWeight:700}}>
                              ✓{cnt.aprovado}
                            </span>
                          )}
                          {(cnt?.pago??0) > 0 && (
                            <span style={{fontSize:9, background:ativo?'rgba(255,255,255,0.3)':'#eff6ff', color:ativo?'#fff':'#1d4ed8', borderRadius:8, padding:'1px 5px', fontWeight:700}}>
                              💳{cnt.pago}
                            </span>
                          )}
                        </div>
                      </div>
                      <div style={{fontSize:13, fontWeight:600}}>{c.nome}</div>
                      <div style={{fontSize:11, opacity:0.7, display:'flex', justifyContent:'space-between'}}>
                        <span>{cnt?.total??0} prêmio(s)</span>
                        <span style={{fontWeight:700, color:ativo?'#fde68a':'#f59e0b'}}>{formatCurrency(cnt?.valor??0)}</span>
                      </div>
                    </button>
                  )
                })
          }
        </div>

        {/* Botão novo prêmio */}
        <div style={{padding:'8px 10px', borderTop:'1px solid var(--border)', background:'var(--background)'}}>
          <button onClick={openCreate}
            style={{width:'100%', display:'flex', alignItems:'center', justifyContent:'center', gap:6, padding:'8px', borderRadius:8, background:'#f59e0b', color:'#fff', border:'none', cursor:'pointer', fontWeight:700, fontSize:13}}>
            <Plus size={14}/> Novo Prêmio
          </button>
        </div>
      </div>

      {/* ══════════ PAINEL DIREITO ══════════ */}
      <div style={{flex:1, display:'flex', flexDirection:'column', overflow:'hidden'}}>
        {!colabSel ? (
          /* Estado vazio — nenhum colaborador selecionado */
          <div style={{flex:1, display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', gap:16, color:'var(--muted-foreground)'}}>
            {/* Cards de totais globais */}
            <div style={{display:'grid', gridTemplateColumns:'repeat(4, 160px)', gap:12, marginBottom:8}}>
              {([
                {label:'Pendentes',  val:totais.pendente,  cor:'#b45309', bg:'#fffbeb', cnt:totais.ct.pendente},
                {label:'Aprovados',  val:totais.aprovado,  cor:'#15803d', bg:'#f0fdf4', cnt:totais.ct.aprovado},
                {label:'Pagos',      val:totais.pago,      cor:'#1d4ed8', bg:'#eff6ff', cnt:totais.ct.pago},
                {label:'Total Geral',val:totais.pendente+totais.aprovado+totais.pago+totais.cancelado, cor:'#f59e0b', bg:'#fffbeb', cnt:rows.length},
              ]).map(c => (
                <div key={c.label} style={{border:`1.5px solid ${c.cor}30`, borderRadius:12, padding:'14px 16px', background:c.bg, textAlign:'center'}}>
                  <div style={{fontSize:12, color:c.cor, fontWeight:700, marginBottom:4}}>{c.label}</div>
                  <div style={{fontSize:18, fontWeight:900, color:c.cor}}>{formatCurrency(c.val)}</div>
                  <div style={{fontSize:11, color:c.cor, opacity:.7}}>{c.cnt} prêmio(s)</div>
                </div>
              ))}
            </div>
            <span style={{fontSize:44}}>👈</span>
            <div style={{fontSize:15, fontWeight:600}}>Selecione um colaborador</div>
            <div style={{fontSize:13, opacity:.6}}>ou clique em "+ Novo Prêmio" para registrar</div>
          </div>
        ) : (
          <>
          {/* ── Topo do painel ── */}
          <div style={{flexShrink:0, borderBottom:'1px solid var(--border)', background:'var(--background)'}}>
            {/* Linha 1: nome + ações */}
            <div style={{padding:'10px 16px', display:'flex', alignItems:'center', gap:10, flexWrap:'wrap'}}>
              <div style={{flex:1, minWidth:160}}>
                <div style={{fontWeight:700, fontSize:15}}>{colabSel.nome}</div>
                <div style={{fontSize:11, color:'var(--muted-foreground)'}}>
                  {colabSel.chapa && <><span style={{fontFamily:'monospace', fontWeight:600}}>{colabSel.chapa}</span> · </>}
                  Prêmios de <strong>{mesLabel(competencia)}</strong>
                </div>
              </div>
              <button onClick={fetchData}
                style={{width:30, height:30, borderRadius:7, border:'1px solid var(--border)', background:'var(--background)', cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center'}}>
                <RefreshCw size={13}/>
              </button>
              <Button onClick={openCreate} style={{background:'#f59e0b', color:'#fff', gap:5, height:30, fontSize:12}}>
                <Plus size={12}/> Novo Prêmio
              </Button>
            </div>

            {/* Linha 2: filtros */}
            <div style={{padding:'6px 16px 8px', display:'flex', gap:8, alignItems:'center', borderTop:'1px solid var(--border)'}}>
              <Select value={filtroTipo} onValueChange={setFiltroTipo}>
                <SelectTrigger style={{fontSize:12, height:28, width:160}}><SelectValue placeholder="Todos os tipos"/></SelectTrigger>
                <SelectContent>
                  <SelectItem value="todos">Todos os tipos</SelectItem>
                  {TIPO_OPTIONS.map(t => <SelectItem key={t} value={t}>{TIPO_EMOJI[t]} {t}</SelectItem>)}
                </SelectContent>
              </Select>
              <Select value={filtroObra} onValueChange={setFiltroObra}>
                <SelectTrigger style={{fontSize:12, height:28, width:160}}><SelectValue placeholder="Todas as obras"/></SelectTrigger>
                <SelectContent>
                  <SelectItem value="todas">Todas as obras</SelectItem>
                  {obras.map(o => <SelectItem key={o.id} value={o.id}>{o.nome}</SelectItem>)}
                </SelectContent>
              </Select>
              {(filtroTipo !== 'todos' || filtroObra !== 'todas') && (
                <button onClick={()=>{ setFiltroTipo('todos'); setFiltroObra('todas') }}
                  style={{fontSize:11, padding:'3px 10px', borderRadius:10, border:'none', background:'#e0e7ff', color:'#3730a3', cursor:'pointer', fontWeight:600}}>
                  ✕ Limpar filtros
                </button>
              )}
            </div>

            {/* Linha 3: abas de status */}
            <div style={{display:'flex', gap:0, borderTop:'1px solid var(--border)'}}>
              {([
                {key:'pendente'  as const, label:'⏳ Pendentes',  cor:'#b45309'},
                {key:'aprovado'  as const, label:'✅ Aprovados',  cor:'#15803d'},
                {key:'pago'      as const, label:'💳 Pagos',      cor:'#1d4ed8'},
                {key:'cancelado' as const, label:'❌ Cancelados', cor:'#dc2626'},
              ]).map(ab => {
                const ativo = abaStatus === ab.key
                const cnt = rows.filter(r => r.colaborador_id === colabSel.id && r.status === ab.key).length
                return (
                  <button key={ab.key} onClick={()=>setAbaStatus(ab.key)}
                    style={{
                      padding:'9px 16px', border:'none',
                      borderBottom: ativo ? `3px solid ${ab.cor}` : '3px solid transparent',
                      background: ativo ? `${ab.cor}10` : 'transparent',
                      color: ativo ? ab.cor : 'var(--muted-foreground)',
                      fontWeight: ativo ? 700 : 500, fontSize:12, cursor:'pointer',
                      display:'flex', alignItems:'center', gap:5,
                      transition:'all 0.15s', marginBottom:-1,
                    }}>
                    {ab.label}
                    {cnt > 0 && (
                      <span style={{background: ativo ? ab.cor : '#9ca3af', color:'#fff', borderRadius:9, padding:'1px 6px', fontSize:10, fontWeight:700}}>
                        {cnt}
                      </span>
                    )}
                  </button>
                )
              })}
            </div>
          </div>

          {/* ── Conteúdo: tabela de prêmios ── */}
          <div style={{flex:1, overflowY:'auto', padding:'0 0 16px'}}>
            {premiosDoColab.length === 0 ? (
              <div style={{padding:60, textAlign:'center', color:'var(--muted-foreground)'}}>
                <Gift size={40} style={{opacity:.2, display:'block', margin:'0 auto 12px'}}/>
                <div style={{fontWeight:700, fontSize:14}}>
                  Nenhum prêmio {STATUS_COR[abaStatus]?.label.split(' ').slice(1).join(' ').toLowerCase()} em {mesLabel(competencia)}
                </div>
                {abaStatus === 'pendente' && (
                  <div style={{fontSize:12, marginTop:6, opacity:.7}}>
                    Clique em "+ Novo Prêmio" para registrar.
                  </div>
                )}
              </div>
            ) : (
              <div style={{margin:'0 16px 0'}}>
                <table style={{width:'100%', borderCollapse:'collapse', fontSize:13}}>
                  <thead>
                    <tr style={{borderBottom:'2px solid var(--border)', background:'var(--muted)'}}>
                      <th style={{textAlign:'left', padding:'10px 12px', fontSize:11, fontWeight:700, color:'var(--muted-foreground)', textTransform:'uppercase', letterSpacing:'0.04em'}}>Tipo / Descrição</th>
                      <th style={{textAlign:'left', padding:'10px 12px', fontSize:11, fontWeight:700, color:'var(--muted-foreground)', textTransform:'uppercase', letterSpacing:'0.04em'}}>Obra</th>
                      <th style={{textAlign:'center', padding:'10px 12px', fontSize:11, fontWeight:700, color:'var(--muted-foreground)', textTransform:'uppercase', letterSpacing:'0.04em'}}>Data</th>
                      <th style={{textAlign:'right', padding:'10px 12px', fontSize:11, fontWeight:700, color:'#f59e0b', textTransform:'uppercase', letterSpacing:'0.04em'}}>Valor</th>
                      <th style={{textAlign:'right', padding:'10px 12px', fontSize:11, fontWeight:700, color:'var(--muted-foreground)', textTransform:'uppercase', letterSpacing:'0.04em'}}>Ações</th>
                    </tr>
                  </thead>
                  <tbody>
                    {premiosDoColab.map((row, i) => {
                      const st = row.status ?? 'pendente'
                      return (
                        <tr key={row.id} style={{borderBottom:'1px solid var(--border)', background: i%2===0 ? 'var(--card)' : 'var(--background)'}}>
                          <td style={{padding:'10px 12px'}}>
                            <div style={{display:'flex', flexDirection:'column', gap:3}}>
                              <span style={{fontSize:11, fontWeight:700, padding:'3px 9px', borderRadius:6, background:'#fef3c7', color:'#b45309', border:'1px solid #fde68a', width:'fit-content'}}>
                                {TIPO_EMOJI[row.tipo??'']??'🎁'} {row.tipo??'—'}
                              </span>
                              <span style={{fontSize:12, color:'var(--muted-foreground)'}}>{row.descricao}</span>
                              {st === 'pago' && (
                                <span style={{fontSize:10, color:'#1d4ed8', fontWeight:600}}>
                                  ✅ Via fechamento de ponto
                                </span>
                              )}
                            </div>
                          </td>
                          <td style={{padding:'10px 12px', fontSize:12, color:'var(--muted-foreground)'}}>
                            <span style={{opacity:.5}}>—</span>
                          </td>
                          <td style={{padding:'10px 12px', textAlign:'center', fontSize:12, color:'var(--muted-foreground)'}}>
                            {formatDate(row.data)}
                          </td>
                          <td style={{padding:'10px 12px', textAlign:'right'}}>
                            <span style={{fontWeight:800, fontSize:14, color:'#f59e0b'}}>{formatCurrency(row.valor??0)}</span>
                          </td>
                          <td style={{padding:'10px 12px', textAlign:'right'}}>
                            <div style={{display:'flex', gap:4, justifyContent:'flex-end'}}>
                              {st === 'pendente' && (
                                <button onClick={()=>setAprovarRow(row)} title="Aprovar"
                                  style={{height:28, padding:'0 10px', borderRadius:6, border:'1px solid #bbf7d0', background:'#f0fdf4', color:'#15803d', cursor:'pointer', fontSize:11, fontWeight:700, display:'flex', alignItems:'center', gap:4}}>
                                  <CheckCircle2 size={12}/> Aprovar
                                </button>
                              )}
                              {st==='pendente' && (
                                <button onClick={()=>openEdit(row)} title="Editar"
                                  style={{width:28, height:28, borderRadius:6, border:'1px solid var(--border)', background:'var(--muted)', cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center'}}>
                                  <Pencil size={12}/>
                                </button>
                              )}
                              {(st==='aprovado'||st==='pago') && (
                                <span
                                  title={st==='pago' ? '💳 Pago no fechamento — permanentemente bloqueado' : '✅ Aprovado — para editar, recuse o fechamento de ponto onde este prêmio foi incluído e depois cancele aqui'}
                                  style={{width:28, height:28, borderRadius:6, background:'#eff6ff', border:'1px solid #bfdbfe', display:'flex', alignItems:'center', justifyContent:'center', cursor:'help', fontSize:13}}>🔒</span>
                              )}
                              {(st==='pendente'||st==='cancelado') && (
                                <button onClick={()=>setDeleteId(row.id)} title="Excluir"
                                  style={{width:28, height:28, borderRadius:6, border:'1px solid #fecaca', background:'#fff5f5', color:'#dc2626', cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center'}}>
                                  <Trash2 size={12}/>
                                </button>
                              )}
                            </div>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
                {/* Rodapé */}
                <div style={{background:'var(--muted)', border:'1px solid var(--border)', borderTop:'2px solid var(--border)', borderRadius:'0 0 8px 8px', padding:'10px 12px', display:'flex', justifyContent:'space-between', alignItems:'center'}}>
                  <span style={{fontSize:12, color:'var(--muted-foreground)'}}>
                    {premiosDoColab.length} prêmio(s) · {STATUS_COR[abaStatus]?.label}
                  </span>
                  <span style={{fontWeight:800, fontSize:14, color:'#f59e0b'}}>
                    Total: {formatCurrency(premiosDoColab.reduce((s,r)=>s+(r.valor??0),0))}
                  </span>
                </div>
              </div>
            )}
          </div>
          </>
        )}
      </div>
    </div>

    {/* ══ MODAL CRIAR / EDITAR ══ */}
    {modalOpen && (
      <div style={{position:'fixed', inset:0, background:'rgba(0,0,0,.5)', zIndex:50, display:'flex', alignItems:'center', justifyContent:'center', padding:16}}>
        <div style={{background:'var(--background)', borderRadius:14, width:'100%', maxWidth:560, boxShadow:'0 25px 50px rgba(0,0,0,.25)', display:'flex', flexDirection:'column', maxHeight:'92dvh'}}>
          {/* Header fixo */}
          <div style={{background:'linear-gradient(135deg, #f59e0b, #d97706)', padding:'18px 24px', flexShrink:0, borderRadius:'14px 14px 0 0'}}>
            <h2 style={{fontWeight:800, fontSize:17, margin:0, color:'#fff'}}>{editando ? '✏️ Editar Prêmio' : '🏆 Novo Prêmio'}</h2>
            <p style={{fontSize:12, color:'rgba(255,255,255,.8)', margin:'4px 0 0'}}>{editando ? 'Altere os dados do prêmio' : 'Registre um novo prêmio ou bonificação'}</p>
          </div>
          {/* Corpo com scroll */}
          <div style={{padding:24, overflowY:'auto', flex:1}}>
            <div style={{display:'grid', gridTemplateColumns:'1fr 1fr', gap:14}}>
              <div style={{gridColumn:'1/-1'}}>
                <Label className="mb-1 block">Colaborador *</Label>
                <SearchableSelect
                  options={colaboradores.map(c=>({ value:c.id, label:c.nome, sublabel:c.chapa??'—' }))}
                  value={form.colaborador_id}
                  onChange={v=>setField('colaborador_id',v)}
                  placeholder="Pesquisar colaborador…"
                  emptyLabel="— Nenhum —"
                />
              </div>
              <div>
                <Label className="mb-1 block">Tipo</Label>
                <Select value={form.tipo||'nenhum'} onValueChange={v=>setField('tipo',v==='nenhum'?'':v)}>
                  <SelectTrigger><SelectValue placeholder="Selecionar tipo"/></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="nenhum">Sem tipo</SelectItem>
                    {TIPO_OPTIONS.map(t=><SelectItem key={t} value={t}>{TIPO_EMOJI[t]} {t}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="mb-1 block">Valor (R$) *</Label>
                <Input type="number" step="0.01" value={form.valor} onChange={e=>setField('valor',e.target.value)} placeholder="0,00"/>
              </div>
              <div style={{gridColumn:'1/-1'}}>
                <Label className="mb-1 block">Descrição *</Label>
                <Input value={form.descricao} onChange={e=>setField('descricao',e.target.value)} placeholder="Descreva o prêmio…"/>
              </div>
              <div>
                <Label className="mb-1 block">Data *</Label>
                <input type="date" value={form.data} onChange={e=>setField('data',e.target.value)}
                  style={{height:36, width:'100%', padding:'0 10px', fontSize:13, border:'1.5px solid var(--border)', borderRadius:6, background:'var(--background)', color:'var(--foreground)', boxSizing:'border-box'}}/>
              </div>
              <div>
                <Label className="mb-1 block">Competência</Label>
                <input type="month" value={form.competencia} onChange={e=>setField('competencia',e.target.value)}
                  style={{height:36, width:'100%', padding:'0 10px', fontSize:13, border:'1.5px solid var(--border)', borderRadius:6, background:'var(--background)', color:'var(--foreground)', boxSizing:'border-box'}}/>
              </div>
              <div>
                <Label className="mb-1 block">Obra</Label>
                <SearchableSelect
                  options={obras.map(o=>({ value:o.id, label:o.nome }))}
                  value={form.obra_id||''}
                  onChange={v=>setField('obra_id',v)}
                  placeholder="Pesquisar obra…"
                  emptyLabel="— Sem obra —"
                />
              </div>
              <div style={{gridColumn:'1/-1'}}>
                <Label className="mb-1 block">Observações</Label>
                <Textarea value={form.observacoes} onChange={e=>setField('observacoes',e.target.value)} rows={2} placeholder="Observações…"/>
              </div>
            </div>
            <div style={{background:'#fffbeb', border:'1px solid #fde68a', borderRadius:8, padding:'10px 14px', fontSize:12, color:'#92400e', marginTop:14}}>
              💡 Após registrar, clique em <strong>Aprovar</strong> para enviar à tela de <strong>Pagamentos</strong>.
            </div>
            <div style={{display:'flex', justifyContent:'flex-end', gap:10, marginTop:18}}>
              <Button variant="outline" onClick={()=>setModalOpen(false)}>Cancelar</Button>
              <Button disabled={saving} onClick={handleSave} style={{background:'#f59e0b', color:'#fff'}}>
                {saving ? 'Salvando…' : editando ? '💾 Salvar' : '🏆 Registrar'}
              </Button>
            </div>
          </div>
        </div>
      </div>
    )}

    {/* ── dialogs ── */}
    <AlertDialog open={!!aprovarRow} onOpenChange={o=>{if(!o)setAprovarRow(null)}}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>✅ Aprovar prêmio?</AlertDialogTitle>
          <AlertDialogDescription>
            <strong>{aprovarRow?.colaboradores?.nome}</strong> — {formatCurrency(aprovarRow?.valor??0)}<br/>
            Prêmio: <em>{aprovarRow?.descricao}</em><br/>
            O valor será <strong>somado automaticamente ao salário</strong> no próximo fechamento de ponto. Não cria pagamento avulso.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Voltar</AlertDialogCancel>
          <AlertDialogAction onClick={confirmarAprovar} style={{background:'#15803d',color:'#fff'}}>✅ Confirmar</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>

    <AlertDialog open={!!cancelarRow} onOpenChange={o=>{if(!o)setCancelarRow(null)}}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>❌ Cancelar prêmio?</AlertDialogTitle>
          <AlertDialogDescription>
            O prêmio de <strong>{cancelarRow?.colaboradores?.nome}</strong> ({formatCurrency(cancelarRow?.valor??0)}) será cancelado e removido de Pagamentos.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Voltar</AlertDialogCancel>
          <AlertDialogAction onClick={confirmarCancelar} style={{background:'#dc2626',color:'#fff'}}>❌ Cancelar Prêmio</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>

    <AlertDialog open={!!deleteId} onOpenChange={o=>{if(!o)setDeleteId(null)}}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>🗑️ Excluir prêmio?</AlertDialogTitle>
          <AlertDialogDescription>Esta ação não pode ser desfeita.</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancelar</AlertDialogCancel>
          <AlertDialogAction onClick={handleDelete} style={{background:'#dc2626',color:'#fff'}}>Excluir</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
    </>
  )
}
