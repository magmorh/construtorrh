import React, { useEffect, useState, useCallback, useMemo } from 'react'
import { toast } from 'sonner'
import {
  Users, Trash2, Search, Building2, CheckCircle2, XCircle,
  Award, HardHat, ChevronRight, Trophy, RefreshCw, AlertTriangle, RotateCcw,
} from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { formatCurrency } from '@/lib/utils'
import { PageHeader } from '@/components/Shared'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog'
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table'
import { useProfile } from '@/hooks/useProfile'

// ─── Tipos ────────────────────────────────────────────────────────────────────
interface Obra { id: string; nome: string }
interface ColaboradorInfo { id: string; nome: string; chapa: string | null }

interface PlaybookPreco {
  id: string; atividade_id: string; obra_id: string
  preco_unitario: number
  valor_premiacao_enc:  number | null
  valor_premiacao_cabo: number | null
  encarregado_id: string | null
  cabo_id:        string | null
  playbook_atividades?: { descricao: string; unidade: string; categoria: string | null }
}

interface PbItem {
  id: string; obra_id: string; descricao: string; unidade: string; categoria: string | null
}

interface ProducaoItem {
  id: string; colaborador_id: string; obra_id: string | null
  playbook_item_id: string | null; quantidade: number
  mes_referencia: string
  num_retrabalhos?: number | null
  lancamento_id?: string | null
  colaboradores?: { nome: string; chapa: string | null }
  playbook_itens?:  { descricao: string; unidade: string; categoria: string | null }
}

interface ComissaoRow {
  id: string; obra_id: string | null; colaborador_id: string
  funcao: 'encarregado' | 'cabo'; descricao: string | null
  quantidade_total: number; valor_unitario_premiacao: number
  valor_bruto: number; num_cabos: number; valor_final: number
  competencia: string; status: string; premio_id: string | null
  observacoes: string | null; data_geracao: string
  obras?: { nome: string } | null
  colaboradores?: { nome: string; chapa: string | null }
}

/** Linha agrupada por atividade (para exibição na tabela) */
interface LinhaAtividade {
  playbook_item_id: string; descricao: string; unidade: string
  categoria: string | null
  // totais da atividade (soma de todos os colaboradores)
  qtdTotal: number
  totalPremioEnc: number; totalPremioCabo: number
  valorPremioEnc: number; valorPremioCabo: number
  encNome: string | null; caboNome: string | null
  encId: string | null; caboId: string | null
  // sub-linhas agrupadas por colaborador (não mais por registro individual)
  subColabs: { colaboradorId: string; nome: string; chapa: string | null; qtd: number }[]
}

interface EquipeObra { encarregados: ColaboradorInfo[]; cabos: ColaboradorInfo[] }
type Aba = 'vinculos' | 'calculo'

// ─── Helpers ──────────────────────────────────────────────────────────────────
const MESES = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro']
function mesLabel(ym: string) { if (!ym) return '—'; const [y,m] = ym.split('-'); return `${MESES[+m-1]} / ${y}` }
function norm(s: string | null | undefined) { return (s ?? '').toLowerCase().trim().replace(/\s+/g,' ') }
function fatorRetrabalho(n?: number | null) { const v=n??0; return v===0?1.0:v===1?0.5:0.0 }
function uniq<T extends {id:string}>(arr: T[]): T[] {
  const s=new Set<string>(); return arr.filter(c=>{if(s.has(c.id))return false;s.add(c.id);return true})
}

const STATUS_COR: Record<string,{bg:string;border:string;cor:string;label:string}> = {
  pendente:  {bg:'#fef3c7',border:'#fde68a',cor:'#b45309',label:'⏳ Pendente'},
  aprovado:  {bg:'#dcfce7',border:'#bbf7d0',cor:'#15803d',label:'✅ Aprovado'},
  cancelado: {bg:'#fee2e2',border:'#fecaca',cor:'#dc2626',label:'❌ Cancelado'},
}

