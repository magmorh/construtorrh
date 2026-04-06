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
  DollarSign, Plus, Search, Pencil, Trash2, ChevronLeft, ChevronRight,
  CheckCircle2, XCircle, RefreshCw, Repeat, CalendarDays, Info,
} from 'lucide-react'

// ─── tipos ───────────────────────────────────────────────────────────────────
type AdiantRow = {
  id: string
  colaborador_id: string
  obra_id: string | null
  competencia: string
  valor: number
  status: 'pendente' | 'aprovado' | 'cancelado' | 'pago'
  tipo: string
  observacoes: string | null
  pagamento_id: string | null
  desconto_tipo: 'unico' | 'parcelado' | null
  desconto_parcelas: number | null
  desconto_parcela_atual: number | null
  desconto_a_partir: string | null
  desconto_obs: string | null
  requisicao_url: string | null
  colaboradores?: { nome: string; chapa: string | null }
}

type FormData = {
  colaborador_id: string
  obra_id: string
  competencia: string
  valor: string
  tipo: string
  observacoes: string
  desconto_tipo: 'unico' | 'parcelado'
  desconto_parcelas: string
  desconto_a_partir: string
  desconto_obs: string
}

const TIPOS = [
  { value:'adiantamento', label:'💵 Adiantamento Salarial' },
  { value:'vale',         label:'🎫 Vale'                  },
  { value:'ajuda_custo',  label:'🚗 Ajuda de Custo'        },
  { value:'outro',        label:'📋 Outro'                 },
]
const TIPO_LABEL: Record<string,string> = {
  adiantamento:'💵 Adiantamento', vale:'🎫 Vale', ajuda_custo:'🚗 Ajuda de Custo', outro:'📋 Outro',
}

const MESES = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro']
function mesLabel(ym:string){ if(!ym)return'—'; const[y,m]=ym.split('-'); return`${MESES[+m-1]} / ${y}` }
function prevMes(ym:string){ const[y,m]=ym.split('-').map(Number); const d=new Date(y,m-2,1); return`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}` }
function nextMes(ym:string){ const[y,m]=ym.split('-').map(Number); const d=new Date(y,m,1); return`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}` }

const EMPTY: FormData = {
  colaborador_id:'', obra_id:'',
  competencia: new Date().toISOString().slice(0,7),
  valor:'', tipo:'adiantamento', observacoes:'',
  desconto_tipo:'unico', desconto_parcelas:'1',
  desconto_a_partir: new Date().toISOString().slice(0,7),
  desconto_obs:'',
}

