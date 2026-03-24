import React, { useEffect, useState, useCallback } from 'react'
import { supabase } from '@/lib/supabase'
import type { Pagamento, Colaborador, Obra } from '@/lib/supabase'
import { formatCurrency, formatDate } from '@/lib/utils'
import { PageHeader, BadgeStatus, EmptyState, LoadingSkeleton } from '@/components/Shared'
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
  DollarSign, Plus, Search, Pencil, Trash2, CheckCircle, RotateCcw, Calendar, Building2, Clock,
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
  const [obras, setObras] = useState<Pick<Obra, 'id' | 'nome'>[]>([])
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

  // ─── fetch ─────────────────────────────────────────────────────────────────
  const fetchData = useCallback(async () => {
    setLoading(true)
    const [pagRes, colRes, obrRes] = await Promise.all([
      supabase
        .from('pagamentos')
        .select('*, colaboradores(nome,chapa)')
        .order('competencia', { ascending: false }),
      supabase
        .from('colaboradores')
        .select('id,nome,chapa')
        .eq('status', 'ativo')
        .order('nome'),
      supabase.from('obras').select('id,nome').order('nome'),
    ])
    if (pagRes.error) toast.error('Erro ao carregar pagamentos')
    else setRows((pagRes.data as PagamentoRow[]) ?? [])
    if (colRes.data) setColaboradores(colRes.data)
    if (obrRes.data) setObras(obrRes.data)
    setLoading(false)
  }, [])

  // ─── fetch lançamentos liberados ───────────────────────────────────────────
  const fetchLancsPendentes = useCallback(async () => {
    setLoadingLancs(true)
    const { data } = await supabase
      .from('ponto_lancamentos')
      .select('id, colaborador_id, obra_id, mes_referencia, data_inicio, data_fim, status, motivo_recusa, data_pagamento, obs_pagamento, snap_liquido, snap_valor_total, snap_inss, snap_ir, snap_desconto_vt, snap_desconto_adiant, colaboradores(nome, chapa, tipo_contrato), obras(nome)')
      .in('status', ['liberado', 'pago'])
      .order('mes_referencia', { ascending: false })
    setLancsPendentes(data ?? [])
    setLoadingLancs(false)
  }, [])

  useEffect(() => { fetchData(); fetchLancsPendentes() }, [fetchData, fetchLancsPendentes])

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
    const { error } = await supabase
      .from('pagamentos')
      .update({ status: 'pago', data_pagamento: new Date().toISOString().slice(0, 10) })
      .eq('id', id)
    if (error) toast.error('Erro ao marcar como pago')
    else { toast.success('Pagamento marcado como pago!'); fetchData() }
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
    const { error } = await supabase.from('ponto_lancamentos')
      .update({ status: 'liberado', data_pagamento: null, obs_pagamento: motivoEstorno || 'Estornado' })
      .eq('id', modalEstornar.id)
    setSavingPgto(false)
    if (error) { toast.error('Erro ao estornar: ' + error.message); return }
    toast.success('↩ Pagamento estornado — voltou para Ag. Pagamento')
    setModalEstornar(null); setMotivoEstorno('')
    fetchLancsPendentes()
  }

  // ─── delete ────────────────────────────────────────────────────────────────
  async function handleDelete() {
    if (!deleteId) return
    const { error } = await supabase.from('pagamentos').delete().eq('id', deleteId)
    setDeleteId(null)
    if (error) toast.error('Erro ao excluir')
    else { toast.success('Pagamento excluído!'); fetchData() }
  }

  // ─── render ────────────────────────────────────────────────────────────────
  // ─── aba ativa ──────────────────────────────────────────────────────────────
  const [aba, setAba] = useState<'agendados'|'realizados'>('agendados')

  // ─── filtros avulsos ─────────────────────────────────────────────────────────
  const [filtroNomeLanc, setFiltroNomeLanc]       = useState('')
  const [filtroDataIni, setFiltroDataIni]         = useState('')
  const [filtroDataFim, setFiltroDataFim]         = useState('')
  const [filtroMesLanc, setFiltroMesLanc]         = useState(new Date().toISOString().slice(0, 7))

  // ─── render ────────────────────────────────────────────────────────────────
  // Filtros lançamentos da folha
  const lancsAgendados  = lancsPendentes.filter(l => {
    const matchNome = filtroNomeLanc ? l.colaboradores?.nome?.toLowerCase().includes(filtroNomeLanc.toLowerCase()) : true
    const matchMes  = filtroMesLanc  ? l.mes_referencia === filtroMesLanc : true
    return l.status === 'liberado' && matchNome && matchMes
  })
  const lancsRealizados = lancsPendentes.filter(l => {
    const matchNome = filtroNomeLanc ? l.colaboradores?.nome?.toLowerCase().includes(filtroNomeLanc.toLowerCase()) : true
    const matchMes  = filtroMesLanc  ? l.mes_referencia === filtroMesLanc : true
    const matchDtIni = filtroDataIni ? (l.data_pagamento ?? '') >= filtroDataIni : true
    const matchDtFim = filtroDataFim ? (l.data_pagamento ?? '') <= filtroDataFim : true
    return l.status === 'pago' && matchNome && matchMes && matchDtIni && matchDtFim
  })

  const totalAgendado  = lancsAgendados.reduce((s: number, l: any) => s + (l.snap_liquido ?? l.valor_liquido ?? 0), 0)
  const totalRealizado = lancsRealizados.reduce((s: number, l: any) => s + (l.snap_liquido ?? l.valor_liquido ?? 0), 0)

  return (
    <div style={{ padding: 24 }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 20 }}>
        <div>
          <h1 style={{ fontWeight: 800, fontSize: 22, margin: 0 }}>💰 Pagamentos</h1>
          <p style={{ fontSize: 13, color: '#6b7280', marginTop: 4 }}>Lançamentos liberados da folha e pagamentos avulsos</p>
        </div>
        <button onClick={openCreate}
          style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 16px', fontWeight: 700, fontSize: 13, borderRadius: 8, border: 'none', background: '#7c3aed', color: '#fff', cursor: 'pointer' }}>
          <span style={{ fontSize: 16 }}>+</span> Pagamento Avulso
        </button>
      </div>

      {/* Cards resumo */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12, marginBottom: 20 }}>
        <div style={{ background: '#fef3c7', border: '1px solid #fde68a', borderRadius: 10, padding: '14px 18px' }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: '#92400e', marginBottom: 4 }}>💜 Agendados</div>
          <div style={{ fontWeight: 800, fontSize: 20, color: '#b45309' }}>
            {lancsPendentes.filter(l => l.status === 'liberado').length} lançamento(s)
          </div>
        </div>
        <div style={{ background: '#dcfce7', border: '1px solid #bbf7d0', borderRadius: 10, padding: '14px 18px' }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: '#14532d', marginBottom: 4 }}>✅ Realizados (mês)</div>
          <div style={{ fontWeight: 800, fontSize: 20, color: '#15803d' }}>
            {lancsPendentes.filter(l => l.status === 'pago' && l.mes_referencia === filtroMesLanc).length} lançamento(s)
          </div>
        </div>
        <div style={{ background: '#ede9fe', border: '1px solid #ddd6fe', borderRadius: 10, padding: '14px 18px' }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: '#4c1d95', marginBottom: 4 }}>💲 Avulsos</div>
          <div style={{ fontWeight: 800, fontSize: 20, color: '#7c3aed' }}>{rows.length} registro(s)</div>
        </div>
      </div>

      {/* Abas */}
      <div style={{ display: 'flex', gap: 0, marginBottom: 0, borderBottom: '2px solid #e5e7eb' }}>
        {([
          { key: 'agendados',  label: '⏳ Agendados', count: lancsPendentes.filter(l => l.status === 'liberado').length },
          { key: 'realizados', label: '✅ Realizados', count: lancsPendentes.filter(l => l.status === 'pago').length },
        ] as { key: 'agendados'|'realizados'; label: string; count: number }[]).map(tab => (
          <button key={tab.key} onClick={() => setAba(tab.key)}
            style={{
              padding: '10px 20px', fontSize: 13, fontWeight: aba === tab.key ? 700 : 500,
              border: 'none', background: 'transparent', cursor: 'pointer',
              borderBottom: aba === tab.key ? '3px solid #7c3aed' : '3px solid transparent',
              color: aba === tab.key ? '#7c3aed' : '#6b7280', marginBottom: -2,
            }}>
            {tab.label}
            <span style={{ marginLeft: 6, fontSize: 11, background: aba === tab.key ? '#ede9fe' : '#f3f4f6', color: aba === tab.key ? '#7c3aed' : '#6b7280', borderRadius: 10, padding: '1px 7px', fontWeight: 600 }}>
              {tab.count}
            </span>
          </button>
        ))}
      </div>

      {/* Filtros comuns */}
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', padding: '14px 0', alignItems: 'flex-end', borderBottom: '1px solid #f3f4f6', marginBottom: 16 }}>
        <div>
          <label style={{ fontSize: 11, color: '#6b7280', fontWeight: 600, display: 'block', marginBottom: 3 }}>Competência</label>
          <input type="month" value={filtroMesLanc} onChange={e => setFiltroMesLanc(e.target.value)}
            style={{ height: 32, padding: '0 10px', fontSize: 13, border: '1.5px solid #e5e7eb', borderRadius: 6, background: 'var(--background)', color: 'var(--foreground)' }} />
        </div>
        <div style={{ position: 'relative' }}>
          <label style={{ fontSize: 11, color: '#6b7280', fontWeight: 600, display: 'block', marginBottom: 3 }}>Colaborador</label>
          <input placeholder="Buscar nome..." value={filtroNomeLanc} onChange={e => setFiltroNomeLanc(e.target.value)}
            style={{ height: 32, padding: '0 10px', fontSize: 13, border: '1.5px solid #e5e7eb', borderRadius: 6, background: 'var(--background)', color: 'var(--foreground)', width: 200 }} />
        </div>
        {aba === 'realizados' && (
          <>
            <div>
              <label style={{ fontSize: 11, color: '#6b7280', fontWeight: 600, display: 'block', marginBottom: 3 }}>Data pgto de</label>
              <input type="date" value={filtroDataIni} onChange={e => setFiltroDataIni(e.target.value)}
                style={{ height: 32, padding: '0 10px', fontSize: 13, border: '1.5px solid #e5e7eb', borderRadius: 6, background: 'var(--background)', color: 'var(--foreground)' }} />
            </div>
            <div>
              <label style={{ fontSize: 11, color: '#6b7280', fontWeight: 600, display: 'block', marginBottom: 3 }}>até</label>
              <input type="date" value={filtroDataFim} onChange={e => setFiltroDataFim(e.target.value)}
                style={{ height: 32, padding: '0 10px', fontSize: 13, border: '1.5px solid #e5e7eb', borderRadius: 6, background: 'var(--background)', color: 'var(--foreground)' }} />
            </div>
          </>
        )}
        {(filtroNomeLanc || filtroDataIni || filtroDataFim) && (
          <button onClick={() => { setFiltroNomeLanc(''); setFiltroDataIni(''); setFiltroDataFim('') }}
            style={{ height: 32, padding: '0 12px', fontSize: 12, border: '1.5px solid #e5e7eb', borderRadius: 6, background: 'transparent', cursor: 'pointer', color: '#6b7280' }}>
            ✕ Limpar
          </button>
        )}
      </div>

      {/* ══ ABA AGENDADOS ══ */}
      {aba === 'agendados' && (
        loadingLancs ? (
          <div style={{ padding: 40, textAlign: 'center', color: '#9ca3af' }}>Carregando…</div>
        ) : lancsAgendados.length === 0 ? (
          <div style={{ padding: 60, textAlign: 'center', color: '#9ca3af', border: '1px dashed #e5e7eb', borderRadius: 12 }}>
            <div style={{ fontSize: 32, marginBottom: 8 }}>💜</div>
            <div style={{ fontWeight: 600 }}>Nenhum pagamento agendado</div>
            <div style={{ fontSize: 12, marginTop: 4 }}>Libere lançamentos no <strong>Fechamento</strong> para aparecerem aqui.</div>
          </div>
        ) : (
          <div style={{ border: '1px solid #e5e7eb', borderRadius: 10, overflow: 'hidden' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
              <thead>
                <tr style={{ background: '#fef3c7', borderBottom: '2px solid #fde68a' }}>
                  <th style={{ padding: '9px 14px', textAlign: 'left', fontWeight: 700, color: '#92400e' }}>Colaborador</th>
                  <th style={{ padding: '9px 14px', textAlign: 'left', fontWeight: 700, color: '#92400e' }}>Obra</th>
                  <th style={{ padding: '9px 14px', textAlign: 'center', fontWeight: 700, color: '#92400e' }}>Período</th>
                  <th style={{ padding: '9px 14px', textAlign: 'center', fontWeight: 700, color: '#92400e' }}>Competência</th>
                  <th style={{ padding: '9px 14px', textAlign: 'right', fontWeight: 700, color: '#92400e' }}>💵 Líquido</th>
                  <th style={{ padding: '9px 14px', textAlign: 'right', fontWeight: 700, color: '#92400e' }}>Ações</th>
                </tr>
              </thead>
              <tbody>
                {lancsAgendados.map((l: any, i: number) => (
                  <tr key={l.id} style={{ background: i % 2 === 0 ? '#fff' : '#fafafa', borderBottom: '1px solid #f3f4f6' }}>
                    <td style={{ padding: '10px 14px' }}>
                      <div style={{ fontWeight: 600, fontSize: 13 }}>{l.colaboradores?.nome ?? '—'}</div>
                      <div style={{ fontSize: 10, color: '#6b7280' }}>{l.colaboradores?.chapa} · {l.colaboradores?.tipo_contrato?.toUpperCase()}</div>
                    </td>
                    <td style={{ padding: '10px 14px', fontSize: 12, color: '#374151' }}>{l.obras?.nome ?? '—'}</td>
                    <td style={{ padding: '10px 14px', textAlign: 'center', fontSize: 11, color: '#374151' }}>
                      {l.data_inicio?.slice(8)}/{l.data_inicio?.slice(5,7)} → {l.data_fim?.slice(8)}/{l.data_fim?.slice(5,7)}
                    </td>
                    <td style={{ padding: '10px 14px', textAlign: 'center', fontSize: 11 }}>
                      <span style={{ background: '#ede9fe', color: '#7c3aed', borderRadius: 5, padding: '2px 8px', fontWeight: 600 }}>
                        {l.mes_referencia?.slice(5)}/{l.mes_referencia?.slice(0,4)}
                      </span>
                    </td>
                    <td style={{ padding: '10px 14px', textAlign: 'right', fontWeight: 700, fontSize: 13, color: '#15803d' }}>
                      {l.snap_liquido ? formatCurrency(l.snap_liquido) : '—'}
                    </td>
                    <td style={{ padding: '10px 14px', textAlign: 'right' }}>
                      <button
                        style={{ height: 28, padding: '0 12px', fontSize: 11, borderRadius: 6, border: 'none', background: '#7c3aed', color: '#fff', cursor: 'pointer', fontWeight: 600 }}
                        onClick={() => { setModalPagarLanc(l); setDataPagamento(new Date().toISOString().slice(0, 10)); setObsPagamento('') }}>
                        💰 Pagar
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr style={{ background: '#fef3c7', borderTop: '2px solid #fde68a', fontWeight: 700 }}>
                  <td colSpan={5} style={{ padding: '9px 14px', fontSize: 12 }}>Total agendado — {lancsAgendados.length} lançamento(s)</td>
                  <td style={{ padding: '9px 14px', textAlign: 'right', fontSize: 13, color: '#b45309' }}>{formatCurrency(totalAgendado)}</td>
                </tr>
              </tfoot>
            </table>
          </div>
        )
      )}

      {/* ══ ABA REALIZADOS ══ */}
      {aba === 'realizados' && (
        loadingLancs ? (
          <div style={{ padding: 40, textAlign: 'center', color: '#9ca3af' }}>Carregando…</div>
        ) : lancsRealizados.length === 0 ? (
          <div style={{ padding: 60, textAlign: 'center', color: '#9ca3af', border: '1px dashed #e5e7eb', borderRadius: 12 }}>
            <div style={{ fontSize: 32, marginBottom: 8 }}>✅</div>
            <div style={{ fontWeight: 600 }}>Nenhum pagamento realizado no período</div>
          </div>
        ) : (
          <div style={{ border: '1px solid #e5e7eb', borderRadius: 10, overflow: 'hidden' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
              <thead>
                <tr style={{ background: '#f0fdf4', borderBottom: '2px solid #bbf7d0' }}>
                  <th style={{ padding: '9px 14px', textAlign: 'left', fontWeight: 700, color: '#14532d' }}>Colaborador</th>
                  <th style={{ padding: '9px 14px', textAlign: 'left', fontWeight: 700, color: '#14532d' }}>Obra</th>
                  <th style={{ padding: '9px 14px', textAlign: 'center', fontWeight: 700, color: '#14532d' }}>Período</th>
                  <th style={{ padding: '9px 14px', textAlign: 'center', fontWeight: 700, color: '#14532d' }}>Data Pgto</th>
                  <th style={{ padding: '9px 14px', textAlign: 'left', fontWeight: 700, color: '#14532d' }}>Obs</th>
                  <th style={{ padding: '9px 14px', textAlign: 'right', fontWeight: 700, color: '#14532d' }}>💵 Líquido</th>
                  <th style={{ padding: '9px 14px', textAlign: 'right', fontWeight: 700, color: '#14532d' }}>Ações</th>
                </tr>
              </thead>
              <tbody>
                {lancsRealizados.map((l: any, i: number) => (
                  <tr key={l.id} style={{ background: i % 2 === 0 ? '#fff' : '#fafafa', borderBottom: '1px solid #f3f4f6' }}>
                    <td style={{ padding: '10px 14px' }}>
                      <div style={{ fontWeight: 600, fontSize: 13 }}>{l.colaboradores?.nome ?? '—'}</div>
                      <div style={{ fontSize: 10, color: '#6b7280' }}>{l.colaboradores?.chapa} · {l.colaboradores?.tipo_contrato?.toUpperCase()}</div>
                    </td>
                    <td style={{ padding: '10px 14px', fontSize: 12, color: '#374151' }}>{l.obras?.nome ?? '—'}</td>
                    <td style={{ padding: '10px 14px', textAlign: 'center', fontSize: 11, color: '#374151' }}>
                      {l.data_inicio?.slice(8)}/{l.data_inicio?.slice(5,7)} → {l.data_fim?.slice(8)}/{l.data_fim?.slice(5,7)}
                    </td>
                    <td style={{ padding: '10px 14px', textAlign: 'center' }}>
                      <span style={{ fontSize: 12, fontWeight: 700, color: '#15803d' }}>
                        {l.data_pagamento ? l.data_pagamento.slice(8)+'/'+l.data_pagamento.slice(5,7)+'/'+l.data_pagamento.slice(0,4) : '—'}
                      </span>
                    </td>
                    <td style={{ padding: '10px 14px', fontSize: 11, color: '#6b7280', maxWidth: 160 }}>
                      {l.obs_pagamento ?? '—'}
                    </td>
                    <td style={{ padding: '10px 14px', textAlign: 'right', fontWeight: 700, fontSize: 13, color: '#15803d' }}>
                      {l.snap_liquido ? formatCurrency(l.snap_liquido) : '—'}
                    </td>
                    <td style={{ padding: '10px 14px', textAlign: 'right' }}>
                      <button
                        style={{ height: 28, padding: '0 12px', fontSize: 11, borderRadius: 6, border: '1px solid #fecaca', background: 'transparent', color: '#dc2626', cursor: 'pointer', fontWeight: 600 }}
                        onClick={() => { setModalEstornar(l); setMotivoEstorno('') }}>
                        ↩ Estornar
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr style={{ background: '#f0fdf4', borderTop: '2px solid #bbf7d0', fontWeight: 700 }}>
                  <td colSpan={6} style={{ padding: '9px 14px', fontSize: 12 }}>Total realizado — {lancsRealizados.length} lançamento(s)</td>
                  <td style={{ padding: '9px 14px', textAlign: 'right', fontSize: 13, color: '#15803d' }}>{formatCurrency(totalRealizado)}</td>
                </tr>
              </tfoot>
            </table>
          </div>
        )
      )}

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
                {modalEstornar.obras?.nome} — pago em {(modalEstornar as any).data_pagamento ?? '—'}
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
    </div>
  )
}
