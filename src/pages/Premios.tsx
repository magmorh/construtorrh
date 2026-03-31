import React, { useEffect, useState, useCallback, useMemo } from 'react'
import { useRefreshOnFocus } from '@/hooks/useRefreshOnFocus'
import { supabase } from '@/lib/supabase'
import { formatCurrency } from '@/lib/utils'
import { SummaryCard } from '@/components/Shared'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table'
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { toast } from 'sonner'
import {
  Gift, Plus, Search, Pencil, Trash2, ChevronLeft, ChevronRight,
  RefreshCw, Building2, CheckCircle2, DollarSign, Clock, XCircle,
} from 'lucide-react'

// ─── tipos ───────────────────────────────────────────────────────────────────
type PremioRow = {
  id: string
  colaborador_id: string
  obra_id: string | null
  tipo: string | null
  descricao: string
  valor: number | null
  data: string
  competencia: string | null
  observacoes: string | null
  status: string
  pagamento_id: string | null
  colaboradores?: { nome: string; chapa: string }
  obras?: { nome: string } | null
}

type FormData = {
  colaborador_id: string
  obra_id: string
  tipo: string
  descricao: string
  valor: string
  data: string
  competencia: string
  observacoes: string
}

const TIPO_OPTIONS = [
  'Produtividade', 'Assiduidade', 'Segurança', 'Desempenho', 'Tempo de serviço', 'Outros',
]
const TIPO_EMOJI: Record<string, string> = {
  Produtividade: '⚡', Assiduidade: '📅', Segurança: '🦺',
  Desempenho: '🏆', 'Tempo de serviço': '⏱️', Outros: '🎁',
}

const STATUS_CFG: Record<string, { bg: string; border: string; color: string; label: string }> = {
  pendente:  { bg: '#fef3c7', border: '#fde68a', color: '#b45309', label: '⏳ Pendente'  },
  aprovado:  { bg: '#dcfce7', border: '#bbf7d0', color: '#15803d', label: '✅ Aprovado'  },
  pago:      { bg: '#eff6ff', border: '#bfdbfe', color: '#1d4ed8', label: '💳 Pago'      },
  cancelado: { bg: '#fee2e2', border: '#fecaca', color: '#dc2626', label: '❌ Cancelado' },
}

// ─── helpers ─────────────────────────────────────────────────────────────────
const MESES = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho',
               'Julho','Agosto','Setembro','Outubro','Novembro','Dezembro']

function mesLabel(ym: string) {
  if (!ym) return '—'
  const [y, m] = ym.split('-')
  return `${MESES[+m - 1]} / ${y}`
}
function prevMes(ym: string) {
  const [y, m] = ym.split('-').map(Number)
  const d = new Date(y, m - 2, 1)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}
function nextMes(ym: string) {
  const [y, m] = ym.split('-').map(Number)
  const d = new Date(y, m, 1)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}
function formatDate(d: string) {
  if (!d) return '—'
  const [y, m, day] = d.split('-')
  return `${day}/${m}/${y}`
}

const EMPTY_FORM: FormData = {
  colaborador_id: '', obra_id: '', tipo: '', descricao: '', valor: '',
  data: new Date().toISOString().slice(0, 10),
  competencia: new Date().toISOString().slice(0, 7),
  observacoes: '',
}