// ─── Componente ───────────────────────────────────────────────────────────────
export default function ComissaoEquipe() {
  const { permissions: { canCreate, canEdit, canDelete } } = useProfile()
  const [aba, setAba] = useState<Aba>('vinculos')
  const [obras,     setObras]     = useState<Obra[]>([])
  const [colabs,    setColabs]    = useState<ColaboradorInfo[]>([])
  const [precos,    setPrecos]    = useState<PlaybookPreco[]>([])
  const [pbItens,   setPbItens]   = useState<PbItem[]>([])
  const [producoes, setProducoes] = useState<ProducaoItem[]>([])
  const [comissoes, setComissoes] = useState<ComissaoRow[]>([])
  const [loading,   setLoading]   = useState(true)

  const [competencia,    setCompetencia]    = useState(new Date().toISOString().slice(0,7))
  const [filtroStatus,   setFiltroStatus]   = useState('todos')
  const [busca,          setBusca]          = useState('')
  const [obraCalcSel,    setObraCalcSel]    = useState<Obra|null>(null)
  const [searchObraCalc, setSearchObraCalc] = useState('')

  const [aprovarCom,  setAprovarCom]  = useState<ComissaoRow|null>(null)
  const [cancelarCom, setCancelarCom] = useState<ComissaoRow|null>(null)
  const [deleteCom,   setDeleteCom]   = useState<ComissaoRow|null>(null)
  const [calculando,  setCalculando]  = useState(false)

  // ─── Fetch ──────────────────────────────────────────────────────────────────
  const fetchData = useCallback(async () => {
    setLoading(true)
    const [obrRes, preRes, pbRes, proRes, colRes, comRes] = await Promise.all([
      supabase.from('obras').select('id,nome').order('nome'),
      supabase.from('playbook_precos').select('id,obra_id,atividade_id,preco_unitario,valor_premiacao_enc,valor_premiacao_cabo,encarregado_id,cabo_id,playbook_atividades(descricao,unidade,categoria)'),
      supabase.from('playbook_itens').select('id,obra_id,descricao,unidade,categoria'),
      supabase.from('ponto_producao').select('id,colaborador_id,obra_id,playbook_item_id,quantidade,mes_referencia,lancamento_id,colaboradores(nome,chapa),playbook_itens(descricao,unidade,categoria)').eq('mes_referencia',competencia),
      supabase.from('colaboradores').select('id,nome,chapa').order('nome').limit(2000),
      supabase.from('comissoes_equipe_v2').select('*,obras(nome),colaboradores(nome,chapa)').eq('competencia',competencia).order('created_at',{ascending:false}),
    ])
    setObras     ((obrRes.data??[]) as Obra[])
    setPrecos    ((preRes.data??[]) as PlaybookPreco[])
    setPbItens   ((pbRes.data ??[]) as PbItem[])
    setProducoes ((proRes.data??[]).map((p:any)=>({...p,num_retrabalhos:p.num_retrabalhos??0})) as ProducaoItem[])
    setColabs    ((colRes.data??[]) as ColaboradorInfo[])
    setComissoes ((comRes.data??[]) as ComissaoRow[])
    setLoading(false)
  }, [competencia])
  useEffect(()=>{fetchData()},[fetchData])

  // ─── Mapas ──────────────────────────────────────────────────────────────────
  const colabsMap = useMemo(()=>{
    const m=new Map<string,ColaboradorInfo>(); colabs.forEach(c=>m.set(c.id,c)); return m
  },[colabs])

  const precosPorItemId = useMemo(()=>{
    const m=new Map<string,PlaybookPreco>()
    pbItens.forEach(item=>{
      const p=precos.find(p=>p.obra_id===item.obra_id&&norm(p.playbook_atividades?.descricao)===norm(item.descricao))
      if(p) m.set(`${item.obra_id}::${item.id}`,p)
    })
    return m
  },[pbItens,precos])

  const precosPorDesc = useMemo(()=>{
    const m=new Map<string,PlaybookPreco>()
    precos.forEach(p=>{if(p.playbook_atividades?.descricao) m.set(`${p.obra_id}::${norm(p.playbook_atividades.descricao)}`,p)})
    return m
  },[precos])

  function getPreco(obraId:string, prod:ProducaoItem): PlaybookPreco|undefined {
    if(prod.playbook_item_id){const v=precosPorItemId.get(`${obraId}::${prod.playbook_item_id}`);if(v)return v}
    const d=norm(prod.playbook_itens?.descricao); if(d) return precosPorDesc.get(`${obraId}::${d}`)
    return undefined
  }

  const equipePorObra = useMemo(()=>{
    const m=new Map<string,EquipeObra>()
    precos.forEach(p=>{
      if(!m.has(p.obra_id))m.set(p.obra_id,{encarregados:[],cabos:[]})
      const eq=m.get(p.obra_id)!
      if(p.encarregado_id){const c=colabsMap.get(p.encarregado_id);if(c)eq.encarregados.push(c)}
      if(p.cabo_id){const c=colabsMap.get(p.cabo_id);if(c)eq.cabos.push(c)}
    })
    m.forEach(eq=>{eq.encarregados=uniq(eq.encarregados);eq.cabos=uniq(eq.cabos)})
    return m
  },[precos,colabsMap])

  // ─── Calcular ───────────────────────────────────────────────────────────────
  async function calcularComissoes() {
    if(!canCreate)return
    setCalculando(true); let gerados=0,erros=0
    const porObra=new Map<string,ProducaoItem[]>()
    producoes.forEach(p=>{if(!p.obra_id)return;if(!porObra.has(p.obra_id))porObra.set(p.obra_id,[]);porObra.get(p.obra_id)!.push(p)})

    for(const [obraId,prods] of porObra.entries()){
      const gpi=new Map<string,ProducaoItem[]>()
      prods.forEach(p=>{const k=p.playbook_item_id??norm(p.playbook_itens?.descricao??'');if(!k)return;if(!gpi.has(k))gpi.set(k,[]);gpi.get(k)!.push(p)})
      const totEnc=new Map<string,{total:number;det:string[]}>()
      const totCabo=new Map<string,{total:number;det:string[]}>()

      for(const [,itens] of gpi.entries()){
        const ref=itens[0]; const po=getPreco(obraId,ref); if(!po)continue
        const qtdTot=itens.reduce((s,p)=>s+p.quantidade,0)
        let qEf=0; itens.forEach(p=>{qEf+=p.quantidade*fatorRetrabalho(p.num_retrabalhos)})
        const nom=ref.playbook_itens?.descricao??po.playbook_atividades?.descricao??'?'
        const un=ref.playbook_itens?.unidade??''
        if(po.encarregado_id&&(po.valor_premiacao_enc??0)>0){
          const val=(po.valor_premiacao_enc??0)*qEf
          if(!totEnc.has(po.encarregado_id))totEnc.set(po.encarregado_id,{total:0,det:[]})
          const e=totEnc.get(po.encarregado_id)!
          e.total+=val; e.det.push(`${nom}: ${qtdTot}${un} × R$${(po.valor_premiacao_enc??0).toFixed(2)} = R$${val.toFixed(2)}`)
        }
        if(po.cabo_id&&(po.valor_premiacao_cabo??0)>0){
          const val=(po.valor_premiacao_cabo??0)*qEf
          if(!totCabo.has(po.cabo_id))totCabo.set(po.cabo_id,{total:0,det:[]})
          const e=totCabo.get(po.cabo_id)!
          e.total+=val; e.det.push(`${nom}: ${qtdTot}${un} × R$${(po.valor_premiacao_cabo??0).toFixed(2)} = R$${val.toFixed(2)}`)
        }
      }

      const qtdObraTot=prods.reduce((s,p)=>s+p.quantidade,0)
      for(const [encId,{total,det}] of totEnc.entries()){
        if(total<=0)continue
        const jaAprov=comissoes.find(c=>c.obra_id===obraId&&c.colaborador_id===encId&&c.funcao==='encarregado'&&c.competencia===competencia&&c.status==='aprovado')
        if(jaAprov)continue
        const {error}=await supabase.from('comissoes_equipe_v2').upsert({
          obra_id:obraId,colaborador_id:encId,funcao:'encarregado' as const,
          descricao:`Premiação Encarregado – ${det.join(' | ')}`,
          quantidade_total:qtdObraTot,valor_unitario_premiacao:0,valor_bruto:total,num_cabos:1,valor_final:total,
          competencia,status:'pendente',data_geracao:new Date().toISOString().slice(0,10),observacoes:det.join('\n'),
        },{onConflict:'obra_id,colaborador_id,funcao,competencia',ignoreDuplicates:false})
        if(error){console.error('[ENC]',error);erros++}else gerados++
      }
      for(const [caboId,{total,det}] of totCabo.entries()){
        if(total<=0)continue
        const jaAprov=comissoes.find(c=>c.obra_id===obraId&&c.colaborador_id===caboId&&c.funcao==='cabo'&&c.competencia===competencia&&c.status==='aprovado')
        if(jaAprov)continue
        const {error}=await supabase.from('comissoes_equipe_v2').upsert({
          obra_id:obraId,colaborador_id:caboId,funcao:'cabo' as const,
          descricao:`Premiação Cabo – ${det.join(' | ')}`,
          quantidade_total:qtdObraTot,valor_unitario_premiacao:0,valor_bruto:total,num_cabos:totCabo.size,valor_final:total,
          competencia,status:'pendente',data_geracao:new Date().toISOString().slice(0,10),observacoes:det.join('\n'),
        },{onConflict:'obra_id,colaborador_id,funcao,competencia',ignoreDuplicates:false})
        if(error){console.error('[CABO]',error);erros++}else gerados++
      }
    }
    setCalculando(false)
    if(erros>0) toast.error(`${erros} erro(s). Verifique o console.`)
    else if(gerados===0) toast.warning('Nenhuma premiação gerada. Verifique enc/cabo no Playbook → Preços.')
    else toast.success(`${gerados} premiação(ões) calculada(s) para ${mesLabel(competencia)}!`)
    fetchData()
  }

  // ─── Ações ──────────────────────────────────────────────────────────────────
  async function handleAprovar() {
    if(!aprovarCom)return
    if(aprovarCom.valor_final<=0){toast.error('Valor final é zero.');setAprovarCom(null);return}
    const {data:pd,error:pe}=await supabase.from('premios').insert({
      colaborador_id:aprovarCom.colaborador_id,obra_id:aprovarCom.obra_id,tipo:'Produtividade',
      descricao:`Premiação ${aprovarCom.funcao==='encarregado'?'Encarregado':'Cabo'} — ${mesLabel(aprovarCom.competencia)}`,
      valor:aprovarCom.valor_final,data:new Date().toISOString().slice(0,10),
      competencia:aprovarCom.competencia,observacoes:aprovarCom.observacoes??'',status:'pendente',
    }).select('id').single()
    if(pe||!pd){toast.error('Erro ao criar prêmio');return}
    await supabase.from('comissoes_equipe_v2').update({status:'aprovado',premio_id:pd.id}).eq('id',aprovarCom.id)
    toast.success('Aprovado! Prêmio gerado.');setAprovarCom(null);fetchData()
  }

  // Recusar: volta para pendente (não cancela definitivamente)
  async function handleRecusar() {
    if(!cancelarCom)return
    await supabase.from('comissoes_equipe_v2').update({status:'pendente',premio_id:null}).eq('id',cancelarCom.id)
    toast.info('Premiação devolvida para pendente.');setCancelarCom(null);fetchData()
  }

  async function handleDelete() {
    if(!deleteCom)return
    await supabase.from('comissoes_equipe_v2').delete().eq('id',deleteCom.id)
    toast.success('Excluído.');setDeleteCom(null);fetchData()
  }

  // ─── Linhas de atividade (agrupadas por colaborador) ────────────────────────
  const linhasAtividade = useMemo(():LinhaAtividade[]=>{
    if(!obraCalcSel)return[]
    const prodsObra=producoes.filter(p=>p.obra_id===obraCalcSel.id)
    if(!prodsObra.length)return[]

    const gpi=new Map<string,ProducaoItem[]>()
    prodsObra.forEach(p=>{
      const k=p.playbook_item_id??norm(p.playbook_itens?.descricao??'')
      if(!k)return; if(!gpi.has(k))gpi.set(k,[]); gpi.get(k)!.push(p)
    })

    const linhas:LinhaAtividade[]=[]
    for(const [itemId,itens] of gpi.entries()){
      const ref=itens[0]; const po=getPreco(obraCalcSel.id,ref)
      const vEnc=po?.valor_premiacao_enc??0; const vCabo=po?.valor_premiacao_cabo??0
      let tEnc=0,tCabo=0
      // Agrupar sub-linhas por colaborador (somar quantidades)
      const colabQtd=new Map<string,number>()
      itens.forEach(prod=>{
        const f=fatorRetrabalho(prod.num_retrabalhos)
        tEnc+=prod.quantidade*vEnc*f; tCabo+=prod.quantidade*vCabo*f
        colabQtd.set(prod.colaborador_id,(colabQtd.get(prod.colaborador_id)??0)+prod.quantidade)
      })
      const subColabs=[...colabQtd.entries()].map(([cid,qtd])=>{
        const c=itens.find(p=>p.colaborador_id===cid)
        return {colaboradorId:cid,nome:c?.colaboradores?.nome??'—',chapa:c?.colaboradores?.chapa??null,qtd}
      }).sort((a,b)=>a.nome.localeCompare(b.nome))

      linhas.push({
        playbook_item_id:itemId,
        descricao:ref.playbook_itens?.descricao??po?.playbook_atividades?.descricao??'—',
        unidade:ref.playbook_itens?.unidade??po?.playbook_atividades?.unidade??'—',
        categoria:ref.playbook_itens?.categoria??po?.playbook_atividades?.categoria??null,
        qtdTotal:itens.reduce((s,p)=>s+p.quantidade,0),
        totalPremioEnc:tEnc,totalPremioCabo:tCabo,
        valorPremioEnc:vEnc,valorPremioCabo:vCabo,
        encNome:po?.encarregado_id?(colabsMap.get(po.encarregado_id)?.nome??null):null,
        caboNome:po?.cabo_id?(colabsMap.get(po.cabo_id)?.nome??null):null,
        encId:po?.encarregado_id??null,caboId:po?.cabo_id??null,
        subColabs,
      })
    }
    return linhas.sort((a,b)=>(a.categoria??'Z').localeCompare(b.categoria??'Z')||a.descricao.localeCompare(b.descricao))
  },[obraCalcSel,producoes,precosPorItemId,precosPorDesc,colabsMap])

  const totalEncObra  = linhasAtividade.reduce((s,l)=>s+l.totalPremioEnc, 0)
  const totalCaboObra = linhasAtividade.reduce((s,l)=>s+l.totalPremioCabo,0)
  const equipeCalc = obraCalcSel?(equipePorObra.get(obraCalcSel.id)??{encarregados:[],cabos:[]}): {encarregados:[],cabos:[]}

  const resumoEnc = useMemo(()=>{
    const m=new Map<string,number>()
    linhasAtividade.forEach(l=>{if(l.encId&&l.totalPremioEnc>0) m.set(l.encId,(m.get(l.encId)??0)+l.totalPremioEnc)})
    return m
  },[linhasAtividade])
  const resumoCabo = useMemo(()=>{
    const m=new Map<string,number>()
    linhasAtividade.forEach(l=>{if(l.caboId&&l.totalPremioCabo>0) m.set(l.caboId,(m.get(l.caboId)??0)+l.totalPremioCabo)})
    return m
  },[linhasAtividade])

  function calcRapido(obra:Obra){
    const prods=producoes.filter(p=>p.obra_id===obra.id)
    const qtd=prods.reduce((s,p)=>s+p.quantidade,0)
    let tot=0
    const gpi2=new Map<string,ProducaoItem[]>()
    prods.forEach(p=>{const k=p.playbook_item_id??norm(p.playbook_itens?.descricao??'');if(!k)return;if(!gpi2.has(k))gpi2.set(k,[]);gpi2.get(k)!.push(p)})
    for(const [,itens] of gpi2.entries()){const ref=itens[0];const po=getPreco(obra.id,ref);if(!po)continue;itens.forEach(p=>{tot+=p.quantidade*((po.valor_premiacao_enc??0)+(po.valor_premiacao_cabo??0))*fatorRetrabalho(p.num_retrabalhos)})}
    return {qtd,tot}
  }

  // ─── Render ─────────────────────────────────────────────────────────────────
  const calcBtn = (
    <Button onClick={calcularComissoes} disabled={calculando} size="sm" style={{gap:6}}>
      <RefreshCw size={14} className={calculando?'animate-spin':''}/>
      {calculando?'Calculando…':`Calcular ${mesLabel(competencia)}`}
    </Button>
  )

  return (
    <div className="page-container">
      <PageHeader
        title="Comissão sobre Produtividade"
        subtitle="Premiação automática por produção — Encarregado e Cabo vinculados nas atividades do Playbook"
        icon={<Trophy size={18}/>}
        action={aba==='calculo'?calcBtn:undefined}
      />

      {/* Abas + competência */}
      <div className="flex items-center gap-3 mb-5 flex-wrap">
        <div style={{display:'flex',gap:4,background:'var(--muted)',borderRadius:10,padding:4}}>
          {([{id:'vinculos',label:'🔗 Vínculos por Obra'},{id:'calculo',label:'💰 Cálculo de Premiações'}] as const).map(t=>(
            <button key={t.id} onClick={()=>setAba(t.id)} style={{padding:'6px 16px',borderRadius:8,border:'none',cursor:'pointer',fontSize:13,fontWeight:600,background:aba===t.id?'var(--card)':'transparent',color:aba===t.id?'var(--primary)':'var(--muted-foreground)',boxShadow:aba===t.id?'0 1px 3px rgba(0,0,0,.1)':'none',transition:'all .15s'}}>{t.label}</button>
          ))}
        </div>
        {aba==='calculo'&&(
          <div className="flex items-center gap-2 bg-card border border-border rounded-lg px-3 py-1.5">
            <span className="text-xs font-semibold text-muted-foreground">Competência:</span>
            <input type="month" value={competencia} onChange={e=>{setCompetencia(e.target.value);setObraCalcSel(null)}} style={{border:'none',outline:'none',fontSize:13,fontWeight:700,color:'var(--primary)',background:'transparent'}}/>
          </div>
        )}
        {aba==='calculo'&&<div className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-1.5">🔒 Aprovadas não são alteradas ao recalcular</div>}
      </div>

      {/* ══ VÍNCULOS ══════════════════════════════════════════════════════════ */}
      {aba==='vinculos'&&(
        <div>
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 mb-4 text-sm text-blue-700">
            📌 Vínculos configurados em <strong>Playbooks → Preços por Obra</strong> (colunas R$ Enc. e R$ Cabo). Refletidos automaticamente abaixo.
          </div>
          {loading?<div className="text-center py-10 text-muted-foreground">Carregando…</div>:(
            <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fill,minmax(320px,1fr))',gap:12}}>
              {obras.map(obra=>{
                const eq=equipePorObra.get(obra.id)??{encarregados:[],cabos:[]}
                const qtd=producoes.filter(p=>p.obra_id===obra.id).reduce((s,p)=>s+p.quantidade,0)
                return(
                  <div key={obra.id} className="bg-card border border-border rounded-xl p-4">
                    <div className="flex items-center gap-3 mb-3">
                      <div style={{width:36,height:36,borderRadius:9,background:'var(--primary)',display:'flex',alignItems:'center',justifyContent:'center',flexShrink:0}}><Building2 size={16} color="#fff"/></div>
                      <div style={{flex:1,minWidth:0}}>
                        <div className="font-bold text-sm truncate">{obra.nome}</div>
                        <div className="text-xs text-muted-foreground">{qtd>0?`${qtd.toLocaleString('pt-BR')} un. em ${mesLabel(competencia)}`:'Sem produção neste mês'}</div>
                      </div>
                    </div>
                    <div className="mb-2">
                      <div className="text-xs font-bold text-orange-600 uppercase tracking-wide mb-1">👷 Encarregado(s)</div>
                      {eq.encarregados.length===0?<div className="text-xs text-muted-foreground italic">— não vinculado —</div>
                       :eq.encarregados.map(c=><div key={c.id} className="text-sm font-semibold flex items-center gap-1"><HardHat size={12} color="#c2410c"/>{c.nome}</div>)}
                    </div>
                    <div>
                      <div className="text-xs font-bold text-blue-600 uppercase tracking-wide mb-1">🔧 Cabo(s)</div>
                      {eq.cabos.length===0?<div className="text-xs text-muted-foreground italic">— não vinculado —</div>
                       :eq.cabos.map(c=><div key={c.id} className="text-sm font-semibold flex items-center gap-1 mb-0.5"><Users size={11} color="#0369a1"/>{c.nome}</div>)}
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      )}

      {/* ══ CÁLCULO ═══════════════════════════════════════════════════════════ */}
      {aba==='calculo'&&(
        <div style={{display:'grid',gridTemplateColumns:'260px 1fr',gap:16,alignItems:'start'}}>

          {/* Lista obras */}
          <div className="bg-card border border-border rounded-xl overflow-hidden" style={{position:'sticky',top:20}}>
            <div className="px-3 py-3 border-b border-border bg-muted/50">
              <p className="text-sm font-bold mb-2 flex items-center gap-1"><Building2 size={13}/> Obras</p>
              <div style={{position:'relative'}}>
                <Search size={12} style={{position:'absolute',left:8,top:'50%',transform:'translateY(-50%)',color:'var(--muted-foreground)'}}/>
                <Input style={{paddingLeft:26,height:30,fontSize:12}} placeholder="Filtrar…" value={searchObraCalc} onChange={e=>setSearchObraCalc(e.target.value)}/>
              </div>
            </div>
            <div style={{maxHeight:520,overflowY:'auto'}}>
              {loading?<div className="p-4 text-center text-xs text-muted-foreground">Carregando…</div>
               :obras.filter(o=>!searchObraCalc||o.nome.toLowerCase().includes(searchObraCalc.toLowerCase())).map(obra=>{
                const isSel=obraCalcSel?.id===obra.id
                const eq=equipePorObra.get(obra.id)
                const temEq=eq&&(eq.encarregados.length>0||eq.cabos.length>0)
                const {qtd,tot}=calcRapido(obra)
                return(
                  <button key={obra.id} type="button" onClick={()=>setObraCalcSel(obra)} style={{display:'flex',alignItems:'center',gap:8,width:'100%',padding:'10px 12px',border:'none',cursor:'pointer',textAlign:'left',borderLeft:isSel?'3px solid var(--primary)':'3px solid transparent',background:isSel?'rgba(var(--primary-rgb),.06)':'transparent',borderBottom:'1px solid var(--border)'}}>
                    <div style={{width:32,height:32,borderRadius:7,flexShrink:0,display:'flex',alignItems:'center',justifyContent:'center',fontSize:10,fontWeight:700,background:isSel?'var(--primary)':'var(--muted)',color:isSel?'#fff':'var(--muted-foreground)'}}>{obra.nome.slice(0,2).toUpperCase()}</div>
                    <div style={{flex:1,minWidth:0}}>
                      <p className="text-sm truncate" style={{fontWeight:isSel?700:500,color:isSel?'var(--primary)':'var(--foreground)',margin:0}}>{obra.nome}</p>
                      <div className="text-xs text-muted-foreground mt-0.5">
                        {qtd>0?<>{qtd.toLocaleString('pt-BR')} un.{tot>0&&<span className="text-green-600 font-semibold ml-1">· {formatCurrency(tot)}</span>}</>:<span>Sem produção</span>}
                      </div>
                    </div>
                    {!temEq&&<span className="text-xs bg-amber-100 text-amber-700 rounded-full px-1.5 py-0.5 shrink-0">s/eq</span>}
                    <ChevronRight size={12} color={isSel?'var(--primary)':'var(--muted-foreground)'}/>
                  </button>
                )
              })}
            </div>
          </div>

          {/* Painel detalhe */}
          {!obraCalcSel?(
            <div className="flex flex-col items-center justify-center py-16 border-2 border-dashed border-border rounded-xl text-muted-foreground gap-3">
              <Trophy size={40} style={{opacity:.2}}/><p className="font-medium">Selecione uma obra</p>
              <p className="text-sm">← Escolha a obra para ver atividades e calcular comissões</p>
            </div>
          ):(
            <div className="bg-card border border-border rounded-xl overflow-hidden">

              {/* Header da obra */}
              <div style={{padding:'14px 18px',background:'var(--primary)',color:'#fff'}}>
                <div className="flex items-start justify-between gap-3 flex-wrap">
                  <div>
                    <div style={{fontWeight:800,fontSize:16}}>{obraCalcSel.nome}</div>
                    <div style={{fontSize:12,opacity:.75,marginTop:2}}>{linhasAtividade.length} atividade(s) · {mesLabel(competencia)}</div>
                  </div>
                  <div className="flex gap-2 flex-wrap">
                    <div style={{background:'rgba(255,255,255,.15)',borderRadius:8,padding:'8px 12px',minWidth:110}}>
                      <div style={{fontSize:10,opacity:.75,marginBottom:2}}>👷 Total Enc.</div>
                      <div style={{fontSize:15,fontWeight:800,color:'#fde68a'}}>{formatCurrency(totalEncObra)}</div>
                      {equipeCalc.encarregados.length>0&&<div style={{fontSize:10,opacity:.6,marginTop:1}}>{equipeCalc.encarregados.map(c=>c.nome.split(' ')[0]).join(', ')}</div>}
                    </div>
                    <div style={{background:'rgba(255,255,255,.15)',borderRadius:8,padding:'8px 12px',minWidth:110}}>
                      <div style={{fontSize:10,opacity:.75,marginBottom:2}}>🔧 Total Cabo</div>
                      <div style={{fontSize:15,fontWeight:800,color:'#bfdbfe'}}>{formatCurrency(totalCaboObra)}</div>
                      {equipeCalc.cabos.length>0&&<div style={{fontSize:10,opacity:.6,marginTop:1}}>{equipeCalc.cabos.map(c=>c.nome.split(' ')[0]).join(', ')}</div>}
                    </div>
                  </div>
                </div>
                {equipeCalc.encarregados.length===0&&<div style={{marginTop:8,background:'rgba(245,158,11,.25)',borderRadius:6,padding:'6px 10px',fontSize:11,color:'#fde68a',display:'flex',alignItems:'center',gap:6}}><AlertTriangle size={12}/> Nenhum encarregado vinculado</div>}
                {equipeCalc.cabos.length===0&&<div style={{marginTop:6,background:'rgba(245,158,11,.25)',borderRadius:6,padding:'6px 10px',fontSize:11,color:'#fde68a',display:'flex',alignItems:'center',gap:6}}><AlertTriangle size={12}/> Nenhum cabo vinculado</div>}
              </div>

              {/* Tabela atividades */}
              {linhasAtividade.length===0?(
                <div className="flex flex-col items-center py-10 text-muted-foreground gap-2">
                  <Trophy size={32} style={{opacity:.2}}/><div className="font-semibold">Sem produção em {mesLabel(competencia)}</div>
                  <div className="text-sm">Lance produções no portal para calcular.</div>
                </div>
              ):(
                <div style={{overflowX:'auto'}}>
                  <Table>
                    <TableHeader>
                      <TableRow className="bg-muted/50">
                        <TableHead className="w-24">Categoria</TableHead>
                        <TableHead>Atividade / Colaboradores</TableHead>
                        <TableHead className="text-center w-16">Unid.</TableHead>
                        <TableHead className="text-right w-24">Qtd. Total</TableHead>
                        <TableHead className="text-center w-28">Enc.</TableHead>
                        <TableHead className="text-center w-28">Cabo</TableHead>
                        <TableHead className="text-right w-28 text-orange-600 font-bold">💰 Enc.</TableHead>
                        <TableHead className="text-right w-28 text-blue-600 font-bold">💰 Cabo</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {linhasAtividade.map((linha,idx)=>(
                        <React.Fragment key={linha.playbook_item_id}>
                          {/* Linha da atividade */}
                          <TableRow style={{background:idx%2===0?'transparent':'var(--muted/20)'}}>
                            <TableCell><span className="text-xs font-medium px-2 py-0.5 rounded" style={{background:'rgba(var(--primary-rgb),.08)',color:'var(--primary)'}}>{linha.categoria??'Outros'}</span></TableCell>
                            <TableCell>
                              <div className="font-bold text-sm">{linha.descricao}</div>
                              {/* Sub-linhas por colaborador (agrupadas) */}
                              {linha.subColabs.map(sc=>(
                                <div key={sc.colaboradorId} className="flex items-center gap-1.5 mt-0.5">
                                  <span className="text-xs text-muted-foreground">↳</span>
                                  <span className="text-xs font-medium">{sc.nome}</span>
                                  {sc.chapa&&<span className="text-xs text-muted-foreground font-mono">({sc.chapa})</span>}
                                  <span className="text-xs text-muted-foreground">— {sc.qtd.toLocaleString('pt-BR')} {linha.unidade}</span>
                                </div>
                              ))}
                            </TableCell>
                            <TableCell className="text-center"><span className="font-mono text-xs font-bold">{linha.unidade}</span></TableCell>
                            <TableCell className="text-right font-bold">{linha.qtdTotal.toLocaleString('pt-BR')}</TableCell>
                            <TableCell className="text-center">
                              {linha.encNome?<span className="text-xs font-semibold text-orange-700 bg-orange-50 border border-orange-200 rounded-full px-2 py-0.5">👷 {linha.encNome.split(' ')[0]}</span>:<span className="text-xs text-muted-foreground">—</span>}
                              {linha.valorPremioEnc>0&&<div className="text-xs text-orange-600 mt-0.5">R${linha.valorPremioEnc.toFixed(2)}/un.</div>}
                            </TableCell>
                            <TableCell className="text-center">
                              {linha.caboNome?<span className="text-xs font-semibold text-blue-700 bg-blue-50 border border-blue-200 rounded-full px-2 py-0.5">🔧 {linha.caboNome.split(' ')[0]}</span>:<span className="text-xs text-muted-foreground">—</span>}
                              {linha.valorPremioCabo>0&&<div className="text-xs text-blue-600 mt-0.5">R${linha.valorPremioCabo.toFixed(2)}/un.</div>}
                            </TableCell>
                            <TableCell className="text-right"><span className="font-bold" style={{color:linha.totalPremioEnc>0?'#c2410c':'var(--muted-foreground)',fontSize:14}}>{formatCurrency(linha.totalPremioEnc)}</span></TableCell>
                            <TableCell className="text-right"><span className="font-bold" style={{color:linha.totalPremioCabo>0?'#0369a1':'var(--muted-foreground)',fontSize:14}}>{formatCurrency(linha.totalPremioCabo)}</span></TableCell>
                          </TableRow>
                        </React.Fragment>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}

              {/* Rodapé resumo + gerar */}
              {linhasAtividade.length>0&&(
                <div className="px-4 py-3 border-t border-border bg-muted/30">
                  <div className="flex gap-8 flex-wrap mb-3">
                    <div>
                      <div className="text-xs font-bold text-orange-600 uppercase tracking-wide mb-2">👷 Encarregado(s) recebem</div>
                      {resumoEnc.size===0?<div className="text-xs text-muted-foreground italic">— nenhum vinculado —</div>
                       :[...resumoEnc.entries()].map(([id,val])=>{const c=colabsMap.get(id);return<div key={id} className="flex items-center gap-2 mb-1"><HardHat size={13} color="#c2410c"/><span className="font-bold text-sm">{c?.nome??id}</span><span className="font-extrabold text-base text-orange-600">{formatCurrency(val)}</span></div>})}
                    </div>
                    <div>
                      <div className="text-xs font-bold text-blue-600 uppercase tracking-wide mb-2">🔧 Cabo(s) recebem</div>
                      {resumoCabo.size===0?<div className="text-xs text-muted-foreground italic">— nenhum vinculado —</div>
                       :[...resumoCabo.entries()].map(([id,val])=>{const c=colabsMap.get(id);return<div key={id} className="flex items-center gap-2 mb-1"><Users size={12} color="#0369a1"/><span className="font-bold text-sm">{c?.nome??id}</span><span className="font-extrabold text-base text-blue-600">{formatCurrency(val)}</span></div>})}
                    </div>
                  </div>
                  {canCreate&&<div className="flex justify-end">{calcBtn}</div>}
                </div>
              )}

              {/* Prêmios lançados */}
              <div className="px-4 py-4 border-t border-border">
                <div className="text-sm font-bold mb-3 flex items-center gap-2"><Award size={14} className="text-amber-500"/> Prêmios Lançados — {obraCalcSel.nome}</div>
                <div className="flex gap-2 mb-3 flex-wrap">
                  <Select value={filtroStatus} onValueChange={setFiltroStatus}>
                    <SelectTrigger style={{width:160,height:32}}><SelectValue/></SelectTrigger>
                    <SelectContent><SelectItem value="todos">Todos</SelectItem><SelectItem value="pendente">⏳ Pendente</SelectItem><SelectItem value="aprovado">✅ Aprovado</SelectItem><SelectItem value="cancelado">❌ Cancelado</SelectItem></SelectContent>
                  </Select>
                  <div style={{position:'relative',flex:1,minWidth:140}}><Search size={12} style={{position:'absolute',left:8,top:'50%',transform:'translateY(-50%)',color:'var(--muted-foreground)'}}/><Input value={busca} onChange={e=>setBusca(e.target.value)} placeholder="Buscar…" style={{paddingLeft:26,height:32}}/></div>
                </div>
                {/* Cards resumo */}
                <div style={{display:'grid',gridTemplateColumns:'repeat(3,1fr)',gap:8,marginBottom:12}}>
                  {[
                    {label:'Pendente',val:comissoes.filter(c=>c.obra_id===obraCalcSel.id&&c.status==='pendente').reduce((s,c)=>s+c.valor_final,0),cor:'#b45309',bg:'#fffbeb',icon:'⏳'},
                    {label:'Aprovado',val:comissoes.filter(c=>c.obra_id===obraCalcSel.id&&c.status==='aprovado').reduce((s,c)=>s+c.valor_final,0),cor:'#15803d',bg:'#f0fdf4',icon:'✅'},
                    {label:'Total',val:comissoes.filter(c=>c.obra_id===obraCalcSel.id).reduce((s,c)=>s+c.valor_final,0),cor:'var(--primary)',bg:'var(--muted)',icon:'📊'},
                  ].map(card=><div key={card.label} style={{background:card.bg,border:`1px solid ${card.cor}22`,borderRadius:8,padding:'8px 10px'}}><div className="text-xs font-semibold text-muted-foreground mb-1">{card.icon} {card.label}</div><div style={{fontSize:15,fontWeight:800,color:card.cor}}>{formatCurrency(card.val)}</div></div>)}
                </div>
                {/* Tabela lançamentos */}
                {comissoes.filter(c=>c.obra_id===obraCalcSel.id).length===0?(
                  <div className="text-center text-xs text-muted-foreground py-4 bg-muted/30 rounded-lg">Nenhum lançamento. Clique em "Calcular" acima.</div>
                ):(
                  <div className="border border-border rounded-lg overflow-hidden">
                    <Table>
                      <TableHeader><TableRow className="bg-muted/50"><TableHead>Colaborador</TableHead><TableHead className="text-center">Função</TableHead><TableHead className="text-right font-bold">💰 Premiação</TableHead><TableHead className="text-center">Status</TableHead><TableHead className="text-center">Ações</TableHead></TableRow></TableHeader>
                      <TableBody>
                        {comissoes.filter(c=>c.obra_id===obraCalcSel.id&&(filtroStatus==='todos'||c.status===filtroStatus)&&(!busca||(c.colaboradores?.nome??'').toLowerCase().includes(busca.toLowerCase()))).map((c,idx)=>{
                          const st=STATUS_COR[c.status]??STATUS_COR.pendente
                          return(
                            <TableRow key={c.id} style={{background:idx%2===0?'transparent':'var(--muted/10)'}}>
                              <TableCell><div className="font-bold text-sm">{c.colaboradores?.nome??'—'}</div>{c.colaboradores?.chapa&&<div className="text-xs text-muted-foreground font-mono">{c.colaboradores.chapa}</div>}</TableCell>
                              <TableCell className="text-center"><span style={{fontSize:11,fontWeight:700,padding:'3px 9px',borderRadius:20,whiteSpace:'nowrap',background:c.funcao==='encarregado'?'#fff7ed':'#f0f9ff',color:c.funcao==='encarregado'?'#c2410c':'#0369a1',border:`1px solid ${c.funcao==='encarregado'?'#fed7aa':'#bae6fd'}`}}>{c.funcao==='encarregado'?'👷 Encarregado':'🔧 Cabo'}</span></TableCell>
                              <TableCell className="text-right" style={{fontWeight:800,fontSize:15,color:c.valor_final>0?'#15803d':'#dc2626'}}>{formatCurrency(c.valor_final)}</TableCell>
                              <TableCell className="text-center">
                                <span style={{fontSize:10,fontWeight:700,padding:'3px 9px',borderRadius:20,whiteSpace:'nowrap',background:st.bg,color:st.cor,border:`1px solid ${st.border}`}}>{st.label}</span>
                                {c.status==='aprovado'&&<div className="text-xs text-muted-foreground mt-0.5">🔒 protegido</div>}
                              </TableCell>
                              <TableCell className="text-center">
                                <div className="flex gap-1 justify-center">
                                  {c.status==='pendente'&&<Button variant="ghost" size="icon" style={{width:26,height:26}} title="Aprovar" onClick={()=>setAprovarCom(c)}><CheckCircle2 size={13} color="#15803d"/></Button>}
                                  {/* Recusar: devolve para pendente */}
                                  {c.status==='aprovado'&&canEdit&&<Button variant="ghost" size="icon" style={{width:26,height:26}} title="Devolver para pendente" onClick={()=>setCancelarCom(c)}><RotateCcw size={13} color="#b45309"/></Button>}
                                  {c.status==='pendente'&&<Button variant="ghost" size="icon" style={{width:26,height:26}} title="Recusar (volta para pendente)" onClick={()=>setCancelarCom(c)}><XCircle size={13} color="#dc2626"/></Button>}
                                  {canDelete&&c.status!=='aprovado'&&<Button variant="ghost" size="icon" style={{width:26,height:26}} title="Excluir" onClick={()=>setDeleteCom(c)}><Trash2 size={13} color="#dc2626"/></Button>}
                                </div>
                              </TableCell>
                            </TableRow>
                          )
                        })}
                      </TableBody>
                    </Table>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      )}

      {/* AlertDialog Aprovar */}
      <AlertDialog open={!!aprovarCom} onOpenChange={o=>!o&&setAprovarCom(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Aprovar premiação?</AlertDialogTitle>
            <AlertDialogDescription>
              Prêmio de <strong>{formatCurrency(aprovarCom?.valor_final??0)}</strong> para <strong>{aprovarCom?.colaboradores?.nome}</strong> ({aprovarCom?.funcao}) — {mesLabel(aprovarCom?.competencia??'')}.<br/><br/>
              <div className="bg-green-50 border border-green-200 rounded p-2 text-xs text-green-700 mt-1">
                🔒 Após aprovação este valor fica protegido. Use o botão ↩ para devolver a pendente se necessário.
              </div>
              <details className="mt-2 text-xs text-muted-foreground"><summary className="cursor-pointer font-semibold">Ver detalhes</summary><pre className="whitespace-pre-wrap mt-1 text-xs">{aprovarCom?.observacoes??'—'}</pre></details>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter><AlertDialogCancel>Cancelar</AlertDialogCancel><AlertDialogAction onClick={handleAprovar} style={{background:'#15803d',color:'#fff'}}>✅ Aprovar</AlertDialogAction></AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* AlertDialog Recusar/Devolver */}
      <AlertDialog open={!!cancelarCom} onOpenChange={o=>!o&&setCancelarCom(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {cancelarCom?.status==='aprovado'?'Devolver para pendente?':'Recusar premiação?'}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {cancelarCom?.status==='aprovado'
                ?<>O prêmio de <strong>{formatCurrency(cancelarCom?.valor_final??0)}</strong> de <strong>{cancelarCom?.colaboradores?.nome}</strong> voltará para <strong>Pendente</strong> de aprovação.</>
                :(<>A premiação de <strong>{cancelarCom?.colaboradores?.nome}</strong> ({formatCurrency(cancelarCom?.valor_final??0)}) voltará para <strong>Pendente</strong> — não é excluída, apenas aguarda nova avaliação.</>)
              }
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Voltar</AlertDialogCancel>
            <AlertDialogAction onClick={handleRecusar} style={{background:'#b45309',color:'#fff'}}>
              {cancelarCom?.status==='aprovado'?'↩ Devolver a pendente':'↩ Recusar (volta a pendente)'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* AlertDialog Excluir */}
      <AlertDialog open={!!deleteCom} onOpenChange={o=>!o&&setDeleteCom(null)}>
        <AlertDialogContent>
          <AlertDialogHeader><AlertDialogTitle>Excluir lançamento?</AlertDialogTitle><AlertDialogDescription>Esta ação é irreversível.</AlertDialogDescription></AlertDialogHeader>
          <AlertDialogFooter><AlertDialogCancel>Cancelar</AlertDialogCancel><AlertDialogAction onClick={handleDelete} style={{background:'#dc2626',color:'#fff'}}>Excluir</AlertDialogAction></AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
