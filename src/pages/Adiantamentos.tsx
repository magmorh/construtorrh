import React, { useEffect, useState, useCallback, useMemo } from 'react'
import { useRefreshOnFocus } from '@/hooks/useRefreshOnFocus'
import { supabase } from '@/lib/supabase'
import { formatCurrency } from '@/lib/utils'
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
  DollarSign, Plus, Search, Pencil, Trash2, ChevronLeft, ChevronRight,
  CheckCircle2, XCircle, Clock, RefreshCw, Building2, Users, CalendarDays, Repeat,
  AlertTriangle, Info,
} from 'lucide-react'

// ─── tipos ───────────────────────────────────────────────────────────────────
type AdiantRow = {
  id: string
  colaborador_id: string
  obra_id: string | null
  competencia: string
  valor: number
  status: 'pendente' | 'aprovado' | 'cancelado' | 'pago'
  tipo: string
  observacoes: string | null
  pagamento_id: string | null
  // parcelamento
  desconto_tipo: 'unico' | 'parcelado' | null  // único ou parcelado
  desconto_parcelas: number | null             // total de parcelas
  desconto_parcela_atual: number | null        // qual parcela já descontada
  desconto_a_partir: string | null             // 'YYYY-MM' — a partir de quando descontar
  desconto_obs: string | null                  // obs sobre o desconto
  requisicao_url: string | null
  colaboradores?: { nome: string; chapa: string }
}

type FormData = {
  colaborador_id: string
  obra_id: string
  competencia: string
  valor: string
  tipo: string
  observacoes: string
  // parcelamento
  desconto_tipo: 'unico' | 'parcelado'
  desconto_parcelas: string   // número de parcelas (só se parcelado)
  desconto_a_partir: string   // 'YYYY-MM'
  desconto_obs: string
}

const TIPOS = [
  { value: 'adiantamento', label: '💵 Adiantamento Salarial' },
  { value: 'vale',         label: '🎫 Vale' },
  { value: 'ajuda_custo',  label: '🚗 Ajuda de Custo' },
  { value: 'outro',        label: '📋 Outro' },
]
const TIPO_LABEL: Record<string, string> = {
  adiantamento: '💵 Adiantamento Salarial',
  vale:         '🎫 Vale',
  ajuda_custo:  '🚗 Ajuda de Custo',
  outro:        '📋 Outro',
}

