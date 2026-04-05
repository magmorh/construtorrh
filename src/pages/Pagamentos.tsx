import React, { useEffect, useState, useCallback } from 'react'
import { useRefreshOnFocus } from '@/hooks/useRefreshOnFocus'
import { supabase } from '@/lib/supabase'
import type { Pagamento, Colaborador, Obra } from '@/lib/supabase'
import { formatCurrency, formatDate } from '@/lib/utils'
import { fetchEmpresaData, CABECALHO_CSS, gerarCabecalhoHTML } from '@/lib/relatorioHeader'
import { PageHeader, BadgeStatus, EmptyState, LoadingSkeleton, SummaryCard } from '@/components/Shared'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import {
  Table, TableBody, TableCell, TableFooter, TableHead, TableHeader, TableRow,
} from '@/components/ui/table'
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
import { toast } from 'sonner'
import { traduzirErro } from '@/lib/erros'
import {
  DollarSign, Plus, Search, Pencil, Trash2, CheckCircle, RotateCcw, Calendar, Building2, Clock, Gift, FileText,
} from 'lucide-react'

// ─── tipos ───────────────────────────────────────────────────────────────────
type PagamentoRow = Pagamento & {
  colaboradores?: Pick<Colaborador, 'nome' | 'chapa'>
}

type FormData = {
  colaborador_id: string
  obra_id: string
  competencia: string
  data_pagamento: string
  tipo: string
  valor_bruto: string
  inss: string
  fgts: string
  ir: string
  vale_transporte: string
  adiantamento: string
  valor_liquido: string
  status: string
  observacoes: string
}

const TIPO_OPTIONS = [
  { value: 'folha', label: 'Folha' },
  { value: 'adiantamento', label: 'Adiantamento' },
  { value: '13_salario', label: '13º Salário' },
  { value: 'ferias', label: 'Férias' },
  { value: 'rescisao', label: 'Rescisão' },
  { value: 'vale_transporte', label: 'Vale Transporte' },
]

const STATUS_OPTIONS = [
  { value: 'pendente', label: 'Pendente' },
  { value: 'pago', label: 'Pago' },
  { value: 'cancelado', label: 'Cancelado' },
]

const EMPTY_FORM: FormData = {
  colaborador_id: '',
  obra_id: '',
  competencia: new Date().toISOString().slice(0, 7),
  data_pagamento: '',
  tipo: 'folha',
  valor_bruto: '',
  inss: '',
  fgts: '',
  ir: '',
  vale_transporte: '',
  adiantamento: '',
  valor_liquido: '',
  status: 'pendente',
  observacoes: '',
}

// ─── helpers ─────────────────────────────────────────────────────────────────
function calcLiquido(form: FormData): number {
  const bruto = parseFloat(form.valor_bruto) || 0
  const inss = parseFloat(form.inss) || 0
  const ir = parseFloat(form.ir) || 0
  const vt = parseFloat(form.vale_transporte) || 0
  const adiant = parseFloat(form.adiantamento) || 0
  return Math.max(0, bruto - inss - ir - vt - adiant)
}