// ─── componente ──────────────────────────────────────────────────────────────
export default function Premios() {
  const [rows,          setRows]          = useState<PremioRow[]>([])
  const [colaboradores, setColaboradores] = useState<{ id: string; nome: string; chapa: string }[]>([])
  const [obras,         setObras]         = useState<{ id: string; nome: string }[]>([])
  const [loading,       setLoading]       = useState(true)

  const [competencia,        setCompetencia]        = useState(new Date().toISOString().slice(0, 7))
  const [filtroColaborador,  setFiltroColaborador]  = useState('')
  const [filtroTipo,         setFiltroTipo]         = useState('todos')
  const [abaStatus,          setAbaStatus]          = useState<'pendente'|'aprovado'|'pago'|'cancelado'>('pendente')

  const [modalOpen, setModalOpen] = useState(false)
  const [editando,  setEditando]  = useState<PremioRow | null>(null)
  const [form,      setForm]      = useState<FormData>(EMPTY_FORM)
  const [saving,    setSaving]    = useState(false)
  const [deleteId,  setDeleteId]  = useState<string | null>(null)
  const [aprovarRow,  setAprovarRow]  = useState<PremioRow | null>(null)
  const [cancelarRow, setCancelarRow] = useState<PremioRow | null>(null)

  // ─── fetch ─────────────────────────────────────────────────────────────────
  const fetchData = useCallback(async () => {
    setLoading(true)
    const [premRes, colRes, obrRes] = await Promise.all([
      supabase.from('premios')
        .select('*, colaboradores(nome,chapa)')
        .eq('competencia', competencia)
        .order('created_at', { ascending: false }),
      supabase.from('colaboradores').select('id,nome,chapa').eq('status','ativo').order('nome'),
      supabase.from('obras').select('id,nome').order('nome'),
    ])
    if (premRes.error) { toast.error('Erro ao carregar prêmios'); setLoading(false); return }
    if (colRes.data) setColaboradores(colRes.data)
    if (obrRes.data) setObras(obrRes.data)

    // ── Sincronizar status com pagamentos vinculados ──────────────────────
    const lista = (premRes.data as PremioRow[]) ?? []
    const comPagamento = lista.filter(r => r.pagamento_id && r.status !== 'pago')
    if (comPagamento.length > 0) {
      const ids = comPagamento.map(r => r.pagamento_id!)
      const { data: pgts } = await supabase
        .from('pagamentos').select('id,status').in('id', ids)
      const pagoIds = new Set((pgts ?? []).filter(p => p.status === 'pago').map(p => p.id))
      if (pagoIds.size > 0) {
        const toUpdate = comPagamento.filter(r => pagoIds.has(r.pagamento_id!))
        for (const r of toUpdate) {
          await supabase.from('premios').update({ status: 'pago' }).eq('id', r.id)
        }
        lista.forEach(r => {
          if (r.pagamento_id && pagoIds.has(r.pagamento_id)) r.status = 'pago'
        })
      }
    }

    setRows(lista)
    setLoading(false)
  }, [competencia])

  useEffect(() => { fetchData() }, [fetchData])
  useRefreshOnFocus(fetchData)

  // ─── contadores de abas ───────────────────────────────────────────────────
  const contAbas = useMemo(() => ({
    pendente:  rows.filter(r => (r.status ?? 'pendente') === 'pendente').length,
    aprovado:  rows.filter(r => r.status === 'aprovado').length,
    pago:      rows.filter(r => r.status === 'pago').length,
    cancelado: rows.filter(r => r.status === 'cancelado').length,
  }), [rows])

  // ─── filtros com aba ───────────────────────────────────────────────────────
  const filtered = useMemo(() => rows.filter(r => {
    const statusRow = r.status ?? 'pendente'
    const matchAba  = statusRow === abaStatus
    const matchCol  = filtroColaborador ? r.colaboradores?.nome.toLowerCase().includes(filtroColaborador.toLowerCase()) : true
    const matchTipo = filtroTipo !== 'todos' ? r.tipo === filtroTipo : true
    return matchAba && matchCol && matchTipo
  }), [rows, abaStatus, filtroColaborador, filtroTipo])

  const totalFiltrado = filtered.reduce((s, r) => s + (r.valor ?? 0), 0)

  // ─── cards resumo ──────────────────────────────────────────────────────────
  const totalPeriodo   = rows.reduce((s, r) => s + (r.valor ?? 0), 0)
  const totalPendente  = rows.filter(r => (r.status ?? 'pendente') === 'pendente').reduce((s, r) => s + (r.valor ?? 0), 0)
  const totalAprovado  = rows.filter(r => r.status === 'aprovado').reduce((s, r) => s + (r.valor ?? 0), 0)
  const totalPago      = rows.filter(r => r.status === 'pago').reduce((s, r) => s + (r.valor ?? 0), 0)

  // ─── modal helpers ─────────────────────────────────────────────────────────
  function setField(k: keyof FormData, v: string) { setForm(p => ({ ...p, [k]: v })) }

  function openCreate() {
    setEditando(null)
    setForm({ ...EMPTY_FORM, competencia })
    setModalOpen(true)
  }
  function openEdit(row: PremioRow) {
    if (row.status === 'pago') {
      toast.error('❌ Prêmio já pago — exclua o pagamento vinculado antes de editar.')
      return
    }
    setEditando(row)
    setForm({
      colaborador_id: row.colaborador_id,
      obra_id:        row.obra_id ?? '',
      tipo:           row.tipo ?? '',
      descricao:      row.descricao ?? '',
      valor:          String(row.valor ?? ''),
      data:           row.data ?? '',
      competencia:    row.competencia ?? '',
      observacoes:    row.observacoes ?? '',
    })
    setModalOpen(true)
  }

  // ─── save ──────────────────────────────────────────────────────────────────
  async function handleSave() {
    if (!form.colaborador_id) return toast.error('Colaborador obrigatório')
    if (!form.descricao.trim()) return toast.error('Descrição obrigatória')
    if (!form.valor) return toast.error('Valor obrigatório')
    if (!form.data) return toast.error('Data obrigatória')
    setSaving(true)
    const payload: Record<string,unknown> = {
      colaborador_id: form.colaborador_id,
      tipo:           form.tipo || null,
      descricao:      form.descricao,
      valor:          parseFloat(form.valor) || null,
      competencia:    form.competencia || null,
      observacoes:    form.observacoes || null,
      status:         editando?.status ?? 'pendente',
    }
    // obra_id e data só incluídos se a coluna existir no schema
    if (form.obra_id)  payload.obra_id = form.obra_id
    if (form.data)     payload.data    = form.data
    const { error } = editando
      ? await supabase.from('premios').update(payload).eq('id', editando.id)
      : await supabase.from('premios').insert({ ...payload, status: 'pendente' })
    setSaving(false)
    if (error) { toast.error('Erro ao salvar: ' + error.message); return }
    toast.success(editando ? '🏆 Prêmio atualizado!' : '🏆 Prêmio registrado!')
    setModalOpen(false); fetchData()
  }

  // ─── aprovar ───────────────────────────────────────────────────────────────
  async function confirmarAprovar() {
    if (!aprovarRow) return
    const { data: pag, error: errPag } = await supabase.from('pagamentos').insert({
      colaborador_id: aprovarRow.colaborador_id,
      obra_id:        aprovarRow.obra_id ?? null,
      competencia:    aprovarRow.competencia ?? competencia,
      tipo:           'premio',
      valor_bruto:    aprovarRow.valor ?? 0,
      valor_liquido:  aprovarRow.valor ?? 0,
      status:         'pendente',
      observacoes:    `Prêmio: ${aprovarRow.descricao}${aprovarRow.observacoes ? ' — ' + aprovarRow.observacoes : ''}`,
    }).select('id').single()
    if (errPag) { toast.error('Erro ao criar pagamento: ' + errPag.message); return }
    const { error } = await supabase.from('premios').update({
      status: 'aprovado', pagamento_id: pag.id,
    }).eq('id', aprovarRow.id)
    if (error) {
      await supabase.from('pagamentos').delete().eq('id', pag.id)
      toast.error('Erro ao aprovar: ' + error.message); return
    }
    toast.success('✅ Prêmio aprovado! Enviado para Pagamentos.')
    setAprovarRow(null); fetchData()
    setAbaStatus('aprovado')
  }

  // ─── cancelar ──────────────────────────────────────────────────────────────
  async function confirmarCancelar() {
    if (!cancelarRow) return
    if (cancelarRow.pagamento_id) {
      const { data: pag } = await supabase.from('pagamentos').select('status').eq('id', cancelarRow.pagamento_id).single()
      if (pag?.status === 'pago') { toast.error('❌ Pagamento já efetuado — exclua o pagamento antes de cancelar.'); setCancelarRow(null); return }
      await supabase.from('pagamentos').delete().eq('id', cancelarRow.pagamento_id)
    }
    await supabase.from('premios').update({ status: 'cancelado', pagamento_id: null }).eq('id', cancelarRow.id)
    toast.success('Cancelado.')
    setCancelarRow(null); fetchData()
    setAbaStatus('cancelado')
  }

  // ─── delete ────────────────────────────────────────────────────────────────
  async function handleDelete() {
    if (!deleteId) return
    const row = rows.find(r => r.id === deleteId)
    if (row?.pagamento_id) {
      const { data: pag } = await supabase.from('pagamentos').select('status').eq('id', row.pagamento_id).single()
      if (pag?.status === 'pago') { toast.error('Já foi pago — não pode excluir.'); setDeleteId(null); return }
      await supabase.from('pagamentos').delete().eq('id', row.pagamento_id)
    }
    const { error } = await supabase.from('premios').delete().eq('id', deleteId)
    setDeleteId(null)
    if (error) toast.error('Erro ao excluir')
    else { toast.success('Prêmio excluído!'); fetchData() }
  }

  // ─── render ────────────────────────────────────────────────────────────────
  return (
    <div className="page-root">

      {/* ── Header ── */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 20 }}>
        <div>
          <h1 style={{ fontWeight: 800, fontSize: 22, margin: 0, display: 'flex', alignItems: 'center', gap: 8 }}>
            <Gift size={22} style={{ color: '#f59e0b' }} /> Prêmios e Bonificações
          </h1>
          <p style={{ fontSize: 13, color: 'var(--muted-foreground)', marginTop: 4 }}>
            Registro e aprovação de prêmios por colaborador
          </p>
        </div>
        {/* Navegação mês */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <button onClick={() => setCompetencia(prevMes(competencia))}
            style={{ width: 32, height: 32, borderRadius: 8, border: '1.5px solid var(--border)', background: 'var(--background)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <ChevronLeft size={16} />
          </button>
          <span style={{ fontWeight: 700, fontSize: 15, minWidth: 130, textAlign: 'center' }}>{mesLabel(competencia)}</span>
          <button onClick={() => setCompetencia(nextMes(competencia))}
            style={{ width: 32, height: 32, borderRadius: 8, border: '1.5px solid var(--border)', background: 'var(--background)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <ChevronRight size={16} />
          </button>
        </div>
      </div>

      {/* ── Cards resumo ── */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        <SummaryCard
          sigla="PD" label="PENDENTES"
          value={formatCurrency(totalPendente)}
          sub={`${contAbas.pendente} prêmio(s)`}
          color="#b45309" bg="#b45309"
          onClick={() => setAbaStatus('pendente')}
        />
        <SummaryCard
          sigla="AP" label="APROVADOS"
          value={formatCurrency(totalAprovado)}
          sub={`${contAbas.aprovado} prêmio(s)`}
          color="#15803d" bg="#15803d"
          onClick={() => setAbaStatus('aprovado')}
        />
        <SummaryCard
          sigla="PG" label="PAGOS"
          value={formatCurrency(totalPago)}
          sub={`${contAbas.pago} prêmio(s)`}
          color="#1d4ed8" bg="#1d4ed8"
          onClick={() => setAbaStatus('pago')
          }
        />
        <SummaryCard
          sigla="TOT" label="TOTAL GERAL"
          value={formatCurrency(totalPeriodo)}
          sub={`${rows.length} prêmio(s)`}
          color="#f59e0b" bg="#f59e0b"
        />
      </div>

      {/* ── Filtros ── */}
      <div className="flex flex-wrap items-center gap-3 mb-4">
        <div className="relative flex-1 min-w-48">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input placeholder="Buscar colaborador…" value={filtroColaborador}
            onChange={e => setFiltroColaborador(e.target.value)} className="pl-8 h-9" />
        </div>
        <Select value={filtroTipo} onValueChange={setFiltroTipo}>
          <SelectTrigger className="w-44 h-9"><SelectValue placeholder="Todos os tipos" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="todos">Todos os tipos</SelectItem>
            {TIPO_OPTIONS.map(t => <SelectItem key={t} value={t}>{TIPO_EMOJI[t]} {t}</SelectItem>)}
          </SelectContent>
        </Select>
        {(filtroColaborador || filtroTipo !== 'todos') && (
          <button onClick={() => { setFiltroColaborador(''); setFiltroTipo('todos') }}
            style={{ height: 36, padding: '0 12px', fontSize: 12, border: '1.5px solid var(--border)', borderRadius: 6, background: 'transparent', cursor: 'pointer', color: 'var(--muted-foreground)' }}>
            ✕ Limpar
          </button>
        )}
        <button onClick={fetchData}
          style={{ width: 36, height: 36, borderRadius: 6, border: '1.5px solid var(--border)', background: 'var(--background)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <RefreshCw size={14} />
        </button>
        <Button onClick={openCreate} style={{ background: '#f59e0b', color: '#fff', gap: 6 }}>
          <Plus size={15} /> Novo Prêmio
        </Button>
      </div>

      {/* ── Abas de status ── */}
      <div style={{ display: 'flex', gap: 0, marginBottom: 20, borderBottom: '2px solid var(--border)', flexWrap: 'wrap' }}>
        {([
          { key: 'pendente'  as const, label: '⏳ Pendentes',  cor: '#b45309' },
          { key: 'aprovado'  as const, label: '✅ Aprovados',  cor: '#15803d' },
          { key: 'pago'      as const, label: '💳 Pagos',      cor: '#1d4ed8' },
          { key: 'cancelado' as const, label: '❌ Cancelados', cor: '#dc2626' },
        ]).map(ab => {
          const ativo = abaStatus === ab.key
          const cnt   = contAbas[ab.key]
          return (
            <button key={ab.key} onClick={() => setAbaStatus(ab.key)}
              style={{
                padding: '10px 18px', border: 'none',
                borderBottom: ativo ? `3px solid ${ab.cor}` : '3px solid transparent',
                background: ativo ? `${ab.cor}10` : 'transparent',
                color: ativo ? ab.cor : 'var(--muted-foreground)',
                fontWeight: ativo ? 700 : 500, fontSize: 13, cursor: 'pointer',
                display: 'flex', alignItems: 'center', gap: 6,
                transition: 'all 0.15s', marginBottom: -2,
              }}>
              {ab.label}
              {cnt > 0 && (
                <span style={{ background: ativo ? ab.cor : '#9ca3af', color: '#fff', borderRadius: 9, padding: '1px 7px', fontSize: 11, fontWeight: 700 }}>
                  {cnt}
                </span>
              )}
            </button>
          )
        })}
      </div>

      {/* ── Tabela ── */}
      {loading ? (
        <div style={{ padding: 40, textAlign: 'center', color: 'var(--muted-foreground)' }}>Carregando…</div>
      ) : filtered.length === 0 ? (
        <div style={{ padding: 60, textAlign: 'center', color: 'var(--muted-foreground)', border: '1px dashed var(--border)', borderRadius: 12 }}>
          <Gift size={36} style={{ opacity: .25, margin: '0 auto 12px', display: 'block' }} />
          <div style={{ fontWeight: 700, fontSize: 15 }}>
            Nenhum prêmio {STATUS_CFG[abaStatus]?.label.split(' ').slice(1).join(' ').toLowerCase()} em {mesLabel(competencia)}
          </div>
          <div style={{ fontSize: 12, marginTop: 4, opacity: .7 }}>
            {abaStatus === 'pendente' ? 'Clique em "+ Novo Prêmio" para registrar.' : 'Nenhum registro nesta aba.'}
          </div>
        </div>
      ) : (
        <div style={{ border: '1px solid var(--border)', borderRadius: 10, overflow: 'hidden' }}>
          <Table>
            <TableHeader>
              <TableRow style={{ background: 'rgba(0,0,0,0.03)' }}>
                <TableHead style={{ fontSize: 11 }}>Colaborador</TableHead>
                <TableHead style={{ fontSize: 11 }}>Tipo</TableHead>
                <TableHead style={{ fontSize: 11 }}>Descrição</TableHead>
                <TableHead style={{ fontSize: 11 }}>Obra</TableHead>
                <TableHead className="text-center" style={{ fontSize: 11 }}>Data</TableHead>
                <TableHead className="text-right" style={{ fontSize: 11, color: '#f59e0b', fontWeight: 700 }}>Valor</TableHead>
                <TableHead className="text-right" style={{ fontSize: 11 }}>Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map(row => {
                const statusRow = row.status ?? 'pendente'
                const badge = STATUS_CFG[statusRow] ?? STATUS_CFG.pendente
                return (
                  <TableRow key={row.id}>
                    <TableCell>
                      <div style={{ fontWeight: 700, fontSize: 13 }}>{row.colaboradores?.nome ?? '—'}</div>
                      <div style={{ fontSize: 11, color: 'var(--muted-foreground)', fontFamily: 'monospace' }}>
                        {row.colaboradores?.chapa}
                      </div>
                    </TableCell>
                    <TableCell>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                        <span style={{ fontSize: 11, fontWeight: 700, padding: '3px 9px', borderRadius: 6,
                          background: '#fef3c7', color: '#b45309', border: '1px solid #fde68a' }}>
                          {TIPO_EMOJI[row.tipo ?? ''] ?? '🎁'} {row.tipo ?? '—'}
                        </span>
                        {/* Forma de quitação — só na aba Pagos */}
                        {statusRow === 'pago' && (
                          <span style={{ fontSize: 9, fontWeight: 700, padding: '2px 6px', borderRadius: 4,
                            background: row.pagamento_id ? '#eff6ff' : '#f0fdf4',
                            color:      row.pagamento_id ? '#1d4ed8' : '#15803d',
                            border:     `1px solid ${row.pagamento_id ? '#bfdbfe' : '#bbf7d0'}`,
                            alignSelf: 'flex-start' }}>
                            {row.pagamento_id ? '💜 Via pagamento' : '✅ Via fechamento'}
                          </span>
                        )}
                      </div>
                    </TableCell>
                    <TableCell style={{ color: 'var(--muted-foreground)', fontSize: 12, maxWidth: 200 }}>
                      <span style={{ display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={row.descricao}>
                        {row.descricao || <span style={{ opacity: .4 }}>—</span>}
                      </span>
                    </TableCell>
                    <TableCell style={{ color: 'var(--muted-foreground)', fontSize: 12 }}>
                      <span style={{ opacity: .4 }}>—</span>
                    </TableCell>
                    <TableCell className="text-center" style={{ color: 'var(--muted-foreground)', fontSize: 12 }}>
                      {formatDate(row.data)}
                    </TableCell>
                    <TableCell className="text-right">
                      <span style={{ fontWeight: 800, fontSize: 14, color: '#f59e0b' }}>
                        {formatCurrency(row.valor ?? 0)}
                      </span>
                    </TableCell>
                    <TableCell className="text-right">
                      <div style={{ display: 'flex', gap: 4, justifyContent: 'flex-end' }}>
                        {/* Aba pendente: aprovar + editar + excluir */}
                        {statusRow === 'pendente' && (
                          <button onClick={() => setAprovarRow(row)} title="Aprovar"
                            style={{ height: 28, padding: '0 10px', borderRadius: 6, border: '1px solid #bbf7d0', background: '#f0fdf4', color: '#15803d', cursor: 'pointer', fontSize: 11, fontWeight: 700, display: 'flex', alignItems: 'center', gap: 4 }}>
                            <CheckCircle2 size={12} /> Aprovar
                          </button>
                        )}
                        {/* Editar: pendente ou aprovado, nunca pago */}
                        {(statusRow === 'pendente' || statusRow === 'aprovado') && (
                          <button onClick={() => openEdit(row)} title="Editar"
                            style={{ width: 28, height: 28, borderRadius: 6, border: '1px solid var(--border)', background: 'var(--muted)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                            <Pencil size={12} />
                          </button>
                        )}
                        {/* Cancelar: aprovado mas não pago */}
                        {statusRow === 'aprovado' && (
                          <button onClick={() => setCancelarRow(row)} title="Cancelar"
                            style={{ height: 28, padding: '0 10px', borderRadius: 6, border: '1px solid #fecaca', background: '#fff5f5', color: '#dc2626', cursor: 'pointer', fontSize: 11, fontWeight: 700, display: 'flex', alignItems: 'center', gap: 4 }}>
                            <XCircle size={12} /> Cancelar
                          </button>
                        )}
                        {/* Pago: cadeado */}
                        {statusRow === 'pago' && (
                          <span title="Pago — exclua o pagamento para editar"
                            style={{ width: 28, height: 28, borderRadius: 6, background: '#eff6ff', border: '1px solid #bfdbfe', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'help' }}>
                            🔒
                          </span>
                        )}
                        {(statusRow === 'pendente' || statusRow === 'cancelado') && (
                          <button onClick={() => setDeleteId(row.id)} title="Excluir"
                            style={{ width: 28, height: 28, borderRadius: 6, border: '1px solid #fecaca', background: '#fff5f5', color: '#dc2626', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                            <Trash2 size={12} />
                          </button>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                )
              })}
            </TableBody>
          </Table>
          {/* Rodapé total */}
          <div style={{ background: 'var(--muted)', borderTop: '2px solid var(--border)', padding: '10px 16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: 12, color: 'var(--muted-foreground)' }}>
              {filtered.length} prêmio(s) · aba: {STATUS_CFG[abaStatus]?.label}
            </span>
            <span style={{ fontWeight: 800, fontSize: 15, color: '#f59e0b' }}>
              Total: {formatCurrency(totalFiltrado)}
            </span>
          </div>
        </div>
      )}

      {/* ══ MODAL CRIAR / EDITAR ══ */}
      {modalOpen && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.5)', zIndex: 50, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
          <div style={{ background: 'var(--background)', borderRadius: 14, padding: 0, width: '100%', maxWidth: 520, boxShadow: '0 25px 50px rgba(0,0,0,.25)', overflow: 'hidden', maxHeight: '90vh', overflowY: 'auto' }}>
            {/* Header modal */}
            <div style={{ background: 'linear-gradient(135deg, #f59e0b, #d97706)', padding: '20px 24px', position: 'sticky', top: 0, zIndex: 1 }}>
              <h2 style={{ fontWeight: 800, fontSize: 17, margin: 0, color: '#fff' }}>
                {editando ? '✏️ Editar Prêmio' : '🏆 Novo Prêmio'}
              </h2>
              <p style={{ fontSize: 12, color: 'rgba(255,255,255,.8)', margin: '4px 0 0' }}>
                {editando ? 'Altere os dados do prêmio' : 'Registre um novo prêmio ou bonificação'}
              </p>
            </div>
            <div style={{ padding: 24 }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
                <div style={{ gridColumn: '1/-1' }}>
                  <Label className="mb-1 block">Colaborador *</Label>
                  <Select value={form.colaborador_id} onValueChange={v => setField('colaborador_id', v)}>
                    <SelectTrigger><SelectValue placeholder="Selecionar…" /></SelectTrigger>
                    <SelectContent>
                      {colaboradores.map(c => <SelectItem key={c.id} value={c.id}>{c.chapa} — {c.nome}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label className="mb-1 block">Tipo</Label>
                  <Select value={form.tipo || 'nenhum'} onValueChange={v => setField('tipo', v === 'nenhum' ? '' : v)}>
                    <SelectTrigger><SelectValue placeholder="Selecionar tipo" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="nenhum">Sem tipo</SelectItem>
                      {TIPO_OPTIONS.map(t => <SelectItem key={t} value={t}>{TIPO_EMOJI[t]} {t}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label className="mb-1 block">Valor (R$) *</Label>
                  <Input type="number" step="0.01" value={form.valor}
                    onChange={e => setField('valor', e.target.value)} placeholder="0,00" />
                </div>
                <div style={{ gridColumn: '1/-1' }}>
                  <Label className="mb-1 block">Descrição *</Label>
                  <Input value={form.descricao} onChange={e => setField('descricao', e.target.value)} placeholder="Descreva o prêmio…" />
                </div>
                <div>
                  <Label className="mb-1 block">Data *</Label>
                  <input type="date" value={form.data} onChange={e => setField('data', e.target.value)}
                    style={{ height: 36, width: '100%', padding: '0 10px', fontSize: 13, border: '1.5px solid var(--border)', borderRadius: 6, background: 'var(--background)', color: 'var(--foreground)', boxSizing: 'border-box' }} />
                </div>
                <div>
                  <Label className="mb-1 block">Competência</Label>
                  <input type="month" value={form.competencia} onChange={e => setField('competencia', e.target.value)}
                    style={{ height: 36, width: '100%', padding: '0 10px', fontSize: 13, border: '1.5px solid var(--border)', borderRadius: 6, background: 'var(--background)', color: 'var(--foreground)', boxSizing: 'border-box' }} />
                </div>
                <div>
                  <Label className="mb-1 block">Obra</Label>
                  <Select value={form.obra_id || 'nenhuma'} onValueChange={v => setField('obra_id', v === 'nenhuma' ? '' : v)}>
                    <SelectTrigger><SelectValue placeholder="Sem obra" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="nenhuma">Sem obra</SelectItem>
                      {obras.map(o => <SelectItem key={o.id} value={o.id}>{o.nome}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div style={{ gridColumn: '1/-1' }}>
                  <Label className="mb-1 block">Observações</Label>
                  <Textarea value={form.observacoes} onChange={e => setField('observacoes', e.target.value)} rows={2} placeholder="Observações…" />
                </div>
              </div>

              <div style={{ background: '#fffbeb', border: '1px solid #fde68a', borderRadius: 8, padding: '10px 14px', fontSize: 12, color: '#92400e', marginTop: 14 }}>
                💡 Após registrar, clique em <strong>Aprovar</strong> para enviar à tela de <strong>Pagamentos</strong>.
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 18 }}>
                <Button variant="outline" onClick={() => setModalOpen(false)}>Cancelar</Button>
                <Button disabled={saving} onClick={handleSave} style={{ background: '#f59e0b', color: '#fff' }}>
                  {saving ? 'Salvando…' : editando ? '💾 Salvar' : '🏆 Registrar'}
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ══ CONFIRMAR APROVAR ══ */}
      <AlertDialog open={!!aprovarRow} onOpenChange={o => { if (!o) setAprovarRow(null) }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>✅ Aprovar prêmio?</AlertDialogTitle>
            <AlertDialogDescription>
              <strong>{aprovarRow?.colaboradores?.nome}</strong> — {formatCurrency(aprovarRow?.valor ?? 0)}<br />
              Prêmio: <em>{aprovarRow?.descricao}</em><br />
              O prêmio será enviado para <strong>Pagamentos</strong> como pendente de pagamento.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Voltar</AlertDialogCancel>
            <AlertDialogAction onClick={confirmarAprovar} style={{ background: '#15803d', color: '#fff' }}>
              ✅ Confirmar Aprovação
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* ══ CONFIRMAR CANCELAR ══ */}
      <AlertDialog open={!!cancelarRow} onOpenChange={o => { if (!o) setCancelarRow(null) }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>❌ Cancelar prêmio?</AlertDialogTitle>
            <AlertDialogDescription>
              O prêmio de <strong>{cancelarRow?.colaboradores?.nome}</strong> ({formatCurrency(cancelarRow?.valor ?? 0)}) será cancelado e removido da fila de Pagamentos.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Voltar</AlertDialogCancel>
            <AlertDialogAction onClick={confirmarCancelar} style={{ background: '#dc2626', color: '#fff' }}>
              ❌ Confirmar Cancelamento
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* ══ CONFIRMAR EXCLUIR ══ */}
      <AlertDialog open={!!deleteId} onOpenChange={o => { if (!o) setDeleteId(null) }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>🗑️ Excluir prêmio?</AlertDialogTitle>
            <AlertDialogDescription>Esta ação não pode ser desfeita.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} style={{ background: '#dc2626', color: '#fff' }}>Excluir</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

    </div>
  )
}
