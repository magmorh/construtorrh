import React, { useEffect, useState, useCallback, useMemo } from 'react'
import { toast } from 'sonner'
import {
  Search, ChevronLeft, ChevronRight, CheckCircle2, Printer,
  Factory, X, Plus, Trash2, ChevronDown, Building2, Clock, AlertCircle
} from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { formatCurrency } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { traduzirErro } from '@/lib/erros'

// ─── Tipos ────────────────────────────────────────────────────────────────────

interface ColabSimples {
  id: string; nome: string; chapa: string | null
  funcao_id: string | null; obra_id: string | null
  tipo_contrato: string; funcao_nome: string
}
interface ObraSimples { id: string; nome: string }
interface HorarioDia {
  dia_semana: string; hora_entrada: string; saida_almoco: string
  retorno_almoco: string; hora_saida: string; ativo: boolean
}
interface PlaybookItem {
  id: string; descricao: string; unidade: string
  preco_unitario: number; categoria: string | null
}
// Um lançamento = obra + período (max 2 por obra/mês)
interface Lancamento {
  id: string; obra_id: string; obra_nome: string
  mes_referencia: string; data_inicio: string; data_fim: string
  status: 'rascunho'|'aguardando_aprovacao'|'aprovado'|'recusado'
  motivo_recusa: string | null
}
type TipoEvento = 'atestado' | 'suspensao' | 'outro_lancamento' | null
interface DiaRegistro {
  id?: string; lancamento_id: string; colaborador_id: string
  data: string; obra_id: string
  presente: boolean; falta: boolean
  hora_entrada: string; saida_almoco: string; retorno_almoco: string; hora_saida: string
  he_entrada: string; he_saida: string; justificativa: string
  evento: TipoEvento; bloqueado: boolean
}
interface LancProducao {
  id?: string; colaborador_id: string; lancamento_id: string
  obra_id: string; mes_referencia: string
  playbook_item_id: string; dias: string[]
  quantidade: number; valor_total: number; observacoes: string | null
  playbook_item?: PlaybookItem
}

// ─── Utilitários ──────────────────────────────────────────────────────────────
const DIAS_KEY: Record<number,string> = {1:'seg',2:'ter',3:'qua',4:'qui',5:'sex',6:'sab',0:'dom'}
const MESES = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro']

function normTime(t:string|null|undefined):string { return t ? t.slice(0,5) : '' }
function toMin(t:string):number|null { if(!t||!t.includes(':'))return null; const[h,m]=t.split(':').map(Number); return isNaN(h)||isNaN(m)?null:h*60+m }
function diffMin(a:string,b:string):number { const ma=toMin(a),mb=toMin(b); if(ma===null||mb===null)return 0; let d=mb-ma; if(d<0)d+=1440; return d }
function fmtHHMM(min:number):string { if(min<=0)return'00:00'; return`${String(Math.floor(min/60)).padStart(2,'0')}:${String(min%60).padStart(2,'0')}` }
function fmtDecimal(min:number):number { return parseFloat((min/60).toFixed(2)) }
function isFDS(data:string):boolean { const d=new Date(data+'T12:00:00').getDay(); return d===0||d===6 }
function diaSemana(data:string):string { return['Dom','Seg','Ter','Qua','Qui','Sex','Sáb'][new Date(data+'T12:00:00').getDay()] }
function expandRange(inicio:string,fim:string):string[] {
  const dias:string[]=[];const d=new Date(inicio+'T12:00:00');const end=new Date(fim+'T12:00:00')
  while(d<=end){dias.push(d.toISOString().slice(0,10));d.setDate(d.getDate()+1)}
  return dias
}

// DSR helpers ──────────────────────────────────────────────────────────────
// Dias úteis = Seg-Sex do período que NÃO sejam feriados
function diasUteisPeriodo(inicio:string,fim:string,feriadosSet?:Set<string>):number {
  const dias=expandRange(inicio,fim)
  return dias.filter(d=>{
    const dow=new Date(d+'T12:00:00').getDay()
    if(dow<1||dow>5) return false        // só Seg-Sex
    if(feriadosSet?.has(d)) return false // exclui feriados
    return true
  }).length
}
// Domingos + feriados do período (base DSR)
function domingosFeriadosPeriodo(inicio:string,fim:string,feriadosSet?:Set<string>):number {
  const dias=expandRange(inicio,fim)
  const domingos=dias.filter(d=>new Date(d+'T12:00:00').getDay()===0).length
  // Feriados em dias úteis (Seg-Sex) que não sejam domingo
  const feriadosUteis=feriadosSet
    ? dias.filter(d=>{
        if(!feriadosSet.has(d)) return false
        const dow=new Date(d+'T12:00:00').getDay()
        return dow>=1&&dow<=5
      }).length
    : 0
  return domingos+feriadosUteis
}

function calcDia(d:DiaRegistro):{normais:number;extras50:number;total:number} {
  if(!d.presente||d.falta)return{normais:0,extras50:0,total:0}
  const isSab=new Date(d.data+'T12:00:00').getDay()===6
  let horasDia=0
  if(d.hora_entrada&&d.hora_saida){
    let bruto=diffMin(d.hora_entrada,d.hora_saida)
    if(d.saida_almoco&&d.retorno_almoco)bruto-=diffMin(d.saida_almoco,d.retorno_almoco)
    else if(d.saida_almoco)bruto-=60
    horasDia=Math.max(0,bruto)
  }
  let he=0; if(d.he_entrada&&d.he_saida)he=Math.max(0,diffMin(d.he_entrada,d.he_saida))
  const normais=isSab?0:horasDia; const extras50=isSab?horasDia+he:he
  return{normais,extras50,total:normais+extras50}
}

function emptyDia(colabId:string,lancId:string,obraId:string,data:string):DiaRegistro {
  return{lancamento_id:lancId,colaborador_id:colabId,data,obra_id:obraId,
    presente:false,falta:false,hora_entrada:'',saida_almoco:'',retorno_almoco:'',hora_saida:'',
    he_entrada:'',he_saida:'',justificativa:'',evento:null,bloqueado:false}
}