// ─── componente ──────────────────────────────────────────────────────────────
export default function Pagamentos() {
  const [rows, setRows] = useState<PagamentoRow[]>([])
  const [colaboradores, setColaboradores] = useState<Pick<Colaborador, 'id' | 'nome' | 'chapa'>[]>([])
  const [obras,    setObras]    = useState<Pick<Obra, 'id' | 'nome'>[]>([])
  const [funcoes,  setFuncoes]  = useState<{ id: string; nome: string }[]>([])
  const [filtroFuncaoId, setFiltroFuncaoId] = useState('todos')
  const [loading, setLoading] = useState(true)

  // filtros
  const [filtroCompetencia, setFiltroCompetencia] = useState(new Date().toISOString().slice(0, 7))
  const [filtroColaborador, setFiltroColaborador] = useState('')
  const [filtroTipo, setFiltroTipo] = useState('todos')
  const [filtroStatus, setFiltroStatus] = useState('todos')

  // modal
  const [modalOpen, setModalOpen] = useState(false)
  const [editando, setEditando] = useState<PagamentoRow | null>(null)
  const [form, setForm] = useState<FormData>(EMPTY_FORM)
  const [saving, setSaving] = useState(false)

  // delete
  const [deleteId, setDeleteId] = useState<string | null>(null)

  // ── lançamentos liberados do Fechamento ────────────────────────────────────
  const [lancsPendentes, setLancsPendentes] = useState<any[]>([])
  const [loadingLancs, setLoadingLancs] = useState(false)

  // ── modal pagar lançamento ─────────────────────────────────────────────────
  const [modalPagarLanc, setModalPagarLanc] = useState<any | null>(null)
  const [dataPagamento, setDataPagamento] = useState(new Date().toISOString().slice(0, 10))
  const [obsPagamento, setObsPagamento] = useState('')
  const [savingPgto, setSavingPgto] = useState(false)

  // ── modal estornar ─────────────────────────────────────────────────────────
  const [modalEstornar, setModalEstornar] = useState<any | null>(null)
  const [motivoEstorno, setMotivoEstorno] = useState('')
  // ── modal recusar lançamento de folha ─────────────────────────────────────
  const [modalRecusarLanc, setModalRecusarLanc] = useState<any | null>(null)
  const [motivoRecusaLanc, setMotivoRecusaLanc] = useState('')

  // ── linhas expandidas (composição do pagamento) ────────────────────────────
  const [expandidos, setExpandidos] = useState<Set<string>>(new Set())

  // ─── fetch ─────────────────────────────────────────────────────────────────
  const fetchData = useCallback(async () => {
    setLoading(true)
    const [pagRes, colRes, obrRes, funcRes] = await Promise.all([
      supabase
        .from('pagamentos')
        .select('*, colaboradores(nome,chapa),obras(nome)')
        .order('competencia', { ascending: false }),
      supabase
        .from('colaboradores')
        .select('id,nome,chapa')
        .eq('status', 'ativo')
        .order('nome'),
      supabase.from('obras').select('id,nome').order('nome'),
      supabase.from('funcoes').select('id,nome').order('nome'),
    ])
    if (pagRes.error) toast.error('Erro ao carregar pagamentos')
    else setRows((pagRes.data as PagamentoRow[]) ?? [])
    if (colRes.data) setColaboradores(colRes.data)
    if (obrRes.data) setObras(obrRes.data)
    if (funcRes?.data) setFuncoes(funcRes.data)
    setLoading(false)
  }, [])

  // ─── fetch lançamentos liberados ───────────────────────────────────────────
  const fetchLancsPendentes = useCallback(async () => {
    setLoadingLancs(true)
    const { data, error } = await supabase
      .from('ponto_lancamentos')
      .select('id, colaborador_id, obra_id, mes_referencia, data_inicio, data_fim, status, motivo_recusa, data_pagamento, obs_pagamento, snap_liquido, snap_valor_total, snap_horas, snap_dsr, snap_producao, snap_premio, snap_inss, snap_ir, snap_desconto_vt, snap_desconto_adiant, colaboradores(nome, chapa, tipo_contrato, funcao_id, cpf, pix_chave, pix_tipo, funcoes(nome)), obras(nome)')
      .in('status', ['liberado', 'pago'])
      .order('mes_referencia', { ascending: false })
    if (error) {
      console.error('Erro ao carregar lançamentos:', error)
      toast.error('Erro ao carregar lançamentos de folha: ' + error.message)
    }
    setLancsPendentes(data ?? [])
    setLoadingLancs(false)
  }, [])

  useEffect(() => { fetchData(); fetchLancsPendentes() }, [fetchData, fetchLancsPendentes])
  useRefreshOnFocus(fetchData)

  // ─── filtrar ───────────────────────────────────────────────────────────────
  const filtered = rows.filter((r) => {
    const matchComp = filtroCompetencia ? r.competencia === filtroCompetencia : true
    const matchCol = filtroColaborador
      ? r.colaboradores?.nome.toLowerCase().includes(filtroColaborador.toLowerCase())
      : true
    const matchTipo = filtroTipo !== 'todos' ? r.tipo === filtroTipo : true
    const matchStatus = filtroStatus !== 'todos' ? r.status === filtroStatus : true
    return matchComp && matchCol && matchTipo && matchStatus
  })

  // ─── totalizadores ─────────────────────────────────────────────────────────
  const totalBruto = filtered.reduce((s, r) => s + (r.valor_bruto ?? 0), 0)
  const totalLiquido = filtered.reduce((s, r) => s + (r.valor_liquido ?? 0), 0)
  const totalInss = filtered.reduce((s, r) => s + (r.inss ?? 0), 0)
  const totalFgts = filtered.reduce((s, r) => s + (r.fgts ?? 0), 0)

  // ─── modal helpers ─────────────────────────────────────────────────────────
  function openCreate() {
    setEditando(null)
    setForm(EMPTY_FORM)
    setModalOpen(true)
  }

  function openEdit(row: PagamentoRow) {
    setEditando(row)
    setForm({
      colaborador_id: row.colaborador_id,
      obra_id: row.obra_id ?? '',
      competencia: row.competencia,
      data_pagamento: row.data_pagamento ?? '',
      tipo: row.tipo ?? 'folha',
      valor_bruto: String(row.valor_bruto ?? ''),
      inss: String(row.inss ?? ''),
      fgts: String(row.fgts ?? ''),
      ir: String(row.ir ?? ''),
      vale_transporte: String(row.vale_transporte ?? ''),
      adiantamento: String(row.adiantamento ?? ''),
      valor_liquido: String(row.valor_liquido ?? ''),
      status: row.status,
      observacoes: row.observacoes ?? '',
    })
    setModalOpen(true)
  }

  function setField(key: keyof FormData, value: string) {
    setForm((prev) => {
      const next = { ...prev, [key]: value }
      // recalcula líquido automaticamente
      const liquidoAuto = calcLiquido(next)
      return { ...next, valor_liquido: String(liquidoAuto) }
    })
  }

  // ─── save ──────────────────────────────────────────────────────────────────
  async function handleSave() {
    if (!form.colaborador_id) return toast.error('Colaborador obrigatório')
    if (!form.competencia) return toast.error('Competência obrigatória')
    setSaving(true)
    const payload = {
      colaborador_id: form.colaborador_id,
      obra_id: form.obra_id || null,
      competencia: form.competencia,
      data_pagamento: form.data_pagamento || null,
      tipo: (form.tipo as Pagamento['tipo']) || null,
      valor_bruto: parseFloat(form.valor_bruto) || null,
      inss: parseFloat(form.inss) || 0,
      fgts: parseFloat(form.fgts) || 0,
      ir: parseFloat(form.ir) || 0,
      vale_transporte: parseFloat(form.vale_transporte) || 0,
      adiantamento: parseFloat(form.adiantamento) || 0,
      valor_liquido: parseFloat(form.valor_liquido) || null,
      status: form.status as Pagamento['status'],
      observacoes: form.observacoes || null,
    }
    const { error } = editando
      ? await supabase.from('pagamentos').update(payload).eq('id', editando.id)
      : await supabase.from('pagamentos').insert(payload)
    setSaving(false)
    if (error) { toast.error('Erro ao salvar: ' + error.message); return }
    toast.success(editando ? 'Pagamento atualizado!' : 'Pagamento criado!')
    setModalOpen(false)
    fetchData()
  }

  // ─── marcar pago (tabela pagamentos) ──────────────────────────────────────
  async function marcarPago(id: string) {
    // Abre modal para confirmar data
    const row = rows.find(r => r.id === id)
    if (row) {
      setModalConfData(new Date().toISOString().slice(0,10))
      setModalConfPgto(row)
    }
  }
  async function confirmarPagamentoComData() {
    if (!modalConfPgto) return
    setSavingPgto(true)
    const dataPgto = modalConfData || new Date().toISOString().slice(0,10)
    const { error } = await supabase
      .from('pagamentos')
      .update({ status: 'pago', data_pagamento: dataPgto })
      .eq('id', modalConfPgto.id)
    if (error) { setSavingPgto(false); toast.error('Erro ao confirmar pagamento: ' + error.message); return }
    if (modalConfPgto.tipo === 'vale_transporte' && modalConfPgto.colaborador_id && modalConfPgto.competencia) {
      await supabase
        .from('vale_transporte')
        .update({ status: 'pago', data_pagamento: dataPgto })
        .eq('colaborador_id', modalConfPgto.colaborador_id)
        .eq('competencia', modalConfPgto.competencia)
        .eq('status', 'aguardando_pagamento')
    }
    setSavingPgto(false)
    setModalConfPgto(null)
    toast.success('✅ Pagamento confirmado em ' + new Date(dataPgto+'T12:00:00').toLocaleDateString('pt-BR') + '!')
    fetchData()
  }

  // ─── recusar pagamento (devolve para editável) ─────────────────────────────
  // Modal de pagamento com data
  const [modalConfPgto, setModalConfPgto] = useState<PagamentoRow | null>(null)
  const [modalConfData, setModalConfData] = useState<string>(new Date().toISOString().slice(0,10))
  const [modalRecusarVT, setModalRecusarVT] = useState<PagamentoRow | null>(null)
  async function recusarPagamentoVT() {
    if (!modalRecusarVT) return
    setSavingPgto(true)
    // Exclui o registro de pagamento
    const { error: errDel } = await supabase
      .from('pagamentos').delete().eq('id', modalRecusarVT.id)
    if (errDel) { setSavingPgto(false); toast.error('Erro ao recusar: ' + errDel.message); return }
    // Devolve o VT para pendente
    if (modalRecusarVT.tipo === 'vale_transporte' && modalRecusarVT.colaborador_id && modalRecusarVT.competencia) {
      await supabase
        .from('vale_transporte')
        .update({ status: 'pendente' })
        .eq('colaborador_id', modalRecusarVT.colaborador_id)
        .eq('competencia', modalRecusarVT.competencia)
        .eq('status', 'aguardando_pagamento')
    }
    // Devolve o adiantamento para pendente
    if (modalRecusarVT.tipo === 'adiantamento' && modalRecusarVT.colaborador_id) {
      await supabase
        .from('adiantamentos')
        .update({ status: 'pendente', pagamento_id: null } as any)
        .eq('colaborador_id', modalRecusarVT.colaborador_id)
        .eq('status', 'aprovado')
        .eq('valor', (modalRecusarVT as any).valor_bruto ?? (modalRecusarVT as any).valor_liquido ?? 0)
    }
    // Devolve o prêmio para aprovado (editável)
    if (modalRecusarVT.tipo === 'premio' && modalRecusarVT.colaborador_id) {
      await supabase
        .from('premios')
        .update({ status: 'aprovado', pagamento_id: null } as any)
        .eq('colaborador_id', modalRecusarVT.colaborador_id)
        .eq('status', 'aprovado')
        .eq('valor', (modalRecusarVT as any).valor_bruto ?? (modalRecusarVT as any).valor_liquido ?? 0)
    }
    setSavingPgto(false)
    setModalRecusarVT(null)
    toast.success('↩ Pagamento recusado — registro voltou para editável')
    fetchData()
  }

  // ─── efetivar pagamento de lançamento liberado ─────────────────────────────
  async function efetivarPagamento() {
    if (!modalPagarLanc) return
    setSavingPgto(true)
    const { error } = await supabase.from('ponto_lancamentos')
      .update({ status: 'pago', data_pagamento: dataPagamento, obs_pagamento: obsPagamento || null })
      .eq('id', modalPagarLanc.id)
    setSavingPgto(false)
    if (error) { toast.error('Erro ao efetivar: ' + error.message); return }
    toast.success('💰 Pagamento efetivado!')
    setModalPagarLanc(null); setObsPagamento('')
    fetchLancsPendentes()
  }

  // ─── estornar pagamento ────────────────────────────────────────────────────
  async function estornarPagamento() {
    if (!modalEstornar) return
    setSavingPgto(true)

    const isAvulso = !!modalEstornar._avulso   // veio da tabela pagamentos

    if (isAvulso) {
      // ── Pagamento avulso (VT, adiantamento, etc.) ──────────────────────────
      const { error: errPag } = await supabase
        .from('pagamentos')
        .update({ status: 'pendente', data_pagamento: null, observacoes: motivoEstorno ? `[ESTORNADO] ${motivoEstorno}` : '[ESTORNADO]' })
        .eq('id', modalEstornar.id)
      if (errPag) { setSavingPgto(false); toast.error('Erro ao estornar: ' + errPag.message); return }

      // Se for VT, volta status para pendente na tabela vale_transporte
      if (modalEstornar.tipo === 'vale_transporte') {
        await supabase
          .from('vale_transporte')
          .update({ status: 'pendente' })
          .eq('colaborador_id', modalEstornar.colaborador_id)
          .eq('competencia', modalEstornar.competencia)
          .eq('status', 'pago')
      }
      setSavingPgto(false)
      toast.success('↩ Pagamento estornado — voltou para Pendente')
      setModalEstornar(null); setMotivoEstorno('')
      fetchData()
    } else {
      // ── Folha de ponto ─────────────────────────────────────────────────────
      const { error } = await supabase.from('ponto_lancamentos')
        .update({ status: 'liberado', data_pagamento: null, obs_pagamento: motivoEstorno || 'Estornado' })
        .eq('id', modalEstornar.id)
      setSavingPgto(false)
      if (error) { toast.error('Erro ao estornar: ' + error.message); return }
      toast.success('↩ Pagamento estornado — voltou para Ag. Pagamento')
      setModalEstornar(null); setMotivoEstorno('')
      fetchLancsPendentes()
    }
  }

  // ─── delete ────────────────────────────────────────────────────────────────
  async function handleDelete() {
    if (!deleteId) return
    const rowDel = rows.find(r => r.id === deleteId)
    const { error } = await supabase.from('pagamentos').delete().eq('id', deleteId)
    setDeleteId(null)
    if (error) { toast.error('Erro ao excluir'); return }
    // Se era VT aguardando, devolve para pendente
    if (rowDel?.tipo === 'vale_transporte' && rowDel.status === 'pendente' && rowDel.colaborador_id && rowDel.competencia) {
      await supabase
        .from('vale_transporte')
        .update({ status: 'pendente' })
        .eq('colaborador_id', rowDel.colaborador_id)
        .eq('competencia', rowDel.competencia)
        .eq('status', 'aguardando_pagamento')
    }
    toast.success('Pagamento excluído!')
    fetchData()
  }

  // ─── filtros da aba Agendados/Realizados ─────────────────────────────────
  // BUG FIX: filtroMesLanc NÃO restringe os agendados por padrão
  // — agendados: TODOS os liberados, independente da competência
  // — realizados: filtrado pelo mês selecionado
  const [aba, setAba] = useState<'agendados'|'realizados'>('agendados')
  const [abaReal, setAbaReal] = useState<'folha'|'vt'|'outros'>('folha')
  const [abaAgend, setAbaAgend] = useState<'folha'|'vt'|'outros'>('folha')
  const [showRelatorioVT, setShowRelatorioVT] = useState(false)

  // ─── filtros das tabelas de lançamentos ──────────────────────────────────
  const [filtroNomeLanc, setFiltroNomeLanc]   = useState('')
  const [filtroDataIni, setFiltroDataIni]     = useState('')
  const [filtroDataFim, setFiltroDataFim]     = useState('')
  const [filtroMesLanc, setFiltroMesLanc]     = useState('')  // vazio = sem filtro de mês (mostra tudo)
  const [filtroObraLanc, setFiltroObraLanc]   = useState('todos')
  const [filtroFuncaoLanc, setFiltroFuncaoLanc] = useState('todos')

  // Filtros lançamentos da folha
  // Agendados: mostra TODOS os liberados (sem filtro por mês — todos os períodos pendentes aparecem)
  const lancsAgendados  = lancsPendentes.filter((l: any) => {
    const q = filtroNomeLanc.toLowerCase()
    const matchNome   = !q || l.colaboradores?.nome?.toLowerCase().includes(q) || (l.colaboradores?.chapa??'').toLowerCase().includes(q)
    const matchObra   = filtroObraLanc !== 'todos' ? l.obra_id === filtroObraLanc : true
    const matchFuncao = filtroFuncaoLanc !== 'todos' ? l.colaboradores?.funcao_id === filtroFuncaoLanc : true
    const matchDtIni  = filtroDataIni ? (l.data_inicio ?? '') >= filtroDataIni : true
    const matchDtFim  = filtroDataFim ? (l.data_fim    ?? '') <= filtroDataFim : true
    return l.status === 'liberado' && matchNome && matchObra && matchFuncao && matchDtIni && matchDtFim
  })
  const lancsRealizados = lancsPendentes.filter((l: any) => {
    const matchNome   = !filtroNomeLanc || l.colaboradores?.nome?.toLowerCase().includes(filtroNomeLanc.toLowerCase()) || (l.colaboradores?.chapa??'').toLowerCase().includes(filtroNomeLanc.toLowerCase())
    const matchMes    = filtroMesLanc  ? l.mes_referencia === filtroMesLanc : true
    const matchDtIni  = filtroDataIni  ? (l.data_pagamento ?? '') >= filtroDataIni : true
    const matchDtFim  = filtroDataFim  ? (l.data_pagamento ?? '') <= filtroDataFim : true
    const matchObra   = filtroObraLanc !== 'todos'   ? l.obra_id === filtroObraLanc : true
    const matchFuncao = filtroFuncaoLanc !== 'todos' ? l.colaboradores?.funcao_id === filtroFuncaoLanc : true
    return l.status === 'pago' && matchNome && matchMes && matchDtIni && matchDtFim && matchObra && matchFuncao
  })

  const totalAgendado  = lancsAgendados.reduce((s: number, l: any) => s + (l.snap_liquido ?? l.valor_liquido ?? 0), 0)
  const totalRealizado = lancsRealizados.reduce((s: number, l: any) => s + (l.snap_liquido ?? l.valor_liquido ?? 0), 0)

  // ── Relatório por Obra/Função ─────────────────────────────────────────────
  async function gerarRelatorioRealizados() {
    // Filtra os realizados conforme filtros ativos da tela
    const pagosLanc = lancsPendentes.filter((l: any) => l.status === 'pago')
    const pagosAvul = rows.filter((r: any) => r.status === 'pago')
    if (pagosLanc.length === 0 && pagosAvul.length === 0) {
      toast.info('Nenhum pagamento realizado no período.'); return
    }
    // Agrupa por colaborador
    const mapaColab: Record<string, { nome:string; chapa:string; funcao:string; pix:string; obra:string; lancs:any[]; total:number }> = {}
    for (const l of pagosLanc) {
      const key = l.colaborador_id
      const nm  = l.colaboradores?.nome ?? '—'
      const ch  = l.colaboradores?.chapa ?? '—'
      const fn  = l.colaboradores?.funcoes?.nome ?? '—'
      const px  = l.colaboradores?.chave_pix ?? l.colaboradores?.cpf ?? '—'
      const ob  = l.obras?.nome ?? '—'
      const dtPgt = l.data_pagamento ? new Date(l.data_pagamento).toLocaleDateString('pt-BR') : '—'
      if (!mapaColab[key]) mapaColab[key] = { nome:nm, chapa:ch, funcao:fn, pix:px, obra:ob, lancs:[], total:0 }
      mapaColab[key].lancs.push({ tipo:'Folha', dtPgt, valor:l.snap_liquido??0, obra:ob })
      mapaColab[key].total += (l.snap_liquido??0)
    }
    const dataGer = new Date().toLocaleDateString('pt-BR')
    const blocos = Object.values(mapaColab).sort((a,b)=>a.nome.localeCompare(b.nome)).map(c => {
      const pixDisp = c.pix !== '—' ? `<span style="background:#f0fdf4;color:#15803d;border-radius:4px;padding:1px 6px;font-size:10px;font-weight:700">💳 ${c.pix}</span>` : '—'
      const subLinhas = c.lancs.map(l => `<tr style="background:#fafafa">
        <td style="padding:5px 10px;font-size:10px;color:#94a3b8">${l.tipo}</td>
        <td style="padding:5px 10px;font-size:11px;color:#475569">${l.obra}</td>
        <td style="padding:5px 10px;font-size:11px;color:#059669;text-align:right">${l.dtPgt}</td>
        <td style="padding:5px 10px;font-size:12px;font-weight:700;color:#15803d;text-align:right">R$ ${l.valor.toLocaleString('pt-BR',{minimumFractionDigits:2})}</td>
      </tr>`).join('')
      return `<tr style="background:#e8f4fd;border-top:2px solid #bae6fd">
        <td style="padding:8px 10px;font-weight:700;font-size:13px">${c.chapa !== '—'?`<span style="font-size:10px;color:#0369a1;margin-right:6px">${c.chapa}</span>`:''}${c.nome}</td>
        <td style="padding:8px 10px;font-size:11px">${c.funcao}</td>
        <td style="padding:8px 10px">${pixDisp}</td>
        <td style="padding:8px 10px;font-size:13px;font-weight:800;color:#15803d;text-align:right">R$ ${c.total.toLocaleString('pt-BR',{minimumFractionDigits:2})}</td>
      </tr>${subLinhas}`
    }).join('')
    const totalGer = Object.values(mapaColab).reduce((s,c)=>s+c.total,0)
    const html = `<!DOCTYPE html><html><head><meta charset="UTF-8"/><title>Rel. Realizados</title>
    <style>body{font-family:Arial,sans-serif;font-size:12px;margin:20px}h2{color:#15803d}table{width:100%;border-collapse:collapse;border:1px solid #e2e8f0}th{padding:6px 10px;background:#f8fafc;text-align:left;font-size:10px;color:#64748b;font-weight:600}tr:hover{background:#f1f5f9}tfoot td{background:#15803d;color:#fff;font-weight:800;font-size:13px}</style></head>
    <body><h2>✅ Relatório de Pagamentos Realizados</h2><p style="color:#64748b">Emitido em: ${dataGer}</p>
    <table><thead><tr><th>Colaborador</th><th>Função</th><th>PIX</th><th style="text-align:right">Valor Pago</th></tr></thead>
    <tbody>${blocos}</tbody>
    <tfoot><tr><td colspan="3" style="padding:8px 10px">TOTAL GERAL (${Object.keys(mapaColab).length} colaboradores)</td><td style="padding:8px 10px;text-align:right">R$ ${totalGer.toLocaleString('pt-BR',{minimumFractionDigits:2})}</td></tr></tfoot>
    </table></body></html>`
    const win = window.open('','_blank','width=900,height=700')
    if (win) { win.document.write(html); win.document.close(); win.print() }
  }

  // ── FOLHA BANCO INTER — CSV para pagamento em lote via PIX ─────────────────
  function gerarFolhaInter(lancamentos: any[], descricaoBase: string) {
    if (lancamentos.length === 0) {
      toast.info('Nenhum lançamento disponível para gerar a folha.'); return
    }

    // Mapeamento de tipo de chave PIX para o formato Inter
    function tipoParaInter(tipo: string | null): string {
      if (!tipo) return 'CPF'
      const t = tipo.toLowerCase()
      if (t === 'cpf')      return 'CPF'
      if (t === 'cnpj')     return 'CNPJ'
      if (t === 'email')    return 'EMAIL'
      if (t === 'telefone' || t === 'celular' || t === 'phone') return 'TELEFONE'
      if (t === 'aleatoria' || t === 'evp' || t === 'aleatório') return 'ALEATORIA'
      return 'CPF'
    }

    // Gera número sequencial único: PDE + AAMM + seq
    const aamm = new Date().toISOString().slice(2,4) + new Date().toISOString().slice(5,7)
    const dataPagamento = new Date().toISOString().slice(0,10)

    const header = 'TipoChave,ChavePix,NomeFavorecido,CPF_CNPJ,Valor,Descricao,DataPagamento,SeuNumero'

    const linhas: string[] = []
    let seq = 1

    // Agrupa por colaborador (somando múltiplos lançamentos do mesmo colaborador)
    const agrupado = new Map<string, {
      nome: string; cpf: string; pixChave: string; pixTipo: string | null; total: number
    }>()

    for (const l of lancamentos) {
      const cid    = l.colaborador_id ?? l.id
      const nome   = (l.colaboradores?.nome ?? '—').toUpperCase()
      const cpf    = (l.colaboradores?.cpf  ?? '').replace(/\D/g,'')
      const pixCh  = (l.colaboradores?.pix_chave ?? l.colaboradores?.pix  ?? cpf).replace(/\s/g,'')
      const pixTp  = l.colaboradores?.pix_tipo ?? (cpf ? 'cpf' : null)
      const valor  = l.snap_liquido ?? l.valor_liquido ?? 0
      if (valor <= 0) continue
      if (!agrupado.has(cid)) {
        agrupado.set(cid, { nome, cpf, pixChave: pixCh, pixTipo: pixTp, total: 0 })
      }
      agrupado.get(cid)!.total += valor
    }

    for (const [, c] of agrupado) {
      if (c.total <= 0) continue
      const tipoChave = tipoParaInter(c.pixTipo)
      const chavePix  = c.pixChave || c.cpf
      if (!chavePix) continue    // sem chave PIX nem CPF → pula
      const cpfLimpo  = c.cpf || chavePix.replace(/\D/g,'')
      const seuNum    = `PDE${aamm}-${String(seq).padStart(4,'0')}`
      const valor     = c.total.toFixed(2)
      const descricao = descricaoBase.replace(/,/g,';')  // garante que vírgulas não quebrem o CSV
      linhas.push([tipoChave, chavePix, c.nome, cpfLimpo, valor, descricao, dataPagamento, seuNum].join(','))
      seq++
    }

    if (linhas.length === 0) {
      toast.warning('Nenhum colaborador com chave PIX ou CPF cadastrado. Cadastre os dados bancários no módulo Colaboradores.')
      return
    }

    const totalCSV = Array.from(agrupado.values()).reduce((s,c) => s + c.total, 0)
    const csv  = header + '\n' + linhas.join('\n')
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
    const url  = URL.createObjectURL(blob)
    const a    = document.createElement('a')
    a.href     = url
    a.download = `folha_inter_${dataPagamento}_${linhas.length}colab.csv`
    a.click()
    URL.revokeObjectURL(url)
    toast.success(`✅ Folha Inter gerada! ${linhas.length} colaboradores · R$ ${totalCSV.toLocaleString('pt-BR',{minimumFractionDigits:2})}`)
  }

  async function gerarRelatorioAgendados() {
    // Pega TODOS os agendados (status liberado), sem filtros de tela
    const todos = lancsPendentes.filter((l: any) => l.status === 'liberado')
    const totalGeral = todos.reduce((s: number, l: any) => s + (l.snap_liquido ?? 0), 0)
    const dataGer    = new Date().toLocaleDateString('pt-BR')
    const mesRef     = todos[0]?.mes_referencia ?? ''
    const mesLabel   = mesRef
      ? `${mesRef.slice(5)}/${mesRef.slice(0,4)}`
      : 'Agendados'

    // Agrupa por FUNÇÃO (modelo idêntico ao Relatório VT)
    const porFuncao: Record<string, { cols: any[]; total: number }> = {}
    todos.forEach((l: any) => {
      const fn = l.colaboradores?.funcoes?.nome ?? '—'
      if (!porFuncao[fn]) porFuncao[fn] = { cols: [], total: 0 }
      porFuncao[fn].cols.push(l)
      porFuncao[fn].total += (l.snap_liquido ?? 0)
    })

    const blocosFuncao = Object.entries(porFuncao)
      .sort(([a],[b]) => a.localeCompare(b))
      .map(([fn, { cols, total: tfn }]) => {
        const colsOrd = [...cols].sort((a,b) => (a.colaboradores?.nome ?? '').localeCompare(b.colaboradores?.nome ?? ''))

        // Agrupa por colaborador dentro da função
        const porColab: Record<string, { lancs: any[]; total: number; chapa: string; pix: string }> = {}
        colsOrd.forEach((l: any) => {
          const key = l.colaborador_id ?? l.colaboradores?.nome ?? '—'
          const pix = l.colaboradores?.chave_pix ?? l.colaboradores?.cpf ?? '—'
          if (!porColab[key]) porColab[key] = { lancs:[], total:0, chapa: l.colaboradores?.chapa ?? '—', pix }
          porColab[key].lancs.push(l)
          porColab[key].total += (l.snap_liquido ?? 0)
        })

        const linhasColab = Object.entries(porColab).map(([, { lancs, total: tc, chapa, pix }]) => {
          const nome = lancs[0]?.colaboradores?.nome ?? '—'
          const pixDisplay = pix !== '—'
            ? `<span style="background:#f0fdf4;color:#15803d;border-radius:4px;padding:2px 7px;font-weight:700;font-size:10px">💳 ${pix}</span>`
            : `<span style="color:#94a3b8;font-size:10px">—</span>`
          const totalColab = tc.toLocaleString('pt-BR', { minimumFractionDigits:2 })

          // Linhas de cada lançamento deste colaborador
          const subLinhas = lancs.map((l: any) => {
            const dtIni = l.data_inicio ? l.data_inicio.slice(8)+'/'+l.data_inicio.slice(5,7) : '—'
            const dtFim = l.data_fim    ? l.data_fim.slice(8)+'/'+l.data_fim.slice(5,7)       : '—'
            const per   = `${dtIni} → ${dtFim}`
            const obra  = l.obras?.nome ?? '—'
            const liq   = (l.snap_liquido ?? 0).toLocaleString('pt-BR', { minimumFractionDigits:2 })
            return `<tr style="background:#fafafa">
              <td style="padding:4px 10px 4px 28px;border-bottom:1px solid #f1f5f9;font-size:10px;color:#94a3b8;white-space:nowrap">↳ ${per}</td>
              <td style="padding:4px 10px;border-bottom:1px solid #f1f5f9;font-size:10px;color:#94a3b8">${obra}</td>
              <td style="padding:4px 10px;border-bottom:1px solid #f1f5f9;font-size:11px;font-weight:600;color:#15803d;text-align:right">R$ ${liq}</td>
              <td style="padding:4px 10px;border-bottom:1px solid #f1f5f9;font-size:10px;text-align:center">
                <span style="background:#fef9c3;color:#b45309;border-radius:4px;padding:2px 6px;font-weight:700;font-size:9px">⏳ Agendado</span>
              </td>
            </tr>`
          }).join('')

          const totalRow = lancs.length > 1 ? `
            <tr style="background:#f0fdf4">
              <td colspan="2" style="padding:5px 10px;font-size:11px;font-weight:700;color:#15803d">
                TOTAL ${nome} (${lancs.length} lançamentos)
              </td>
              <td style="padding:5px 10px;text-align:right;font-size:12px;font-weight:800;color:#15803d">R$ ${totalColab}</td>
              <td></td>
            </tr>` : ''

          return `
            <tr style="background:#e8f4fd;border-top:2px solid #bae6fd">
              <td style="padding:8px 10px;font-size:13px;font-weight:700;color:#0c4a6e">
                ${chapa !== '—' ? `<span style="font-size:10px;color:#0369a1;font-weight:600;margin-right:6px">${chapa}</span>` : ''}
                ${nome}
              </td>
              <td style="padding:8px 10px;font-size:11px;color:#0369a1">${pixDisplay}</td>
              <td style="padding:8px 10px;text-align:right;font-size:12px;font-weight:700;color:#0c4a6e">R$ ${totalColab}</td>
              <td style="padding:8px 10px;font-size:10px;color:#64748b;text-align:center">${lancs.length} lanç.</td>
            </tr>
            ${subLinhas}
            ${totalRow}`
        }).join('')

        const subtotal = tfn.toLocaleString('pt-BR', { minimumFractionDigits:2 })
        const nColabs  = Object.keys(porColab).length
        return `
          <div style="margin-bottom:28px;break-inside:avoid">
            <div style="display:flex;align-items:center;gap:10px;margin-bottom:4px">
              <span style="background:#e0f2fe;color:#0369a1;font-size:11px;font-weight:800;padding:3px 12px;border-radius:4px;letter-spacing:0.06em;border-left:3px solid #0369a1">
                FUNÇÃO: ${fn}
              </span>
              <span style="font-size:11px;color:#64748b">— ${nColabs} colaborador(es) · ${cols.length} lançamento(s)</span>
            </div>
            <table style="width:100%;border-collapse:collapse;border:1px solid #e2e8f0">
              <thead>
                <tr style="background:#f8fafc">
                  <th style="padding:6px 10px;text-align:left;font-size:10px;color:#64748b;font-weight:600">Nome / Período</th>
                  <th style="padding:6px 10px;text-align:left;font-size:10px;color:#64748b;font-weight:600">Obra / PIX</th>
                  <th style="padding:6px 10px;text-align:right;font-size:10px;color:#64748b;font-weight:600">Valor</th>
                  <th style="padding:6px 10px;text-align:center;font-size:10px;color:#64748b;font-weight:600">Status</th>
                </tr>
              </thead>
              <tbody>${linhasColab}</tbody>
              <tfoot>
                <tr style="background:#0369a1">
                  <td colspan="2" style="padding:7px 10px;font-size:11px;font-weight:700;color:#fff">
                    Subtotal — ${fn} (${nColabs} colaborador(es) · ${cols.length} lançamento(s))
                  </td>
                  <td style="padding:7px 10px;text-align:right;font-size:13px;font-weight:800;color:#fff">R$ ${subtotal}</td>
                  <td></td>
                </tr>
              </tfoot>
            </table>
          </div>`
      }).join('')

    const html = `<!DOCTYPE html><html><head><meta charset="UTF-8"/>
      <title>Relatório de Pagamentos Agendados</title>
      <style>
        body { font-family: Arial, sans-serif; padding: 28px; color: #1e293b; }
        ${CABECALHO_CSS}
        @media print { body { padding: 12px } @page { margin: 1cm } }
      </style>
    </head><body>
      ${gerarCabecalhoHTML(await fetchEmpresaData(), {
        titulo: 'Relatório de Pagamentos Agendados',
        subtitulo: `${todos.length} lançamento(s) agendados · Total: R$ ${totalGeral.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`,
        periodo: mesLabel,
      })}
      ${blocosFuncao}
    </body></html>`

    const win = window.open('', '_blank')
    if (win) { win.document.write(html); win.document.close(); setTimeout(() => win.print(), 500) }
  }

  return (
    <div className="page-root">
      {/* Header — padrão do sistema */}
      <PageHeader
        title="Pagamentos"
        subtitle="Lançamentos liberados da folha e pagamentos avulsos"
      />

      {/* Cards resumo — 3 painéis EM ABERTO / REALIZADOS / TOTAL */}
      {(() => {
        const qtdLib     = lancsPendentes.filter((l:any)=>l.status==='liberado').length
        const vlLib      = lancsPendentes.filter((l:any)=>l.status==='liberado').reduce((s:number,l:any)=>s+(l.snap_liquido??0),0)
        const qtdAvPend  = rows.filter(r=>r.status==='pendente').length
        const vlAvPend   = rows.filter(r=>r.status==='pendente').reduce((s:any,r:any)=>s+(r.valor_liquido??r.valor_bruto??0),0)
        const qtdAdPend  = rows.filter(r=>r.tipo==='adiantamento'&&r.status==='pendente').length
        const vlAdPend   = rows.filter(r=>r.tipo==='adiantamento'&&r.status==='pendente').reduce((s:any,r:any)=>s+(r.valor_liquido??r.valor_bruto??0),0)
        const qtdPrPend  = rows.filter(r=>r.tipo==='premio'&&r.status==='pendente').length
        const vlPrPend   = rows.filter(r=>r.tipo==='premio'&&r.status==='pendente').reduce((s:any,r:any)=>s+(r.valor_liquido??r.valor_bruto??0),0)
        const totalAberto= vlLib + vlAvPend + vlAdPend + vlPrPend
        const qtdAberto  = qtdLib + qtdAvPend + qtdAdPend + qtdPrPend

        const qtdFolhaPaga = lancsPendentes.filter((l:any)=>l.status==='pago'&&l.mes_referencia===filtroMesLanc).length
        const vlFolhaPaga  = lancsPendentes.filter((l:any)=>l.status==='pago'&&l.mes_referencia===filtroMesLanc).reduce((s:number,l:any)=>s+(l.snap_liquido??0),0)
        const qtdAvPago    = rows.filter(r=>r.status==='pago'&&r.competencia===filtroMesLanc).length
        const vlAvPago     = rows.filter(r=>r.status==='pago'&&r.competencia===filtroMesLanc).reduce((s:any,r:any)=>s+(r.valor_liquido??r.valor_bruto??0),0)
        const totalPago    = vlFolhaPaga + vlAvPago
        const qtdPago      = qtdFolhaPaga + qtdAvPago

        // Totais GERAL (todos os status=pago, sem filtro de mês)
        const qtdFolhaPagaTotal = lancsPendentes.filter((l:any)=>l.status==='pago').length
        const vlFolhaPagaTotal  = lancsPendentes.filter((l:any)=>l.status==='pago').reduce((s:number,l:any)=>s+(l.snap_liquido??0),0)
        const qtdAvPagoTotal    = rows.filter(r=>r.status==='pago').length
        const vlAvPagoTotal     = rows.filter(r=>r.status==='pago').reduce((s:any,r:any)=>s+(r.valor_liquido??r.valor_bruto??0),0)
        const totalPagoGeral    = vlFolhaPagaTotal + vlAvPagoTotal
        const qtdPagoGeral      = qtdFolhaPagaTotal + qtdAvPagoTotal

        return (
        <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr 1fr', gap:12, marginBottom:20 }}>
          {/* EM ABERTO */}
          <div style={{ background:'#fff7ed', border:'2px solid #fed7aa', borderRadius:12, padding:'14px 18px' }}>
            <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:10 }}>
              <span style={{ fontSize:12, fontWeight:800, color:'#b45309', textTransform:'uppercase', letterSpacing:'0.05em' }}>⏳ Em Aberto</span>
              <span style={{ background:'#b45309', color:'#fff', borderRadius:20, padding:'2px 10px', fontSize:11, fontWeight:700 }}>{qtdAberto} itens</span>
            </div>
            <div style={{ fontSize:22, fontWeight:800, color:'#b45309', marginBottom:8 }}>{formatCurrency(totalAberto)}</div>
            <div style={{ display:'flex', flexDirection:'column', gap:4 }}>
              <div style={{ display:'flex', justifyContent:'space-between', fontSize:11, color:'#92400e' }}>
                <span>💳 Folha liberada</span><strong>{qtdLib} · {formatCurrency(vlLib)}</strong>
              </div>
              <div style={{ display:'flex', justifyContent:'space-between', fontSize:11, color:'#92400e' }}>
                <span>📋 Avulsos pend.</span><strong>{qtdAvPend} · {formatCurrency(vlAvPend)}</strong>
              </div>
              <div style={{ display:'flex', justifyContent:'space-between', fontSize:11, color:'#92400e' }}>
                <span>💰 Adiantamentos</span><strong>{qtdAdPend} · {formatCurrency(vlAdPend)}</strong>
              </div>
              <div style={{ display:'flex', justifyContent:'space-between', fontSize:11, color:'#92400e' }}>
                <span>🏆 Prêmios</span><strong>{qtdPrPend} · {formatCurrency(vlPrPend)}</strong>
              </div>
            </div>
          </div>
          {/* REALIZADOS */}
          <div style={{ background:'#f0fdf4', border:'2px solid #bbf7d0', borderRadius:12, padding:'14px 18px' }}>
            <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:8 }}>
              <span style={{ fontSize:12, fontWeight:800, color:'#15803d', textTransform:'uppercase', letterSpacing:'0.05em' }}>✅ Realizados</span>
              <span style={{ background:'#15803d', color:'#fff', borderRadius:20, padding:'2px 10px', fontSize:11, fontWeight:700 }}>{qtdPagoGeral} pagos</span>
            </div>
            <div style={{ fontSize:22, fontWeight:800, color:'#15803d', marginBottom:2 }}>{formatCurrency(totalPagoGeral)}</div>
            <div style={{ fontSize:11, color:'#166534', marginBottom:8 }}>Total histórico (todos os períodos)</div>
            <div style={{ display:'flex', flexDirection:'column', gap:4 }}>
              <div style={{ display:'flex', justifyContent:'space-between', fontSize:11, color:'#166534' }}>
                <span>📑 Folha de ponto</span><strong>{qtdFolhaPagaTotal} · {formatCurrency(vlFolhaPagaTotal)}</strong>
              </div>
              <div style={{ display:'flex', justifyContent:'space-between', fontSize:11, color:'#166534' }}>
                <span>📋 Avulsos pagos</span><strong>{qtdAvPagoTotal} · {formatCurrency(vlAvPagoTotal)}</strong>
              </div>
            </div>
          </div>
          {/* TOTAL GERAL */}
          <div style={{ background:'#f5f3ff', border:'2px solid #ddd6fe', borderRadius:12, padding:'14px 18px' }}>
            <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:10 }}>
              <span style={{ fontSize:12, fontWeight:800, color:'#7c3aed', textTransform:'uppercase', letterSpacing:'0.05em' }}>📊 Total Geral</span>
              <span style={{ background:'#7c3aed', color:'#fff', borderRadius:20, padding:'2px 10px', fontSize:11, fontWeight:700 }}>{qtdAberto+qtdPagoGeral} lançamentos</span>
            </div>
            <div style={{ fontSize:22, fontWeight:800, color:'#7c3aed', marginBottom:8 }}>{formatCurrency(totalAberto + totalPagoGeral)}</div>
            <div style={{ display:'flex', flexDirection:'column', gap:4 }}>
              <div style={{ display:'flex', justifyContent:'space-between', fontSize:11, color:'#5b21b6' }}>
                <span>⏳ Em Aberto</span><strong>{formatCurrency(totalAberto)}</strong>
              </div>
              <div style={{ display:'flex', justifyContent:'space-between', fontSize:11, color:'#5b21b6' }}>
                <span>✅ Realizado (total)</span><strong>{formatCurrency(totalPagoGeral)}</strong>
              </div>
            </div>
          </div>
        </div>
        )
      })()}

      {/* Abas — padrão do sistema */}
      <div className="flex gap-0 mb-0" style={{ borderBottom:'2px solid var(--border)', justifyContent:'space-between', alignItems:'flex-end' }}>
        <div className="flex gap-0">
        {([
          { key:'agendados',  label:'⏳ Agendados',  count: lancsPendentes.filter(l=>l.status==='liberado').length },
          { key:'realizados', label:'✅ Realizados', count: lancsPendentes.filter(l=>l.status==='pago').length + rows.filter(r=>r.status==='pago').length },
        ] as {key:'agendados'|'realizados';label:string;count:number}[]).map(tab => (
          <button key={tab.key} onClick={()=>setAba(tab.key)}
            style={{
              padding:'10px 20px', fontSize:13, fontWeight: aba===tab.key?700:500,
              border:'none', background:'transparent', cursor:'pointer',
              borderBottom: aba===tab.key?'2px solid var(--primary)':'2px solid transparent',
              color: aba===tab.key?'var(--primary)':'var(--muted-foreground)', marginBottom:-2,
            }}>
            {tab.label}
            <span style={{ marginLeft:6, fontSize:11, background: aba===tab.key?'hsl(var(--primary)/.1)':'var(--muted)', color: aba===tab.key?'var(--primary)':'var(--muted-foreground)', borderRadius:10, padding:'1px 7px', fontWeight:600 }}>
              {tab.count}
            </span>
          </button>
        ))}
        </div>
        {/* Botões de relatório separados por aba */}
        {aba === 'agendados' && (
          <button onClick={() => gerarRelatorioAgendados()}
            style={{ marginBottom:4, padding:'6px 14px', borderRadius:7, border:'1px solid #b45309', background:'#fff7ed', color:'#b45309', fontSize:12, fontWeight:700, cursor:'pointer', display:'flex', alignItems:'center', gap:6 }}>
            📊 Rel. Agendamentos
          </button>
          <button
            onClick={() => {
              const libFolha = lancsPendentes.filter((l:any) => l.status==='liberado')
              const mesR = libFolha[0]?.mes_referencia ?? new Date().toISOString().slice(0,7)
              const mesLabel = `${mesR.slice(5,7)}/${mesR.slice(0,4)}`
              gerarFolhaInter(libFolha, `Folha ${mesLabel}`)
            }}
            style={{ marginBottom:4, padding:'6px 14px', borderRadius:7, border:'2px solid #059669', background:'linear-gradient(135deg,#059669,#047857)', color:'#fff', fontSize:12, fontWeight:800, cursor:'pointer', display:'flex', alignItems:'center', gap:6, boxShadow:'0 2px 8px rgba(5,150,105,0.35)' }}>
            🏦 Gerar Folha Inter (Agendados)
          </button>
        )}
        {aba === 'realizados' && (
          <button onClick={() => gerarRelatorioRealizados()}
            style={{ marginBottom:4, padding:'6px 14px', borderRadius:7, border:'1px solid #15803d', background:'#f0fdf4', color:'#15803d', fontSize:12, fontWeight:700, cursor:'pointer', display:'flex', alignItems:'center', gap:6 }}>
            📊 Rel. Realizados
          </button>
          <button
            onClick={() => {
              const pagos = lancsPendentes.filter((l:any) => l.status==='pago')
              const mesR  = filtroMesLanc || (pagos[0]?.mes_referencia ?? new Date().toISOString().slice(0,7))
              const mesLabel = `${mesR.slice(5,7)}/${mesR.slice(0,4)}`
              gerarFolhaInter(pagos, `Folha ${mesLabel}`)
            }}
            style={{ marginBottom:4, padding:'6px 14px', borderRadius:7, border:'2px solid #059669', background:'linear-gradient(135deg,#059669,#047857)', color:'#fff', fontSize:12, fontWeight:800, cursor:'pointer', display:'flex', alignItems:'center', gap:6, boxShadow:'0 2px 8px rgba(5,150,105,0.35)' }}>
            🏦 Gerar Folha Inter (Realizados)
          </button>
        )}
      </div>

      {/* Filtros — padrão do sistema com componentes Select/Input */}
      <div className="flex flex-wrap items-end gap-3 py-4 mb-4" style={{ borderBottom:'1px solid var(--border)' }}>

        <div className="relative">
          <label className="text-xs font-semibold text-muted-foreground block mb-1">Colaborador</label>
          <div className="relative">
            <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <input placeholder="Nome ou chapa…" value={filtroNomeLanc} onChange={e=>setFiltroNomeLanc(e.target.value)}
              className="h-9 pl-8 pr-3 text-sm border border-input rounded-md bg-background text-foreground w-48" />
          </div>
        </div>
        <div>
          <label className="text-xs font-semibold text-muted-foreground block mb-1">Obra</label>
          <select value={filtroObraLanc} onChange={e=>setFiltroObraLanc(e.target.value)}
            className="h-9 px-3 text-sm border border-input rounded-md bg-background text-foreground w-44">
            <option value="todos">Todas as obras</option>
            {obras.map(o => <option key={o.id} value={o.id}>{o.nome}</option>)}
          </select>
        </div>
        <div>
          <label className="text-xs font-semibold text-muted-foreground block mb-1">Função</label>
          <select value={filtroFuncaoLanc} onChange={e=>setFiltroFuncaoLanc(e.target.value)}
            className="h-9 px-3 text-sm border border-input rounded-md bg-background text-foreground w-44">
            <option value="todos">Todas as funções</option>
            {funcoes.map(f => <option key={f.id} value={f.id}>{f.nome}</option>)}
          </select>
        </div>
        <div>
          <label className="text-xs font-semibold text-muted-foreground block mb-1">{aba==='agendados'?'Período de':'Data pgto de'}</label>
          <input type="date" value={filtroDataIni} onChange={e=>setFiltroDataIni(e.target.value)}
            className="h-9 px-3 text-sm border border-input rounded-md bg-background text-foreground" />
        </div>
        <div>
          <label className="text-xs font-semibold text-muted-foreground block mb-1">até</label>
          <input type="date" value={filtroDataFim} onChange={e=>setFiltroDataFim(e.target.value)}
            className="h-9 px-3 text-sm border border-input rounded-md bg-background text-foreground" />
        </div>
        {aba === 'realizados' && (
          <div>
            <label className="text-xs font-semibold text-muted-foreground block mb-1">Competência / Mês</label>
            <input type="month" value={filtroMesLanc} onChange={e=>setFiltroMesLanc(e.target.value)}
              className="h-9 px-3 text-sm border border-input rounded-md bg-background text-foreground"
              title="Deixe em branco para ver todos os meses" />
            {filtroMesLanc && <button onClick={()=>setFiltroMesLanc('')} style={{marginLeft:4,fontSize:11,color:'#64748b',background:'none',border:'none',cursor:'pointer'}}>✕ Todos</button>}
          </div>
        )}
        {(filtroNomeLanc||filtroDataIni||filtroDataFim||filtroObraLanc!=='todos'||filtroFuncaoLanc!=='todos'||filtroMesLanc) && (
          <Button variant="outline" size="sm" onClick={()=>{setFiltroNomeLanc('');setFiltroDataIni('');setFiltroDataFim('');setFiltroObraLanc('todos');setFiltroFuncaoLanc('todos');setFiltroMesLanc('')}}>
            ✕ Limpar tudo
          </Button>
        )}
      </div>

      {/* ══ ABA AGENDADOS ══ */}
      {aba === 'agendados' && (
        loadingLancs ? <LoadingSkeleton /> : (() => {
          const pendentes = rows.filter(r =>
            r.status === 'pendente' &&
            (filtroMesLanc ? r.competencia === filtroMesLanc : true) &&
            (filtroNomeLanc ? (r.colaboradores?.nome?.toLowerCase().includes(filtroNomeLanc.toLowerCase()) || (r.colaboradores?.chapa??'').toLowerCase().includes(filtroNomeLanc.toLowerCase())) : true)
          )
          const pendVT     = pendentes.filter(r => r.tipo === 'vale_transporte')
          const pendOutros = pendentes.filter(r => r.tipo !== 'vale_transporte')

          return (
          <>
            {/* Sub-abas Folha / VT / Outros */}
            <div style={{ display:'flex', gap:0, borderBottom:'2px solid var(--border)', marginBottom:16 }}>
              {([
                { key:'folha',  label:'📄 Folha de Ponto', count: lancsAgendados.length },
                { key:'vt',     label:'🚌 Vale Transporte', count: pendVT.length },
                { key:'outros', label:'📋 Outros', count: pendOutros.length },
              ] as {key:'folha'|'vt'|'outros';label:string;count:number}[]).map(st => (
                <button key={st.key} onClick={() => setAbaAgend(st.key)}
                  style={{ padding:'9px 20px', fontWeight: abaAgend===st.key?700:500, fontSize:13,
                    borderBottom: abaAgend===st.key?'3px solid #1d4ed8':'3px solid transparent',
                    color: abaAgend===st.key?'#1d4ed8':'var(--muted-foreground)', background:'none', border:'none',
                    borderBottomStyle:'solid', cursor:'pointer', display:'flex', alignItems:'center', gap:6 }}>
                  {st.label}
                  {st.count > 0 && <span style={{ background: abaAgend===st.key?'#1d4ed8':'#94a3b8', color:'#fff', borderRadius:20, padding:'1px 8px', fontSize:10, fontWeight:700 }}>{st.count}</span>}
                </button>
              ))}
              <div style={{ marginLeft:'auto', display:'flex', alignItems:'center', gap:8, paddingBottom:4 }}>
                {abaAgend === 'folha' && lancsAgendados.length > 0 && (
                  <>
                    <button onClick={() => gerarRelatorioAgendados()}
                      style={{ padding:'5px 14px', borderRadius:7, border:'1px solid #b45309', background:'#fff7ed', color:'#b45309', fontSize:12, fontWeight:700, cursor:'pointer' }}>
                      📊 Rel. Folha Agendada
                    </button>
                    <button
                      onClick={() => {
                        const mesR     = lancsAgendados[0]?.mes_referencia ?? new Date().toISOString().slice(0,7)
                        const mesLabel = `${mesR.slice(5,7)}/${mesR.slice(0,4)}`
                        gerarFolhaInter(lancsAgendados, `Folha ${mesLabel}`)
                      }}
                      style={{ padding:'5px 14px', borderRadius:7, border:'2px solid #059669', background:'linear-gradient(135deg,#059669,#047857)', color:'#fff', fontSize:12, fontWeight:800, cursor:'pointer', display:'flex', alignItems:'center', gap:5, boxShadow:'0 2px 6px rgba(5,150,105,0.35)' }}>
                      🏦 Gerar Folha Inter
                    </button>
                  </>
                )}
                {abaAgend === 'vt' && pendVT.length > 0 && (
                  <button onClick={() => setShowRelatorioVT(true)}
                    style={{ padding:'5px 14px', borderRadius:7, border:'1px solid #0369a1', background:'#eff6ff', color:'#0369a1', fontSize:12, fontWeight:700, cursor:'pointer' }}>
                    📊 Rel. Vale Transporte
                  </button>
                )}
              </div>
            </div>

            {/* ── SUB-ABA: FOLHA DE PONTO ── */}
            {abaAgend === 'folha' && (
              lancsAgendados.length === 0
                ? <div style={{ textAlign:'center', padding:40, color:'#94a3b8', fontSize:14 }}>✅ Nenhum lançamento de folha pendente no período</div>
                : <div style={{ border:'1px solid var(--border)', borderRadius:10, overflow:'hidden', marginBottom:24 }}>
                  <Table>
                    <TableHeader><TableRow>
                      <TableHead>Colaborador</TableHead>
                      <TableHead>Obra</TableHead>
                      <TableHead className="text-center">Período</TableHead>
                      <TableHead className="text-center">Competência</TableHead>
                      <TableHead className="text-right">💵 Líquido</TableHead>
                      <TableHead className="text-right">Ações</TableHead>
                    </TableRow></TableHeader>
                    <TableBody>
                      {lancsAgendados.map((l: any) => (
                        <TableRow key={l.id}>
                          <TableCell>
                            <div className="font-semibold text-sm">{l.colaboradores?.nome ?? '—'}</div>
                            <div className="text-xs text-muted-foreground">{l.colaboradores?.chapa} · {l.colaboradores?.tipo_contrato?.toUpperCase()}</div>
                          </TableCell>
                          <TableCell className="text-sm">{l.obras?.nome ?? '—'}</TableCell>
                          <TableCell className="text-center text-xs text-muted-foreground">
                            {l.data_inicio?.slice(8)}/{l.data_inicio?.slice(5,7)} → {l.data_fim?.slice(8)}/{l.data_fim?.slice(5,7)}
                          </TableCell>
                          <TableCell className="text-center">
                            <BadgeStatus status="liberado" />
                            <div className="text-xs text-muted-foreground mt-0.5">{l.mes_referencia?.slice(5)}/{l.mes_referencia?.slice(0,4)}</div>
                          </TableCell>
                          <TableCell className="text-right font-bold text-sm" style={{ color:'#15803d' }}>
                            {l.snap_liquido ? formatCurrency(l.snap_liquido) : '—'}
                          </TableCell>
                          <TableCell className="text-right">
                            <div style={{ display:'flex', gap:6, justifyContent:'flex-end' }}>
                              <Button size="sm" className="h-7 text-xs bg-emerald-600 hover:bg-emerald-700 text-white"
                                onClick={() => { setModalPagarLanc(l); setDataPagamento(new Date().toISOString().slice(0,10)); setObsPagamento('') }}>
                                ✅ Confirmar
                              </Button>
                              <Button size="sm" variant="outline" className="h-7 text-xs text-red-600 border-red-300 hover:bg-red-50"
                                onClick={() => { setModalRecusarLanc(l); setMotivoRecusaLanc('') }}>
                                ✕ Recusar
                              </Button>
                            </div>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                    <TableFooter><TableRow>
                      <TableCell colSpan={5} className="text-sm font-semibold">Total — {lancsAgendados.length} lançamento(s)</TableCell>
                      <TableCell className="text-right font-bold text-sm" style={{ color:'#b45309' }}>{formatCurrency(lancsAgendados.reduce((s:number,l:any)=>s+(l.snap_liquido??0),0))}</TableCell>
                    </TableRow></TableFooter>
                  </Table>
                </div>
            )}

            {/* ── SUB-ABA: VALE TRANSPORTE ── */}
            {abaAgend === 'vt' && (
              pendVT.length === 0
                ? <div style={{ textAlign:'center', padding:40, color:'#94a3b8', fontSize:14 }}>✅ Nenhum Vale Transporte pendente</div>
                : <div style={{ border:'1px solid var(--border)', borderRadius:10, overflow:'hidden', marginBottom:24 }}>
                  <Table>
                    <TableHeader><TableRow>
                      <TableHead>Colaborador</TableHead>
                      <TableHead className="text-center">Competência</TableHead>
                      <TableHead>Observação</TableHead>
                      <TableHead className="text-right">💵 Valor</TableHead>
                      <TableHead className="text-right">Ações</TableHead>
                    </TableRow></TableHeader>
                    <TableBody>
                      {pendVT.map((r) => (
                        <TableRow key={r.id}>
                          <TableCell>
                            <div className="font-semibold text-sm">{r.colaboradores?.nome ?? '—'}</div>
                            <div className="text-xs text-muted-foreground">{r.colaboradores?.chapa}</div>
                          </TableCell>
                          <TableCell className="text-center text-sm">{r.competencia?.slice(5)}/{r.competencia?.slice(0,4)}</TableCell>
                          <TableCell className="text-xs text-muted-foreground max-w-[220px] truncate">{r.observacoes ?? '—'}</TableCell>
                          <TableCell className="text-right font-bold text-sm" style={{ color:'#15803d' }}>{formatCurrency(r.valor_liquido ?? r.valor_bruto ?? 0)}</TableCell>
                          <TableCell className="text-right">
                            <div style={{ display:'flex', gap:6, justifyContent:'flex-end' }}>
                              <Button size="sm" className="h-7 text-xs bg-emerald-600 hover:bg-emerald-700 text-white" onClick={() => marcarPago(r.id)}>✅ Confirmar</Button>
                              <Button size="sm" variant="outline" className="h-7 text-xs text-red-600 border-red-300 hover:bg-red-50" onClick={() => setModalRecusarVT(r)}>✕ Recusar</Button>
                            </div>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                    <TableFooter><TableRow>
                      <TableCell colSpan={4} className="text-sm font-semibold">Total VT — {pendVT.length} registro(s)</TableCell>
                      <TableCell className="text-right font-bold text-sm" style={{ color:'#15803d' }}>{formatCurrency(pendVT.reduce((s,r)=>s+(r.valor_liquido??r.valor_bruto??0),0))}</TableCell>
                    </TableRow></TableFooter>
                  </Table>
                </div>
            )}

            {/* ── SUB-ABA: OUTROS (adiantamentos, prêmios) ── */}
            {abaAgend === 'outros' && (
              pendOutros.length === 0
                ? <div style={{ textAlign:'center', padding:40, color:'#94a3b8', fontSize:14 }}>✅ Nenhum pagamento avulso pendente</div>
                : <div style={{ border:'1px solid var(--border)', borderRadius:10, overflow:'hidden', marginBottom:24 }}>
                  <Table>
                    <TableHeader><TableRow>
                      <TableHead>Colaborador</TableHead>
                      <TableHead>Tipo</TableHead>
                      <TableHead className="text-center">Competência</TableHead>
                      <TableHead>Observação</TableHead>
                      <TableHead className="text-right">💵 Valor</TableHead>
                      <TableHead className="text-right">Ações</TableHead>
                    </TableRow></TableHeader>
                    <TableBody>
                      {pendOutros.map((r) => (
                        <TableRow key={r.id}>
                          <TableCell>
                            <div className="font-semibold text-sm">{r.colaboradores?.nome ?? '—'}</div>
                            <div className="text-xs text-muted-foreground">{r.colaboradores?.chapa}</div>
                          </TableCell>
                          <TableCell><span style={{ background:'#ede9fe', color:'#7c3aed', borderRadius:99, padding:'2px 10px', fontSize:11, fontWeight:700 }}>{r.tipo ?? '—'}</span></TableCell>
                          <TableCell className="text-center text-sm">{r.competencia?.slice(5)}/{r.competencia?.slice(0,4)}</TableCell>
                          <TableCell className="text-xs text-muted-foreground max-w-[200px] truncate">{r.observacoes ?? '—'}</TableCell>
                          <TableCell className="text-right font-bold text-sm" style={{ color:'#15803d' }}>{formatCurrency(r.valor_liquido ?? r.valor_bruto ?? 0)}</TableCell>
                          <TableCell className="text-right">
                            <div style={{ display:'flex', gap:6, justifyContent:'flex-end' }}>
                              <Button size="sm" className="h-7 text-xs bg-emerald-600 hover:bg-emerald-700 text-white" onClick={() => marcarPago(r.id)}>✅ Confirmar</Button>
                              <Button size="sm" variant="outline" className="h-7 text-xs text-red-600 border-red-300 hover:bg-red-50" onClick={() => setModalRecusarVT(r)}>✕ Recusar</Button>
                            </div>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                    <TableFooter><TableRow>
                      <TableCell colSpan={5} className="text-sm font-semibold">Total — {pendOutros.length} registro(s)</TableCell>
                      <TableCell className="text-right font-bold text-sm" style={{ color:'#15803d' }}>{formatCurrency(pendOutros.reduce((s,r)=>s+(r.valor_liquido??r.valor_bruto??0),0))}</TableCell>
                    </TableRow></TableFooter>
                  </Table>
                </div>
            )}
          </>
          )
        })()
      )}

            {/* ══ ABA REALIZADOS ══ */}
      {aba === 'realizados' && (() => {
        // ── dados filtrados ──────────────────────────────────────────────────
        const folhaPaga = lancsRealizados

        const avulsosPagos = rows.filter(r => {
          if (r.status !== 'pago') return false
          const matchNome  = filtroNomeLanc ? r.colaboradores?.nome?.toLowerCase().includes(filtroNomeLanc.toLowerCase()) : true
          const matchMes   = filtroMesLanc  ? r.competencia === filtroMesLanc : true
          const matchDtIni = filtroDataIni  ? (r.data_pagamento ?? '') >= filtroDataIni : true
          const matchDtFim = filtroDataFim  ? (r.data_pagamento ?? '') <= filtroDataFim : true
          return matchNome && matchMes && matchDtIni && matchDtFim
        })
        const vtPagos     = avulsosPagos.filter(r => r.tipo === 'vale_transporte')
        const outrosPagos = avulsosPagos.filter(r => r.tipo !== 'vale_transporte')

        const totalFolha  = folhaPaga.reduce((s: number, l: any) => s + (l.snap_liquido ?? 0), 0)
        const totalVT     = vtPagos.reduce((s, r) => s + (r.valor_liquido ?? r.valor_bruto ?? 0), 0)
        const totalOutros = outrosPagos.reduce((s, r) => s + (r.valor_liquido ?? r.valor_bruto ?? 0), 0)
        const totalGeral  = totalFolha + totalVT + totalOutros

        const subAbas = [
          { key: 'folha'  as const, label: '📄 Folha de Ponto',   count: folhaPaga.length,   total: totalFolha  },
          { key: 'vt'     as const, label: '🚌 Vale Transporte',  count: vtPagos.length,     total: totalVT     },
          { key: 'outros' as const, label: '📋 Outros',           count: outrosPagos.length, total: totalOutros },
        ]

        return (
          <div>
            {/* ── Sub-abas ─────────────────────────────────────────────── */}
            <div style={{ display:'flex', gap:0, borderBottom:'2px solid var(--border)', marginBottom:20 }}>
              {subAbas.map(sa => (
                <button key={sa.key} onClick={() => setAbaReal(sa.key)}
                  style={{
                    padding:'10px 22px', fontSize:13, fontWeight: abaReal === sa.key ? 700 : 500,
                    border:'none', background:'transparent', cursor:'pointer',
                    borderBottom: abaReal === sa.key ? '2px solid #15803d' : '2px solid transparent',
                    color: abaReal === sa.key ? '#15803d' : 'var(--muted-foreground)',
                    marginBottom:-2, display:'flex', alignItems:'center', gap:6,
                  }}>
                  {sa.label}
                  <span style={{ background: abaReal === sa.key ? '#dcfce7' : 'var(--muted)', color: abaReal === sa.key ? '#15803d' : 'var(--muted-foreground)', borderRadius:99, padding:'1px 8px', fontSize:11, fontWeight:700 }}>
                    {sa.count}
                  </span>
                </button>
              ))}
              <div style={{ flex:1 }} />
              <span style={{ alignSelf:'center', paddingRight:8, fontSize:13, fontWeight:800, color:'#15803d' }}>
                Total geral: {formatCurrency(totalGeral)}
              </span>
            </div>

            {/* ── 📄 Folha de Ponto ──────────────────────────────────── */}
            {abaReal === 'folha' && (
              folhaPaga.length === 0
                ? <EmptyState icon={<CheckCircle size={32}/>} title="Nenhum pagamento de folha realizado" description="Lançamentos aprovados e pagos aparecerão aqui." />
                : <div style={{ border:'1px solid var(--border)', borderRadius:10, overflow:'hidden' }}>
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Colaborador</TableHead>
                          <TableHead>Obra</TableHead>
                          <TableHead className="text-center">Período</TableHead>
                          <TableHead className="text-center">Data Pgto</TableHead>
                          <TableHead>Obs</TableHead>
                          <TableHead className="text-right">💵 Líquido</TableHead>
                          <TableHead className="text-right">Ações</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {folhaPaga.map((l: any) => {
                          const exp = expandidos.has(l.id)
                          const temSnap = l.snap_valor_total != null
                          const pills = temSnap ? [
                            { emoji:'🟢', label:'Horas',   val: l.snap_horas,         cor:'#15803d', bg:'#dcfce7', desc:false },
                            { emoji:'🟦', label:'DSR',     val: l.snap_dsr,           cor:'#1d4ed8', bg:'#dbeafe', desc:false },
                            { emoji:'🟣', label:'Produção',val: l.snap_producao,      cor:'#7c3aed', bg:'#ede9fe', desc:false },
                            { emoji:'🏆', label:'Prêmio',  val: l.snap_premio,        cor:'#b45309', bg:'#fef3c7', desc:false },
                            { emoji:'🚌', label:'-VT',     val: l.snap_desconto_vt,   cor:'#dc2626', bg:'#fee2e2', desc:true  },
                            { emoji:'💵', label:'-AD',     val: l.snap_desconto_adiant,cor:'#dc2626',bg:'#fee2e2', desc:true  },
                            { emoji:'🏛️', label:'-INSS',   val: l.snap_inss,          cor:'#dc2626', bg:'#fee2e2', desc:true  },
                            { emoji:'📊', label:'-IR',     val: l.snap_ir,            cor:'#dc2626', bg:'#fee2e2', desc:true  },
                          ].filter(p => (p.val ?? 0) > 0) : []
                          return (
                            <React.Fragment key={l.id}>
                              <TableRow>
                                <TableCell>
                                  <div style={{display:'flex', alignItems:'center', gap:6}}>
                                    <button
                                      onClick={() => setExpandidos(prev => { const s = new Set(prev); exp ? s.delete(l.id) : s.add(l.id); return s })}
                                      style={{border:'none', background:'transparent', cursor:'pointer', fontSize:10, padding:2, lineHeight:1, color:'var(--muted-foreground)'}}
                                      title={exp ? 'Recolher detalhes' : 'Ver composição do pagamento'}>
                                      {exp ? '▼' : '▶'}
                                    </button>
                                    <div>
                                      <div className="font-semibold text-sm">{l.colaboradores?.nome ?? '—'}</div>
                                      <div className="text-xs text-muted-foreground">{l.colaboradores?.chapa} · {l.colaboradores?.tipo_contrato?.toUpperCase()}</div>
                                    </div>
                                  </div>
                                </TableCell>
                                <TableCell className="text-sm">{l.obras?.nome ?? '—'}</TableCell>
                                <TableCell className="text-center text-xs text-muted-foreground">
                                  {l.data_inicio?.slice(8)}/{l.data_inicio?.slice(5,7)} → {l.data_fim?.slice(8)}/{l.data_fim?.slice(5,7)}
                                </TableCell>
                                <TableCell className="text-center">
                                  <span className="text-sm font-semibold" style={{ color:'#15803d' }}>
                                    {l.data_pagamento ? formatDate(l.data_pagamento) : '—'}
                                  </span>
                                </TableCell>
                                <TableCell className="text-xs text-muted-foreground max-w-[160px] truncate">{l.obs_pagamento ?? '—'}</TableCell>
                                <TableCell className="text-right font-bold text-sm" style={{ color:'#15803d' }}>
                                  {l.snap_liquido ? formatCurrency(l.snap_liquido) : '—'}
                                </TableCell>
                                <TableCell className="text-right">
                                  <Button size="sm" variant="outline" className="h-7 text-xs text-destructive border-destructive/40 hover:bg-destructive/5"
                                    onClick={() => { setModalEstornar(l); setMotivoEstorno('') }}>
                                    ↩ Estornar
                                  </Button>
                                </TableCell>
                              </TableRow>
                              {exp && (
                                <TableRow style={{ background:'#f8fafc' }}>
                                  <TableCell colSpan={7} style={{ padding:'8px 16px 12px 48px', borderTop:'none' }}>
                                    {!temSnap ? (
                                      <span style={{ fontSize:11, color:'var(--muted-foreground)', fontStyle:'italic' }}>
                                        Detalhes não disponíveis — lançamento anterior ao sistema de snaps.
                                      </span>
                                    ) : (
                                      <div style={{ display:'flex', flexWrap:'wrap', gap:6, alignItems:'center' }}>
                                        {pills.map((p, i) => (
                                          <span key={i} style={{ display:'inline-flex', alignItems:'center', gap:4, background:p.bg, color:p.cor, borderRadius:99, padding:'3px 10px', fontSize:11, fontWeight:700, border:`1px solid ${p.cor}22` }}>
                                            {p.emoji} {p.label}: {formatCurrency(p.val)}
                                          </span>
                                        ))}
                                        <span style={{ display:'inline-flex', alignItems:'center', gap:4, background:'#dcfce7', color:'#14532d', borderRadius:99, padding:'3px 10px', fontSize:11, fontWeight:800, border:'1px solid #16a34a44' }}>
                                          = Bruto: {formatCurrency(l.snap_valor_total)}
                                        </span>
                                      </div>
                                    )}
                                  </TableCell>
                                </TableRow>
                              )}
                            </React.Fragment>
                          )
                        })}
                      </TableBody>
                      <TableFooter>
                        <TableRow>
                          <TableCell colSpan={5} className="text-sm font-semibold">Total — {folhaPaga.length} lançamento(s)</TableCell>
                          <TableCell className="text-right font-bold text-sm" style={{ color:'#15803d' }}>{formatCurrency(totalFolha)}</TableCell>
                          <TableCell />
                        </TableRow>
                      </TableFooter>
                    </Table>
                  </div>
            )}

            {/* ── 🚌 Vale Transporte ─────────────────────────────────── */}
            {abaReal === 'vt' && (
              vtPagos.length === 0
                ? <EmptyState icon={<CheckCircle size={32}/>} title="Nenhum VT pago no período" description="VTs confirmados aparecerão aqui." />
                : <div style={{ border:'1px solid var(--border)', borderRadius:10, overflow:'hidden' }}>
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Colaborador</TableHead>
                          <TableHead className="text-center">Competência</TableHead>
                          <TableHead className="text-center">Período</TableHead>
                          <TableHead className="text-center">Data Pgto</TableHead>
                          <TableHead>Observação</TableHead>
                          <TableHead className="text-right">💵 Valor</TableHead>
                          <TableHead className="text-right">Ações</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {vtPagos.map(r => (
                          <TableRow key={r.id}>
                            <TableCell>
                              <div className="font-semibold text-sm">{r.colaboradores?.nome ?? '—'}</div>
                              <div className="text-xs text-muted-foreground">{r.colaboradores?.chapa}</div>
                            </TableCell>
                            <TableCell className="text-center text-sm font-medium">
                              {r.competencia?.slice(5)}/{r.competencia?.slice(0,4)}
                            </TableCell>
                            <TableCell className="text-center text-xs text-muted-foreground">
                              {r.observacoes?.match(/VT (\S+) → (\S+)/)?.[1]?.slice(8)}/{r.observacoes?.match(/VT (\S+) → (\S+)/)?.[1]?.slice(5,7)} → {r.observacoes?.match(/VT (\S+) → (\S+)/)?.[2]?.slice(8)}/{r.observacoes?.match(/VT (\S+) → (\S+)/)?.[2]?.slice(5,7)}
                            </TableCell>
                            <TableCell className="text-center">
                              <span className="text-sm font-semibold" style={{ color:'#15803d' }}>
                                {r.data_pagamento ? formatDate(r.data_pagamento) : '—'}
                              </span>
                            </TableCell>
                            <TableCell className="text-xs text-muted-foreground max-w-[200px] truncate">{r.observacoes ?? '—'}</TableCell>
                            <TableCell className="text-right font-bold text-sm" style={{ color:'#15803d' }}>
                              {formatCurrency(r.valor_liquido ?? r.valor_bruto ?? 0)}
                            </TableCell>
                            <TableCell className="text-right">
                              <Button size="sm" variant="outline" className="h-7 text-xs text-destructive border-destructive/40 hover:bg-destructive/5"
                                onClick={() => { setModalEstornar({ ...r, _avulso: true }); setMotivoEstorno('') }}>
                                ↩ Estornar
                              </Button>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                      <TableFooter>
                        <TableRow>
                          <TableCell colSpan={6} className="text-sm font-semibold">Total — {vtPagos.length} registro(s)</TableCell>
                          <TableCell className="text-right font-bold text-sm" style={{ color:'#15803d' }}>{formatCurrency(totalVT)}</TableCell>
                        </TableRow>
                      </TableFooter>
                    </Table>
                  </div>
            )}

            {/* ── 📋 Outros ──────────────────────────────────────────── */}
            {abaReal === 'outros' && (
              outrosPagos.length === 0
                ? <EmptyState icon={<CheckCircle size={32}/>} title="Nenhum outro pagamento realizado" description="Adiantamentos, 13º, férias e rescisões pagas aparecerão aqui." />
                : <div style={{ border:'1px solid var(--border)', borderRadius:10, overflow:'hidden' }}>
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Colaborador</TableHead>
                          <TableHead>Tipo</TableHead>
                          <TableHead className="text-center">Competência</TableHead>
                          <TableHead className="text-center">Data Pgto</TableHead>
                          <TableHead>Observação</TableHead>
                          <TableHead className="text-right">💵 Valor</TableHead>
                          <TableHead className="text-right">Ações</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {outrosPagos.map(r => (
                          <TableRow key={r.id}>
                            <TableCell>
                              <div className="font-semibold text-sm">{r.colaboradores?.nome ?? '—'}</div>
                              <div className="text-xs text-muted-foreground">{r.colaboradores?.chapa}</div>
                            </TableCell>
                            <TableCell>
                              <span style={{ background:'#ede9fe', color:'#7c3aed', borderRadius:99, padding:'2px 10px', fontSize:11, fontWeight:700 }}>
                                {r.tipo === 'adiantamento' ? '💵 Adiantamento'
                                  : r.tipo === '13_salario' ? '🎄 13º Salário'
                                  : r.tipo === 'ferias'     ? '🏖️ Férias'
                                  : r.tipo === 'rescisao'   ? '📋 Rescisão'
                                  : r.tipo === 'folha'      ? '📄 Folha'
                                  : r.tipo ?? '—'}
                              </span>
                            </TableCell>
                            <TableCell className="text-center text-sm">{r.competencia?.slice(5)}/{r.competencia?.slice(0,4)}</TableCell>
                            <TableCell className="text-center">
                              <span className="text-sm font-semibold" style={{ color:'#15803d' }}>
                                {r.data_pagamento ? formatDate(r.data_pagamento) : '—'}
                              </span>
                            </TableCell>
                            <TableCell className="text-xs text-muted-foreground max-w-[200px] truncate">{r.observacoes ?? '—'}</TableCell>
                            <TableCell className="text-right font-bold text-sm" style={{ color:'#15803d' }}>
                              {formatCurrency(r.valor_liquido ?? r.valor_bruto ?? 0)}
                            </TableCell>
                            <TableCell className="text-right">
                              <Button size="sm" variant="outline" className="h-7 text-xs text-destructive border-destructive/40 hover:bg-destructive/5"
                                onClick={() => { setModalEstornar({ ...r, _avulso: true }); setMotivoEstorno('') }}>
                                ↩ Estornar
                              </Button>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                      <TableFooter>
                        <TableRow>
                          <TableCell colSpan={6} className="text-sm font-semibold">Total — {outrosPagos.length} registro(s)</TableCell>
                          <TableCell className="text-right font-bold text-sm" style={{ color:'#15803d' }}>{formatCurrency(totalOutros)}</TableCell>
                        </TableRow>
                      </TableFooter>
                    </Table>
                  </div>
            )}
          </div>
        )
      })()}

      {/* ══ MODAL EFETIVAR PAGAMENTO ══ */}
      {modalPagarLanc && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 80, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ background: 'var(--background)', borderRadius: 14, width: 420, padding: 28, boxShadow: '0 20px 60px rgba(0,0,0,0.3)' }}>
            <div style={{ textAlign: 'center', marginBottom: 20 }}>
              <div style={{ fontSize: 38, marginBottom: 8 }}>💰</div>
              <h3 style={{ fontWeight: 800, fontSize: 16, margin: 0 }}>Efetivar Pagamento</h3>
              <p style={{ fontSize: 13, color: 'var(--muted-foreground)', marginTop: 8 }}>
                <strong>{modalPagarLanc.colaboradores?.nome}</strong><br />
                {modalPagarLanc.obras?.nome}<br />
                <span style={{ fontSize: 12 }}>{modalPagarLanc.data_inicio?.slice(8)}/{modalPagarLanc.data_inicio?.slice(5,7)} → {modalPagarLanc.data_fim?.slice(8)}/{modalPagarLanc.data_fim?.slice(5,7)}</span>
              </p>
            </div>
            <div style={{ marginBottom: 16 }}>
              <label style={{ fontSize: 12, fontWeight: 700, display: 'block', marginBottom: 6 }}>📅 Data de Efetivação *</label>
              <input type="date" value={dataPagamento} onChange={e => setDataPagamento(e.target.value)}
                style={{ width: '100%', padding: '8px 10px', fontSize: 13, border: '2px solid #7c3aed', borderRadius: 6, background: 'var(--background)', color: 'var(--foreground)', boxSizing: 'border-box' }} />
            </div>
            <div style={{ marginBottom: 20 }}>
              <label style={{ fontSize: 12, fontWeight: 700, display: 'block', marginBottom: 6 }}>Observação (opcional)</label>
              <textarea value={obsPagamento} onChange={e => setObsPagamento(e.target.value)}
                placeholder="Ex.: Pago via Pix, transferência banco X…" rows={3}
                style={{ width: '100%', padding: '8px 10px', fontSize: 13, border: '1.5px solid #e5e7eb', borderRadius: 6, background: 'var(--background)', color: 'var(--foreground)', resize: 'vertical', fontFamily: 'inherit', boxSizing: 'border-box' }} />
            </div>
            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
              <button onClick={() => setModalPagarLanc(null)}
                style={{ padding: '8px 16px', fontSize: 13, borderRadius: 6, border: '1.5px solid #e5e7eb', background: 'transparent', cursor: 'pointer', color: 'var(--foreground)' }}>Cancelar</button>
              <button disabled={!dataPagamento || savingPgto} onClick={efetivarPagamento}
                style={{ padding: '8px 18px', fontSize: 13, fontWeight: 700, borderRadius: 6, border: 'none', background: '#7c3aed', color: '#fff', cursor: 'pointer', opacity: (!dataPagamento || savingPgto) ? 0.5 : 1 }}>
                {savingPgto ? 'Salvando…' : '💰 Confirmar'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ══ MODAL ESTORNAR ══ */}
      {modalEstornar && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 80, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ background: 'var(--background)', borderRadius: 14, width: 420, padding: 28, boxShadow: '0 20px 60px rgba(0,0,0,0.3)' }}>
            <div style={{ textAlign: 'center', marginBottom: 20 }}>
              <div style={{ fontSize: 38, marginBottom: 8 }}>↩</div>
              <h3 style={{ fontWeight: 800, fontSize: 16, margin: 0, color: '#dc2626' }}>Estornar Pagamento</h3>
              <p style={{ fontSize: 13, color: 'var(--muted-foreground)', marginTop: 8 }}>
                <strong>{modalEstornar.colaboradores?.nome}</strong><br />
                {modalEstornar._avulso
                  ? <>
                      <span style={{ background:'#dbeafe', color:'#1d4ed8', borderRadius:99, padding:'1px 8px', fontSize:11, fontWeight:700 }}>
                        {modalEstornar.tipo === 'vale_transporte' ? '🚌 Vale Transporte'
                          : modalEstornar.tipo === 'adiantamento' ? '💵 Adiantamento'
                          : modalEstornar.tipo === '13_salario'   ? '🎄 13º Salário'
                          : modalEstornar.tipo === 'ferias'       ? '🏖️ Férias'
                          : modalEstornar.tipo === 'rescisao'     ? '📋 Rescisão'
                          : modalEstornar.tipo ?? '—'}
                      </span>
                      {' '}— competência {modalEstornar.competencia?.slice(5)}/{modalEstornar.competencia?.slice(0,4)}
                      <br />pago em {modalEstornar.data_pagamento ? formatDate(modalEstornar.data_pagamento) : '—'}
                    </>
                  : <>{modalEstornar.obras?.nome} — pago em {(modalEstornar as any).data_pagamento ?? '—'}</>
                }
              </p>
            </div>
            <div style={{ marginBottom: 20 }}>
              <label style={{ fontSize: 12, fontWeight: 700, display: 'block', marginBottom: 6 }}>Motivo do Estorno</label>
              <textarea value={motivoEstorno} onChange={e => setMotivoEstorno(e.target.value)}
                placeholder="Ex.: Pagamento duplicado, erro de valor…" rows={3}
                style={{ width: '100%', padding: '8px 10px', fontSize: 13, border: '2px solid #fecaca', borderRadius: 6, background: 'var(--background)', color: 'var(--foreground)', resize: 'vertical', fontFamily: 'inherit', boxSizing: 'border-box' }} />
            </div>
            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
              <button onClick={() => setModalEstornar(null)}
                style={{ padding: '8px 16px', fontSize: 13, borderRadius: 6, border: '1.5px solid #e5e7eb', background: 'transparent', cursor: 'pointer', color: 'var(--foreground)' }}>Cancelar</button>
              <button disabled={savingPgto} onClick={estornarPagamento}
                style={{ padding: '8px 18px', fontSize: 13, fontWeight: 700, borderRadius: 6, border: 'none', background: '#dc2626', color: '#fff', cursor: 'pointer', opacity: savingPgto ? 0.5 : 1 }}>
                {savingPgto ? 'Salvando…' : '↩ Confirmar Estorno'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ══ MODAL CRIAR/EDITAR PAGAMENTO AVULSO ══ */}
      <Dialog open={modalOpen} onOpenChange={setModalOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editando ? 'Editar Pagamento Avulso' : '💵 Novo Pagamento Avulso'}</DialogTitle>
          </DialogHeader>
          <div className="grid grid-cols-2 gap-4 py-2">
            <div className="col-span-2">
              <Label>Colaborador *</Label>
              <Select value={form.colaborador_id} onValueChange={(v) => setField('colaborador_id', v)}>
                <SelectTrigger className="mt-1">
                  <SelectValue placeholder="Selecionar colaborador" />
                </SelectTrigger>
                <SelectContent>
                  {colaboradores.map((c) => (
                    <SelectItem key={c.id} value={c.id}>{c.chapa} — {c.nome}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Obra</Label>
              <Select value={form.obra_id} onValueChange={(v) => setField('obra_id', v)}>
                <SelectTrigger className="mt-1">
                  <SelectValue placeholder="Selecionar obra" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="nenhuma">Nenhuma</SelectItem>
                  {obras.map((o) => (
                    <SelectItem key={o.id} value={o.id}>{o.nome}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Tipo *</Label>
              <Select value={form.tipo} onValueChange={(v) => setField('tipo', v)}>
                <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {TIPO_OPTIONS.map((t) => (
                    <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Competência *</Label>
              <Input type="month" value={form.competencia} onChange={(e) => setField('competencia', e.target.value)} className="mt-1" />
            </div>
            <div>
              <Label>Data Pagamento</Label>
              <Input type="date" value={form.data_pagamento} onChange={(e) => setField('data_pagamento', e.target.value)} className="mt-1" />
            </div>
            <div>
              <Label>Valor Bruto</Label>
              <Input type="number" value={form.valor_bruto} onChange={(e) => setField('valor_bruto', e.target.value)} className="mt-1" placeholder="0,00" />
            </div>
            <div>
              <Label>Adiantamento (desconto)</Label>
              <Input type="number" value={form.adiantamento} onChange={(e) => setField('adiantamento', e.target.value)} className="mt-1" placeholder="0,00" />
            </div>
            <div>
              <Label>Líquido (auto)</Label>
              <Input readOnly value={formatCurrency(calcLiquido(form))} className="mt-1 bg-muted" />
            </div>
            <div>
              <Label>Status</Label>
              <Select value={form.status} onValueChange={(v) => setField('status', v)}>
                <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {STATUS_OPTIONS.map((s) => (
                    <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="col-span-2">
              <Label>Observações</Label>
              <Textarea value={form.observacoes} onChange={(e) => setField('observacoes', e.target.value)} className="mt-1" rows={3} placeholder="Detalhes…" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setModalOpen(false)}>Cancelar</Button>
            <Button disabled={saving} onClick={handleSave} style={{ background: '#7c3aed', color: '#fff' }}>
              {saving ? 'Salvando…' : editando ? '💾 Salvar' : '+ Registrar'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ══ ALERT DELETE ══ */}
      <AlertDialog open={!!deleteId} onOpenChange={(o) => !o && setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Confirmar exclusão?</AlertDialogTitle>
            <AlertDialogDescription>Esta ação não pode ser desfeita.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-destructive text-destructive-foreground">
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* ══ MODAL RECUSAR PAGAMENTO VT ══ */}
      {/* ══ Relatório VT Pendentes ════════════════════════════════════════ */}
      {showRelatorioVT && (() => {
        const vtsPend = rows.filter(r => r.status === 'pendente' && r.tipo === 'vale_transporte')
        // agrupar por obra
        const porObra = new Map<string, typeof vtsPend>()
        vtsPend.forEach(r => {
          const obraKey = r.obras?.nome ?? 'Sem obra'
          if (!porObra.has(obraKey)) porObra.set(obraKey, [])
          porObra.get(obraKey)!.push(r)
        })
        const totalGeral = vtsPend.reduce((s,r)=>s+(r.valor_liquido??r.valor_bruto??0),0)
        return (
          <div style={{ position:'fixed', inset:0, background:'#fff', zIndex:1000, overflow:'auto', padding:'32px 40px' }}>
            <style>{'@media print { button { display: none !important; } }'}</style>
            <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', marginBottom:24 }}>
              <div>
                <h2 style={{ margin:0, fontSize:20, fontWeight:800 }}>Relatório — Vale Transporte Pendente de Pagamento</h2>
                <p style={{ margin:'4px 0 0', fontSize:13, color:'#6b7280' }}>Gerado em {new Date().toLocaleDateString('pt-BR')}</p>
              </div>
              <div style={{ display:'flex', gap:8 }}>
                <Button onClick={() => window.print()}>🖨️ Imprimir / PDF</Button>
                <Button variant="outline" onClick={() => setShowRelatorioVT(false)}>✕ Fechar</Button>
              </div>
            </div>
            {vtsPend.length === 0 ? (
              <div style={{ textAlign:'center', color:'#6b7280', padding:'60px 0' }}>Nenhum VT pendente de pagamento.</div>
            ) : (
              <div style={{ display:'flex', flexDirection:'column', gap:28 }}>
                {[...porObra.entries()].sort(([a],[b])=>a.localeCompare(b)).map(([obraName, obraRows]) => {
                  const totalObra = obraRows.reduce((s,r)=>s+(r.valor_liquido??r.valor_bruto??0),0)
                  return (
                    <div key={obraName}>
                      <div style={{ background:'#f1f5f9', borderLeft:'4px solid #3b82f6', padding:'8px 14px', marginBottom:0, display:'flex', alignItems:'center', gap:10 }}>
                        <span style={{ fontWeight:800, fontSize:14, color:'#1e40af' }}>OBRA: {obraName}</span>
                        <span style={{ fontSize:12, color:'#64748b' }}>— {obraRows.length} colaborador(es)</span>
                        <span style={{ marginLeft:'auto', fontWeight:700, fontSize:13, color:'#15803d' }}>{formatCurrency(totalObra)}</span>
                      </div>
                      <table style={{ width:'100%', borderCollapse:'collapse', fontSize:12 }}>
                        <thead>
                          <tr style={{ background:'#e2e8f0', borderBottom:'2px solid #cbd5e1' }}>
                            <th style={{ padding:'8px 12px', textAlign:'left', fontWeight:700 }}>Chapa</th>
                            <th style={{ padding:'8px 12px', textAlign:'left', fontWeight:700 }}>Nome</th>
                            <th style={{ padding:'8px 12px', textAlign:'left', fontWeight:700 }}>Tipo</th>
                            <th style={{ padding:'8px 12px', textAlign:'left', fontWeight:700 }}>Competência</th>
                            <th style={{ padding:'8px 12px', textAlign:'left', fontWeight:700 }}>Observação</th>
                            <th style={{ padding:'8px 12px', textAlign:'right', fontWeight:700 }}>Valor Empresa</th>
                          </tr>
                        </thead>
                        <tbody>
                          {obraRows.map((r,i) => (
                            <tr key={r.id} style={{ borderBottom:'1px solid #e2e8f0', background: i%2===0?'#fff':'#f8fafc' }}>
                              <td style={{ padding:'7px 12px', color:'#6b7280' }}>{r.colaboradores?.chapa ?? '—'}</td>
                              <td style={{ padding:'7px 12px', fontWeight:600 }}>{r.colaboradores?.nome ?? '—'}</td>
                              <td style={{ padding:'7px 12px' }}>
                                <span style={{ background:'#ede9fe', color:'#7c3aed', borderRadius:99, padding:'2px 10px', fontSize:10, fontWeight:700 }}>
                                  {r.tipo === 'vale_transporte' ? 'VT' : r.tipo}
                                </span>
                              </td>
                              <td style={{ padding:'7px 12px', color:'#374151' }}>{r.competencia?.slice(5)}/{r.competencia?.slice(0,4)}</td>
                              <td style={{ padding:'7px 12px', color:'#6b7280', maxWidth:200 }}>{r.observacoes ?? '—'}</td>
                              <td style={{ padding:'7px 12px', textAlign:'right', fontWeight:700, color:'#15803d' }}>{formatCurrency(r.valor_liquido??r.valor_bruto??0)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )
                })}
                <div style={{ borderTop:'2px solid #1e40af', paddingTop:12, display:'flex', justifyContent:'space-between', alignItems:'center' }}>
                  <span style={{ fontWeight:700, fontSize:14 }}>TOTAL GERAL — {vtsPend.length} VT(s) pendente(s)</span>
                  <span style={{ fontWeight:800, fontSize:16, color:'#15803d' }}>{formatCurrency(totalGeral)}</span>
                </div>
              </div>
            )}
          </div>
        )
      })()}

      {/* ── Modal Confirmar Pagamento com Data ── */}
      {modalConfPgto && (
        <div style={{ position:'fixed',inset:0,background:'rgba(0,0,0,0.4)',zIndex:9999,display:'flex',alignItems:'center',justifyContent:'center' }}>
          <div style={{ background:'#fff',borderRadius:14,padding:'28px 32px',minWidth:360,boxShadow:'0 8px 32px rgba(0,0,0,0.18)' }}>
            <h3 style={{ margin:'0 0 6px',fontSize:16,fontWeight:800,color:'#15803d' }}>✅ Confirmar Pagamento</h3>
            <p style={{ margin:'0 0 16px',fontSize:13,color:'#64748b' }}>
              <strong>{modalConfPgto.colaboradores?.nome}</strong><br/>
              <span style={{fontSize:12}}>{modalConfPgto.tipo === 'vale_transporte' ? '🚌 Vale Transporte' : String(modalConfPgto.tipo)} · {formatCurrency((modalConfPgto as any).valor_liquido ?? (modalConfPgto as any).valor_bruto ?? 0)}</span>
            </p>
            <label style={{ fontSize:12,fontWeight:700,color:'#374151',display:'block',marginBottom:6 }}>📅 Data de efetivação do pagamento</label>
            <input type="date" value={modalConfData} onChange={e=>setModalConfData(e.target.value)}
              style={{ width:'100%',padding:'8px 12px',border:'1px solid #d1d5db',borderRadius:8,fontSize:14,marginBottom:20,boxSizing:'border-box' as any }} />
            <div style={{ display:'flex',gap:10,justifyContent:'flex-end' }}>
              <button onClick={()=>setModalConfPgto(null)} style={{ padding:'8px 18px',borderRadius:8,border:'1px solid #d1d5db',background:'#f9fafb',cursor:'pointer',fontSize:13 }}>Cancelar</button>
              <button onClick={confirmarPagamentoComData} disabled={savingPgto} style={{ padding:'8px 18px',borderRadius:8,border:'none',background:'#15803d',color:'#fff',cursor:'pointer',fontSize:13,fontWeight:700 }}>
                {savingPgto ? 'Salvando...' : '✅ Confirmar Pago'}
              </button>
            </div>
          </div>
        </div>
      )}
      <AlertDialog open={!!modalRecusarVT} onOpenChange={(o) => !o && setModalRecusarVT(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle style={{ display:'flex', alignItems:'center', gap:8 }}>
              ✕ {modalRecusarVT?.tipo === 'adiantamento'
                ? 'Recusar Adiantamento?'
                : modalRecusarVT?.tipo === 'premio'
                  ? 'Recusar Prêmio?'
                  : 'Recusar VT?'}
            </AlertDialogTitle>
            <AlertDialogDescription>
              O registro de pagamento será <strong>excluído</strong> e o lançamento voltará
              para status <strong>editável</strong>, permitindo edição e reenvio.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={savingPgto}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              disabled={savingPgto}
              onClick={recusarPagamentoVT}
              className="bg-destructive text-destructive-foreground"
            >
              {savingPgto ? 'Processando…' : '↩ Recusar e devolver'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
