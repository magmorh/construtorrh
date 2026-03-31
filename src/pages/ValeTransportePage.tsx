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
    const diasEfetivos = Math.max(0, diasUtil - numFaltas + numSabadosExtras)
    const valorBruto = vtDiario > 0 ? +(vtDiario * diasEfetivos).toFixed(2) : 0

    // Desconto de 6%: somente CLT E se a obra do colaborador tem desconta_vt=true
    const isCLT = (colab?.tipo_contrato ?? 'clt').toLowerCase() === 'clt'
    const obraColab = obras.find(o => o.id === colab?.obra_id)
    const obraDesconta = obraColab?.desconta_vt ?? false
    const salario = colab?.salario ?? 0
    const desc6 = (obraDesconta && isCLT && salario > 0)
      ? +Math.min(salario * 0.06, valorBruto).toFixed(2)
      : 0

    return {
      dias_trabalhados: String(diasEfetivos),
      valor: valorBruto > 0 ? valorBruto.toFixed(2) : '',
      desconto_colaborador: desc6 > 0 ? desc6.toFixed(2) : '0',
      valor_empresa: valorBruto > 0 ? Math.max(0, valorBruto - desc6).toFixed(2) : '0',
      descontar_6pct: obraDesconta && isCLT,
    }
  }

  // ─── lista lateral filtrada ───────────────────────────────────────────────
  const colabsFiltrados = useMemo(() => colaboradores.filter(c => {
    // Ocultar colaborador se ainda não admitido no mês da competência
    if (c.data_admissao) {
      const ultimoDiaMes = `${competencia}-31`
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
  function openCreate() {
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

    // Regra de sábado:
    // - considera_sabado_util = true  → sábado JÁ está no VT mensal (contar para calcular proporção)
    // - considera_sabado_util = false → sábado É dia trabalhado e DEVE ter VT (contar também)
    // Em ambos os casos, contarSab = true para o cálculo de dias.
    const contarSab  = true   // sempre contar sábado nos dias úteis do VT

    // recalcularPeriodo já lê desconta_vt da obra do colaborador internamente
    const calc = recalcularPeriodo(primeiroDia(competencia), ultimoDia(competencia), contarSab, competencia, colabSel, null, 0, 0)

    setEditando(null)
    setVtDiarioSnap(null)   // novo lançamento sempre usa base atual do colaborador
    setForm({
      competencia,
      data_inicio:  primeiroDia(competencia),
      data_fim:     ultimoDia(competencia),
      contar_sabado: contarSab,
      tipo:         tipoAuto,
      num_faltas: '0',
      num_sabados_extras: '0',
      ...calc,
      observacoes: '',
    })
    setModalOpen(true)
  }

  function openEdit(row: VTRow) {
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
    const payload = {
      colaborador_id: colabSel.id,
      competencia:    form.competencia,
      data_inicio:    form.data_inicio || null,
      data_fim:       form.data_fim    || null,
      tipo: (form.tipo as ValeTransporte['tipo']) || null,
      valor: parseFloat(form.valor) || null,
      dias_trabalhados: parseInt(form.dias_trabalhados) || 0,
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
          <Button variant="outline" className="gap-2" onClick={() => { setObraLote(obraFiltro); setSelecionados(new Set()); setModalLote(true) }}>
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
                          <th style={{ padding: '9px 14px', textAlign: 'right', fontWeight: 700 }}>Valor Bruto</th>
                          <th style={{ padding: '9px 14px', textAlign: 'right', fontWeight: 700 }}>Desc. 6%</th>
                          <th style={{ padding: '9px 14px', textAlign: 'right', fontWeight: 700 }}>Empresa</th>
                          <th style={{ padding: '9px 14px', textAlign: 'center', fontWeight: 700 }}>Status</th>
                          <th style={{ padding: '9px 14px', textAlign: 'right', fontWeight: 700 }}>Ações</th>
                        </tr>
                      </thead>
                      <tbody>
                        {vtDoColab.map((r, i) => {
                          const eMesCompleto = r.data_inicio === primeiroDia(r.competencia) && r.data_fim === ultimoDia(r.competencia)
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
                              <td style={{ padding: '10px 14px', textAlign: 'right' }}>{formatCurrency(r.valor)}</td>
                              <td style={{ padding: '10px 14px', textAlign: 'right', color: r.descontar_6pct ? '#dc2626' : 'var(--muted-foreground)' }}>
                                {r.descontar_6pct ? '−' + formatCurrency(r.desconto_colaborador) : <span style={{ fontSize: 10 }}>isento</span>}
                              </td>
                              <td style={{ padding: '10px 14px', textAlign: 'right', fontWeight: 700, color: '#1d4ed8' }}>
                                {formatCurrency(r.valor_empresa)}
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
                          <td colSpan={5} style={{ padding: '9px 14px', fontSize: 12 }}>Total empresa — {vtDoColab.length} lançamento(s)</td>
                          <td style={{ padding: '9px 14px', textAlign: 'right', color: '#1d4ed8' }}>{formatCurrency(totalPagoMes)}</td>
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
      {modalOpen && colabSel && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 80, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
          <div style={{ background: 'var(--background)', borderRadius: 14, width: 500, maxHeight: '92vh', overflowY: 'auto', padding: 28, boxShadow: '0 20px 60px rgba(0,0,0,0.3)' }}>

            {/* Título */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16 }}>
              <div>
                <h3 style={{ fontWeight: 800, fontSize: 16, margin: 0 }}>{editando ? 'Editar VT' : 'Novo Lançamento de VT'}</h3>
                <p style={{ fontSize: 12, color: 'var(--muted-foreground)', marginTop: 4 }}>
                  {colabSel.chapa} — <strong>{colabSel.nome}</strong> · {fmtMes(form.competencia)}
                </p>
              </div>
              <button onClick={() => setModalOpen(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--muted-foreground)', padding: 4 }}>
                <X size={18} />
              </button>
            </div>

            {/* Info VT do colaborador */}
            {vtDiario > 0 && (
              <div style={{ background: 'var(--muted)', borderRadius: 8, padding: '10px 14px', marginBottom: 16, fontSize: 12, display: 'flex', gap: 16, flexWrap: 'wrap' }}>
                <span>🚌 <strong>{(colabSel.vt_dados as any)?.modalidade ?? '—'}</strong></span>
                <span>R$ <strong>{vtDiario.toFixed(2)}</strong>/dia</span>
                <span>Mês estimado: <strong>{formatCurrency(vtMensal)}</strong></span>
              </div>
            )}

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>

              {/* Período */}
              <div>
                <Label className="text-xs">📅 Período de *</Label>
                <input type="date" value={form.data_inicio} onChange={e => setField('data_inicio', e.target.value)}
                  min={primeiroDia(competencia)} max={ultimoDia(competencia)}
                  style={{ width: '100%', height: 36, padding: '0 10px', fontSize: 13, border: '1px solid var(--border)', borderRadius: 6, background: 'var(--background)', color: 'var(--foreground)', marginTop: 4, boxSizing: 'border-box' }} />
              </div>
              <div>
                <Label className="text-xs">📅 até *</Label>
                <input type="date" value={form.data_fim} onChange={e => setField('data_fim', e.target.value)}
                  min={primeiroDia(competencia)} max={ultimoDia(competencia)}
                  style={{ width: '100%', height: 36, padding: '0 10px', fontSize: 13, border: '1px solid var(--border)', borderRadius: 6, background: 'var(--background)', color: 'var(--foreground)', marginTop: 4, boxSizing: 'border-box' }} />
              </div>

              {/* Tick sábado + dias calculados */}
              <div className="col-span-2">
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: 'var(--muted)', borderRadius: 8, padding: '10px 14px', border: '1px solid var(--border)' }}>
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 600 }}>Contar sábado como dia trabalhado</div>
                    <div style={{ fontSize: 11, color: 'var(--muted-foreground)', marginTop: 2 }}>
                      {form.contar_sabado ? 'Contando Seg → Sáb' : 'Contando apenas Seg → Sex'}
                      {' · '}
                      <strong style={{ color: 'var(--foreground)' }}>{form.dias_trabalhados} dia(s)</strong> no período
                      {' · '}
                      {obras.find(o => o.id === colabSel?.obra_id)?.considera_sabado_util
                        ? <span style={{ color:'#15803d', fontWeight:600 }}>Sáb. já incluso no VT mensal</span>
                        : <span style={{ color:'#b45309', fontWeight:600 }}>Sáb. pago separado</span>
                      }
                    </div>
                  </div>
                  <button onClick={() => setField('contar_sabado', !form.contar_sabado)}
                    style={{ background: 'none', border: 'none', cursor: 'pointer', color: form.contar_sabado ? '#1d4ed8' : 'var(--muted-foreground)' }}>
                    {form.contar_sabado ? <ToggleRight size={30} /> : <ToggleLeft size={30} />}
                  </button>
                </div>
              </div>

              {/* Tipo — puxado do cadastro */}
              <div>
                <Label className="text-xs">Tipo</Label>
                <Select value={form.tipo} onValueChange={v => setField('tipo', v)}>
                  <SelectTrigger className="mt-1 h-9"><SelectValue /></SelectTrigger>
                  <SelectContent position="popper" style={{ zIndex: 9999 }}>
                    {TIPO_OPTIONS.map(t => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>

              {/* Dias trabalhados — somente leitura */}
              <div>
                <Label className="text-xs" style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                  Dias trabalhados
                  <span style={{ fontSize: 9, background: 'var(--muted)', color: 'var(--muted-foreground)', borderRadius: 3, padding: '1px 4px', fontWeight: 600 }}>AUTO</span>
                </Label>
                <div style={{ marginTop: 4, height: 36, display: 'flex', alignItems: 'center', padding: '0 12px', background: 'var(--muted)', border: '1px solid var(--border)', borderRadius: 6, fontSize: 14, fontWeight: 700, color: 'var(--foreground)' }}>
                  {form.dias_trabalhados || '0'}
                </div>
              </div>

              {/* Valor VT — somente leitura (base do colaborador) */}
              <div className="col-span-2">
                <Label className="text-xs" style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                  Valor do VT (R$)
                  <span style={{ fontSize: 9, background: vtDiarioSnap != null ? '#fef3c7' : 'var(--muted)', color: vtDiarioSnap != null ? '#92400e' : 'var(--muted-foreground)', borderRadius: 3, padding: '1px 4px', fontWeight: 600 }}>
                    {vtDiarioSnap != null ? `🔒 TAXA TRAVADA: R$ ${vtDiarioSnap.toFixed(4)}/dia` : 'AUTO — base do colaborador'}
                  </span>
                </Label>
                <div style={{ marginTop: 4, height: 36, display: 'flex', alignItems: 'center', padding: '0 12px', background: 'var(--muted)', border: '1px solid var(--border)', borderRadius: 6, fontSize: 14, fontWeight: 700, color: 'var(--foreground)' }}>
                  {parseFloat(form.valor) > 0 ? formatCurrency(parseFloat(form.valor)) : <span style={{ color: 'var(--muted-foreground)', fontWeight: 400 }}>Sem VT configurado no cadastro</span>}
                </div>
              </div>

              {/* Faltas e Sábados extras — ajuste fino do VT */}
              <div className="col-span-2">
                <div style={{ background: '#fef9c3', border: '1px solid #fde047', borderRadius: 8, padding: '10px 14px' }}>
                  <div style={{ fontSize: 12, fontWeight: 700, color: '#713f12', marginBottom: 8 }}>⚠ Ajuste por falta / sábado trabalhado</div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                    <div>
                      <Label className="text-xs" style={{ color: '#713f12' }}>Faltas (descontar dias)</Label>
                      <Input type="number" min={0} max={30} value={form.num_faltas}
                        onChange={e => setField('num_faltas', e.target.value)}
                        className="mt-1 h-8 text-sm"
                        placeholder="0"
                      />
                      <div style={{ fontSize: 10, color: '#92400e', marginTop: 3 }}>
                        Cada falta desconta 1 dia de VT
                      </div>
                    </div>
                    <div>
                      <Label className="text-xs" style={{ color: '#713f12' }}>Sáb. trabalhados extras</Label>
                      <Input type="number" min={0} max={5} value={form.num_sabados_extras}
                        onChange={e => setField('num_sabados_extras', e.target.value)}
                        className="mt-1 h-8 text-sm"
                        placeholder="0"
                      />
                      <div style={{ fontSize: 10, color: '#92400e', marginTop: 3 }}>
                        {obras.find(o => o.id === colabSel?.obra_id)?.considera_sabado_util
                          ? '✓ Obra considera sáb. útil — sáb já contado no período'
                          : 'Obra não conta sáb. — adicione sábados trabalhados aqui'}
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Desconto 6% — automático por obra, somente CLT */}
              <div className="col-span-2">
                {(() => {
                  const ehCLT = (colabSel?.tipo_contrato ?? 'clt').toLowerCase() === 'clt'
                  const obraCol = obras.find(o => o.id === colabSel?.obra_id)
                  const obraDesc = obraCol?.desconta_vt ?? false
                  if (!ehCLT) return (
                    <div style={{ display:'flex', alignItems:'center', gap:8, background:'#f0fdf4', border:'1px solid #bbf7d0', borderRadius:8, padding:'10px 14px' }}>
                      <span style={{ fontSize:18 }}>✅</span>
                      <div>
                        <div style={{ fontSize:13, fontWeight:600, color:'#15803d' }}>Autônomo / PJ — sem desconto de 6%</div>
                        <div style={{ fontSize:11, color:'#16a34a', marginTop:2 }}>Desconto de 6% se aplica apenas a colaboradores CLT.</div>
                      </div>
                    </div>
                  )
                  return obraDesc ? (
                    <div style={{ display:'flex', alignItems:'center', gap:8, background:'#fef3c7', border:'1px solid #fde68a', borderRadius:8, padding:'10px 14px' }}>
                      <span style={{ fontSize:18 }}>⚠️</span>
                      <div>
                        <div style={{ fontSize:13, fontWeight:600, color:'#92400e' }}>Desconto de 6% — CLT (definido pela obra)</div>
                        <div style={{ fontSize:11, color:'#b45309', marginTop:2 }}>
                          Desconto: {formatCurrency(parseFloat(form.desconto_colaborador)||0)} | Empresa paga: {formatCurrency(parseFloat(form.valor_empresa)||0)}
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div style={{ display:'flex', alignItems:'center', gap:8, background:'#f0fdf4', border:'1px solid #bbf7d0', borderRadius:8, padding:'10px 14px' }}>
                      <span style={{ fontSize:18 }}>✅</span>
                      <div>
                        <div style={{ fontSize:13, fontWeight:600, color:'#15803d' }}>Sem desconto de 6% — esta obra não aplica desconto</div>
                        <div style={{ fontSize:11, color:'#16a34a', marginTop:2 }}>Empresa arca com 100% do VT. Para ativar, habilite na obra.</div>
                      </div>
                    </div>
                  )
                })()}
              </div>

              {/* Resumo financeiro do VT */}
              <div className="col-span-2">
                <Label className="text-xs" style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                  Resumo do VT
                  <span style={{ fontSize: 9, background: '#dbeafe', color: '#1d4ed8', borderRadius: 3, padding: '1px 4px', fontWeight: 600 }}>AUTO</span>
                </Label>
                <div style={{ marginTop:4, display:'grid', gridTemplateColumns:'1fr 1fr', gap:6 }}>
                  <div style={{ padding:'8px 12px', background:'#eff6ff', border:'1px solid #bfdbfe', borderRadius:6, textAlign:'center' }}>
                    <div style={{ fontSize:10, color:'#6b7280', marginBottom:2 }}>Valor Bruto</div>
                    <div style={{ fontSize:15, fontWeight:800, color:'#1d4ed8' }}>{formatCurrency(parseFloat(form.valor)||0)}</div>
                  </div>
                  <div style={{ padding:'8px 12px', background: parseFloat(form.desconto_colaborador||'0') > 0 ? '#fef2f2':'#f0fdf4', border:`1px solid ${parseFloat(form.desconto_colaborador||'0') > 0 ? '#fecaca':'#bbf7d0'}`, borderRadius:6, textAlign:'center' }}>
                    <div style={{ fontSize:10, color:'#6b7280', marginBottom:2 }}>Empresa paga</div>
                    <div style={{ fontSize:15, fontWeight:800, color: parseFloat(form.desconto_colaborador||'0') > 0 ? '#dc2626':'#15803d' }}>{formatCurrency(parseFloat(form.valor_empresa)||0)}</div>
                  </div>
                </div>
              </div>

              {/* Observações */}
              <div className="col-span-2">
                <Label className="text-xs">Observações</Label>
                <Textarea value={form.observacoes} onChange={e => setField('observacoes', e.target.value)} className="mt-1" rows={2} />
              </div>
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 20 }}>
              <Button variant="outline" onClick={() => setModalOpen(false)}>Cancelar</Button>
              <Button onClick={handleSave} disabled={saving}>{saving ? 'Salvando…' : editando ? 'Salvar alterações' : 'Lançar VT'}</Button>
            </div>
          </div>
        </div>
      )}

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
        // Agrupar VTs por colaborador para exibição em linhas
        const colabsNoLote = Array.from(
          new Map(vtsPendentesLote.map(r => {
            const c = colaboradores.find(x => x.id === r.colaborador_id)
            return [r.colaborador_id, c]
          })).entries()
        ).filter(([, c]) => !!c)

        const vtsPorColab = (colabId: string) =>
          vtsPendentesLote.filter(r => r.colaborador_id === colabId)

        const obraFiltrada = obras.find(o => o.id === obraLote)

        return (
          <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 200, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
            <div style={{ background: 'var(--card)', borderRadius: 16, width: '100%', maxWidth: 820, maxHeight: '92vh', display: 'flex', flexDirection: 'column', overflow: 'hidden', boxShadow: '0 25px 50px rgba(0,0,0,0.3)' }}>

              {/* ── Header ── */}
              <div style={{ padding: '18px 24px 14px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <Building2 size={20} style={{ color: '#7c3aed' }} />
                  <div>
                    <div style={{ fontWeight: 800, fontSize: 17 }}>Fechar VT em Lote — {fmtMes(competencia)}</div>
                    <div style={{ fontSize: 12, color: 'var(--muted-foreground)' }}>Configure globalmente e selecione os lançamentos a enviar para pagamento</div>
                  </div>
                </div>
                
              </div>

              {/* ── Configurações Globais ── */}
              <div style={{ padding: '14px 24px', borderBottom: '1px solid var(--border)', background: 'var(--muted)' }}>
                <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--muted-foreground)', marginBottom: 10 }}>
                  ⚙️ Configurações Gerais — aplicadas a todos os selecionados
                </div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 20, alignItems: 'center' }}>

                  {/* Filtro obra */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <Label style={{ fontSize: 12, whiteSpace: 'nowrap', fontWeight: 600 }}>Obra:</Label>
                    <Select value={obraLote} onValueChange={v => { setObraLote(v); setSelecionados(new Set()) }}>
                      <SelectTrigger style={{ width: 200, height: 32, fontSize: 12 }}><SelectValue /></SelectTrigger>
                      <SelectContent position="popper" style={{ zIndex: 9999 }}>
                        <SelectItem value="todas">Todas as obras</SelectItem>
                        {obras.map(o => <SelectItem key={o.id} value={o.id}>{o.nome}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>

                  {/* Período */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <Label style={{ fontSize: 12, fontWeight: 600 }}>Período:</Label>
                    <span style={{ fontSize: 12, background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 6, padding: '4px 10px', fontWeight: 600 }}>
                      {fmtData(primeiroDia(competencia))} → {fmtData(ultimoDia(competencia))}
                    </span>
                  </div>

                  {/* Contar sábado */}
                  <label style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer', fontSize: 12, fontWeight: 600, userSelect: 'none' }}>
                    <input type="checkbox" checked={loteContarSabado} onChange={e => setLoteContarSabado(e.target.checked)}
                      style={{ width: 14, height: 14, accentColor: '#7c3aed' }} />
                    Contar sábado
                  </label>

                  {/* Info desconto 6% — automático por obra */}
                  {(() => {
                    if (obraLote === 'todas') return (
                      <span style={{ fontSize: 11, color: '#92400e', fontWeight: 600, background: '#fefce8', border: '1px solid #fde68a', borderRadius: 5, padding: '3px 8px' }}>
                        💰 Desc. 6%: por obra (auto)
                      </span>
                    )
                    const obraFech = obras.find(o => o.id === obraLote)
                    return obraFech?.desconta_vt
                      ? <span style={{ fontSize: 11, color: '#92400e', fontWeight: 600, background: '#fefce8', border: '1px solid #fde68a', borderRadius: 5, padding: '3px 8px' }}>💰 Esta obra aplica desc. 6% (CLT)</span>
                      : <span style={{ fontSize: 11, color: '#15803d', fontWeight: 600, background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: 5, padding: '3px 8px' }}>✓ Sem desconto de 6%</span>
                  })()}

                  <span style={{ marginLeft: 'auto', fontSize: 12, color: 'var(--muted-foreground)' }}>
                    {vtsPendentesLote.length} lançamento(s) · <strong>{selecionados.size}</strong> selecionado(s)
                  </span>
                </div>
                {obraFiltrada && (
                  <div style={{ marginTop: 8, fontSize: 11, color: '#7c3aed', fontWeight: 600 }}>
                    📍 Obra: {obraFiltrada.nome}
                  </div>
                )}
              </div>

              {/* ── Tabela por colaborador ── */}
              <div style={{ flex: 1, overflowY: 'auto' }}>
                {vtsPendentesLote.length === 0 ? (
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
                <div style={{ fontSize: 12, color: 'var(--muted-foreground)' }}>
                  {loteContarSabado && <span style={{ marginRight: 12 }}>📅 Contando sábado</span>}
                  <span style={{ color: '#92400e' }}>💰 Desconto de 6% definido por obra de cada colaborador (CLT)</span>
                </div>
                <div style={{ display: 'flex', gap: 10 }}>
                  <Button variant="outline" onClick={() => setModalLote(false)} disabled={savingLote}>Cancelar</Button>
                  <Button
                    disabled={selecionados.size === 0 || savingLote}
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
