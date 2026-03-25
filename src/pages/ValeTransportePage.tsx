import React, { useEffect, useState, useCallback, useMemo } from 'react'
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
import {
  Bus, Plus, Pencil, Trash2, Search, ChevronLeft, ChevronRight,
  CheckCircle2, AlertCircle, X, ToggleLeft, ToggleRight,
  CreditCard, Building2, CheckSquare, Square, Loader2,
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
  const [obras, setObras]   = useState<{id:string;nome:string}[]>([])
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

  // ── Fechamento em lote por obra ──────────────────────────────────────────
  const [modalLote, setModalLote] = useState(false)
  const [obraLote, setObraLote]   = useState('todas')
  const [selecionados, setSelecionados] = useState<Set<string>>(new Set())
  const [savingLote, setSavingLote] = useState(false)
  // Config global do lote (exibidas no modal)
  const [loteContarSabado, setLoteContarSabado] = useState(false)
  const [loteDesconto6pct, setLoteDesconto6pct] = useState(true)

  // ── Lançar em Lote (criar VT mês inteiro para todos sem VT) ──────────────
  const [modalLancarLote, setModalLancarLote] = useState(false)
  const [savingLancarLote, setSavingLancarLote] = useState(false)

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
      desconto_colaborador: '',
      valor_empresa: '',
      descontar_6pct: true,
      observacoes: '',
    }
  }

  // ─── fetch ─────────────────────────────────────────────────────────────────
  const fetchData = useCallback(async () => {
    setLoading(true)
    const [colRes, obraRes, vtRes] = await Promise.all([
      supabase
        .from('colaboradores')
        .select('id,nome,chapa,salario,vt_dados,obra_id,tipo_contrato,funcao_id,data_admissao,funcoes(nome,valor_hora_clt,valor_hora_autonomo),obras(nome)')
        .eq('status', 'ativo')
        .order('nome'),
      supabase.from('obras').select('id,nome').order('nome'),
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
          vt_valor_diario: c.vt_dados?.valor_diario ?? null,
          vt_tipo: c.vt_dados?.tipo ?? null,
        }
      }))
    }
    if (obraRes.data) setObras(obraRes.data)
    if (vtRes.data)   setVtRows(vtRes.data as VTRow[])
    setLoading(false)
  }, [])

  useEffect(() => { fetchData() }, [fetchData])

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
  // desconto_colaborador NÃO é calculado aqui — o 6% sobre salário bruto é apurado no Fechamento
  function recalcularPeriodo(
    dataIni: string, dataFim: string, contarSab: boolean,
    comp: string, colab: ColaboradorVT | null,
    vtDiarioFixo?: number | null
  ) {
    const diasUtil = contarDiasUteis(dataIni, dataFim, contarSab)
    let valorBruto = 0
    if (vtDiarioFixo != null && vtDiarioFixo > 0) {
      // Modo edição: usa a taxa diária salva no momento do lançamento original
      valorBruto = vtDiarioFixo * diasUtil
    } else {
      const vtMen = colab ? vtMensalColab(colab, comp, contarSab) : 0
      valorBruto  = vtMen > 0 ? calcValorProporcional(vtMen, dataIni, dataFim, comp, contarSab) : 0
    }
    // Valor empresa = valor bruto do VT (desconto 6% salário bruto apurado no Fechamento)
    return {
      dias_trabalhados: String(diasUtil),
      valor: valorBruto > 0 ? valorBruto.toFixed(2) : '',
      desconto_colaborador: '0',
      valor_empresa: valorBruto > 0 ? valorBruto.toFixed(2) : '0',
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
    const contarSab  = false
    const descontar  = true
    const calc       = recalcularPeriodo(primeiroDia(competencia), ultimoDia(competencia), contarSab, competencia, colabSel)

    setEditando(null)
    setVtDiarioSnap(null)   // novo lançamento sempre usa base atual do colaborador
    setForm({
      competencia,
      data_inicio:  primeiroDia(competencia),
      data_fim:     ultimoDia(competencia),
      contar_sabado: contarSab,
      tipo:         tipoAuto,
      ...calc,
      descontar_6pct: descontar,
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
      desconto_colaborador: String(row.desconto_colaborador ?? ''),
      valor_empresa: String(row.valor_empresa ?? ''),
      descontar_6pct: row.descontar_6pct ?? true,
      observacoes:   row.observacoes ?? '',
    })
    setModalOpen(true)
  }

  // ─── setField: qualquer mudança recalcula ─────────────────────────────────
  function setField(key: keyof FormData, value: string | boolean) {
    setForm(prev => {
      const next = { ...prev, [key]: value }

      // Mudanças que recalculam tudo (período ou tick sábado ou toggle desconto)
      if (key === 'data_inicio' || key === 'data_fim' || key === 'contar_sabado' || key === 'descontar_6pct') {
        const ini    = key === 'data_inicio'    ? String(value) : next.data_inicio
        const fim    = key === 'data_fim'       ? String(value) : next.data_fim
        const contSab = key === 'contar_sabado' ? Boolean(value) : next.contar_sabado
        const desc   = key === 'descontar_6pct' ? Boolean(value) : next.descontar_6pct
        // Em modo edição: usa taxa diária congelada do lançamento original (vtDiarioSnap)
        // Em novo lançamento: usa base atual do colaborador (vtDiarioSnap = null)
        const calc   = recalcularPeriodo(ini, fim, contSab, next.competencia, colabSel, vtDiarioSnap)
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

  // ─── Lançar em Lote: cria VT mês completo para todos sem VT da lista ────
  async function handleLancarLote() {
    // Colaboradores SEM VT — filtra por obra (sem filtro de status para não perder ninguém)
    const colabsParaLoteFunc = colaboradores.filter(c => {
      if (c.data_admissao) {
        const ultimoDiaMes = `${competencia}-31`
        if (c.data_admissao > ultimoDiaMes) return false
      }
      if (obraFiltro !== 'todas' && c.obra_id !== obraFiltro) return false
      return true
    })
    const semVT = colabsParaLoteFunc.filter(c => statusVTColab(c.id) === 'sem')
    if (semVT.length === 0) { toast.error('Nenhum colaborador sem VT nesta seleção'); return }
    setSavingLancarLote(true)

    const ini = primeiroDia(competencia)
    const fim = ultimoDia(competencia)

    const inserts = semVT
      .filter(c => c.vt_valor_diario && c.vt_valor_diario > 0)
      .map(c => {
        const qtd  = diasUteisMes.length
        const valorBruto = +(c.vt_valor_diario! * qtd).toFixed(2)
        return {
          colaborador_id:       c.id,
          competencia,
          data_inicio:          ini,
          data_fim:             fim,
          dias_trabalhados:     qtd,
          tipo:                 c.vt_tipo ?? 'cartao',
          valor:                valorBruto,
          desconto_colaborador: 0,
          valor_empresa:        valorBruto,
          descontar_6pct:       true,
          status:               'pendente',
        }
      })

    if (inserts.length === 0) {
      setSavingLancarLote(false)
      toast.error('Nenhum colaborador com valor de VT configurado')
      return
    }

    const { error } = await supabase.from('vale_transporte').insert(inserts)
    setSavingLancarLote(false)
    setModalLancarLote(false)
    if (error) { toast.error(`Erro ao lançar em lote: ${error.message}`); return }
    toast.success(`✅ ${inserts.length} VT(s) lançados para o mês completo!`)
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
  const colabsCompletos = new Set(
    vtDoMes.filter(r => r.data_inicio === primeiroDia(competencia) && r.data_fim === ultimoDia(competencia))
           .map(r => r.colaborador_id)
  ).size
  const colabsParciais = new Set(
    vtDoMes.filter(r => !(r.data_inicio === primeiroDia(competencia) && r.data_fim === ultimoDia(competencia)))
           .map(r => r.colaborador_id)
  ).size
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
    <div style={{ display: 'flex', height: '100%', flexDirection: 'column', gap: 0 }}>

      {/* Header */}
      <div style={{ paddingBottom: 16, display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 10 }}>
        <div>
          <h1 style={{ fontSize: 20, fontWeight: 700, margin: 0 }}>🚌 Vale Transporte</h1>
          <p style={{ fontSize: 13, color: 'var(--muted-foreground)', marginTop: 2 }}>Controle de vale transporte por colaborador</p>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
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
        {[
          { icon: <CheckCircle2 size={15}/>, label: 'VT Completo (mês)',  value: `${colabsCompletos} colaborador(es)`, color: '#15803d', alert: false },
          { icon: <AlertCircle  size={15}/>, label: 'VT Parcial',         value: `${colabsParciais} colaborador(es)`,  color: '#b45309', alert: false },
          { icon: <Bus          size={15}/>, label: 'Total Empresa (mês)', value: formatCurrency(totalEmpresaMes),      color: '#1d4ed8', alert: false },
          { icon: <AlertCircle  size={15}/>, label: 'Sem VT no mês',       value: `${colabsSemVTNoMes} colaborador(es)`, color: colabsSemVTNoMes > 0 ? '#dc2626' : '#6b7280', alert: colabsSemVTNoMes > 0 },
        ].map((c, i) => (
          <div key={i} style={{ background: c.alert ? '#fef2f2' : 'var(--card)', border: `1px solid ${c.alert ? '#fecaca' : 'var(--border)'}`, borderRadius: 10, padding: '12px 16px', position: 'relative', overflow: 'hidden' }}>
            {c.alert && <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 3, background: '#dc2626', borderRadius: '10px 10px 0 0' }} />}
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: c.color, marginBottom: 4 }}>
              {c.icon}<span style={{ fontSize: 11, fontWeight: 600 }}>{c.label}</span>
              {c.alert && <span style={{ marginLeft: 'auto', fontSize: 9, fontWeight: 800, background: '#dc2626', color: '#fff', borderRadius: 4, padding: '1px 5px' }}>ATENÇÃO</span>}
            </div>
            <div style={{ fontSize: 18, fontWeight: 800, color: c.color }}>{c.value}</div>
            {c.alert && <div style={{ fontSize: 10, color: '#dc2626', marginTop: 3 }}>⚠ VT cadastrado mas não lançado</div>}
          </div>
        ))}
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
                      {vtMensalColab_ > 0 && <span>6% do VT ≈ <strong>{formatCurrency(vtMensalColab_ * 0.06)}</strong>/mês</span>}
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
                    <Button variant="outline" size="sm"
                      onClick={() => setModalLancarLote(true)}
                      className="gap-2"
                      title="Cria VT do mês inteiro para todos colaboradores sem VT na lista atual">
                      <Plus size={14} /> Lançar em Lote
                    </Button>
                    <Button variant="outline" onClick={() => { setObraLote(colabSel?.obra_id ?? 'todas'); setSelecionados(new Set()); setModalLote(true) }} className="gap-2">
                      <Building2 size={15} /> Fechar em Lote
                    </Button>
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
                  <SelectContent>
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

              {/* Toggle desconto 6% — apenas flag, cálculo real no Fechamento */}
              <div className="col-span-2">
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: form.descontar_6pct ? '#fef3c7' : 'var(--muted)', borderRadius: 8, padding: '10px 14px', border: `1px solid ${form.descontar_6pct ? '#fde68a' : 'var(--border)'}` }}>
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 600, color: form.descontar_6pct ? '#92400e' : 'var(--foreground)' }}>
                      Descontar 6% do salário bruto do colaborador
                    </div>
                    <div style={{ fontSize: 11, color: form.descontar_6pct ? '#b45309' : 'var(--muted-foreground)', marginTop: 2 }}>
                      {form.descontar_6pct
                        ? '⚠ O desconto de 6% sobre o salário bruto será aplicado no Fechamento de Ponto'
                        : 'Empresa arca com 100% do VT — nenhum desconto no holerite'}
                    </div>
                  </div>
                  <button onClick={() => setField('descontar_6pct', !form.descontar_6pct)}
                    style={{ background: 'none', border: 'none', cursor: 'pointer', color: form.descontar_6pct ? '#b45309' : 'var(--muted-foreground)', flexShrink: 0 }}>
                    {form.descontar_6pct ? <ToggleRight size={32} /> : <ToggleLeft size={32} />}
                  </button>
                </div>
              </div>

              {/* Valor empresa = valor bruto do VT (desconto apurado no Fechamento) */}
              <div className="col-span-2">
                <Label className="text-xs" style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                  Valor total do VT (empresa)
                  <span style={{ fontSize: 9, background: '#dbeafe', color: '#1d4ed8', borderRadius: 3, padding: '1px 4px', fontWeight: 600 }}>AUTO</span>
                </Label>
                <div style={{ marginTop: 4, height: 36, display: 'flex', alignItems: 'center', padding: '0 12px', background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: 6, fontSize: 14, fontWeight: 800, color: '#1d4ed8' }}>
                  {formatCurrency(parseFloat(form.valor) || 0)}
                  {form.descontar_6pct && <span style={{ marginLeft: 8, fontSize: 10, color: '#b45309', fontWeight: 600 }}>(-6% sal. bruto no fechamento)</span>}
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
                      <SelectContent>
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

                  {/* Desconto 6% */}
                  <label style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer', fontSize: 12, fontWeight: 600, userSelect: 'none' }}>
                    <input type="checkbox" checked={loteDesconto6pct} onChange={e => setLoteDesconto6pct(e.target.checked)}
                      style={{ width: 14, height: 14, accentColor: '#7c3aed' }} />
                    Desconto 6% no Fechamento
                  </label>

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
                                    {loteDesconto6pct
                                      ? <span style={{ fontSize: 10, background: '#dcfce7', color: '#15803d', borderRadius: 4, padding: '2px 6px', fontWeight: 700 }}>✓ 6%</span>
                                      : <span style={{ fontSize: 10, color: 'var(--muted-foreground)' }}>—</span>}
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
                          {loteDesconto6pct && <span style={{ fontSize: 11, color: '#b45309', marginLeft: 8, fontWeight: 600 }}>· Desconto 6% aplicado no Fechamento</span>}
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
                  {loteDesconto6pct && <span style={{ color: '#b45309' }}>💰 Desconto de 6% será aplicado no Fechamento de Ponto</span>}
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

      {/* ══ MODAL LANÇAR EM LOTE ══ */}
      {modalLancarLote && (() => {
        // Usa TODOS os colaboradores ativos filtrados pela obra (igual à sidebar, sem filtro de status)
        const colabsParaLote = colaboradores.filter(c => {
          if (c.data_admissao) {
            const ultimoDiaMes = `${competencia}-31`
            if (c.data_admissao > ultimoDiaMes) return false
          }
          if (obraFiltro !== 'todas' && c.obra_id !== obraFiltro) return false
          return true
        })
        const semVT = colabsParaLote.filter(c => statusVTColab(c.id) === 'sem')
        const comVT = colabsParaLote.filter(c => statusVTColab(c.id) !== 'sem')
        const semConfig = semVT.filter(c => !c.vt_valor_diario || c.vt_valor_diario <= 0)
        const aptos = semVT.filter(c => c.vt_valor_diario && c.vt_valor_diario > 0)
        const totalEstimado = aptos.reduce((s, c) => s + (c.vt_valor_diario! * diasUteisMes.length), 0)

        return (
          <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 90, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <div style={{ background: 'var(--background)', borderRadius: 14, width: 480, maxHeight: '85vh', overflow: 'hidden', display: 'flex', flexDirection: 'column', boxShadow: '0 20px 60px rgba(0,0,0,0.3)' }}>
              {/* header */}
              <div style={{ padding: '20px 24px 16px', borderBottom: '1px solid var(--border)' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4 }}>
                  <span style={{ fontSize: 24 }}>📦</span>
                  <h3 style={{ fontWeight: 800, fontSize: 16, margin: 0 }}>Lançar VT em Lote</h3>
                </div>
                <p style={{ fontSize: 12, color: 'var(--muted-foreground)', margin: 0 }}>
                  Cria VT do mês completo ({diasUteisMes.length} dias úteis) para colaboradores <strong>sem VT</strong>
                  {obraFiltro !== 'todas' ? <> · <strong style={{color:'#7c3aed'}}>📍 {obras.find(o=>o.id===obraFiltro)?.nome ?? ''}</strong></> : ' de todas as obras'}.
                </p>
              </div>

              {/* resumo */}
              <div style={{ padding: '16px 24px', overflowY: 'auto', flex: 1 }}>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10, marginBottom: 16 }}>
                  {[
                    { label: 'Aptos para lançar', value: aptos.length, color: '#15803d', bg: '#dcfce7' },
                    { label: 'Já têm VT',         value: comVT.length,  color: '#1d4ed8', bg: '#dbeafe' },
                    { label: 'Sem valor config.', value: semConfig.length, color: '#b45309', bg: '#fef3c7' },
                  ].map((s, i) => (
                    <div key={i} style={{ background: s.bg, borderRadius: 8, padding: '10px 12px', textAlign: 'center' }}>
                      <div style={{ fontSize: 22, fontWeight: 800, color: s.color }}>{s.value}</div>
                      <div style={{ fontSize: 10, color: s.color, fontWeight: 600 }}>{s.label}</div>
                    </div>
                  ))}
                </div>

                {aptos.length > 0 ? (
                  <div style={{ border: '1px solid var(--border)', borderRadius: 8, overflow: 'hidden' }}>
                    <div style={{ background: 'var(--muted)', padding: '6px 12px', fontSize: 11, fontWeight: 700, color: 'var(--muted-foreground)', textTransform: 'uppercase' }}>
                      Colaboradores que receberão VT
                    </div>
                    {aptos.map(c => (
                      <div key={c.id} style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 12px', borderTop: '1px solid var(--border)', fontSize: 12 }}>
                        <div>
                          <span style={{ fontWeight: 600 }}>{c.nome}</span>
                          <span style={{ color: 'var(--muted-foreground)', marginLeft: 8 }}>{c.funcao_nome}</span>
                        </div>
                        <span style={{ fontWeight: 700, color: '#15803d' }}>
                          {formatCurrency(c.vt_valor_diario! * diasUteisMes.length)}
                        </span>
                      </div>
                    ))}
                    <div style={{ background: 'var(--muted)', padding: '8px 12px', display: 'flex', justifyContent: 'space-between', fontSize: 12, fontWeight: 800 }}>
                      <span>Total estimado ({aptos.length} colaborador{aptos.length !== 1 ? 'es' : ''})</span>
                      <span style={{ color: '#15803d' }}>{formatCurrency(totalEstimado)}</span>
                    </div>
                  </div>
                ) : (
                  <div style={{ textAlign: 'center', padding: '24px 0', color: 'var(--muted-foreground)', fontSize: 13 }}>
                    ⚠️ Nenhum colaborador apto. Configure o valor diário de VT em cada colaborador.
                  </div>
                )}

                {semConfig.length > 0 && (
                  <div style={{ marginTop: 12, background: '#fef3c7', border: '1px solid #fde68a', borderRadius: 8, padding: '10px 12px', fontSize: 12, color: '#92400e' }}>
                    <strong>⚠ {semConfig.length} colaborador(es) sem valor de VT configurado</strong> não serão incluídos:
                    {' '}{semConfig.map(c => c.nome).join(', ')}
                  </div>
                )}
              </div>

              {/* footer */}
              <div style={{ padding: '16px 24px', borderTop: '1px solid var(--border)', display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
                <Button variant="outline" onClick={() => setModalLancarLote(false)} disabled={savingLancarLote}>Cancelar</Button>
                <Button
                  disabled={aptos.length === 0 || savingLancarLote}
                  onClick={handleLancarLote}
                  style={{ background: '#15803d', color: '#fff', gap: 6 }}
                >
                  {savingLancarLote
                    ? <><Loader2 size={14} className="animate-spin" /> Lançando…</>
                    : <><Plus size={14} /> Lançar {aptos.length} VT(s)</>}
                </Button>
              </div>
            </div>
          </div>
        )
      })()}
    </div>
  )
}
