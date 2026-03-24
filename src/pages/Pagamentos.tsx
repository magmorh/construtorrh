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
      .select('id, colaborador_id, obra_id, mes_referencia, data_inicio, data_fim, status, motivo_recusa, data_pagamento, obs_pagamento, colaboradores(nome, chapa, tipo_contrato), obras(nome)')
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
  return (
    <div className="p-6">
      <PageHeader
        title="Folha de Pagamentos"
        subtitle="Gerenciamento de pagamentos dos colaboradores"
        action={
          <Button onClick={openCreate} size="sm">
            <Plus className="w-4 h-4 mr-1" /> Novo Pagamento
          </Button>
        }
      />

      {/* ══ SEÇÃO: Lançamentos Liberados p/ Pagamento ══ */}
      <div style={{ marginBottom: 28 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
          <span style={{ fontWeight: 700, fontSize: 14, color: '#b45309' }}>💜 Lançamentos Aguardando Pagamento</span>
          <span style={{ fontSize: 11, background: '#fef3c7', color: '#b45309', borderRadius: 6, padding: '2px 8px', fontWeight: 600 }}>
            {lancsPendentes.filter(l => l.status === 'liberado').length} pendente(s)
          </span>
        </div>

        {loadingLancs ? (
          <div style={{ fontSize: 13, color: '#6b7280' }}>Carregando…</div>
        ) : lancsPendentes.length === 0 ? (
          <div style={{ background: '#f9fafb', border: '1px dashed #d1d5db', borderRadius: 10, padding: '20px', textAlign: 'center', color: '#9ca3af', fontSize: 13 }}>
            Nenhum lançamento aguardando pagamento. Libere lançamentos no <strong>Fechamento</strong>.
          </div>
        ) : (
          <div style={{ border: '1px solid #e5e7eb', borderRadius: 10, overflow: 'hidden' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
              <thead>
                <tr style={{ background: '#fef3c7', borderBottom: '2px solid #fde68a' }}>
                  <th style={{ padding: '8px 12px', textAlign: 'left', fontWeight: 700, color: '#92400e' }}>Colaborador</th>
                  <th style={{ padding: '8px 12px', textAlign: 'left', fontWeight: 700, color: '#92400e' }}>Obra</th>
                  <th style={{ padding: '8px 12px', textAlign: 'center', fontWeight: 700, color: '#92400e' }}>Período</th>
                  <th style={{ padding: '8px 12px', textAlign: 'center', fontWeight: 700, color: '#92400e' }}>Status</th>
                  <th style={{ padding: '8px 12px', textAlign: 'center', fontWeight: 700, color: '#92400e' }}>Data Pgto</th>
                  <th style={{ padding: '8px 12px', textAlign: 'right', fontWeight: 700, color: '#92400e' }}>Ações</th>
                </tr>
              </thead>
              <tbody>
                {lancsPendentes.map((l, i) => {
                  const isPago = l.status === 'pago'
                  return (
                    <tr key={l.id} style={{ background: i % 2 === 0 ? '#fff' : '#fafafa', borderBottom: '1px solid #f3f4f6' }}>
                      <td style={{ padding: '8px 12px' }}>
                        <div style={{ fontWeight: 600, fontSize: 13 }}>{l.colaboradores?.nome ?? '—'}</div>
                        <div style={{ fontSize: 10, color: '#6b7280' }}>{l.colaboradores?.chapa} · {l.colaboradores?.tipo_contrato?.toUpperCase()}</div>
                      </td>
                      <td style={{ padding: '8px 12px', color: '#374151', fontSize: 12 }}>
                        {l.obras?.nome ?? '—'}
                      </td>
                      <td style={{ padding: '8px 12px', textAlign: 'center', color: '#374151', fontSize: 11 }}>
                        {l.data_inicio?.slice(8)}/{l.data_inicio?.slice(5,7)} → {l.data_fim?.slice(8)}/{l.data_fim?.slice(5,7)}
                      </td>
                      <td style={{ padding: '8px 12px', textAlign: 'center' }}>
                        <span style={{
                          fontSize: 11, fontWeight: 600, borderRadius: 6, padding: '2px 8px',
                          background: isPago ? '#ede9fe' : '#fef3c7',
                          color: isPago ? '#6d28d9' : '#b45309',
                        }}>
                          {isPago ? '💰 Pago' : '💜 Ag. Pagamento'}
                        </span>
                      </td>
                      <td style={{ padding: '8px 12px', textAlign: 'center', fontSize: 11, color: isPago ? '#15803d' : '#9ca3af' }}>
                        {(l as any).data_pagamento ?? '—'}
                      </td>
                      <td style={{ padding: '8px 12px', textAlign: 'right' }}>
                        <div style={{ display: 'flex', gap: 4, justifyContent: 'flex-end' }}>
                          {!isPago && (
                            <button
                              style={{ height: 26, padding: '0 10px', fontSize: 11, borderRadius: 6, border: 'none', background: '#7c3aed', color: '#fff', cursor: 'pointer', fontWeight: 600 }}
                              onClick={() => { setModalPagarLanc(l); setDataPagamento(new Date().toISOString().slice(0, 10)); setObsPagamento('') }}>
                              💰 Pagar
                            </button>
                          )}
                          {isPago && (
                            <button
                              style={{ height: 26, padding: '0 10px', fontSize: 11, borderRadius: 6, border: '1px solid #dc2626', background: 'transparent', color: '#dc2626', cursor: 'pointer', fontWeight: 600 }}
                              onClick={() => { setModalEstornar(l); setMotivoEstorno('') }}>
                              ↩ Estornar
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <hr style={{ borderColor: '#e5e7eb', marginBottom: 24 }} />

      {/* Filtros */}
      <div className="flex flex-wrap gap-3 mb-4">
        <div className="flex items-center gap-1.5">
          <Label className="text-xs text-muted-foreground">Competência</Label>
          <Input
            type="month"
            value={filtroCompetencia}
            onChange={(e) => setFiltroCompetencia(e.target.value)}
            className="h-8 w-40 text-sm"
          />
        </div>
        <div className="relative">
          <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
          <Input
            placeholder="Buscar colaborador..."
            value={filtroColaborador}
            onChange={(e) => setFiltroColaborador(e.target.value)}
            className="h-8 pl-7 w-48 text-sm"
          />
        </div>
        <Select value={filtroTipo} onValueChange={setFiltroTipo}>
          <SelectTrigger className="h-8 w-40 text-sm">
            <SelectValue placeholder="Tipo" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="todos">Todos os tipos</SelectItem>
            {TIPO_OPTIONS.map((t) => (
              <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={filtroStatus} onValueChange={setFiltroStatus}>
          <SelectTrigger className="h-8 w-40 text-sm">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="todos">Todos os status</SelectItem>
            {STATUS_OPTIONS.map((s) => (
              <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Tabela */}
      {loading ? (
        <LoadingSkeleton />
      ) : filtered.length === 0 ? (
        <EmptyState icon={<DollarSign className="w-8 h-8" />} title="Nenhum pagamento encontrado" />
      ) : (
        <div className="rounded-md border border-border overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/50">
                <TableHead>Colaborador</TableHead>
                <TableHead>Competência</TableHead>
                <TableHead>Tipo</TableHead>
                <TableHead className="text-right">Bruto</TableHead>
                <TableHead className="text-right">INSS</TableHead>
                <TableHead className="text-right">FGTS</TableHead>
                <TableHead className="text-right">IR</TableHead>
                <TableHead className="text-right">VT</TableHead>
                <TableHead className="text-right">Líquido</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((row) => (
                <TableRow key={row.id} className="hover:bg-muted/30">
                  <TableCell>
                    <div>
                      <p className="font-medium text-sm">{row.colaboradores?.nome ?? '—'}</p>
                      <p className="text-xs text-muted-foreground">{row.colaboradores?.chapa}</p>
                    </div>
                  </TableCell>
                  <TableCell className="text-sm">{row.competencia}</TableCell>
                  <TableCell className="text-sm capitalize">
                    {TIPO_OPTIONS.find((t) => t.value === row.tipo)?.label ?? row.tipo ?? '—'}
                  </TableCell>
                  <TableCell className="text-right text-sm">{formatCurrency(row.valor_bruto)}</TableCell>
                  <TableCell className="text-right text-sm">{formatCurrency(row.inss)}</TableCell>
                  <TableCell className="text-right text-sm">{formatCurrency(row.fgts)}</TableCell>
                  <TableCell className="text-right text-sm">{formatCurrency(row.ir)}</TableCell>
                  <TableCell className="text-right text-sm">{formatCurrency(row.vale_transporte)}</TableCell>
                  <TableCell className="text-right text-sm font-semibold">{formatCurrency(row.valor_liquido)}</TableCell>
                  <TableCell>
                    <BadgeStatus status={row.status} />
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex items-center justify-end gap-1">
                      {row.status === 'pendente' && (
                        <Button
                          size="icon"
                          variant="ghost"
                          className="h-7 w-7 text-emerald-600"
                          title="Marcar como pago"
                          onClick={() => marcarPago(row.id)}
                        >
                          <CheckCircle className="w-4 h-4" />
                        </Button>
                      )}
                      <Button
                        size="icon"
                        variant="ghost"
                        className="h-7 w-7"
                        onClick={() => openEdit(row)}
                      >
                        <Pencil className="w-3.5 h-3.5" />
                      </Button>
                      <Button
                        size="icon"
                        variant="ghost"
                        className="h-7 w-7 text-destructive"
                        onClick={() => setDeleteId(row.id)}
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
            <TableFooter>
              <TableRow className="bg-muted font-semibold text-sm">
                <TableCell colSpan={3}>Totais do período</TableCell>
                <TableCell className="text-right">{formatCurrency(totalBruto)}</TableCell>
                <TableCell className="text-right">{formatCurrency(totalInss)}</TableCell>
                <TableCell className="text-right">{formatCurrency(totalFgts)}</TableCell>
                <TableCell colSpan={2} />
                <TableCell className="text-right">{formatCurrency(totalLiquido)}</TableCell>
                <TableCell colSpan={2} />
              </TableRow>
            </TableFooter>
          </Table>
        </div>
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
              <input
                type="date"
                value={dataPagamento}
                onChange={e => setDataPagamento(e.target.value)}
                style={{ width: '100%', padding: '8px 10px', fontSize: 13, border: '2px solid #7c3aed', borderRadius: 6, background: 'var(--background)', color: 'var(--foreground)', boxSizing: 'border-box' }}
              />
            </div>
            <div style={{ marginBottom: 20 }}>
              <label style={{ fontSize: 12, fontWeight: 700, display: 'block', marginBottom: 6 }}>Observação (opcional)</label>
              <textarea
                value={obsPagamento}
                onChange={e => setObsPagamento(e.target.value)}
                placeholder="Ex.: Pago via Pix, transferência banco X…"
                rows={3}
                style={{ width: '100%', padding: '8px 10px', fontSize: 13, border: '1.5px solid #e5e7eb', borderRadius: 6, background: 'var(--background)', color: 'var(--foreground)', resize: 'vertical', fontFamily: 'inherit', boxSizing: 'border-box' }}
              />
            </div>
            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
              <button style={{ padding: '8px 16px', fontSize: 13, borderRadius: 6, border: '1.5px solid #e5e7eb', background: 'transparent', cursor: 'pointer', color: 'var(--foreground)' }}
                onClick={() => setModalPagarLanc(null)}>Cancelar</button>
              <button disabled={!dataPagamento || savingPgto}
                style={{ padding: '8px 18px', fontSize: 13, fontWeight: 700, borderRadius: 6, border: 'none', background: '#7c3aed', color: '#fff', cursor: 'pointer', opacity: (!dataPagamento || savingPgto) ? 0.5 : 1 }}
                onClick={efetivarPagamento}>
                {savingPgto ? 'Salvando…' : '💰 Confirmar Pagamento'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ══ MODAL ESTORNAR PAGAMENTO ══ */}
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
              <textarea
                value={motivoEstorno}
                onChange={e => setMotivoEstorno(e.target.value)}
                placeholder="Ex.: Pagamento duplicado, erro de valor…"
                rows={3}
                style={{ width: '100%', padding: '8px 10px', fontSize: 13, border: '2px solid #fecaca', borderRadius: 6, background: 'var(--background)', color: 'var(--foreground)', resize: 'vertical', fontFamily: 'inherit', boxSizing: 'border-box' }}
              />
            </div>
            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
              <button style={{ padding: '8px 16px', fontSize: 13, borderRadius: 6, border: '1.5px solid #e5e7eb', background: 'transparent', cursor: 'pointer', color: 'var(--foreground)' }}
                onClick={() => setModalEstornar(null)}>Cancelar</button>
              <button disabled={savingPgto}
                style={{ padding: '8px 18px', fontSize: 13, fontWeight: 700, borderRadius: 6, border: 'none', background: '#dc2626', color: '#fff', cursor: 'pointer', opacity: savingPgto ? 0.5 : 1 }}
                onClick={estornarPagamento}>
                {savingPgto ? 'Salvando…' : '↩ Confirmar Estorno'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal criar/editar */}
      <Dialog open={modalOpen} onOpenChange={setModalOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editando ? 'Editar Pagamento' : 'Novo Pagamento'}</DialogTitle>
          </DialogHeader>
          <div className="grid grid-cols-2 gap-4 py-2">
            {/* Colaborador */}
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

            {/* Obra */}
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

            {/* Competência */}
            <div>
              <Label>Competência *</Label>
              <Input
                type="month"
                value={form.competencia}
                onChange={(e) => setField('competencia', e.target.value)}
                className="mt-1"
              />
            </div>

            {/* Tipo */}
            <div>
              <Label>Tipo</Label>
              <Select value={form.tipo} onValueChange={(v) => setField('tipo', v)}>
                <SelectTrigger className="mt-1">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {TIPO_OPTIONS.map((t) => (
                    <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Data pagamento */}
            <div>
              <Label>Data Pagamento</Label>
              <Input
                type="date"
                value={form.data_pagamento}
                onChange={(e) => setField('data_pagamento', e.target.value)}
                className="mt-1"
              />
            </div>

            {/* Valor bruto */}
            <div>
              <Label>Valor Bruto</Label>
              <Input
                type="number"
                step="0.01"
                value={form.valor_bruto}
                onChange={(e) => setField('valor_bruto', e.target.value)}
                className="mt-1"
                placeholder="0,00"
              />
            </div>

            {/* INSS */}
            <div>
              <Label>INSS</Label>
              <Input
                type="number"
                step="0.01"
                value={form.inss}
                onChange={(e) => setField('inss', e.target.value)}
                className="mt-1"
                placeholder="0,00"
              />
            </div>

            {/* FGTS */}
            <div>
              <Label>FGTS</Label>
              <Input
                type="number"
                step="0.01"
                value={form.fgts}
                onChange={(e) => setField('fgts', e.target.value)}
                className="mt-1"
                placeholder="0,00"
              />
            </div>

            {/* IR */}
            <div>
              <Label>IR</Label>
              <Input
                type="number"
                step="0.01"
                value={form.ir}
                onChange={(e) => setField('ir', e.target.value)}
                className="mt-1"
                placeholder="0,00"
              />
            </div>

            {/* Vale transporte */}
            <div>
              <Label>Vale Transporte</Label>
              <Input
                type="number"
                step="0.01"
                value={form.vale_transporte}
                onChange={(e) => setField('vale_transporte', e.target.value)}
                className="mt-1"
                placeholder="0,00"
              />
            </div>

            {/* Adiantamento */}
            <div>
              <Label>Adiantamento</Label>
              <Input
                type="number"
                step="0.01"
                value={form.adiantamento}
                onChange={(e) => setField('adiantamento', e.target.value)}
                className="mt-1"
                placeholder="0,00"
              />
            </div>

            {/* Valor líquido (calculado) */}
            <div>
              <Label>Valor Líquido (calculado)</Label>
              <Input
                type="number"
                step="0.01"
                value={form.valor_liquido}
                onChange={(e) => setField('valor_liquido', e.target.value)}
                className="mt-1 bg-muted"
                placeholder="0,00"
              />
            </div>

            {/* Status */}
            <div>
              <Label>Status</Label>
              <Select value={form.status} onValueChange={(v) => setField('status', v)}>
                <SelectTrigger className="mt-1">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {STATUS_OPTIONS.map((s) => (
                    <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Observações */}
            <div className="col-span-2">
              <Label>Observações</Label>
              <Textarea
                value={form.observacoes}
                onChange={(e) => setField('observacoes', e.target.value)}
                className="mt-1"
                rows={2}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setModalOpen(false)}>Cancelar</Button>
            <Button onClick={handleSave} disabled={saving}>
              {saving ? 'Salvando…' : 'Salvar'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Confirmar exclusão */}
      <AlertDialog open={!!deleteId} onOpenChange={(o) => !o && setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir pagamento?</AlertDialogTitle>
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
