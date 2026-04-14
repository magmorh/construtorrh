import React, { useEffect, useState, useCallback, useMemo } from 'react'
import { useRefreshOnFocus } from '@/hooks/useRefreshOnFocus'
import { useNavigate } from 'react-router-dom'
import { supabase } from '@/lib/supabase'
import type { ValeTransporte, Colaborador } from '@/lib/supabase'
import { formatCurrency } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { toast } from 'sonner'
import { traduzirErro } from '@/lib/erros'
import { SummaryCard } from '@/components/Shared'
import {
  Bus, Plus, Pencil, Trash2, Search, ChevronLeft, ChevronRight,
  CheckCircle2, AlertCircle, X, ToggleLeft, ToggleRight,
  CreditCard, Building2, CheckSquare, Square, Loader2, FileText,
} from 'lucide-react'
import { getUltimoDia } from '@/lib/dateUtils'

// ─── tipos ───────────────────────────────────────────────────────────────────
type ColaboradorVT = Pick<Colaborador, 'id' | 'nome' | 'chapa' | 'salario' | 'vt_dados'> & {
  obra_id: string | null; obra_nome?: string; funcao_nome?: string
  tipo_contrato?: string | null
  valor_hora_calc?: number | null
  salario_mensal_calc?: number | null
  data_admissao?: string | null   // data de início dos trabalhos
  vt_valor_diario?: number | null // valor diário do VT (para lote)
  vt_tipo?: string | null         // tipo do VT (cartao, dinheiro, etc.)
  pix_chave?: string | null
  pix_tipo?: string | null
}
type VTRow = ValeTransporte & { colaboradores?: ColaboradorVT }
type FormData = {
  competencia: string
  data_inicio: string
  data_fim: string
  contar_sabado: boolean      // tick: contar sábado nos dias trabalhados?
  tipo: string
  valor: string
  dias_trabalhados: string
  num_faltas: string          // nº de faltas a descontar do VT
  num_sabados_extras: string  // nº de sábados trabalhados a adicionar (se obra NÃO considera sáb útil)
  desconto_colaborador: string
  valor_empresa: string
  descontar_6pct: boolean
  observacoes: string
  // breakdown de cálculo (somente UI — não persistidos)
  _valorTotalDias?: number    // valor bruto antes de descontar faltas
  _valorDescFalta?: number    // desconto por faltas (dias × VT/dia)
  _valorSabExtra?: number     // adicional sábados trabalhados
}

const TIPO_OPTIONS = [
  { value: 'cartao',        label: 'Cartão' },
  { value: 'bilhete_unico', label: 'Bilhete Único' },
  { value: 'dinheiro',      label: 'Dinheiro' },
  { value: 'combustivel',   label: 'Combustível' },
  { value: 'gasolina',      label: 'Gasolina' },
]

// mapeamento da modalidade do colaborador → tipo do select
function modalidadeParaTipo(modalidade: string | undefined): string {
  if (!modalidade) return 'cartao'
  if (modalidade === 'gasolina') return 'gasolina'
  if (modalidade === 'bilhete_unico') return 'bilhete_unico'
  if (modalidade === 'dinheiro') return 'dinheiro'
  return 'cartao'
}

const MAX_PARCELAS_MES = 5

// ─── helpers de data ─────────────────────────────────────────────────────────
function diasNoMes(competencia: string) {
  const [ano, mes] = competencia.split('-').map(Number)
  return new Date(ano, mes, 0).getDate()
}
function primeiroDia(comp: string) { return `${comp}-01` }
function ultimoDia(comp: string) {
  const [ano, mes] = comp.split('-').map(Number)
  return `${comp}-${String(new Date(ano, mes, 0).getDate()).padStart(2, '0')}`
}
function fmtData(d: string | null | undefined) {
  if (!d) return '—'
  return d.slice(8) + '/' + d.slice(5, 7) + '/' + d.slice(0, 4)
}
function fmtMes(competencia: string) {
  const meses = ['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez']
  const [ano, mes] = competencia.split('-')
  return `${meses[parseInt(mes) - 1]}/${ano}`
}

/**
 * Conta dias úteis entre duas datas (inclusive).
 * Se contarSabado = true, conta Seg→Sáb; caso contrário Seg→Sex.
 */
function contarDiasUteis(dataIni: string, dataFim: string, contarSabado: boolean): number {
  if (!dataIni || !dataFim) return 0
  const ini = new Date(dataIni + 'T12:00:00')
  const fim = new Date(dataFim + 'T12:00:00')
  if (fim < ini) return 0
  let count = 0
  const cur = new Date(ini)
  while (cur <= fim) {
    const dow = cur.getDay() // 0=dom, 6=sab
    if (dow !== 0) {          // exclui domingo sempre
      if (contarSabado || dow !== 6) count++
    }
    cur.setDate(cur.getDate() + 1)
  }
  return count
}

/**
 * Calcula o valor VT proporcional ao período.
 * Usa dias úteis do período / dias úteis do mês inteiro.
 */
function calcValorProporcional(
  vtMensal: number,
  dataIni: string,
  dataFim: string,
  comp: string,
  contarSabado: boolean
): number {
  if (!vtMensal || !dataIni || !dataFim) return 0
  const diasMes    = contarDiasUteis(primeiroDia(comp), ultimoDia(comp), contarSabado)
  const diasPeriod = contarDiasUteis(dataIni, dataFim, contarSabado)
  if (diasMes === 0) return 0
  return (vtMensal / diasMes) * diasPeriod
}

// Extrai valor diário do VT do colaborador
function vtDiarioColab(vtDados: any): number {
  if (!vtDados) return 0
  if (vtDados.modalidade === 'gasolina') return vtDados.gasolina_valor_dia ?? 0
  const ida   = (vtDados.trechos_ida   ?? []).reduce((s: number, t: any) => s + (parseFloat(t.valor) || 0), 0)
  const volta = (vtDados.trechos_volta ?? []).reduce((s: number, t: any) => s + (parseFloat(t.valor) || 0), 0)
  return ida + volta
}

// Calcula valor mensal do VT (diário × dias úteis do mês)
function vtMensalColab(colab: ColaboradorVT, comp: string, contarSabado: boolean): number {
  const d = colab.vt_dados as any
  if (!d || !colab.vt_dados) return 0
  // Se existe campo valor_mensal direto, usa ele
  if (d.valor_mensal) return d.valor_mensal
  const diario = vtDiarioColab(d)
  if (!diario) return 0
  const diasMes = contarDiasUteis(primeiroDia(comp), ultimoDia(comp), contarSabado)
  return diario * diasMes
}