// ─── Componente ───────────────────────────────────────────────────────────────
export default function Ponto() {
  const hoje = new Date()
  const [ano, setAno]   = useState(hoje.getFullYear())
  const [mes, setMes]   = useState(hoje.getMonth()+1)
  const [busca, setBusca] = useState('')
  const [obraFiltro, setObraFiltro] = useState('todas')

  const [colaboradores, setColaboradores] = useState<ColabSimples[]>([])
  const [obras, setObras] = useState<ObraSimples[]>([])
  const [loadingColabs, setLoadingColabs] = useState(true)
  const [colabSel, setColabSel] = useState<ColabSimples|null>(null)

  // Lançamentos do mês
  const [lancamentos, setLancamentos] = useState<Lancamento[]>([])
  // Dias por lançamento: { lancId → DiaRegistro[] }
  const [diasMap, setDiasMap] = useState<Record<string,DiaRegistro[]>>({})
  // Lançamento expandido (accordion: apenas 1 por vez)
  const [expandido, setExpandido] = useState<string | null>(null)
  // Horários por obra: { obraId → { diaSemana → HorarioDia } }
  const [horariosObra, setHorariosObra] = useState<Record<string,Record<string,HorarioDia>>>({})

  // Produção
  const [producoes, setProducoes]     = useState<LancProducao[]>([])
  const [playbookMap, setPlaybookMap] = useState<Record<string,PlaybookItem[]>>({}) // obraId → itens

  // Modal novo lançamento
  const [modalLanc, setModalLanc] = useState(false)
  const [feriados, setFeriados] = useState<Set<string>>(new Set()) // 'YYYY-MM-DD'
  const [prodExpandida, setProdExpandida] = useState<string|null>(null) // lancId com prod visível
  const [novoLancObraId, setNovoLancObraId] = useState('')
  const [novoLancInicio, setNovoLancInicio] = useState('')
  const [novoLancFim, setNovoLancFim]       = useState('')
  const [savingLanc, setSavingLanc] = useState(false)

  // Modal produção
  const [modalProd, setModalProd]   = useState(false)
  const [prodLancId, setProdLancId] = useState('')
  const [diasSelProd, setDiasSelProd] = useState<Set<string>>(new Set())
  const [itensProd, setItensProd]   = useState<{playbook_item_id:string;quantidade:number}[]>([])
  const [savingProd, setSavingProd] = useState(false)

  const [saving, setSaving] = useState(false)
  const [valorHora, setValorHora] = useState(0)
  const [loadingDias, setLoadingDias] = useState(false)

  // Modal recusa
  const [modalRecusa, setModalRecusa] = useState<{lancId:string;motivo:string}|null>(null)

  // Contagem de lançamentos por colaborador no mês (para sidebar)
  const [contadoresLanc, setContadoresLanc] = useState<Record<string,number>>({})

  const mesRef = `${ano}-${String(mes).padStart(2,'0')}`

  // ── Carregar colaboradores + obras ──────────────────────────────────────
  useEffect(()=>{
    const load=async()=>{
      const [{data:colsRaw},{data:obsRaw}]=await Promise.all([
        supabase.from('colaboradores').select('id,nome,chapa,funcao_id,obra_id,tipo_contrato,funcoes!colaboradores_funcao_id_fkey(id,nome)').order('nome'),
        supabase.from('obras').select('id,nome').order('nome'),
      ])
      setColaboradores((colsRaw??[]).map((c:any)=>({
        id:c.id,nome:c.nome,chapa:c.chapa??null,
        funcao_id:c.funcao_id??c.funcoes?.id??null,
        obra_id:c.obra_id??null,tipo_contrato:c.tipo_contrato??'clt',
        funcao_nome:c.funcoes?.nome??'Sem função',
      })))
      setObras((obsRaw??[]) as ObraSimples[])
      setLoadingColabs(false)
    }
    load()
  },[])

  // ── Carregar contadores de lançamentos para todos os colaboradores ────────
  useEffect(()=>{
    const loadContadores=async()=>{
      const mr=`${ano}-${String(mes).padStart(2,'0')}`
      const{data}=await supabase.from('ponto_lancamentos')
        .select('colaborador_id')
        .eq('mes_referencia',mr)
      const map:Record<string,number>={}
      ;(data??[]).forEach((r:any)=>{
        map[r.colaborador_id]=(map[r.colaborador_id]??0)+1
      })
      setContadoresLanc(map)
    }
    loadContadores()
  },[ano,mes])

  // ── Fetch lançamentos do mês ─────────────────────────────────────────────
  const fetchLancamentos = useCallback(async(colabId:string,mr:string)=>{
    const{data}=await supabase.from('ponto_lancamentos')
      .select('*,obras(nome)')
      .eq('colaborador_id',colabId).eq('mes_referencia',mr)
      .order('data_inicio')
    const list:Lancamento[]=(data??[]).map((l:any)=>({
      id:l.id,obra_id:l.obra_id,obra_nome:l.obras?.nome??'Obra',
      mes_referencia:l.mes_referencia,data_inicio:l.data_inicio,data_fim:l.data_fim,
      status:l.status??'rascunho',motivo_recusa:l.motivo_recusa??null,
    }))
    setLancamentos(list)
    return list
  },[])

  // ── Fetch horários de múltiplas obras ────────────────────────────────────
  const fetchHorariosObras = useCallback(async(obraIds:string[])=>{
    if(!obraIds.length)return{}
    const{data}=await supabase.from('obra_horarios').select('*').in('obra_id',obraIds)
    const mapa:Record<string,Record<string,HorarioDia>>={}
    ;(data??[]).forEach((h:any)=>{
      if(!mapa[h.obra_id])mapa[h.obra_id]={}
      mapa[h.obra_id][h.dia_semana]={...h,hora_entrada:normTime(h.hora_entrada),saida_almoco:normTime(h.saida_almoco),retorno_almoco:normTime(h.retorno_almoco),hora_saida:normTime(h.hora_saida)}
    })
    setHorariosObra(mapa)
    return mapa
  },[])

  // ── Fetch playbooks de múltiplas obras ───────────────────────────────────
  const fetchPlaybooks = useCallback(async(obraIds:string[])=>{
    if(!obraIds.length)return{}
    const{data}=await supabase.from('playbook_itens').select('*').in('obra_id',obraIds).eq('ativo',true)
    const mapa:Record<string,PlaybookItem[]>={}
    ;(data??[]).forEach((p:any)=>{
      if(!mapa[p.obra_id])mapa[p.obra_id]=[]
      mapa[p.obra_id].push(p as PlaybookItem)
    })
    setPlaybookMap(mapa)
    return mapa
  },[])

  // ── Fetch dias de um lançamento ──────────────────────────────────────────
  const fetchDiasLanc = useCallback(async(
    lanc:Lancamento,colab:ColabSimples,
    horMapa:Record<string,Record<string,HorarioDia>>,
    diasAtestado:Set<string>,diasSuspensao:Set<string>,
    diasUsados:Set<string>
  ):Promise<DiaRegistro[]>=>{
    const{data:pontosRaw}=await supabase.from('registro_ponto').select('*')
      .eq('lancamento_id',lanc.id)
    const mapaP:Record<string,any>={}
    ;(pontosRaw??[]).forEach((r:any)=>{mapaP[r.data]=r})
    const horObra=horMapa[lanc.obra_id]??{}

    return expandRange(lanc.data_inicio,lanc.data_fim).map(d=>{
      const r=mapaP[d]
      const isAtestado=diasAtestado.has(d)
      const isSuspensao=diasSuspensao.has(d)
      const bloqOutroLanc=diasUsados.has(d)  // qualquer dia já lançado em outra obra fica bloqueado
      const evento:TipoEvento=isSuspensao?'suspensao':isAtestado?'atestado':null
      const diaSem=DIAS_KEY[new Date(d+'T12:00:00').getDay()]
      const hor=horObra[diaSem]

      if(!r){
        const base=emptyDia(colab.id,lanc.id,lanc.obra_id,d)
        if(bloqOutroLanc)return{...base,evento:'outro_lancamento',bloqueado:true}
        if(isAtestado)return{...base,presente:true,evento,bloqueado:true,
          hora_entrada:hor?.hora_entrada??'',saida_almoco:hor?.saida_almoco??'',
          retorno_almoco:hor?.retorno_almoco??'',hora_saida:hor?.hora_saida??''}
        if(isSuspensao)return{...base,evento,bloqueado:true}
        return{...base,evento,bloqueado:false}
      }
      if(isAtestado)return{
        id:r.id,lancamento_id:lanc.id,colaborador_id:colab.id,data:d,obra_id:lanc.obra_id,
        presente:true,falta:false,evento,bloqueado:true,justificativa:r.justificativa??'',
        hora_entrada:hor?.hora_entrada||r.hora_entrada||'',
        saida_almoco:hor?.saida_almoco||r.saida_almoco||'',
        retorno_almoco:hor?.retorno_almoco||r.retorno_almoco||'',
        hora_saida:hor?.hora_saida||r.hora_saida||'',
        he_entrada:'',he_saida:'',
      }
      return{
        id:r.id,lancamento_id:lanc.id,colaborador_id:colab.id,data:d,obra_id:lanc.obra_id,
        presente:!!(r.hora_entrada||r.hora_saida),falta:r.falta??false,
        hora_entrada:r.hora_entrada??'',saida_almoco:r.saida_almoco??'',
        retorno_almoco:r.retorno_almoco??'',hora_saida:r.hora_saida??'',
        he_entrada:r.he_entrada??'',he_saida:r.he_saida??'',
        justificativa:r.justificativa??'',evento,bloqueado:isSuspensao||bloqOutroLanc,
      }
    })
  },[])

  // ── Fetch produções do mês ────────────────────────────────────────────────
  const fetchProducoes = useCallback(async(colabId:string,mr:string)=>{
    const{data}=await supabase.from('ponto_producao')
      .select('*,playbook_item:playbook_itens(*)')
      .eq('colaborador_id',colabId).eq('mes_referencia',mr)
    setProducoes((data??[]) as LancProducao[])
  },[])

  // ── Carregar tudo para o colaborador/mês ─────────────────────────────────
  const fetchTudo = useCallback(async(colab:ColabSimples,a:number,m:number)=>{
    setLoadingDias(true)
    const mr=`${a}-${String(m).padStart(2,'0')}`

    // Atestados e suspensões
    const inicio=`${mr}-01`; const fim=`${mr}-${new Date(a,m,0).getDate()}`
    const[{data:atestRaw},{data:advRaw}]=await Promise.all([
      supabase.from('atestados').select('data,dias_afastamento').eq('colaborador_id',colab.id),
      supabase.from('advertencias').select('data_advertencia,dias_suspensao').eq('colaborador_id',colab.id).eq('tipo','suspensao'),
    ])

    const diasAtestado=new Set<string>()
    ;(atestRaw??[]).forEach((at:any)=>{
      if(!at.data)return
      const d=at.dias_afastamento??0
      if(d>0){const f=new Date(at.data+'T12:00:00');f.setDate(f.getDate()+d-1);expandRange(at.data,f.toISOString().slice(0,10)).forEach(x=>{const dow=new Date(x+'T12:00:00').getDay();if(dow!==0&&dow!==6)diasAtestado.add(x)})}
      else{const dow=new Date(at.data+'T12:00:00').getDay();if(dow!==0&&dow!==6)diasAtestado.add(at.data)}
    })
    const diasSuspensao=new Set<string>()
    ;(advRaw??[]).forEach((adv:any)=>{
      const da=adv.data_advertencia; if(!da||!adv.dias_suspensao||adv.dias_suspensao<=0)return
      const f=new Date(da+'T12:00:00');f.setDate(f.getDate()+(adv.dias_suspensao-1))
      expandRange(da,f.toISOString().slice(0,10)).forEach(x=>diasSuspensao.add(x))
    })

    // Carregar valor/hora: 1º funcao_valores, 2º fallback nas colunas da funcao
    if(colab.funcao_id){
      const[{data:fvList},{data:funcaoRow}]=await Promise.all([
        supabase.from('funcao_valores').select('valor_hora,tipo_contrato').eq('funcao_id',colab.funcao_id),
        supabase.from('funcoes').select('valor_hora_clt,valor_hora_autonomo').eq('id',colab.funcao_id).single(),
      ])
      const fvMatch=(fvList??[]).find((r:any)=>r.tipo_contrato===colab.tipo_contrato)
      if(fvMatch){
        setValorHora(fvMatch.valor_hora)
      } else if((fvList??[]).length>0){
        setValorHora((fvList??[])[0].valor_hora)
      } else if(funcaoRow){
        // Fallback: usar coluna direta da funcao
        const vh=colab.tipo_contrato==='clt'?funcaoRow.valor_hora_clt:funcaoRow.valor_hora_autonomo
        setValorHora(vh??funcaoRow.valor_hora_clt??funcaoRow.valor_hora_autonomo??0)
      } else {
        setValorHora(0)
      }
    } else { setValorHora(0) }

    const [list,,pbMap,horMap]=await Promise.all([
      fetchLancamentos(colab.id,mr),
      fetchProducoes(colab.id,mr),
      fetchPlaybooks([...new Set([colab.obra_id,...([] as (string|null)[])].filter(Boolean) as string[])]),
      fetchHorariosObras([colab.obra_id].filter(Boolean) as string[]),
    ])

    // Buscar obras únicas dos lançamentos
    const obraIds=[...new Set(list.map(l=>l.obra_id))]
    const[horMapFull,pbMapFull]=await Promise.all([
      fetchHorariosObras(obraIds),
      fetchPlaybooks(obraIds),
    ])

    // Dias de cada lançamento — sequencial p/ calcular bloqueios entre lançamentos
    const newDiasMap:Record<string,DiaRegistro[]>={}
    for(const lanc of list){
      const diasUsados=new Set<string>()
      for(const [outroId,outroDias] of Object.entries(newDiasMap)){
        if(outroId===lanc.id)continue
        // Bloqueia apenas dias que JÁ TÊM registro salvo (d.id) ou afastamento/suspensão
        // Dias no range sem presença ficam livres para outras obras
        outroDias.forEach(d=>{ if(d.id||(d.evento==='atestado'||d.evento==='suspensao'))diasUsados.add(d.data) })
      }
      newDiasMap[lanc.id]=await fetchDiasLanc(lanc,colab,horMapFull,diasAtestado,diasSuspensao,diasUsados)
    }
    setDiasMap(newDiasMap)
    // Preserva o lançamento expandido atual ao recarregar (não fecha o que o usuário está vendo)
    setExpandido(prev => {
      if(prev&&list.some(l=>l.id===prev))return prev
      return list[0]?.id ?? null
    })
    setLoadingDias(false)
  },[fetchLancamentos,fetchProducoes,fetchPlaybooks,fetchHorariosObras,fetchDiasLanc])

  useEffect(()=>{ if(colabSel)fetchTudo(colabSel,ano,mes) },[colabSel,ano,mes,fetchTudo])

  // Buscar feriados do ano/mês selecionado
  useEffect(()=>{
    supabase.from('feriados')
      .select('data')
      .eq('ativo',true)
      .gte('data',`${ano}-01-01`)
      .lte('data',`${ano}-12-31`)
      .then(({data})=>{
        if(data) setFeriados(new Set(data.map((f:any)=>f.data as string)))
      })
  },[ano])

  // ── Totais globais ────────────────────────────────────────────────────────
  const totaisGlobais = useMemo(()=>{
    let normais=0,extras50=0,presentes=0
    Object.values(diasMap).forEach(dias=>dias.forEach(d=>{
      const c=calcDia(d);normais+=c.normais;extras50+=c.extras50
      if(d.presente&&!d.falta&&d.evento!=='atestado'&&d.evento!=='suspensao')presentes++
    }))
    return{normais,extras50,total:normais+extras50,presentes}
  },[diasMap])

  const totalHoras = valorHora>0?(fmtDecimal(totaisGlobais.normais)*valorHora + fmtDecimal(totaisGlobais.extras50)*valorHora*1.5):0
  const totalProd  = producoes.reduce((s,p)=>s+p.valor_total,0)

  // Valor a receber com regra CLT/autônomo
  // diasComProd = dias que foram ESCOLHIDOS ao lançar a produção (array dias[] de cada produção)
  const diasComProd = useMemo(()=>new Set(producoes.flatMap(p=>p.dias??[])),[producoes])

  // Autônomo: horas(dias sem prod) + produção. CLT: horas + prêmio se prod>horas
  const horasAutonomoSemProd = useMemo(()=>{
    let min=0
    Object.values(diasMap).forEach(dias=>dias.forEach(d=>{
      if(!diasComProd.has(d.data)){const cl=calcDia(d);min+=cl.normais+cl.extras50}
    }))
    return fmtDecimal(min)*valorHora
  },[diasMap,diasComProd,valorHora])

  const premioCLT = useMemo(()=>{
    if(!colabSel||colabSel.tipo_contrato==='autonomo'||colabSel.tipo_contrato==='pj')return 0
    const excedente=totalProd-totalHoras
    return excedente>0?excedente:0
  },[colabSel,totalProd,totalHoras])

  // DSR — só para CLT
  // Fórmula: DSR = (totalHoras × valorHora / diasUteis) × domingos
  // diasUteis = Seg-Sab do período · domingos = domingos + feriados
  const dsrInfo = useMemo(()=>{
    if(!colabSel||colabSel.tipo_contrato!=='clt'||valorHora===0){
      return{valor:0,diasUteis:0,domingos:0,baseValor:0}
    }
    let totalDiasUteis=0,totalDomingos=0
    lancamentos.forEach(lanc=>{
      totalDiasUteis+=diasUteisPeriodo(lanc.data_inicio,lanc.data_fim,feriados)
      totalDomingos+=domingosFeriadosPeriodo(lanc.data_inicio,lanc.data_fim,feriados)
    })
    // Base = valor total das horas trabalhadas (normais + extras com adicional)
    const baseValor = fmtDecimal(totaisGlobais.normais)*valorHora
                    + fmtDecimal(totaisGlobais.extras50)*valorHora*1.5
    const dsr = totalDiasUteis>0 && totalDomingos>0
      ? (baseValor / totalDiasUteis) * totalDomingos
      : 0
    return{valor:dsr,diasUteis:totalDiasUteis,domingos:totalDomingos,baseValor}
  },[colabSel,valorHora,lancamentos,totaisGlobais.normais,totaisGlobais.extras50,feriados])

  const totalReceber = useMemo(()=>{
    if(!colabSel)return totalProd
    if(colabSel.tipo_contrato==='autonomo'||colabSel.tipo_contrato==='pj'){
      return horasAutonomoSemProd + totalProd
    }
    // CLT: salário base = horas trabalhadas + DSR (produção é separada)
    return totalHoras + dsrInfo.valor
  },[colabSel,horasAutonomoSemProd,totalProd,totalHoras,dsrInfo])

  // ── Toggle dia ────────────────────────────────────────────────────────────
  function togglePresente(lancId:string,idx:number,colab:ColabSimples){
    setDiasMap(prev=>{
      const dias=[...(prev[lancId]??[])]
      const d={...dias[idx]}
      if(d.bloqueado){
        if(d.evento==='atestado')toast.info('Dia de afastamento')
        if(d.evento==='suspensao')toast.info('Dia de suspensão')
        return prev
      }
      const lanc=lancamentos.find(l=>l.id===lancId)
      if(d.presente){
        dias[idx]={...d,presente:false,falta:false,hora_entrada:'',saida_almoco:'',retorno_almoco:'',hora_saida:'',he_entrada:'',he_saida:''}
      } else {
        const diaSem=DIAS_KEY[new Date(d.data+'T12:00:00').getDay()]
        const hor=lanc?horariosObra[lanc.obra_id]?.[diaSem]:undefined
        dias[idx]={...d,presente:true,falta:false,hora_entrada:hor?.hora_entrada??'',saida_almoco:hor?.saida_almoco??'',retorno_almoco:hor?.retorno_almoco??'',hora_saida:hor?.hora_saida??''}
      }
      return{...prev,[lancId]:dias}
    })
  }

  function toggleFalta(lancId:string,idx:number){
    setDiasMap(prev=>{
      const dias=[...(prev[lancId]??[])]
      const d={...dias[idx]}
      if(d.bloqueado)return prev
      dias[idx]={...d,falta:!d.falta,presente:false,hora_entrada:'',saida_almoco:'',retorno_almoco:'',hora_saida:'',he_entrada:'',he_saida:''}
      return{...prev,[lancId]:dias}
    })
  }

  function updDia(lancId:string,idx:number,field:keyof DiaRegistro,value:unknown){
    setDiasMap(prev=>{
      const dias=[...(prev[lancId]??[])]
      dias[idx]={...dias[idx],[field]:value}
      return{...prev,[lancId]:dias}
    })
  }

  // ── Salvar dias de um lançamento ──────────────────────────────────────────
  async function salvarLanc(lancId:string){
    if(!colabSel)return
    const lanc=lancamentos.find(l=>l.id===lancId)
    if(lanc&&lanc.status!=='rascunho'&&lanc.status!=='recusado'){toast.error('Ponto em aprovação ou aprovado não pode ser editado');return}
    setSaving(true)
    const dias=diasMap[lancId]??[]
    const upserts=dias.filter(d=>d.presente||d.falta||d.id).map(d=>{
      const c=calcDia(d)
      return{
        ...(d.id?{id:d.id}:{}),
        lancamento_id:lancId,colaborador_id:d.colaborador_id,
        obra_id:d.obra_id,data:d.data,
        hora_entrada:d.hora_entrada||null,saida_almoco:d.saida_almoco||null,
        retorno_almoco:d.retorno_almoco||null,hora_saida:d.hora_saida||null,
        he_entrada:d.he_entrada||null,he_saida:d.he_saida||null,
        horas_trabalhadas:fmtDecimal(c.normais),horas_extras:fmtDecimal(c.extras50),
        falta:d.falta,justificativa:d.justificativa||null,
      }
    })
    if(upserts.length===0){toast.info('Nenhum registro para salvar');setSaving(false);return}
    const toUpdate=upserts.filter(u=>u.id)
    const toInsert=upserts.filter(u=>!u.id)
    const errs=[]
    if(toUpdate.length){
      for(const row of toUpdate){
        const{error:e}=await supabase.from('registro_ponto').update(row).eq('id',(row as any).id)
        if(e)errs.push(e.message)
      }
    }
    if(toInsert.length){
      const{error:e}=await supabase.from('registro_ponto').insert(toInsert.map(({id:_,...r})=>r))
      if(e)errs.push(e.message)
    }
    setSaving(false)
    if(errs.length){toast.error('Erro: '+errs[0]);return}
    toast.success('Ponto salvo!')
    // Recarregar para obter IDs dos registros inseridos
    if(colabSel)fetchTudo(colabSel,ano,mes)
  }

  // ── Criar novo lançamento ─────────────────────────────────────────────────
  async function criarLancamento(){
    if(!colabSel||!novoLancObraId||!novoLancInicio||!novoLancFim){toast.error('Preencha todos os campos');return}
    if(novoLancInicio>novoLancFim){toast.error('Data de início deve ser anterior à data de fim');return}
    // Bloquear se houver lançamento em rascunho ou recusado (precisa aprovar antes)
    const temAberto=lancamentos.some(l=>l.status==='rascunho'||l.status==='recusado')
    if(temAberto){toast.error('Finalize (aprove) os lançamentos em aberto antes de criar um novo');return}
    const lancsPorObra=lancamentos.filter(l=>l.obra_id===novoLancObraId).length
    if(lancsPorObra>=2){toast.error('Esta obra já tem 2 lançamentos neste mês');return}
    const diasNovos=new Set(expandRange(novoLancInicio,novoLancFim))
    // Conflito BLOQUEANTE apenas quando a obra for a mesma
    const conflitoMesmaObra=lancamentos
      .filter(l=>l.obra_id===novoLancObraId)
      .flatMap(l=>expandRange(l.data_inicio,l.data_fim))
      .filter(d=>diasNovos.has(d))
    if(conflitoMesmaObra.length>0){toast.error(`Esta obra já tem ${conflitoMesmaObra.length} dia(s) nesse período`);return}
    // Obras diferentes: apenas aviso informativo (não bloqueia)
    setSavingLanc(true)
    const{error}=await supabase.from('ponto_lancamentos').insert({
      colaborador_id:colabSel.id,obra_id:novoLancObraId,mes_referencia:mesRef,
      data_inicio:novoLancInicio,data_fim:novoLancFim,
      status:'rascunho',
    }).select('*,obras(nome)').single()
    setSavingLanc(false)
    if(error){toast.error('Erro: '+error.message);return}
    toast.success('Lançamento criado!')
    setModalLanc(false)
    fetchTudo(colabSel,ano,mes)
    // Atualizar contadores sidebar
    setContadoresLanc(prev=>({...prev,[colabSel.id]:(prev[colabSel.id]??0)+1}))
  }

  // ── Excluir lançamento ────────────────────────────────────────────────────
  // Modal confirmar exclusão
  const [modalExcluir, setModalExcluir] = useState<string|null>(null)

  async function excluirLancamento(id:string){
    const lanc=lancamentos.find(l=>l.id===id)
    if(lanc&&lanc.status!=='rascunho'&&lanc.status!=='recusado'){toast.error('Lançamento em aprovação ou aprovado não pode ser excluído');return}
    setModalExcluir(id)
  }

  async function confirmarExclusao(id:string){
    const{error:e1}=await supabase.from('registro_ponto').delete().eq('lancamento_id',id)
    const{error:e2}=await supabase.from('ponto_lancamentos').delete().eq('id',id)
    if(e1||e2){toast.error('Erro ao excluir: '+(e1?.message||e2?.message));return}
    toast.success('Lançamento excluído')
    setModalExcluir(null)
    if(colabSel)fetchTudo(colabSel,ano,mes)
    setContadoresLanc(prev=>({...prev,[colabSel!.id]:Math.max(0,(prev[colabSel!.id]??1)-1)}))
  }

  // ── Aprovação de ponto ───────────────────────────────────────────────────
  async function mudarStatus(id:string,status:Lancamento['status'],motivo?:string){
    const{error}=await supabase.from('ponto_lancamentos').update({
      status,motivo_recusa:motivo??null
    }).eq('id',id)
    if(error){toast.error('Erro: '+error.message);return}
    const msgs:Record<string,string>={
      aguardando_aprovacao:'Enviado para aprovação!',
      aprovado:'Ponto aprovado!',
      recusado:'Ponto recusado — devolvido para edição',
    }
    toast.success(msgs[status]??'Atualizado')
    if(colabSel)fetchTudo(colabSel,ano,mes)
  }

  // ── Produção ──────────────────────────────────────────────────────────────
  function abrirModalProd(lancId:string){
    setProdLancId(lancId)
    const lanc=lancamentos.find(l=>l.id===lancId)
    const itens=lanc?playbookMap[lanc.obra_id]??[]:[]
    setDiasSelProd(new Set())
    setItensProd([{playbook_item_id:itens[0]?.id??'',quantidade:0}])
    setModalProd(true)
  }

  async function salvarProducao(){
    if(!colabSel)return
    const lanc=lancamentos.find(l=>l.id===prodLancId)
    if(!lanc){return}
    if(diasSelProd.size===0){toast.error('Selecione ao menos um dia');return}
    const itensValidos=itensProd.filter(i=>i.playbook_item_id&&i.quantidade>0)
    if(itensValidos.length===0){toast.error('Informe ao menos um serviço com quantidade');return}
    setSavingProd(true)
    const rows=itensValidos.map(item=>{
      const pb=(playbookMap[lanc.obra_id]??[]).find(p=>p.id===item.playbook_item_id)
      return{
        colaborador_id:colabSel.id,lancamento_id:prodLancId,obra_id:lanc.obra_id,
        mes_referencia:mesRef,playbook_item_id:item.playbook_item_id,
        dias:Array.from(diasSelProd).sort(),
        quantidade:item.quantidade,valor_total:(pb?.preco_unitario??0)*item.quantidade,
        observacoes:null as string|null,
      }
    })
    const{error}=await supabase.from('ponto_producao').insert(rows)
    setSavingProd(false)
    if(error){toast.error('Erro: '+error.message);return}
    toast.success('Produção lançada!')
    setModalProd(false)
    fetchProducoes(colabSel.id,mesRef)
  }

  const [confirmarExclusaoProd, setConfirmarExclusaoProd] = useState<string|null>(null)

  async function deletarProducao(id:string){
    setConfirmarExclusaoProd(id)
  }

  async function confirmarDeleteProd(id:string){
    const{error}=await supabase.from('ponto_producao').delete().eq('id',id)
    if(error){toast.error('Erro: '+error.message);return}
    if(colabSel)fetchProducoes(colabSel.id,mesRef)
    toast.success('Produção removida')
    setConfirmarExclusaoProd(null)
  }

  // ── Totais por lançamento ─────────────────────────────────────────────────
  function totaisLanc(lancId:string){
    const dias=diasMap[lancId]??[]
    let normais=0,extras50=0,presentes=0,faltas=0,atestados=0,suspensoes=0
    dias.forEach(d=>{
      const c=calcDia(d);normais+=c.normais;extras50+=c.extras50
      if(d.presente&&!d.falta)presentes++
      if(d.falta)faltas++
      if(d.evento==='atestado'&&!isFDS(d.data))atestados++
      if(d.evento==='suspensao')suspensoes++
    })
    return{normais,extras50,total:normais+extras50,presentes,faltas,atestados,suspensoes}
  }

  function mesAnterior(){if(mes===1){setAno(a=>a-1);setMes(12)}else setMes(m=>m-1)}
  function mesSeguinte(){if(mes===12){setAno(a=>a+1);setMes(1)}else setMes(m=>m+1)}

  const colabsFiltrados=useMemo(()=>{
    let lista=colaboradores
    if(obraFiltro!=='todas')lista=lista.filter(c=>c.obra_id===obraFiltro)
    const q=busca.toLowerCase()
    if(q)lista=lista.filter(c=>c.nome.toLowerCase().includes(q)||(c.chapa??'').toLowerCase().includes(q)||c.funcao_nome.toLowerCase().includes(q))
    return lista
  },[colaboradores,busca,obraFiltro])

  // ─────────────────────────────────────────────────────────────────────────
  return (
    <>
    <div style={{display:'flex',height:'calc(100vh - 80px)',overflow:'hidden'}}>

      {/* ── Painel esquerdo ── */}
      <div style={{width:272,flexShrink:0,borderRight:'1px solid var(--border)',display:'flex',flexDirection:'column',overflow:'hidden'}}>
        <div style={{padding:'12px 10px 8px',borderBottom:'1px solid var(--border)',display:'flex',flexDirection:'column',gap:6}}>
          <div style={{fontWeight:700,fontSize:13}}>🕐 Controle de Ponto</div>
          <Select value={obraFiltro} onValueChange={setObraFiltro}>
            <SelectTrigger style={{fontSize:12,height:30}}><SelectValue placeholder="Todas as obras"/></SelectTrigger>
            <SelectContent>
              <SelectItem value="todas">Todas as obras</SelectItem>
              {obras.map(o=><SelectItem key={o.id} value={o.id}>{o.nome}</SelectItem>)}
            </SelectContent>
          </Select>
          <div style={{position:'relative'}}>
            <Search size={11} style={{position:'absolute',left:7,top:'50%',transform:'translateY(-50%)',color:'var(--muted-foreground)'}}/>
            <Input placeholder="Nome ou chapa…" value={busca} onChange={e=>setBusca(e.target.value)} style={{paddingLeft:22,fontSize:12,height:30}}/>
          </div>
        </div>
        <div style={{flex:1,overflowY:'auto'}}>
          {loadingColabs?<div style={{padding:16,textAlign:'center',fontSize:12,color:'var(--muted-foreground)'}}>Carregando…</div>
          :colabsFiltrados.length===0?<div style={{padding:16,textAlign:'center',fontSize:12,color:'var(--muted-foreground)'}}>Nenhum colaborador</div>
          :colabsFiltrados.map(c=>(
            <button key={c.id} onClick={()=>setColabSel(c)} style={{
              width:'100%',textAlign:'left',padding:'8px 10px',border:'none',
              borderBottom:'1px solid var(--border)',
              background:colabSel?.id===c.id?'var(--primary)':'transparent',
              color:colabSel?.id===c.id?'#fff':'var(--foreground)',cursor:'pointer',
            }}>
              <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',gap:4}}>
                <div style={{fontSize:10,fontFamily:'monospace',fontWeight:700,opacity:0.6}}>{c.chapa??'—'}</div>
                {(()=>{
                  const qtd=contadoresLanc[c.id]??0
                  const ativo=colabSel?.id===c.id
                  if(qtd===0)return(
                    <span title="Sem lançamento neste mês" style={{fontSize:11,background:ativo?'rgba(255,255,255,0.25)':'#fef9c3',color:ativo?'#fff':'#854d0e',borderRadius:10,padding:'1px 5px',fontWeight:700,display:'flex',alignItems:'center',gap:2}}>
                      ⚠️
                    </span>
                  )
                  return(
                    <span title={`${qtd} lançamento${qtd!==1?'s':''}`} style={{fontSize:10,background:ativo?'rgba(255,255,255,0.25)':'var(--muted)',color:ativo?'#fff':'var(--muted-foreground)',borderRadius:10,padding:'1px 6px',fontWeight:700}}>
                      {qtd}
                    </span>
                  )
                })()}
              </div>
              <div style={{fontSize:13,fontWeight:600}}>{c.nome}</div>
              <div style={{fontSize:11,opacity:0.7}}>{c.funcao_nome}</div>
            </button>
          ))}
        </div>
      </div>

      {/* ── Painel direito ── */}
      <div style={{flex:1,display:'flex',flexDirection:'column',overflow:'hidden'}}>
        {!colabSel?(
          <div style={{flex:1,display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'center',gap:8,color:'var(--muted-foreground)'}}>
            <span style={{fontSize:44}}>👈</span>
            <div style={{fontSize:15,fontWeight:600}}>Selecione um colaborador</div>
          </div>
        ):(
          <>
          {/* ── Topo: colaborador + mês + totais ── */}
          <div style={{flexShrink:0,borderBottom:'1px solid var(--border)',background:'var(--background)'}}>
            {/* Linha 1: nome + mês + botões */}
            <div style={{padding:'8px 14px',display:'flex',alignItems:'center',gap:10,flexWrap:'wrap'}}>
              <div style={{flex:1,minWidth:160}}>
                <div style={{fontWeight:700,fontSize:15}}>{colabSel.nome}</div>
                <div style={{fontSize:11,color:'var(--muted-foreground)'}}>
                  {colabSel.chapa&&<><span style={{fontFamily:'monospace',fontWeight:600}}>{colabSel.chapa}</span> · </>}
                  {colabSel.funcao_nome}
                  <span style={{marginLeft:6,background:'var(--muted)',borderRadius:4,padding:'1px 6px',fontSize:10,textTransform:'uppercase',fontWeight:700}}>{colabSel.tipo_contrato}</span>
                </div>
              </div>
              <div style={{display:'flex',alignItems:'center',gap:5}}>
                <button onClick={mesAnterior} style={{border:'1px solid var(--border)',borderRadius:5,background:'none',cursor:'pointer',padding:'3px 7px',display:'flex'}}><ChevronLeft size={13}/></button>
                <span style={{fontWeight:700,fontSize:13,minWidth:130,textAlign:'center'}}>{MESES[mes-1]} / {ano}</span>
                <button onClick={mesSeguinte} style={{border:'1px solid var(--border)',borderRadius:5,background:'none',cursor:'pointer',padding:'3px 7px',display:'flex'}}><ChevronRight size={13}/></button>
              </div>
              <Button variant="outline" size="sm" onClick={()=>window.print()} style={{gap:4,height:30,fontSize:12}}><Printer size={12}/></Button>
              <Button size="sm"
                disabled={!colabSel||lancamentos.some(l=>l.status==='rascunho'||l.status==='recusado')}
                title={lancamentos.some(l=>l.status==='rascunho'||l.status==='recusado')?'Aprove os lançamentos em aberto antes de criar um novo':undefined}
                onClick={()=>{setNovoLancObraId('');setNovoLancInicio('');setNovoLancFim('');setModalLanc(true)}}
                style={{gap:4,height:30,fontSize:12}}>
                <Plus size={12}/> Novo Lançamento
              </Button>
            </div>

            {/* Linha 2: cards de totais */}
            <div style={{display:'flex',gap:1,borderTop:'1px solid var(--border)',background:'var(--muted)',flexWrap:'wrap'}}>
              {(()=>{
                const ehAuto=colabSel.tipo_contrato==='autonomo'||colabSel.tipo_contrato==='pj'
                // Média produção por dia trabalhado (total presentes, não só dias de prod)
                const diasProd=diasComProd.size
                const subProd=totalProd>0&&diasProd>0
                  ? `≈ ${formatCurrency(totalProd/diasProd)}/dia (${diasProd} dia${diasProd!==1?'s':''})`
                  : producoes.length>0?`${producoes.length} lançamento${producoes.length!==1?'s':''}`:'Nenhuma produção'
                // Sub do total a receber
                const subReceber=ehAuto
                  ? (totalProd>0||horasAutonomoSemProd>0
                      ? `Horas: ${formatCurrency(horasAutonomoSemProd)} + Prod: ${formatCurrency(totalProd)}`
                      : `Autônomo: R$ ${valorHora.toFixed(2)}/h`)
                  : (()=>{
                      const partes:string[]=[]
                      if(totalHoras>0) partes.push(`Horas: ${formatCurrency(totalHoras)}`)
                      if(dsrInfo.valor>0) partes.push(`DSR: ${formatCurrency(dsrInfo.valor)}`)
                      return partes.length>0?partes.join(' + '):'Sem valor/hora cadastrado'
                    })()
                const cards=[
                  {label:'⏱ Total de Horas',value:fmtHHMM(totaisGlobais.total),sub:`${fmtHHMM(totaisGlobais.normais)} norm + ${fmtHHMM(totaisGlobais.extras50)} extras`,color:'#1d4ed8'},
                  {label:'💰 Valor das Horas',value:valorHora>0?`R$ ${valorHora.toFixed(2)}/h`:'Sem tabela',sub:valorHora>0?formatCurrency(totalHoras)+' no período':'Cadastre em Funções → valor/hora',color:valorHora>0?'#15803d':'#9ca3af'},
                  {label:'🏗️ Produção',value:totalProd>0?formatCurrency(totalProd):'—',sub:subProd,color:'#b45309'},
                ]
                // Card DSR — só CLT e quando há dias úteis no período
                if(!ehAuto&&dsrInfo.diasUteis>0){
                  const subDsr=dsrInfo.baseValor>0
                    ? `(${formatCurrency(dsrInfo.baseValor)} ÷ ${dsrInfo.diasUteis} du) × ${dsrInfo.domingos} dom`
                    : `${dsrInfo.diasUteis} dias úteis · ${dsrInfo.domingos} domingos`
                  cards.push({label:'📅 DSR',value:dsrInfo.valor>0?formatCurrency(dsrInfo.valor):'R$ 0,00',sub:subDsr,color:'#0369a1'})
                }
                cards.push({
                  label: ehAuto ? '💵 Total a Receber' : '💵 Salário',
                  value: formatCurrency(totalReceber),
                  sub: subReceber,
                  color: '#7c3aed'
                })
                return cards
              })().map(card=>(
                <div key={card.label} style={{flex:1,minWidth:120,padding:'8px 12px',textAlign:'center',borderRight:'1px solid var(--border)'}}>
                  <div style={{fontSize:10,color:'var(--muted-foreground)',fontWeight:600,marginBottom:2}}>{card.label}</div>
                  <div style={{fontSize:15,fontWeight:800,color:card.color}}>{card.value}</div>
                  <div style={{fontSize:10,color:'var(--muted-foreground)'}}>{card.sub}</div>
                </div>
              ))}
              {/* Card de performance — só aparece quando há produção e valor/hora */}
              {totalProd>0&&valorHora>0&&(()=>{
                const diff=totalProd-totalHoras
                const bom=diff>=0
                const pct=totalHoras>0?Math.abs(diff)/totalHoras*100:0
                return(
                  <div style={{flex:1,minWidth:140,padding:'8px 12px',textAlign:'center',borderRight:'1px solid var(--border)',background:bom?'rgba(22,163,74,0.06)':'rgba(220,38,38,0.06)'}}>
                    <div style={{fontSize:10,fontWeight:700,marginBottom:2,color:bom?'#15803d':'#dc2626'}}>
                      {bom?'📈 Produção Compensa':'📉 Produção Abaixo'}
                    </div>
                    <div style={{fontSize:15,fontWeight:800,color:bom?'#15803d':'#dc2626'}}>
                      {bom?'+':''}{formatCurrency(diff)}
                    </div>
                    <div style={{fontSize:10,color:bom?'#16a34a':'#b91c1c'}}>
                      {bom
                        ? `${pct.toFixed(0)}% acima do valor hora`
                        : `${pct.toFixed(0)}% abaixo do valor hora`}
                    </div>
                    <div style={{fontSize:9,color:'var(--muted-foreground)',marginTop:1}}>
                      Hora: {formatCurrency(totalHoras)} · Prod: {formatCurrency(totalProd)}
                    </div>
                  </div>
                )
              })()}
            </div>
          </div>

          {/* ── Área de lançamentos ── */}
          <div style={{flex:1,overflowY:'auto',padding:'12px 14px',display:'flex',flexDirection:'column',gap:12}}>

            {loadingDias&&<div style={{textAlign:'center',padding:32,color:'var(--muted-foreground)'}}>Carregando…</div>}

            {!loadingDias&&lancamentos.length===0&&(
              <div style={{textAlign:'center',padding:40,color:'var(--muted-foreground)',display:'flex',flexDirection:'column',alignItems:'center',gap:10}}>
                <Clock size={40} style={{opacity:0.3}}/>
                <div style={{fontWeight:600}}>Nenhum lançamento neste mês</div>
                <div style={{fontSize:13}}>Clique em "Novo Lançamento" para iniciar o ponto</div>
              </div>
            )}

            {/* Card por lançamento */}
            {lancamentos.map(lanc=>{
              const tot=totaisLanc(lanc.id)
              const diasLanc=diasMap[lanc.id]??[]
              const exp=expandido===lanc.id
              const pb=playbookMap[lanc.obra_id]??[]
              const prodLanc=producoes.filter(p=>p.lancamento_id===lanc.id)
              // Produção proporcional por dia trabalhado neste lançamento
              const totalProdLancamento=prodLanc.reduce((s,p)=>s+p.valor_total,0)
              const diasProdLanc=new Set(prodLanc.flatMap(p=>p.dias??[])).size
              const prodPorDia=diasProdLanc>0&&totalProdLancamento>0?totalProdLancamento/diasProdLanc:0

              return(
                <div key={lanc.id} style={{border:'1px solid var(--border)',borderRadius:10,overflow:'hidden',boxShadow:'0 1px 4px rgba(0,0,0,0.05)'}}>

                  {/* Cabeçalho do card */}
                  <div style={{display:'flex',alignItems:'center',gap:10,padding:'10px 14px',background:'var(--muted)',cursor:'pointer'}} onClick={()=>setExpandido(exp ? null : lanc.id)}>
                    {exp?<ChevronDown size={15}/>:<ChevronRight size={15}/>}
                    <Building2 size={14} style={{color:'var(--primary)',flexShrink:0}}/>
                    <div style={{flex:1}}>
                      <div style={{fontWeight:700,fontSize:14}}>{lanc.obra_nome}</div>
                      <div style={{fontSize:11,color:'var(--muted-foreground)',fontFamily:'monospace'}}>
                        {lanc.data_inicio.slice(8)}/{lanc.data_inicio.slice(5,7)} → {lanc.data_fim.slice(8)}/{lanc.data_fim.slice(5,7)}
                        <span style={{marginLeft:10}}>· {tot.presentes} dias · {fmtHHMM(tot.total)}h</span>
                        {tot.atestados>0&&<span style={{color:'#1d4ed8',marginLeft:8}}>🩺 {tot.atestados} afastamento{tot.atestados!==1?'s':''}</span>}
                        {tot.suspensoes>0&&<span style={{color:'#dc2626',marginLeft:8}}>⛔ {tot.suspensoes} suspensão</span>}
                      </div>
                    </div>
                    {/* Mini totais */}
                    {valorHora>0&&<div style={{fontSize:12,fontWeight:700,color:'#15803d',textAlign:'right'}}>
                      {formatCurrency((fmtDecimal(tot.normais)*valorHora)+(fmtDecimal(tot.extras50)*valorHora*1.5))}
                    </div>}
                    {/* Badge status */}
                    {(() => {
                      const cfg:{[k:string]:{bg:string;color:string;label:string}}={
                        rascunho:{bg:'#f1f5f9',color:'#475569',label:'Rascunho'},
                        aguardando_aprovacao:{bg:'#fef3c7',color:'#92400e',label:'⏳ Aguardando'},
                        aprovado:{bg:'#dcfce7',color:'#15803d',label:'✅ Aprovado'},
                        recusado:{bg:'#fee2e2',color:'#b91c1c',label:'❌ Recusado'},
                      }
                      const s=cfg[lanc.status]??cfg.rascunho
                      return<span style={{fontSize:10,fontWeight:700,padding:'2px 8px',borderRadius:10,background:s.bg,color:s.color,flexShrink:0}}>{s.label}</span>
                    })()}
                    {/* Ações */}
                    <div style={{display:'flex',gap:4}} onClick={e=>e.stopPropagation()}>
                      {/* Botão Lançar Produção — só em rascunho/recusado */}
                      {(lanc.status==='rascunho'||lanc.status==='recusado')&&(
                        <Button size="sm" variant="outline" style={{height:26,fontSize:11,gap:3,borderColor:'#f59e0b',color:pb.length===0?'#d97706':'#b45309',opacity:pb.length===0?0.6:1}} onClick={()=>{ if(pb.length===0){toast.error('Cadastre os itens de produção no Playbook desta obra antes de lançar'); return;} abrirModalProd(lanc.id)}}><Factory size={11}/> Produção{pb.length===0&&<span style={{fontSize:9,marginLeft:2}}>⚠</span>}</Button>
                      )}
                      {/* Botão Ver Produções — sempre visível quando há produções */}
                      {prodLanc.length>0&&(
                        <Button size="sm" variant="outline" style={{height:26,fontSize:11,gap:3,borderColor:'#d97706',color:'#92400e',background:prodExpandida===lanc.id?'#fef3c7':'transparent'}} onClick={e=>{e.stopPropagation();setProdExpandida(v=>v===lanc.id?null:lanc.id)}}>
                          🏗️ {prodLanc.length} produção{prodLanc.length!==1?'s':''} · {formatCurrency(totalProdLancamento)}
                          {prodExpandida===lanc.id?<ChevronDown size={11}/>:<ChevronRight size={11}/>}
                        </Button>
                      )}
                      {lanc.status==='rascunho'&&<Button size="sm" variant="outline" style={{height:26,fontSize:11,gap:2,borderColor:'#16a34a',color:'#15803d',background:'#f0fdf4'}} disabled={saving} onClick={async()=>{await salvarLanc(lanc.id);await mudarStatus(lanc.id,'aguardando_aprovacao')}}>✔ Salvar e Aprovar</Button>}
                      {lanc.status==='aguardando_aprovacao'&&<Button size="sm" variant="outline" style={{height:26,fontSize:11,gap:2,borderColor:'#16a34a',color:'#15803d'}} onClick={()=>mudarStatus(lanc.id,'aprovado')}>✅ Confirmar</Button>}
                      {lanc.status==='aguardando_aprovacao'&&<Button size="sm" variant="outline" style={{height:26,fontSize:11,gap:2,borderColor:'#dc2626',color:'#dc2626'}} onClick={()=>setModalRecusa({lancId:lanc.id,motivo:''})}>❌ Recusar</Button>}
                      {lanc.status==='recusado'&&<Button size="sm" variant="outline" style={{height:26,fontSize:11,gap:2,borderColor:'#16a34a',color:'#15803d',background:'#f0fdf4'}} disabled={saving} onClick={async()=>{await salvarLanc(lanc.id);await mudarStatus(lanc.id,'aguardando_aprovacao')}}>↩ Salvar e Reenviar</Button>}
                      {(lanc.status==='rascunho'||lanc.status==='recusado')&&<Button size="sm" variant="ghost" style={{height:26,width:26,padding:0,color:'var(--destructive)'}} onClick={()=>excluirLancamento(lanc.id)}><Trash2 size={12}/></Button>}
                    </div>
                  </div>

                  {/* Motivo recusa */}
                  {lanc.status==='recusado'&&lanc.motivo_recusa&&(
                    <div style={{background:'#fee2e2',borderBottom:'1px solid #fecaca',padding:'5px 14px',fontSize:11,color:'#b91c1c'}}>
                      ❌ Motivo: {lanc.motivo_recusa}
                    </div>
                  )}
                  {/* Produções do lançamento — expansível */}
                  {prodLanc.length>0&&prodExpandida===lanc.id&&(
                    <div style={{background:'#fffbeb',borderBottom:'1px solid #fde68a',padding:'6px 14px'}}>
                      {(() => {
                        const totalProdLanc = prodLanc.reduce((s,p)=>s+p.valor_total,0)
                        const diasProdPainel = new Set(prodLanc.flatMap(p=>p.dias??[])).size
                        const mediaDia = diasProdPainel>0 ? totalProdLanc/diasProdPainel : 0
                        return (
                          <>
                            <div style={{display:'flex',alignItems:'center',gap:10,marginBottom:4}}>
                              <div style={{fontSize:11,fontWeight:700,color:'#92400e'}}>🏗️ Produção lançada</div>
                              <div style={{marginLeft:'auto',display:'flex',gap:12,fontSize:11}}>
                                <span style={{color:'#b45309'}}>Total: <strong style={{color:'#92400e'}}>{formatCurrency(totalProdLanc)}</strong></span>
                                {mediaDia>0&&<span style={{color:'#92400e'}}>≈ <strong>{formatCurrency(mediaDia)}</strong>/dia ({diasProdPainel} dia{diasProdPainel!==1?'s':''})</span>}
                              </div>
                            </div>
                            <div style={{display:'flex',gap:6,flexWrap:'wrap'}}>
                              {prodLanc.map(p=>{
                                const nDias = p.dias?.length??0
                                const mediaDiaItem = nDias>0 ? p.valor_total/nDias : 0
                                return (
                                  <div key={p.id} style={{display:'flex',alignItems:'center',gap:6,background:'#fef3c7',borderRadius:6,padding:'3px 8px',fontSize:11}}>
                                    <span style={{fontWeight:600}}>{p.playbook_item?.descricao}</span>
                                    <span style={{color:'#92400e'}}>{p.quantidade} {p.playbook_item?.unidade} = <strong>{formatCurrency(p.valor_total)}</strong></span>
                                    <span style={{color:'#78350f',fontSize:10}}>({nDias} dia{nDias!==1?'s':''}{nDias>0?` · ${formatCurrency(mediaDiaItem)}/dia`:''})</span>
                                    {(lanc.status==='rascunho'||lanc.status==='recusado')&&
                                      <button onClick={()=>p.id&&deletarProducao(p.id)} style={{border:'none',background:'none',cursor:'pointer',color:'#ef4444',padding:0,lineHeight:1}}><X size={11}/></button>}
                                  </div>
                                )
                              })}
                            </div>
                          </>
                        )
                      })()}
                    </div>
                  )}

                  {/* Tabela de ponto */}
                  {exp&&(
                    <div style={{overflowX:'auto',overflowY:'auto',maxHeight:'60vh'}}>
                      <table style={{width:'100%',borderCollapse:'collapse',fontSize:12}}>
                        <thead>
                          <tr style={{background:'#1e3a5f',color:'#fff',position:'sticky',top:0,zIndex:2}}>
                            <th style={TH}>Dia</th><th style={TH}>Data</th>
                            <th style={{...TH,width:64}}>Presente</th><th style={{...TH,width:52}}>Falta</th>
                            <th style={TH}>Entrada</th><th style={TH}>Saída Alm.</th><th style={TH}>Ret. Alm.</th><th style={TH}>Saída</th>
                            <th style={{...TH,background:'#2d5a9e'}}>H.E.In</th><th style={{...TH,background:'#2d5a9e'}}>H.E.Out</th>
                            <th style={{...TH,background:'#1a4a1a'}}>Norm</th><th style={{...TH,background:'#2d5a1a'}}>Ext</th><th style={{...TH,background:'#0f3320'}}>Total</th>
                            <th style={{...TH,background:'#4a1a7a',width:80}}>Valor</th>
                            <th style={{...TH,width:80}}>Obs.</th>
                          </tr>
                        </thead>
                        <tbody>
                          {diasLanc.map((d,idx)=>{
                            const fds=isFDS(d.data); const calc=calcDia(d); const lancBloq=lanc.status!=='rascunho'&&lanc.status!=='recusado'
                            const bg=d.evento==='suspensao'?'rgba(239,68,68,0.09)':d.evento==='atestado'?'rgba(59,130,246,0.09)':fds?'rgba(100,100,100,0.04)':d.falta?'rgba(239,68,68,0.05)':d.presente?'rgba(22,163,74,0.03)':'transparent'
                            return(
                              <tr key={d.data} style={{borderBottom:'1px solid var(--border)',background:bg}}>
                                <td style={{...TD,fontWeight:700,textAlign:'center',color:fds?'#9ca3af':undefined}}>{diaSemana(d.data)}</td>
                                <td style={{...TD,textAlign:'center',fontFamily:'monospace',fontWeight:600}}>{d.data.slice(8)}/{d.data.slice(5,7)}</td>
                                <td style={{...TD,textAlign:'center'}}>
                                  {d.evento==='atestado'?<span title="Afastamento">🩺</span>
                                  :d.evento==='suspensao'?<span title="Suspensão">⛔</span>
                                  :d.evento==='outro_lancamento'?<span title="Pertence a outro lançamento">🔒</span>
                                  :<button onClick={()=>!lancBloq&&togglePresente(lanc.id,idx,colabSel!)} style={{border:'none',background:'none',cursor:lancBloq?'not-allowed':'pointer',padding:2,color:d.presente?'#16a34a':'#9ca3af',opacity:lancBloq?0.5:1}}>
                                    {d.presente?<CheckCircle2 size={16}/>:<span style={{fontSize:16,opacity:0.3}}>○</span>}
                                  </button>}
                                </td>
                                <td style={{...TD,textAlign:'center'}}>
                                  {!d.bloqueado&&<button onClick={()=>!lancBloq&&toggleFalta(lanc.id,idx)} style={{border:'none',background:'none',cursor:lancBloq?'not-allowed':'pointer',padding:2,color:d.falta?'#dc2626':'#9ca3af',opacity:lancBloq?0.5:1}}><span style={{fontSize:15,opacity:d.falta?1:0.3}}>✗</span></button>}
                                </td>
                                <td style={TD}><TI disabled={!d.presente||d.falta||d.bloqueado||lancBloq} value={d.hora_entrada} onChange={v=>updDia(lanc.id,idx,'hora_entrada',v)}/></td>
                                <td style={TD}><TI disabled={!d.presente||d.falta||d.bloqueado||lancBloq} value={d.saida_almoco} onChange={v=>updDia(lanc.id,idx,'saida_almoco',v)}/></td>
                                <td style={TD}><TI disabled={!d.presente||d.falta||d.bloqueado||lancBloq} value={d.retorno_almoco} onChange={v=>updDia(lanc.id,idx,'retorno_almoco',v)}/></td>
                                <td style={TD}><TI disabled={!d.presente||d.falta||d.bloqueado||lancBloq} value={d.hora_saida} onChange={v=>updDia(lanc.id,idx,'hora_saida',v)}/></td>
                                <td style={{...TD,background:'rgba(45,90,158,0.04)'}}><TI disabled={!d.presente||d.falta||d.bloqueado||lancBloq} value={d.he_entrada} onChange={v=>updDia(lanc.id,idx,'he_entrada',v)}/></td>
                                <td style={{...TD,background:'rgba(45,90,158,0.04)'}}><TI disabled={!d.presente||d.falta||d.bloqueado||lancBloq} value={d.he_saida} onChange={v=>updDia(lanc.id,idx,'he_saida',v)}/></td>
                                <td style={{...TD,textAlign:'center',fontWeight:600,color:calc.normais>0?'#15803d':'#9ca3af',background:'rgba(22,163,74,0.05)'}}>{calc.normais>0?fmtHHMM(calc.normais):'—'}</td>
                                <td style={{...TD,textAlign:'center',fontWeight:600,color:calc.extras50>0?'#1d4ed8':'#9ca3af',background:'rgba(45,90,158,0.05)'}}>{calc.extras50>0?fmtHHMM(calc.extras50)+'*':'—'}</td>
                                <td style={{...TD,textAlign:'center',fontWeight:700,background:'rgba(0,0,0,0.03)'}}>{calc.total>0?fmtHHMM(calc.total):'—'}</td>
                                <td style={{...TD,textAlign:'right',fontWeight:700,background:'rgba(74,26,122,0.05)',color:'#6d28d9',fontSize:11}}>
                                  {d.evento==='atestado'||d.evento==='suspensao'||d.falta
                                    ? <span style={{color:'#9ca3af'}}>—</span>
                                    : d.evento==='outro_lancamento'
                                    ? null
                                    : d.presente&&calc.total>0
                                    ? (() => {
                                        const ehAuto=colabSel?.tipo_contrato==='autonomo'||colabSel?.tipo_contrato==='pj'
                                        const vHoras=fmtDecimal(calc.normais)*valorHora + fmtDecimal(calc.extras50)*valorHora*1.5
                                        // Autônomo: se este dia foi marcado na produção → mostra prod proporcional; senão → horas
                                        if(ehAuto&&diasComProd.has(d.data)&&prodPorDia>0){
                                          return <span title={`Dia marcado na produção: ${formatCurrency(prodPorDia)}`} style={{cursor:'default',color:'#b45309',fontWeight:700}}>
                                            {formatCurrency(prodPorDia)}
                                            <span style={{display:'block',fontSize:9,fontWeight:400}}>prod.</span>
                                          </span>
                                        }
                                        // CLT ou autônomo sem prod neste dia: mostra horas
                                        return <span title={`Horas: ${formatCurrency(vHoras)}`} style={{cursor:'default'}}>
                                          {valorHora>0?formatCurrency(vHoras):'—'}
                                        </span>
                                      })()
                                    : <span style={{color:'#d1d5db',fontSize:9}}>{valorHora===0?'s/val':'—'}</span>
                                  }
                                </td>
                                <td style={{...TD,fontSize:10}}>
                                  {d.evento==='atestado'&&<span style={{color:'#1d4ed8',fontWeight:600}}>Afastamento</span>}
                                  {d.evento==='suspensao'&&<span style={{color:'#b91c1c',fontWeight:600}}>Suspensão</span>}
                                  {d.evento==='outro_lancamento'&&<span style={{color:'#6b7280',fontSize:10}}>🔒 outro lanç.</span>}
                                </td>
                              </tr>
                            )
                          })}
                        </tbody>
                        <tfoot>
                          <tr style={{background:'#1e3a5f',color:'#fff',fontWeight:700}}>
                            <td colSpan={4} style={{padding:'7px 12px',fontSize:11}}>
                              {tot.presentes} dia{tot.presentes!==1?'s':''} trabalhado{tot.presentes!==1?'s':''}
                              {tot.faltas>0&&<span style={{color:'#fca5a5',marginLeft:8}}>· {tot.faltas} falta{tot.faltas!==1?'s':''}</span>}
                            </td>
                            <td colSpan={6} style={{padding:'7px 12px',textAlign:'right',fontSize:10,opacity:0.7}}>{valorHora>0&&`R$ ${valorHora.toFixed(4)}/h`}</td>
                            <td style={{padding:'7px 6px',textAlign:'center',background:'rgba(22,163,74,0.3)'}}>{fmtHHMM(tot.normais)}</td>
                            <td style={{padding:'7px 6px',textAlign:'center',background:'rgba(45,90,158,0.4)'}}>{fmtHHMM(tot.extras50)}</td>
                            <td style={{padding:'7px 6px',textAlign:'center',background:'rgba(0,0,0,0.2)'}}>{fmtHHMM(tot.total)}</td>
                            <td style={{padding:'7px 8px',textAlign:'right',background:'rgba(74,26,122,0.4)',color:'#e9d5ff',fontWeight:700,fontSize:11}}>
                              {(() => {
                                const vHoras=fmtDecimal(tot.normais)*valorHora + fmtDecimal(tot.extras50)*valorHora*1.5
                                const ehAuto=colabSel?.tipo_contrato==='autonomo'||colabSel?.tipo_contrato==='pj'
                                if(vHoras===0&&totalProdLancamento===0)return '—'
                                if(ehAuto){
                                  // Autônomo: calcular horas só dos dias SEM produção neste lançamento
                                  const diasLancamento=diasMap[lanc.id]??[]
                                  let minSemProdLanc=0
                                  diasLancamento.forEach(d=>{
                                    if(!diasComProd.has(d.data)){const cl=calcDia(d);minSemProdLanc+=cl.normais+cl.extras50}
                                  })
                                  const horasLancSemProd=fmtDecimal(minSemProdLanc)*valorHora
                                  const vTotalAuto=horasLancSemProd+totalProdLancamento
                                  return <span title={`Horas(sem prod): ${formatCurrency(horasLancSemProd)} + Prod: ${formatCurrency(totalProdLancamento)}`}>
                                    {formatCurrency(vTotalAuto)}
                                    {totalProdLancamento>0&&<span style={{display:'block',fontSize:9,opacity:0.8}}>+{formatCurrency(totalProdLancamento)} prod</span>}
                                  </span>
                                }
                                // CLT: horas + DSR proporcional do lançamento
                                const duLanc=diasUteisPeriodo(lanc.data_inicio,lanc.data_fim,feriados)
                                const domLanc=domingosFeriadosPeriodo(lanc.data_inicio,lanc.data_fim,feriados)
                                const extrasLanc=fmtDecimal(tot.extras50)*valorHora*1.5
                                const dsrLanc=duLanc>0&&domLanc>0&&extrasLanc>0?(extrasLanc/duLanc)*domLanc:0
                                const totalLanc=vHoras+dsrLanc
                                return <span title={`Horas: ${formatCurrency(vHoras)}${dsrLanc>0?' + DSR: '+formatCurrency(dsrLanc):''}`}>
                                  {formatCurrency(totalLanc)}
                                  {dsrLanc>0&&<span style={{display:'block',fontSize:9,opacity:0.8}}>+{formatCurrency(dsrLanc)} DSR</span>}
                                </span>
                              })()}
                            </td>
                            <td/>
                          </tr>
                        </tfoot>
                      </table>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
          </>
        )}
      </div>
    </div>

    {/* ═══ MODAL CONFIRMAR EXCLUSÃO PRODUÇÃO ═══ */}
    {confirmarExclusaoProd&&(
      <div style={{position:'fixed',inset:0,background:'rgba(0,0,0,0.5)',zIndex:78,display:'flex',alignItems:'center',justifyContent:'center'}}>
        <div style={{background:'var(--background)',borderRadius:12,width:360,padding:24,boxShadow:'0 20px 60px rgba(0,0,0,0.3)',textAlign:'center'}}>
          <div style={{fontSize:32,marginBottom:8}}>🗑️</div>
          <h3 style={{fontWeight:800,fontSize:14,margin:'0 0 8px'}}>Remover produção?</h3>
          <p style={{fontSize:12,color:'var(--muted-foreground)',marginBottom:20}}>Este lançamento de produção será removido permanentemente.</p>
          <div style={{display:'flex',gap:10,justifyContent:'center'}}>
            <button onClick={()=>setConfirmarExclusaoProd(null)} style={{padding:'6px 16px',borderRadius:6,border:'1px solid var(--border)',background:'var(--background)',cursor:'pointer',fontSize:13}}>Cancelar</button>
            <button onClick={()=>confirmarDeleteProd(confirmarExclusaoProd)} style={{padding:'6px 16px',borderRadius:6,border:'none',background:'#dc2626',color:'#fff',cursor:'pointer',fontSize:13,fontWeight:700}}>Remover</button>
          </div>
        </div>
      </div>
    )}

    {/* ═══ MODAL CONFIRMAR EXCLUSÃO ═══ */}
    {modalExcluir&&(
      <div style={{position:'fixed',inset:0,background:'rgba(0,0,0,0.5)',zIndex:75,display:'flex',alignItems:'center',justifyContent:'center'}}>
        <div style={{background:'var(--background)',borderRadius:12,width:380,padding:28,boxShadow:'0 20px 60px rgba(0,0,0,0.3)'}}>
          <div style={{textAlign:'center',marginBottom:20}}>
            <div style={{fontSize:36,marginBottom:8}}>🗑️</div>
            <h3 style={{fontWeight:800,fontSize:15,margin:0}}>Excluir lançamento?</h3>
            <p style={{fontSize:13,color:'var(--muted-foreground)',marginTop:8}}>
              Todos os registros de ponto deste período serão apagados permanentemente.
            </p>
          </div>
          <div style={{display:'flex',gap:10,justifyContent:'center'}}>
            <Button variant="outline" onClick={()=>setModalExcluir(null)}>Cancelar</Button>
            <Button style={{background:'#dc2626',color:'#fff'}} onClick={()=>confirmarExclusao(modalExcluir)}>
              🗑️ Confirmar Exclusão
            </Button>
          </div>
        </div>
      </div>
    )}

    {/* ═══ MODAL RECUSA ═══ */}
    {modalRecusa&&(
      <div style={{position:'fixed',inset:0,background:'rgba(0,0,0,0.5)',zIndex:70,display:'flex',alignItems:'center',justifyContent:'center'}}>
        <div style={{background:'var(--background)',borderRadius:12,width:420,padding:28,boxShadow:'0 20px 60px rgba(0,0,0,0.3)'}}>
          <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:16}}>
            <h3 style={{fontWeight:800,fontSize:15,margin:0,color:'#b91c1c'}}>❌ Recusar Lançamento</h3>
            <button onClick={()=>setModalRecusa(null)} style={{border:'none',background:'none',cursor:'pointer'}}><X size={16}/></button>
          </div>
          <div style={{marginBottom:16}}>
            <label style={{...LBL,color:'#b91c1c'}}>Motivo da recusa *</label>
            <textarea
              value={modalRecusa.motivo}
              onChange={e=>setModalRecusa(r=>r?{...r,motivo:e.target.value}:null)}
              placeholder="Descreva o motivo da recusa para orientar o colaborador…"
              rows={4}
              style={{width:'100%',padding:'8px 10px',fontSize:13,border:'2px solid #fecaca',borderRadius:6,background:'var(--background)',color:'var(--foreground)',resize:'vertical',fontFamily:'inherit',boxSizing:'border-box'}}
            />
            {modalRecusa.motivo.trim()===''&&<div style={{fontSize:11,color:'#b91c1c',marginTop:4}}>⚠️ O motivo é obrigatório</div>}
          </div>
          <div style={{display:'flex',gap:10,justifyContent:'flex-end'}}>
            <Button variant="outline" onClick={()=>setModalRecusa(null)}>Cancelar</Button>
            <Button
              disabled={modalRecusa.motivo.trim()===''}
              style={{background:'#dc2626',color:'#fff',opacity:modalRecusa.motivo.trim()===''?0.5:1}}
              onClick={async()=>{
                if(!modalRecusa.motivo.trim()){toast.error('Informe o motivo');return}
                await mudarStatus(modalRecusa.lancId,'recusado',modalRecusa.motivo.trim())
                setModalRecusa(null)
              }}
            >❌ Confirmar Recusa</Button>
          </div>
        </div>
      </div>
    )}

    {/* ═══ MODAL NOVO LANÇAMENTO ═══ */}
    {modalLanc&&colabSel&&(
      <div style={{position:'fixed',inset:0,background:'rgba(0,0,0,0.5)',zIndex:60,display:'flex',alignItems:'center',justifyContent:'center'}}>
        <div style={{background:'var(--background)',borderRadius:12,width:460,padding:28,boxShadow:'0 20px 60px rgba(0,0,0,0.3)'}}>
          <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:20}}>
            <h3 style={{fontWeight:800,fontSize:16,margin:0}}>Novo Lançamento de Ponto</h3>
            <button onClick={()=>setModalLanc(false)} style={{border:'none',background:'none',cursor:'pointer'}}><X size={18}/></button>
          </div>
          <div style={{display:'flex',flexDirection:'column',gap:14}}>
            <div>
              <label style={LBL}>Obra *</label>
              <select value={novoLancObraId} onChange={e=>setNovoLancObraId(e.target.value)} style={SEL}>
                <option value="">— Selecionar obra —</option>
                {obras.map(o=>{
                  const n=lancamentos.filter(l=>l.obra_id===o.id).length
                  const bloq=n>=2
                  return<option key={o.id} value={o.id} disabled={bloq}>{o.nome}{n>0?` (${n}/2 lançamento${n!==1?'s':''})`:''}{bloq?' — limite atingido':''}</option>
                })}
              </select>
              {novoLancObraId&&lancamentos.filter(l=>l.obra_id===novoLancObraId).length>=2&&(
                <div style={{fontSize:11,color:'#b91c1c',marginTop:4}}>⚠️ Esta obra já tem 2 lançamentos neste mês</div>
              )}
            </div>
            <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:12}}>
              <div>
                <label style={LBL}>Data de Início *</label>
                <input type="date" value={novoLancInicio} onChange={e=>setNovoLancInicio(e.target.value)}
                  min={`${mesRef}-01`} max={`${mesRef}-${String(new Date(ano,mes,0).getDate()).padStart(2,'0')}`}
                  style={{width:'100%',padding:'8px 10px',fontSize:13,border:'1px solid var(--border)',borderRadius:6,background:'var(--background)',color:'var(--foreground)'}}/>
              </div>
              <div>
                <label style={LBL}>Data de Fim *</label>
                <input type="date" value={novoLancFim} onChange={e=>setNovoLancFim(e.target.value)}
                  min={novoLancInicio||`${mesRef}-01`} max={`${mesRef}-${String(new Date(ano,mes,0).getDate()).padStart(2,'0')}`}
                  style={{width:'100%',padding:'8px 10px',fontSize:13,border:'1px solid var(--border)',borderRadius:6,background:'var(--background)',color:'var(--foreground)'}}/>
              </div>
            </div>
            {novoLancInicio&&novoLancFim&&(()=>{
              const dias=expandRange(novoLancInicio,novoLancFim)
              // Dias com conflito na MESMA obra (bloqueia criação)
              const confMesmaObra=dias.filter(d=>
                lancamentos.filter(l=>l.obra_id===novoLancObraId)
                  .flatMap(l=>expandRange(l.data_inicio,l.data_fim)).includes(d)
              )
              // Dias já lançados em OUTRA obra (apenas informativo, 🔒 no ponto)
              const confOutraObra=novoLancObraId?dias.filter(d=>
                !confMesmaObra.includes(d)&&
                lancamentos.filter(l=>l.obra_id!==novoLancObraId)
                  .flatMap(l=>expandRange(l.data_inicio,l.data_fim)).includes(d)
              ):[]
              const diasLivres=dias.length-confMesmaObra.length-confOutraObra.length
              return(
                <div style={{display:'flex',flexDirection:'column',gap:6}}>
                  {confMesmaObra.length>0&&(
                    <div style={{fontSize:12,padding:'6px 10px',background:'#fee2e2',borderRadius:6,border:'1px solid #fecaca',color:'#b91c1c'}}>
                      🚫 {confMesmaObra.length} dia(s) já existem nesta obra — altere o período
                    </div>
                  )}
                  {confOutraObra.length>0&&(
                    <div style={{fontSize:12,padding:'6px 10px',background:'#fef9c3',borderRadius:6,border:'1px solid #fde68a',color:'#854d0e'}}>
                      🔒 {confOutraObra.length} dia(s) já lançados em outra obra — aparecerão bloqueados
                    </div>
                  )}
                  <div style={{fontSize:12,padding:'6px 10px',background:'var(--muted)',borderRadius:6}}>
                    <strong>{diasLivres} dias livres</strong> de {dias.length} ({dias.filter(d=>!isFDS(d)).length} úteis + {dias.filter(d=>isFDS(d)).length} fins de semana)
                  </div>
                </div>
              )
            })()}
          </div>
          <div style={{display:'flex',gap:10,marginTop:20,justifyContent:'flex-end'}}>
            <Button variant="outline" onClick={()=>setModalLanc(false)}>Cancelar</Button>
            <Button onClick={criarLancamento} disabled={savingLanc}>{savingLanc?'Criando…':'✅ Criar Lançamento'}</Button>
          </div>
        </div>
      </div>
    )}

    {/* ═══ MODAL PRODUÇÃO ═══ */}
    {modalProd&&colabSel&&(()=>{
      const lanc=lancamentos.find(l=>l.id===prodLancId)
      const pb=lanc?playbookMap[lanc.obra_id]??[]:[]
      const diasDisp=(diasMap[prodLancId]??[]).filter(d=>d.evento!=='atestado'&&d.evento!=='suspensao'&&d.presente)
      const totalCalc=itensProd.reduce((s,i)=>{const p=pb.find(x=>x.id===i.playbook_item_id);return s+(p?p.preco_unitario*i.quantidade:0)},0)
      return(
        <div style={{position:'fixed',inset:0,background:'rgba(0,0,0,0.55)',zIndex:60,display:'flex',alignItems:'center',justifyContent:'center'}}>
          <div style={{background:'var(--background)',borderRadius:14,width:660,maxHeight:'85vh',overflow:'auto',boxShadow:'0 24px 80px rgba(0,0,0,0.4)'}}>
            <div style={{padding:'16px 22px 12px',borderBottom:'1px solid var(--border)',display:'flex',alignItems:'center',gap:10}}>
              <Factory size={16} style={{color:'#b45309'}}/>
              <div style={{flex:1}}>
                <div style={{fontWeight:800,fontSize:15}}>Lançar Produção</div>
                <div style={{fontSize:11,color:'var(--muted-foreground)'}}>{lanc?.obra_nome} · {MESES[mes-1]}/{ano}</div>
              </div>
              <button onClick={()=>setModalProd(false)} style={{border:'none',background:'none',cursor:'pointer'}}><X size={16}/></button>
            </div>
            <div style={{padding:'18px 22px',display:'flex',flexDirection:'column',gap:18}}>
              <div>
                <div style={{fontWeight:700,fontSize:13,marginBottom:8}}>1. Selecione os dias de produção</div>
                <div style={{display:'flex',flexWrap:'wrap',gap:5}}>
                  {diasDisp.length===0&&<span style={{fontSize:12,color:'var(--muted-foreground)'}}>Nenhum dia com presença disponível</span>}
                  {diasDisp.map(d=>{
                    const sel=diasSelProd.has(d.data)
                    return<button key={d.data} onClick={()=>setDiasSelProd(p=>{const n=new Set(p);sel?n.delete(d.data):n.add(d.data);return n})} style={{padding:'4px 9px',borderRadius:5,fontSize:12,fontWeight:600,cursor:'pointer',border:'2px solid',borderColor:sel?'#b45309':'var(--border)',background:sel?'#fef3c7':'transparent',color:sel?'#92400e':'var(--foreground)'}}>
                      {d.data.slice(8)}/{d.data.slice(5,7)} {diaSemana(d.data)}
                    </button>
                  })}
                </div>
              </div>
              <div>
                <div style={{fontWeight:700,fontSize:13,marginBottom:8}}>2. Serviços produzidos</div>
                <div style={{display:'flex',flexDirection:'column',gap:7}}>
                  {itensProd.map((item,idx)=>{
                    const p=pb.find(x=>x.id===item.playbook_item_id)
                    return<div key={idx} style={{display:'grid',gridTemplateColumns:'1fr 120px 110px 28px',gap:7,alignItems:'center'}}>
                      <select value={item.playbook_item_id} onChange={e=>setItensProd(prev=>prev.map((it,i)=>i===idx?{...it,playbook_item_id:e.target.value}:it))} style={{padding:'6px 9px',fontSize:12,border:'1px solid var(--border)',borderRadius:6,background:'var(--background)',color:'var(--foreground)'}}>
                        <option value="">— Serviço —</option>
                        {pb.map(p=><option key={p.id} value={p.id}>{p.descricao} ({p.unidade})</option>)}
                      </select>
                      <input type="number" min="0" step="0.01" placeholder={`Qtd ${p?.unidade??''}`} value={item.quantidade||''}
                        onChange={e=>setItensProd(prev=>prev.map((it,i)=>i===idx?{...it,quantidade:parseFloat(e.target.value)||0}:it))}
                        style={{padding:'6px 9px',fontSize:12,border:'1px solid var(--border)',borderRadius:6,background:'var(--background)',color:'var(--foreground)',textAlign:'right'}}/>
                      <div style={{textAlign:'right',fontWeight:700,color:'#b45309',fontSize:12}}>{p&&item.quantidade>0?formatCurrency(p.preco_unitario*item.quantidade):'—'}</div>
                      <button onClick={()=>setItensProd(p=>p.filter((_,i)=>i!==idx))} disabled={itensProd.length<=1} style={{border:'none',background:'none',cursor:'pointer',color:'#ef4444',opacity:itensProd.length<=1?0.3:1}}><X size={13}/></button>
                    </div>
                  })}
                  <Button variant="outline" size="sm" onClick={()=>setItensProd(p=>[...p,{playbook_item_id:pb[0]?.id??'',quantidade:0}])} style={{width:'fit-content',gap:4,fontSize:11}}><Plus size={11}/> Adicionar</Button>
                </div>
              </div>
              {diasSelProd.size>0&&totalCalc>0&&(
                <div style={{background:'#fef3c7',borderRadius:8,padding:'10px 14px',border:'1px solid #fde68a'}}>
                  <span style={{fontSize:12,color:'#92400e'}}><strong>{diasSelProd.size}</strong> dias · </span>
                  <span style={{fontSize:15,fontWeight:800,color:'#b45309'}}>Total: {formatCurrency(totalCalc)}</span>
                </div>
              )}
            </div>
            <div style={{padding:'12px 22px',borderTop:'1px solid var(--border)',display:'flex',gap:10,justifyContent:'flex-end'}}>
              <Button variant="outline" onClick={()=>setModalProd(false)}>Cancelar</Button>
              <Button onClick={salvarProducao} disabled={savingProd} style={{background:'#b45309',color:'#fff'}}>{savingProd?'⏳…':'🏗️ Salvar Produção'}</Button>
            </div>
          </div>
        </div>
      )
    })()}
    </>
  )
}

// ─── Estilos ──────────────────────────────────────────────────────────────────
const TH:React.CSSProperties={padding:'7px 4px',fontWeight:700,fontSize:10,textTransform:'uppercase',letterSpacing:'0.04em',textAlign:'center',whiteSpace:'nowrap'}
const TD:React.CSSProperties={padding:'2px 3px'}
const LBL:React.CSSProperties={display:'block',fontSize:12,fontWeight:600,marginBottom:4,color:'var(--muted-foreground)'}
const SEL:React.CSSProperties={width:'100%',padding:'8px 10px',fontSize:13,border:'1px solid var(--border)',borderRadius:6,background:'var(--background)',color:'var(--foreground)'}

function TI({value,onChange,disabled}:{value:string;onChange:(v:string)=>void;disabled:boolean}){
  return<input type="time" value={value} onChange={e=>onChange(e.target.value)} disabled={disabled} style={{width:74,padding:'2px 3px',fontSize:11,border:'1px solid var(--border)',borderRadius:4,background:disabled?'transparent':'var(--background)',color:disabled?'#9ca3af':'var(--foreground)',fontFamily:'monospace',textAlign:'center',cursor:disabled?'not-allowed':'text',outline:'none'}}/>
}