// ─── componente ──────────────────────────────────────────────────────────────
export default function Adiantamentos() {
  const [rows,    setRows]    = useState<AdiantRow[]>([])
  const [colabs,  setColabs]  = useState<{id:string;nome:string;chapa:string|null}[]>([])
  const [obras,   setObras]   = useState<{id:string;nome:string}[]>([])
  const [loading, setLoading] = useState(true)

  const [competencia,  setCompetencia]  = useState(new Date().toISOString().slice(0,7))
  const [busca,        setBusca]        = useState('')
  const [filtroStatus, setFiltroStatus] = useState<'todos'|'pendente'|'aprovado'|'pago'|'cancelado'>('todos')
  const [filtroTipo,   setFiltroTipo]   = useState('todos')
  const [filtroObra,   setFiltroObra]   = useState('todas')
  const [colabSel,     setColabSel]     = useState<{id:string;nome:string;chapa:string|null}|null>(null)
  const [abaStatus,    setAbaStatus]    = useState<'pendente'|'aprovado'|'pago'|'cancelado'>('pendente')

  const [modalOpen,    setModalOpen]    = useState(false)
  const [editando,     setEditando]     = useState<AdiantRow|null>(null)
  const [form,         setForm]         = useState<FormData>(EMPTY)
  const [saving,       setSaving]       = useState(false)
  const [arquivoReq,   setArquivoReq]   = useState<File|null>(null)
  const [deleteId,     setDeleteId]     = useState<string|null>(null)
  const [aprovarRow,   setAprovarRow]   = useState<AdiantRow|null>(null)
  const [cancelarRow,  setCancelarRow]  = useState<AdiantRow|null>(null)

  // ─── fetch ─────────────────────────────────────────────────────────────────
  const fetchData = useCallback(async () => {
    setLoading(true)
    const [{data:aData},{data:cData},{data:oData}] = await Promise.all([
      supabase.from('adiantamentos').select('*, requisicao_url, colaboradores(nome,chapa)').eq('competencia',competencia).order('created_at',{ascending:false}),
      supabase.from('colaboradores').select('id,nome,chapa').eq('status','ativo').order('nome'),
      supabase.from('obras').select('id,nome').order('nome'),
    ])
    const lista = (aData ?? []) as AdiantRow[]
    const comPag = lista.filter(r=>r.pagamento_id && r.status!=='pago')
    if (comPag.length > 0) {
      const ids = comPag.map(r=>r.pagamento_id!)
      const {data:pgts} = await supabase.from('pagamentos').select('id,status').in('id',ids)
      const pagoIds = new Set((pgts??[]).filter(p=>p.status==='pago').map(p=>p.id))
      if (pagoIds.size > 0) {
        for (const r of comPag.filter(r=>pagoIds.has(r.pagamento_id!))) {
          await supabase.from('adiantamentos').update({status:'pago'}).eq('id',r.id)
        }
        lista.forEach(r=>{ if(r.pagamento_id&&pagoIds.has(r.pagamento_id)) r.status='pago' })
      }
    }
    setRows(lista)
    setColabs(cData ?? [])
    setObras(oData ?? [])
    setLoading(false)
  }, [competencia])

  useEffect(()=>{ fetchData() },[fetchData])
  useRefreshOnFocus(fetchData)

  // ─── contadores por colaborador ───────────────────────────────────────────
  const contPorColab = useMemo(()=>{
    const map: Record<string,{total:number;pendente:number;aprovado:number;pago:number;cancelado:number;valor:number}> = {}
    rows.forEach(r=>{
      if(!map[r.colaborador_id]) map[r.colaborador_id]={total:0,pendente:0,aprovado:0,pago:0,cancelado:0,valor:0}
      map[r.colaborador_id].total++
      map[r.colaborador_id].valor += r.valor
      ;(map[r.colaborador_id] as any)[r.status]++
    })
    return map
  },[rows])

  // ─── sidebar: colaboradores com adiantamentos ─────────────────────────────
  const colabsComAdiant = useMemo(()=>{
    const ids = new Set(rows.map(r=>r.colaborador_id))
    return colabs.filter(c=>ids.has(c.id))
  },[colabs,rows])

  const colabsFiltrados = useMemo(()=>{
    const q = busca.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'')
    return colabsComAdiant.filter(c=>{
      const nome = c.nome.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'')
      const chapa = (c.chapa??'').toLowerCase()
      if(q && !nome.includes(q) && !chapa.includes(q)) return false
      if(filtroStatus!=='todos'){
        const cnt=contPorColab[c.id]
        if(!cnt||(cnt as any)[filtroStatus]===0) return false
      }
      return true
    })
  },[colabsComAdiant,busca,filtroStatus,contPorColab])

  // ─── adiantamentos do colab selecionado ──────────────────────────────────
  const adiantDoColab = useMemo(()=>{
    if(!colabSel) return []
    return rows.filter(r=>{
      if(r.colaborador_id !== colabSel.id) return false
      if(r.status !== abaStatus) return false
      if(filtroTipo!=='todos' && r.tipo!==filtroTipo) return false
      if(filtroObra!=='todas' && r.obra_id!==filtroObra) return false
      return true
    })
  },[rows,colabSel,abaStatus,filtroTipo,filtroObra])

  // ─── totais globais ───────────────────────────────────────────────────────
  const totais = useMemo(()=>({
    pendente:  rows.filter(r=>r.status==='pendente').reduce((s,r)=>s+r.valor,0),
    aprovado:  rows.filter(r=>r.status==='aprovado').reduce((s,r)=>s+r.valor,0),
    pago:      rows.filter(r=>r.status==='pago').reduce((s,r)=>s+r.valor,0),
    cancelado: rows.filter(r=>r.status==='cancelado').reduce((s,r)=>s+r.valor,0),
    ct:{
      pendente:  rows.filter(r=>r.status==='pendente').length,
      aprovado:  rows.filter(r=>r.status==='aprovado').length,
      pago:      rows.filter(r=>r.status==='pago').length,
      cancelado: rows.filter(r=>r.status==='cancelado').length,
    }
  }),[rows])

  // ─── modal helpers ────────────────────────────────────────────────────────
  function setF(k:keyof FormData,v:string){ setForm(p=>({...p,[k]:v})) }

  function openCreate(){
    setEditando(null)
    setForm({...EMPTY, competencia, colaborador_id: colabSel?.id??''})
    setArquivoReq(null)
    setModalOpen(true)
  }
  function openEdit(r:AdiantRow){
    if(r.status==='pago'){ toast.error('Pagamento já efetuado — exclua o pagamento antes de editar.'); return }
    if(!['pendente','aprovado'].includes(r.status)){ toast.error('Só é possível editar pendentes ou aprovados.'); return }
    setEditando(r)
    setForm({
      colaborador_id:    r.colaborador_id,
      obra_id:           r.obra_id??'',
      competencia:       r.competencia,
      valor:             String(r.valor),
      tipo:              r.tipo,
      observacoes:       r.observacoes??'',
      desconto_tipo:     r.desconto_tipo??'unico',
      desconto_parcelas: String(r.desconto_parcelas??1),
      desconto_a_partir: r.desconto_a_partir??r.competencia??new Date().toISOString().slice(0,7),
      desconto_obs:      r.desconto_obs??'',
    })
    setModalOpen(true)
  }

  // ─── save ─────────────────────────────────────────────────────────────────
  async function handleSave(){
    if(!form.colaborador_id) return toast.error('Colaborador obrigatório')
    if(!form.valor||+form.valor<=0) return toast.error('Valor deve ser maior que zero')
    if(!editando && !arquivoReq) return toast.error('Anexe a requisição assinada')
    setSaving(true)
    const payload:any = {
      colaborador_id:         form.colaborador_id,
      competencia:            form.competencia,
      valor:                  parseFloat(form.valor),
      tipo:                   form.tipo,
      observacoes:            form.observacoes||null,
      status:                 'pendente',
      desconto_tipo:          form.desconto_tipo,
      desconto_parcelas:      form.desconto_tipo==='parcelado' ? parseInt(form.desconto_parcelas)||1 : 1,
      desconto_parcela_atual: 0,
      desconto_a_partir:      form.desconto_a_partir||form.competencia,
      desconto_obs:           form.desconto_obs||null,
    }
    if(form.obra_id) payload.obra_id = form.obra_id
    if(!editando && arquivoReq){
      const fp=`adiantamentos/${form.colaborador_id}/${Date.now()}_${arquivoReq.name}`
      const {error:upErr} = await supabase.storage.from('documentos').upload(fp, arquivoReq)
      if(upErr){ setSaving(false); toast.error('Erro no upload: '+upErr.message); return }
      const {data:urlData} = supabase.storage.from('documentos').getPublicUrl(fp)
      payload.requisicao_url = urlData.publicUrl
    }
    const {error} = editando
      ? await supabase.from('adiantamentos').update(payload).eq('id',editando.id)
      : await supabase.from('adiantamentos').insert(payload)
    setSaving(false)
    if(error){ toast.error('Erro: '+error.message); return }
    toast.success(editando ? 'Atualizado!' : 'Registrado! Aguardando aprovação.')
    setArquivoReq(null); setModalOpen(false); fetchData()
  }

  // ─── aprovar ──────────────────────────────────────────────────────────────
  async function confirmarAprovar(){
    if(!aprovarRow) return
    const {data:pag,error:errPag} = await supabase.from('pagamentos').insert({
      colaborador_id: aprovarRow.colaborador_id,
      obra_id:        aprovarRow.obra_id??null,
      competencia:    aprovarRow.competencia,
      tipo:           'adiantamento',
      valor_bruto:    aprovarRow.valor,
      valor_liquido:  aprovarRow.valor,
      status:         'pendente',
      observacoes:    `${TIPO_LABEL[aprovarRow.tipo]??aprovarRow.tipo}${aprovarRow.observacoes?' — '+aprovarRow.observacoes:''}`,
    }).select('id').single()
    if(errPag){ toast.error('Erro ao criar pagamento: '+errPag.message); return }
    const {error} = await supabase.from('adiantamentos').update({status:'aprovado', pagamento_id:pag.id}).eq('id',aprovarRow.id)
    if(error){ await supabase.from('pagamentos').delete().eq('id',pag.id); toast.error('Erro ao aprovar: '+error.message); return }
    toast.success('✅ Aprovado! Enviado para Pagamentos.')
    setAprovarRow(null); fetchData(); setAbaStatus('aprovado')
  }

  // ─── cancelar ─────────────────────────────────────────────────────────────
  async function confirmarCancelar(){
    if(!cancelarRow) return
    if(cancelarRow.status==='pago'){ toast.error('❌ Já foi pago.'); setCancelarRow(null); return }
    if(cancelarRow.pagamento_id){
      const {data:pag} = await supabase.from('pagamentos').select('status').eq('id',cancelarRow.pagamento_id).single()
      if(pag?.status==='pago'){ toast.error('❌ Pagamento já efetuado.'); setCancelarRow(null); return }
      await supabase.from('pagamentos').delete().eq('id',cancelarRow.pagamento_id)
    }
    await supabase.from('adiantamentos').update({status:'cancelado', pagamento_id:null}).eq('id',cancelarRow.id)
    toast.success('Cancelado.')
    setCancelarRow(null); fetchData(); setAbaStatus('cancelado')
  }

  // ─── delete ───────────────────────────────────────────────────────────────
  async function handleDelete(){
    if(!deleteId) return
    const row = rows.find(r=>r.id===deleteId)
    if(row?.pagamento_id){
      const {data:pag} = await supabase.from('pagamentos').select('status').eq('id',row.pagamento_id).single()
      if(pag?.status==='pago'){ toast.error('Já foi pago — não pode excluir.'); setDeleteId(null); return }
      await supabase.from('pagamentos').delete().eq('id',row.pagamento_id)
    }
    const {error} = await supabase.from('adiantamentos').delete().eq('id',deleteId)
    setDeleteId(null)
    if(error) toast.error('Erro ao excluir')
    else { toast.success('Excluído!'); fetchData() }
  }

  // ─── render ───────────────────────────────────────────────────────────────
  return (
    <>
    <div style={{display:'flex', minHeight:'calc(100vh - 57px)', overflow:'hidden'}}>

      {/* ══════════ SIDEBAR ESQUERDA ══════════ */}
      <div style={{width:272, flexShrink:0, borderRight:'1px solid var(--border)', display:'flex', flexDirection:'column', overflow:'hidden'}}>

        {/* Cabeçalho sidebar */}
        <div style={{padding:'12px 12px 8px', background:'#1e3a5f', display:'flex', flexDirection:'column', gap:8}}>
          <div style={{display:'flex', alignItems:'center', justifyContent:'space-between'}}>
            <div style={{fontWeight:700, fontSize:13, color:'#fff', display:'flex', alignItems:'center', gap:6}}>
              <DollarSign size={14} color="#a78bfa"/> Adiantamentos
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
              {key:'todos'     as const, label:'todos',     val:rows.length,           bg:'rgba(255,255,255,.15)', cor:'#fff'},
              {key:'pendente'  as const, label:'pendentes', val:totais.ct.pendente,    bg:'rgba(251,191,36,.25)',  cor:'#fde68a'},
              {key:'aprovado'  as const, label:'aprovados', val:totais.ct.aprovado,    bg:'rgba(34,197,94,.25)',   cor:'#86efac'},
              {key:'pago'      as const, label:'pagos',     val:totais.ct.pago,        bg:'rgba(96,165,250,.25)',  cor:'#93c5fd'},
              {key:'cancelado' as const, label:'cancelados',val:totais.ct.cancelado,   bg:'rgba(248,113,113,.25)', cor:'#fca5a5'},
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
            : colabsFiltrados.length===0
              ? <div style={{padding:24, textAlign:'center', fontSize:12, color:'var(--muted-foreground)'}}>
                  {busca||filtroStatus!=='todos' ? 'Nenhum resultado' : 'Nenhum colaborador com adiantamento neste mês'}
                </div>
              : colabsFiltrados.map(c=>{
                  const cnt = contPorColab[c.id]
                  const ativo = colabSel?.id===c.id
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
                          {(cnt?.pendente??0)>0 && (
                            <span style={{fontSize:9, background:ativo?'rgba(255,255,255,0.3)':'#fef3c7', color:ativo?'#fff':'#b45309', borderRadius:8, padding:'1px 5px', fontWeight:700}}>
                              ⏳{cnt.pendente}
                            </span>
                          )}
                          {(cnt?.aprovado??0)>0 && (
                            <span style={{fontSize:9, background:ativo?'rgba(255,255,255,0.3)':'#dcfce7', color:ativo?'#fff':'#15803d', borderRadius:8, padding:'1px 5px', fontWeight:700}}>
                              ✓{cnt.aprovado}
                            </span>
                          )}
                          {(cnt?.pago??0)>0 && (
                            <span style={{fontSize:9, background:ativo?'rgba(255,255,255,0.3)':'#eff6ff', color:ativo?'#fff':'#1d4ed8', borderRadius:8, padding:'1px 5px', fontWeight:700}}>
                              💳{cnt.pago}
                            </span>
                          )}
                        </div>
                      </div>
                      <div style={{fontSize:13, fontWeight:600}}>{c.nome}</div>
                      <div style={{fontSize:11, opacity:0.7, display:'flex', justifyContent:'space-between'}}>
                        <span>{cnt?.total??0} lançamento(s)</span>
                        <span style={{fontWeight:700, color:ativo?'#c4b5fd':'#7c3aed'}}>{formatCurrency(cnt?.valor??0)}</span>
                      </div>
                    </button>
                  )
                })
          }
        </div>

        {/* Botão novo adiantamento */}
        <div style={{padding:'8px 10px', borderTop:'1px solid var(--border)', background:'var(--background)'}}>
          <button onClick={openCreate}
            style={{width:'100%', display:'flex', alignItems:'center', justifyContent:'center', gap:6, padding:'8px', borderRadius:8, background:'#7c3aed', color:'#fff', border:'none', cursor:'pointer', fontWeight:700, fontSize:13}}>
            <Plus size={14}/> Novo Adiantamento
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
                {label:'Pendentes',  val:totais.pendente, cor:'#b45309', bg:'#fffbeb', cnt:totais.ct.pendente},
                {label:'Aprovados',  val:totais.aprovado, cor:'#15803d', bg:'#f0fdf4', cnt:totais.ct.aprovado},
                {label:'Pagos',      val:totais.pago,     cor:'#1d4ed8', bg:'#eff6ff', cnt:totais.ct.pago},
                {label:'Total Geral',val:totais.pendente+totais.aprovado+totais.pago+totais.cancelado, cor:'#7c3aed', bg:'#f5f3ff', cnt:rows.length},
              ]).map(c=>(
                <div key={c.label} style={{border:`1.5px solid ${c.cor}30`, borderRadius:12, padding:'14px 16px', background:c.bg, textAlign:'center'}}>
                  <div style={{fontSize:12, color:c.cor, fontWeight:700, marginBottom:4}}>{c.label}</div>
                  <div style={{fontSize:18, fontWeight:900, color:c.cor}}>{formatCurrency(c.val)}</div>
                  <div style={{fontSize:11, color:c.cor, opacity:.7}}>{c.cnt} lançamento(s)</div>
                </div>
              ))}
            </div>
            <span style={{fontSize:44}}>👈</span>
            <div style={{fontSize:15, fontWeight:600}}>Selecione um colaborador</div>
            <div style={{fontSize:13, opacity:.6}}>ou clique em "+ Novo Adiantamento" para registrar</div>
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
                  Adiantamentos de <strong>{mesLabel(competencia)}</strong>
                </div>
              </div>
              <button onClick={fetchData}
                style={{width:30, height:30, borderRadius:7, border:'1px solid var(--border)', background:'var(--background)', cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center'}}>
                <RefreshCw size={13}/>
              </button>
              <Button onClick={openCreate} style={{background:'#7c3aed', color:'#fff', gap:5, height:30, fontSize:12}}>
                <Plus size={12}/> Novo Adiantamento
              </Button>
            </div>

            {/* Linha 2: filtros */}
            <div style={{padding:'6px 16px 8px', display:'flex', gap:8, alignItems:'center', borderTop:'1px solid var(--border)'}}>
              <Select value={filtroTipo} onValueChange={setFiltroTipo}>
                <SelectTrigger style={{fontSize:12, height:28, width:180}}><SelectValue placeholder="Todos os tipos"/></SelectTrigger>
                <SelectContent>
                  <SelectItem value="todos">Todos os tipos</SelectItem>
                  {TIPOS.map(t=><SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}
                </SelectContent>
              </Select>
              <Select value={filtroObra} onValueChange={setFiltroObra}>
                <SelectTrigger style={{fontSize:12, height:28, width:160}}><SelectValue placeholder="Todas as obras"/></SelectTrigger>
                <SelectContent>
                  <SelectItem value="todas">Todas as obras</SelectItem>
                  {obras.map(o=><SelectItem key={o.id} value={o.id}>{o.nome}</SelectItem>)}
                </SelectContent>
              </Select>
              {(filtroTipo!=='todos'||filtroObra!=='todas') && (
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
              ]).map(ab=>{
                const ativo = abaStatus===ab.key
                const cnt = rows.filter(r=>r.colaborador_id===colabSel.id&&r.status===ab.key).length
                return (
                  <button key={ab.key} onClick={()=>setAbaStatus(ab.key)}
                    style={{
                      padding:'9px 16px', border:'none',
                      borderBottom: ativo ? `3px solid ${ab.cor}` : '3px solid transparent',
                      background: ativo ? `${ab.cor}10` : 'transparent',
                      color: ativo ? ab.cor : 'var(--muted-foreground)',
                      fontWeight: ativo?700:500, fontSize:12, cursor:'pointer',
                      display:'flex', alignItems:'center', gap:5,
                      transition:'all 0.15s', marginBottom:-1,
                    }}>
                    {ab.label}
                    {cnt>0 && (
                      <span style={{background:ativo?ab.cor:'#9ca3af', color:'#fff', borderRadius:9, padding:'1px 6px', fontSize:10, fontWeight:700}}>
                        {cnt}
                      </span>
                    )}
                  </button>
                )
              })}
            </div>
          </div>

          {/* ── Conteúdo: tabela de adiantamentos ── */}
          <div style={{flex:1, overflowY:'auto', padding:'0 0 16px'}}>
            {adiantDoColab.length===0 ? (
              <div style={{padding:60, textAlign:'center', color:'var(--muted-foreground)'}}>
                <DollarSign size={40} style={{opacity:.2, display:'block', margin:'0 auto 12px'}}/>
                <div style={{fontWeight:700, fontSize:14}}>
                  Nenhum adiantamento nesta aba em {mesLabel(competencia)}
                </div>
                {abaStatus==='pendente' && (
                  <div style={{fontSize:12, marginTop:6, opacity:.7}}>
                    Clique em "+ Novo Adiantamento" para registrar.
                  </div>
                )}
              </div>
            ) : (
              <div style={{margin:'0 16px 0'}}>
                <table style={{width:'100%', borderCollapse:'collapse', fontSize:13}}>
                  <thead>
                    <tr style={{borderBottom:'2px solid var(--border)', background:'var(--muted)'}}>
                      <th style={{textAlign:'left', padding:'10px 12px', fontSize:11, fontWeight:700, color:'var(--muted-foreground)', textTransform:'uppercase', letterSpacing:'0.04em'}}>Tipo / Observação</th>
                      <th style={{textAlign:'left', padding:'10px 12px', fontSize:11, fontWeight:700, color:'var(--muted-foreground)', textTransform:'uppercase', letterSpacing:'0.04em'}}>Desconto (-AD)</th>
                      <th style={{textAlign:'right', padding:'10px 12px', fontSize:11, fontWeight:700, color:'#7c3aed', textTransform:'uppercase', letterSpacing:'0.04em'}}>Valor</th>
                      <th style={{textAlign:'right', padding:'10px 12px', fontSize:11, fontWeight:700, color:'var(--muted-foreground)', textTransform:'uppercase', letterSpacing:'0.04em'}}>Ações</th>
                    </tr>
                  </thead>
                  <tbody>
                    {adiantDoColab.map((r, i)=>{
                      const isPago = r.status==='pago'
                      const parcelasTotal = r.desconto_parcelas??1
                      const parcelasFeitas = r.desconto_parcela_atual??0
                      const foiRecusado = r.status==='pendente' && !r.pagamento_id
                      return (
                        <tr key={r.id} style={{borderBottom:'1px solid var(--border)', background: foiRecusado ? 'rgba(251,191,36,0.08)' : i%2===0?'var(--card)':'var(--background)'}}>
                          <td style={{padding:'10px 12px'}}>
                            <div style={{display:'flex', flexDirection:'column', gap:3}}>
                              <span style={{fontSize:11, fontWeight:700, padding:'3px 9px', borderRadius:6, background:'#f5f3ff', color:'#7c3aed', border:'1px solid #e9d5ff', width:'fit-content'}}>
                                {TIPO_LABEL[r.tipo]??r.tipo}
                              </span>
                              {r.observacoes && <span style={{fontSize:12, color:'var(--muted-foreground)'}}>{r.observacoes}</span>}
                              {isPago && (
                                <span style={{fontSize:10, color:r.pagamento_id?'#7c3aed':'#059669', fontWeight:600}}>
                                  {r.pagamento_id ? '💜 Via pagamento' : '✅ Via fechamento'}
                                </span>
                              )}
                              {foiRecusado && (
                                <span style={{fontSize:10, color:'#b45309', fontWeight:700, background:'#fef3c7', borderRadius:4, padding:'1px 6px', width:'fit-content'}}>
                                  ↩ Recusado — editável
                                </span>
                              )}
                            </div>
                          </td>
                          <td style={{padding:'10px 12px', fontSize:11}}>
                            <div style={{display:'flex', flexDirection:'column', gap:2}}>
                              {r.desconto_tipo==='parcelado' ? (
                                <span style={{background:'#fef3c7', color:'#b45309', borderRadius:4, padding:'2px 7px', fontWeight:700, display:'inline-flex', alignItems:'center', gap:3, width:'fit-content'}}>
                                  <Repeat size={10}/> {parcelasFeitas}/{parcelasTotal}x
                                </span>
                              ) : (
                                <span style={{background:'#eff6ff', color:'#1d4ed8', borderRadius:4, padding:'2px 7px', fontWeight:700, display:'inline-flex', alignItems:'center', gap:3, width:'fit-content'}}>
                                  💳 Único
                                </span>
                              )}
                              {r.desconto_a_partir && (
                                <span style={{fontSize:10, color:'var(--muted-foreground)'}}>
                                  A partir: {r.desconto_a_partir.slice(0,7)}
                                </span>
                              )}
                              {r.desconto_obs && (
                                <span style={{fontSize:10, color:'var(--muted-foreground)', maxWidth:140, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap'}} title={r.desconto_obs}>
                                  {r.desconto_obs}
                                </span>
                              )}
                            </div>
                          </td>
                          <td style={{padding:'10px 12px', textAlign:'right'}}>
                            <span style={{fontWeight:800, fontSize:14, color:'#7c3aed'}}>{formatCurrency(r.valor)}</span>
                          </td>
                          <td style={{padding:'10px 12px', textAlign:'right'}}>
                            <div style={{display:'flex', gap:4, justifyContent:'flex-end'}}>
                              {r.status==='pendente' && (
                                <button onClick={()=>setAprovarRow(r)} title="Aprovar"
                                  style={{height:28, padding:'0 10px', borderRadius:6, border:'1px solid #bbf7d0', background:'#f0fdf4', color:'#15803d', cursor:'pointer', fontSize:11, fontWeight:700, display:'flex', alignItems:'center', gap:4}}>
                                  <CheckCircle2 size={12}/> Aprovar
                                </button>
                              )}
                              {!isPago && ['pendente','aprovado'].includes(r.status) && (
                                <button onClick={()=>openEdit(r)} title="Editar"
                                  style={{width:28, height:28, borderRadius:6, border:'1px solid var(--border)', background:'var(--muted)', cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center'}}>
                                  <Pencil size={12}/>
                                </button>
                              )}
                              {r.status==='aprovado' && !isPago && (
                                <button onClick={()=>setCancelarRow(r)} title="Cancelar"
                                  style={{height:28, padding:'0 10px', borderRadius:6, border:'1px solid #fecaca', background:'#fff5f5', color:'#dc2626', cursor:'pointer', fontSize:11, fontWeight:700, display:'flex', alignItems:'center', gap:4}}>
                                  <XCircle size={12}/> Cancelar
                                </button>
                              )}
                              {r.requisicao_url && (
                                <a href={r.requisicao_url} target="_blank" rel="noopener noreferrer" title="Ver requisição"
                                  style={{width:28, height:28, borderRadius:6, border:'1px solid #bfdbfe', background:'#eff6ff', color:'#1d4ed8', display:'flex', alignItems:'center', justifyContent:'center', textDecoration:'none'}}>
                                  📎
                                </a>
                              )}
                              {isPago && (
                                <span title="Pago" style={{width:28, height:28, borderRadius:6, background:'#eff6ff', border:'1px solid #bfdbfe', display:'flex', alignItems:'center', justifyContent:'center', cursor:'help'}}>🔒</span>
                              )}
                              {(r.status==='pendente'||r.status==='cancelado') && (
                                <button onClick={()=>setDeleteId(r.id)} title="Excluir"
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
                    {adiantDoColab.length} lançamento(s) · aba atual
                  </span>
                  <span style={{fontWeight:800, fontSize:14, color:'#7c3aed'}}>
                    Total: {formatCurrency(adiantDoColab.reduce((s,r)=>s+r.valor,0))}
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
          <div style={{background:'linear-gradient(135deg, #7c3aed, #6d28d9)', padding:'18px 24px', flexShrink:0, borderRadius:'14px 14px 0 0'}}>
            <h2 style={{fontWeight:800, fontSize:17, margin:0, color:'#fff'}}>{editando?'✏️ Editar Adiantamento':'💵 Novo Adiantamento'}</h2>
            <p style={{fontSize:12, color:'rgba(255,255,255,.75)', margin:'4px 0 0'}}>{editando?'Altere os dados':'Registre um novo adiantamento ou vale'}</p>
          </div>
          {/* Corpo com scroll */}
          <div style={{padding:24, overflowY:'auto', flex:1}}>
            <div style={{display:'grid', gridTemplateColumns:'1fr 1fr', gap:14}}>
              <div style={{gridColumn:'1/-1'}}>
                <Label className="mb-1 block">Colaborador *</Label>
                <SearchableSelect
                  options={colabs.map(c=>({ value:c.id, label:c.nome, sublabel:c.chapa??'—' }))}
                  value={form.colaborador_id}
                  onChange={v=>setF('colaborador_id',v)}
                  placeholder="Pesquisar colaborador…"
                  emptyLabel="— Nenhum —"
                />
              </div>
              <div>
                <Label className="mb-1 block">Tipo *</Label>
                <Select value={form.tipo} onValueChange={v=>setF('tipo',v)}>
                  <SelectTrigger><SelectValue/></SelectTrigger>
                  <SelectContent>
                    {TIPOS.map(t=><SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="mb-1 block">Valor (R$) *</Label>
                <Input type="number" min="0" step="0.01" value={form.valor} onChange={e=>setF('valor',e.target.value)} placeholder="0,00"/>
              </div>
              <div>
                <Label className="mb-1 block">Competência *</Label>
                <input type="month" value={form.competencia} onChange={e=>setF('competencia',e.target.value)}
                  style={{height:36, width:'100%', padding:'0 10px', fontSize:13, border:'1.5px solid var(--border)', borderRadius:6, background:'var(--background)', color:'var(--foreground)', boxSizing:'border-box'}}/>
              </div>
              <div>
                <Label className="mb-1 block">Obra</Label>
                <Select value={form.obra_id||'nenhuma'} onValueChange={v=>setF('obra_id',v==='nenhuma'?'':v)}>
                  <SelectTrigger><SelectValue placeholder="Sem obra"/></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="nenhuma">Sem obra</SelectItem>
                    {obras.map(o=><SelectItem key={o.id} value={o.id}>{o.nome}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div style={{gridColumn:'1/-1'}}>
                <Label className="mb-1 block">Observações / Motivo</Label>
                <Textarea value={form.observacoes} onChange={e=>setF('observacoes',e.target.value)} placeholder="Motivo, detalhes…" rows={2}/>
              </div>
              {!editando && (
                <div style={{gridColumn:'1/-1'}}>
                  <Label className="mb-1 block">📎 Requisição Assinada <span style={{color:'#dc2626'}}>*</span></Label>
                  <input type="file" accept=".pdf,.jpg,.jpeg,.png" onChange={e=>setArquivoReq(e.target.files?.[0]??null)}
                    style={{width:'100%', padding:'8px', border:'1.5px solid var(--border)', borderRadius:6, fontSize:12}}/>
                  <div style={{fontSize:11, color:'var(--muted-foreground)', marginTop:4}}>PDF ou imagem da requisição assinada (obrigatório)</div>
                </div>
              )}
            </div>

            {/* Bloco desconto */}
            <div style={{border:'1.5px solid #fde68a', borderRadius:10, padding:'14px 16px', marginTop:14, background:'#fffbeb'}}>
              <div style={{fontWeight:700, fontSize:13, color:'#b45309', marginBottom:12, display:'flex', alignItems:'center', gap:6}}>
                <CalendarDays size={14}/> Desconto no Fechamento de Ponto (-AD)
              </div>
              <div style={{display:'grid', gridTemplateColumns:'1fr 1fr', gap:'10px 14px'}}>
                <div>
                  <Label className="mb-1 block" style={{fontSize:11}}>Tipo de Desconto *</Label>
                  <div style={{display:'flex', gap:8}}>
                    {([['unico','💳 Único'],['parcelado','🔄 Parcelado']] as const).map(([v,l])=>(
                      <button key={v} type="button" onClick={()=>setF('desconto_tipo',v)}
                        style={{flex:1, height:36, border:`1.5px solid ${form.desconto_tipo===v?'#b45309':'var(--border)'}`, borderRadius:8, background:form.desconto_tipo===v?'#fef3c7':'var(--background)', color:form.desconto_tipo===v?'#b45309':'var(--muted-foreground)', fontWeight:form.desconto_tipo===v?700:500, fontSize:12, cursor:'pointer'}}>
                        {l}
                      </button>
                    ))}
                  </div>
                </div>
                <div>
                  <Label className="mb-1 block" style={{fontSize:11}}>Descontar a partir de *</Label>
                  <input type="month" value={form.desconto_a_partir} onChange={e=>setF('desconto_a_partir',e.target.value)}
                    style={{height:36, width:'100%', padding:'0 10px', fontSize:13, border:'1.5px solid var(--border)', borderRadius:6, background:'var(--background)', color:'var(--foreground)', boxSizing:'border-box'}}/>
                </div>
                {form.desconto_tipo==='parcelado' && (
                  <div>
                    <Label className="mb-1 block" style={{fontSize:11}}>Número de Parcelas *</Label>
                    <Input type="number" min="2" max="24" value={form.desconto_parcelas} onChange={e=>setF('desconto_parcelas',e.target.value)} placeholder="Ex: 3"/>
                    {+form.desconto_parcelas>1 && +form.valor>0 && (
                      <div style={{fontSize:11, color:'#b45309', marginTop:4}}>
                        ≈ {formatCurrency(parseFloat(form.valor||'0')/parseInt(form.desconto_parcelas||'1'))} / parcela
                      </div>
                    )}
                  </div>
                )}
                <div style={{gridColumn:'1/-1'}}>
                  <Label className="mb-1 block" style={{fontSize:11}}>Obs. do Desconto</Label>
                  <Input value={form.desconto_obs} onChange={e=>setF('desconto_obs',e.target.value)} placeholder="Ex: Parcelado em 3x a partir de Abril/2026…"/>
                </div>
              </div>
              <div style={{fontSize:11, color:'#92400e', marginTop:8, display:'flex', alignItems:'flex-start', gap:4}}>
                <Info size={12} style={{flexShrink:0, marginTop:1}}/> No Fechamento de Ponto, aparecerá o botão <strong>-AD</strong> para aprovar o desconto parcela a parcela.
              </div>
            </div>

            <div style={{background:'#eff6ff', border:'1px solid #bfdbfe', borderRadius:8, padding:'10px 14px', fontSize:12, color:'#1e40af', marginTop:10}}>
              💡 Após registrar, clique em <strong>Aprovar</strong> para enviar à tela de <strong>Pagamentos</strong>.
            </div>
            <div style={{display:'flex', justifyContent:'flex-end', gap:10, marginTop:18}}>
              <Button variant="outline" onClick={()=>setModalOpen(false)}>Cancelar</Button>
              <Button disabled={saving} onClick={handleSave} style={{background:'#7c3aed', color:'#fff'}}>
                {saving?'Salvando…':editando?'💾 Salvar':'💵 Registrar'}
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
          <AlertDialogTitle>✅ Aprovar adiantamento?</AlertDialogTitle>
          <AlertDialogDescription>
            <strong>{aprovarRow?.colaboradores?.nome}</strong> — {formatCurrency(aprovarRow?.valor??0)} ({mesLabel(aprovarRow?.competencia??'')})<br/>
            Enviado para <strong>Pagamentos</strong> como pendente.
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
          <AlertDialogTitle>❌ Cancelar adiantamento?</AlertDialogTitle>
          <AlertDialogDescription>
            O adiantamento de <strong>{cancelarRow?.colaboradores?.nome}</strong> ({formatCurrency(cancelarRow?.valor??0)}) será cancelado e removido de Pagamentos.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Voltar</AlertDialogCancel>
          <AlertDialogAction onClick={confirmarCancelar} style={{background:'#dc2626',color:'#fff'}}>❌ Cancelar</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>

    <AlertDialog open={!!deleteId} onOpenChange={o=>{if(!o)setDeleteId(null)}}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>🗑️ Excluir adiantamento?</AlertDialogTitle>
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