// ─── componente ──────────────────────────────────────────────────────────────
export default function ValeTransportePage() {
  const hoje = new Date()
  const navigate = useNavigate()
  const [ano, setAno]       = useState(hoje.getFullYear())
  const [mes, setMes]       = useState(hoje.getMonth() + 1)
  const [busca, setBusca]   = useState('')
  const [obraFiltro, setObraFiltro] = useState('todas')
  const [statusFiltro, setStatusFiltro] = useState<'todos'|'sem'|'parcial'|'completo'>('todos')

  const [colaboradores, setColaboradores] = useState<ColaboradorVT[]>([])
  const [obras, setObras]   = useState<{id:string;nome:string;considera_sabado_util?:boolean|null;desconta_vt?:boolean}[]>([])
  const [vtRows, setVtRows] = useState<VTRow[]>([])
  const [loading, setLoading] = useState(true)
  const [colabSel, setColabSel] = useState<ColaboradorVT | null>(null)

  const [modalOpen, setModalOpen] = useState(false)
  const [editando, setEditando]   = useState<VTRow | null>(null)
  const [form, setForm]           = useState<FormData>(emptyForm())
  const [saving, setSaving]       = useState(false)
  const [deleteId, setDeleteId]   = useState<string | null>(null)
  // Taxa diária "congelada" no momento do lançamento — usada ao editar para não recalcular da base atual
  const [vtDiarioSnap, setVtDiarioSnap] = useState<number | null>(null)

  // ── Pagar VT individual ──────────────────────────────────────────────────
  const [pagarId, setPagarId]     = useState<string | null>(null)
  const [savingPagar, setSavingPagar] = useState(false)

  // ── Relatório de Fechamento ────────────────────────────────────────────────
  const [showRelatorio, setShowRelatorio] = useState(false)
  // Controla se faltas e sábado foram preenchidos automaticamente (bloqueio de edição)
  const [faltasAutoDetectadas, setFaltasAutoDetectadas] = useState(0)
  const [sabadoDaObra,         setSabadoDaObra]         = useState(false)

  // ── Fechamento em lote por obra ──────────────────────────────────────────
  const [modalLote, setModalLote]   = useState(false)
  const [obraLote, setObraLote]   = useState('todas')
  const [selecionados, setSelecionados] = useState<Set<string>>(new Set())
  const [savingLote, setSavingLote] = useState(false)
  // Config global do lote (exibidas no modal)
  const [loteContarSabado, setLoteContarSabado] = useState(false)
  // ── Lançar em Lote (novo fluxo completo) ─────────────────────────────────
  const [modalLancarLote, setModalLancarLote] = useState(false)
  const [savingLancarLote, setSavingLancarLote] = useState(false)
  // passo 1 = escolha de obra, passo 2 = lista de colaboradores
  const [loteStep, setLoteStep] = useState<1|2>(1)
  const [loteObraSel, setLoteObraSel] = useState<string>('todas')
  const [loteInicio, setLoteInicio] = useState('')
  const [loteFim, setLoteFim] = useState('')
  const [loteContarSabadoLancar, setLoteContarSabadoLancar] = useState(false)
  // Map colaboradorId → incluir (true) ou excluir (false)
  const [loteIncluir, setLoteIncluir] = useState<Map<string,boolean>>(new Map())

  const competencia = `${ano}-${String(mes).padStart(2, '0')}`

  function emptyForm(): FormData {
    const comp = `${hoje.getFullYear()}-${String(hoje.getMonth() + 1).padStart(2, '0')}`
    return {
      competencia: comp,
      data_inicio: primeiroDia(comp),
      data_fim:    ultimoDia(comp),
      contar_sabado: false,
      tipo: 'cartao',
      valor: '',
      dias_trabalhados: '',
      num_faltas: '0',
      num_sabados_extras: '0',
      desconto_colaborador: '',
      valor_empresa: '',
      descontar_6pct: false,
      observacoes: '',
    }
  }

  // ─── fetch ─────────────────────────────────────────────────────────────────
  const fetchData = useCallback(async () => {
    setLoading(true)
    const [colRes, obraRes, vtRes] = await Promise.all([
      supabase
        .from('colaboradores')
        .select('id,nome,chapa,salario,vt_dados,obra_id,tipo_contrato,funcao_id,data_admissao,pix_chave,pix_tipo,funcoes(nome,valor_hora_clt,valor_hora_autonomo),obras(nome)')
        .eq('status', 'ativo')
        .order('nome'),
      supabase.from('obras').select('id,nome,considera_sabado_util,desconta_vt').order('nome'),
      supabase
        .from('vale_transporte')
        .select('*,colaboradores(id,nome,chapa,salario,vt_dados)')
        .order('competencia', { ascending: false }),
    ])
    if (colRes.data) {
      setColaboradores(colRes.data.map((c: any) => {
        const tipo = c.tipo_contrato ?? 'clt'
        const vh = tipo === 'clt'
          ? (c.funcoes?.valor_hora_clt ?? null)
          : (c.funcoes?.valor_hora_autonomo ?? null)
        return {
          ...c,
          obra_nome: c.obras?.nome ?? '',
          funcao_nome: c.funcoes?.nome ?? '',
          valor_hora_calc: vh,
          salario_mensal_calc: vh != null ? vh * 220 : (c.salario ?? null),
          data_admissao: c.data_admissao ?? null,
          vt_valor_diario: vtDiarioColab(c.vt_dados),
          vt_tipo: (c.vt_dados as any)?.tipo ?? ((c.vt_dados as any)?.modalidade === 'gasolina' ? 'combustivel' : 'cartao'),
          pix_chave: (c as any).pix_chave ?? null,
          pix_tipo: (c as any).pix_tipo ?? null,
        }
      }))
    }
    // Obras: usar resultado direto; fallback via colaboradores se RLS bloquear
    if (obraRes.data && obraRes.data.length > 0) {
      setObras(obraRes.data.map((o: any) => ({ ...o, considera_sabado_util: o.considera_sabado_util ?? null, desconta_vt: o.desconta_vt ?? false })))
    } else if (colRes.data) {
      // Extrair obras únicas dos colaboradores como fallback
      const obrasMap = new Map<string,{id:string;nome:string;considera_sabado_util:boolean|null;desconta_vt:boolean}>()
      colRes.data.forEach((c: any) => {
        if (c.obra_id && c.obras?.nome && !obrasMap.has(c.obra_id))
          obrasMap.set(c.obra_id, { id: c.obra_id, nome: c.obras.nome, considera_sabado_util: null, desconta_vt: false })
      })
      if (obrasMap.size > 0) setObras([...obrasMap.values()].sort((a,b)=>a.nome.localeCompare(b.nome)))
    }
    if (vtRes.data)   setVtRows(vtRes.data as VTRow[])
    setLoading(false)
  }, [])

  useEffect(() => { fetchData() }, [fetchData])
  useRefreshOnFocus(fetchData)

  // ─── VT do colaborador selecionado no mês ─────────────────────────────────
  const vtDoColab = useMemo(() =>
    colabSel ? vtRows.filter(r => r.colaborador_id === colabSel.id && r.competencia === competencia) : []
  , [colabSel, vtRows, competencia])

  // ─── Dias úteis (seg-sex) do mês ─────────────────────────────────────────
  const diasUteisMes = useMemo(() => {
    const ini = new Date(primeiroDia(competencia) + 'T12:00:00')
    const fim = new Date(ultimoDia(competencia)   + 'T12:00:00')
    const dias: string[] = []
    const cur = new Date(ini)
    while (cur <= fim) {
      const dow = cur.getDay()
      if (dow >= 1 && dow <= 5) dias.push(cur.toISOString().slice(0, 10))
      cur.setDate(cur.getDate() + 1)
    }
    return dias
  }, [competencia])

  function statusVTColab(colabId: string): 'sem' | 'parcial' | 'completo' {
    const regs = vtRows.filter(r => r.colaborador_id === colabId && r.competencia === competencia)
    if (regs.length === 0) return 'sem'
    // Expande todos os intervalos lançados e verifica se cobrem todos os dias úteis
    const diasCobertos = new Set<string>()
    regs.forEach(r => {
      if (r.data_inicio && r.data_fim) {
        expandirIntervalo(r.data_inicio, r.data_fim).forEach(d => diasCobertos.add(d))
      }
    })
    const todosUteisCobertos = diasUteisMes.every(d => diasCobertos.has(d))
    return todosUteisCobertos ? 'completo' : 'parcial'
  }

  function podeNovoVT(colabId: string): { pode: boolean; motivo?: string } {
    const regs = vtRows.filter(r => r.colaborador_id === colabId && r.competencia === competencia)
    if (regs.length >= MAX_PARCELAS_MES) return { pode: false, motivo: `Limite de ${MAX_PARCELAS_MES} lançamentos/mês atingido` }
    if (statusVTColab(colabId) === 'completo') return { pode: false, motivo: 'VT do mês completo já lançado (todos os dias úteis cobertos)' }
    return { pode: true }
  }

  // Retorna todos os dias (YYYY-MM-DD) dentro de um intervalo
  function expandirIntervalo(ini: string, fim: string): string[] {
    const dias: string[] = []
    const cur = new Date(ini + 'T12:00:00')
    const end = new Date(fim + 'T12:00:00')
    while (cur <= end) {
      dias.push(cur.toISOString().split('T')[0])
      cur.setDate(cur.getDate() + 1)
    }
    return dias
  }

  // Verifica sobreposição de período com lançamentos existentes (exclui o próprio ao editar)
  function validarSobreposicao(ini: string, fim: string, excluirId?: string): string | null {
    const regs = vtRows.filter(r =>
      r.colaborador_id === colabSel?.id &&
      r.competencia === competencia &&
      r.id !== excluirId &&
      r.data_inicio && r.data_fim
    )
    if (regs.length === 0) return null
    const diasNovos = new Set(expandirIntervalo(ini, fim))
    for (const r of regs) {
      const conflitos = expandirIntervalo(r.data_inicio!, r.data_fim!).filter(d => diasNovos.has(d))
      if (conflitos.length > 0) {
        const periodoExist = `${new Date(r.data_inicio!+'T12:00:00').toLocaleDateString('pt-BR')} → ${new Date(r.data_fim!+'T12:00:00').toLocaleDateString('pt-BR')}`
        return `Período conflita com lançamento existente (${periodoExist}) — ${conflitos.length} dia(s) sobrepostos`
      }
    }
    return null
  }

  // ─── recalcula valor+dias ao mudar período/tick sábado ────────────────────
  // vtDiarioFixo: se informado (modo edição), usa essa taxa em vez de buscar do cadastro atual
  // numFaltas: dias de falta a descontar do VT
  // numSabadosExtras: sábados trabalhados a adicionar (quando obra NÃO considera sáb no cálculo padrão)
  // desconta_vt é lido diretamente da obra do colaborador — sem parâmetro manual
  function recalcularPeriodo(
    dataIni: string, dataFim: string, contarSab: boolean,
    comp: string, colab: ColaboradorVT | null,
    vtDiarioFixo?: number | null,
    numFaltas = 0,
    numSabadosExtras = 0
  ) {
    const diasUtil = contarDiasUteis(dataIni, dataFim, contarSab)
    let vtDiario = 0
    if (vtDiarioFixo != null && vtDiarioFixo > 0) {
      vtDiario = vtDiarioFixo
    } else {
      const vtMen = colab ? vtMensalColab(colab, comp, contarSab) : 0
      const diasMes = contarDiasUteis(primeiroDia(comp), ultimoDia(comp), contarSab)
      vtDiario = diasMes > 0 && vtMen > 0 ? vtMen / diasMes : vtDiarioColab(colab?.vt_dados as any)
    }
    // dias efetivos = dias úteis do período - faltas + sábados extras trabalhados
    const diasSemFalta   = Math.max(0, diasUtil - numFaltas)               // dias base - faltas
    const diasEfetivos   = Math.max(0, diasSemFalta + numSabadosExtras)    // + sábados extras
    const valorTotalDias = vtDiario > 0 ? +(vtDiario * diasUtil).toFixed(2)           : 0  // valor SEM ajuste
    const valorDescFalta = vtDiario > 0 ? +(vtDiario * Math.max(0, numFaltas)).toFixed(2) : 0 // desconto faltas
    const valorSabExtra  = vtDiario > 0 ? +(vtDiario * numSabadosExtras).toFixed(2)   : 0  // adicional sáb
    const valorBruto     = vtDiario > 0 ? +(vtDiario * diasEfetivos).toFixed(2) : 0

    // Desconto de 6%: somente CLT E se a obra do colaborador tem desconta_vt=true
    const isCLT = (colab?.tipo_contrato ?? 'clt').toLowerCase() === 'clt'
    const obraDoColab = obras.find(o => o.id === colab?.obra_id)
    const obraDesconta = obraDoColab?.desconta_vt ?? false
    const desc6 = (obraDesconta && isCLT) ? +Math.min((colab?.salario ?? 0) * 0.06, valorBruto).toFixed(2) : 0
    return {
      dias_trabalhados:     String(diasEfetivos),
      valor:                String(valorBruto),
      desconto_colaborador: String(desc6),
      valor_empresa:        String(+(valorBruto - desc6).toFixed(2)),
      descontar_6pct:       obraDesconta && isCLT,
      // campos extras de breakdown (não persistidos, só UI)
      _valorTotalDias:      valorTotalDias,
      _valorDescFalta:      valorDescFalta,
      _valorSabExtra:       valorSabExtra,
    }
  }

  // ─── lista lateral filtrada ───────────────────────────────────────────────
  const colabsFiltrados = useMemo(() => colaboradores.filter(c => {
    // Ocultar colaborador se ainda não admitido no mês da competência
    if (c.data_admissao) {
      const ultimoDiaMes = `${getUltimoDia(competencia)}`
      if (c.data_admissao > ultimoDiaMes) return false
    }
    if (obraFiltro !== 'todas' && c.obra_id !== obraFiltro) return false
    if (statusFiltro !== 'todos' && statusVTColab(c.id) !== statusFiltro) return false
    if (busca) {
      const b = busca.toLowerCase()
      return c.nome.toLowerCase().includes(b) || (c.chapa ?? '').toLowerCase().includes(b)
    }
    return true
  }), [colaboradores, busca, obraFiltro, statusFiltro, competencia, vtRows])

  // ─── abrir modal ──────────────────────────────────────────────────────────
  async function openCreate() {
    if (!colabSel) return
    const { pode, motivo } = podeNovoVT(colabSel.id)
    if (!pode) { toast.error(motivo); return }

    // Bloquear VT antes da data de admissão
    if (colabSel.data_admissao && ultimoDia(competencia) < colabSel.data_admissao) {
      const admFmt = new Date(colabSel.data_admissao + 'T12:00:00').toLocaleDateString('pt-BR')
      toast.error(`${colabSel.nome} só pode ter VT a partir de ${admFmt} (data de admissão)`)
      return
    }

    const vtDados    = colabSel.vt_dados as any
    const tipoAuto   = modalidadeParaTipo(vtDados?.modalidade)
    // Puxar sábado da obra — se marcado na obra, toggle fica true e bloqueado
    const obraColab  = obras.find(o => o.id === colabSel.obra_id)
    const contarSab  = !!(obraColab?.considera_sabado_util ?? true)

    // ── Buscar faltas reais do ponto no período ───────────────────────────
    // registro_ponto usa lancamento_id como FK (não colaborador_id direto)
    // Então: ponto_lancamentos → registro_ponto
    const mesIni = primeiroDia(competencia)
    const mesFim = ultimoDia(competencia)

    let faltasReais = 0
    try {
      // 1. Busca lançamentos do colaborador na competência
      const { data: lancsColab } = await supabase
        .from('ponto_lancamentos')
        .select('id')
        .eq('colaborador_id', colabSel.id)
        .eq('mes_referencia', competencia)

      if (lancsColab && lancsColab.length > 0) {
        const lancIds = lancsColab.map((l: any) => l.id)
        // 2. Busca dias com falta=true nesses lançamentos
        const { data: diasFalta } = await supabase
          .from('registro_ponto')
          .select('data')
          .in('lancamento_id', lancIds)
          .eq('falta', true)
          .gte('data', mesIni)
          .lte('data', mesFim)

        // Deduplicar por data
        const datasUnicas = new Set((diasFalta ?? []).map((r: any) => r.data))
        faltasReais = datasUnicas.size
      }
    } catch (_) {
      // Se falhar, deixa 0 — usuário ajusta manualmente
    }

    const calc = recalcularPeriodo(mesIni, mesFim, contarSab, competencia, colabSel, null, faltasReais, 0)

    setFaltasAutoDetectadas(faltasReais)
    setSabadoDaObra(contarSab)
    setEditando(null)
    setVtDiarioSnap(null)
    setForm({
      competencia,
      data_inicio:  primeiroDia(competencia),
      data_fim:     ultimoDia(competencia),
      contar_sabado: contarSab,
      tipo:         tipoAuto,
      num_faltas: String(faltasReais),
      num_sabados_extras: '0',
      ...calc,
      observacoes: '',
    })
    setModalOpen(true)
  }

  function openEdit(row: VTRow) {
    setFaltasAutoDetectadas(0)  // edição: faltas não bloqueadas
    setSabadoDaObra(false)      // edição: sábado não bloqueado
    // Calcula e congela a taxa diária do lançamento original
    // vtDiario_snap = valor ÷ dias (taxa usada no lançamento original)
    const diasSalvos = row.dias_trabalhados ?? 0
    const valorSalvo = row.valor ?? 0
    const taxaDiaria = diasSalvos > 0 ? valorSalvo / diasSalvos : null
    setVtDiarioSnap(taxaDiaria)
    setEditando(row)
    setForm({
      competencia:   row.competencia,
      data_inicio:   row.data_inicio ?? primeiroDia(row.competencia),
      data_fim:      row.data_fim    ?? ultimoDia(row.competencia),
      contar_sabado: false,
      tipo:          row.tipo ?? 'cartao',
      valor:         String(valorSalvo),
      dias_trabalhados: String(diasSalvos),
      num_faltas: '0',
      num_sabados_extras: '0',
      desconto_colaborador: String(row.desconto_colaborador ?? '0'),
      valor_empresa: String(row.valor_empresa ?? valorSalvo),
      descontar_6pct: row.descontar_6pct ?? false,
      observacoes:   row.observacoes ?? '',
    })
    setModalOpen(true)
  }

  // ─── setField: qualquer mudança recalcula ─────────────────────────────────
  function setField(key: keyof FormData, value: string | boolean) {
    setForm(prev => {
      const next = { ...prev, [key]: value }

      // Mudanças que recalculam tudo (período, tick sábado, faltas, sábados extras)
      if (key === 'data_inicio' || key === 'data_fim' || key === 'contar_sabado' || key === 'num_faltas' || key === 'num_sabados_extras') {
        const ini     = key === 'data_inicio'    ? String(value) : next.data_inicio
        const fim     = key === 'data_fim'       ? String(value) : next.data_fim
        const contSab = key === 'contar_sabado'  ? Boolean(value) : next.contar_sabado
        const faltas  = parseInt(key === 'num_faltas' ? String(value) : next.num_faltas) || 0
        const sabExt  = parseInt(key === 'num_sabados_extras' ? String(value) : next.num_sabados_extras) || 0
        // Em modo edição: usa taxa diária congelada do lançamento original (vtDiarioSnap)
        // Em novo lançamento: usa base atual do colaborador (vtDiarioSnap = null)
        const calc    = recalcularPeriodo(ini, fim, contSab, next.competencia, colabSel, vtDiarioSnap, faltas, sabExt)
        return { ...next, ...calc }
      }

      // Recalcula valor_empresa ao editar valor (apenas internamente via recalcularPeriodo)
      // Os campos valor e desconto_colaborador não têm mais input manual — bloco mantido apenas para segurança
      if (key === 'valor') {
        const valor    = parseFloat(String(value)) || 0
        const desconto = parseFloat(next.desconto_colaborador) || 0
        return { ...next, valor_empresa: Math.max(0, valor - desconto).toFixed(2) }
      }

      return next
    })
  }

  // ─── save ─────────────────────────────────────────────────────────────────
  async function handleSave() {
    if (!colabSel) return
    if (!form.data_inicio || !form.data_fim) return toast.error('Período obrigatório')
    // Bloquear se o período iniciar antes da admissão
    if (colabSel.data_admissao && form.data_inicio < colabSel.data_admissao) {
      const admFmt = new Date(colabSel.data_admissao + 'T12:00:00').toLocaleDateString('pt-BR')
      return toast.error(`Período não pode ser anterior à admissão de ${colabSel.nome} (${admFmt})`)
    }
    // Bloquear sobreposição de períodos
    const erroSobreposicao = validarSobreposicao(form.data_inicio, form.data_fim, editando?.id)
    if (erroSobreposicao) return toast.error(erroSobreposicao)
    setSaving(true)
    // valor_diario = taxa diária (usada para calcular desconto_falta na exibição)
    // dias_uteis   = dias úteis totais do período (antes de descontar faltas)
    const vtDiarioSave = vtDiarioSnap != null ? vtDiarioSnap
      : (colabSel ? vtDiarioColab(colabSel.vt_dados as any) : 0)
    const diasTrabalhados = parseInt(form.dias_trabalhados) || 0
    const numFaltasSave   = parseInt(form.num_faltas) || 0
    const diasUteisSave   = diasTrabalhados + numFaltasSave  // total sem desconto de falta
    const payload = {
      colaborador_id: colabSel.id,
      competencia:    form.competencia,
      data_inicio:    form.data_inicio || null,
      data_fim:       form.data_fim    || null,
      tipo: (form.tipo as ValeTransporte['tipo']) || null,
      valor: parseFloat(form.valor) || null,
      dias_trabalhados: diasTrabalhados,
      dias_uteis:       diasUteisSave,           // total do período (para calcular desc falta)
      valor_diario:     vtDiarioSave || null,     // taxa diária (para recalcular desc falta)
      desconto_colaborador: parseFloat(form.desconto_colaborador) || null,
      valor_empresa: parseFloat(form.valor_empresa) || null,
      descontar_6pct: form.descontar_6pct,
      observacoes: form.observacoes || null,
    }
    const { error } = editando
      ? await supabase.from('vale_transporte').update(payload).eq('id', editando.id)
      : await supabase.from('vale_transporte').insert(payload)
    setSaving(false)
    if (error) {
      console.error('[VT save error]', error)
      toast.error(error.message || 'Erro ao salvar. Verifique o console.')
      return
    }
    toast.success(editando ? 'VT atualizado!' : 'VT lançado!')
    setModalOpen(false)
    fetchData()
  }

  async function handleDelete() {
    if (!deleteId) return
    const { error } = await supabase.from('vale_transporte').delete().eq('id', deleteId)
    setDeleteId(null)
    if (error) toast.error(traduzirErro(error.message))
    else { toast.success('Registro excluído!'); fetchData() }
  }

  // ─── pagar VT individual ─────────────────────────────────────────────────
  async function handlePagar() {
    if (!pagarId) return
    const row = vtRows.find(r => r.id === pagarId)
    if (!row) return
    const colab = colaboradores.find(c => c.id === row.colaborador_id)
    setSavingPagar(true)

    // 1. Criar registro em pagamentos com status PENDENTE
    const valorEmpresa = row.valor_empresa ?? row.valor ?? 0
    const { error: errPag } = await supabase.from('pagamentos').insert({
      colaborador_id:  row.colaborador_id,
      obra_id:         colab?.obra_id ?? null,
      competencia:     row.competencia,
      tipo:            'vale_transporte',
      valor_bruto:     valorEmpresa,
      inss:            0,
      fgts:            0,
      ir:              0,
      vale_transporte: valorEmpresa,
      adiantamento:    0,
      valor_liquido:   valorEmpresa,
      status:          'pendente',
      observacoes:     `VT ${row.data_inicio ?? ''} → ${row.data_fim ?? ''} | ${row.tipo ?? ''}`,
    })

    if (errPag) {
      setSavingPagar(false)
      toast.error(`Erro ao registrar em Pagamentos: ${errPag.message}`)
      return
    }

    // 2. Só muda status do VT se o pagamento foi criado com sucesso
    const { error: errVT } = await supabase
      .from('vale_transporte')
      .update({ status: 'aguardando_pagamento' })
      .eq('id', pagarId)
    setSavingPagar(false)
    setPagarId(null)
    if (errVT) {
      toast.error(`Pagamento criado, mas erro ao atualizar VT: ${errVT.message}`)
    } else {
      toast.success('📋 VT enviado para Pagamentos — confirme o pagamento lá!')
    }
    fetchData()
    navigate('/pagamentos')
  }

  // ─── fechamento em lote por obra ─────────────────────────────────────────
  const vtsPendentesLote = useMemo(() => {
    return vtRows.filter(r => {
      if (r.competencia !== competencia) return false
      const st = r.status as string | undefined
      if (st === 'pago' || st === 'aguardando_pagamento') return false
      if (obraLote === 'todas') return true
      const colab = colaboradores.find(c => c.id === r.colaborador_id)
      return colab?.obra_id === obraLote
    })
  }, [vtRows, competencia, obraLote, colaboradores])

  function toggleSel(id: string) {
    setSelecionados(prev => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  function toggleAll() {
    const ids = vtsPendentesLote.map(r => r.id)
    if (ids.every(id => selecionados.has(id))) {
      setSelecionados(prev => { const n = new Set(prev); ids.forEach(id => n.delete(id)); return n })
    } else {
      setSelecionados(prev => { const n = new Set(prev); ids.forEach(id => n.add(id)); return n })
    }
  }

  // ── abre o modal "Lançar em Lote" no passo 1 ──────────────────────────────
  function openLancarLote() {
    const ini = primeiroDia(competencia)
    const fim = ultimoDia(competencia)
    setLoteInicio(ini)
    setLoteFim(fim)
    // Pré-seleciona a obra conforme filtro lateral (se não for "todas", usa a obra filtrada)
    setLoteObraSel(obraFiltro !== 'todas' ? obraFiltro : 'todas')
    setLoteStep(1)
    setLoteIncluir(new Map())
    setModalLancarLote(true)
  }

  // ── passo 1 → passo 2: montar lista de colaboradores ─────────────────────
  function loteAvancar() {
    const map = new Map<string,boolean>()
    colaboradores.forEach(c => {
      if (loteObraSel !== 'todas' && c.obra_id !== loteObraSel && !(loteObraSel === '__sem_obra' && !c.obra_id)) return
      if (loteObraSel === '__sem_obra' && c.obra_id) return
      map.set(c.id, true) // todos marcados por padrão
    })
    setLoteIncluir(map)
    setLoteStep(2)
  }

  // ── colaboradores para o passo 2 (filtro por obra selecionada) ────────────
  const loteColabs = colaboradores.filter(c => {
    if (loteObraSel === 'todas') return true
    if (loteObraSel === '__sem_obra') return !c.obra_id
    return c.obra_id === loteObraSel
  })

  // ── confirmar lançamento em lote ──────────────────────────────────────────
  async function handleLancarLote() {
    const selecionadosIds = [...loteIncluir.entries()].filter(([,v]) => v).map(([k]) => k)
    const colabsAptos = loteColabs.filter(c =>
      selecionadosIds.includes(c.id) && vtDiarioColab(c.vt_dados as any) > 0
    )
    if (colabsAptos.length === 0) {
      toast.error('Nenhum colaborador apto selecionado (verifique se têm VT configurado)')
      return
    }
    setSavingLancarLote(true)

    // Calcular inserts por colaborador, descontando dias já cobertos por VT existente
    const inserts: object[] = []
    for (const c of colabsAptos) {
      const isCLT = (c.tipo_contrato ?? '').toLowerCase() === 'clt'
      // Dias já cobertos por VT existente deste colaborador nesta competência
      const vtExistentes = vtRows.filter(r =>
        r.colaborador_id === c.id &&
        r.competencia === competencia &&
        r.data_inicio && r.data_fim
      )
      const diasJaCobertos = new Set<string>()
      vtExistentes.forEach(r => {
        expandirIntervalo(r.data_inicio!, r.data_fim!).forEach(d => diasJaCobertos.add(d))
      })

      // Calcular dias úteis do período solicitado MENOS os já cobertos
      const todosDiasPeriodo = expandirIntervalo(loteInicio, loteFim)
      const diasNovos = todosDiasPeriodo.filter(d => {
        if (diasJaCobertos.has(d)) return false  // já foi lançado
        const dow = new Date(d + 'T12:00:00').getDay()
        if (dow === 0) return false               // exclui domingo sempre
        if (dow === 6 && !loteContarSabadoLancar) return false  // sábado: só conta se opção ativada
        return true
      })

      if (diasNovos.length === 0) continue  // collaborador já tem VT completo no período

      // Período efetivo: do primeiro ao último dia novo
      const dataIniNova = diasNovos[0]
      const dataFimNova = diasNovos[diasNovos.length - 1]
      const qtdDias = diasNovos.length

      const vtDiario = vtDiarioColab(c.vt_dados as any)
      const valorBruto = +(vtDiario * qtdDias).toFixed(2)
      const salarioBruto = c.salario ?? 0
      // Desconto 6%: somente CLT E se a obra do colaborador tem desconta_vt=true
      const obraDoColab = obras.find(o => o.id === c.obra_id)
      const obraDesconta = obraDoColab?.desconta_vt ?? false
      const desc6 = (obraDesconta && isCLT) ? +Math.min(salarioBruto * 0.06, valorBruto).toFixed(2) : 0
      inserts.push({
        colaborador_id:       c.id,
        competencia,
        data_inicio:          dataIniNova,
        data_fim:             dataFimNova,
        dias_trabalhados:     qtdDias,
        tipo:                 c.vt_tipo ?? 'cartao',
        valor:                valorBruto,
        desconto_colaborador: desc6,
        valor_empresa:        +(valorBruto - desc6).toFixed(2),
        descontar_6pct:       obraDesconta && isCLT,
        status:               'pendente',
      })
    }

    const ignorados = colabsAptos.length - inserts.length
    if (inserts.length === 0) {
      setSavingLancarLote(false)
      setModalLancarLote(false)
      toast.info(`ℹ️ Todos os ${ignorados} colaborador(es) já têm VT lançado neste período.`)
      return
    }
    const { error } = await supabase.from('vale_transporte').insert(inserts)
    setSavingLancarLote(false)
    setModalLancarLote(false)
    if (error) { toast.error(`Erro ao lançar em lote: ${error.message}`); return }
    const msgIgn = ignorados > 0 ? ` (${ignorados} já tinham VT no período — ignorados)` : ''
    toast.success(`✅ ${inserts.length} VT(s) lançados com sucesso!${msgIgn}`)
    fetchData()
  }

  async function handlePagarLote() {
    const ids = [...selecionados].filter(id => vtsPendentesLote.some(r => r.id === id))
    if (ids.length === 0) return toast.error('Selecione ao menos um lançamento')
    setSavingLote(true)
    const hoje_str = new Date().toISOString().split('T')[0]

    // 1. Criar registros em pagamentos com status PENDENTE (um por VT)
    const rowsSel = vtsPendentesLote.filter(r => ids.includes(r.id))
    const inserts = rowsSel.map(r => {
      const colab = colaboradores.find(c => c.id === r.colaborador_id)
      const valorEmpresa = r.valor_empresa ?? r.valor ?? 0
      return {
        colaborador_id:  r.colaborador_id,
        obra_id:         colab?.obra_id ?? null,
        competencia:     r.competencia,
        tipo:            'vale_transporte' as string,
        valor_bruto:     valorEmpresa,
        inss:            0,
        fgts:            0,
        ir:              0,
        vale_transporte: valorEmpresa,
        adiantamento:    0,
        valor_liquido:   valorEmpresa,
        status:          'pendente' as string,
        observacoes:     `VT ${r.data_inicio ?? ''} → ${r.data_fim ?? ''} | ${r.tipo ?? ''}`,
      }
    })
    const { error: errPag } = await supabase.from('pagamentos').insert(inserts)
    if (errPag) {
      setSavingLote(false)
      toast.error(`Erro ao registrar em Pagamentos: ${errPag.message}`)
      return
    }

    // 2. Só muda status dos VTs se os pagamentos foram criados
    const { error: errVT } = await supabase
      .from('vale_transporte')
      .update({ status: 'aguardando_pagamento' })
      .in('id', ids)
    setSavingLote(false)
    if (errVT) {
      toast.error(`Pagamentos criados, mas erro ao atualizar VTs: ${errVT.message}`)
    } else {
      toast.success(`📋 ${ids.length} VT(s) enviados para Pagamentos — confirme o pagamento lá!`)
    }
    setModalLote(false)
    setSelecionados(new Set())
    fetchData()
    navigate('/pagamentos')
  }

  // ─── totais gerais do mês ─────────────────────────────────────────────────
  const vtDoMes = vtRows.filter(r => r.competencia === competencia)
  const totalEmpresaMes = vtDoMes.reduce((s, r) => s + (r.valor_empresa ?? 0), 0)
  // Usa statusVTColab para determinar completo/parcial corretamente
  const colabsCompletos = colaboradores.filter(c => statusVTColab(c.id) === 'completo').length
  const colabsParciais  = colaboradores.filter(c => statusVTColab(c.id) === 'parcial').length
  // Colaboradores que têm VT configurado mas ainda não receberam nenhum VT no mês
  const colabsComVTCadastrado = colaboradores.filter(c => c.vt_dados !== null)
  const colabsQueReceberamVT  = new Set(vtDoMes.map(r => r.colaborador_id))
  const colabsSemVTNoMes = colabsComVTCadastrado.filter(c => !colabsQueReceberamVT.has(c.id)).length

  // nav mês
  function navMes(delta: number) {
    let m = mes + delta, a = ano
    if (m > 12) { m = 1;  a++ }
    if (m < 1)  { m = 12; a-- }
    setMes(m); setAno(a)
  }
  const MESES = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro']

  // ─── valores para exibir no modal ─────────────────────────────────────────
  const vtMensal = colabSel ? vtMensalColab(colabSel, competencia, form.contar_sabado) : 0
  const vtDiario = colabSel ? vtDiarioColab(colabSel.vt_dados as any) : 0

  // ─── render ───────────────────────────────────────────────────────────────
  return (
    <div className="page-root" style={{ gap:0 }}>

      {/* Header */}
      <div style={{ paddingBottom: 16, display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 10 }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 800, margin: 0 }}>Vale Transporte</h1>
          <p style={{ fontSize: 13, color: 'var(--muted-foreground)', marginTop: 2 }}>Controle de vale transporte por colaborador</p>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <Button variant="outline" className="gap-2" onClick={openLancarLote}
            title="Cria VT do mês inteiro para todos colaboradores sem VT na lista atual">
            <Plus size={14} /> Lançar em Lote
          </Button>
          <Button variant="outline" className="gap-2" onClick={() => { setObraLote(obraFiltro === 'todas' ? '' : obraFiltro); setSelecionados(new Set()); setModalLote(true) }}>
            <Building2 size={15} /> Fechar em Lote
          </Button>
          <Button variant="outline" className="gap-2" onClick={() => setShowRelatorio(true)}>
            <FileText size={14} /> Relatório
          </Button>
          <div style={{ width: 1, height: 24, background: 'var(--border)', margin: '0 4px' }} />
          <button onClick={() => navMes(-1)} style={{ width: 32, height: 32, border: '1px solid var(--border)', borderRadius: 6, background: 'var(--card)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <ChevronLeft size={16} />
          </button>
          <span style={{ fontSize: 14, fontWeight: 700, minWidth: 130, textAlign: 'center' }}>{MESES[mes - 1]} / {ano}</span>
          <button onClick={() => navMes(1)} style={{ width: 32, height: 32, border: '1px solid var(--border)', borderRadius: 6, background: 'var(--card)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <ChevronRight size={16} />
          </button>
        </div>
      </div>

      {/* Cards resumo */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 12, marginBottom: 16 }}>
        <SummaryCard
          sigla="VTC"
          label="VT Completo (mês)"
          value={`${colabsCompletos} colaborador(es)`}
          color="#15803d"
          bg="#15803d"
        />
        <SummaryCard
          sigla="VTP"
          label="VT Parcial"
          value={`${colabsParciais} colaborador(es)`}
          color="#b45309"
          bg="#b45309"
        />
        <SummaryCard
          sigla="EMP"
          label="Total Empresa (mês)"
          value={formatCurrency(totalEmpresaMes)}
          color="#1d4ed8"
          bg="#1d4ed8"
        />
        <SummaryCard
          sigla="SEM"
          label="Sem VT no mês"
          value={`${colabsSemVTNoMes} colaborador(es)`}
          color={colabsSemVTNoMes > 0 ? '#dc2626' : '#6b7280'}
          bg={colabsSemVTNoMes > 0 ? '#dc2626' : '#6b7280'}
        />
      </div>

      {/* 2 colunas */}
      <div style={{ display: 'flex', gap: 12, flex: 1, minHeight: 0, overflow: 'hidden' }}>

        {/* Lista colaboradores */}
        <div style={{ width: 260, flexShrink: 0, display: 'flex', flexDirection: 'column', background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 10, overflow: 'hidden' }}>
          <div style={{ padding: '12px 14px 8px', borderBottom: '1px solid var(--border)' }}>
            <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.07em', color: 'var(--muted-foreground)', marginBottom: 8 }}>🚌 Vale Transporte</div>
            <Select value={obraFiltro} onValueChange={setObraFiltro}>
              <SelectTrigger className="h-8 text-xs mb-2"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="todas">Todas as obras</SelectItem>
                {obras.map(o => <SelectItem key={o.id} value={o.id}>{o.nome}</SelectItem>)}
              </SelectContent>
            </Select>
            {/* Filtro por status VT */}
            <Select value={statusFiltro} onValueChange={v => setStatusFiltro(v as 'todos'|'sem'|'parcial'|'completo')}>
              <SelectTrigger className="h-8 text-xs mb-2"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="todos">Todos os status</SelectItem>
                <SelectItem value="sem">— Sem VT</SelectItem>
                <SelectItem value="parcial">~ Parcial</SelectItem>
                <SelectItem value="completo">✓ Completo</SelectItem>
              </SelectContent>
            </Select>
            <div style={{ position: 'relative' }}>
              <Search size={13} style={{ position: 'absolute', left: 8, top: '50%', transform: 'translateY(-50%)', color: 'var(--muted-foreground)' }} />
              <input placeholder="Nome ou chapa..." value={busca} onChange={e => setBusca(e.target.value)}
                style={{ width: '100%', height: 30, paddingLeft: 28, paddingRight: 8, fontSize: 12, border: '1px solid var(--border)', borderRadius: 6, background: 'var(--background)', color: 'var(--foreground)', boxSizing: 'border-box' }} />
            </div>
          </div>
          <div style={{ overflowY: 'auto', flex: 1 }}>
            {loading ? (
              <div style={{ padding: 20, textAlign: 'center', color: 'var(--muted-foreground)', fontSize: 12 }}>Carregando…</div>
            ) : colabsFiltrados.length === 0 ? (
              <div style={{ padding: 20, textAlign: 'center', color: 'var(--muted-foreground)', fontSize: 12 }}>Nenhum colaborador</div>
            ) : colabsFiltrados.map(c => {
              const status  = statusVTColab(c.id)
              const isAtivo = colabSel?.id === c.id
              return (
                <div key={c.id} onClick={() => setColabSel(c)}
                  style={{ padding: '10px 14px', cursor: 'pointer', borderBottom: '1px solid var(--border)', background: isAtivo ? 'var(--primary)' : 'transparent', color: isAtivo ? '#fff' : 'var(--foreground)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontSize: 11, opacity: 0.6, marginBottom: 1 }}>{c.chapa}</div>
                    <div style={{ fontWeight: 600, fontSize: 13, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.nome}</div>
                    <div style={{ fontSize: 11, opacity: 0.7 }}>{c.funcao_nome}</div>
                  </div>
                  <div style={{ flexShrink: 0, fontSize: 10, fontWeight: 700, padding: '2px 7px', borderRadius: 8,
                    background: status === 'completo' ? (isAtivo ? 'rgba(255,255,255,0.25)' : '#dcfce7') : status === 'parcial' ? (isAtivo ? 'rgba(255,255,255,0.25)' : '#fef3c7') : (isAtivo ? 'rgba(255,255,255,0.15)' : 'var(--muted)'),
                    color: status === 'completo' ? (isAtivo ? '#fff' : '#15803d') : status === 'parcial' ? (isAtivo ? '#fff' : '#b45309') : (isAtivo ? 'rgba(255,255,255,0.7)' : 'var(--muted-foreground)'),
                  }}>
                    {status === 'completo' ? '✓ completo' : status === 'parcial' ? '~ parcial' : '— sem VT'}
                  </div>
                </div>
              )
            })}
          </div>
        </div>

        {/* Painel direito */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0, overflow: 'hidden' }}>
          {!colabSel ? (
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', color: 'var(--muted-foreground)', gap: 12 }}>
              <Bus size={40} strokeWidth={1.5} />
              <div style={{ fontWeight: 600, fontSize: 15 }}>Selecione um colaborador</div>
              <div style={{ fontSize: 13 }}>para ver e gerenciar os vales do mês</div>
            </div>
          ) : (() => {
            const { pode, motivo } = podeNovoVT(colabSel.id)
            const totalPagoMes = vtDoColab.reduce((s, r) => s + (r.valor_empresa ?? 0), 0)
            const vtMensalColab_ = vtMensalColab(colabSel, competencia, false)
            const vtDiario_      = vtDiarioColab(colabSel.vt_dados as any)
            const vtDados_       = colabSel.vt_dados as any

            return (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12, height: '100%', overflow: 'auto' }}>
                {/* Cabeçalho colab */}
                <div style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 10, padding: '14px 18px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
                  <div>
                    <div style={{ fontSize: 11, color: 'var(--muted-foreground)', marginBottom: 2 }}>{colabSel.chapa} · {colabSel.funcao_nome}</div>
                    <div style={{ fontSize: 17, fontWeight: 700 }}>{colabSel.nome}</div>
                    <div style={{ fontSize: 12, color: 'var(--muted-foreground)', marginTop: 4, display: 'flex', flexWrap: 'wrap', gap: 12 }}>
                      {vtDados_ ? <>
                        <span>🚌 Modalidade: <strong>{vtDados_.modalidade ?? '—'}</strong></span>
                        {vtDiario_ > 0 && <span>Valor/dia: <strong>{formatCurrency(vtDiario_)}</strong></span>}
                        {vtMensalColab_ > 0 && <span>Mês estimado: <strong>{formatCurrency(vtMensalColab_)}</strong></span>}
                      </> : <span style={{ color: '#b45309' }}>⚠ VT não configurado no cadastro</span>}
                      {vtMensalColab_ > 0 && (() => {
                        const obraCab = obras.find(o => o.id === colabSel.obra_id)
                        const descCab = obraCab?.desconta_vt ?? false
                        const isCLTCab = (colabSel.tipo_contrato ?? 'clt').toLowerCase() === 'clt'
                        return descCab && isCLTCab
                          ? <span style={{ color:'#b45309' }}>⚠ Desc. 6% ≈ <strong>{formatCurrency(Math.min((colabSel.salario??0)*0.06, vtMensalColab_))}</strong>/mês</span>
                          : <span style={{ color:'#15803d' }}>✓ Sem desconto de 6%</span>
                      })()}
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
                    <Button onClick={openCreate} disabled={!pode} title={motivo} className="gap-2">
                      <Plus size={15} /> Novo Lançamento
                    </Button>
                  </div>
                </div>

                {!pode && (
                  <div style={{ background: '#fef3c7', border: '1px solid #fde68a', borderRadius: 8, padding: '10px 16px', fontSize: 13, color: '#92400e', display: 'flex', alignItems: 'center', gap: 8 }}>
                    <AlertCircle size={15} /><span><strong>Bloqueado:</strong> {motivo}</span>
                  </div>
                )}

                {/* Mini cards */}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10 }}>
                  {[
                    { label: 'Lançamentos no mês', value: `${vtDoColab.length} / ${MAX_PARCELAS_MES}`, color: '#1d4ed8' },
                    { label: 'Total empresa pago', value: formatCurrency(totalPagoMes), color: '#15803d' },
                    { label: 'Status', value: statusVTColab(colabSel.id) === 'completo' ? '✓ Mês completo' : statusVTColab(colabSel.id) === 'parcial' ? '~ Parcial' : '— Sem VT',
                      color: statusVTColab(colabSel.id) === 'completo' ? '#15803d' : statusVTColab(colabSel.id) === 'parcial' ? '#b45309' : 'var(--muted-foreground)' },
                  ].map((c, i) => (
                    <div key={i} style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 8, padding: '10px 14px' }}>
                      <div style={{ fontSize: 11, color: 'var(--muted-foreground)', marginBottom: 3 }}>{c.label}</div>
                      <div style={{ fontSize: 16, fontWeight: 800, color: c.color }}>{c.value}</div>
                    </div>
                  ))}
                </div>

                {/* Tabela lançamentos */}
                {vtDoColab.length === 0 ? (
                  <div style={{ background: 'var(--card)', border: '1px dashed var(--border)', borderRadius: 10, padding: 40, textAlign: 'center', color: 'var(--muted-foreground)' }}>
                    <Bus size={28} strokeWidth={1.5} style={{ margin: '0 auto 8px' }} />
                    <div style={{ fontWeight: 600 }}>Nenhum VT lançado em {fmtMes(competencia)}</div>
                  </div>
                ) : (
                  <div style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 10, overflow: 'hidden' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                      <thead>
                        <tr style={{ background: 'var(--muted)', borderBottom: '2px solid var(--border)' }}>
                          <th style={{ padding: '9px 14px', textAlign: 'left', fontWeight: 700 }}>Período</th>
                          <th style={{ padding: '9px 14px', textAlign: 'left', fontWeight: 700 }}>Tipo</th>
                          <th style={{ padding: '9px 14px', textAlign: 'right', fontWeight: 700 }}>Dias</th>
                          <th style={{ padding: '9px 14px', textAlign: 'right', fontWeight: 700 }}>Bruto</th>
                          <th style={{ padding: '9px 14px', textAlign: 'right', fontWeight: 700 }}>Desc. Falta</th>
                          <th style={{ padding: '9px 14px', textAlign: 'right', fontWeight: 700 }}>Desc. 6%</th>
                          <th style={{ padding: '9px 14px', textAlign: 'right', fontWeight: 700 }}>Líquido</th>
                          <th style={{ padding: '9px 14px', textAlign: 'center', fontWeight: 700 }}>Status</th>
                          <th style={{ padding: '9px 14px', textAlign: 'right', fontWeight: 700 }}>Ações</th>
                        </tr>
                      </thead>
                      <tbody>
                        {vtDoColab.map((r, i) => {
                          const eMesCompleto = r.data_inicio === primeiroDia(r.competencia) && r.data_fim === ultimoDia(r.competencia)
                          // Desconto por falta = diferença entre dias_uteis (total) e dias_trabalhados (efetivos) × valor_diario
                          const diasUteis   = (r as any).dias_uteis   ?? r.dias_trabalhados ?? 0
                          const vtDiarioRow = (r as any).valor_diario ?? ((r.dias_trabalhados && r.valor) ? (r.valor / r.dias_trabalhados) : 0)
                          const diasFaltaRow = Math.max(0, diasUteis - (r.dias_trabalhados ?? 0))
                          const descFaltaRow = +(diasFaltaRow * vtDiarioRow).toFixed(2)
                          return (
                            <tr key={r.id} style={{ borderBottom: '1px solid var(--border)', background: i % 2 === 0 ? 'var(--card)' : 'transparent' }}>
                              <td style={{ padding: '10px 14px' }}>
                                <div style={{ fontWeight: 600 }}>
                                  {eMesCompleto
                                    ? <span style={{ color: '#15803d' }}>✓ Mês completo</span>
                                    : `${fmtData(r.data_inicio)} → ${fmtData(r.data_fim)}`}
                                </div>
                                <div style={{ fontSize: 10, color: 'var(--muted-foreground)' }}>{fmtMes(r.competencia)}</div>
                              </td>
                              <td style={{ padding: '10px 14px', color: 'var(--muted-foreground)' }}>
                                {TIPO_OPTIONS.find(t => t.value === r.tipo)?.label ?? r.tipo ?? '—'}
                              </td>
                              <td style={{ padding: '10px 14px', textAlign: 'right' }}>{r.dias_trabalhados}</td>
                              <td style={{ padding: '10px 14px', textAlign: 'right' }}>
                                <div style={{ fontWeight: 700 }}>{formatCurrency((r.valor ?? 0) + descFaltaRow)}</div>
                                {diasUteis > 0 && vtDiarioRow > 0
                                  ? <div style={{ fontSize: 10, color: 'var(--muted-foreground)', marginTop: 1 }}>
                                      {diasUteis}d × {formatCurrency(vtDiarioRow)}/d
                                    </div>
                                  : null}
                              </td>
                              {/* Desc. Falta */}
                              <td style={{ padding: '10px 14px', textAlign: 'right' }}>
                                {descFaltaRow > 0
                                  ? (
                                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 2 }}>
                                      <span style={{ fontSize: 10, fontWeight: 700, background: '#fef2f2', color: '#dc2626', border: '1px solid #fecaca', borderRadius: 4, padding: '1px 5px' }}>
                                        {diasFaltaRow} falta{diasFaltaRow !== 1 ? 's' : ''}
                                      </span>
                                      <span style={{ color: '#dc2626', fontWeight: 700 }}>− {formatCurrency(descFaltaRow)}</span>
                                    </div>
                                  )
                                  : <span style={{ fontSize: 10, color: 'var(--muted-foreground)', background: 'var(--muted)', borderRadius: 4, padding: '2px 6px' }}>—</span>
                                }
                              </td>
                              <td style={{ padding: '10px 14px', textAlign: 'right' }}>
                                {r.descontar_6pct
                                  ? (
                                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 2 }}>
                                      <span style={{ fontSize: 10, fontWeight: 700, background: '#fef3c7', color: '#92400e', border: '1px solid #fde68a', borderRadius: 4, padding: '1px 5px' }}>⚡ Ativo</span>
                                      <span style={{ color: '#dc2626', fontWeight: 700 }}>− {formatCurrency(r.desconto_colaborador)}</span>
                                    </div>
                                  )
                                  : <span style={{ fontSize: 10, color: 'var(--muted-foreground)', background: 'var(--muted)', borderRadius: 4, padding: '2px 6px' }}>isento</span>
                                }
                              </td>
                              <td style={{ padding: '10px 14px', textAlign: 'right', fontWeight: 800, color: '#1d4ed8' }}>
                                <div>{formatCurrency(r.valor_empresa)}</div>
                                <div style={{ fontSize: 10, color: 'var(--muted-foreground)', fontWeight: 400 }}>
                                  {r.descontar_6pct ? 'empresa paga' : '= bruto'}
                                </div>
                              </td>
                              <td style={{ padding: '10px 14px', textAlign: 'center' }}>
                                {(r.status as string | undefined) === 'pago'
                                  ? <span style={{ background: '#dcfce7', color: '#15803d', borderRadius: 99, padding: '2px 10px', fontSize: 11, fontWeight: 700 }}>✓ Pago</span>
                                  : (r.status as string | undefined) === 'aguardando_pagamento'
                                  ? <span style={{ background: '#dbeafe', color: '#1d4ed8', borderRadius: 99, padding: '2px 10px', fontSize: 11, fontWeight: 700 }}>⏳ Ag. Pagamento</span>
                                  : <span style={{ background: '#fef3c7', color: '#b45309', borderRadius: 99, padding: '2px 10px', fontSize: 11, fontWeight: 700 }}>Pendente</span>}
                                {r.data_pagamento && <div style={{ fontSize: 10, color: 'var(--muted-foreground)', marginTop: 2 }}>{fmtData(r.data_pagamento)}</div>}
                              </td>
                              <td style={{ padding: '10px 14px', textAlign: 'right' }}>
                                {(() => {
                                  const st = r.status as string | undefined
                                  if (st === 'pago') {
                                    // Pago: sem ações
                                    return <span style={{ fontSize: 11, color: 'var(--muted-foreground)' }}>—</span>
                                  }
                                  if (st === 'aguardando_pagamento') {
                                    // Aguardando: bloqueado — só mostra aviso
                                    return (
                                      <span style={{ fontSize: 11, color: '#1d4ed8', fontStyle: 'italic' }}>
                                        🔒 Enviado p/ pagamento
                                      </span>
                                    )
                                  }
                                  // Pendente: pode enviar, editar e excluir
                                  return (
                                    <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 4 }}>
                                      <Button size="sm" variant="outline" className="h-7 gap-1 text-blue-700 border-blue-300 hover:bg-blue-50" onClick={() => setPagarId(r.id)}>
                                        <CreditCard size={12} /> Enviar p/ Pag.
                                      </Button>
                                      <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => openEdit(r)}><Pencil size={13} /></Button>
                                      <Button size="icon" variant="ghost" className="h-7 w-7 text-destructive" onClick={() => setDeleteId(r.id)}><Trash2 size={13} /></Button>
                                    </div>
                                  )
                                })()}
                              </td>
                            </tr>
                          )
                        })}
                      </tbody>
                      <tfoot>
                        <tr style={{ background: 'var(--muted)', borderTop: '2px solid var(--border)', fontWeight: 700 }}>
                          <td colSpan={4} style={{ padding: '9px 14px', fontSize: 12 }}>Total empresa — {vtDoColab.length} lançamento(s)</td>
                          <td style={{ padding: '9px 14px', textAlign: 'right', fontSize: 11, color: '#dc2626' }}>
                            {(() => {
                              const totalFalta = vtDoColab.reduce((s, r) => {
                                const du = (r as any).dias_uteis ?? r.dias_trabalhados ?? 0
                                const vd = (r as any).valor_diario ?? ((r.dias_trabalhados && r.valor) ? r.valor/r.dias_trabalhados : 0)
                                return s + Math.max(0, du - (r.dias_trabalhados??0)) * vd
                              }, 0)
                              return totalFalta > 0
                                ? <span style={{color:'#dc2626', fontWeight:700}}>− {formatCurrency(totalFalta)}</span>
                                : <span style={{color:'var(--muted-foreground)'}}>—</span>
                            })()}
                          </td>
                          <td style={{ padding: '9px 14px', textAlign: 'right', fontSize: 11, color: '#dc2626' }}>
                            {vtDoColab.reduce((s,r)=>s+(r.desconto_colaborador??0),0) > 0
                              ? '− '+formatCurrency(vtDoColab.reduce((s,r)=>s+(r.desconto_colaborador??0),0))
                              : <span style={{color:'var(--muted-foreground)'}}>—</span>}
                          </td>
                          <td style={{ padding: '9px 14px', textAlign: 'right', color: '#1d4ed8', fontWeight: 800 }}>{formatCurrency(totalPagoMes)}</td>
                          <td />
                        </tr>
                      </tfoot>
                    </table>
                  </div>
                )}
              </div>
            )
          })()}
        </div>
      </div>

      {/* ══ MODAL ══ */}
      {modalOpen && colabSel && (() => {
        const obraModal   = obras.find(o => o.id === colabSel.obra_id)
        const sabUtil     = obraModal?.considera_sabado_util ?? false
        const sabExt      = parseInt(form.num_sabados_extras || '0')
        const numFaltas   = parseInt(form.num_faltas || '0')
        const ehCLT       = (colabSel.tipo_contrato ?? 'clt').toLowerCase() === 'clt'
        const obraDesc    = obraModal?.desconta_vt ?? false
        const desc6val    = parseFloat(form.desconto_colaborador || '0')
        const empresaVal  = parseFloat(form.valor_empresa || '0')
        // Total dos dias = dias efetivos + faltas (sem os sábados extras, eles são adicionados depois)
        const diasBase    = parseInt(form.dias_trabalhados || '0') + numFaltas - sabExt
        const vtDiarioUse = vtDiario > 0 ? vtDiario : (vtDiarioSnap ?? 0)
        const totalDiasVal = form._valorTotalDias ?? ((vtDiarioUse * diasBase) || 0)

        return (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.55)', zIndex: 80, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
          <div style={{ background: 'var(--background)', borderRadius: 14, width: 580, maxWidth: '96vw', maxHeight: '94vh', overflowY: 'auto', boxShadow: '0 24px 64px rgba(0,0,0,0.35)', display: 'flex', flexDirection: 'column' }}>

            {/* ── Cabeçalho ── */}
            <div style={{ padding: '20px 24px 14px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexShrink: 0 }}>
              <div>
                <h3 style={{ fontWeight: 800, fontSize: 17, margin: 0 }}>
                  {editando ? '✏️ Editar VT' : '🚌 Novo Lançamento de VT'}
                </h3>
                <p style={{ fontSize: 12, color: 'var(--muted-foreground)', marginTop: 3, margin: '3px 0 0' }}>
                  {colabSel.chapa} — <strong>{colabSel.nome}</strong>
                  <span style={{ marginLeft: 8, background: 'var(--muted)', borderRadius: 4, padding: '1px 6px', fontSize: 11 }}>{fmtMes(form.competencia)}</span>
                  {ehCLT
                    ? <span style={{ marginLeft: 6, background: '#dbeafe', color: '#1d4ed8', borderRadius: 4, padding: '1px 6px', fontSize: 10, fontWeight: 700 }}>CLT</span>
                    : <span style={{ marginLeft: 6, background: '#f0fdf4', color: '#15803d', borderRadius: 4, padding: '1px 6px', fontSize: 10, fontWeight: 700 }}>Autônomo</span>
                  }
                </p>
              </div>
              <button onClick={() => setModalOpen(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--muted-foreground)', padding: 4, marginTop: 2 }}>
                <X size={18} />
              </button>
            </div>

            {/* ── Barra VT base ── */}
            {vtDiario > 0 && (
              <div style={{ padding: '10px 24px', background: '#f8fafc', borderBottom: '1px solid var(--border)', display: 'flex', gap: 20, flexWrap: 'wrap', fontSize: 12, alignItems: 'center' }}>
                <span>🚌 <strong>{(colabSel.vt_dados as any)?.modalidade ?? '—'}</strong></span>
                <span style={{ color: 'var(--muted-foreground)' }}>Valor/dia: <strong style={{ color: 'var(--foreground)' }}>{formatCurrency(vtDiario)}</strong></span>
                <span style={{ color: 'var(--muted-foreground)' }}>Mês estimado: <strong style={{ color: 'var(--foreground)' }}>{formatCurrency(vtMensal)}</strong></span>
                {vtDiarioSnap != null && (
                  <span style={{ background: '#fef3c7', color: '#92400e', borderRadius: 4, padding: '2px 7px', fontSize: 10, fontWeight: 700 }}>
                    🔒 Taxa travada: {formatCurrency(vtDiarioSnap)}/dia
                  </span>
                )}
              </div>
            )}

            {/* ── Corpo ── */}
            <div style={{ padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: 16, overflowY: 'auto' }}>

              {/* Período + Tipo */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12 }}>
                <div>
                  <Label className="text-xs text-muted-foreground">Período — de *</Label>
                  <input type="date" value={form.data_inicio} onChange={e => setField('data_inicio', e.target.value)}
                    min={primeiroDia(competencia)} max={ultimoDia(competencia)}
                    style={{ width: '100%', height: 36, padding: '0 10px', fontSize: 13, border: '1px solid var(--border)', borderRadius: 6, background: 'var(--background)', color: 'var(--foreground)', marginTop: 4, boxSizing: 'border-box' }} />
                </div>
                <div>
                  <Label className="text-xs text-muted-foreground">até *</Label>
                  <input type="date" value={form.data_fim} onChange={e => setField('data_fim', e.target.value)}
                    min={primeiroDia(competencia)} max={ultimoDia(competencia)}
                    style={{ width: '100%', height: 36, padding: '0 10px', fontSize: 13, border: '1px solid var(--border)', borderRadius: 6, background: 'var(--background)', color: 'var(--foreground)', marginTop: 4, boxSizing: 'border-box' }} />
                </div>
                <div>
                  <Label className="text-xs text-muted-foreground">Tipo</Label>
                  <Select value={form.tipo} onValueChange={v => setField('tipo', v)}>
                    <SelectTrigger className="mt-1 h-9 text-sm"><SelectValue /></SelectTrigger>
                    <SelectContent position="popper" style={{ zIndex: 9999 }}>
                      {TIPO_OPTIONS.map(t => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {/* Toggle sábado — SEMPRE somente leitura, definido pela obra */}
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: 'var(--muted)', borderRadius: 8, padding: '10px 14px', border: '1px solid var(--border)', cursor: 'not-allowed' }}>
                <div>
                  <div style={{ fontSize: 13, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 6 }}>
                    Sábado como dia trabalhado
                    <span style={{ fontSize: 9, fontWeight: 700, color: '#1d4ed8', background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: 4, padding: '1px 5px' }}>
                      🔒 configurado na obra
                    </span>
                  </div>
                  <div style={{ fontSize: 11, color: 'var(--muted-foreground)', marginTop: 2 }}>
                    {form.contar_sabado ? 'Contando Seg → Sáb' : 'Contando apenas Seg → Sex'}
                    {' · '}
                    <strong style={{ color: 'var(--foreground)' }}>{form.dias_trabalhados}</strong> dia(s) no período
                    {' · '}
                    {sabUtil
                      ? <span style={{ color:'#15803d', fontWeight:600 }}>✓ Sáb. incluído no VT desta obra</span>
                      : <span style={{ color:'#b45309', fontWeight:600 }}>Sáb. pago separado nesta obra</span>
                    }
                  </div>
                </div>
                {/* Toggle visual — não clicável, reflete a configuração da obra */}
                <div title="Definido pela obra — altere na tela de Obras" style={{ opacity: 0.7, color: sabUtil ? '#1d4ed8' : 'var(--muted-foreground)', pointerEvents: 'none' }}>
                  {sabUtil ? <ToggleRight size={30} /> : <ToggleLeft size={30} />}
                </div>
              </div>

              {/* Ajustes: faltas + sábados extras */}
              <div style={{ background: '#fffbeb', border: '1px solid #fde68a', borderRadius: 8, padding: '12px 14px' }}>
                <div style={{ fontSize: 12, fontWeight: 700, color: '#713f12', marginBottom: 10, display: 'flex', alignItems: 'center', gap: 6 }}>
                  Ajustes do período
                  {numFaltas > 0 && !editando && (
                    <span style={{ fontSize: 10, fontWeight: 600, color: '#15803d', background: '#dcfce7', border: '1px solid #86efac', borderRadius: 4, padding: '1px 6px' }}>
                      🔍 {numFaltas} falta(s) detectada(s) no ponto
                    </span>
                  )}
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                  {/* Faltas */}
                  <div>
                    <Label className="text-xs" style={{ color: '#713f12' }}>
                      Faltas — descontar dias do VT
                    </Label>
                    {faltasAutoDetectadas > 0 ? (
                      <div style={{ marginTop: 4, height: 36, display: 'flex', alignItems: 'center', paddingLeft: 12,
                        background: '#f0fdf4', border: '1px solid #86efac', borderRadius: 6,
                        fontWeight: 700, color: '#15803d', fontSize: 14, cursor: 'not-allowed', userSelect: 'none' }}>
                        {form.num_faltas}
                        <span style={{ marginLeft: 6, fontSize: 10, color: '#16a34a', fontWeight: 400 }}>🔒 auto</span>
                      </div>
                    ) : (
                      <Input type="number" min={0} max={30} value={form.num_faltas}
                        onChange={e => setField('num_faltas', e.target.value)}
                        className="mt-1 h-9 text-sm" placeholder="0" />
                    )}
                    <p style={{ fontSize: 10, color: faltasAutoDetectadas > 0 ? '#16a34a' : '#92400e', marginTop: 3 }}>
                      {faltasAutoDetectadas > 0 ? 'Detectado automaticamente no ponto' : 'Cada falta = 1 dia a menos de VT'}
                    </p>
                  </div>
                  {/* Sábados extras */}
                  <div>
                    <Label className="text-xs" style={{ color: '#713f12' }}>
                      {sabUtil ? 'Sáb. já incluso — campo inativo' : 'Sáb. extras trabalhados'}
                    </Label>
                    <Input type="number" min={0} max={5} value={form.num_sabados_extras}
                      onChange={e => setField('num_sabados_extras', e.target.value)}
                      disabled={sabUtil}
                      className="mt-1 h-9 text-sm" placeholder="0" />
                    <p style={{ fontSize: 10, color: sabUtil ? '#15803d' : '#92400e', marginTop: 3 }}>
                      {sabUtil ? '✓ Sáb. já é dia útil nesta obra' : 'Obra não conta sáb. no base — adicione aqui'}
                    </p>
                  </div>
                </div>
              </div>

              {/* ── Resumo do VT — tabela de breakdown ── */}
              <div>
                <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--foreground)', marginBottom: 8, display: 'flex', alignItems: 'center', gap: 6 }}>
                  Resumo do VT
                  <span style={{ fontSize: 9, background: '#dbeafe', color: '#1d4ed8', borderRadius: 3, padding: '1px 5px', fontWeight: 700 }}>AUTO</span>
                </div>

                <div style={{ border: '1px solid var(--border)', borderRadius: 10, overflow: 'hidden' }}>

                  {/* Linha: Dias trabalhados */}
                  <div style={{ display: 'flex', alignItems: 'center', padding: '10px 14px', borderBottom: '1px solid var(--border)', gap: 8 }}>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--foreground)' }}>📅 Dias trabalhados</div>
                      <div style={{ fontSize: 11, color: 'var(--muted-foreground)', marginTop: 1 }}>
                        {diasBase} dia{diasBase !== 1 ? 's' : ''} úteis × {formatCurrency(vtDiarioUse)}/dia
                      </div>
                    </div>
                    <div style={{ fontSize: 15, fontWeight: 700, color: '#1d4ed8', minWidth: 90, textAlign: 'right' }}>
                      {formatCurrency(totalDiasVal)}
                    </div>
                  </div>

                  {/* Linha: Sáb/Dom — só quando sáb NÃO é dia útil e há sábados extras */}
                  {!sabUtil && sabExt > 0 && (
                    <div style={{ display: 'flex', alignItems: 'center', padding: '10px 14px', borderBottom: '1px solid var(--border)', background: '#f0fdf4', gap: 8 }}>
                      <div style={{ flex: 1 }}>
                        <div style={{ fontSize: 12, fontWeight: 600, color: '#15803d' }}>➕ Sáb/Dom trabalhados</div>
                        <div style={{ fontSize: 11, color: '#16a34a', marginTop: 1 }}>
                          {sabExt} sáb × {formatCurrency(vtDiarioUse)}/dia — adicionados ao VT
                        </div>
                      </div>
                      <div style={{ fontSize: 15, fontWeight: 700, color: '#15803d', minWidth: 90, textAlign: 'right' }}>
                        + {formatCurrency(form._valorSabExtra ?? 0)}
                      </div>
                    </div>
                  )}

                  {/* Linha: Desconto faltas — só quando há faltas */}
                  {numFaltas > 0 && (
                    <div style={{ display: 'flex', alignItems: 'center', padding: '10px 14px', borderBottom: '1px solid var(--border)', background: '#fff7ed', gap: 8 }}>
                      <div style={{ flex: 1 }}>
                        <div style={{ fontSize: 12, fontWeight: 600, color: '#92400e' }}>⛔ Desconto por faltas</div>
                        <div style={{ fontSize: 11, color: '#b45309', marginTop: 1 }}>
                          {numFaltas} falta{numFaltas !== 1 ? 's' : ''} × {formatCurrency(vtDiarioUse)}/dia
                        </div>
                      </div>
                      <div style={{ fontSize: 15, fontWeight: 700, color: '#dc2626', minWidth: 90, textAlign: 'right' }}>
                        − {formatCurrency(form._valorDescFalta ?? 0)}
                      </div>
                    </div>
                  )}

                  {/* Linha: Desconto 6% — só quando aplicável */}
                  {desc6val > 0 && (
                    <div style={{ display: 'flex', alignItems: 'center', padding: '10px 14px', borderBottom: '1px solid var(--border)', background: '#fef9c3', gap: 8 }}>
                      <div style={{ flex: 1 }}>
                        <div style={{ fontSize: 12, fontWeight: 600, color: '#713f12' }}>📉 Desconto 6% — CLT</div>
                        <div style={{ fontSize: 11, color: '#92400e', marginTop: 1 }}>
                          Colaborador participa do custeio do VT (definido pela obra)
                        </div>
                      </div>
                      <div style={{ fontSize: 15, fontWeight: 700, color: '#b45309', minWidth: 90, textAlign: 'right' }}>
                        − {formatCurrency(desc6val)}
                      </div>
                    </div>
                  )}

                  {/* ── Linha do VT Líquido ── */}
                  <div style={{
                    display: 'flex', alignItems: 'center', padding: '13px 14px', gap: 8,
                    background: empresaVal > 0 ? '#eff6ff' : '#f1f5f9',
                  }}>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: 13, fontWeight: 800, color: '#1e293b' }}>💰 VT Líquido — Empresa paga</div>
                      <div style={{ fontSize: 11, color: '#64748b', marginTop: 1 }}>
                        {numFaltas === 0 && !sabUtil && sabExt === 0 && desc6val === 0
                          ? 'Sem descontos ou adicionais'
                          : [
                              numFaltas > 0 && `${numFaltas} falta${numFaltas!==1?'s':''}`,
                              !sabUtil && sabExt > 0 && `+${sabExt} sáb`,
                              desc6val > 0 && 'desc. 6%',
                            ].filter(Boolean).join(' · ')
                        }
                      </div>
                    </div>
                    <div style={{ fontSize: 22, fontWeight: 900, color: empresaVal > 0 ? '#1d4ed8' : '#94a3b8', minWidth: 100, textAlign: 'right' }}>
                      {formatCurrency(empresaVal)}
                    </div>
                  </div>

                </div>

                {/* Badge info desconto 6% */}
                {ehCLT && !obraDesc && (
                  <p style={{ fontSize: 11, color: '#15803d', marginTop: 6 }}>
                    ✓ Sem desconto de 6% — esta obra não aplica desconto no VT
                  </p>
                )}
                {!ehCLT && (
                  <p style={{ fontSize: 11, color: '#15803d', marginTop: 6 }}>
                    ✓ Autônomo/PJ — desconto de 6% não se aplica
                  </p>
                )}
              </div>

              {/* Observações */}
              <div>
                <Label className="text-xs text-muted-foreground">Observações</Label>
                <Textarea value={form.observacoes} onChange={e => setField('observacoes', e.target.value)} className="mt-1" rows={2} />
              </div>

            </div>

            {/* ── Rodapé / Botões ── */}
            <div style={{ padding: '14px 24px', borderTop: '1px solid var(--border)', display: 'flex', justifyContent: 'flex-end', gap: 10, flexShrink: 0 }}>
              <Button variant="outline" onClick={() => setModalOpen(false)}>Cancelar</Button>
              <Button onClick={handleSave} disabled={saving}>
                {saving ? 'Salvando…' : editando ? 'Salvar alterações' : 'Lançar VT'}
              </Button>
            </div>

          </div>
        </div>
        )
      })()}

      {/* Confirmar exclusão */}
      <AlertDialog open={!!deleteId} onOpenChange={o => !o && setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir lançamento de VT?</AlertDialogTitle>
            <AlertDialogDescription>Esta ação não pode ser desfeita.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-destructive text-destructive-foreground">Excluir</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* ── Modal confirmar pagamento individual ── */}
      <AlertDialog open={!!pagarId} onOpenChange={o => !o && setPagarId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <CreditCard size={18} style={{ color: '#1d4ed8' }} /> Enviar VT para Pagamentos
            </AlertDialogTitle>
            <AlertDialogDescription>
              O lançamento será marcado como <strong>Aguardando Pagamento</strong> e um registro <strong>Pendente</strong> será criado na aba de Pagamentos para confirmação.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={savingPagar}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              disabled={savingPagar}
              onClick={handlePagar}
              style={{ background: '#1d4ed8', color: '#fff' }}
            >
              {savingPagar ? <><Loader2 size={14} className="animate-spin" /> Enviando…</> : '📋 Enviar para Pagamentos'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* ── Modal fechamento em lote ── */}
      {modalLote && (() => {
        // Sem obra selecionada = tela de seleção de obra
        const obraFechSel = obras.find(o => o.id === obraLote)
        const semObraSel  = !obraFechSel   // 'todas' ou vazio

        // Agrupar VTs por colaborador para exibição em linhas
        const colabsNoLote = Array.from(
          new Map(vtsPendentesLote.map(r => {
            const c = colaboradores.find(x => x.id === r.colaborador_id)
            return [r.colaborador_id, c]
          })).entries()
        ).filter(([, c]) => !!c)

        const vtsPorColab = (colabId: string) =>
          vtsPendentesLote.filter(r => r.colaborador_id === colabId)

        return (
          <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 200, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
            <div style={{ background: 'var(--card)', borderRadius: 16, width: '100%', maxWidth: 820, maxHeight: '92vh', display: 'flex', flexDirection: 'column', overflow: 'hidden', boxShadow: '0 25px 50px rgba(0,0,0,0.3)' }}>

              {/* ── Header ── */}
              <div style={{ padding: '18px 24px 14px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <Building2 size={20} style={{ color: '#7c3aed' }} />
                  <div>
                    <div style={{ fontWeight: 800, fontSize: 17 }}>Fechar VT em Lote — {fmtMes(competencia)}</div>
                    <div style={{ fontSize: 12, color: 'var(--muted-foreground)' }}>
                      {semObraSel
                        ? 'Selecione uma obra para ver os lançamentos pendentes'
                        : `Obra: ${obraFechSel?.nome} — selecione os lançamentos a enviar para pagamento`}
                    </div>
                  </div>
                </div>
                <button onClick={() => setModalLote(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--muted-foreground)' }}>
                  <X size={18} />
                </button>
              </div>

              {/* ── Configurações Globais ── */}
              <div style={{ padding: '14px 24px', borderBottom: '1px solid var(--border)', background: 'var(--muted)' }}>
                <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--muted-foreground)', marginBottom: 10 }}>
                  ⚙️ Configurações do lote
                </div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 16, alignItems: 'center' }}>
                  {/* Seleção de obra — obrigatória */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <Label style={{ fontSize: 12, whiteSpace: 'nowrap', fontWeight: 700, color: semObraSel ? '#dc2626' : 'var(--foreground)' }}>
                      {semObraSel ? '⚠ Obra: *' : 'Obra:'}
                    </Label>
                    <Select value={obraLote} onValueChange={v => { setObraLote(v); setSelecionados(new Set()) }}>
                      <SelectTrigger style={{ width: 220, height: 34, fontSize: 12, borderColor: semObraSel ? '#fca5a5' : undefined, background: semObraSel ? '#fef2f2' : undefined }}>
                        <SelectValue placeholder="Selecione uma obra..." />
                      </SelectTrigger>
                      <SelectContent position="popper" style={{ zIndex: 9999 }}>
                        {obras.map(o => <SelectItem key={o.id} value={o.id}>{o.nome}</SelectItem>)}
                      </SelectContent>
                    </Select>
                    {semObraSel && <span style={{ fontSize: 11, color: '#dc2626', fontWeight: 600 }}>← Selecione para continuar</span>}
                  </div>

                  {!semObraSel && (
                    <>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <Label style={{ fontSize: 12, fontWeight: 600 }}>Período:</Label>
                        <span style={{ fontSize: 12, background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 6, padding: '4px 10px', fontWeight: 600 }}>
                          {fmtData(primeiroDia(competencia))} → {fmtData(ultimoDia(competencia))}
                        </span>
                      </div>
                      {obraFechSel?.desconta_vt
                        ? <span style={{ fontSize: 11, color: '#92400e', fontWeight: 700, background: '#fefce8', border: '1px solid #fde68a', borderRadius: 5, padding: '3px 8px' }}>⚡ Desc. 6% CLT ativo</span>
                        : <span style={{ fontSize: 11, color: '#15803d', fontWeight: 700, background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: 5, padding: '3px 8px' }}>✓ Sem desconto de 6%</span>
                      }
                      {obraFechSel?.considera_sabado_util
                        ? <span style={{ fontSize: 11, color: '#1d4ed8', fontWeight: 700, background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: 5, padding: '3px 8px' }}>📅 Sáb. incluso no VT</span>
                        : <span style={{ fontSize: 11, color: '#b45309', fontWeight: 700, background: '#fff7ed', border: '1px solid #fed7aa', borderRadius: 5, padding: '3px 8px' }}>📅 Sáb. pago separado</span>
                      }
                      <span style={{ marginLeft: 'auto', fontSize: 12, color: 'var(--muted-foreground)' }}>
                        {vtsPendentesLote.length} lançamento(s) · <strong>{selecionados.size}</strong> selecionado(s)
                      </span>
                    </>
                  )}
                </div>
              </div>

              {/* ── Tabela por colaborador ── */}
              <div style={{ flex: 1, overflowY: 'auto' }}>
                {semObraSel ? (
                  /* Tela de seleção de obra */
                  <div style={{ padding: 40, textAlign: 'center', color: 'var(--muted-foreground)' }}>
                    <Building2 size={40} style={{ margin: '0 auto 12px', opacity: 0.3 }} />
                    <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 8 }}>Selecione uma obra para continuar</div>
                    <div style={{ fontSize: 13, maxWidth: 420, margin: '0 auto' }}>
                      O fechamento em lote é feito por obra para garantir que as regras de sábado e desconto de 6% sejam aplicadas corretamente.
                    </div>
                    <div style={{ marginTop: 24, display: 'flex', flexWrap: 'wrap', gap: 12, justifyContent: 'center' }}>
                      {obras.map(o => {
                        const pendentes = vtRows.filter(r => {
                          const c = colaboradores.find(x => x.id === r.colaborador_id)
                          return c?.obra_id === o.id && r.competencia === competencia && (r.status as string) === 'pendente'
                        }).length
                        if (pendentes === 0) return null
                        return (
                          <button key={o.id}
                            onClick={() => { setObraLote(o.id); setSelecionados(new Set()) }}
                            style={{ padding: '12px 18px', background: 'var(--card)', border: '2px solid var(--border)', borderRadius: 10, cursor: 'pointer', textAlign: 'left', minWidth: 180, transition: 'border-color 0.15s' }}>
                            <div style={{ fontWeight: 700, fontSize: 13 }}>📍 {o.nome}</div>
                            <div style={{ fontSize: 11, color: 'var(--muted-foreground)', marginTop: 4 }}>{pendentes} VT(s) pendente(s)</div>
                            <div style={{ marginTop: 6, display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                              {o.desconta_vt && <span style={{ fontSize: 9, background: '#fef3c7', color: '#92400e', borderRadius: 3, padding: '1px 4px', fontWeight: 700 }}>⚡ 6% CLT</span>}
                              {!o.considera_sabado_util && <span style={{ fontSize: 9, background: '#fff7ed', color: '#b45309', borderRadius: 3, padding: '1px 4px', fontWeight: 700 }}>📅 Sáb sep.</span>}
                            </div>
                          </button>
                        )
                      })}
                    </div>
                  </div>
                ) : vtsPendentesLote.length === 0 ? (
                  <div style={{ padding: 40, textAlign: 'center', color: 'var(--muted-foreground)', fontSize: 14 }}>
                    ✓ Nenhum VT pendente {obraLote !== 'todas' ? 'nesta obra' : ''} em {fmtMes(competencia)}
                  </div>
                ) : (
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                    <thead style={{ position: 'sticky', top: 0, zIndex: 1 }}>
                      <tr style={{ background: 'var(--card)', borderBottom: '2px solid var(--border)' }}>
                        <th style={{ padding: '10px 8px 10px 16px', width: 36 }}>
                          <button onClick={toggleAll} style={{ background: 'none', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center' }}>
                            {vtsPendentesLote.every(r => selecionados.has(r.id))
                              ? <CheckSquare size={16} style={{ color: '#7c3aed' }} />
                              : <Square size={16} style={{ color: 'var(--muted-foreground)' }} />}
                          </button>
                        </th>
                        <th style={{ padding: '10px 8px', textAlign: 'left', fontWeight: 700, fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Colaborador / Obra</th>
                        <th style={{ padding: '10px 8px', textAlign: 'center', fontWeight: 700, fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Período</th>
                        <th style={{ padding: '10px 8px', textAlign: 'center', fontWeight: 700, fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Dias</th>
                        <th style={{ padding: '10px 8px', textAlign: 'center', fontWeight: 700, fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Tipo</th>
                        <th style={{ padding: '10px 8px', textAlign: 'right', fontWeight: 700, fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.05em' }}>R$ Empresa</th>
                        <th style={{ padding: '10px 8px', textAlign: 'center', fontWeight: 700, fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.05em' }}>6%</th>
                      </tr>
                    </thead>
                    <tbody>
                      {colabsNoLote.map(([colabId, colab], gi) => {
                        const vtsColab = vtsPorColab(colabId)
                        const todosSel = vtsColab.every(r => selecionados.has(r.id))
                        const algumSel = vtsColab.some(r => selecionados.has(r.id))
                        const totalColab = vtsColab.filter(r => selecionados.has(r.id)).reduce((s, r) => s + (r.valor_empresa ?? 0), 0)

                        return (
                          <React.Fragment key={colabId}>
                            {/* Linha do colaborador */}
                            {vtsColab.map((r, ri) => {
                              const sel = selecionados.has(r.id)
                              const isFirst = ri === 0
                              return (
                                <tr key={r.id}
                                  onClick={() => toggleSel(r.id)}
                                  style={{
                                    borderBottom: ri === vtsColab.length - 1 ? '2px solid var(--border)' : '1px solid var(--border)',
                                    background: sel ? 'rgba(124,58,237,0.06)' : (gi % 2 === 0 ? 'var(--card)' : 'transparent'),
                                    cursor: 'pointer',
                                  }}>
                                  <td style={{ padding: '9px 8px 9px 16px' }}>
                                    {sel ? <CheckSquare size={15} style={{ color: '#7c3aed' }} /> : <Square size={15} style={{ color: 'var(--muted-foreground)' }} />}
                                  </td>
                                  <td style={{ padding: '9px 8px' }}>
                                    {isFirst && (
                                      <>
                                        <div style={{ fontWeight: 700, fontSize: 13 }}>{colab?.nome}</div>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 2 }}>
                                          {colab?.chapa && <span style={{ fontSize: 10, background: 'var(--muted)', borderRadius: 4, padding: '1px 5px', color: 'var(--muted-foreground)' }}>{colab.chapa}</span>}
                                          {colab?.obra_nome && <span style={{ fontSize: 10, color: '#7c3aed', fontWeight: 600 }}>📍 {colab.obra_nome}</span>}
                                          {colab?.funcao_nome && <span style={{ fontSize: 10, color: 'var(--muted-foreground)' }}>{colab.funcao_nome}</span>}
                                        </div>
                                      </>
                                    )}
                                    {!isFirst && (
                                      <span style={{ fontSize: 11, color: 'var(--muted-foreground)', paddingLeft: 8 }}>↳ parcela {ri + 1}</span>
                                    )}
                                  </td>
                                  <td style={{ padding: '9px 8px', textAlign: 'center', fontSize: 12, color: 'var(--muted-foreground)' }}>
                                    <span style={{ background: 'var(--muted)', borderRadius: 5, padding: '2px 7px', fontSize: 11, fontWeight: 600 }}>
                                      {fmtData(r.data_inicio)} → {fmtData(r.data_fim)}
                                    </span>
                                  </td>
                                  <td style={{ padding: '9px 8px', textAlign: 'center', fontSize: 12, fontWeight: 700 }}>
                                    {r.dias_trabalhados ?? '—'}
                                    {loteContarSabado && <span style={{ fontSize: 9, color: '#7c3aed', display: 'block' }}>+sáb</span>}
                                  </td>
                                  <td style={{ padding: '9px 8px', textAlign: 'center' }}>
                                    <span style={{ fontSize: 10, background: r.tipo === 'cartao' ? '#dbeafe' : '#dcfce7', color: r.tipo === 'cartao' ? '#1d4ed8' : '#15803d', borderRadius: 4, padding: '2px 6px', fontWeight: 600 }}>
                                      {r.tipo ?? 'cartão'}
                                    </span>
                                  </td>
                                  <td style={{ padding: '9px 8px', textAlign: 'right', fontWeight: 700, color: '#1d4ed8' }}>
                                    {formatCurrency(r.valor_empresa)}
                                  </td>
                                  <td style={{ padding: '9px 8px', textAlign: 'center' }}>
                                    {(() => {
                                      const colR = colaboradores.find(x => x.id === r.colaborador_id)
                                      const obraR = obras.find(o => o.id === colR?.obra_id)
                                      const isCLTR = (colR?.tipo_contrato ?? 'clt').toLowerCase() === 'clt'
                                      return (obraR?.desconta_vt && isCLTR)
                                        ? <span style={{ fontSize: 10, background: '#fef3c7', color: '#b45309', borderRadius: 4, padding: '2px 6px', fontWeight: 700 }}>⚠ 6%</span>
                                        : <span style={{ fontSize: 10, color: 'var(--muted-foreground)' }}>—</span>
                                    })()}
                                  </td>
                                </tr>
                              )
                            })}
                            {/* Subtotal do colaborador se tem mais de 1 VT */}
                            {vtsColab.length > 1 && (
                              <tr style={{ background: algumSel ? 'rgba(124,58,237,0.04)' : 'var(--muted)', borderBottom: '2px solid var(--border)' }}>
                                <td colSpan={5} style={{ padding: '6px 8px 6px 56px', fontSize: 11, color: 'var(--muted-foreground)', fontStyle: 'italic' }}>
                                  <button onClick={() => vtsColab.forEach(r => toggleSel(r.id))} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 11, color: '#7c3aed', fontWeight: 600, padding: 0 }}>
                                    {todosSel ? '✓ Desmarcar todos' : '+ Marcar todos'} os {vtsColab.length} lançamentos de {colab?.nome?.split(' ')[0]}
                                  </button>
                                </td>
                                <td style={{ padding: '6px 8px', textAlign: 'right', fontSize: 12, fontWeight: 800, color: '#15803d' }}>
                                  {formatCurrency(totalColab)}
                                </td>
                                <td />
                              </tr>
                            )}
                          </React.Fragment>
                        )
                      })}
                    </tbody>
                    <tfoot>
                      <tr style={{ borderTop: '2px solid var(--border)', background: 'var(--muted)' }}>
                        <td colSpan={5} style={{ padding: '11px 8px 11px 16px', fontWeight: 800, fontSize: 13 }}>
                          Total selecionado ({selecionados.size} lançamento{selecionados.size !== 1 ? 's' : ''})
                          <span style={{ fontSize: 11, color: '#92400e', marginLeft: 8, fontWeight: 600 }}>· Desconto 6%: definido por obra de cada colaborador</span>
                        </td>
                        <td style={{ padding: '11px 8px', textAlign: 'right', fontWeight: 800, color: '#15803d', fontSize: 16 }}>
                          {formatCurrency(vtsPendentesLote.filter(r => selecionados.has(r.id)).reduce((s, r) => s + (r.valor_empresa ?? 0), 0))}
                        </td>
                        <td />
                      </tr>
                    </tfoot>
                  </table>
                )}
              </div>

              {/* ── Footer ── */}
              <div style={{ padding: '14px 24px', borderTop: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
                <div style={{ fontSize: 12 }}>
                  {semObraSel
                    ? <span style={{ color: '#dc2626', fontWeight: 600 }}>⚠ Selecione uma obra para habilitar o fechamento</span>
                    : <>
                        {obraFechSel?.desconta_vt && <span style={{ color: '#92400e', marginRight: 12 }}>⚡ Desc. 6% CLT ativo nesta obra</span>}
                        {!obraFechSel?.considera_sabado_util && <span style={{ color: '#b45309' }}>📅 Sáb. pago separado nesta obra</span>}
                      </>
                  }
                </div>
                <div style={{ display: 'flex', gap: 10 }}>
                  <Button variant="outline" onClick={() => setModalLote(false)} disabled={savingLote}>Cancelar</Button>
                  <Button
                    disabled={selecionados.size === 0 || savingLote || semObraSel}
                    onClick={handlePagarLote}
                    style={{ background: '#15803d', color: '#fff', gap: 6 }}
                  >
                    {savingLote
                      ? <><Loader2 size={14} className="animate-spin" /> Processando…</>
                      : <><CreditCard size={14} /> Enviar {selecionados.size} VT(s) para Pagamentos</>}
                  </Button>
                </div>
              </div>
            </div>
          </div>
        )
      })()}

      {/* ══ MODAL RELATÓRIO DE FECHAMENTO ══ */}
      {showRelatorio && (() => {
        // Filtrar VTs do mês, excluindo cancelados
        const vtsMes = vtRows.filter(r =>
          r.competencia === competencia && (r.status as string | undefined) !== 'cancelado'
        )

        // Montar linhas com dados do colaborador
        type RelRow = {
          vt: VTRow
          chapa: string
          nome: string
          funcao_nome: string
          obra_nome: string
          tipo_contrato: string
          pix_chave: string | null | undefined
          pix_tipo: string | null | undefined
        }
        const relRows: RelRow[] = vtsMes.map(vt => {
          const c = colaboradores.find(x => x.id === vt.colaborador_id)
          return {
            vt,
            chapa:         c?.chapa ?? '—',
            nome:          c?.nome  ?? vt.colaboradores?.nome ?? '—',
            funcao_nome:   c?.funcao_nome ?? '—',
            obra_nome:     c?.obra_nome   ?? '—',
            tipo_contrato: c?.tipo_contrato ?? '—',
            pix_chave:     c?.pix_chave,
            pix_tipo:      c?.pix_tipo,
          }
        })

        // Agrupar por função (ordenado A→Z)
        const grupoMap = new Map<string, RelRow[]>()
        relRows.forEach(r => {
          const fn = r.funcao_nome || '(Sem função)'
          if (!grupoMap.has(fn)) grupoMap.set(fn, [])
          grupoMap.get(fn)!.push(r)
        })
        // Ordenar dentro de cada grupo por nome
        grupoMap.forEach(rows => rows.sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR')))
        // Chaves ordenadas A→Z
        const gruposOrdenados = [...grupoMap.entries()].sort((a, b) => a[0].localeCompare(b[0], 'pt-BR'))

        // Total geral
        const totalGeral = relRows.reduce((s, r) => s + (r.vt.valor_empresa ?? r.vt.valor ?? 0), 0)

        function fmtPeriodo(ini: string | null | undefined, fim: string | null | undefined) {
          if (!ini || !fim) return '—'
          const dd = (d: string) => d.slice(8) + '/' + d.slice(5, 7)
          return `${dd(ini)} → ${dd(fim)}`
        }

        function badgeStatus(status: string | undefined | null) {
          if (status === 'pago') return (
            <span style={{ background:'#dcfce7', color:'#15803d', borderRadius:99, padding:'1px 8px', fontSize:10, fontWeight:700, whiteSpace:'nowrap' }}>✓ Pago</span>
          )
          if (status === 'aguardando_pagamento') return (
            <span style={{ background:'#dbeafe', color:'#1d4ed8', borderRadius:99, padding:'1px 8px', fontSize:10, fontWeight:700, whiteSpace:'nowrap' }}>⏳ Ag. Pgto</span>
          )
          return (
            <span style={{ background:'#fef3c7', color:'#b45309', borderRadius:99, padding:'1px 8px', fontSize:10, fontWeight:700, whiteSpace:'nowrap' }}>Pendente</span>
          )
        }

        return (
          <div style={{ position:'fixed', inset:0, background:'#fff', zIndex:1000, overflow:'auto', padding:'32px 40px' }}>
            <style>{'@media print { button { display: none !important; } }'}</style>

            {/* Cabeçalho do relatório */}
            <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', marginBottom:24 }}>
              <div>
                <h2 style={{ margin:0, fontSize:20, fontWeight:800 }}>Relatório de Fechamento — Vale Transporte</h2>
                <p style={{ margin:'4px 0 0', fontSize:13, color:'#6b7280' }}>
                  {MESES[mes-1]} / {ano} · Gerado em {new Date().toLocaleDateString('pt-BR')}
                </p>
              </div>
              <div style={{ display:'flex', gap:8 }}>
                <Button onClick={() => window.print()}>🖨️ Imprimir / PDF</Button>
                <Button variant="outline" onClick={() => setShowRelatorio(false)}>✕ Fechar</Button>
              </div>
            </div>

            {relRows.length === 0 ? (
              <div style={{ textAlign:'center', color:'#6b7280', padding:'60px 0', fontSize:14 }}>
                Nenhum VT lançado em {MESES[mes-1]}/{ano}
              </div>
            ) : (
              <div style={{ display:'flex', flexDirection:'column', gap:32 }}>
                {gruposOrdenados.map(([funcaoNome, rows]) => {
                  const totalGrupo = rows.reduce((s, r) => s + (r.vt.valor_empresa ?? r.vt.valor ?? 0), 0)
                  return (
                    <div key={funcaoNome}>
                      {/* Cabeçalho do grupo */}
                      <div style={{ background:'#f1f5f9', borderLeft:'4px solid #3b82f6', padding:'8px 14px', marginBottom:0, display:'flex', alignItems:'center', gap:10 }}>
                        <span style={{ fontWeight:800, fontSize:14, color:'#1e40af' }}>FUNÇÃO: {funcaoNome}</span>
                        <span style={{ fontSize:12, color:'#64748b' }}>— {rows.length} colaborador(es)</span>
                      </div>

                      {/* Tabela do grupo */}
                      <table style={{ width:'100%', borderCollapse:'collapse', fontSize:12 }}>
                        <thead>
                          <tr style={{ background:'#e2e8f0', borderBottom:'2px solid #cbd5e1' }}>
                            <th style={{ padding:'8px 12px', textAlign:'left', fontWeight:700, whiteSpace:'nowrap' }}>Período</th>
                            <th style={{ padding:'8px 12px', textAlign:'left', fontWeight:700 }}>Chapa</th>
                            <th style={{ padding:'8px 12px', textAlign:'left', fontWeight:700 }}>Nome</th>
                            <th style={{ padding:'8px 12px', textAlign:'left', fontWeight:700 }}>Obra</th>
                            <th style={{ padding:'8px 12px', textAlign:'right', fontWeight:700, whiteSpace:'nowrap' }}>Valor Empresa</th>
                            <th style={{ padding:'8px 12px', textAlign:'left', fontWeight:700 }}>PIX / Pagamento</th>
                            <th style={{ padding:'8px 12px', textAlign:'center', fontWeight:700 }}>Status</th>
                            <th style={{ padding:'8px 12px', textAlign:'left', fontWeight:700 }}>Obs</th>
                          </tr>
                        </thead>
                        <tbody>
                          {rows.map((r, i) => (
                            <tr key={r.vt.id} style={{ borderBottom:'1px solid #e2e8f0', background: i % 2 === 0 ? '#fff' : '#f8fafc' }}>
                              <td style={{ padding:'7px 12px', whiteSpace:'nowrap', color:'#374151' }}>
                                {fmtPeriodo(r.vt.data_inicio, r.vt.data_fim)}
                              </td>
                              <td style={{ padding:'7px 12px', color:'#6b7280', fontSize:11 }}>{r.chapa}</td>
                              <td style={{ padding:'7px 12px', fontWeight:600 }}>{r.nome}</td>
                              <td style={{ padding:'7px 12px', color:'#4b5563' }}>{r.obra_nome}</td>
                              <td style={{ padding:'7px 12px', textAlign:'right', fontWeight:700, color:'#1d4ed8' }}>
                                {formatCurrency(r.vt.valor_empresa ?? r.vt.valor ?? 0)}
                              </td>
                              <td style={{ padding:'7px 12px', color:'#374151', fontSize:11 }}>
                                {r.pix_tipo && r.pix_chave
                                  ? `${r.pix_tipo}: ${r.pix_chave}`
                                  : '—'}
                              </td>
                              <td style={{ padding:'7px 12px', textAlign:'center' }}>
                                {badgeStatus(r.vt.status as string | undefined)}
                              </td>
                              <td style={{ padding:'7px 12px', color:'#6b7280', fontSize:11 }}>
                                {r.vt.observacoes ?? '—'}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                        <tfoot>
                          <tr style={{ background:'#f1f5f9', borderTop:'2px solid #cbd5e1' }}>
                            <td colSpan={4} style={{ padding:'8px 12px', fontWeight:700, fontSize:12, color:'#374151' }}>
                              Subtotal — {funcaoNome} ({rows.length} lançamento{rows.length !== 1 ? 's' : ''})
                            </td>
                            <td style={{ padding:'8px 12px', textAlign:'right', fontWeight:800, color:'#1d4ed8', fontSize:13 }}>
                              {formatCurrency(totalGrupo)}
                            </td>
                            <td colSpan={3} />
                          </tr>
                        </tfoot>
                      </table>
                    </div>
                  )
                })}

                {/* Rodapé geral */}
                <div style={{ borderTop:'3px solid #1d4ed8', paddingTop:16, display:'flex', justifyContent:'flex-end', alignItems:'center', gap:24 }}>
                  <div style={{ fontSize:13, color:'#6b7280' }}>
                    Total de lançamentos: <strong style={{ color:'#111827' }}>{relRows.length}</strong>
                  </div>
                  <div style={{ fontSize:16, fontWeight:800, color:'#1d4ed8' }}>
                    TOTAL GERAL: {formatCurrency(totalGeral)}
                  </div>
                </div>
              </div>
            )}
          </div>
        )
      })()}

      {/* ══ MODAL LANÇAR EM LOTE ══ */}
      {/* ── Modal Lançar em Lote — 2 passos ── */}
      {modalLancarLote && (
        <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.55)', zIndex:90, display:'flex', alignItems:'center', justifyContent:'center', padding:16 }}>
          <div style={{ background:'var(--card)', borderRadius:16, width:'100%', maxWidth: loteStep===1 ? 480 : 780, maxHeight:'90vh', display:'flex', flexDirection:'column', overflow:'hidden', boxShadow:'0 25px 60px rgba(0,0,0,0.35)' }}>

            {/* Header */}
            <div style={{ padding:'18px 24px 14px', borderBottom:'1px solid var(--border)', display:'flex', alignItems:'center', justifyContent:'space-between' }}>
              <div style={{ display:'flex', alignItems:'center', gap:10 }}>
                <span style={{ fontSize:22 }}>📦</span>
                <div>
                  <div style={{ fontWeight:800, fontSize:16 }}>Lançar VT em Lote — {fmtMes(competencia)}</div>
                  <div style={{ fontSize:11, color:'var(--muted-foreground)' }}>
                    {loteStep===1 ? 'Passo 1 de 2 — Selecione a obra e o período' : 'Passo 2 de 2 — Selecione os colaboradores'}
                  </div>
                </div>
              </div>
              <button onClick={() => setModalLancarLote(false)} style={{ background:'none', border:'none', cursor:'pointer', color:'var(--muted-foreground)', lineHeight:1 }}>
                <X size={18} />
              </button>
            </div>

            {/* ── PASSO 1 ── */}
            {loteStep === 1 && (
              <div style={{ padding:'20px 24px', overflowY:'auto', flex:1, display:'flex', flexDirection:'column', gap:20 }}>

                {/* Seleção de obra */}
                <div>
                  <Label style={{ fontWeight:700, fontSize:13 }}>🏗️ Obra</Label>
                  <div style={{ fontSize:12, color:'var(--muted-foreground)', marginBottom:8 }}>Escolha uma obra ou todas. "Sem obra" inclui colaboradores sem alocação.</div>
                  <Select value={loteObraSel} onValueChange={setLoteObraSel}>
                    <SelectTrigger style={{ height:38 }}><SelectValue /></SelectTrigger>
                    <SelectContent position="popper" style={{ zIndex: 9999 }}>
                      <SelectItem value="todas">🌐 Todas as obras</SelectItem>
                      <SelectItem value="__sem_obra">📋 Sem obra alocada</SelectItem>
                      {obras.map(o => <SelectItem key={o.id} value={o.id}>🏗️ {o.nome}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>

                {/* Período */}
                <div>
                  <Label style={{ fontWeight:700, fontSize:13 }}>📅 Período de Referência</Label>
                  <div style={{ fontSize:12, color:'var(--muted-foreground)', marginBottom:8 }}>Datas de início e fim do VT. Os dias úteis serão calculados automaticamente.</div>
                  <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12 }}>
                    <div>
                      <Label className="text-xs">Data Início</Label>
                      <Input type="date" value={loteInicio} onChange={e => setLoteInicio(e.target.value)} className="mt-1 h-9" />
                    </div>
                    <div>
                      <Label className="text-xs">Data Fim</Label>
                      <Input type="date" value={loteFim} onChange={e => setLoteFim(e.target.value)} className="mt-1 h-9" />
                    </div>
                  </div>
                </div>

                {/* Considerar sábado */}
                <div style={{ display:'flex', alignItems:'center', gap:12, background:'var(--muted)', borderRadius:10, padding:'12px 16px' }}>
                  <label style={{ display:'flex', alignItems:'center', gap:8, cursor:'pointer', userSelect:'none', flex:1 }}>
                    <input type="checkbox" checked={loteContarSabadoLancar} onChange={e => setLoteContarSabadoLancar(e.target.checked)}
                      style={{ width:16, height:16, accentColor:'#7c3aed' }} />
                    <div>
                      <div style={{ fontWeight:700, fontSize:13 }}>📅 Considerar sábado como dia útil</div>
                      <div style={{ fontSize:11, color:'var(--muted-foreground)', marginTop:2 }}>
                        Quando marcado, sábados entram na contagem de dias e no valor do VT. Use para obras que trabalham aos sábados.
                      </div>
                    </div>
                  </label>
                  <span style={{ fontSize:11, fontWeight:700, color: loteContarSabadoLancar ? '#7c3aed' : '#94a3b8', background: loteContarSabadoLancar ? '#ede9fe' : 'var(--border)', borderRadius:6, padding:'2px 8px', whiteSpace:'nowrap' }}>
                    {loteContarSabadoLancar ? 'SIM' : 'NÃO'}
                  </span>
                </div>

                {/* Desconto 6% — exibir info com base na obra selecionada */}
                {(() => {
                  const obrasSel = loteObraSel === 'todas'
                    ? obras
                    : loteObraSel === '__sem_obra'
                      ? []
                      : obras.filter(o => o.id === loteObraSel)
                  const algumDesconta = obrasSel.some(o => o.desconta_vt)
                  const todoDesconta  = obrasSel.length > 0 && obrasSel.every(o => o.desconta_vt)
                  const msg = loteObraSel === '__sem_obra'
                    ? 'Colaboradores sem obra: sem desconto de 6%.'
                    : todoDesconta
                      ? '⚠ Esta obra desconta 6% do salário bruto — aplicado apenas para CLT.'
                      : algumDesconta
                        ? '⚠ Algumas obras desta seleção descontam 6% (CLT). O desconto é aplicado por obra de cada colaborador.'
                        : '✓ Esta obra não aplica desconto de 6% — empresa arca com 100% do VT.'
                  const cor = algumDesconta ? '#92400e' : '#15803d'
                  const bg  = algumDesconta ? '#fefce8' : '#f0fdf4'
                  const bdr = algumDesconta ? '#fde68a' : '#bbf7d0'
                  return (
                    <div style={{ background:bg, border:`1px solid ${bdr}`, borderRadius:10, padding:'12px 16px' }}>
                      <div style={{ fontWeight:700, fontSize:13, color:cor }}>💰 Desconto de 6% — somente CLT</div>
                      <div style={{ fontSize:11, color:cor, marginTop:3 }}>{msg}</div>
                      <div style={{ fontSize:10, color:'var(--muted-foreground)', marginTop:4 }}>O desconto é definido por obra (cadastro da obra) e aplicado automaticamente.</div>
                    </div>
                  )
                })()}

                {/* Preview contagem */}
                <div style={{ background:'var(--muted)', borderRadius:8, padding:'12px 14px', fontSize:12 }}>
                  <div style={{ fontWeight:700, marginBottom:6, color:'var(--foreground)' }}>Resumo da seleção:</div>
                  <div style={{ color:'var(--muted-foreground)' }}>
                    {(() => {
                      const cnt = loteObraSel === 'todas' ? colaboradores.length
                        : loteObraSel === '__sem_obra' ? colaboradores.filter(c => !c.obra_id).length
                        : colaboradores.filter(c => c.obra_id === loteObraSel).length
                      const nomeObra = loteObraSel === 'todas' ? 'todas as obras'
                        : loteObraSel === '__sem_obra' ? 'sem obra alocada'
                        : obras.find(o => o.id === loteObraSel)?.nome ?? ''
                      return `${cnt} colaborador(es) de "${nomeObra}" | Período: ${loteInicio || '—'} → ${loteFim || '—'} | Sábado: ${loteContarSabadoLancar ? '✓ contado' : '✗ não contado'}`
                    })()}
                  </div>
                </div>
              </div>
            )}

            {/* ── PASSO 2 ── */}
            {loteStep === 2 && (() => {
              const selecionadosIds = [...loteIncluir.entries()].filter(([,v]) => v).map(([k]) => k)
              const semConfig = loteColabs.filter(c => selecionadosIds.includes(c.id) && !(vtDiarioColab(c.vt_dados as any) > 0))
              // calcular dias do período (respeitando loteContarSabadoLancar)
              let qtdDias = diasUteisMes.length
              if (loteInicio && loteFim) {
                const [iy,im,id2] = loteInicio.split('-').map(Number)
                const [fy,fm,fd]  = loteFim.split('-').map(Number)
                const cur = new Date(iy,im-1,id2)
                const fimD = new Date(fy,fm-1,fd)
                let cnt2=0
                while(cur<=fimD){
                  const dow = cur.getDay()
                  if(dow !== 0 && (dow !== 6 || loteContarSabadoLancar)) cnt2++
                  cur.setDate(cur.getDate()+1)
                }
                if(cnt2>0) qtdDias=cnt2
              }
              const totalEstimado = loteColabs
                .filter(c => selecionadosIds.includes(c.id) && vtDiarioColab(c.vt_dados as any) > 0)
                .reduce((s,c) => {
                  const isCLT = (c.tipo_contrato??'').toLowerCase()==='clt'
                  const vtDiario = vtDiarioColab(c.vt_dados as any)
                  const bruto = +(vtDiario * qtdDias).toFixed(2)
                  const obraC = obras.find(o => o.id === c.obra_id)
                  const desc  = (obraC?.desconta_vt && isCLT) ? +Math.min((c.salario??0)*0.06, bruto).toFixed(2) : 0
                  return s + (bruto - desc)
                }, 0)

              // agrupar por obra
              const obraMap = new Map<string, typeof loteColabs>()
              loteColabs.forEach(c => {
                const key = c.obra_nome || '(Sem obra)'
                if (!obraMap.has(key)) obraMap.set(key, [])
                obraMap.get(key)!.push(c)
              })

              return (
                <div style={{ overflowY:'auto', flex:1 }}>
                  {/* barra de ações */}
                  <div style={{ padding:'12px 24px', background:'var(--muted)', borderBottom:'1px solid var(--border)', display:'flex', alignItems:'center', gap:12, flexWrap:'wrap' }}>
                    <button onClick={() => { const m=new Map<string,boolean>(); loteColabs.forEach(c=>m.set(c.id,true)); setLoteIncluir(m) }}
                      style={{ fontSize:12, fontWeight:600, color:'#1d4ed8', background:'none', border:'none', cursor:'pointer' }}>
                      ✓ Marcar todos
                    </button>
                    <button onClick={() => { const m=new Map<string,boolean>(); loteColabs.forEach(c=>m.set(c.id,false)); setLoteIncluir(m) }}
                      style={{ fontSize:12, fontWeight:600, color:'#dc2626', background:'none', border:'none', cursor:'pointer' }}>
                      ✗ Desmarcar todos
                    </button>
                    <div style={{ flex:1 }} />
                    <div style={{ fontSize:13, fontWeight:700 }}>
                      {selecionadosIds.length} selecionado(s) · Empresa: <span style={{ color:'#15803d' }}>{formatCurrency(totalEstimado)}</span>
                    </div>
                  </div>

                  {/* Lista por obra */}
                  {[...obraMap.entries()].map(([obraNome, colabs]) => (
                    <div key={obraNome}>
                      <div style={{ padding:'8px 24px', background:'#f8fafc', borderBottom:'1px solid var(--border)', display:'flex', alignItems:'center', gap:8 }}>
                        <Building2 size={13} style={{ color:'#64748b' }} />
                        <span style={{ fontSize:12, fontWeight:700, color:'#334155' }}>{obraNome}</span>
                        <span style={{ fontSize:11, color:'#94a3b8' }}>({colabs.length} colaboradores)</span>
                        <button onClick={() => {
                          const m = new Map(loteIncluir)
                          const todos = colabs.every(c => m.get(c.id))
                          colabs.forEach(c => m.set(c.id, !todos))
                          setLoteIncluir(m)
                        }} style={{ marginLeft:8, fontSize:11, color:'#1d4ed8', background:'none', border:'none', cursor:'pointer', fontWeight:600 }}>
                          {colabs.every(c => loteIncluir.get(c.id)) ? 'Desmarcar grupo' : 'Marcar grupo'}
                        </button>
                      </div>
                      {colabs.map((c, i) => {
                        const marcado = loteIncluir.get(c.id) ?? false
                        const isCLT = (c.tipo_contrato??'').toLowerCase()==='clt'
                        const vtDiario = vtDiarioColab(c.vt_dados as any)
                        const temVT  = vtDiario > 0
                        const bruto  = temVT ? +(vtDiario * qtdDias).toFixed(2) : 0
                        // desconto 6% por obra do colaborador — não por toggle global
                        const obraC2 = obras.find(o => o.id === c.obra_id)
                        const desc6  = (obraC2?.desconta_vt && isCLT && temVT) ? +Math.min((c.salario??0)*0.06, bruto).toFixed(2) : 0
                        const empresa= bruto - desc6
                        return (
                          <div key={c.id} onClick={() => { const m=new Map(loteIncluir); m.set(c.id,!marcado); setLoteIncluir(m) }}
                            style={{ display:'flex', alignItems:'center', gap:12, padding:'9px 24px', borderBottom:'1px solid var(--border)', cursor:'pointer',
                              background: !marcado ? '#f8fafc' : (i%2===0?'var(--card)':'transparent'),
                              opacity: !marcado ? 0.5 : 1, transition:'all 100ms' }}>
                            <div style={{ flexShrink:0, width:20, height:20, borderRadius:5, border:`2px solid ${marcado?'#1d4ed8':'#cbd5e1'}`, background:marcado?'#1d4ed8':'transparent', display:'flex', alignItems:'center', justifyContent:'center' }}>
                              {marcado && <span style={{ color:'#fff', fontSize:12, lineHeight:1 }}>✓</span>}
                            </div>
                            <div style={{ flex:1, minWidth:0 }}>
                              <div style={{ fontWeight:600, fontSize:13 }}>{c.nome}</div>
                              <div style={{ fontSize:11, color:'var(--muted-foreground)' }}>
                                {c.funcao_nome || '—'} ·&nbsp;
                                <span style={{ color: isCLT ? '#1d4ed8' : '#b45309', fontWeight:600 }}>{isCLT ? 'CLT' : (c.tipo_contrato||'Autôn.')}</span>
                                {!temVT && <span style={{ color:'#ef4444', marginLeft:6 }}>⚠ Sem VT configurado</span>}
                                {temVT && <span style={{ color:'#64748b', marginLeft:6 }}>{(c.vt_dados as any)?.modalidade === 'gasolina' ? '⛽ Gasolina' : '🚌 Transporte'} · {formatCurrency(vtDiario)}/dia</span>}
                              </div>
                            </div>
                            {temVT ? (
                              <div style={{ textAlign:'right', fontSize:12 }}>
                                <div style={{ fontWeight:700, color:'#1d4ed8' }}>{formatCurrency(empresa)}</div>
                                <div style={{ color:'var(--muted-foreground)', fontSize:10 }}>{formatCurrency(vtDiario)}/dia × {qtdDias} dias</div>
                                {desc6>0 && <div style={{ color:'#b45309', fontSize:10 }}>-6%: -{formatCurrency(desc6)}</div>}
                              </div>
                            ) : (
                              <div style={{ fontSize:11, color:'#ef4444' }}>—</div>
                            )}
                          </div>
                        )
                      })}
                    </div>
                  ))}

                  {semConfig.length > 0 && (
                    <div style={{ margin:'12px 24px', background:'#fef3c7', border:'1px solid #fde68a', borderRadius:8, padding:'10px 12px', fontSize:12, color:'#92400e' }}>
                      <strong>⚠ {semConfig.length} colaborador(es) selecionado(s) sem VT configurado</strong> não serão lançados: {semConfig.map(c=>c.nome).join(', ')}
                    </div>
                  )}
                </div>
              )
            })()}

            {/* Footer */}
            <div style={{ padding:'14px 24px', borderTop:'1px solid var(--border)', display:'flex', alignItems:'center', justifyContent:'space-between', gap:10 }}>
              <div style={{ fontSize:12, color:'var(--muted-foreground)' }}>
                {loteStep === 2 && (
                  <>
                    <span>Período: {loteInicio} → {loteFim}</span>
                    {loteContarSabadoLancar && <span style={{ marginLeft:12, color:'#7c3aed', fontWeight:600 }}>📅 Contando sábado</span>}
                  </>
                )}
              </div>
              <div style={{ display:'flex', gap:10 }}>
                {loteStep === 2 && (
                  <Button variant="outline" onClick={() => setLoteStep(1)} disabled={savingLancarLote}>
                    ← Voltar
                  </Button>
                )}
                <Button variant="outline" onClick={() => setModalLancarLote(false)} disabled={savingLancarLote}>
                  Cancelar
                </Button>
                {loteStep === 1 ? (
                  <Button onClick={loteAvancar} style={{ background:'#1d4ed8', color:'#fff' }}
                    disabled={!loteInicio || !loteFim}>
                    Próximo: selecionar colaboradores →
                  </Button>
                ) : (
                  <Button onClick={handleLancarLote} disabled={savingLancarLote}
                    style={{ background:'#15803d', color:'#fff', gap:6 }}>
                    {savingLancarLote
                      ? <><Loader2 size={14} className="animate-spin" /> Lançando…</>
                      : <><Plus size={14} /> Lançar VT em Lote</>}
                  </Button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
