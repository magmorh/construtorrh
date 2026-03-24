import React, { useEffect, useState, useCallback, useMemo } from 'react'
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
} from 'lucide-react'

// ─── tipos ───────────────────────────────────────────────────────────────────
type ColaboradorVT = Pick<Colaborador, 'id' | 'nome' | 'chapa' | 'salario' | 'vt_dados'> & {
  obra_id: string | null; obra_nome?: string; funcao_nome?: string
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
  const [ano, setAno]       = useState(hoje.getFullYear())
  const [mes, setMes]       = useState(hoje.getMonth() + 1)
  const [busca, setBusca]   = useState('')
  const [obraFiltro, setObraFiltro] = useState('todas')

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
        .select('id,nome,chapa,salario,vt_dados,obra_id,funcoes(nome),obras(nome)')
        .eq('status', 'ativo')
        .order('nome'),
      supabase.from('obras').select('id,nome').order('nome'),
      supabase
        .from('vale_transporte')
        .select('*,colaboradores(id,nome,chapa,salario,vt_dados)')
        .order('competencia', { ascending: false }),
    ])
    if (colRes.data) {
      setColaboradores(colRes.data.map((c: any) => ({
        ...c, obra_nome: c.obras?.nome ?? '', funcao_nome: c.funcoes?.nome ?? '',
      })))
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

  function statusVTColab(colabId: string) {
    const regs = vtRows.filter(r => r.colaborador_id === colabId && r.competencia === competencia)
    if (regs.length === 0) return 'sem'
    const temCompleto = regs.some(r => r.data_inicio === primeiroDia(competencia) && r.data_fim === ultimoDia(competencia))
    return temCompleto ? 'completo' : 'parcial'
  }

  function podeNovoVT(colabId: string): { pode: boolean; motivo?: string } {
    const regs = vtRows.filter(r => r.colaborador_id === colabId && r.competencia === competencia)
    if (regs.length >= MAX_PARCELAS_MES) return { pode: false, motivo: `Limite de ${MAX_PARCELAS_MES} lançamentos/mês atingido` }
    const temCompleto = regs.some(r => r.data_inicio === primeiroDia(competencia) && r.data_fim === ultimoDia(competencia))
    if (temCompleto) return { pode: false, motivo: 'VT do mês completo já lançado' }
    return { pode: true }
  }

  // ─── recalcula valor+dias ao mudar período/tick sábado ────────────────────
  // vtDiarioFixo: se informado (modo edição), usa essa taxa em vez de buscar do cadastro atual
  function recalcularPeriodo(
    dataIni: string, dataFim: string, contarSab: boolean,
    comp: string, colab: ColaboradorVT | null, descontar: boolean,
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
    const salario  = colab?.salario ?? 0
    const desconto = descontar ? salario * 0.06 : 0
    const valorEmp = Math.max(0, valorBruto - desconto)
    return {
      dias_trabalhados: String(diasUtil),
      valor: valorBruto > 0 ? valorBruto.toFixed(2) : '',
      desconto_colaborador: desconto.toFixed(2),
      valor_empresa: valorEmp.toFixed(2),
    }
  }

  // ─── lista lateral filtrada ───────────────────────────────────────────────
  const colabsFiltrados = useMemo(() => colaboradores.filter(c => {
    if (obraFiltro !== 'todas' && c.obra_id !== obraFiltro) return false
    if (busca) {
      const b = busca.toLowerCase()
      return c.nome.toLowerCase().includes(b) || (c.chapa ?? '').toLowerCase().includes(b)
    }
    return true
  }), [colaboradores, busca, obraFiltro])

  // ─── abrir modal ──────────────────────────────────────────────────────────
  function openCreate() {
    if (!colabSel) return
    const { pode, motivo } = podeNovoVT(colabSel.id)
    if (!pode) { toast.error(motivo); return }

    const vtDados    = colabSel.vt_dados as any
    const tipoAuto   = modalidadeParaTipo(vtDados?.modalidade)
    const contarSab  = false
    const descontar  = true
    const calc       = recalcularPeriodo(primeiroDia(competencia), ultimoDia(competencia), contarSab, competencia, colabSel, descontar)

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
        const calc   = recalcularPeriodo(ini, fim, contSab, next.competencia, colabSel, desc, vtDiarioSnap)
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
    if (error) { toast.error(traduzirErro(error.message)); return }
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
                      {colabSel.salario && <span>Salário: <strong>{formatCurrency(colabSel.salario)}</strong> → 6% = <strong>{formatCurrency((colabSel.salario ?? 0) * 0.06)}</strong></span>}
                    </div>
                  </div>
                  <Button onClick={openCreate} disabled={!pode} title={motivo} className="gap-2 shrink-0">
                    <Plus size={15} /> Novo Lançamento
                  </Button>
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
                              <td style={{ padding: '10px 14px', textAlign: 'right' }}>
                                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 4 }}>
                                  <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => openEdit(r)}><Pencil size={13} /></Button>
                                  <Button size="icon" variant="ghost" className="h-7 w-7 text-destructive" onClick={() => setDeleteId(r.id)}><Trash2 size={13} /></Button>
                                </div>
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

              {/* Toggle desconto 6% */}
              <div className="col-span-2">
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: form.descontar_6pct ? '#fef3c7' : 'var(--muted)', borderRadius: 8, padding: '10px 14px', border: `1px solid ${form.descontar_6pct ? '#fde68a' : 'var(--border)'}` }}>
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 600, color: form.descontar_6pct ? '#92400e' : 'var(--foreground)' }}>
                      Descontar 6% do salário do colaborador
                    </div>
                    <div style={{ fontSize: 11, color: 'var(--muted-foreground)', marginTop: 2 }}>
                      {form.descontar_6pct
                        ? `Desconto: ${formatCurrency(parseFloat(form.desconto_colaborador) || 0)} (6% de ${formatCurrency(colabSel.salario ?? 0)})`
                        : 'Empresa arca com 100% do VT — sem desconto no holerite'}
                    </div>
                  </div>
                  <button onClick={() => setField('descontar_6pct', !form.descontar_6pct)}
                    style={{ background: 'none', border: 'none', cursor: 'pointer', color: form.descontar_6pct ? '#b45309' : 'var(--muted-foreground)' }}>
                    {form.descontar_6pct ? <ToggleRight size={32} /> : <ToggleLeft size={32} />}
                  </button>
                </div>
              </div>

              {/* Desconto colaborador — somente leitura (calculado pelo toggle) */}
              <div>
                <Label className="text-xs" style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                  Desconto colaborador (R$)
                  <span style={{ fontSize: 9, background: 'var(--muted)', color: 'var(--muted-foreground)', borderRadius: 3, padding: '1px 4px', fontWeight: 600 }}>AUTO</span>
                </Label>
                <div style={{ marginTop: 4, height: 36, display: 'flex', alignItems: 'center', padding: '0 12px', background: 'var(--muted)', border: '1px solid var(--border)', borderRadius: 6, fontSize: 14, fontWeight: 700, color: form.descontar_6pct ? '#dc2626' : 'var(--muted-foreground)' }}>
                  {form.descontar_6pct
                    ? `− ${formatCurrency(parseFloat(form.desconto_colaborador) || 0)}`
                    : <span style={{ fontWeight: 400, fontSize: 12 }}>isento (toggle desativado)</span>}
                </div>
              </div>

              {/* Valor empresa — somente leitura */}
              <div>
                <Label className="text-xs" style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                  Valor empresa (calculado)
                  <span style={{ fontSize: 9, background: '#dbeafe', color: '#1d4ed8', borderRadius: 3, padding: '1px 4px', fontWeight: 600 }}>AUTO</span>
                </Label>
                <div style={{ marginTop: 4, height: 36, display: 'flex', alignItems: 'center', padding: '0 12px', background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: 6, fontSize: 14, fontWeight: 800, color: '#1d4ed8' }}>
                  {formatCurrency(parseFloat(form.valor_empresa) || 0)}
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
    </div>
  )
}
