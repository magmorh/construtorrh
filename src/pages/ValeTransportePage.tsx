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

type VTRow = ValeTransporte & {
  colaboradores?: ColaboradorVT
}

type FormData = {
  competencia: string
  data_inicio: string
  data_fim: string
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
]

const MAX_PARCELAS_MES = 5

// dias do mês corrente para calcular VT proporcional
function diasNoMes(competencia: string) {
  const [ano, mes] = competencia.split('-').map(Number)
  return new Date(ano, mes, 0).getDate()
}

function primeiroDia(competencia: string) {
  return `${competencia}-01`
}
function ultimoDia(competencia: string) {
  const [ano, mes] = competencia.split('-').map(Number)
  const d = new Date(ano, mes, 0).getDate()
  return `${competencia}-${String(d).padStart(2, '0')}`
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

// ─── componente ──────────────────────────────────────────────────────────────
export default function ValeTransportePage() {
  const hoje = new Date()
  const [ano, setAno]   = useState(hoje.getFullYear())
  const [mes, setMes]   = useState(hoje.getMonth() + 1)
  const [busca, setBusca] = useState('')
  const [obraFiltro, setObraFiltro] = useState('todas')

  const [colaboradores, setColaboradores] = useState<ColaboradorVT[]>([])
  const [obras, setObras] = useState<{id:string;nome:string}[]>([])
  const [vtRows, setVtRows]   = useState<VTRow[]>([])
  const [loading, setLoading] = useState(true)

  const [colabSel, setColabSel] = useState<ColaboradorVT | null>(null)

  // modal lançamento
  const [modalOpen, setModalOpen] = useState(false)
  const [editando, setEditando]   = useState<VTRow | null>(null)
  const [form, setForm]           = useState<FormData>(emptyForm())
  const [saving, setSaving]       = useState(false)

  // delete
  const [deleteId, setDeleteId] = useState<string | null>(null)

  // competência (ano-mes)
  const competencia = `${ano}-${String(mes).padStart(2, '0')}`

  function emptyForm(): FormData {
    const comp = `${hoje.getFullYear()}-${String(hoje.getMonth() + 1).padStart(2, '0')}`
    return {
      competencia: comp,
      data_inicio: primeiroDia(comp),
      data_fim:    ultimoDia(comp),
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
        ...c,
        obra_nome:   c.obras?.nome   ?? '',
        funcao_nome: c.funcoes?.nome ?? '',
      })))
    }
    if (obraRes.data) setObras(obraRes.data)
    if (vtRes.data)   setVtRows(vtRes.data as VTRow[])
    setLoading(false)
  }, [])

  useEffect(() => { fetchData() }, [fetchData])

  // ─── VT do colaborador selecionado no mês ──────────────────────────────────
  const vtDoColab = useMemo(() =>
    colabSel
      ? vtRows.filter(r => r.colaborador_id === colabSel.id && r.competencia === competencia)
      : [],
    [colabSel, vtRows, competencia]
  )

  // Status do colaborador: completo / parcial / sem VT no mês
  function statusVTColab(colabId: string) {
    const registros = vtRows.filter(r => r.colaborador_id === colabId && r.competencia === competencia)
    if (registros.length === 0) return 'sem'
    // verifica se existe período cobrindo o mês inteiro
    const temCompleto = registros.some(r =>
      r.data_inicio === primeiroDia(competencia) && r.data_fim === ultimoDia(competencia)
    )
    if (temCompleto) return 'completo'
    return 'parcial'
  }

  // VT mensal do colaborador (do campo vt_dados)
  function vtMensalColab(colab: ColaboradorVT): number {
    const d = colab.vt_dados as any
    return d?.valor_mensal ?? d?.valor ?? 0
  }

  // Valor VT proporcional ao período
  function calcValorPeriodo(vtMensal: number, dataIni: string, dataFim: string, comp: string): number {
    if (!vtMensal || !dataIni || !dataFim) return 0
    const total = diasNoMes(comp)
    const ini = parseInt(dataIni.slice(8))
    const fim = parseInt(dataFim.slice(8))
    const dias = Math.max(0, fim - ini + 1)
    return (vtMensal / total) * dias
  }

  // Pode lançar mais VT no mês?
  function podeNovoVT(colabId: string): { pode: boolean; motivo?: string } {
    const registros = vtRows.filter(r => r.colaborador_id === colabId && r.competencia === competencia)
    if (registros.length >= MAX_PARCELAS_MES)
      return { pode: false, motivo: `Limite de ${MAX_PARCELAS_MES} lançamentos/mês atingido` }
    const temCompleto = registros.some(r =>
      r.data_inicio === primeiroDia(competencia) && r.data_fim === ultimoDia(competencia)
    )
    if (temCompleto)
      return { pode: false, motivo: 'VT do mês completo já lançado' }
    return { pode: true }
  }

  // ─── lista lateral filtrada ────────────────────────────────────────────────
  const colabsFiltrados = useMemo(() => {
    return colaboradores.filter(c => {
      if (obraFiltro !== 'todas' && c.obra_id !== obraFiltro) return false
      if (busca) {
        const b = busca.toLowerCase()
        return c.nome.toLowerCase().includes(b) || (c.chapa ?? '').toLowerCase().includes(b)
      }
      return true
    })
  }, [colaboradores, busca, obraFiltro])

  // ─── modal helpers ─────────────────────────────────────────────────────────
  function openCreate() {
    if (!colabSel) return
    const { pode, motivo } = podeNovoVT(colabSel.id)
    if (!pode) { toast.error(motivo); return }

    const vtMensal = vtMensalColab(colabSel)
    const salario  = colabSel.salario ?? 0
    const descontar = true
    const valorBruto = vtMensal  // começa com mês completo; usuário ajusta período
    const desconto   = descontar ? salario * 0.06 : 0
    const valorEmp   = Math.max(0, valorBruto - desconto)

    setEditando(null)
    setForm({
      competencia,
      data_inicio: primeiroDia(competencia),
      data_fim:    ultimoDia(competencia),
      tipo: 'cartao',
      valor: vtMensal > 0 ? vtMensal.toFixed(2) : '',
      dias_trabalhados: String(diasNoMes(competencia)),
      desconto_colaborador: desconto.toFixed(2),
      valor_empresa: valorEmp.toFixed(2),
      descontar_6pct: descontar,
      observacoes: '',
    })
    setModalOpen(true)
  }

  function openEdit(row: VTRow) {
    setEditando(row)
    setForm({
      competencia: row.competencia,
      data_inicio: row.data_inicio ?? primeiroDia(row.competencia),
      data_fim:    row.data_fim    ?? ultimoDia(row.competencia),
      tipo: row.tipo ?? 'cartao',
      valor: String(row.valor ?? ''),
      dias_trabalhados: String(row.dias_trabalhados ?? ''),
      desconto_colaborador: String(row.desconto_colaborador ?? ''),
      valor_empresa: String(row.valor_empresa ?? ''),
      descontar_6pct: row.descontar_6pct ?? true,
      observacoes: row.observacoes ?? '',
    })
    setModalOpen(true)
  }

  function setField(key: keyof FormData, value: string | boolean) {
    setForm(prev => {
      const next = { ...prev, [key]: value }

      // Ao mudar período → recalcula valor proporcional
      if ((key === 'data_inicio' || key === 'data_fim') && colabSel) {
        const vtMensal = vtMensalColab(colabSel)
        if (vtMensal > 0) {
          const ini = key === 'data_inicio' ? String(value) : next.data_inicio
          const fim = key === 'data_fim'    ? String(value) : next.data_fim
          const valorProp = calcValorPeriodo(vtMensal, ini, fim, next.competencia)
          const desconto  = next.descontar_6pct ? (colabSel.salario ?? 0) * 0.06 : 0
          return {
            ...next,
            valor: valorProp.toFixed(2),
            desconto_colaborador: desconto.toFixed(2),
            valor_empresa: Math.max(0, valorProp - desconto).toFixed(2),
          }
        }
      }

      // Toggle desconto 6%
      if (key === 'descontar_6pct') {
        const ativar = value as boolean
        const salario = colabSel?.salario ?? 0
        const desconto = ativar ? salario * 0.06 : 0
        const valor = parseFloat(next.valor) || 0
        return {
          ...next,
          desconto_colaborador: desconto.toFixed(2),
          valor_empresa: Math.max(0, valor - desconto).toFixed(2),
        }
      }

      // Recalcula valor_empresa ao mudar valor ou desconto
      if (key === 'valor' || key === 'desconto_colaborador') {
        const valor    = parseFloat(key === 'valor'    ? String(value) : next.valor) || 0
        const desconto = parseFloat(key === 'desconto_colaborador' ? String(value) : next.desconto_colaborador) || 0
        return { ...next, valor_empresa: Math.max(0, valor - desconto).toFixed(2) }
      }

      return next
    })
  }

  // ─── save ──────────────────────────────────────────────────────────────────
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

  // ─── delete ────────────────────────────────────────────────────────────────
  async function handleDelete() {
    if (!deleteId) return
    const { error } = await supabase.from('vale_transporte').delete().eq('id', deleteId)
    setDeleteId(null)
    if (error) toast.error(traduzirErro(error.message))
    else { toast.success('Registro excluído!'); fetchData() }
  }

  // ─── totais gerais no mês (para cards) ────────────────────────────────────
  const vtDoMes = vtRows.filter(r => r.competencia === competencia)
  const totalEmpresaMes   = vtDoMes.reduce((s, r) => s + (r.valor_empresa ?? 0), 0)
  const colabsComVTCompleto = new Set(
    vtDoMes.filter(r => r.data_inicio === primeiroDia(competencia) && r.data_fim === ultimoDia(competencia))
           .map(r => r.colaborador_id)
  ).size
  const colabsComVTParcial = new Set(
    vtDoMes.filter(r => !(r.data_inicio === primeiroDia(competencia) && r.data_fim === ultimoDia(competencia)))
           .map(r => r.colaborador_id)
  ).size

  // ─── nav mês ───────────────────────────────────────────────────────────────
  function navMes(delta: number) {
    let m = mes + delta, a = ano
    if (m > 12) { m = 1; a++ }
    if (m < 1)  { m = 12; a-- }
    setMes(m); setAno(a)
  }

  const MESES = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro']

  // ─── render ────────────────────────────────────────────────────────────────
  return (
    <div style={{ display: 'flex', height: '100%', flexDirection: 'column', gap: 0 }}>

      {/* ── Header ── */}
      <div style={{ padding: '0 0 16px 0', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 10 }}>
        <div>
          <h1 style={{ fontSize: 20, fontWeight: 700, margin: 0 }}>🚌 Vale Transporte</h1>
          <p style={{ fontSize: 13, color: 'var(--muted-foreground)', marginTop: 2 }}>Controle de vale transporte por colaborador</p>
        </div>
        {/* Navegação mês */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <button onClick={() => navMes(-1)}
            style={{ width: 32, height: 32, border: '1px solid var(--border)', borderRadius: 6, background: 'var(--card)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <ChevronLeft size={16} />
          </button>
          <span style={{ fontSize: 14, fontWeight: 700, minWidth: 130, textAlign: 'center' }}>
            {MESES[mes - 1]} / {ano}
          </span>
          <button onClick={() => navMes(1)}
            style={{ width: 32, height: 32, border: '1px solid var(--border)', borderRadius: 6, background: 'var(--card)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <ChevronRight size={16} />
          </button>
        </div>
      </div>

      {/* ── Cards resumo do mês ── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 12, marginBottom: 16 }}>
        {[
          { icon: <CheckCircle2 size={15}/>, label: 'VT Completo (mês)', value: `${colabsComVTCompleto} colaborador(es)`, color: '#15803d' },
          { icon: <AlertCircle   size={15}/>, label: 'VT Parcial',         value: `${colabsComVTParcial} colaborador(es)`,  color: '#b45309' },
          { icon: <Bus           size={15}/>, label: 'Total Empresa (mês)', value: formatCurrency(totalEmpresaMes),          color: '#1d4ed8', money: true },
        ].map((c, i) => (
          <div key={i} style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 10, padding: '12px 16px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: c.color, marginBottom: 4 }}>
              {c.icon}<span style={{ fontSize: 11, fontWeight: 600 }}>{c.label}</span>
            </div>
            <div style={{ fontSize: 18, fontWeight: 800, color: c.color }}>{c.value}</div>
          </div>
        ))}
      </div>

      {/* ── Layout 2 colunas: lista colaboradores | painel direito ── */}
      <div style={{ display: 'flex', gap: 12, flex: 1, minHeight: 0, overflow: 'hidden' }}>

        {/* ── Coluna esquerda: lista ── */}
        <div style={{ width: 260, flexShrink: 0, display: 'flex', flexDirection: 'column', background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 10, overflow: 'hidden' }}>
          {/* Título coluna */}
          <div style={{ padding: '12px 14px 8px', borderBottom: '1px solid var(--border)' }}>
            <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.07em', color: 'var(--muted-foreground)', marginBottom: 8 }}>
              🚌 Vale Transporte
            </div>
            {/* Filtro obra */}
            <Select value={obraFiltro} onValueChange={setObraFiltro}>
              <SelectTrigger className="h-8 text-xs mb-2">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="todas">Todas as obras</SelectItem>
                {obras.map(o => <SelectItem key={o.id} value={o.id}>{o.nome}</SelectItem>)}
              </SelectContent>
            </Select>
            {/* Busca */}
            <div style={{ position: 'relative' }}>
              <Search size={13} style={{ position: 'absolute', left: 8, top: '50%', transform: 'translateY(-50%)', color: 'var(--muted-foreground)' }} />
              <input
                placeholder="Nome ou chapa..."
                value={busca}
                onChange={e => setBusca(e.target.value)}
                style={{ width: '100%', height: 30, paddingLeft: 28, paddingRight: 8, fontSize: 12, border: '1px solid var(--border)', borderRadius: 6, background: 'var(--background)', color: 'var(--foreground)', boxSizing: 'border-box' }}
              />
            </div>
          </div>

          {/* Lista colaboradores */}
          <div style={{ overflowY: 'auto', flex: 1 }}>
            {loading ? (
              <div style={{ padding: 20, textAlign: 'center', color: 'var(--muted-foreground)', fontSize: 12 }}>Carregando…</div>
            ) : colabsFiltrados.length === 0 ? (
              <div style={{ padding: 20, textAlign: 'center', color: 'var(--muted-foreground)', fontSize: 12 }}>Nenhum colaborador</div>
            ) : colabsFiltrados.map(c => {
              const status = statusVTColab(c.id)
              const isAtivo = colabSel?.id === c.id
              return (
                <div key={c.id} onClick={() => setColabSel(c)}
                  style={{
                    padding: '10px 14px', cursor: 'pointer', borderBottom: '1px solid var(--border)',
                    background: isAtivo ? 'var(--primary)' : 'transparent',
                    color: isAtivo ? '#fff' : 'var(--foreground)',
                    display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8,
                  }}>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontSize: 11, opacity: 0.6, marginBottom: 1 }}>{c.chapa}</div>
                    <div style={{ fontWeight: 600, fontSize: 13, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.nome}</div>
                    <div style={{ fontSize: 11, opacity: 0.7, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.funcao_nome}</div>
                  </div>
                  {/* Badge status VT no mês */}
                  <div style={{
                    flexShrink: 0, fontSize: 10, fontWeight: 700, padding: '2px 7px', borderRadius: 8,
                    background: status === 'completo' ? (isAtivo ? 'rgba(255,255,255,0.25)' : '#dcfce7')
                               : status === 'parcial'  ? (isAtivo ? 'rgba(255,255,255,0.25)' : '#fef3c7')
                               : (isAtivo ? 'rgba(255,255,255,0.15)' : 'var(--muted)'),
                    color: status === 'completo' ? (isAtivo ? '#fff' : '#15803d')
                          : status === 'parcial'  ? (isAtivo ? '#fff' : '#b45309')
                          : (isAtivo ? 'rgba(255,255,255,0.7)' : 'var(--muted-foreground)'),
                  }}>
                    {status === 'completo' ? '✓ completo' : status === 'parcial' ? '~ parcial' : '— sem VT'}
                  </div>
                </div>
              )
            })}
          </div>
        </div>

        {/* ── Coluna direita: painel do colaborador ── */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0, overflow: 'hidden' }}>
          {!colabSel ? (
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', color: 'var(--muted-foreground)', gap: 12 }}>
              <Bus size={40} strokeWidth={1.5} />
              <div style={{ fontWeight: 600, fontSize: 15 }}>Selecione um colaborador</div>
              <div style={{ fontSize: 13 }}>para ver e gerenciar os vales do mês</div>
            </div>
          ) : (() => {
            const vtMensal   = vtMensalColab(colabSel)
            const salario    = colabSel.salario ?? 0
            const { pode, motivo } = podeNovoVT(colabSel.id)
            const totalPagoMes = vtDoColab.reduce((s, r) => s + (r.valor_empresa ?? 0), 0)

            return (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12, height: '100%', overflow: 'auto' }}>

                {/* ─ cabeçalho do colaborador ─ */}
                <div style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 10, padding: '14px 18px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
                  <div>
                    <div style={{ fontSize: 11, color: 'var(--muted-foreground)', marginBottom: 2 }}>{colabSel.chapa} · {colabSel.funcao_nome}</div>
                    <div style={{ fontSize: 17, fontWeight: 700 }}>{colabSel.nome}</div>
                    <div style={{ fontSize: 12, color: 'var(--muted-foreground)', marginTop: 3 }}>
                      VT cadastrado: <strong>{vtMensal > 0 ? formatCurrency(vtMensal) + '/mês' : 'não configurado'}</strong>
                      {salario > 0 && <span style={{ marginLeft: 10 }}>Salário: <strong>{formatCurrency(salario)}</strong> · 6% = <strong>{formatCurrency(salario * 0.06)}</strong></span>}
                    </div>
                  </div>
                  <Button onClick={openCreate} disabled={!pode} title={motivo} className="gap-2 shrink-0">
                    <Plus size={15} /> Novo Lançamento
                  </Button>
                </div>

                {/* ─ info bloqueio ─ */}
                {!pode && (
                  <div style={{ background: '#fef3c7', border: '1px solid #fde68a', borderRadius: 8, padding: '10px 16px', fontSize: 13, color: '#92400e', display: 'flex', alignItems: 'center', gap: 8 }}>
                    <AlertCircle size={15} />
                    <span><strong>Bloqueado:</strong> {motivo}</span>
                  </div>
                )}

                {/* ─ cards mini do mês ─ */}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10 }}>
                  {[
                    { label: 'Lançamentos no mês', value: `${vtDoColab.length} / ${MAX_PARCELAS_MES}`, color: '#1d4ed8' },
                    { label: 'Total empresa pago', value: formatCurrency(totalPagoMes), color: '#15803d' },
                    { label: 'Status',
                      value: statusVTColab(colabSel.id) === 'completo' ? '✓ Mês completo'
                           : statusVTColab(colabSel.id) === 'parcial'  ? '~ Parcial'
                           : '— Sem VT',
                      color: statusVTColab(colabSel.id) === 'completo' ? '#15803d'
                           : statusVTColab(colabSel.id) === 'parcial'  ? '#b45309'
                           : 'var(--muted-foreground)',
                    },
                  ].map((c, i) => (
                    <div key={i} style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 8, padding: '10px 14px' }}>
                      <div style={{ fontSize: 11, color: 'var(--muted-foreground)', marginBottom: 3 }}>{c.label}</div>
                      <div style={{ fontSize: 16, fontWeight: 800, color: c.color }}>{c.value}</div>
                    </div>
                  ))}
                </div>

                {/* ─ tabela de lançamentos ─ */}
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
                            <tr key={r.id} style={{ background: i % 2 === 0 ? 'var(--card)' : 'var(--muted)/30', borderBottom: '1px solid var(--border)' }}>
                              <td style={{ padding: '10px 14px' }}>
                                <div style={{ fontWeight: 600 }}>
                                  {eMesCompleto
                                    ? <span style={{ color: '#15803d' }}>✓ Mês completo</span>
                                    : `${fmtData(r.data_inicio)} → ${fmtData(r.data_fim)}`
                                  }
                                </div>
                                <div style={{ fontSize: 10, color: 'var(--muted-foreground)' }}>{fmtMes(r.competencia)}</div>
                              </td>
                              <td style={{ padding: '10px 14px', color: 'var(--muted-foreground)' }}>
                                {TIPO_OPTIONS.find(t => t.value === r.tipo)?.label ?? r.tipo ?? '—'}
                              </td>
                              <td style={{ padding: '10px 14px', textAlign: 'right' }}>{formatCurrency(r.valor)}</td>
                              <td style={{ padding: '10px 14px', textAlign: 'right', color: r.descontar_6pct ? '#dc2626' : 'var(--muted-foreground)' }}>
                                {r.descontar_6pct ? '−' + formatCurrency(r.desconto_colaborador) : <span style={{ fontSize: 10 }}>isento</span>}
                              </td>
                              <td style={{ padding: '10px 14px', textAlign: 'right', fontWeight: 700, color: '#1d4ed8' }}>
                                {formatCurrency(r.valor_empresa)}
                              </td>
                              <td style={{ padding: '10px 14px', textAlign: 'right' }}>
                                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 4 }}>
                                  <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => openEdit(r)}>
                                    <Pencil size={13} />
                                  </Button>
                                  <Button size="icon" variant="ghost" className="h-7 w-7 text-destructive" onClick={() => setDeleteId(r.id)}>
                                    <Trash2 size={13} />
                                  </Button>
                                </div>
                              </td>
                            </tr>
                          )
                        })}
                      </tbody>
                      <tfoot>
                        <tr style={{ background: 'var(--muted)', borderTop: '2px solid var(--border)', fontWeight: 700 }}>
                          <td colSpan={4} style={{ padding: '9px 14px', fontSize: 12 }}>Total empresa — {vtDoColab.length} lançamento(s)</td>
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

      {/* ══ MODAL LANÇAMENTO ══ */}
      {modalOpen && colabSel && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 80, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
          <div style={{ background: 'var(--background)', borderRadius: 14, width: 480, maxHeight: '90vh', overflowY: 'auto', padding: 28, boxShadow: '0 20px 60px rgba(0,0,0,0.3)' }}>
            {/* Header modal */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 20 }}>
              <div>
                <h3 style={{ fontWeight: 800, fontSize: 16, margin: 0 }}>{editando ? 'Editar VT' : 'Novo Lançamento de VT'}</h3>
                <p style={{ fontSize: 12, color: 'var(--muted-foreground)', marginTop: 4 }}>
                  {colabSel.chapa} — <strong>{colabSel.nome}</strong> · {fmtMes(form.competencia)}
                </p>
              </div>
              <button onClick={() => setModalOpen(false)}
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--muted-foreground)', padding: 4 }}>
                <X size={18} />
              </button>
            </div>

            {/* VT do colaborador */}
            {vtMensalColab(colabSel) > 0 && (
              <div style={{ background: 'var(--muted)', borderRadius: 8, padding: '10px 14px', marginBottom: 18, fontSize: 12 }}>
                💳 VT cadastrado: <strong>{formatCurrency(vtMensalColab(colabSel))}/mês</strong>
                {colabSel.salario && <> · Salário: <strong>{formatCurrency(colabSel.salario)}</strong></>}
              </div>
            )}

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>

              {/* Período de / até */}
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

              {/* Tipo */}
              <div>
                <Label className="text-xs">Tipo</Label>
                <Select value={form.tipo} onValueChange={v => setField('tipo', v)}>
                  <SelectTrigger className="mt-1 h-9"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {TIPO_OPTIONS.map(t => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>

              {/* Dias */}
              <div>
                <Label className="text-xs">Dias trabalhados</Label>
                <Input type="number" value={form.dias_trabalhados} onChange={e => setField('dias_trabalhados', e.target.value)}
                  className="mt-1 h-9" placeholder="22" />
              </div>

              {/* Valor bruto */}
              <div className="col-span-2">
                <Label className="text-xs">Valor do VT (R$) *</Label>
                <Input type="number" step="0.01" value={form.valor} onChange={e => setField('valor', e.target.value)}
                  className="mt-1 h-9" placeholder="0,00" />
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
                        : 'Empresa arca com 100% do VT (isento)'}
                    </div>
                  </div>
                  <button onClick={() => setField('descontar_6pct', !form.descontar_6pct)}
                    style={{ background: 'none', border: 'none', cursor: 'pointer', color: form.descontar_6pct ? '#b45309' : 'var(--muted-foreground)' }}>
                    {form.descontar_6pct ? <ToggleRight size={32} /> : <ToggleLeft size={32} />}
                  </button>
                </div>
              </div>

              {/* Desconto colaborador */}
              <div>
                <Label className="text-xs">Desconto colaborador (R$)</Label>
                <Input type="number" step="0.01" value={form.desconto_colaborador}
                  onChange={e => setField('desconto_colaborador', e.target.value)}
                  disabled={!form.descontar_6pct}
                  className="mt-1 h-9 disabled:opacity-50" placeholder="0,00" />
              </div>

              {/* Valor empresa */}
              <div>
                <Label className="text-xs">Valor empresa (calculado)</Label>
                <Input type="number" step="0.01" value={form.valor_empresa}
                  onChange={e => setField('valor_empresa', e.target.value)}
                  className="mt-1 h-9 bg-muted font-semibold" placeholder="0,00" />
              </div>

              {/* Observações */}
              <div className="col-span-2">
                <Label className="text-xs">Observações</Label>
                <Textarea value={form.observacoes} onChange={e => setField('observacoes', e.target.value)}
                  className="mt-1" rows={2} />
              </div>
            </div>

            {/* Rodapé modal */}
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 20 }}>
              <Button variant="outline" onClick={() => setModalOpen(false)}>Cancelar</Button>
              <Button onClick={handleSave} disabled={saving}>
                {saving ? 'Salvando…' : editando ? 'Salvar alterações' : 'Lançar VT'}
              </Button>
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
