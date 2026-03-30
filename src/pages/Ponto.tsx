import React, { useEffect, useState, useCallback, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
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
import { calcDSRComFaltas } from '@/lib/dsr'

// ─── Tipos ────────────────────────────────────────────────────────────────────

interface ColabSimples {
  id: string; nome: string; chapa: string | null
  funcao_id: string | null; obra_id: string | null
  tipo_contrato: string; funcao_nome: string
  data_admissao: string | null   // data de início dos trabalhos
  status: string                 // ativo | inativo | afastado | ferias
  data_status: string | null     // data da mudança de status (inativo/afastado/ferias)
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
  status: 'rascunho'|'aguardando_aprovacao'|'em_fechamento'|'aprovado'|'recusado'|'liberado'|'pago'
  motivo_recusa: string | null
  valor_hora_snapshot: number | null  // gravado ao salvar (salvarLanc) — imutável
  snap_valor_hora:     number | null  // gravado pelo Fechamento (aprovarLanc) — fallback
}
type TipoEvento = 'atestado' | 'suspensao' | 'outro_lancamento' | null
interface DiaRegistro {
  id?: string; lancamento_id: string; colaborador_id: string
  data: string; obra_id: string
  presente: boolean; falta: boolean
  feriado_remunerado: boolean   // feriado não-trabalhado mas pago (dia normal)
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
// Calcula valor monetário a partir dos minutos por tipo de hora
// heCoef50: coeficiente para HE dia útil/sáb (padrão 1.5 = +50%); heCoef100: dom/feriado (padrão 2.0 = +100%)
function calcValorMin(normais:number,extras50:number,extras100:number,vh:number,heCoef50=1.5,heCoef100=2.0):number {
  return fmtDecimal(normais)*vh + fmtDecimal(extras50)*vh*heCoef50 + fmtDecimal(extras100)*vh*heCoef100
}
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

// ─── Clamp de período: garante que data_inicio e data_fim respeitam admissão e inativação ──
// Regra: data_inicio = max(inicio_mes, data_admissao)
//        data_fim    = min(fim_mes,   data_inativacao)  — usa data_status quando status ≠ ativo
function clampPeriodoColab(
  inicioMes: string,
  fimMes: string,
  dataAdmissao: string | null,
  dataInativacao: string | null // data_status quando inativo/demitido
): { inicio: string; fim: string } {
  let inicio = inicioMes
  let fim    = fimMes
  if (dataAdmissao && dataAdmissao > inicio) inicio = dataAdmissao
  if (dataInativacao && dataInativacao < fim) fim = dataInativacao
  // segurança: se inicio > fim, usa admissão como único dia
  if (inicio > fim) fim = inicio
  return { inicio, fim }
}

// DSR helpers ──────────────────────────────────────────────────────────────
// REGRA SIMPLIFICADA:
//   Dias úteis = Seg–Sex (sábado NÃO é dia útil; feriados TAMBÉM não)
//   Candidatos a DSR = apenas Domingos
//   Feriados são tratados por presença ou feriado_remunerado (não entram no DSR)
function diasUteisPeriodo(inicio:string,fim:string,feriadosSet?:Set<string>):number {
  const fer=feriadosSet??new Set<string>()
  const dias=expandRange(inicio,fim)
  return dias.filter(d=>{
    const dow=new Date(d+'T12:00:00').getDay()
    if(dow===0||dow===6) return false   // Dom e Sáb fora
    if(fer.has(d))       return false   // Feriado Seg-Sex fora
    return true                          // Seg-Sex normais = dias úteis
  }).length
}
// Candidatos a DSR: apenas Domingos
function domingosFeriadosPeriodo(inicio:string,fim:string,_feriadosSet?:Set<string>):number {
  return expandRange(inicio,fim).filter(d=>new Date(d+'T12:00:00').getDay()===0).length
}

// ─── Cálculo do direito ao feriado ──────────────────────────────────────────
// Regras:
//   1. Feriado em dom/sáb → o colaborador recebe o dia normalmente (já está no DSR/sáb).
//      Somente feriados em Seg–Sex geram direito separado.
//   2. Se o colaborador TRABALHOU no feriado → recebe pelas horas normais (já em calcDia).
//      O "direito ao feriado" aqui é para quem NÃO trabalhou mas tem direito ao dia.
//   3. Perde o direito se tiver falta no dia útil IMEDIATAMENTE anterior ou posterior ao feriado.
export interface FeriadoInfo {
  data: string
  perdeu: boolean          // true = perdeu o direito por falta adjacente
  motivo: string           // descrição do motivo da perda
  horas_devidas: number    // minutos da jornada (para quem não trabalhou)
  trabalhou: boolean       // true = marcou ponto naquele dia
}

function calcFeriados(
  diasLanc: DiaRegistro[],
  feriadosSet: Set<string>,
  datasComFalta: Set<string>,
  horObra: Record<string,HorarioDia>   // jornada padrão da obra
): FeriadoInfo[] {
  // Montar mapa data→DiaRegistro para acesso rápido
  const mapaD: Record<string,DiaRegistro> = {}
  diasLanc.forEach(d=>{ mapaD[d.data]=d })

  // Filtrar feriados em Seg–Sex dentro do período do lançamento
  const feriadosUteis = diasLanc
    .filter(d=>{
      if(!feriadosSet.has(d.data)) return false
      const dow=new Date(d.data+'T12:00:00').getDay()
      return dow>=1&&dow<=5   // Seg-Sex apenas
    })
    .map(d=>d.data)

  const DIAS_PT=['dom','seg','ter','qua','qui','sex','sab']

  return feriadosUteis.map(data=>{
    const dow=new Date(data+'T12:00:00').getDay()
    const d=mapaD[data]
    const trabalhou=!!(d?.presente&&!d.falta)

    // Dia útil imediatamente anterior ao feriado (pula FDS e outros feriados)
    let antData: string|null=null
    const antRaw=new Date(data+'T12:00:00'); antRaw.setDate(antRaw.getDate()-1)
    // Anda para trás até encontrar Seg–Sex não-feriado dentro do lançamento
    for(let i=0;i<7;i++){
      const dd=antRaw.toISOString().slice(0,10)
      if(!mapaD[dd]){antRaw.setDate(antRaw.getDate()-1);continue}
      const dw=antRaw.getDay()
      if(dw>=1&&dw<=5&&!feriadosSet.has(dd)){antData=dd;break}
      antRaw.setDate(antRaw.getDate()-1)
    }

    // Dia útil imediatamente posterior ao feriado
    let posData: string|null=null
    const posRaw=new Date(data+'T12:00:00'); posRaw.setDate(posRaw.getDate()+1)
    for(let i=0;i<7;i++){
      const dd=posRaw.toISOString().slice(0,10)
      if(!mapaD[dd]){posRaw.setDate(posRaw.getDate()+1);continue}
      const dw=posRaw.getDay()
      if(dw>=1&&dw<=5&&!feriadosSet.has(dd)){posData=dd;break}
      posRaw.setDate(posRaw.getDate()+1)
    }

    let perdeu=false; let motivo=''
    if(antData&&datasComFalta.has(antData)){
      perdeu=true
      motivo=`Falta em ${new Date(antData+'T12:00:00').toLocaleDateString('pt-BR')} (dia anterior ao feriado)`
    } else if(posData&&datasComFalta.has(posData)){
      perdeu=true
      motivo=`Falta em ${new Date(posData+'T12:00:00').toLocaleDateString('pt-BR')} (dia posterior ao feriado)`
    }

    // Horas devidas = jornada padrão do dia da semana na obra
    const diaSemKey=DIAS_PT[dow]
    const hor=horObra[diaSemKey]
    let horas_devidas=0
    if(hor?.hora_entrada&&hor?.hora_saida){
      let bruto=diffMin(hor.hora_entrada,hor.hora_saida)
      if(hor.saida_almoco&&hor.retorno_almoco) bruto-=diffMin(hor.saida_almoco,hor.retorno_almoco)
      else if(hor.saida_almoco) bruto-=60
      horas_devidas=Math.max(0,bruto)
    }

    return{data,perdeu,motivo,horas_devidas,trabalhou}
  })
}

/**
 * calcDia — lógica simplificada:
 *
 * CLT:
 *   • Feriado + presente         → +100% em todas as horas
 *   • Feriado + feriado_remunerado (sem presença) → horas da jornada padrão (normais)
 *   • Feriado sem presença/rem   → 0
 *   • Sábado + presente          → +50% em todas as horas (sáb NÃO é dia útil)
 *   • Seg-Sex normal + presente  → normais + HE a 50%
 * Autônomo/PJ:
 *   • Sempre: horas como normais (diária)
 */
function calcDia(
  d: DiaRegistro,
  isFeriado = false,
  isClt = true,
  horasJornada = 0   // minutos da jornada padrão (para feriado_remunerado)
): {normais:number;extras50:number;extras100:number;total:number} {
  const dow=new Date(d.data+'T12:00:00').getDay()
  const isSab=dow===6

  // Feriado remunerado (não trabalhou, mas é pago como dia normal)
  // Aplica tanto para CLT quanto para Autônomo/PJ — desde que o checkbox esteja marcado
  if(isFeriado && !d.presente && d.feriado_remunerado){
    const h=horasJornada>0?horasJornada:480  // fallback 8h
    return{normais:h,extras50:0,extras100:0,total:h}
  }

  // Sem presença e sem remunerado = sem valor
  if(!d.presente||d.falta)return{normais:0,extras50:0,extras100:0,total:0}

  // Calcular horas trabalhadas
  let horasDia=0
  if(d.hora_entrada&&d.hora_saida){
    let bruto=diffMin(d.hora_entrada,d.hora_saida)
    if(d.saida_almoco&&d.retorno_almoco)bruto-=diffMin(d.saida_almoco,d.retorno_almoco)
    else if(d.saida_almoco)bruto-=60
    horasDia=Math.max(0,bruto)
  } else {
    // Sem horário registrado (ex: ponto lançado via portal sem entrada/saída)
    // Usa a jornada padrão da obra como referência para cálculo do valor
    horasDia = horasJornada > 0 ? horasJornada : 480  // fallback 8h = 480min
  }
  let he=0; if(d.he_entrada&&d.he_saida)he=Math.max(0,diffMin(d.he_entrada,d.he_saida))

  if(!isClt){
    // Autônomo/PJ: mesmas regras de sábado, domingo e feriado que CLT
    // Feriado + presença → +100% (hora extra a 100%)
    if(isFeriado){
      return{normais:0,extras50:0,extras100:horasDia+he,total:horasDia+he}
    }
    // Sábado + presença → +50%
    if(isSab){
      return{normais:0,extras50:horasDia+he,extras100:0,total:horasDia+he}
    }
    // Domingo + presença → +100% (dia de descanso)
    const isDom=new Date(d.data+'T12:00:00').getDay()===0
    if(isDom){
      return{normais:0,extras50:0,extras100:horasDia+he,total:horasDia+he}
    }
    // Seg-Sex normal → horas normais + HE a 50%
    return{normais:horasDia,extras50:he,extras100:0,total:horasDia+he}
  }
  if(isFeriado){
    // Feriado com presença → +100%
    return{normais:0,extras50:0,extras100:horasDia+he,total:horasDia+he}
  }
  if(isSab){
    // Sábado com presença → +50%
    return{normais:0,extras50:horasDia+he,extras100:0,total:horasDia+he}
  }
  // Seg-Sex normal
  return{normais:horasDia,extras50:he,extras100:0,total:horasDia+he}
}

function emptyDia(colabId:string,lancId:string,obraId:string,data:string):DiaRegistro {
  return{lancamento_id:lancId,colaborador_id:colabId,data,obra_id:obraId,
    presente:false,falta:false,feriado_remunerado:false,
    hora_entrada:'',saida_almoco:'',retorno_almoco:'',hora_saida:'',
    he_entrada:'',he_saida:'',justificativa:'',evento:null,bloqueado:false}
}

// ─── Componente ───────────────────────────────────────────────────────────────
export default function Ponto() {
  const nav = useNavigate()
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

  // Histórico de contratos e aba ativa
  const [abaContrato, setAbaContrato] = useState<'clt'|'autonomo'|'pj'>('clt')
  const [historicoContrato, setHistoricoContrato] = useState<{tipo_contrato:string;data_inicio:string;data_fim:string|null}[]>([])
  // valor/hora ao vivo por tipo de contrato (para rascunhos sem snapshot)
  const [valorHoraPorTipo, setValorHoraPorTipo] = useState<Record<string,number>>({})

  // Modal novo lançamento
  const [modalLanc, setModalLanc] = useState(false)
  const [feriados, setFeriados] = useState<Set<string>>(new Set()) // 'YYYY-MM-DD'
  const [prodExpandida, setProdExpandida] = useState<string|null>(null) // lancId com prod visível
  const [novoLancObraId, setNovoLancObraId] = useState('')
  const [novoLancInicio, setNovoLancInicio] = useState('')
  const [novoLancFim, setNovoLancFim]       = useState('')
  const [savingLanc, setSavingLanc] = useState(false)

  // Coeficientes de HE configurados no banco (fallback: CLT padrão)
  const [heCoef50,  setHeCoef50]  = useState(1.5)   // HE dia útil (configurável, ex: 1.60)
  const [heCoef100, setHeCoef100] = useState(2.0)   // Dom/Feriado (+100%)

  // Modal produção
  const [modalProd, setModalProd]   = useState(false)
  const [prodLancId, setProdLancId] = useState('')
  const [diasSelProd, setDiasSelProd] = useState<Set<string>>(new Set())
  const [itensProd, setItensProd]   = useState<{playbook_item_id:string;quantidade:number}[]>([])
  const [savingProd, setSavingProd] = useState(false)

  const [saving, setSaving] = useState(false)
  const [valorHora, setValorHora] = useState(0)       // valor AO VIVO da função (para novos rascunhos)
  const [valorHoraCongelado, setValorHoraCongelado] = useState<number|null>(null)  // valor gravado no lançamento
  // Mapa lancId → snapshot próprio do lançamento (null = usar valorHora ao vivo)
  const [snapshotPorLanc, setSnapshotPorLanc] = useState<Map<string,number|null>>(new Map())
  const [loadingDias, setLoadingDias] = useState(false)

  // Modal recusa
  const [modalRecusa, setModalRecusa] = useState<{lancId:string;motivo:string}|null>(null)

  // ── Painel Portal (importação de ponto lançado pelo encarregado) ──────────
  const [modalPortal, setModalPortal]   = useState(false)
  const [portalStep, setPortalStep]     = useState<'periodo' | 'dados'>('periodo')
  const [portalInicio, setPortalInicio] = useState('')
  const [portalFim, setPortalFim]       = useState('')
  const [portalObraFiltro, setPortalObraFiltro] = useState('')
  const [portalDados, setPortalDados] = useState<{
    id:string; colaborador_id:string; colab_nome:string; data:string; obra_id:string
    status:string; horas_extra:number; horas_falta:number; observacoes:string|null
    sincronizado_em:string|null
  }[]>([])
  const [loadingPortal, setLoadingPortal]           = useState(false)
  const [importandoPortal, setImportandoPortal]     = useState<Set<string>>(new Set())
  const [criandoEmLote, setCriandoEmLote]           = useState(false)
  const [progressoLote, setProgressoLote]           = useState('')
  const [progressoLoteNum, setProgressoLoteNum]     = useState({ feitos: 0, total: 0 })

  // ── Painel Portal Produção ─────────────────────────────────────────────────
  const [modalPortalProd, setModalPortalProd]     = useState(false)
  const [portalProdInicio, setPortalProdInicio]   = useState('')
  const [portalProdFim, setPortalProdFim]         = useState('')
  const [portalProdObraFiltro, setPortalProdObraFiltro] = useState('')
  const [portalProdDados, setPortalProdDados]     = useState<{
    id:string; colaborador_id:string; colab_nome:string; obra_id:string; obra_nome:string
    data:string; quantidade:number; obs:string|null; sincronizado_em:string|null
    playbook_item_id:string|null; item_nome:string|null; lancamento_id:string|null
  }[]>([])
  const [loadingPortalProd, setLoadingPortalProd]         = useState(false)
  const [importandoPortalProd, setImportandoPortalProd]   = useState<Set<string>>(new Set())
  const [criandoProdLote, setCriandoProdLote]             = useState(false)

  async function fetchPortalProd(inicio: string, fim: string, obraId?: string) {
    setLoadingPortalProd(true)
    const q = supabase
      .from('portal_producao')
      .select('id,colaborador_id,obra_id,playbook_item_id,lancamento_id,data,quantidade,obs,sincronizado_em,colaboradores(nome),obras(nome),playbook_itens(descricao)')
      .gte('data', inicio)
      .lte('data', fim)
      .order('obra_id').order('data')
    if (obraId) q.eq('obra_id', obraId)
    const { data } = await q
    setPortalProdDados((data ?? []).map((r:any) => ({
      id: r.id,
      colaborador_id: r.colaborador_id,
      colab_nome: r.colaboradores?.nome ?? '—',
      obra_id: r.obra_id,
      obra_nome: r.obras?.nome ?? '—',
      data: r.data,
      quantidade: r.quantidade,
      obs: r.obs ?? null,
      sincronizado_em: r.sincronizado_em,
      playbook_item_id: r.playbook_item_id,
      item_nome: r.playbook_itens?.descricao ?? null,
      lancamento_id: r.lancamento_id,
    })))
    setLoadingPortalProd(false)
  }

  async function importarPortalProd(reg: typeof portalProdDados[0]) {
    if (reg.sincronizado_em) return
    setImportandoPortalProd(prev => new Set([...prev, reg.id]))
    // Encontra ou cria lançamento para o colaborador/obra/mês
    const mr = reg.data.slice(0,7)
    let lancId = reg.lancamento_id
    if (!lancId) {
      const { data: existentes } = await supabase.from('ponto_lancamentos')
        .select('id').eq('colaborador_id', reg.colaborador_id).eq('obra_id', reg.obra_id)
        .lte('data_inicio', reg.data).gte('data_fim', reg.data).limit(1)
      if (existentes && existentes.length > 0) {
        lancId = existentes[0].id
      } else {
        // Cria novo — respeitando data_admissao e data_status do colaborador
        const colabRefProd = colaboradores.find(c => c.id === reg.colaborador_id)
        const dataInativProd = (colabRefProd && colabRefProd.status !== 'ativo' && colabRefProd.data_status) ? colabRefProd.data_status : null
        const { inicio: pInicio, fim: pFim } = clampPeriodoColab(
          `${mr}-01`, `${mr}-31`,
          colabRefProd?.data_admissao ?? null,
          dataInativProd
        )
        const { data: newLanc } = await supabase.from('ponto_lancamentos').insert({
          colaborador_id: reg.colaborador_id, obra_id: reg.obra_id,
          mes_referencia: mr, data_inicio: pInicio, data_fim: pFim,
          status: 'rascunho', criado_por: 'portal',
        }).select('id').single()
        lancId = newLanc?.id ?? null
      }
    }
    // Insere em ponto_producao
    const { data: novaProd, error } = await supabase.from('ponto_producao').insert({
      lancamento_id: lancId,
      colaborador_id: reg.colaborador_id,
      obra_id: reg.obra_id,
      playbook_item_id: reg.playbook_item_id,
      data: reg.data,
      quantidade: reg.quantidade,
      observacoes: reg.obs ?? null,
    }).select('id').single()
    if (!error && novaProd) {
      await supabase.from('portal_producao').update({
        sincronizado_em: new Date().toISOString(),
        lancamento_prod_id: novaProd.id,
        lancamento_id: lancId,
      }).eq('id', reg.id)
      fetchPortalProd(portalProdInicio, portalProdFim, portalProdObraFiltro)
      toast.success('Produção importada!')
    } else {
      toast.error('Erro ao importar produção')
    }
    setImportandoPortalProd(prev => { const s = new Set(prev); s.delete(reg.id); return s })
  }

  async function criarProdLote() {
    const pendentes = portalProdDados.filter(r => !r.sincronizado_em)
    if (!pendentes.length) return
    setCriandoProdLote(true)
    for (const reg of pendentes) {
      await importarPortalProd(reg)
    }
    setCriandoProdLote(false)
    toast.success(`${pendentes.length} produção(ões) importada(s) em lote!`)
  }

  async function fetchPortalPonto(inicio: string, fim: string, obraId?: string) {
    setLoadingPortal(true)
    const q = supabase
      .from('portal_ponto_diario')
      .select('id,colaborador_id,data,status,horas_extra,horas_falta,observacoes,sincronizado_em,colaboradores(nome),obra_id')
      .gte('data', inicio)
      .lte('data', fim)
      .order('obra_id').order('data')
    if (obraId) q.eq('obra_id', obraId)
    const { data: d } = await q
    setPortalDados((d ?? []).map((r: any) => ({
      id: r.id, colaborador_id: r.colaborador_id, colab_nome: r.colaboradores?.nome ?? '—',
      data: r.data, status: r.status, horas_extra: r.horas_extra ?? 0,
      horas_falta: r.horas_falta ?? 0, observacoes: r.observacoes ?? null,
      sincronizado_em: r.sincronizado_em, obra_id: r.obra_id,
    })))
    setLoadingPortal(false)
  }

  // Cria lançamento se não existir e insere registro_ponto
  async function criarLancamentoSeNecessario(obraId: string, inicio: string, fim: string): Promise<string | null> {
    // verifica se já existe lançamento que cobre o período
    const existing = lancamentos.find(l =>
      l.obra_id === obraId && l.data_inicio <= inicio && fim <= l.data_fim
    )
    if (existing) return existing.id

    // verifica se colaborador selecionado pertence à obra
    if (!colabSel || colabSel.obra_id !== obraId) {
      // tenta buscar um colaborador da obra para usar como referência
      return null
    }

    // cria novo lançamento
    const { data: novoLanc, error } = await supabase
      .from('ponto_lancamentos')
      .insert({
        colaborador_id: colabSel.id, obra_id: obraId,
        mes_referencia: inicio.slice(0,7),
        data_inicio: inicio, data_fim: fim,
        status: 'rascunho',
      })
      .select('id').single()
    if (error || !novoLanc) return null
    return novoLanc.id
  }

  async function importarDiaPortal(portalId: string, colabId: string, data: string, status: string, heExtra: number, hfFalta: number, obs: string|null, obraId?: string) {
    const obraRef = obraId ?? portalObraFiltro

    setImportandoPortal(prev => new Set([...prev, portalId]))

    // 1. Busca lançamento direto no banco (cobre qualquer obra, não só o colaborador selecionado)
    let lancId: string | null = null
    const { data: lancs } = await supabase
      .from('ponto_lancamentos')
      .select('id,data_inicio,data_fim')
      .eq('colaborador_id', colabId)
      .eq('obra_id', obraRef)
      .lte('data_inicio', data)
      .gte('data_fim', data)
      .limit(1)
    lancId = lancs?.[0]?.id ?? null

    // 2. Se não existe, cria automaticamente — respeitando data_admissao e data_status
    if (!lancId) {
      const mr = data.slice(0, 7)
      // Busca dados do colaborador para clampar o período
      const colabRef = colaboradores.find(c => c.id === colabId)
      const dataInativImp = (colabRef && colabRef.status !== 'ativo' && colabRef.data_status) ? colabRef.data_status : null
      const { inicio: impInicio, fim: impFim } = clampPeriodoColab(
        `${mr}-01`, `${mr}-31`,
        colabRef?.data_admissao ?? null,
        dataInativImp
      )
      const { data: novoLanc, error: errL } = await supabase
        .from('ponto_lancamentos')
        .insert({
          colaborador_id: colabId, obra_id: obraRef,
          mes_referencia: mr,
          data_inicio: impInicio, data_fim: impFim,
          status: 'rascunho',
        })
        .select('id').single()
      if (errL || !novoLanc) {
        toast.error(`Erro ao criar lançamento para ${data}`)
        setImportandoPortal(prev => { const s = new Set(prev); s.delete(portalId); return s })
        return
      }
      lancId = novoLanc.id
    }

    // 3. Verifica duplicata em registro_ponto
    const { data: existing } = await supabase
      .from('registro_ponto')
      .select('id')
      .eq('lancamento_id', lancId)
      .eq('colaborador_id', colabId)
      .eq('data', data)
      .single()

    const presente = status === 'presente' || status === 'meio_periodo'
    const falta    = status === 'falta' || status === 'falta_justificada'
    const payload  = {
      lancamento_id: lancId, colaborador_id: colabId, obra_id: obraRef,
      data, presente, falta,
      he_entrada: '', he_saida: String(heExtra || 0),
      hora_entrada: '', saida_almoco: '', retorno_almoco: '', hora_saida: '',
      justificativa: obs ?? '',
    }

    if (existing?.id) {
      await supabase.from('registro_ponto').update(payload).eq('id', existing.id)
    } else {
      await supabase.from('registro_ponto').insert(payload)
    }

    await supabase.from('portal_ponto_diario').update({ sincronizado_em: new Date().toISOString(), lancamento_id: lancId }).eq('id', portalId)
    setImportandoPortal(prev => { const s = new Set(prev); s.delete(portalId); return s })
    toast.success(`Dia ${data.slice(8)}/${data.slice(5,7)} importado!`)
    fetchPortalPonto(portalInicio, portalFim, portalObraFiltro || undefined)
    if (colabSel) fetchTudo(colabSel, ano, mes)
  }

  // ── CRIAR TUDO EM LOTE ──────────────────────────────────────────────────────
  async function criarTudoEmLote() {
    const pendentes = portalDados.filter(r => !r.sincronizado_em)
    if (!pendentes.length) { toast.error('Nenhum registro pendente'); return }
    setCriandoEmLote(true)

    const total = pendentes.length
    let feitos = 0
    let criados = 0; let erros = 0
    setProgressoLoteNum({ feitos: 0, total })

    // Agrupa por obra_id
    const porObra: Record<string, typeof pendentes> = {}
    for (const r of pendentes) {
      if (!porObra[r.obra_id]) porObra[r.obra_id] = []
      porObra[r.obra_id].push(r)
    }

    for (const [obraId, registros] of Object.entries(porObra)) {
      const colabIds = [...new Set(registros.map(r => r.colaborador_id))]
      const obraNome = obras.find(o => o.id === obraId)?.nome ?? obraId.slice(0,8)

      for (const colabId of colabIds) {
        const diasColab = registros.filter(r => r.colaborador_id === colabId)
        const diasDatas = diasColab.map(r => r.data).sort()
        const inicioColab = diasDatas[0]; const fimColab = diasDatas[diasDatas.length-1]

        // Verifica se já existe lançamento que cobre o período (banco, não estado)
        const { data: lancExist } = await supabase
          .from('ponto_lancamentos')
          .select('id,data_inicio,data_fim')
          .eq('colaborador_id', colabId)
          .eq('obra_id', obraId)
          .lte('data_inicio', inicioColab)
          .gte('data_fim', fimColab)
          .limit(1)

        let lancId: string | null = lancExist?.[0]?.id ?? null

        if (!lancId) {
          // Verifica se existe lançamento PARCIAL que cubra pelo menos um dia
          const { data: lancParcial } = await supabase
            .from('ponto_lancamentos')
            .select('id')
            .eq('colaborador_id', colabId)
            .eq('obra_id', obraId)
            .lte('data_inicio', fimColab)
            .gte('data_fim', inicioColab)
            .limit(1)
          lancId = lancParcial?.[0]?.id ?? null
        }

        if (!lancId) {
          // Cria lançamento para o período completo
          const { data: novoLanc, error: errL } = await supabase
            .from('ponto_lancamentos')
            .insert({
              colaborador_id: colabId, obra_id: obraId,
              mes_referencia: portalInicio.slice(0,7),
              data_inicio: portalInicio, data_fim: portalFim,
              status: 'rascunho',
            })
            .select('id').single()
          if (errL || !novoLanc) { erros += diasColab.length; feitos += diasColab.length; setProgressoLote(`${feitos}/${total}`); setProgressoLoteNum({ feitos, total }); continue }
          lancId = novoLanc.id
        }

        // Insere cada dia — com check de duplicata
        for (const reg of diasColab) {
          const { data: existing } = await supabase
            .from('registro_ponto')
            .select('id')
            .eq('lancamento_id', lancId)
            .eq('colaborador_id', colabId)
            .eq('data', reg.data)
            .single()

          const presente = reg.status === 'presente' || reg.status === 'meio_periodo'
          const falta    = reg.status === 'falta' || reg.status === 'falta_justificada'
          const payload = {
            lancamento_id: lancId, colaborador_id: colabId, obra_id: obraId,
            data: reg.data, presente, falta,
            he_entrada: '', he_saida: String(reg.horas_extra || 0),
            hora_entrada: '', saida_almoco: '', retorno_almoco: '', hora_saida: '',
            justificativa: reg.observacoes ?? '',
          }

          if (existing?.id) {
            await supabase.from('registro_ponto').update(payload).eq('id', existing.id)
          } else {
            await supabase.from('registro_ponto').insert(payload)
          }
          await supabase.from('portal_ponto_diario').update({ sincronizado_em: new Date().toISOString(), lancamento_id: lancId }).eq('id', reg.id)
          criados++
          feitos++
          setProgressoLote(`${feitos}/${total} — ${obraNome}`)
          setProgressoLoteNum({ feitos, total })
        }
      }
    }

    setCriandoEmLote(false); setProgressoLote(''); setProgressoLoteNum({ feitos: 0, total: 0 })
    toast.success(`✅ ${criados} registros importados!${erros ? ` (${erros} erros)` : ''}`)
    fetchPortalPonto(portalInicio, portalFim, portalObraFiltro || undefined)
    loadObrasPendPortal()
    if (colabSel) fetchTudo(colabSel, ano, mes)
  }

  async function importarTodosPortal() {
    const pendentes = portalDados.filter(r => !r.sincronizado_em)
    for (const r of pendentes) {
      await importarDiaPortal(r.id, r.colaborador_id, r.data, r.status, r.horas_extra, r.horas_falta, r.observacoes)
    }
  }

  // Contagem de lançamentos por colaborador no mês (para sidebar)
  const [contadoresLanc, setContadoresLanc] = useState<Record<string,number>>({})
  // Mapa colaborador_id → status do ponto no mês (para resumo/filtro)
  // 'fechado' = aprovado/pago/liberado, 'aberto' = rascunho/aguardando/em_fechamento/recusado, 'sem' = nenhum lançamento
  const [statusPontoMap, setStatusPontoMap] = useState<Record<string,'fechado'|'aberto'|'sem'>>({})
  const [funcaoFiltro, setFuncaoFiltro] = useState('todas')
  const [filtroStatus, setFiltroStatus] = useState<'todos'|'fechado'|'aberto'|'sem'>('todos')
  // Obras com pontos pendentes no portal (badge no filtro de obras)
  const [obrasPendPortal, setObrasPendPortal] = useState<Record<string,number>>({})

  const mesRef = `${ano}-${String(mes).padStart(2,'0')}`

  // ── Carregar colaboradores + obras ──────────────────────────────────────
  useEffect(()=>{
    const load=async()=>{
      const [{data:colsRaw},{data:obsRaw}]=await Promise.all([
        supabase.from('colaboradores').select('id,nome,chapa,funcao_id,obra_id,tipo_contrato,data_admissao,status,data_status,funcoes!colaboradores_funcao_id_fkey(id,nome)').in('status',['ativo','afastado','ferias']).order('nome'),
        supabase.from('obras').select('id,nome').order('nome'),
      ])
      setColaboradores((colsRaw??[]).map((c:any)=>({
        id:c.id,nome:c.nome,chapa:c.chapa??null,
        funcao_id:c.funcao_id??c.funcoes?.id??null,
        obra_id:c.obra_id??null,tipo_contrato:c.tipo_contrato??'clt',
        funcao_nome:c.funcoes?.nome??'Sem função',
        data_admissao:c.data_admissao??null,
        status:c.status??'ativo',
        data_status:c.data_status??null,
      })))
      setObras((obsRaw??[]) as ObraSimples[])
      setLoadingColabs(false)
      // Carregar coeficientes de HE configurados
      const {data:cfgHE}=await supabase.from('configuracoes').select('chave,valor')
        .in('chave',['he_percentual_60','he_percentual_100'])
      const m:Record<string,string>={}
      ;(cfgHE??[]).forEach((r:any)=>{m[r.chave]=r.valor})
      const pct60  = parseFloat(m['he_percentual_60'] ??'') || 60
      const pct100 = parseFloat(m['he_percentual_100']??'') || 100
      setHeCoef50 (1 + pct60  / 100)
      setHeCoef100(1 + pct100 / 100)
    }
    load()
  },[])

  // ── Carregar contadores e status de lançamentos para todos os colaboradores ────
  useEffect(()=>{
    const loadContadores=async()=>{
      const mr=`${ano}-${String(mes).padStart(2,'0')}`
      const{data}=await supabase.from('ponto_lancamentos')
        .select('colaborador_id,status')
        .eq('mes_referencia',mr)
      const mapQtd:Record<string,number>={}
      const mapStatus:Record<string,'fechado'|'aberto'|'sem'>={}
      ;(data??[]).forEach((r:any)=>{
        mapQtd[r.colaborador_id]=(mapQtd[r.colaborador_id]??0)+1
        // Determinar status: se tiver qualquer fechado → fechado; senão aberto
        const jaFechado = mapStatus[r.colaborador_id]==='fechado'
        const isFechado = ['aprovado','liberado','pago','em_fechamento'].includes(r.status)
        if(!jaFechado){
          mapStatus[r.colaborador_id] = isFechado ? 'fechado' : 'aberto'
        }
      })
      setContadoresLanc(mapQtd)
      setStatusPontoMap(mapStatus)
    }
    loadContadores()
  },[ano,mes])

  // ── Obras com ponto pendente no portal (atualiza ao abrir modal e ao sincronizar) ──
  const loadObrasPendPortal = useCallback(async () => {
    const mr = `${ano}-${String(mes).padStart(2,'0')}`
    const { data } = await supabase
      .from('portal_ponto_diario')
      .select('obra_id')
      .is('sincronizado_em', null)
      .gte('data', `${mr}-01`)
      .lte('data', `${mr}-31`)
    const map: Record<string,number> = {}
    ;(data ?? []).forEach((r: any) => {
      map[r.obra_id] = (map[r.obra_id] ?? 0) + 1
    })
    setObrasPendPortal(map)
  }, [ano, mes])

  useEffect(() => { loadObrasPendPortal() }, [loadObrasPendPortal])

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
      valor_hora_snapshot:l.valor_hora_snapshot??null,
      snap_valor_hora:    l.snap_valor_hora??null,
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
    diasUsados:Map<string,string>   // data → nomeObra
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
      const obraConflito=diasUsados.get(d)   // nome da obra que já ocupa este dia
      const bloqOutroLanc=!!obraConflito
      const evento:TipoEvento=isSuspensao?'suspensao':isAtestado?'atestado':null
      const diaSem=DIAS_KEY[new Date(d+'T12:00:00').getDay()]
      const hor=horObra[diaSem]

      if(!r){
        const base=emptyDia(colab.id,lanc.id,lanc.obra_id,d)
        if(bloqOutroLanc)return{...base,evento:'outro_lancamento',bloqueado:true,justificativa:obraConflito??'outra obra'}
        if(isAtestado)return{...base,presente:true,evento,bloqueado:true,
          hora_entrada:hor?.hora_entrada??'',saida_almoco:hor?.saida_almoco??'',
          retorno_almoco:hor?.retorno_almoco??'',hora_saida:hor?.hora_saida??''}
        if(isSuspensao)return{...base,evento,bloqueado:true}
        return{...base,evento,bloqueado:false}
      }
      if(isAtestado)return{
        id:r.id,lancamento_id:lanc.id,colaborador_id:colab.id,data:d,obra_id:lanc.obra_id,
        presente:true,falta:false,feriado_remunerado:false,evento,bloqueado:true,justificativa:r.justificativa??'',
        hora_entrada:hor?.hora_entrada||r.hora_entrada||'',
        saida_almoco:hor?.saida_almoco||r.saida_almoco||'',
        retorno_almoco:hor?.retorno_almoco||r.retorno_almoco||'',
        hora_saida:hor?.hora_saida||r.hora_saida||'',
        he_entrada:'',he_saida:'',
      }
      return{
        id:r.id,lancamento_id:lanc.id,colaborador_id:colab.id,data:d,obra_id:lanc.obra_id,
        presente:!!(r.hora_entrada||r.hora_saida),
        falta:r.falta??false,feriado_remunerado:r.feriado_remunerado??false,
        hora_entrada:r.hora_entrada??'',saida_almoco:r.saida_almoco??'',
        retorno_almoco:r.retorno_almoco??'',hora_saida:r.hora_saida??'',
        he_entrada:r.he_entrada??'',he_saida:r.he_saida??'',
        justificativa:bloqOutroLanc?(obraConflito??'outra obra'):(r.justificativa??''),evento,bloqueado:isSuspensao||bloqOutroLanc,
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

    // ── 1. Carregar lançamentos PRIMEIRO para verificar snapshot ───────────────
    const [list,,pbMap,horMap]=await Promise.all([
      fetchLancamentos(colab.id,mr),
      fetchProducoes(colab.id,mr),
      fetchPlaybooks([...new Set([colab.obra_id,...([] as (string|null)[])].filter(Boolean) as string[])]),
      fetchHorariosObras([colab.obra_id].filter(Boolean) as string[]),
    ])

    // ── 2. Histórico de contratos + Snapshot por lançamento ─────────────────
    const [{ data: hcList }] = await Promise.all([
      supabase.from('colaborador_historico_contrato')
        .select('tipo_contrato,data_inicio,data_fim')
        .eq('colaborador_id', colab.id)
        .order('data_inicio', { ascending: false }),
    ])
    const hcSorted = (hcList ?? []) as {tipo_contrato:string;data_inicio:string;data_fim:string|null}[]
    setHistoricoContrato(hcSorted)

    // Contrato vigente hoje
    const today = new Date().toISOString().slice(0,10)
    const periodoAtual = hcSorted.find(p => p.data_fim === null || p.data_fim >= today)
    const tipoAtual = (periodoAtual?.tipo_contrato ?? colab.tipo_contrato ?? 'clt') as 'clt'|'autonomo'|'pj'
    setAbaContrato(tipoAtual)

    // Snapshot por lançamento
    const snapMap = new Map<string,number|null>()
    list.forEach((l: {id:string;valor_hora_snapshot:number|null;snap_valor_hora:number|null}) => {
      const snap = l.valor_hora_snapshot ?? l.snap_valor_hora ?? null
      snapMap.set(l.id, snap)
    })
    setSnapshotPorLanc(snapMap)

    // Buscar valor ao vivo por tipo de contrato (CLT e Autônomo separadamente)
    if(colab.funcao_id){
      const[{data:fvList},{data:funcaoRow}]=await Promise.all([
        supabase.from('funcao_valores').select('valor_hora,tipo_contrato').eq('funcao_id',colab.funcao_id),
        supabase.from('funcoes').select('valor_hora_clt,valor_hora_autonomo').eq('id',colab.funcao_id).single(),
      ])
      // Montar mapa tipo_contrato → valor_hora ao vivo
      const vhMap: Record<string,number> = {}
      ;(['clt','autonomo','pj'] as const).forEach(tc => {
        const fv = (fvList??[]).find((r:any)=>r.tipo_contrato===tc)
        if(fv){ vhMap[tc] = fv.valor_hora }
        else if(funcaoRow){
          vhMap[tc] = (tc==='clt' ? funcaoRow.valor_hora_clt : funcaoRow.valor_hora_autonomo) ?? funcaoRow.valor_hora_clt ?? funcaoRow.valor_hora_autonomo ?? 0
        } else { vhMap[tc] = 0 }
      })
      setValorHoraPorTipo(vhMap)
      // valorHora ao vivo = tipo atual (para novos rascunhos)
      setValorHora(vhMap[tipoAtual] ?? 0)
      const snapValorGlobal = [...snapMap.values()].find(v => v != null) ?? null
      const todosComSnap = list.length > 0 && list.every((l: {id:string}) => (snapMap.get(l.id) ?? null) != null)
      setValorHoraCongelado(todosComSnap ? snapValorGlobal : null)
    } else {
      setValorHora(0)
      setValorHoraCongelado(null)
      setValorHoraPorTipo({})
    }

    // Buscar obras únicas dos lançamentos
    const obraIds=[...new Set(list.map(l=>l.obra_id))]
    const[horMapFull,pbMapFull]=await Promise.all([
      fetchHorariosObras(obraIds),
      fetchPlaybooks(obraIds),
    ])

    // ── Pré-carregar registros reais de TODOS os lançamentos do mês ──────────
    // Isso garante que ao montar diasUsados para qualquer lançamento,
    // já sabemos quais datas têm ponto salvo em cada obra — independente da ordem.
    const todosLancIds = list.map((l:any)=>l.id)
    const {data: todosRegistros} = await supabase.from('registro_ponto')
      .select('lancamento_id,data').in('lancamento_id', todosLancIds)
    // Mapa: lancamento_id → Set<data> (datas com registro real no banco)
    const registrosPorLanc = new Map<string, Set<string>>()
    ;(todosRegistros??[]).forEach((r:any)=>{
      if(!registrosPorLanc.has(r.lancamento_id)) registrosPorLanc.set(r.lancamento_id, new Set())
      registrosPorLanc.get(r.lancamento_id)!.add(r.data)
    })

    // Dias de cada lançamento — sequencial p/ calcular bloqueios entre lançamentos
    const newDiasMap:Record<string,DiaRegistro[]>={}
    for(const lanc of list){
      const diasUsados=new Map<string,string>()   // data → nomeObra
      // Para cada OUTRO lançamento, bloqueia apenas datas que têm registro real no banco
      for(const outroLanc of list){
        if(outroLanc.id===lanc.id) continue
        const nomeOutraObra = outroLanc.obra_nome??'outra obra'
        const datasComRegistro = registrosPorLanc.get(outroLanc.id) ?? new Set<string>()
        datasComRegistro.forEach(data=>{
          if(!diasUsados.has(data)) diasUsados.set(data, nomeOutraObra)
        })
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
    let normais=0,extras50=0,extras100=0,presentes=0
    lancamentos.forEach(lanc=>{
      const isClt=lancIsClt(lanc.id!)
      ;(diasMap[lanc.id!]??[]).forEach(d=>{
        const c=calcDia(d,feriados.has(d.data),isClt);normais+=c.normais;extras50+=c.extras50;extras100+=c.extras100
        if(d.presente&&!d.falta&&d.evento!=='atestado'&&d.evento!=='suspensao')presentes++
      })
    })
    return{normais,extras50,extras100,total:normais+extras50+extras100,presentes}
  },[diasMap,feriados])

  // valorHoraEfetivo: usa snapshot se existir (lançamento aprovado/fechado),
  // caso contrário usa o valor ao vivo da função. Garante imutabilidade pós-aprovação.
  const valorHoraEfetivo: number = valorHoraCongelado ?? valorHora

  // Retorna o valor/hora efetivo de um lançamento específico:
  // 1. snapshot próprio do lançamento (imutável após save) → prioridade máxima
  // 2. tipo_contrato_lanc → busca o valor ao vivo do tipo correto do período
  // 3. valorHora ao vivo do contrato atual (fallback para rascunhos novos)
  function valorHoraDoLanc(lancId: string): number {
    const snap = snapshotPorLanc.get(lancId)
    if(snap != null && snap > 0) return snap
    // Descobrir o tipo de contrato do lançamento pelo tipo_contrato_lanc
    const lanc = lancamentos.find(l => l.id === lancId)
    const tcLanc = (lanc as any)?.tipo_contrato_lanc as string|undefined
    if(tcLanc && valorHoraPorTipo[tcLanc] > 0) return valorHoraPorTipo[tcLanc]
    // Fallback: valorHora ao vivo (contrato atual)
    return valorHora
  }

  /** Retorna true se o lançamento é CLT (para calcDia saber o regime) */
  function lancIsClt(lancId: string): boolean {
    const lanc = lancamentos.find(l => l.id === lancId)
    const tc = (lanc as any)?.tipo_contrato_lanc ?? colabSel?.tipo_contrato ?? 'clt'
    return tc === 'clt'
  }

  // totalHoras: soma cada lançamento pelo seu próprio valor/hora (snapshot ou ao vivo)
  const totalHoras = useMemo(()=>{
    if(valorHora===0 && snapshotPorLanc.size===0) return 0
    return lancamentos.reduce((sum, lanc)=>{
      const vh = valorHoraDoLanc(lanc.id!)
      if(vh===0) return sum
      const dias = diasMap[lanc.id!] ?? []
      let n=0,e50=0,e100=0
      const isClt=lancIsClt(lanc.id!)
      dias.forEach(d=>{
        const diaSem=DIAS_KEY[new Date(d.data+'T12:00:00').getDay()]
        const hor=horariosObra[lanc.obra_id]?.[diaSem]
        const jornMin=hor?.hora_entrada&&hor?.hora_saida
          ?Math.max(0,diffMin(hor.hora_entrada,hor.hora_saida)-(hor.saida_almoco&&hor.retorno_almoco?diffMin(hor.saida_almoco,hor.retorno_almoco):hor.saida_almoco?60:0))
          :480
        const c=calcDia(d,feriados.has(d.data),isClt,jornMin);n+=c.normais;e50+=c.extras50;e100+=c.extras100
      })
      return sum + calcValorMin(n,e50,e100,vh,heCoef50,heCoef100)
    },0)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  },[lancamentos,diasMap,feriados,valorHora,snapshotPorLanc])
  const totalProd  = producoes.reduce((s,p)=>s+p.valor_total,0)

  // Valor a receber com regra CLT/autônomo
  // diasComProd = dias que foram ESCOLHIDOS ao lançar a produção (array dias[] de cada produção)
  const diasComProd = useMemo(()=>new Set(producoes.flatMap(p=>p.dias??[])),[producoes])

  // Autônomo: horas(dias sem prod) + produção. CLT: horas + prêmio se prod>horas
  const horasAutonomoSemProd = useMemo(()=>{
    // Soma por lançamento usando o vh próprio de cada um
    return lancamentos.reduce((sum, lanc)=>{
      const vh = valorHoraDoLanc(lanc.id!)
      if(vh===0) return sum
      const dias = diasMap[lanc.id!] ?? []
      let n=0,e50=0,e100=0
      const isClt=lancIsClt(lanc.id!)
      dias.forEach(d=>{
        if(!diasComProd.has(d.data)){
          const diaSem=DIAS_KEY[new Date(d.data+'T12:00:00').getDay()]
          const hor=horariosObra[lanc.obra_id]?.[diaSem]
          const jornMin=hor?.hora_entrada&&hor?.hora_saida
            ?Math.max(0,diffMin(hor.hora_entrada,hor.hora_saida)-(hor.saida_almoco&&hor.retorno_almoco?diffMin(hor.saida_almoco,hor.retorno_almoco):hor.saida_almoco?60:0))
            :480
          const cl=calcDia(d,feriados.has(d.data),isClt,jornMin);n+=cl.normais;e50+=cl.extras50;e100+=cl.extras100
        }
      })
      return sum + calcValorMin(n,e50,e100,vh,heCoef50,heCoef100)
    },0)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  },[lancamentos,diasMap,diasComProd,feriados,valorHora,snapshotPorLanc])

  // DSR — só para CLT, com regra de perda por falta semanal
  // Regra: se houver falta em uma semana (Seg-Sab), o DSR daquele domingo é perdido
  const dsrInfo = useMemo(()=>{
    if(!colabSel||colabSel.tipo_contrato!=='clt'||valorHoraEfetivo===0){
      return{valor:0,diasUteis:0,domingos:0,baseValor:0,domingosPerdidos:0}
    }
    const baseValor = totalHoras  // já calculado por lançamento com snap próprio
    // Montar set de datas com falta (todos os lançamentos)
    const datasComFalta = new Set<string>()
    Object.values(diasMap).forEach(diasLanc=>
      diasLanc.forEach(d=>{ if(d.falta && d.data) datasComFalta.add(d.data) })
    )
    // Somar DSR por lançamento (cada lançamento pode ter período distinto)
    let dsrTotal=0, totalDiasUteis=0, totalDomingosPagos=0, totalDomingosPerdidos=0
    lancamentos.forEach(lanc=>{
      // Horas do lançamento
      const diasLanc = diasMap[lanc.id] ?? []
      const vhLanc = valorHoraDoLanc(lanc.id!)
      const vHorasLanc = diasLanc.reduce((s,d)=>{
        if(diasComProd.has(d.data)) return s  // dias com produção não entram no cálculo de horas
        const isClt=lancIsClt(lanc.id!)
        const cl=calcDia(d,feriados.has(d.data),isClt)
        // calcDia retorna MINUTOS → converter para horas antes de multiplicar pelo valor/hora
        return s + calcValorMin(cl.normais,cl.extras50,cl.extras100,vhLanc,heCoef50,heCoef100)
      },0)
      const res = calcDSRComFaltas(vHorasLanc, lanc.data_inicio, lanc.data_fim, datasComFalta, feriados)
      dsrTotal += res.dsr
      totalDiasUteis += res.diasUteis
      totalDomingosPagos += res.domingosPagos
      totalDomingosPerdidos += res.domingosPerdidos
    })
    return{valor:dsrTotal,diasUteis:totalDiasUteis,domingos:totalDomingosPagos,baseValor,domingosPerdidos:totalDomingosPerdidos}
  // eslint-disable-next-line react-hooks/exhaustive-deps
  },[colabSel,lancamentos,totalHoras,feriados,diasMap,diasComProd,valorHora,snapshotPorLanc])

  // premioCLT = excedente da produção sobre o salário (horas + DSR)
  const premioCLT = useMemo(()=>{
    if(!colabSel||colabSel.tipo_contrato==='autonomo'||colabSel.tipo_contrato==='pj')return 0
    const salario = totalHoras + dsrInfo.valor
    const excedente = totalProd - salario
    return excedente > 0 ? excedente : 0
  },[colabSel,totalProd,totalHoras,dsrInfo])

  // ── Feriados: direito por lançamento ─────────────────────────────────────
    // totalReceber: CLT = horas (incluindo feriados/sáb já em extras) + DSR
  // feriado_remunerado já está em 'normais' dentro de calcDia, então totalHoras já inclui
  const totalReceber = useMemo(()=>{
    if(!colabSel)return totalProd
    if(colabSel.tipo_contrato==='autonomo'||colabSel.tipo_contrato==='pj'){
      return horasAutonomoSemProd + totalProd
    }
    // CLT: salário = horas (inclui feriados remunerados + +100% trabalhados + +50% sáb) + DSR
    const salario = totalHoras + dsrInfo.valor
    return salario + premioCLT
  },[colabSel,totalHoras,horasAutonomoSemProd,totalProd,dsrInfo,premioCLT])

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
      dias[idx]={...d,falta:!d.falta,presente:false,feriado_remunerado:false,hora_entrada:'',saida_almoco:'',retorno_almoco:'',hora_saida:'',he_entrada:'',he_saida:''}
      return{...prev,[lancId]:dias}
    })
  }

  // Toggle "Feriado Remunerado" — só ativo quando feriado sem presença
  function toggleFeriadoRemunerado(lancId:string,idx:number){
    setDiasMap(prev=>{
      const dias=[...(prev[lancId]??[])]
      const d={...dias[idx]}
      if(d.bloqueado||d.presente)return prev  // se tem presença, ignora (já conta como trabalhado)
      dias[idx]={...d,feriado_remunerado:!d.feriado_remunerado,falta:false}
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
  // Popup de validação — feriados sem presença e sem remunerado marcado
  const [modalFeriadoAviso, setModalFeriadoAviso] = useState<{lancId:string; feriados:string[]} | null>(null)

  async function salvarLanc(lancId:string, forcarSalvar=false){
    if(!colabSel)return
    const lanc=lancamentos.find(l=>l.id===lancId)
    const statusEditavel=['rascunho','recusado']
    if(lanc&&!statusEditavel.includes(lanc.status)){toast.error('Ponto em fechamento ou aprovado não pode ser editado');return}

    // ── Validar feriados sem decisão (sem presença e sem remunerado) ────────
    if(!forcarSalvar){
      const dias=diasMap[lancId]??[]
      const feriadosSemDecisao=dias.filter(d=>{
        if(!feriados.has(d.data)) return false   // não é feriado
        if(d.bloqueado||d.evento)  return false   // atestado/suspensão — ok
        if(d.presente)             return false   // trabalhou — ok
        if(d.falta)                return false   // falta explícita — ok
        if(d.feriado_remunerado)   return false   // remunerado marcado — ok
        return true  // feriado sem nenhuma marcação!
      }).map(d=>{
        const dt=new Date(d.data+'T12:00:00')
        return dt.toLocaleDateString('pt-BR',{weekday:'long',day:'2-digit',month:'2-digit'})
      })
      if(feriadosSemDecisao.length>0){
        setModalFeriadoAviso({lancId, feriados:feriadosSemDecisao})
        return
      }
    }

    setSaving(true)
    const dias=diasMap[lancId]??[]
    const isCltSave=lancIsClt(lancId)
    // incluir dias com feriado_remunerado mesmo sem presença/falta
    const upserts=dias.filter(d=>d.presente||d.falta||d.feriado_remunerado||d.id).map(d=>{
      const diaSemKey3=DIAS_KEY[new Date(d.data+'T12:00:00').getDay()]
      const horOSave=horariosObra[lancamentos.find(l=>l.id===lancId)?.obra_id??'']?.[diaSemKey3]
      const jornSave=horOSave?.hora_entrada&&horOSave?.hora_saida ? Math.max(0,diffMin(horOSave.hora_entrada,horOSave.hora_saida)-(horOSave.saida_almoco&&horOSave.retorno_almoco?diffMin(horOSave.saida_almoco,horOSave.retorno_almoco):horOSave.saida_almoco?60:0)) : 0
      const c=calcDia(d,feriados.has(d.data),isCltSave,jornSave)
      return{
        ...(d.id?{id:d.id}:{}),
        lancamento_id:lancId,colaborador_id:d.colaborador_id,
        obra_id:d.obra_id,data:d.data,
        hora_entrada:d.hora_entrada||null,saida_almoco:d.saida_almoco||null,
        retorno_almoco:d.retorno_almoco||null,hora_saida:d.hora_saida||null,
        he_entrada:d.he_entrada||null,he_saida:d.he_saida||null,
        horas_trabalhadas:fmtDecimal(c.normais),horas_extras:fmtDecimal(c.extras50)+fmtDecimal(c.extras100),
        falta:d.falta,feriado_remunerado:d.feriado_remunerado,justificativa:d.justificativa||null,
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
    // ── Congelar valor/hora no próprio lançamento ao salvar ─────────────────
    // Garante que futuras edições na tabela de funções NÃO alteram este ponto.
    if(valorHora > 0){
      const snapAtual = snapshotPorLanc.get(lancId)
      if(snapAtual == null){
        // Ainda sem snapshot: gravar o valor ao vivo atual
        await supabase.from('ponto_lancamentos')
          .update({ valor_hora_snapshot: valorHora })
          .eq('id', lancId)
        // Atualizar o Map local imediatamente
        setSnapshotPorLanc(prev => { const m=new Map(prev); m.set(lancId, valorHora); return m })
      }
      // Se já tem snapshot: nunca sobrescrever — mantém o valor original do lançamento
    }
    // Recarregar para obter IDs dos registros inseridos
    if(colabSel)fetchTudo(colabSel,ano,mes)
  }

  // ── Criar novo lançamento ─────────────────────────────────────────────────
  async function criarLancamento(){
    if(!colabSel||!novoLancObraId||!novoLancInicio||!novoLancFim){toast.error('Preencha todos os campos');return}
    if(novoLancInicio>novoLancFim){toast.error('Data de início deve ser anterior à data de fim');return}

    // ── REGRA: clamp nas datas do colaborador ─────────────────────────────
    // Nenhum lançamento pode iniciar antes da admissão ou terminar após a inativação
    const dataInativ = (colabSel.status !== 'ativo' && colabSel.data_status) ? colabSel.data_status : null
    const { inicio: iniClamp, fim: fimClamp } = clampPeriodoColab(
      novoLancInicio, novoLancFim, colabSel.data_admissao, dataInativ
    )
    if (iniClamp !== novoLancInicio || fimClamp !== novoLancFim) {
      const admFmt  = colabSel.data_admissao ? new Date(colabSel.data_admissao+'T12:00:00').toLocaleDateString('pt-BR') : '—'
      const inativFmt = dataInativ ? new Date(dataInativ+'T12:00:00').toLocaleDateString('pt-BR') : '—'
      const msg = iniClamp !== novoLancInicio
        ? `Período ajustado automaticamente: início alterado para ${new Date(iniClamp+'T12:00:00').toLocaleDateString('pt-BR')} (data de admissão: ${admFmt})`
        : `Período ajustado automaticamente: fim alterado para ${new Date(fimClamp+'T12:00:00').toLocaleDateString('pt-BR')} (data de inativação: ${inativFmt})`
      toast.info(msg)
    }
    const novoLancInicioFinal = iniClamp
    const novoLancFimFinal    = fimClamp
    // Bloquear se houver lançamento em rascunho ou recusado (precisa aprovar antes)
    const temAberto=lancamentos.some(l=>l.status==='rascunho'||l.status==='recusado'||l.status==='aguardando_aprovacao')
    if(temAberto){toast.error('Finalize os lançamentos em aberto (envie para Fechamento) antes de criar um novo');return}
    const lancsPorObra=lancamentos.filter(l=>l.obra_id===novoLancObraId).length
    if(lancsPorObra>=2){toast.error('Esta obra já tem 2 lançamentos neste mês');return}
    const diasNovos=new Set(expandRange(novoLancInicioFinal,novoLancFimFinal))
    // Conflito BLOQUEANTE apenas quando a obra for a mesma
    const conflitoMesmaObra=lancamentos
      .filter(l=>l.obra_id===novoLancObraId)
      .flatMap(l=>expandRange(l.data_inicio,l.data_fim))
      .filter(d=>diasNovos.has(d))
    if(conflitoMesmaObra.length>0){toast.error(`Esta obra já tem ${conflitoMesmaObra.length} dia(s) nesse período`);return}
    // Obras diferentes: apenas aviso informativo (não bloqueia)
    setSavingLanc(true)
    // Determinar tipo de contrato vigente na data de início do lançamento
    const today2 = novoLancInicioFinal || new Date().toISOString().slice(0,10)
    const periodoVigente = historicoContrato.find(p =>
      p.data_inicio <= today2 && (p.data_fim === null || p.data_fim >= today2)
    )
    const tcNovo = periodoVigente?.tipo_contrato ?? colabSel.tipo_contrato ?? 'clt'
    const vhNovo = valorHoraPorTipo[tcNovo] ?? valorHora

    const{data:lancInserido,error}=await supabase.from('ponto_lancamentos').insert({
      colaborador_id:colabSel.id,obra_id:novoLancObraId,mes_referencia:mesRef,
      data_inicio:novoLancInicioFinal,data_fim:novoLancFimFinal,
      status:'rascunho',
      tipo_contrato_lanc: tcNovo,
      valor_hora_snapshot: vhNovo > 0 ? vhNovo : null,
    }).select('id').single()
    setSavingLanc(false)
    if(error){toast.error('Erro: '+error.message);return}
    const novoIdParaExpandir = lancInserido?.id ?? null
    toast.success('Lançamento criado!')
    setModalLanc(false)
    await fetchTudo(colabSel,ano,mes)
    // Abrir automaticamente o NOVO lançamento recém-criado
    if(novoIdParaExpandir) setExpandido(novoIdParaExpandir)
    // Atualizar contadores sidebar
    setContadoresLanc(prev=>({...prev,[colabSel.id]:(prev[colabSel.id]??0)+1}))
  }

  // ── Excluir lançamento ────────────────────────────────────────────────────
  // Modal confirmar exclusão
  const [modalExcluir, setModalExcluir] = useState<string|null>(null)

  async function excluirLancamento(id:string){
    const lanc=lancamentos.find(l=>l.id===id)
    if(lanc&&!['rascunho','recusado','aguardando_aprovacao'].includes(lanc.status)){toast.error('Apenas lançamentos não aprovados podem ser excluídos');return}
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
    // Ao enviar para aprovação: gravar valor_hora como snapshot imutável usando o valor do próprio lançamento
    const payload: Record<string,unknown> = { status, motivo_recusa:motivo??null }
    if(status==='aguardando_aprovacao'){
      const snapLanc = snapshotPorLanc.get(id)
      const vhParaSnap = (snapLanc != null && snapLanc > 0) ? snapLanc : (valorHora > 0 ? valorHora : 0)
      if(vhParaSnap > 0) payload.valor_hora_snapshot = vhParaSnap
    }
    // ── SNAPSHOT considera_sabado_util ────────────────────────────────────
    // Ao entrar em fechamento: congelar a regra de sábado da obra.
    // Alterações posteriores na obra NÃO reprocessam este lançamento.
    /* 
    if (status === 'em_fechamento') {
      const lanc = lancamentos.find(l => l.id === id)
      if (lanc?.obra_id) {
        const { data: obraSnap } = await supabase
          .from('obras')
          .select('considera_sabado_util')
          .eq('id', lanc.obra_id)
          .single()
        payload.snap_considera_sabado_util = obraSnap?.considera_sabado_util ?? false
      }
    }
    */
    const{error}=await supabase.from('ponto_lancamentos').update(payload).eq('id',id)
    if(error){toast.error('Erro: '+error.message);return}
    const msgs:Record<string,string>={
      aguardando_aprovacao:'Enviado para aprovação!',
      em_fechamento:'✅ Ponto enviado para o Fechamento!',
      aprovado:'✅ Ponto aprovado!',
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
    let normais=0,extras50=0,extras100=0,presentes=0,faltas=0,atestados=0,suspensoes=0
    const isCltTot=lancIsClt(lancId)
    dias.forEach(d=>{
      const c=calcDia(d,feriados.has(d.data),isCltTot);normais+=c.normais;extras50+=c.extras50;extras100+=c.extras100
      if(d.presente&&!d.falta)presentes++
      if(d.falta)faltas++
      if(d.evento==='atestado'&&!isFDS(d.data))atestados++
      if(d.evento==='suspensao')suspensoes++
    })
    return{normais,extras50,extras100,total:normais+extras50+extras100,presentes,faltas,atestados,suspensoes}
  }

  function mesAnterior(){if(mes===1){setAno(a=>a-1);setMes(12)}else setMes(m=>m-1)}
  function mesSeguinte(){if(mes===12){setAno(a=>a+1);setMes(1)}else setMes(m=>m+1)}

  const colabsFiltrados=useMemo(()=>{
    // Primeiro dia e último do mês visualizado
    const primeiroDiaMes = `${ano}-${String(mes).padStart(2,'0')}-01`
    const ultimoDiaMes   = `${ano}-${String(mes).padStart(2,'0')}-31`
    let lista=colaboradores.filter(c=> {
      // Colaborador inativo nunca aparece
      if(c.status === 'inativo') return false
      // Admissão posterior ao mês → não aparece ainda
      if(c.data_admissao && c.data_admissao > ultimoDiaMes) return false
      // Afastado/férias COM data_status antes do início do mês → não aparece mais
      if(c.status !== 'ativo' && c.data_status && c.data_status < primeiroDiaMes) return false
      return true
    })
    if(obraFiltro!=='todas')lista=lista.filter(c=>c.obra_id===obraFiltro)
    if(funcaoFiltro!=='todas')lista=lista.filter(c=>c.funcao_nome===funcaoFiltro)
    // Filtro por status de ponto
    if(filtroStatus!=='todos'){
      lista=lista.filter(c=>{
        const st = statusPontoMap[c.id] ?? 'sem'
        return st === filtroStatus
      })
    }
    const q=busca.toLowerCase()
    if(q)lista=lista.filter(c=>c.nome.toLowerCase().includes(q)||(c.chapa??'').toLowerCase().includes(q)||c.funcao_nome.toLowerCase().includes(q))
    return lista
  },[colaboradores,busca,obraFiltro,funcaoFiltro,filtroStatus,statusPontoMap,ano,mes])

  // ── Renderiza bloco de feriados de um lançamento ──────────────────────────
  // renderFeriadosLanc removido — feriados agora são controlados por presença/feriado_remunerado

  // ─────────────────────────────────────────────────────────────────────────
  return (
    <>
    <div style={{display:'flex',height:'100%',overflow:'hidden'}}>

      {/* ── Painel esquerdo ── */}
      <div style={{width:272,flexShrink:0,borderRight:'1px solid var(--border)',display:'flex',flexDirection:'column',overflow:'hidden'}}>
        {/* ── Cabeçalho estilo "Selecionar Colaborador" ── */}
        <div style={{padding:'12px 12px 8px',background:'#1e3a5f',display:'flex',flexDirection:'column',gap:8}}>
          <div style={{fontWeight:700,fontSize:13,color:'#fff'}}>🕐 Controle de Ponto</div>

          {/* Busca */}
          <div style={{position:'relative'}}>
            <Search size={13} style={{position:'absolute',left:9,top:'50%',transform:'translateY(-50%)',color:'#9ca3af'}}/>
            <input value={busca} onChange={e=>setBusca(e.target.value)} placeholder="Nome, chapa ou CPF…"
              style={{width:'100%',height:33,border:'1px solid #334155',borderRadius:7,paddingLeft:28,paddingRight:8,fontSize:12,background:'#0f172a',color:'#fff',boxSizing:'border-box'}}/>
          </div>

          {/* Badges status */}
          {(()=>{
            const fechados = Object.values(statusPontoMap).filter(s=>s==='fechado').length
            const abertos  = Object.values(statusPontoMap).filter(s=>s==='aberto').length
            const semLanc  = colaboradores.filter(c=>{
              if(c.status === 'inativo') return false
              const pd=`${ano}-${String(mes).padStart(2,'0')}-01`
              const ud=`${ano}-${String(mes).padStart(2,'0')}-31`
              if(c.data_admissao && c.data_admissao > ud) return false
              if(c.status !== 'ativo' && c.data_status && c.data_status < pd) return false
              return true
            }).length - fechados - abertos
            return (
              <div style={{display:'flex',gap:4,flexWrap:'wrap'}}>
                {[
                  {key:'todos'  as const, label:'todos',   val:colaboradores.length, bg:'rgba(255,255,255,.15)', cor:'#fff'},
                  {key:'fechado'as const, label:'fechados', val:fechados,             bg:'rgba(34,197,94,.25)',   cor:'#86efac'},
                  {key:'aberto' as const, label:'aberto',   val:abertos,              bg:'rgba(251,191,36,.25)',  cor:'#fde68a'},
                  {key:'sem'    as const, label:'s/ ponto', val:semLanc,              bg:'rgba(248,113,113,.25)', cor:'#fca5a5'},
                ].map(b=>(
                  <button key={b.key} onClick={()=>setFiltroStatus(filtroStatus===b.key&&b.key!=='todos'?'todos':b.key)}
                    style={{
                      background: filtroStatus===b.key ? b.bg : 'rgba(255,255,255,.07)',
                      border:`1.5px solid ${filtroStatus===b.key?b.cor:'transparent'}`,
                      borderRadius:5,padding:'2px 7px',fontSize:10,fontWeight:700,
                      color: filtroStatus===b.key?b.cor:'#94a3b8',cursor:'pointer',
                    }}>
                    {b.label}: {b.val}
                  </button>
                ))}
              </div>
            )
          })()}
        </div>

        <div style={{padding:'6px 8px',borderBottom:'1px solid var(--border)',display:'flex',flexDirection:'column',gap:4}}>

          {/* ── Filtro por Obra ── */}
          <Select value={obraFiltro} onValueChange={setObraFiltro}>
            <SelectTrigger style={{fontSize:12,height:28}}><SelectValue placeholder="Todas as obras"/></SelectTrigger>
            <SelectContent>
              <SelectItem value="todas">
                Todas as obras
                {Object.values(obrasPendPortal).reduce((a,b)=>a+b,0)>0&&(
                  <span style={{marginLeft:6,background:'#f97316',color:'#fff',borderRadius:10,padding:'0 6px',fontSize:10,fontWeight:800}}>
                    {Object.values(obrasPendPortal).reduce((a,b)=>a+b,0)}
                  </span>
                )}
              </SelectItem>
              {obras.map(o=>{
                const pend = obrasPendPortal[o.id] ?? 0
                return(
                  <SelectItem key={o.id} value={o.id}>
                    <span style={{display:'flex',alignItems:'center',gap:6,width:'100%'}}>
                      <span style={{flex:1}}>{o.nome}</span>
                      {pend>0&&(
                        <span style={{background:'#f97316',color:'#fff',borderRadius:10,padding:'0 6px',fontSize:10,fontWeight:800,flexShrink:0}}>
                          📲 {pend}
                        </span>
                      )}
                    </span>
                  </SelectItem>
                )
              })}
            </SelectContent>
          </Select>

          {/* ── Filtro por Função ── */}
          {(()=>{
            const funcoesUnicas = [...new Set(colaboradores.map(c=>c.funcao_nome))].sort()
            return(
              <Select value={funcaoFiltro} onValueChange={setFuncaoFiltro}>
                <SelectTrigger style={{fontSize:12,height:28}}><SelectValue placeholder="Todas as funções"/></SelectTrigger>
                <SelectContent>
                  <SelectItem value="todas">Todas as funções</SelectItem>
                  {funcoesUnicas.map(f=>(
                    <SelectItem key={f} value={f}>{f}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )
          })()}

          {/* ── Busca movida para o cabeçalho ── */}

          {/* Indicador de filtros ativos */}
          {(filtroStatus!=='todos'||funcaoFiltro!=='todas')&&(
            <div style={{display:'flex',gap:4,flexWrap:'wrap'}}>
              {filtroStatus!=='todos'&&(
                <button onClick={()=>setFiltroStatus('todos')} style={{fontSize:10,padding:'2px 8px',borderRadius:10,border:'none',background:'#e0e7ff',color:'#3730a3',cursor:'pointer',fontWeight:600}}>
                  {filtroStatus==='fechado'?'✓ Fechados':filtroStatus==='aberto'?'⚠ Em Aberto':'✕ S/ Ponto'} ×
                </button>
              )}
              {funcaoFiltro!=='todas'&&(
                <button onClick={()=>setFuncaoFiltro('todas')} style={{fontSize:10,padding:'2px 8px',borderRadius:10,border:'none',background:'#e0e7ff',color:'#3730a3',cursor:'pointer',fontWeight:600}}>
                  {funcaoFiltro} ×
                </button>
              )}
            </div>
          )}
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
                <div style={{display:'flex',alignItems:'center',gap:3}}>
                  {(()=>{
                    const st = statusPontoMap[c.id]
                    const ativo = colabSel?.id===c.id
                    if(!st) return null
                    if(st==='fechado') return <span title="Ponto fechado" style={{fontSize:9,background:ativo?'rgba(255,255,255,0.3)':'#dcfce7',color:ativo?'#fff':'#15803d',borderRadius:8,padding:'1px 5px',fontWeight:700}}>✓</span>
                    if(st==='aberto') return <span title="Ponto em aberto" style={{fontSize:9,background:ativo?'rgba(255,255,255,0.3)':'#fef3c7',color:ativo?'#fff':'#b45309',borderRadius:8,padding:'1px 5px',fontWeight:700}}>⚠</span>
                    return null
                  })()}
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
                </div>
              </div>
              <div style={{display:'flex',alignItems:'center',gap:5}}>
                <button onClick={mesAnterior} style={{border:'1px solid var(--border)',borderRadius:5,background:'none',cursor:'pointer',padding:'3px 7px',display:'flex'}}><ChevronLeft size={13}/></button>
                <span style={{fontWeight:700,fontSize:13,minWidth:130,textAlign:'center'}}>{MESES[mes-1]} / {ano}</span>
                <button onClick={mesSeguinte} style={{border:'1px solid var(--border)',borderRadius:5,background:'none',cursor:'pointer',padding:'3px 7px',display:'flex'}}><ChevronRight size={13}/></button>
              </div>
              <Button variant="outline" size="sm" onClick={()=>window.print()} style={{gap:4,height:30,fontSize:12}}><Printer size={12}/></Button>
              {(()=>{
                const today4 = new Date().toISOString().slice(0,10)
                const periodoHoje2 = historicoContrato.find(p => p.data_inicio<=today4 && (p.data_fim===null||p.data_fim>=today4))
                const tipoAtivo2 = periodoHoje2?.tipo_contrato ?? colabSel.tipo_contrato ?? 'clt'
                const abaEhAtiva = abaContrato === tipoAtivo2
                const temAberto = lancamentos.filter(l=>(l as any).tipo_contrato_lanc===abaContrato||(!((l as any).tipo_contrato_lanc)&&abaContrato===tipoAtivo2)).some(l=>['rascunho','recusado','aguardando_aprovacao'].includes(l.status))
                return (
                  <Button size="sm"
                    disabled={!colabSel || !abaEhAtiva || temAberto}
                    title={!abaEhAtiva ? `Aba ${abaContrato.toUpperCase()} não é o contrato atual — lançamentos históricos, somente leitura` : temAberto ? 'Envie os lançamentos em aberto para o Fechamento antes de criar um novo' : undefined}
                    onClick={()=>{setNovoLancObraId('');setNovoLancInicio('');setNovoLancFim('');setModalLanc(true)}}
                    style={{gap:4,height:30,fontSize:12,opacity:abaEhAtiva?1:0.5}}>
                    <Plus size={12}/>{abaEhAtiva ? ' Novo Lançamento' : ' 🔒 Somente leitura'}
                  </Button>
                )
              })()}
            </div>

            {/* Linha 1b: Abas de contrato (CLT / Autônomo) */}
            {(()=>{
              // Tipos de contrato que este colaborador JÁ teve (histórico) ou tem agora
              const tiposUsados = new Set<string>(historicoContrato.map(p=>p.tipo_contrato))
              tiposUsados.add(colabSel.tipo_contrato ?? 'clt')
              const today3 = new Date().toISOString().slice(0,10)
              const periodoHoje = historicoContrato.find(p => p.data_inicio<=today3 && (p.data_fim===null||p.data_fim>=today3))
              const tipoAtivo = periodoHoje?.tipo_contrato ?? colabSel.tipo_contrato ?? 'clt'
              const ABAS_CONTRATO = [
                {key:'clt', label:'🟦 CLT', cor:'#1d4ed8'},
                {key:'autonomo', label:'🟧 Autônomo', cor:'#d97706'},
                {key:'pj', label:'🟧 PJ', cor:'#7c3aed'},
              ].filter(a => tiposUsados.has(a.key) || lancamentos.some(l=>(l as any).tipo_contrato_lanc===a.key))
              if(ABAS_CONTRATO.length <= 1) return null
              return (
                <div style={{display:'flex',gap:4,padding:'6px 14px',borderTop:'1px solid var(--border)'}}>
                  {ABAS_CONTRATO.map(a=>{
                    const isAtiva = a.key === tipoAtivo
                    const isSel = a.key === abaContrato
                    const lancsDaAba = lancamentos.filter(l=>(l as any).tipo_contrato_lanc===a.key || (!((l as any).tipo_contrato_lanc) && a.key===tipoAtivo))
                    return (
                      <button key={a.key} onClick={()=>setAbaContrato(a.key as any)}
                        style={{
                          display:'flex',alignItems:'center',gap:6,padding:'5px 14px',borderRadius:20,
                          border:`2px solid ${isSel?a.cor:'var(--border)'}`,
                          background:isSel?a.cor+'15':'transparent',
                          color:isSel?a.cor:'var(--muted-foreground)',
                          cursor:'pointer',fontSize:12,fontWeight:isSel?700:500,
                          opacity:isAtiva?1:0.75,
                        }}>
                        {a.label}
                        {isAtiva && <span style={{fontSize:10,color:'#16a34a',fontWeight:700}}>✓ ativo</span>}
                        {!isAtiva && <span style={{fontSize:10}}>🔒</span>}
                        {lancsDaAba.length > 0 && <span style={{fontSize:10,background:a.cor+'22',borderRadius:10,padding:'0 5px',color:a.cor}}>{lancsDaAba.length}</span>}
                      </button>
                    )
                  })}
                </div>
              )
            })()}

            {/* Linha 2: cards de totais */}
            <div style={{display:'flex',gap:1,borderTop:'1px solid var(--border)',background:'var(--muted)',flexWrap:'wrap'}}>
              {(()=>{
                const ehAuto=colabSel.tipo_contrato==='autonomo'||colabSel.tipo_contrato==='pj'
                // Média produção por dia trabalhado (total presentes, não só dias de prod)
                const diasProd=diasComProd.size
                const subProd=totalProd>0&&diasProd>0
                  ? `≈ ${formatCurrency(totalProd/diasProd)}/dia (${diasProd} dia${diasProd!==1?'s':''})`
                  : producoes.length>0?`${producoes.length} lançamento${producoes.length!==1?'s':''}`:'Nenhuma produção'
                const salarioCLT = totalHoras + dsrInfo.valor

                // Sub-labels
                const subReceber = ehAuto
                  ? (totalProd>0
                      // Autônomo: mostra horas dos dias SEM prod + produção separados
                      ? `Horas (${diasComProd.size} dia${diasComProd.size!==1?'s':''} c/prod excluídos): ${formatCurrency(horasAutonomoSemProd)} + Prod: ${formatCurrency(totalProd)}`
                      : horasAutonomoSemProd>0 ? `Horas: ${formatCurrency(horasAutonomoSemProd)}` : `Autônomo: R$ ${valorHoraEfetivo.toFixed(2)}/h`)
                  : (()=>{
                      const partes:string[]=[]
                      if(totalHoras>0) partes.push(`Horas: ${formatCurrency(totalHoras)}`)
                      if(dsrInfo.valor>0) partes.push(`DSR: ${formatCurrency(dsrInfo.valor)}`)
                      if(premioCLT>0) partes.push(`🎯 Bônus desemp.: ${formatCurrency(premioCLT)}`)
                      else if(totalProd>0) partes.push(`Prod ${formatCurrency(totalProd)} < sal. (desconsiderada)`)
                      return partes.length>0?partes.join(' + '):'Sem valor/hora cadastrado'
                    })();

                const cards=[
                  {label:'⏱ Total de Horas',value:fmtHHMM(totaisGlobais.total),sub:(()=>{
                    const partes:string[]=[]
                    if(totaisGlobais.normais>0) partes.push(`${fmtHHMM(totaisGlobais.normais)} norm`)
                    if(totaisGlobais.extras50>0) partes.push(`${fmtHHMM(totaisGlobais.extras50)} sáb(+50%)`)
                    if(totaisGlobais.extras100>0) partes.push(`${fmtHHMM(totaisGlobais.extras100)} feriado(+100%)`)
                    return partes.length>0 ? partes.join(' + ') : '0h'
                  })(),color:'#1d4ed8'},
                  {label:'💰 Valor das Horas',value:valorHoraEfetivo>0?(valorHoraCongelado!=null?`🔒 R$ ${valorHoraEfetivo.toFixed(2)}/h`:`R$ ${valorHoraEfetivo.toFixed(2)}/h`):'Sem tabela',sub:valorHoraEfetivo>0?(valorHoraCongelado!=null?`Valor congelado · ${formatCurrency(totalHoras)} no período`:formatCurrency(totalHoras)+' no período'):'Cadastre em Funções → valor/hora',color:valorHoraEfetivo>0?(valorHoraCongelado!=null?'#0369a1':'#15803d'):'#9ca3af'},
                  {label:'🏗️ Produção',value:totalProd>0?formatCurrency(totalProd):'—',sub:subProd,color:'#b45309'},
                ]

                // Card DSR — só CLT
                if(!ehAuto&&dsrInfo.diasUteis>0){
                  const perdeuDom = (dsrInfo as any).domingosPerdidos ?? 0
                  const subDsr = dsrInfo.baseValor>0
                    ? `(${formatCurrency(dsrInfo.baseValor)} ÷ ${dsrInfo.diasUteis} du) × ${dsrInfo.domingos} dom pagos`
                      + (perdeuDom>0 ? ` · ⚠ ${perdeuDom} dom perdido${perdeuDom>1?'s':''} p/ falta` : '')
                    : `${dsrInfo.diasUteis} dias úteis · ${dsrInfo.domingos} domingos`
                  const corDsr = perdeuDom>0 ? '#b45309' : '#0369a1'
                  cards.push({label:'📅 DSR',value:dsrInfo.valor>0?formatCurrency(dsrInfo.valor):'R$ 0,00',sub:subDsr,color:corDsr})
                }

                // Card Salário (CLT) ou Total a Receber (autônomo)
                const subReceberFinal = ehAuto
                  ? subReceber
                  : (()=>{
                      const partes:string[]=[]
                      if(totalHoras>0) partes.push(`Horas: ${formatCurrency(totalHoras)}`)
                      if(dsrInfo.valor>0) partes.push(`DSR: ${formatCurrency(dsrInfo.valor)}`)
                      if(premioCLT>0) partes.push(`🎯 Bônus: ${formatCurrency(premioCLT)}`)
                      return partes.length>0 ? partes.join(' + ') : 'Sem valor/hora cadastrado'
                    })()
                cards.push({
                  label: ehAuto ? '💵 Total a Receber' : '💵 Salário',
                  value: formatCurrency(totalReceber),
                  sub: subReceberFinal,
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
              {totalProd>0&&valorHoraEfetivo>0&&colabSel&&(()=>{
                const ehAutoPerf=colabSel.tipo_contrato==='autonomo'||colabSel.tipo_contrato==='pj'
                // Base de comparação: salário (horas+DSR) para CLT; horas totais para Autônomo
                const baseComp = ehAutoPerf ? totalHoras : (totalHoras + dsrInfo.valor)
                const diff = totalProd - baseComp
                const bom  = diff >= 0
                const pct  = baseComp > 0 ? Math.abs(diff)/baseComp*100 : 0
                return(
                  <div style={{flex:1,minWidth:140,padding:'8px 12px',textAlign:'center',borderRight:'1px solid var(--border)',background:bom?'rgba(22,163,74,0.06)':'rgba(220,38,38,0.06)'}}>
                    <div style={{fontSize:10,fontWeight:700,marginBottom:2,color:bom?'#15803d':'#dc2626'}}>
                      {bom ? '📈 Bônus de Desempenho' : '📦 Prod abaixo do Salário'}
                    </div>
                    <div style={{fontSize:15,fontWeight:800,color:bom?'#15803d':'#dc2626'}}>
                      {bom ? `+${formatCurrency(diff)}` : formatCurrency(diff)}
                    </div>
                    <div style={{fontSize:10,color:bom?'#16a34a':'#b91c1c'}}>
                      {bom
                        ? `Prod supera salário em ${pct.toFixed(0)}% → bônus pago`
                        : `Salário cobre: pagar apenas ${formatCurrency(baseComp)}`}
                    </div>
                    <div style={{fontSize:9,color:'var(--muted-foreground)',marginTop:1}}>
                      Salário base: {formatCurrency(baseComp)} · Prod: {formatCurrency(totalProd)}
                    </div>
                  </div>
                )
              })()}
            </div>
          </div>

          {/* ── Área de lançamentos ── */}
          <div style={{flex:1,overflowY:'auto',padding:'12px 14px',display:'flex',flexDirection:'column',gap:12}}>

            {loadingDias&&<div style={{textAlign:'center',padding:32,color:'var(--muted-foreground)'}}>Carregando…</div>}

            {!loadingDias&&(()=>{
              const today5 = new Date().toISOString().slice(0,10)
              const periodoHoje5 = historicoContrato.find(p => p.data_inicio<=today5 && (p.data_fim===null||p.data_fim>=today5))
              const tipoAtivo5 = periodoHoje5?.tipo_contrato ?? colabSel.tipo_contrato ?? 'clt'
              const lancsDaAba = lancamentos.filter(l=>(l as any).tipo_contrato_lanc===abaContrato || (!((l as any).tipo_contrato_lanc) && abaContrato===tipoAtivo5))
              if(lancsDaAba.length === 0) return (
                <div style={{textAlign:'center',padding:40,color:'var(--muted-foreground)',display:'flex',flexDirection:'column',alignItems:'center',gap:10}}>
                  <Clock size={40} style={{opacity:0.3}}/>
                  <div style={{fontWeight:600}}>
                    {lancamentos.length===0 ? 'Nenhum lançamento neste mês' : `Nenhum lançamento ${abaContrato.toUpperCase()} neste mês`}
                  </div>
                  {abaContrato===tipoAtivo5
                    ? <div style={{fontSize:13}}>Clique em "Novo Lançamento" para iniciar o ponto</div>
                    : <div style={{fontSize:13,color:'#d97706'}}>🔒 Esta aba é histórica — o contrato atual é {tipoAtivo5.toUpperCase()}</div>
                  }
                </div>
              )
              return null
            })()}

            {/* Card por lançamento — filtrado pela aba de contrato */}
            {(()=>{
              const today6 = new Date().toISOString().slice(0,10)
              const periodoHoje6 = historicoContrato.find(p => p.data_inicio<=today6 && (p.data_fim===null||p.data_fim>=today6))
              const tipoAtivo6 = periodoHoje6?.tipo_contrato ?? colabSel.tipo_contrato ?? 'clt'
              return lancamentos.filter(l=>(l as any).tipo_contrato_lanc===abaContrato || (!((l as any).tipo_contrato_lanc) && abaContrato===tipoAtivo6))
            })().map(lanc=>{
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

                  {/* ── Cabeçalho do card: mini-resumo próprio por lançamento ── */}
                  {(()=>{
                    const tcLanc2 = ((lanc as any).tipo_contrato_lanc ?? colabSel.tipo_contrato ?? 'clt') as string
                    const ehCLTcard = tcLanc2 === 'clt'
                    const diasLancCard = diasMap[lanc.id] ?? []
                    const vhCard = valorHoraDoLanc(lanc.id!)
                    let nCard=0,e50Card=0,e100Card=0
                    diasLancCard.forEach(d=>{
                      if(!ehCLTcard && diasComProd.has(d.data)) return
                      const cl=calcDia(d,feriados.has(d.data),ehCLTcard)
                      nCard+=cl.normais; e50Card+=cl.extras50; e100Card+=cl.extras100
                    })
                    const vHorasCard = calcValorMin(nCard,e50Card,e100Card,vhCard,heCoef50,heCoef100)
                    const datasComFaltaCard = new Set<string>()
                    if(ehCLTcard) diasLancCard.forEach(d=>{ if(d.falta&&d.data) datasComFaltaCard.add(d.data) })
                    const dsrCard = ehCLTcard
                      ? calcDSRComFaltas(vHorasCard, lanc.data_inicio, lanc.data_fim, datasComFaltaCard, feriados).dsr
                      : 0
                    const prodCard = totalProdLancamento
                    // ═ REGRA PRODUÇÃO vs SALÁRIO por lançamento ═
                    // CLT: se prod > (horas+DSR) → paga horas+DSR + bônus; senão paga só horas+DSR
                    // Autônomo/PJ: dias c/prod → só prod; dias s/prod → só horas
                    const salBaseCard = ehCLTcard ? (vHorasCard + dsrCard) : vHorasCard
                    const bonusCard   = ehCLTcard && prodCard > salBaseCard ? prodCard - salBaseCard : 0
                    // Total: CLT = salário + bônus; Autônomo = horas(sem prod) + prod
                    const totalCard = salBaseCard + (ehCLTcard ? bonusCard : (prodCard > 0 ? prodCard : 0))
                    const horasTotCard = nCard + e50Card + e100Card
                    const tcCor = tcLanc2==='clt' ? '#1d4ed8' : tcLanc2==='pj' ? '#7c3aed' : '#15803d'
                    const tcBg  = tcLanc2==='clt' ? '#dbeafe' : tcLanc2==='pj' ? '#ede9fe' : '#dcfce7'
                    const statusCfgC:{[k:string]:{bg:string;color:string;label:string}}={
                      rascunho:{bg:'#f1f5f9',color:'#475569',label:'📝 Rascunho'},
                      aguardando_aprovacao:{bg:'#fef3c7',color:'#92400e',label:'⏳ Aguardando'},
                      em_fechamento:{bg:'#ede9fe',color:'#6d28d9',label:'📋 Em Fechamento'},
                      aprovado:{bg:'#dcfce7',color:'#15803d',label:'✅ Aprovado'},
                      liberado:{bg:'#dbeafe',color:'#1d4ed8',label:'💜 Ag. Pagamento'},
                      pago:{bg:'#d1fae5',color:'#065f46',label:'💰 Pago'},
                      recusado:{bg:'#fee2e2',color:'#b91c1c',label:'❌ Recusado'},
                    }
                    const sC = statusCfgC[lanc.status]??statusCfgC.rascunho
                    return(
                      <>
                        {/* Linha título: obra + tipo + status */}
                        <div style={{display:'flex',alignItems:'center',gap:8,padding:'9px 14px 6px',background:'var(--muted)',cursor:'pointer'}} onClick={()=>setExpandido(exp?null:lanc.id)}>
                          {exp?<ChevronDown size={13}/>:<ChevronRight size={13}/>}
                          <Building2 size={13} style={{color:'var(--primary)',flexShrink:0}}/>
                          <div style={{flex:1,minWidth:0}}>
                            <div style={{fontWeight:700,fontSize:13}}>{lanc.obra_nome}</div>
                            <div style={{fontSize:10,color:'var(--muted-foreground)',fontFamily:'monospace'}}>
                              {lanc.data_inicio.slice(8)}/{lanc.data_inicio.slice(5,7)} → {lanc.data_fim.slice(8)}/{lanc.data_fim.slice(5,7)}
                              <span style={{marginLeft:8}}>· {tot.presentes} dias · {fmtHHMM(horasTotCard)}h</span>
                              {tot.atestados>0&&<span style={{color:'#1d4ed8',marginLeft:6}}>🩺 {tot.atestados}</span>}
                              {tot.suspensoes>0&&<span style={{color:'#dc2626',marginLeft:6}}>⛔ {tot.suspensoes}</span>}
                            </div>
                          </div>
                          <span style={{fontSize:10,fontWeight:800,padding:'2px 10px',borderRadius:8,background:tcBg,color:tcCor,flexShrink:0}}>
                            {tcLanc2.toUpperCase()}
                          </span>
                          <span style={{fontSize:10,fontWeight:700,padding:'2px 8px',borderRadius:10,background:sC.bg,color:sC.color,flexShrink:0}}>{sC.label}</span>
                        </div>
                        {/* Linha mini-resumo financeiro */}
                        {vhCard > 0 && (
                          <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(80px,1fr))',background:'#f8fafc',borderTop:'1px solid var(--border)',borderBottom:'1px solid var(--border)'}}>
                            <div style={{padding:'5px 10px',borderRight:'1px solid var(--border)'}}>
                              <div style={{fontSize:9,color:'#6b7280',fontWeight:600,textTransform:'uppercase'}}>Valor/h</div>
                              <div style={{fontSize:11,fontWeight:700,color:'#374151'}}>{snapshotPorLanc.get(lanc.id!)!=null?'🔒 ':''}{`R$ ${vhCard.toFixed(2)}`}</div>
                            </div>
                            <div style={{padding:'5px 10px',borderRight:'1px solid var(--border)'}}>
                              <div style={{fontSize:9,color:'#6b7280',fontWeight:600,textTransform:'uppercase'}}>Horas</div>
                              <div style={{fontSize:11,fontWeight:700,color:'#1d4ed8'}}>{fmtHHMM(horasTotCard)}</div>
                              <div style={{fontSize:9,color:'#9ca3af'}}>{fmtHHMM(nCard)} n{e50Card>0?` +${fmtHHMM(e50Card)} e`:''}{e100Card>0?` +${fmtHHMM(e100Card)} f`:''}</div>
                            </div>
                            <div style={{padding:'5px 10px',borderRight:'1px solid var(--border)'}}>
                              <div style={{fontSize:9,color:'#6b7280',fontWeight:600,textTransform:'uppercase'}}>R$ Horas</div>
                              <div style={{fontSize:11,fontWeight:700,color:'#15803d'}}>{formatCurrency(vHorasCard)}</div>
                            </div>
                            {ehCLTcard && dsrCard>0 && (
                              <div style={{padding:'5px 10px',borderRight:'1px solid var(--border)'}}>
                                <div style={{fontSize:9,color:'#6b7280',fontWeight:600,textTransform:'uppercase'}}>DSR</div>
                                <div style={{fontSize:11,fontWeight:700,color:'#0369a1'}}>{formatCurrency(dsrCard)}</div>
                              </div>
                            )}
                            {prodCard>0 && (
                              <div style={{padding:'5px 10px',borderRight:'1px solid var(--border)'}}>
                                <div style={{fontSize:9,color:'#6b7280',fontWeight:600,textTransform:'uppercase'}}>
                                  {ehCLTcard ? (bonusCard>0 ? '📈 Bônus Desemp.' : '📦 Prod (abaixo sal.)') : 'Produção'}
                                </div>
                                <div style={{fontSize:11,fontWeight:700,color: ehCLTcard ? (bonusCard>0?'#15803d':'#9ca3af') : '#b45309'}}>
                                  {ehCLTcard
                                    ? (bonusCard>0 ? `+${formatCurrency(bonusCard)}` : formatCurrency(prodCard))
                                    : formatCurrency(prodCard)
                                  }
                                </div>
                                {ehCLTcard && bonusCard===0 && prodCard>0 && (
                                  <div style={{fontSize:8,color:'#9ca3af'}}>salário já cobre</div>
                                )}
                              </div>
                            )}
                            <div style={{padding:'5px 10px',background: bonusCard>0?'#14532d':'#1e3a5f'}}>
                              <div style={{fontSize:9,color:'#93c5fd',fontWeight:600,textTransform:'uppercase'}}>Total</div>
                              <div style={{fontSize:13,fontWeight:900,color:'#fff'}}>{formatCurrency(totalCard)}</div>
                              {bonusCard>0 && <div style={{fontSize:8,color:'#86efac'}}>incl. bônus</div>}
                            </div>
                          </div>
                        )}
                      </>
                    )
                  })()}
                  {/* Ações */}
                  <div style={{display:'flex',gap:4,padding:'6px 10px',background:'var(--muted)',flexWrap:'wrap'}} onClick={e=>e.stopPropagation()}>
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
                      {lanc.status==='aguardando_aprovacao'&&<Button size="sm" variant="outline" style={{height:26,fontSize:11,gap:2,borderColor:'#7c3aed',color:'#6d28d9',background:'#faf5ff'}} onClick={()=>mudarStatus(lanc.id,'em_fechamento')}>📋 Enviar p/ Fechamento</Button>}
                      {lanc.status==='aguardando_aprovacao'&&<Button size="sm" variant="outline" style={{height:26,fontSize:11,gap:2,borderColor:'#b45309',color:'#b45309',background:'#fef3c7'}} onClick={()=>mudarStatus(lanc.id,'rascunho')}>✏️ Editar</Button>}
                      {lanc.status==='recusado'&&<Button size="sm" variant="outline" style={{height:26,fontSize:11,gap:2,borderColor:'#16a34a',color:'#15803d',background:'#f0fdf4'}} disabled={saving} onClick={async()=>{await salvarLanc(lanc.id);await mudarStatus(lanc.id,'aguardando_aprovacao')}}>↩ Salvar e Reenviar</Button>}
                      {/* Botão Excluir — disponível para lançamentos não aprovados */}
                      {['rascunho','aguardando_aprovacao','recusado'].includes(lanc.status)&&(
                        <Button size="sm" variant="outline" style={{height:26,fontSize:11,gap:2,borderColor:'#dc2626',color:'#dc2626',background:'#fff5f5'}} onClick={()=>excluirLancamento(lanc.id)}>
                          <Trash2 size={11}/> Excluir
                        </Button>
                      )}
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
                  {exp ? (
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
                            const fds=isFDS(d.data); const eFeriado=feriados.has(d.data); const _isClt=lancIsClt(lanc.id!)
                            // horasJornada para feriado_remunerado
                            const diaSemKey2=DIAS_KEY[new Date(d.data+'T12:00:00').getDay()]
                            const horObraLanc=horariosObra[lanc.obra_id]?.[diaSemKey2]
                            const jornMin=horObraLanc?.hora_entrada&&horObraLanc?.hora_saida ? Math.max(0,diffMin(horObraLanc.hora_entrada,horObraLanc.hora_saida)-(horObraLanc.saida_almoco&&horObraLanc.retorno_almoco?diffMin(horObraLanc.saida_almoco,horObraLanc.retorno_almoco):horObraLanc.saida_almoco?60:0)) : 0
                            const calc=calcDia(d,eFeriado,_isClt,jornMin); const lancBloq=!['rascunho','recusado'].includes(lanc.status)
                            const bg=d.evento==='suspensao'?'rgba(239,68,68,0.09)':d.evento==='atestado'?'rgba(59,130,246,0.09)':eFeriado&&d.feriado_remunerado?'rgba(245,158,11,0.13)':eFeriado?'rgba(245,158,11,0.07)':fds?'rgba(100,100,100,0.04)':d.falta?'rgba(239,68,68,0.05)':d.presente?'rgba(22,163,74,0.03)':'transparent'
                            return(
                              <tr key={d.data} style={{borderBottom:'1px solid var(--border)',background:bg}}>
                                <td style={{...TD,fontWeight:700,textAlign:'center',color:eFeriado?'#d97706':fds?'#9ca3af':undefined}}>
                                  {diaSemana(d.data)}
                                  {eFeriado&&(
                                    d.presente
                                      ? <span title='Feriado trabalhado (+100%)' style={{fontSize:9,marginLeft:2}}>🎌+</span>
                                      : d.feriado_remunerado
                                        ? <span title='Feriado remunerado (dia normal pago)' style={{fontSize:9,marginLeft:2}}>🎌✓</span>
                                        : <span title='Feriado — marque presença ou remunerado' style={{fontSize:9,marginLeft:2,color:'#9ca3af'}}>🎌</span>
                                  )}
                                </td>
                                <td style={{...TD,textAlign:'center',fontFamily:'monospace',fontWeight:600}}>{d.data.slice(8)}/{d.data.slice(5,7)}</td>
                                <td style={{...TD,textAlign:'center'}}>
                                  {d.evento==='atestado'?<span title="Afastamento">🩺</span>
                                  :d.evento==='suspensao'?<span title="Suspensão">⛔</span>
                                  :d.evento==='outro_lancamento'?<span title={`🔒 Dia lançado em: ${d.justificativa||'outra obra'}`} style={{cursor:'default'}}>🔒</span>
                                  :<button onClick={()=>!lancBloq&&togglePresente(lanc.id,idx,colabSel!)} style={{border:'none',background:'none',cursor:lancBloq?'not-allowed':'pointer',padding:2,color:d.presente?'#16a34a':'#9ca3af',opacity:lancBloq?0.5:1}}>
                                    {d.presente?<CheckCircle2 size={16}/>:<span style={{fontSize:16,opacity:0.3}}>○</span>}
                                  </button>}
                                </td>
                                <td style={{...TD,textAlign:'center'}}>
                                  {!d.bloqueado&&<button onClick={()=>!lancBloq&&toggleFalta(lanc.id,idx)} style={{border:'none',background:'none',cursor:lancBloq?'not-allowed':'pointer',padding:2,color:d.falta?'#dc2626':'#9ca3af',opacity:lancBloq?0.5:1}}><span style={{fontSize:15,opacity:d.falta?1:0.3}}>✗</span></button>}
                                  {/* Botão Feriado Remunerado — só em dias de feriado sem presença */}
                                  {eFeriado&&!d.bloqueado&&!d.presente&&(
                                    <button
                                      onClick={()=>!lancBloq&&toggleFeriadoRemunerado(lanc.id,idx)}
                                      title={d.feriado_remunerado?'Feriado remunerado ativo (clique para desativar)':'Marcar como feriado remunerado (paga jornada normal)'}
                                      style={{border:'none',background:'none',cursor:lancBloq?'not-allowed':'pointer',padding:'1px 3px',borderRadius:3,
                                        background:d.feriado_remunerado?'#fef3c7':'transparent',
                                        color:d.feriado_remunerado?'#92400e':'#d1d5db',
                                        fontSize:11,fontWeight:700,opacity:lancBloq?0.5:1,marginLeft:2}}
                                    >
                                      $
                                    </button>
                                  )}
                                </td>
                                <td style={TD}><TI disabled={!d.presente||d.falta||d.bloqueado||lancBloq} value={d.hora_entrada} onChange={v=>updDia(lanc.id,idx,'hora_entrada',v)}/></td>
                                <td style={TD}><TI disabled={!d.presente||d.falta||d.bloqueado||lancBloq} value={d.saida_almoco} onChange={v=>updDia(lanc.id,idx,'saida_almoco',v)}/></td>
                                <td style={TD}><TI disabled={!d.presente||d.falta||d.bloqueado||lancBloq} value={d.retorno_almoco} onChange={v=>updDia(lanc.id,idx,'retorno_almoco',v)}/></td>
                                <td style={TD}><TI disabled={!d.presente||d.falta||d.bloqueado||lancBloq} value={d.hora_saida} onChange={v=>updDia(lanc.id,idx,'hora_saida',v)}/></td>
                                <td style={{...TD,background:'rgba(45,90,158,0.04)'}}><TI disabled={!d.presente||d.falta||d.bloqueado||lancBloq} value={d.he_entrada} onChange={v=>updDia(lanc.id,idx,'he_entrada',v)}/></td>
                                <td style={{...TD,background:'rgba(45,90,158,0.04)'}}><TI disabled={!d.presente||d.falta||d.bloqueado||lancBloq} value={d.he_saida} onChange={v=>updDia(lanc.id,idx,'he_saida',v)}/></td>
                                <td style={{...TD,textAlign:'center',fontWeight:600,color:calc.normais>0?'#15803d':'#9ca3af',background:'rgba(22,163,74,0.05)'}}>{calc.normais>0?fmtHHMM(calc.normais):'—'}</td>
                                <td style={{...TD,textAlign:'center',fontWeight:600,color:calc.extras100>0?'#dc2626':calc.extras50>0?'#1d4ed8':'#9ca3af',background:calc.extras100>0?'rgba(220,38,38,0.06)':'rgba(45,90,158,0.05)'}}>{calc.extras100>0 ? fmtHHMM(calc.extras100)+'🔴' : calc.extras50>0 ? fmtHHMM(calc.extras50)+'*' : '—'}</td>
                                <td style={{...TD,textAlign:'center',fontWeight:700,background:'rgba(0,0,0,0.03)'}}>{calc.total>0?fmtHHMM(calc.total):'—'}</td>
                                <td style={{...TD,textAlign:'right',fontWeight:700,background:'rgba(74,26,122,0.05)',color:'#6d28d9',fontSize:11}}>
                                  {d.evento==='atestado'||d.evento==='suspensao'||d.falta
                                    ? <span style={{color:'#9ca3af'}}>—</span>
                                    : d.evento==='outro_lancamento'
                                    ? null
                                    : d.presente&&calc.total>0
                                    ? (() => {
                                        const ehAuto=colabSel?.tipo_contrato==='autonomo'||colabSel?.tipo_contrato==='pj'
                                        const vhLinha = valorHoraDoLanc(lanc.id!)
                                        const vHoras=calcValorMin(calc.normais,calc.extras50,calc.extras100,vhLinha,heCoef50,heCoef100)
                                        // Autônomo: se este dia foi marcado na produção → mostra prod proporcional; senão → horas
                                        if(ehAuto&&diasComProd.has(d.data)&&prodPorDia>0){
                                          return <span title={`Dia marcado na produção: ${formatCurrency(prodPorDia)}`} style={{cursor:'default',color:'#b45309',fontWeight:700}}>
                                            {formatCurrency(prodPorDia)}
                                            <span style={{display:'block',fontSize:9,fontWeight:400}}>prod.</span>
                                          </span>
                                        }
                                        // CLT ou autônomo sem prod neste dia: mostra horas
                                        return <span title={`Horas: ${formatCurrency(vHoras)}`} style={{cursor:'default'}}>
                                          {valorHoraEfetivo>0?formatCurrency(vHoras):'—'}
                                        </span>
                                      })()
                                    : <span style={{color:'#d1d5db',fontSize:9}}>{valorHoraEfetivo===0?'s/val':'—'}</span>
                                  }
                                </td>
                                <td style={{...TD,fontSize:10}}>
                                  {d.evento==='atestado'&&<span style={{color:'#1d4ed8',fontWeight:600}}>Afastamento</span>}
                                  {d.evento==='suspensao'&&<span style={{color:'#b91c1c',fontWeight:600}}>Suspensão</span>}
                                  {d.evento==='outro_lancamento'&&<span style={{color:'#6b7280',fontSize:10}}>🔒 {d.justificativa||'outra obra'}</span>}
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
                            <td colSpan={6} style={{padding:'7px 12px',textAlign:'right',fontSize:10,opacity:0.7}}>{(()=>{const vh=valorHoraDoLanc(lanc.id!);return vh>0&&`R$ ${vh.toFixed(4)}/h`})()}</td>
                            <td style={{padding:'7px 6px',textAlign:'center',background:'rgba(22,163,74,0.3)'}}>{fmtHHMM(tot.normais)}</td>
                            <td style={{padding:'7px 6px',textAlign:'center',background:'rgba(45,90,158,0.4)'}}>{fmtHHMM(tot.extras50)}</td>
                            <td style={{padding:'7px 6px',textAlign:'center',background:'rgba(0,0,0,0.2)'}}>{fmtHHMM(tot.total)}</td>
                            <td style={{padding:'7px 8px',textAlign:'right',background:'rgba(74,26,122,0.4)',color:'#e9d5ff',fontWeight:700,fontSize:11}}>
                              {(() => {
                                const vhLancFoot = valorHoraDoLanc(lanc.id!)
                                const vHoras=calcValorMin(tot.normais,tot.extras50,tot.extras100,vhLancFoot,heCoef50,heCoef100)
                                const ehAuto=colabSel?.tipo_contrato==='autonomo'||colabSel?.tipo_contrato==='pj'
                                if(vHoras===0&&totalProdLancamento===0)return '—'
                                if(ehAuto){
                                  // Autônomo: calcular horas só dos dias SEM produção neste lançamento
                                  const diasLancamento=diasMap[lanc.id]??[]
                                  let minNormLanc=0,minExtra50Lanc=0,minExtra100Lanc=0
                                  diasLancamento.forEach(d=>{
                                    if(!diasComProd.has(d.data)){const _clt=lancIsClt(lanc.id!);const cl=calcDia(d,feriados.has(d.data),_clt);minNormLanc+=cl.normais;minExtra50Lanc+=cl.extras50;minExtra100Lanc+=cl.extras100}
                                  })
                                  const horasLancSemProd=calcValorMin(minNormLanc,minExtra50Lanc,minExtra100Lanc,vhLancFoot,heCoef50,heCoef100)
                                  const vTotalAuto=horasLancSemProd+totalProdLancamento
                                  return <span title={`Horas(sem prod): ${formatCurrency(horasLancSemProd)} + Prod: ${formatCurrency(totalProdLancamento)}`}>
                                    {formatCurrency(vTotalAuto)}
                                    {totalProdLancamento>0&&<span style={{display:'block',fontSize:9,opacity:0.8}}>+{formatCurrency(totalProdLancamento)} prod</span>}
                                  </span>
                                }
                                // CLT: horas + DSR proporcional do lançamento
                                // usar calcDSRComFaltas para consistência
                                const _duLanc=diasUteisPeriodo(lanc.data_inicio,lanc.data_fim,feriados)
                                const _domLanc=domingosFeriadosPeriodo(lanc.data_inicio,lanc.data_fim,feriados)
                                const extrasLanc=fmtDecimal(tot.extras50)*vhLancFoot*heCoef50 + fmtDecimal(tot.extras100)*vhLancFoot*heCoef100
                                const dsrLanc=_duLanc>0&&_domLanc>0&&extrasLanc>0?(extrasLanc/_duLanc)*_domLanc:0
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

                  ) : null}
                  {/* bloco de feriados removido — controlado por presença/feriado_remunerado na tabela */}
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

    {/* ═══ MODAL FERIADO SEM DECISÃO ═══ */}
    {modalFeriadoAviso&&(
      <div style={{position:'fixed',inset:0,background:'rgba(0,0,0,0.55)',zIndex:90,display:'flex',alignItems:'center',justifyContent:'center',padding:16}}>
        <div style={{background:'var(--background)',borderRadius:14,width:'100%',maxWidth:460,padding:28,boxShadow:'0 24px 80px rgba(0,0,0,0.35)'}}>
          <div style={{textAlign:'center',marginBottom:20}}>
            <div style={{fontSize:38,marginBottom:8}}>🎌⚠️</div>
            <h3 style={{fontWeight:800,fontSize:16,margin:0,color:'#92400e'}}>Feriado(s) sem decisão!</h3>
            <p style={{fontSize:13,color:'var(--muted-foreground)',marginTop:10,lineHeight:1.6}}>
              Os dias abaixo são <strong>feriados</strong> e ainda não foram preenchidos.<br/>
              Escolha uma das opções para cada dia:
            </p>
            <div style={{display:'flex',gap:12,justifyContent:'center',fontSize:12,color:'#374151',margin:'12px 0 4px',flexWrap:'wrap'}}>
              <span style={{background:'#dcfce7',padding:'3px 10px',borderRadius:20,fontWeight:700}}>✅ Presença = trabalhou (+100%)</span>
              <span style={{background:'#fef3c7',padding:'3px 10px',borderRadius:20,fontWeight:700}}>$ Remunerado = folga paga (jornada normal)</span>
              <span style={{background:'#fee2e2',padding:'3px 10px',borderRadius:20,fontWeight:700}}>✗ Falta = não pago</span>
            </div>
          </div>
          {/* Lista de feriados pendentes */}
          <div style={{background:'#fffbeb',border:'1px solid #fde68a',borderRadius:10,padding:'12px 16px',marginBottom:20}}>
            <div style={{fontSize:11,fontWeight:800,color:'#92400e',marginBottom:8,textTransform:'uppercase',letterSpacing:'0.05em'}}>Dias sem preenchimento:</div>
            {modalFeriadoAviso.feriados.map(f=>(
              <div key={f} style={{display:'flex',alignItems:'center',gap:8,padding:'4px 0',borderBottom:'1px solid #fde68a',fontSize:13,color:'#78350f'}}>
                <span>🎌</span>
                <span style={{fontWeight:600}}>{f}</span>
              </div>
            ))}
          </div>
          <div style={{display:'flex',gap:10,justifyContent:'center',flexWrap:'wrap'}}>
            <Button variant="outline" onClick={()=>setModalFeriadoAviso(null)}>
              ← Voltar e corrigir
            </Button>
            <Button
              style={{background:'#d97706',color:'#fff',fontWeight:700}}
              onClick={()=>{
                const id=modalFeriadoAviso.lancId
                setModalFeriadoAviso(null)
                salvarLanc(id, true)  // forçar salvar mesmo sem decisão
              }}
            >
              Salvar mesmo assim
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
    {/* ─── Modal Portal: importação de ponto do encarregado ────────────── */}
    {modalPortal && (
      <div style={{position:'fixed',inset:0,background:'rgba(0,0,0,0.55)',zIndex:200,display:'flex',alignItems:'center',justifyContent:'center',padding:16}}>
        <div style={{background:'var(--background)',borderRadius:16,width:'100%',maxWidth:780,maxHeight:'92vh',display:'flex',flexDirection:'column',overflow:'hidden',boxShadow:'0 20px 60px rgba(0,0,0,0.3)'}}>

          {/* Header */}
          <div style={{padding:'18px 22px 14px',borderBottom:'1px solid var(--border)',display:'flex',alignItems:'center',justifyContent:'space-between',gap:12}}>
            <div>
              <div style={{fontWeight:800,fontSize:17}}>📲 Importar Ponto do Portal</div>
              <div style={{fontSize:12,color:'var(--muted-foreground)',marginTop:2}}>
                {portalStep==='periodo'?'Selecione o período e obra que deseja importar':'Revise e crie os lançamentos automaticamente'}
              </div>
            </div>

          </div>

          {/* ── STEP 1: Período ── */}
          {portalStep === 'periodo' && (
            <div style={{padding:'28px 28px 24px',display:'flex',flexDirection:'column',gap:20}}>
              <div style={{background:'#eff6ff',borderRadius:12,padding:'16px 18px',borderLeft:'4px solid #3b82f6'}}>
                <div style={{fontWeight:700,fontSize:14,color:'#1d4ed8',marginBottom:4}}>ℹ️ Como funciona</div>
                <div style={{fontSize:12,color:'#374151',lineHeight:1.6}}>
                  Informe o período lançado pelo encarregado no portal. O sistema buscará todos os registros de ponto e criará automaticamente os <strong>lançamentos e os pontos diários</strong> para cada colaborador e obra — você só precisará validar.
                </div>
              </div>

              <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:16}}>
                <div>
                  <label style={{fontSize:12,fontWeight:700,display:'block',marginBottom:6,color:'var(--muted-foreground)',textTransform:'uppercase',letterSpacing:'0.05em'}}>Data Início *</label>
                  <input type="date" value={portalInicio} onChange={e=>setPortalInicio(e.target.value)}
                    style={{width:'100%',height:44,border:'2px solid #3b82f6',borderRadius:8,padding:'0 12px',fontSize:14,boxSizing:'border-box',background:'var(--input)',color:'var(--foreground)'}} />
                </div>
                <div>
                  <label style={{fontSize:12,fontWeight:700,display:'block',marginBottom:6,color:'var(--muted-foreground)',textTransform:'uppercase',letterSpacing:'0.05em'}}>Data Fim *</label>
                  <input type="date" value={portalFim} onChange={e=>setPortalFim(e.target.value)}
                    style={{width:'100%',height:44,border:'2px solid #3b82f6',borderRadius:8,padding:'0 12px',fontSize:14,boxSizing:'border-box',background:'var(--input)',color:'var(--foreground)'}} />
                </div>
              </div>

              <div>
                <label style={{fontSize:12,fontWeight:700,display:'block',marginBottom:6,color:'var(--muted-foreground)',textTransform:'uppercase',letterSpacing:'0.05em'}}>Filtrar por Obra (opcional)</label>
                <select value={portalObraFiltro} onChange={e=>setPortalObraFiltro(e.target.value)}
                  style={{width:'100%',height:44,border:'1px solid var(--border)',borderRadius:8,padding:'0 12px',fontSize:13,background:'var(--input)',color:'var(--foreground)'}}>
                  <option value="">Todas as obras</option>
                  {obras.map(o=><option key={o.id} value={o.id}>{o.nome}</option>)}
                </select>
              </div>

              <div style={{display:'flex',justifyContent:'flex-end',gap:10,paddingTop:4}}>
                <Button variant="outline" onClick={()=>setModalPortal(false)}>Cancelar</Button>
                <Button
                  disabled={!portalInicio||!portalFim||portalInicio>portalFim}
                  onClick={()=>{fetchPortalPonto(portalInicio,portalFim,portalObraFiltro||undefined);setPortalStep('dados')}}
                  style={{background:'#1e3a5f',color:'#fff',gap:6}}>
                  🔍 Buscar Registros do Portal →
                </Button>
              </div>
            </div>
          )}

          {/* ── STEP 2: Dados ── */}
          {portalStep === 'dados' && (<>
            {/* Barra de ação */}
            <div style={{padding:'12px 22px',borderBottom:'1px solid var(--border)',display:'flex',gap:10,alignItems:'center',flexWrap:'wrap'}}>
              <button onClick={()=>setPortalStep('periodo')}
                style={{background:'none',border:'1px solid var(--border)',borderRadius:7,height:32,padding:'0 12px',cursor:'pointer',fontSize:12,color:'var(--muted-foreground)',display:'flex',alignItems:'center',gap:4}}>
                ← Alterar período
              </button>
              <span style={{fontSize:12,color:'var(--muted-foreground)',fontFamily:'monospace',fontWeight:600}}>
                {portalInicio.split('-').reverse().join('/')} → {portalFim.split('-').reverse().join('/')}
              </span>
              <div style={{flex:1,display:'flex',gap:6,flexWrap:'wrap',alignItems:'center'}}>
                {portalDados.filter(r=>!r.sincronizado_em).length>0&&<span style={{background:'#fef3c7',color:'#b45309',borderRadius:5,padding:'2px 8px',fontWeight:700,fontSize:12}}>⏳ {portalDados.filter(r=>!r.sincronizado_em).length} pendente(s)</span>}
                {portalDados.filter(r=>r.sincronizado_em).length>0&&<span style={{background:'#dcfce7',color:'#15803d',borderRadius:5,padding:'2px 8px',fontWeight:700,fontSize:12}}>✓ {portalDados.filter(r=>r.sincronizado_em).length} já importado(s)</span>}
                {progressoLote&&<span style={{fontSize:12,color:'#7c3aed',fontWeight:600}}>⏳ {progressoLote}</span>}
              </div>
              {portalDados.some(r=>!r.sincronizado_em)&&(
                <Button size="sm" onClick={criarTudoEmLote} disabled={criandoEmLote}
                  style={{gap:4,height:32,fontSize:12,background:criandoEmLote?'#94a3b8':'#15803d',color:'#fff',whiteSpace:'nowrap'}}>
                  {criandoEmLote?'⏳ Criando…':'⚡ Criar Tudo em Lote'}
                </Button>
              )}
            </div>

            {/* Barra de progresso do lote */}
            {criandoEmLote && progressoLoteNum.total > 0 && (()=>{
              const pct = Math.round((progressoLoteNum.feitos / progressoLoteNum.total) * 100)
              return (
                <div style={{padding:'8px 22px',borderBottom:'1px solid var(--border)',background:'#f0fdf4'}}>
                  <div style={{display:'flex',justifyContent:'space-between',marginBottom:4,fontSize:11,fontWeight:700,color:'#15803d'}}>
                    <span>⚡ Importando… {progressoLote.split('—')[1]?.trim() ?? ''}</span>
                    <span>{progressoLoteNum.feitos}/{progressoLoteNum.total} ({pct}%)</span>
                  </div>
                  <div style={{background:'#dcfce7',borderRadius:20,height:8,overflow:'hidden'}}>
                    <div style={{background:'#16a34a',height:'100%',borderRadius:20,width:`${pct}%`,transition:'width 0.3s ease'}}/>
                  </div>
                </div>
              )
            })()}

            {/* Tabela de registros */}
            <div style={{overflowY:'auto',flex:1,padding:'12px 22px 20px'}}>
              {loadingPortal?(
                <div style={{textAlign:'center',padding:40,color:'var(--muted-foreground)'}}>Buscando dados do portal…</div>
              ):portalDados.length===0?(
                <div style={{textAlign:'center',padding:40,color:'var(--muted-foreground)'}}>
                  <div style={{fontSize:32,marginBottom:8}}>📭</div>
                  Nenhum ponto lançado no portal para este período
                  <div style={{fontSize:12,marginTop:8}}>Verifique se o encarregado lançou pontos no aplicativo</div>
                </div>
              ):(()=>{
                // Agrupa por obra
                const obraIds = [...new Set(portalDados.map(r=>r.obra_id))]
                return obraIds.map(oId=>{
                  const nomeObra = obras.find(o=>o.id===oId)?.nome ?? oId.slice(0,8)
                  const regsObra = portalDados.filter(r=>r.obra_id===oId)
                  const pendObra = regsObra.filter(r=>!r.sincronizado_em).length
                  return(
                    <div key={oId} style={{marginBottom:20}}>
                      <div style={{display:'flex',alignItems:'center',gap:8,marginBottom:8}}>
                        <span style={{fontWeight:800,fontSize:13,color:'#1e3a5f'}}>🏗️ {nomeObra}</span>
                        {pendObra>0&&<span style={{background:'#fef3c7',color:'#b45309',borderRadius:5,padding:'1px 7px',fontSize:11,fontWeight:700}}>{pendObra} pendente{pendObra!==1?'s':''}</span>}
                      </div>
                      <table style={{width:'100%',borderCollapse:'collapse',fontSize:12}}>
                        <thead><tr style={{background:'var(--muted)'}}>
                          {['Data','Colaborador','Status','H+','H−','Obs','Situação',''].map(h=>(
                            <th key={h} style={{...TH,textAlign:'left',padding:'7px 8px'}}>{h}</th>
                          ))}
                        </tr></thead>
                        <tbody>
                          {regsObra.map(r=>{
                            const jaSync=!!r.sincronizado_em
                            const importing=importandoPortal.has(r.id)
                            const SC:Record<string,{bg:string;cor:string;label:string}>={
                              presente:{bg:'#dcfce7',cor:'#15803d',label:'Presente'},
                              falta:{bg:'#fee2e2',cor:'#dc2626',label:'Falta'},
                              meio_periodo:{bg:'#fef3c7',cor:'#b45309',label:'Meio Per.'},
                              falta_justificada:{bg:'#f3f4f6',cor:'#6b7280',label:'F.Justif.'},
                            }
                            const sc=SC[r.status]??{bg:'#f3f4f6',cor:'#374151',label:r.status}
                            const [y,m,d]=r.data.split('-')
                            return(
                              <tr key={r.id} style={{borderBottom:'1px solid var(--border)',background:jaSync?'var(--muted)':'var(--background)',opacity:importing?0.6:1}}>
                                <td style={{padding:'6px 8px',fontFamily:'monospace',fontWeight:700,fontSize:12}}>{d}/{m}</td>
                                <td style={{padding:'6px 8px',fontWeight:600,maxWidth:140,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{r.colab_nome}</td>
                                <td style={{padding:'6px 8px'}}><span style={{background:sc.bg,color:sc.cor,borderRadius:4,padding:'1px 5px',fontSize:10,fontWeight:700}}>{sc.label}</span></td>
                                <td style={{padding:'6px 8px',textAlign:'center',color:'#1d4ed8',fontWeight:700,fontSize:12}}>{r.horas_extra>0?`+${r.horas_extra}h`:'—'}</td>
                                <td style={{padding:'6px 8px',textAlign:'center',color:'#dc2626',fontWeight:700,fontSize:12}}>{r.horas_falta>0?`-${r.horas_falta}h`:'—'}</td>
                                <td style={{padding:'6px 8px',fontSize:10,color:'var(--muted-foreground)',maxWidth:100,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}} title={r.observacoes??''}>{r.observacoes||'—'}</td>
                                <td style={{padding:'6px 8px'}}>
                                  {jaSync?<span style={{background:'#dcfce7',color:'#15803d',borderRadius:4,padding:'1px 5px',fontSize:10,fontWeight:700}}>✓ Importado</span>
                                         :<span style={{background:'#fef3c7',color:'#b45309',borderRadius:4,padding:'1px 5px',fontSize:10,fontWeight:700}}>⏳ Pendente</span>}
                                </td>
                                <td style={{padding:'6px 8px'}}>
                                  {!jaSync&&(
                                    <button onClick={()=>importarDiaPortal(r.id,r.colaborador_id,r.data,r.status,r.horas_extra,r.horas_falta,r.observacoes,r.obra_id)} disabled={importing}
                                      style={{background:'#1e3a5f',color:'#fff',border:'none',borderRadius:5,padding:'3px 8px',fontSize:10,fontWeight:700,cursor:importing?'wait':'pointer',whiteSpace:'nowrap'}}>
                                      {importing?'…':'⬇'}
                                    </button>
                                  )}
                                </td>
                              </tr>
                            )
                          })}
                        </tbody>
                      </table>
                    </div>
                  )
                })
              })()}
            </div>
            <div style={{padding:'10px 22px',borderTop:'1px solid var(--border)',fontSize:11,color:'var(--muted-foreground)'}}>
              💡 <strong>"Criar Tudo em Lote"</strong> cria os lançamentos e os pontos diários automaticamente. Você só valida os dados no sistema.
            </div>
          </>)}
        </div>
      </div>
    )}
    {/* ─── Modal Portal: importação de Produções do Portal ─────────────── */}
    {modalPortalProd && (
      <div style={{position:'fixed',inset:0,background:'rgba(0,0,0,0.55)',zIndex:200,display:'flex',alignItems:'center',justifyContent:'center',padding:16}}>
        <div style={{background:'var(--background)',borderRadius:16,width:'100%',maxWidth:820,maxHeight:'92vh',display:'flex',flexDirection:'column',overflow:'hidden',boxShadow:'0 20px 60px rgba(0,0,0,0.3)'}}>

          {/* Header */}
          <div style={{padding:'18px 24px',borderBottom:'1px solid var(--border)',display:'flex',justifyContent:'space-between',alignItems:'center',background:'linear-gradient(135deg,#fffbeb,#fef3c7)'}}>
            <div>
              <div style={{fontWeight:800,fontSize:17,color:'#92400e'}}>📈 Importar Produções do Portal</div>
              <div style={{fontSize:12,color:'#b45309',marginTop:2}}>Selecione o período e importe as produções lançadas pelos encarregados</div>
            </div>
            <button onClick={()=>setModalPortalProd(false)} style={{background:'none',border:'none',fontSize:22,cursor:'pointer',color:'#b45309',lineHeight:1}}>✕</button>
          </div>

          {/* Filtros */}
          <div style={{padding:'14px 20px',borderBottom:'1px solid var(--border)',display:'flex',gap:12,flexWrap:'wrap',alignItems:'flex-end'}}>
            <div>
              <label style={{display:'block',fontSize:11,fontWeight:700,color:'#b45309',marginBottom:4,textTransform:'uppercase'}}>De</label>
              <input type="date" value={portalProdInicio} onChange={e=>setPortalProdInicio(e.target.value)}
                style={{height:36,border:'1px solid var(--border)',borderRadius:7,padding:'0 10px',fontSize:13,background:'var(--background)',color:'var(--foreground)'}}/>
            </div>
            <div>
              <label style={{display:'block',fontSize:11,fontWeight:700,color:'#b45309',marginBottom:4,textTransform:'uppercase'}}>Até</label>
              <input type="date" value={portalProdFim} onChange={e=>setPortalProdFim(e.target.value)}
                style={{height:36,border:'1px solid var(--border)',borderRadius:7,padding:'0 10px',fontSize:13,background:'var(--background)',color:'var(--foreground)'}}/>
            </div>
            <div style={{flex:1,minWidth:160}}>
              <label style={{display:'block',fontSize:11,fontWeight:700,color:'#b45309',marginBottom:4,textTransform:'uppercase'}}>Obra (opcional)</label>
              <select value={portalProdObraFiltro} onChange={e=>setPortalProdObraFiltro(e.target.value)}
                style={{width:'100%',height:36,border:'1px solid var(--border)',borderRadius:7,padding:'0 10px',fontSize:13,background:'var(--background)',color:'var(--foreground)'}}>
                <option value="">Todas as obras</option>
                {obras.map(o=><option key={o.id} value={o.id}>{o.nome}</option>)}
              </select>
            </div>
            <Button onClick={()=>fetchPortalProd(portalProdInicio,portalProdFim,portalProdObraFiltro||undefined)}
              disabled={!portalProdInicio||!portalProdFim||loadingPortalProd}
              style={{height:36,background:'#b45309',color:'#fff',fontWeight:700,gap:4}}>
              {loadingPortalProd?'Buscando…':'🔍 Buscar'}
            </Button>
          </div>

          {/* Conteúdo */}
          <div style={{flex:1,overflow:'auto',padding:'16px 20px'}}>
            {loadingPortalProd ? (
              <div style={{textAlign:'center',padding:40,color:'var(--muted-foreground)'}}>Buscando produções…</div>
            ) : portalProdDados.length === 0 ? (
              <div style={{background:'var(--muted)',borderRadius:12,padding:40,textAlign:'center',color:'var(--muted-foreground)'}}>
                <div style={{fontSize:32,marginBottom:8}}>📭</div>
                {portalProdInicio ? 'Nenhuma produção encontrada para o período' : 'Selecione o período e clique em Buscar'}
              </div>
            ) : (
              <>
                {/* Resumo + lote */}
                <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:12,flexWrap:'wrap',gap:8}}>
                  <div style={{display:'flex',gap:8,flexWrap:'wrap'}}>
                    {portalProdDados.filter(r=>!r.sincronizado_em).length>0&&<span style={{background:'#fef3c7',color:'#b45309',borderRadius:5,padding:'2px 8px',fontWeight:700,fontSize:12}}>⏳ {portalProdDados.filter(r=>!r.sincronizado_em).length} pendente(s)</span>}
                    {portalProdDados.filter(r=>r.sincronizado_em).length>0&&<span style={{background:'#dcfce7',color:'#15803d',borderRadius:5,padding:'2px 8px',fontWeight:700,fontSize:12}}>✓ {portalProdDados.filter(r=>r.sincronizado_em).length} importada(s)</span>}
                  </div>
                  {portalProdDados.some(r=>!r.sincronizado_em)&&(
                    <button onClick={criarProdLote} disabled={criandoProdLote}
                      style={{background:'#b45309',color:'#fff',border:'none',borderRadius:9,padding:'7px 16px',fontWeight:800,fontSize:12,cursor:'pointer',display:'flex',alignItems:'center',gap:6}}>
                      {criandoProdLote?'⏳ Importando…':'⚡ Importar Tudo em Lote'}
                    </button>
                  )}
                </div>

                {/* Tabela agrupada por obra */}
                {(()=>{
                  const obraIds = [...new Set(portalProdDados.map(r=>r.obra_id))]
                  return obraIds.map(oId=>{
                    const regs = portalProdDados.filter(r=>r.obra_id===oId)
                    const obraNome = regs[0]?.obra_nome ?? '—'
                    return(
                      <div key={oId} style={{marginBottom:16}}>
                        <div style={{fontWeight:800,fontSize:13,color:'#92400e',marginBottom:6,paddingBottom:4,borderBottom:'2px solid #fcd34d'}}>
                          🏗️ {obraNome} <span style={{fontWeight:400,color:'#b45309',fontSize:11}}>({regs.length} registro(s))</span>
                        </div>
                        <div style={{background:'var(--card)',border:'1px solid var(--border)',borderRadius:10,overflow:'hidden'}}>
                          <table style={{width:'100%',borderCollapse:'collapse',fontSize:12}}>
                            <thead>
                              <tr style={{background:'#fef3c7'}}>
                                <th style={{...TH,textAlign:'left',padding:'7px 12px'}}>Colaborador</th>
                                <th style={{...TH}}>Data</th>
                                <th style={{...TH}}>Serviço / Item</th>
                                <th style={{...TH}}>Qtde</th>
                                <th style={{...TH}}>Obs</th>
                                <th style={{...TH}}>Status</th>
                                <th style={{...TH}}></th>
                              </tr>
                            </thead>
                            <tbody>
                              {regs.map((reg,ri)=>{
                                const jaSync=!!reg.sincronizado_em
                                const imp=importandoPortalProd.has(reg.id)
                                return(
                                  <tr key={reg.id} style={{borderTop:ri>0?'1px solid var(--border)':'none',background:jaSync?'#f0fdf4':'#fff'}}>
                                    <td style={{...TD,padding:'7px 12px',fontWeight:600,color:'var(--foreground)'}}>{reg.colab_nome}</td>
                                    <td style={{...TD,textAlign:'center'}}>{reg.data.split('-').reverse().join('/')}</td>
                                    <td style={{...TD,textAlign:'center',color:'#92400e'}}>{reg.item_nome ?? <span style={{color:'#9ca3af',fontStyle:'italic'}}>—</span>}</td>
                                    <td style={{...TD,textAlign:'center',fontWeight:700,color:'#b45309'}}>{reg.quantidade}</td>
                                    <td style={{...TD,textAlign:'center',color:'#6b7280',fontSize:11}}>{reg.obs ?? '—'}</td>
                                    <td style={{...TD,textAlign:'center'}}>
                                      {jaSync
                                        ?<span style={{background:'#dcfce7',color:'#15803d',borderRadius:5,padding:'2px 6px',fontSize:11,fontWeight:700}}>✓</span>
                                        :<span style={{background:'#fef3c7',color:'#b45309',borderRadius:5,padding:'2px 6px',fontSize:11,fontWeight:700}}>⏳</span>}
                                    </td>
                                    <td style={{...TD,textAlign:'center'}}>
                                      {!jaSync&&(
                                        <button onClick={()=>importarPortalProd(reg)} disabled={imp}
                                          style={{background:'#1e3a5f',color:'#fff',border:'none',borderRadius:6,padding:'3px 10px',fontSize:11,fontWeight:700,cursor:'pointer',whiteSpace:'nowrap'}}>
                                          {imp?'⏳':'↓ Importar'}
                                        </button>
                                      )}
                                    </td>
                                  </tr>
                                )
                              })}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    )
                  })
                })()}
              </>
            )}
          </div>

          {/* Footer */}
          <div style={{padding:'12px 20px',borderTop:'1px solid var(--border)',display:'flex',justifyContent:'flex-end'}}>
            <button onClick={()=>setModalPortalProd(false)}
              style={{height:38,padding:'0 20px',border:'1px solid var(--border)',borderRadius:8,background:'var(--muted)',cursor:'pointer',fontWeight:600,fontSize:13}}>
              Fechar
            </button>
          </div>
        </div>
      </div>
    )}
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