const STATUS_CFG: Record<string, { bg: string; color: string; label: string; border: string }> = {
  pendente:  { bg: '#fef3c7', border: '#fde68a', color: '#b45309', label: '⏳ Pendente'  },
  aprovado:  { bg: '#dcfce7', border: '#bbf7d0', color: '#15803d', label: '✅ Aprovado'  },
  cancelado: { bg: '#fee2e2', border: '#fecaca', color: '#dc2626', label: '❌ Cancelado' },
  pago:      { bg: '#eff6ff', border: '#bfdbfe', color: '#1d4ed8', label: '💳 Pago'      },
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

const EMPTY: FormData = {
  colaborador_id: '',
  obra_id: '',
  competencia: new Date().toISOString().slice(0, 7),
  valor: '',
  tipo: 'adiantamento',
  observacoes: '',
  desconto_tipo: 'unico',
  desconto_parcelas: '1',
  desconto_a_partir: new Date().toISOString().slice(0, 7),
  desconto_obs: '',
}

// ─── componente ──────────────────────────────────────────────────────────────
export default function Adiantamentos() {
  const [rows,    setRows]    = useState<AdiantRow[]>([])
  const [colabs,  setColabs]  = useState<{ id: string; nome: string; chapa: string }[]>([])
  const [obras,   setObras]   = useState<{ id: string; nome: string }[]>([])
  const [loading, setLoading] = useState(true)

  const [competencia,   setCompetencia]   = useState(new Date().toISOString().slice(0, 7))
  const [filtroNome,    setFiltroNome]    = useState('')
  const [filtroTipo,    setFiltroTipo]    = useState('todos')
  const [abaStatus,     setAbaStatus]     = useState<'pendente'|'aprovado'|'pago'|'cancelado'>('pendente')

  // modal
  const [modalOpen, setModalOpen] = useState(false)
  const [editando,  setEditando]  = useState<AdiantRow | null>(null)
  const [form,      setForm]      = useState<FormData>(EMPTY)
  const [saving,    setSaving]    = useState(false)
  const [arquivoRequisicao, setArquivoRequisicao] = useState<File | null>(null)

  // confirmações
  const [deleteId,    setDeleteId]    = useState<string | null>(null)
  const [aprovarRow,  setAprovarRow]  = useState<AdiantRow | null>(null)
  const [cancelarRow, setCancelarRow] = useState<AdiantRow | null>(null)

  // ─── fetch ────────────────────────────────────────────────────────────────
  const fetchData = useCallback(async () => {
    setLoading(true)
    const [{ data: aData }, { data: cData }, { data: oData }] = await Promise.all([
      supabase.from('adiantamentos')
        .select('*, requisicao_url, colaboradores(nome,chapa)')
        .eq('competencia', competencia)
        .order('created_at', { ascending: false }),
      supabase.from('colaboradores').select('id,nome,chapa').eq('status','ativo').order('nome'),
      supabase.from('obras').select('id,nome').order('nome'),
    ])

    // ── Sincronizar status com pagamentos vinculados ──────────────────────
    // Se o pagamento_id existe e está 'pago', marca o adiantamento como 'pago'
    const lista = (aData ?? []) as AdiantRow[]
    const comPagamento = lista.filter(r => r.pagamento_id && r.status !== 'pago')
    if (comPagamento.length > 0) {
      const ids = comPagamento.map(r => r.pagamento_id!)
      const { data: pgts } = await supabase
        .from('pagamentos').select('id,status').in('id', ids)
      const pagoIds = new Set((pgts ?? []).filter(p => p.status === 'pago').map(p => p.id))
      if (pagoIds.size > 0) {
        // Atualizar no banco e na lista local
        const adiToUpdate = comPagamento.filter(r => pagoIds.has(r.pagamento_id!))
        for (const r of adiToUpdate) {
          await supabase.from('adiantamentos').update({ status: 'pago' }).eq('id', r.id)
        }
        // Reflete localmente sem novo fetch
        lista.forEach(r => {
          if (r.pagamento_id && pagoIds.has(r.pagamento_id)) r.status = 'pago'
        })
      }
    }

    setRows(lista)
    setColabs(cData ?? [])
    setObras(oData ?? [])
    setLoading(false)
  }, [competencia])

  useEffect(() => { fetchData() }, [fetchData])
  useRefreshOnFocus(fetchData)

  // ─── contadores de abas ───────────────────────────────────────────────────
  const contAbas = useMemo(() => ({
    pendente:  rows.filter(r => r.status === 'pendente').length,
    aprovado:  rows.filter(r => r.status === 'aprovado').length,
    pago:      rows.filter(r => r.status === 'pago').length,
    cancelado: rows.filter(r => r.status === 'cancelado').length,
  }), [rows])

  // ─── filtro com aba ───────────────────────────────────────────────────────
  const filtered = useMemo(() => rows.filter(r => {
    const matchAba    = r.status === abaStatus
    const matchNome   = filtroNome ? r.colaboradores?.nome.toLowerCase().includes(filtroNome.toLowerCase()) : true
    const matchTipo   = filtroTipo !== 'todos' ? r.tipo === filtroTipo : true
    return matchAba && matchNome && matchTipo
  }), [rows, abaStatus, filtroNome, filtroTipo])

  // ─── cards resumo (totais globais do mês) ─────────────────────────────────
  const totalPend  = rows.filter(r => r.status === 'pendente').reduce((s, r) => s + r.valor, 0)
  const totalAprov = rows.filter(r => r.status === 'aprovado').reduce((s, r) => s + r.valor, 0)
  const totalPago  = rows.filter(r => r.status === 'pago').reduce((s, r) => s + r.valor, 0)
  const totalGeral = rows.reduce((s, r) => s + r.valor, 0)

  // ─── modal helpers ────────────────────────────────────────────────────────
  function setF(k: keyof FormData, v: string) { setForm(p => ({ ...p, [k]: v })) }

  function openCreate() {
    setEditando(null)
    setForm({ ...EMPTY, competencia })
    setArquivoRequisicao(null)
    setModalOpen(true)
  }
  function openEdit(r: AdiantRow) {
    if (r.status === 'pago') {
      toast.error('Pagamento já efetuado — exclua o pagamento antes de editar.')
      return
    }
    if (!['pendente', 'aprovado'].includes(r.status)) {
      toast.error('Só é possível editar adiantamentos pendentes ou aprovados.')
      return
    }
    setEditando(r)
    setForm({
      colaborador_id: r.colaborador_id,
      obra_id:        r.obra_id ?? '',
      competencia:    r.competencia,
      valor:          String(r.valor),
      tipo:           r.tipo,
      observacoes:    r.observacoes ?? '',
      desconto_tipo:  r.desconto_tipo ?? 'unico',
      desconto_parcelas: String(r.desconto_parcelas ?? 1),
      desconto_a_partir: r.desconto_a_partir ?? r.competencia ?? new Date().toISOString().slice(0, 7),
      desconto_obs:   r.desconto_obs ?? '',
    })
    setModalOpen(true)
  }

  // ─── save ─────────────────────────────────────────────────────────────────
  async function handleSave() {
    if (!form.colaborador_id) return toast.error('Colaborador obrigatório')
    if (!form.valor || +form.valor <= 0) return toast.error('Valor deve ser maior que zero')
    if (!editando && !arquivoRequisicao) return toast.error('Anexe a requisição assinada')
    setSaving(true)
    const payload: any = {
      colaborador_id:        form.colaborador_id,
      competencia:           form.competencia,
      valor:                 parseFloat(form.valor),
      tipo:                  form.tipo,
      observacoes:           form.observacoes || null,
      status:                'pendente',
      desconto_tipo:         form.desconto_tipo,
      desconto_parcelas:     form.desconto_tipo === 'parcelado' ? parseInt(form.desconto_parcelas) || 1 : 1,
      desconto_parcela_atual: 0,
      desconto_a_partir:     form.desconto_a_partir || form.competencia,
      desconto_obs:          form.desconto_obs || null,
    }
    if (form.obra_id) payload.obra_id = form.obra_id

    // Upload da requisição assinada (somente criação)
    if (!editando && arquivoRequisicao) {
      const filePath = `adiantamentos/${form.colaborador_id}/${Date.now()}_${arquivoRequisicao.name}`
      const { error: upErr } = await supabase.storage.from('documentos').upload(filePath, arquivoRequisicao)
      if (upErr) { setSaving(false); toast.error('Erro no upload: ' + upErr.message); return }
      const { data: urlData } = supabase.storage.from('documentos').getPublicUrl(filePath)
      payload.requisicao_url = urlData.publicUrl
    }

    const { error } = editando
      ? await supabase.from('adiantamentos').update(payload).eq('id', editando.id)
      : await supabase.from('adiantamentos').insert(payload)
    setSaving(false)
    if (error) { toast.error('Erro: ' + error.message); return }
    toast.success(editando ? 'Atualizado!' : 'Registrado! Aguardando aprovação.')
    setArquivoRequisicao(null)
    setModalOpen(false)
    fetchData()
  }

  // ─── aprovar ──────────────────────────────────────────────────────────────
  async function confirmarAprovar() {
    if (!aprovarRow) return
    const { data: pag, error: errPag } = await supabase.from('pagamentos').insert({
      colaborador_id: aprovarRow.colaborador_id,
      obra_id:        aprovarRow.obra_id ?? null,
      competencia:    aprovarRow.competencia,
      tipo:           'adiantamento',
      valor_bruto:    aprovarRow.valor,
      valor_liquido:  aprovarRow.valor,
      status:         'pendente',
      observacoes:    `${TIPO_LABEL[aprovarRow.tipo] ?? aprovarRow.tipo}${aprovarRow.observacoes ? ' — ' + aprovarRow.observacoes : ''}`,
    }).select('id').single()
    if (errPag) { toast.error('Erro ao criar pagamento: ' + errPag.message); return }
    const { error: errAdiant } = await supabase.from('adiantamentos').update({
      status: 'aprovado', pagamento_id: pag.id,
    }).eq('id', aprovarRow.id)
    if (errAdiant) {
      await supabase.from('pagamentos').delete().eq('id', pag.id)
      toast.error('Erro ao aprovar: ' + errAdiant.message); return
    }
    toast.success('✅ Aprovado! Enviado para Pagamentos.')
    setAprovarRow(null); fetchData()
    setAbaStatus('aprovado')
  }

  // ─── cancelar ─────────────────────────────────────────────────────────────
  async function confirmarCancelar() {
    if (!cancelarRow) return
    if (cancelarRow.status === 'pago') {
      toast.error('❌ Já foi pago — exclua o pagamento vinculado para liberar a edição.')
      setCancelarRow(null); return
    }
    if (cancelarRow.pagamento_id) {
      const { data: pag } = await supabase.from('pagamentos').select('status').eq('id', cancelarRow.pagamento_id).single()
      if (pag?.status === 'pago') {
        toast.error('❌ Pagamento já efetuado — exclua o pagamento antes de cancelar.')
        setCancelarRow(null); return
      }
      await supabase.from('pagamentos').delete().eq('id', cancelarRow.pagamento_id)
    }
    await supabase.from('adiantamentos').update({ status: 'cancelado', pagamento_id: null }).eq('id', cancelarRow.id)
    toast.success('Cancelado.')
    setCancelarRow(null); fetchData()
    setAbaStatus('cancelado')
  }

  // ─── delete ───────────────────────────────────────────────────────────────
  async function handleDelete() {
    if (!deleteId) return
    const row = rows.find(r => r.id === deleteId)
    if (row?.pagamento_id) {
      const { data: pag } = await supabase.from('pagamentos').select('status').eq('id', row.pagamento_id).single()
      if (pag?.status === 'pago') { toast.error('Já foi pago — não pode excluir.'); setDeleteId(null); return }
      await supabase.from('pagamentos').delete().eq('id', row.pagamento_id)
    }
    const { error } = await supabase.from('adiantamentos').delete().eq('id', deleteId)
    setDeleteId(null)
    if (error) toast.error('Erro ao excluir')
    else { toast.success('Excluído!'); fetchData() }
  }

  // ─── render ───────────────────────────────────────────────────────────────
  return (
    <div className="p-6">

      {/* ── Header ── */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 20 }}>
        <div>
          <h1 style={{ fontWeight: 800, fontSize: 22, margin: 0, display: 'flex', alignItems: 'center', gap: 8 }}>
            <DollarSign size={22} style={{ color: '#7c3aed' }} /> Adiantamentos
          </h1>
          <p style={{ fontSize: 13, color: 'var(--muted-foreground)', marginTop: 4 }}>
            Controle de adiantamentos e vales por colaborador
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
        {[
          { icon: <Clock size={16} />,        label: 'Pendentes',  value: formatCurrency(totalPend),  sub: `${contAbas.pendente} lançamento(s)`,  color: '#b45309', bg: '#fef3c7', border: '#fde68a', aba: 'pendente'  as const },
          { icon: <CheckCircle2 size={16} />, label: 'Aprovados',  value: formatCurrency(totalAprov), sub: `${contAbas.aprovado} lançamento(s)`,  color: '#15803d', bg: '#dcfce7', border: '#bbf7d0', aba: 'aprovado'  as const },
          { icon: <DollarSign size={16} />,   label: 'Pagos',      value: formatCurrency(totalPago),  sub: `${contAbas.pago} lançamento(s)`,      color: '#1d4ed8', bg: '#eff6ff', border: '#bfdbfe', aba: 'pago'      as const },
          { icon: <Users size={16} />,        label: 'Total mês',  value: formatCurrency(totalGeral), sub: `${rows.length} lançamento(s)`,         color: '#7c3aed', bg: '#ede9fe', border: '#ddd6fe', aba: 'pendente'  as const },
        ].map((c, i) => (
          <div key={i}
            onClick={() => i < 3 ? setAbaStatus(c.aba) : undefined}
            style={{
              background: c.bg, border: `1.5px solid ${abaStatus === c.aba && i < 3 ? c.color : c.border}`,
              borderRadius: 10, padding: '14px 16px', cursor: i < 3 ? 'pointer' : 'default',
              boxShadow: abaStatus === c.aba && i < 3 ? `0 0 0 2px ${c.color}30` : 'none',
              transition: 'all 0.15s',
            }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: c.color, marginBottom: 4 }}>
              {c.icon}<span style={{ fontSize: 11, fontWeight: 700 }}>{c.label}</span>
            </div>
            <div style={{ fontSize: 20, fontWeight: 800, color: c.color }}>{c.value}</div>
            <div style={{ fontSize: 11, color: c.color, opacity: .75, marginTop: 2 }}>{c.sub}</div>
          </div>
        ))}
      </div>

      {/* ── Filtros ── */}
      <div className="flex flex-wrap items-center gap-3 mb-4">
        <div className="relative flex-1 min-w-48">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input placeholder="Buscar colaborador…" value={filtroNome}
            onChange={e => setFiltroNome(e.target.value)} className="pl-8 h-9" />
        </div>
        <Select value={filtroTipo} onValueChange={setFiltroTipo}>
          <SelectTrigger className="w-44 h-9"><SelectValue placeholder="Todos os tipos" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="todos">Todos os tipos</SelectItem>
            {TIPOS.map(t => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}
          </SelectContent>
        </Select>
        {(filtroNome || filtroTipo !== 'todos') && (
          <button onClick={() => { setFiltroNome(''); setFiltroTipo('todos') }}
            style={{ height: 36, padding: '0 12px', fontSize: 12, border: '1.5px solid var(--border)', borderRadius: 6, background: 'transparent', cursor: 'pointer', color: 'var(--muted-foreground)' }}>
            ✕ Limpar
          </button>
        )}
        <button onClick={fetchData}
          style={{ width: 36, height: 36, borderRadius: 6, border: '1.5px solid var(--border)', background: 'var(--background)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <RefreshCw size={14} />
        </button>
        <Button onClick={openCreate} style={{ background: '#7c3aed', color: '#fff', gap: 6 }}>
          <Plus size={15} /> Novo Adiantamento
        </Button>
      </div>

      {/* ── Abas de status ── */}
      <div style={{ display: 'flex', gap: 0, marginBottom: 20, borderBottom: '2px solid var(--border)', flexWrap: 'wrap' }}>
        {([
          { key: 'pendente'  as const, label: '⏳ Pendentes',         cor: '#b45309' },
          { key: 'aprovado'  as const, label: '✅ Aprovados',         cor: '#15803d' },
          { key: 'pago'      as const, label: '💳 Pagos',             cor: '#1d4ed8' },
          { key: 'cancelado' as const, label: '❌ Cancelados',        cor: '#dc2626' },
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
          <DollarSign size={36} style={{ opacity: .25, margin: '0 auto 12px', display: 'block' }} />
          <div style={{ fontWeight: 700, fontSize: 15 }}>
            Nenhum adiantamento {STATUS_CFG[abaStatus].label.split(' ').slice(1).join(' ').toLowerCase()} em {mesLabel(competencia)}
          </div>
          <div style={{ fontSize: 12, marginTop: 4, opacity: .7 }}>
            {abaStatus === 'pendente' ? 'Clique em "+ Novo Adiantamento" para registrar.' : 'Nenhum registro nesta aba.'}
          </div>
        </div>
      ) : (
        <div style={{ border: '1px solid var(--border)', borderRadius: 10, overflow: 'hidden' }}>
          <Table>
            <TableHeader>
              <TableRow style={{ background: 'rgba(0,0,0,0.03)' }}>
                <TableHead style={{ fontSize: 11 }}>Colaborador</TableHead>
                <TableHead style={{ fontSize: 11 }}>Tipo</TableHead>
                <TableHead style={{ fontSize: 11 }}>Desconto (-AD)</TableHead>
                <TableHead style={{ fontSize: 11 }}>Observação</TableHead>
                <TableHead className="text-right" style={{ fontSize: 11, color: '#7c3aed', fontWeight: 700 }}>Valor</TableHead>
                <TableHead className="text-right" style={{ fontSize: 11 }}>Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map(r => {
                const badge = STATUS_CFG[r.status] ?? STATUS_CFG.pendente
                const isPago = r.status === 'pago'
                const parcelasTotal = r.desconto_parcelas ?? 1
                const parcelasFeitas = r.desconto_parcela_atual ?? 0
                // Destaque visual: pendente sem pagamento_id = voltou de recusado
                const foiRecusado = r.status === 'pendente' && !r.pagamento_id
                return (
                  <TableRow key={r.id} style={foiRecusado ? { background: 'rgba(251,191,36,0.08)', outline: '1.5px solid #fbbf24' } : {}}>
                    <TableCell>
                      <div style={{ fontWeight: 700, fontSize: 13 }}>{r.colaboradores?.nome ?? '—'}</div>
                      <div style={{ fontSize: 11, color: 'var(--muted-foreground)', fontFamily: 'monospace' }}>
                        {r.colaboradores?.chapa}
                      </div>
                    </TableCell>
                    <TableCell>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                        <span style={{ fontSize: 11, fontWeight: 700, padding: '3px 9px', borderRadius: 6,
                          background: badge.bg, color: badge.color, border: `1px solid ${badge.border}` }}>
                          {TIPO_LABEL[r.tipo] ?? r.tipo}
                        </span>
                        {/* Forma de quitação quando pago */}
                        {isPago && (
                          <span style={{ fontSize: 10, color: r.pagamento_id ? '#7c3aed' : '#059669', fontWeight: 600 }}>
                            {r.pagamento_id ? '💜 Via pagamento' : '✅ Via fechamento'}
                          </span>
                        )}
                        {/* Indicador: voltou de pagamento recusado */}
                        {foiRecusado && (
                          <span style={{ fontSize: 10, color: '#b45309', fontWeight: 700, background: '#fef3c7', borderRadius: 4, padding: '1px 6px', display: 'inline-block' }}>
                            ↩ Recusado — editável
                          </span>
                        )}
                      </div>
                    </TableCell>
                    {/* Coluna Desconto -AD */}
                    <TableCell style={{ fontSize: 11 }}>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                        {r.desconto_tipo === 'parcelado' ? (
                          <span style={{ background: '#fef3c7', color: '#b45309', borderRadius: 4, padding: '2px 7px', fontWeight: 700, display: 'inline-flex', alignItems: 'center', gap: 3, width: 'fit-content' }}>
                            <Repeat size={10} /> {parcelasFeitas}/{parcelasTotal}x
                          </span>
                        ) : (
                          <span style={{ background: '#eff6ff', color: '#1d4ed8', borderRadius: 4, padding: '2px 7px', fontWeight: 700, display: 'inline-flex', alignItems: 'center', gap: 3, width: 'fit-content' }}>
                            💳 Único
                          </span>
                        )}
                        {r.desconto_a_partir && (
                          <span style={{ fontSize: 10, color: 'var(--muted-foreground)' }}>
                            A partir: {r.desconto_a_partir.slice(0,7)}
                          </span>
                        )}
                        {r.desconto_obs && (
                          <span style={{ fontSize: 10, color: 'var(--muted-foreground)', maxWidth: 140, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={r.desconto_obs}>
                            {r.desconto_obs}
                          </span>
                        )}
                      </div>
                    </TableCell>
                    <TableCell style={{ color: 'var(--muted-foreground)', fontSize: 12, maxWidth: 180 }}>
                      <span style={{ display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={r.observacoes ?? ''}>
                        {r.observacoes || <span style={{ opacity: .4 }}>—</span>}
                      </span>
                    </TableCell>
                    <TableCell className="text-right">
                      <span style={{ fontWeight: 800, fontSize: 14, color: '#7c3aed' }}>{formatCurrency(r.valor)}</span>
                    </TableCell>
                    <TableCell className="text-right">
                      <div style={{ display: 'flex', gap: 4, justifyContent: 'flex-end' }}>
                        {r.status === 'pendente' && (
                          <button onClick={() => setAprovarRow(r)} title="Aprovar"
                            style={{ height: 28, padding: '0 10px', borderRadius: 6, border: '1px solid #bbf7d0', background: '#f0fdf4', color: '#15803d', cursor: 'pointer', fontSize: 11, fontWeight: 700, display: 'flex', alignItems: 'center', gap: 4 }}>
                            <CheckCircle2 size={12} /> Aprovar
                          </button>
                        )}
                        {/* Editar: pendente ou aprovado (não pago) */}
                        {!isPago && ['pendente','aprovado'].includes(r.status) && (
                          <button onClick={() => openEdit(r)} title="Editar"
                            style={{ width: 28, height: 28, borderRadius: 6, border: '1px solid var(--border)', background: 'var(--muted)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                            <Pencil size={12} />
                          </button>
                        )}
                        {/* Cancelar: apenas se NÃO pago */}
                        {r.status === 'aprovado' && !isPago && (
                          <button onClick={() => setCancelarRow(r)} title="Cancelar aprovação"
                            style={{ height: 28, padding: '0 10px', borderRadius: 6, border: '1px solid #fecaca', background: '#fff5f5', color: '#dc2626', cursor: 'pointer', fontSize: 11, fontWeight: 700, display: 'flex', alignItems: 'center', gap: 4 }}>
                            <XCircle size={12} /> Cancelar
                          </button>
                        )}
                        {/* Ícone de cadeado quando pago */}
                        {r?.requisicao_url && (
                          <a href={r.requisicao_url} target="_blank" rel="noopener noreferrer"
                            title="Ver requisição assinada"
                            style={{ width:28, height:28, borderRadius:6, border:'1px solid #bfdbfe', background:'#eff6ff', color:'#1d4ed8', display:'flex', alignItems:'center', justifyContent:'center', textDecoration:'none' }}>
                            📎
                          </a>
                        )}
                        {isPago && (
                          <span title="Pago — exclua o pagamento para editar"
                            style={{ width: 28, height: 28, borderRadius: 6, background: '#eff6ff', border: '1px solid #bfdbfe', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'help' }}>
                            🔒
                          </span>
                        )}
                        {(r.status === 'pendente' || r.status === 'cancelado') && (
                          <button onClick={() => setDeleteId(r.id)} title="Excluir"
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
              {filtered.length} lançamento(s) · aba: {STATUS_CFG[abaStatus].label}
            </span>
            <span style={{ fontWeight: 800, fontSize: 15, color: '#7c3aed' }}>
              Total: {formatCurrency(filtered.reduce((s, r) => s + r.valor, 0))}
            </span>
          </div>
        </div>
      )}

      {/* ══ MODAL CRIAR / EDITAR ══ */}
      {modalOpen && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.5)', zIndex: 50, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
          <div style={{ background: 'var(--background)', borderRadius: 14, padding: 0, width: '100%', maxWidth: 520, boxShadow: '0 25px 50px rgba(0,0,0,.25)', overflow: 'hidden' }}>
            {/* Header modal */}
            <div style={{ background: 'linear-gradient(135deg, #7c3aed, #6d28d9)', padding: '20px 24px' }}>
              <h2 style={{ fontWeight: 800, fontSize: 17, margin: 0, color: '#fff' }}>
                {editando ? '✏️ Editar Adiantamento' : '💵 Novo Adiantamento'}
              </h2>
              <p style={{ fontSize: 12, color: 'rgba(255,255,255,.75)', margin: '4px 0 0' }}>
                {editando ? 'Altere os dados do adiantamento' : 'Registre um novo adiantamento ou vale'}
              </p>
            </div>
            <div style={{ padding: 24 }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
                {/* Colaborador */}
                <div style={{ gridColumn: '1/-1' }}>
                  <Label className="mb-1 block">Colaborador *</Label>
                  <Select value={form.colaborador_id} onValueChange={v => setF('colaborador_id', v)}>
                    <SelectTrigger><SelectValue placeholder="Selecionar…" /></SelectTrigger>
                    <SelectContent>
                      {colabs.map(c => <SelectItem key={c.id} value={c.id}>{c.chapa} — {c.nome}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                {/* Tipo */}
                <div>
                  <Label className="mb-1 block">Tipo *</Label>
                  <Select value={form.tipo} onValueChange={v => setF('tipo', v)}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {TIPOS.map(t => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                {/* Valor */}
                <div>
                  <Label className="mb-1 block">Valor (R$) *</Label>
                  <Input type="number" min="0" step="0.01" value={form.valor}
                    onChange={e => setF('valor', e.target.value)} placeholder="0,00" />
                </div>
                {/* Competência */}
                <div>
                  <Label className="mb-1 block">Competência *</Label>
                  <input type="month" value={form.competencia} onChange={e => setF('competencia', e.target.value)}
                    style={{ height: 36, width: '100%', padding: '0 10px', fontSize: 13, border: '1.5px solid var(--border)', borderRadius: 6, background: 'var(--background)', color: 'var(--foreground)', boxSizing: 'border-box' }} />
                </div>
                {/* Obra */}
                <div>
                  <Label className="mb-1 block">Obra</Label>
                  <Select value={form.obra_id || 'nenhuma'} onValueChange={v => setF('obra_id', v === 'nenhuma' ? '' : v)}>
                    <SelectTrigger><SelectValue placeholder="Sem obra" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="nenhuma">Sem obra</SelectItem>
                      {obras.map(o => <SelectItem key={o.id} value={o.id}>{o.nome}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                {/* Observações */}
                <div style={{ gridColumn: '1/-1' }}>
                  <Label className="mb-1 block">Observações / Motivo</Label>
                  <Textarea value={form.observacoes} onChange={e => setF('observacoes', e.target.value)}
                    placeholder="Motivo, detalhes…" rows={2} />
                </div>
                {/* Upload da requisição assinada (somente criação) */}
                {!editando && (
                  <div style={{ gridColumn: '1/-1' }}>
                    <Label className="mb-1 block">📎 Requisição Assinada <span style={{color:'#dc2626'}}>*</span></Label>
                    <input
                      type="file"
                      accept=".pdf,.jpg,.jpeg,.png"
                      onChange={e => setArquivoRequisicao(e.target.files?.[0] ?? null)}
                      style={{ width:'100%', padding:'8px', border:'1.5px solid var(--border)', borderRadius:6, fontSize:12 }}
                    />
                    <div style={{ fontSize:11, color:'var(--muted-foreground)', marginTop:4 }}>
                      PDF ou imagem da requisição assinada pelo colaborador (obrigatório)
                    </div>
                  </div>
                )}
              </div>

              {/* ── Bloco: Desconto no Fechamento ── */}
              <div style={{ border: '1.5px solid #fde68a', borderRadius: 10, padding: '14px 16px', marginTop: 14, background: '#fffbeb' }}>
                <div style={{ fontWeight: 700, fontSize: 13, color: '#b45309', marginBottom: 12, display: 'flex', alignItems: 'center', gap: 6 }}>
                  <CalendarDays size={14} /> Desconto no Fechamento de Ponto (-AD)
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px 14px' }}>
                  {/* Tipo de desconto */}
                  <div>
                    <Label className="mb-1 block" style={{ fontSize: 11 }}>Tipo de Desconto *</Label>
                    <div style={{ display: 'flex', gap: 8 }}>
                      {([['unico','💳 Pontual / Único'],['parcelado','🔄 Parcelado']] as const).map(([v, l]) => (
                        <button key={v} type="button" onClick={() => setF('desconto_tipo', v)}
                          style={{ flex: 1, height: 36, border: `1.5px solid ${form.desconto_tipo === v ? '#b45309' : 'var(--border)'}`,
                            borderRadius: 8, background: form.desconto_tipo === v ? '#fef3c7' : 'var(--background)',
                            color: form.desconto_tipo === v ? '#b45309' : 'var(--muted-foreground)',
                            fontWeight: form.desconto_tipo === v ? 700 : 500, fontSize: 12, cursor: 'pointer' }}>
                          {l}
                        </button>
                      ))}
                    </div>
                  </div>
                  {/* A partir de */}
                  <div>
                    <Label className="mb-1 block" style={{ fontSize: 11 }}>Descontar a partir de *</Label>
                    <input type="month" value={form.desconto_a_partir} onChange={e => setF('desconto_a_partir', e.target.value)}
                      style={{ height: 36, width: '100%', padding: '0 10px', fontSize: 13, border: '1.5px solid var(--border)', borderRadius: 6, background: 'var(--background)', color: 'var(--foreground)', boxSizing: 'border-box' }} />
                  </div>
                  {/* Número de parcelas (só se parcelado) */}
                  {form.desconto_tipo === 'parcelado' && (
                    <div>
                      <Label className="mb-1 block" style={{ fontSize: 11 }}>Número de Parcelas *</Label>
                      <Input type="number" min="2" max="24" value={form.desconto_parcelas}
                        onChange={e => setF('desconto_parcelas', e.target.value)} placeholder="Ex: 3" />
                      {+form.desconto_parcelas > 1 && +form.valor > 0 && (
                        <div style={{ fontSize: 11, color: '#b45309', marginTop: 4 }}>
                          ≈ {formatCurrency(parseFloat(form.valor || '0') / parseInt(form.desconto_parcelas || '1'))} / parcela
                        </div>
                      )}
                    </div>
                  )}
                  {/* Obs do desconto */}
                  <div style={{ gridColumn: '1/-1' }}>
                    <Label className="mb-1 block" style={{ fontSize: 11 }}>Obs. do Desconto (aparece no fechamento)</Label>
                    <Input value={form.desconto_obs} onChange={e => setF('desconto_obs', e.target.value)}
                      placeholder="Ex: Parcelado em 3x a partir de Abril/2026…" />
                  </div>
                </div>
                <div style={{ fontSize: 11, color: '#92400e', marginTop: 8, display: 'flex', alignItems: 'flex-start', gap: 4 }}>
                  <Info size={12} style={{ flexShrink: 0, marginTop: 1 }} />
                  No Fechamento de Ponto, aparecerá o botão <strong>-AD</strong> para aprovar o desconto parcela a parcela.
                </div>
              </div>

              {/* Dica */}
              <div style={{ background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: 8, padding: '10px 14px', fontSize: 12, color: '#1e40af', marginTop: 10 }}>
                💡 Após registrar, clique em <strong>Aprovar</strong> para enviar à tela de <strong>Pagamentos</strong>.
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 18 }}>
                <Button variant="outline" onClick={() => setModalOpen(false)}>Cancelar</Button>
                <Button disabled={saving} onClick={handleSave} style={{ background: '#7c3aed', color: '#fff' }}>
                  {saving ? 'Salvando…' : editando ? '💾 Salvar' : '💵 Registrar'}
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
            <AlertDialogTitle>✅ Aprovar adiantamento?</AlertDialogTitle>
            <AlertDialogDescription>
              <strong>{aprovarRow?.colaboradores?.nome}</strong> — {formatCurrency(aprovarRow?.valor ?? 0)} ({mesLabel(aprovarRow?.competencia ?? '')}).<br />
              O adiantamento será enviado para <strong>Pagamentos</strong> como pendente de pagamento.
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
            <AlertDialogTitle>❌ Cancelar adiantamento?</AlertDialogTitle>
            <AlertDialogDescription>
              O adiantamento de <strong>{cancelarRow?.colaboradores?.nome}</strong> ({formatCurrency(cancelarRow?.valor ?? 0)}) será cancelado e removido da fila de Pagamentos.<br />
              Só é possível cancelar se o pagamento ainda não foi efetivado.
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
            <AlertDialogTitle>🗑️ Excluir adiantamento?</AlertDialogTitle>
            <AlertDialogDescription>Esta ação não pode ser desfeita.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} style={{ background: '#dc2626', color: '#fff' }}>
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

    </div>
  )
}
