import React, { useEffect, useState, useCallback } from 'react'
import { supabase } from '@/lib/supabase'
import { formatCurrency } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { toast } from 'sonner'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import { Plus, Search, Pencil, Trash2, X, DollarSign } from 'lucide-react'

// ─── tipos ───────────────────────────────────────────────────────────────────
type AdiantRow = {
  id: string
  colaborador_id: string
  obra_id: string | null
  competencia: string
  data_solicitacao: string
  data_pagamento: string | null
  valor: number
  status: 'pendente' | 'pago' | 'cancelado'
  tipo: string
  observacoes: string | null
  descontado_em: string | null
  colaboradores?: { nome: string; chapa: string }
  obras?: { nome: string } | null
}

type FormData = {
  colaborador_id: string
  obra_id: string
  competencia: string
  data_solicitacao: string
  data_pagamento: string
  valor: string
  status: string
  tipo: string
  observacoes: string
}

const TIPOS = [
  { value: 'adiantamento', label: '💵 Adiantamento Salarial' },
  { value: 'vale',         label: '🎫 Vale' },
  { value: 'ajuda_custo',  label: '🚗 Ajuda de Custo' },
  { value: 'outro',        label: '📋 Outro' },
]

const STATUS_OPTS = [
  { value: 'pendente',   label: '⏳ Pendente' },
  { value: 'pago',       label: '💰 Pago' },
  { value: 'cancelado',  label: '❌ Cancelado' },
]

const EMPTY: FormData = {
  colaborador_id: '',
  obra_id: '',
  competencia: new Date().toISOString().slice(0, 7),
  data_solicitacao: new Date().toISOString().slice(0, 10),
  data_pagamento: '',
  valor: '',
  status: 'pendente',
  tipo: 'adiantamento',
  observacoes: '',
}

const STATUS_BADGE: Record<string, { bg: string; color: string; label: string }> = {
  pendente:  { bg: '#fef3c7', color: '#b45309', label: '⏳ Pendente' },
  pago:      { bg: '#dcfce7', color: '#15803d', label: '💰 Pago' },
  cancelado: { bg: '#fee2e2', color: '#dc2626', label: '❌ Cancelado' },
}

const TIPO_BADGE: Record<string, string> = {
  adiantamento: '💵',
  vale:         '🎫',
  ajuda_custo:  '🚗',
  outro:        '📋',
}

function mesLabel(ym: string) {
  if (!ym) return '—'
  const [y, m] = ym.split('-')
  const meses = ['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez']
  return `${meses[+m - 1]}/${y}`
}

// ─── componente ──────────────────────────────────────────────────────────────
export default function Adiantamentos() {
  const [rows, setRows]       = useState<AdiantRow[]>([])
  const [colabs, setColabs]   = useState<{ id: string; nome: string; chapa: string }[]>([])
  const [obras, setObras]     = useState<{ id: string; nome: string }[]>([])
  const [loading, setLoading] = useState(true)

  // filtros
  const hoje = new Date()
  const [filtroComp, setFiltroComp]   = useState(hoje.toISOString().slice(0, 7))
  const [filtroNome, setFiltroNome]   = useState('')
  const [filtroStatus, setFiltroStatus] = useState('todos')
  const [filtroTipo, setFiltroTipo]   = useState('todos')

  // modal
  const [modal, setModal]     = useState(false)
  const [editando, setEditando] = useState<AdiantRow | null>(null)
  const [form, setForm]       = useState<FormData>(EMPTY)
  const [saving, setSaving]   = useState(false)
  const [deleteId, setDeleteId] = useState<string | null>(null)

  // ─── fetch ──────────────────────────────────────────────────────────────────
  const fetchData = useCallback(async () => {
    setLoading(true)
    const [{ data: aData }, { data: cData }, { data: oData }] = await Promise.all([
      supabase.from('adiantamentos')
        .select('*, colaboradores(nome,chapa), obras(nome)')
        .order('data_solicitacao', { ascending: false }),
      supabase.from('colaboradores').select('id,nome,chapa').eq('status','ativo').order('nome'),
      supabase.from('obras').select('id,nome').order('nome'),
    ])
    setRows((aData ?? []) as AdiantRow[])
    setColabs(cData ?? [])
    setObras(oData ?? [])
    setLoading(false)
  }, [])

  useEffect(() => { fetchData() }, [fetchData])

  // ─── filtro ─────────────────────────────────────────────────────────────────
  const filtered = rows.filter(r => {
    const matchComp   = filtroComp   ? r.competencia === filtroComp : true
    const matchNome   = filtroNome   ? r.colaboradores?.nome.toLowerCase().includes(filtroNome.toLowerCase()) : true
    const matchStatus = filtroStatus !== 'todos' ? r.status === filtroStatus : true
    const matchTipo   = filtroTipo   !== 'todos' ? r.tipo   === filtroTipo   : true
    return matchComp && matchNome && matchStatus && matchTipo
  })

  const totalPendente = filtered.filter(r => r.status === 'pendente').reduce((s, r) => s + r.valor, 0)
  const totalPago     = filtered.filter(r => r.status === 'pago').reduce((s, r) => s + r.valor, 0)

  // ─── modal helpers ───────────────────────────────────────────────────────────
  function openCreate() {
    setEditando(null)
    setForm({ ...EMPTY, competencia: filtroComp || EMPTY.competencia })
    setModal(true)
  }
  function openEdit(r: AdiantRow) {
    setEditando(r)
    setForm({
      colaborador_id: r.colaborador_id,
      obra_id: r.obra_id ?? '',
      competencia: r.competencia,
      data_solicitacao: r.data_solicitacao,
      data_pagamento: r.data_pagamento ?? '',
      valor: String(r.valor),
      status: r.status,
      tipo: r.tipo,
      observacoes: r.observacoes ?? '',
    })
    setModal(true)
  }
  function setF(k: keyof FormData, v: string) { setForm(p => ({ ...p, [k]: v })) }

  // ─── save ────────────────────────────────────────────────────────────────────
  async function handleSave() {
    if (!form.colaborador_id) return toast.error('Colaborador obrigatório')
    if (!form.valor || +form.valor <= 0) return toast.error('Valor obrigatório')
    setSaving(true)
    const payload: any = {
      colaborador_id: form.colaborador_id,
      obra_id: form.obra_id || null,
      competencia: form.competencia,
      data_solicitacao: form.data_solicitacao || null,
      data_pagamento: form.data_pagamento || null,
      valor: parseFloat(form.valor),
      status: form.status,
      tipo: form.tipo,
      observacoes: form.observacoes || null,
    }
    const { error } = editando
      ? await supabase.from('adiantamentos').update(payload).eq('id', editando.id)
      : await supabase.from('adiantamentos').insert(payload)
    setSaving(false)
    if (error) { toast.error('Erro: ' + error.message); return }
    toast.success(editando ? 'Adiantamento atualizado!' : 'Adiantamento registrado!')
    setModal(false)
    fetchData()
  }

  // ─── delete ──────────────────────────────────────────────────────────────────
  async function handleDelete() {
    if (!deleteId) return
    const { error } = await supabase.from('adiantamentos').delete().eq('id', deleteId)
    setDeleteId(null)
    if (error) toast.error('Erro ao excluir')
    else { toast.success('Adiantamento removido!'); fetchData() }
  }

  // ─── marcar pago ─────────────────────────────────────────────────────────────
  async function marcarPago(id: string) {
    const { error } = await supabase.from('adiantamentos')
      .update({ status: 'pago', data_pagamento: new Date().toISOString().slice(0, 10) })
      .eq('id', id)
    if (error) toast.error('Erro ao marcar como pago')
    else { toast.success('💰 Adiantamento marcado como pago!'); fetchData() }
  }

  // ─── render ──────────────────────────────────────────────────────────────────
  return (
    <div style={{ padding: 24 }}>

      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 20 }}>
        <div>
          <h1 style={{ fontWeight: 800, fontSize: 22, margin: 0 }}>💵 Adiantamentos</h1>
          <p style={{ fontSize: 13, color: '#6b7280', marginTop: 4 }}>Registro e controle de adiantamentos salariais e vales</p>
        </div>
        <Button onClick={openCreate} style={{ background: '#7c3aed', color: '#fff', gap: 6 }}>
          <Plus size={15} /> Novo Adiantamento
        </Button>
      </div>

      {/* Cards resumo */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12, marginBottom: 20 }}>
        <div style={{ background: '#fef3c7', border: '1px solid #fde68a', borderRadius: 10, padding: '14px 18px' }}>
          <div style={{ fontSize: 11, color: '#92400e', fontWeight: 700, marginBottom: 4 }}>⏳ Pendentes</div>
          <div style={{ fontWeight: 800, fontSize: 20, color: '#b45309' }}>{formatCurrency(totalPendente)}</div>
          <div style={{ fontSize: 11, color: '#92400e' }}>{filtered.filter(r => r.status === 'pendente').length} lançamento(s)</div>
        </div>
        <div style={{ background: '#dcfce7', border: '1px solid #bbf7d0', borderRadius: 10, padding: '14px 18px' }}>
          <div style={{ fontSize: 11, color: '#14532d', fontWeight: 700, marginBottom: 4 }}>💰 Pagos</div>
          <div style={{ fontWeight: 800, fontSize: 20, color: '#15803d' }}>{formatCurrency(totalPago)}</div>
          <div style={{ fontSize: 11, color: '#14532d' }}>{filtered.filter(r => r.status === 'pago').length} lançamento(s)</div>
        </div>
        <div style={{ background: '#ede9fe', border: '1px solid #ddd6fe', borderRadius: 10, padding: '14px 18px' }}>
          <div style={{ fontSize: 11, color: '#4c1d95', fontWeight: 700, marginBottom: 4 }}>📊 Total no período</div>
          <div style={{ fontWeight: 800, fontSize: 20, color: '#7c3aed' }}>{formatCurrency(totalPendente + totalPago)}</div>
          <div style={{ fontSize: 11, color: '#4c1d95' }}>{filtered.length} lançamento(s)</div>
        </div>
      </div>

      {/* Filtros */}
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 16, alignItems: 'center' }}>
        <div>
          <label style={{ fontSize: 11, color: '#6b7280', fontWeight: 600, display: 'block', marginBottom: 3 }}>Competência</label>
          <input type="month" value={filtroComp} onChange={e => setFiltroComp(e.target.value)}
            style={{ height: 32, padding: '0 10px', fontSize: 13, border: '1.5px solid #e5e7eb', borderRadius: 6, background: 'var(--background)', color: 'var(--foreground)' }} />
        </div>
        <div style={{ position: 'relative' }}>
          <label style={{ fontSize: 11, color: '#6b7280', fontWeight: 600, display: 'block', marginBottom: 3 }}>Colaborador</label>
          <Search size={13} style={{ position: 'absolute', left: 8, top: 29, color: '#9ca3af' }} />
          <input placeholder="Nome..." value={filtroNome} onChange={e => setFiltroNome(e.target.value)}
            style={{ height: 32, paddingLeft: 26, paddingRight: 10, fontSize: 13, border: '1.5px solid #e5e7eb', borderRadius: 6, background: 'var(--background)', color: 'var(--foreground)', width: 180 }} />
        </div>
        <div>
          <label style={{ fontSize: 11, color: '#6b7280', fontWeight: 600, display: 'block', marginBottom: 3 }}>Status</label>
          <select value={filtroStatus} onChange={e => setFiltroStatus(e.target.value)}
            style={{ height: 32, padding: '0 10px', fontSize: 13, border: '1.5px solid #e5e7eb', borderRadius: 6, background: 'var(--background)', color: 'var(--foreground)' }}>
            <option value="todos">Todos</option>
            {STATUS_OPTS.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
          </select>
        </div>
        <div>
          <label style={{ fontSize: 11, color: '#6b7280', fontWeight: 600, display: 'block', marginBottom: 3 }}>Tipo</label>
          <select value={filtroTipo} onChange={e => setFiltroTipo(e.target.value)}
            style={{ height: 32, padding: '0 10px', fontSize: 13, border: '1.5px solid #e5e7eb', borderRadius: 6, background: 'var(--background)', color: 'var(--foreground)' }}>
            <option value="todos">Todos</option>
            {TIPOS.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
          </select>
        </div>
        {(filtroNome || filtroStatus !== 'todos' || filtroTipo !== 'todos') && (
          <button onClick={() => { setFiltroNome(''); setFiltroStatus('todos'); setFiltroTipo('todos') }}
            style={{ height: 32, padding: '0 12px', fontSize: 12, border: '1.5px solid #e5e7eb', borderRadius: 6, background: 'transparent', cursor: 'pointer', color: '#6b7280', marginTop: 18 }}>
            ✕ Limpar
          </button>
        )}
      </div>

      {/* Tabela */}
      {loading ? (
        <div style={{ padding: 40, textAlign: 'center', color: '#9ca3af' }}>Carregando…</div>
      ) : filtered.length === 0 ? (
        <div style={{ padding: 60, textAlign: 'center', color: '#9ca3af', border: '1px dashed #e5e7eb', borderRadius: 12 }}>
          <DollarSign size={32} style={{ opacity: 0.3, marginBottom: 8 }} />
          <div style={{ fontWeight: 600 }}>Nenhum adiantamento encontrado</div>
          <div style={{ fontSize: 12, marginTop: 4 }}>Altere os filtros ou crie um novo adiantamento.</div>
        </div>
      ) : (
        <div style={{ border: '1px solid #e5e7eb', borderRadius: 10, overflow: 'hidden' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
            <thead>
              <tr style={{ background: '#f9fafb', borderBottom: '2px solid #e5e7eb' }}>
                <th style={{ padding: '10px 14px', textAlign: 'left', fontWeight: 700, color: '#374151' }}>Colaborador</th>
                <th style={{ padding: '10px 14px', textAlign: 'left', fontWeight: 700, color: '#374151' }}>Tipo</th>
                <th style={{ padding: '10px 14px', textAlign: 'center', fontWeight: 700, color: '#374151' }}>Competência</th>
                <th style={{ padding: '10px 14px', textAlign: 'center', fontWeight: 700, color: '#374151' }}>Solicitação</th>
                <th style={{ padding: '10px 14px', textAlign: 'center', fontWeight: 700, color: '#374151' }}>Pagamento</th>
                <th style={{ padding: '10px 14px', textAlign: 'right', fontWeight: 700, color: '#374151' }}>Valor</th>
                <th style={{ padding: '10px 14px', textAlign: 'center', fontWeight: 700, color: '#374151' }}>Desconto em</th>
                <th style={{ padding: '10px 14px', textAlign: 'center', fontWeight: 700, color: '#374151' }}>Status</th>
                <th style={{ padding: '10px 14px', textAlign: 'right', fontWeight: 700, color: '#374151' }}>Ações</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((r, i) => {
                const badge = STATUS_BADGE[r.status] ?? { bg: '#f3f4f6', color: '#6b7280', label: r.status }
                return (
                  <tr key={r.id} style={{ background: i % 2 === 0 ? '#fff' : '#fafafa', borderBottom: '1px solid #f3f4f6' }}>
                    <td style={{ padding: '10px 14px' }}>
                      <div style={{ fontWeight: 600, fontSize: 13 }}>{r.colaboradores?.nome ?? '—'}</div>
                      <div style={{ fontSize: 10, color: '#6b7280' }}>{r.colaboradores?.chapa}</div>
                    </td>
                    <td style={{ padding: '10px 14px' }}>
                      <span style={{ fontSize: 12 }}>{TIPO_BADGE[r.tipo] ?? '📋'} {TIPOS.find(t => t.value === r.tipo)?.label.replace(/^.+ /, '') ?? r.tipo}</span>
                    </td>
                    <td style={{ padding: '10px 14px', textAlign: 'center' }}>{mesLabel(r.competencia)}</td>
                    <td style={{ padding: '10px 14px', textAlign: 'center', color: '#374151' }}>
                      {r.data_solicitacao ? r.data_solicitacao.slice(8) + '/' + r.data_solicitacao.slice(5, 7) + '/' + r.data_solicitacao.slice(0, 4) : '—'}
                    </td>
                    <td style={{ padding: '10px 14px', textAlign: 'center', color: r.data_pagamento ? '#15803d' : '#9ca3af' }}>
                      {r.data_pagamento ? r.data_pagamento.slice(8) + '/' + r.data_pagamento.slice(5, 7) + '/' + r.data_pagamento.slice(0, 4) : '—'}
                    </td>
                    <td style={{ padding: '10px 14px', textAlign: 'right', fontWeight: 700, color: '#7c3aed', fontSize: 13 }}>
                      {formatCurrency(r.valor)}
                    </td>
                    <td style={{ padding: '10px 14px', textAlign: 'center' }}>
                      {r.descontado_em
                        ? <span style={{ fontSize: 11, background: '#dcfce7', color: '#15803d', borderRadius: 5, padding: '2px 7px', fontWeight: 600 }}>✓ {mesLabel(r.descontado_em)}</span>
                        : <span style={{ fontSize: 11, color: '#9ca3af' }}>—</span>}
                    </td>
                    <td style={{ padding: '10px 14px', textAlign: 'center' }}>
                      <span style={{ fontSize: 11, fontWeight: 600, borderRadius: 6, padding: '3px 9px', background: badge.bg, color: badge.color }}>
                        {badge.label}
                      </span>
                    </td>
                    <td style={{ padding: '10px 14px', textAlign: 'right' }}>
                      <div style={{ display: 'flex', gap: 4, justifyContent: 'flex-end' }}>
                        {r.status === 'pendente' && (
                          <button title="Marcar como pago" onClick={() => marcarPago(r.id)}
                            style={{ width: 28, height: 28, borderRadius: 6, border: '1px solid #bbf7d0', background: '#f0fdf4', color: '#15803d', cursor: 'pointer', fontSize: 13 }}>
                            💰
                          </button>
                        )}
                        <button title="Editar" onClick={() => openEdit(r)}
                          style={{ width: 28, height: 28, borderRadius: 6, border: '1px solid #e5e7eb', background: '#f9fafb', color: '#374151', cursor: 'pointer', fontSize: 12 }}>
                          <Pencil size={12} />
                        </button>
                        <button title="Excluir" onClick={() => setDeleteId(r.id)}
                          style={{ width: 28, height: 28, borderRadius: 6, border: '1px solid #fecaca', background: '#fff5f5', color: '#dc2626', cursor: 'pointer', fontSize: 12 }}>
                          <Trash2 size={12} />
                        </button>
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
            <tfoot>
              <tr style={{ background: '#f9fafb', borderTop: '2px solid #e5e7eb', fontWeight: 700 }}>
                <td colSpan={5} style={{ padding: '10px 14px', fontSize: 12, color: '#374151' }}>
                  Total — {filtered.length} lançamento(s)
                </td>
                <td style={{ padding: '10px 14px', textAlign: 'right', fontSize: 13, color: '#7c3aed' }}>
                  {formatCurrency(filtered.reduce((s, r) => s + r.valor, 0))}
                </td>
                <td colSpan={3} />
              </tr>
            </tfoot>
          </table>
        </div>
      )}

      {/* ══ MODAL CRIAR/EDITAR ══ */}
      {modal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 80, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ background: 'var(--background)', borderRadius: 14, width: 500, padding: 28, boxShadow: '0 20px 60px rgba(0,0,0,0.3)', maxHeight: '90vh', overflowY: 'auto' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
              <h3 style={{ fontWeight: 800, fontSize: 16, margin: 0 }}>
                {editando ? '✏️ Editar Adiantamento' : '💵 Novo Adiantamento'}
              </h3>
              <button onClick={() => setModal(false)} style={{ border: 'none', background: 'none', cursor: 'pointer', color: '#6b7280' }}><X size={18} /></button>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
              {/* Colaborador */}
              <div style={{ gridColumn: '1/-1' }}>
                <label style={{ fontSize: 12, fontWeight: 700, display: 'block', marginBottom: 5 }}>Colaborador *</label>
                <Select value={form.colaborador_id} onValueChange={v => setF('colaborador_id', v)}>
                  <SelectTrigger style={{ height: 36 }}>
                    <SelectValue placeholder="Selecionar colaborador" />
                  </SelectTrigger>
                  <SelectContent>
                    {colabs.map(c => <SelectItem key={c.id} value={c.id}>{c.chapa} — {c.nome}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>

              {/* Tipo */}
              <div>
                <label style={{ fontSize: 12, fontWeight: 700, display: 'block', marginBottom: 5 }}>Tipo *</label>
                <Select value={form.tipo} onValueChange={v => setF('tipo', v)}>
                  <SelectTrigger style={{ height: 36 }}>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {TIPOS.map(t => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>

              {/* Valor */}
              <div>
                <label style={{ fontSize: 12, fontWeight: 700, display: 'block', marginBottom: 5 }}>Valor (R$) *</label>
                <Input type="number" min="0" step="0.01" value={form.valor} onChange={e => setF('valor', e.target.value)}
                  placeholder="0,00" style={{ height: 36 }} />
              </div>

              {/* Competência */}
              <div>
                <label style={{ fontSize: 12, fontWeight: 700, display: 'block', marginBottom: 5 }}>Competência *</label>
                <input type="month" value={form.competencia} onChange={e => setF('competencia', e.target.value)}
                  style={{ height: 36, width: '100%', padding: '0 10px', fontSize: 13, border: '1.5px solid #e5e7eb', borderRadius: 6, background: 'var(--background)', color: 'var(--foreground)', boxSizing: 'border-box' }} />
              </div>

              {/* Data Solicitação */}
              <div>
                <label style={{ fontSize: 12, fontWeight: 700, display: 'block', marginBottom: 5 }}>Data Solicitação</label>
                <input type="date" value={form.data_solicitacao} onChange={e => setF('data_solicitacao', e.target.value)}
                  style={{ height: 36, width: '100%', padding: '0 10px', fontSize: 13, border: '1.5px solid #e5e7eb', borderRadius: 6, background: 'var(--background)', color: 'var(--foreground)', boxSizing: 'border-box' }} />
              </div>

              {/* Data Pagamento */}
              <div>
                <label style={{ fontSize: 12, fontWeight: 700, display: 'block', marginBottom: 5 }}>Data Pagamento</label>
                <input type="date" value={form.data_pagamento} onChange={e => setF('data_pagamento', e.target.value)}
                  style={{ height: 36, width: '100%', padding: '0 10px', fontSize: 13, border: '1.5px solid #e5e7eb', borderRadius: 6, background: 'var(--background)', color: 'var(--foreground)', boxSizing: 'border-box' }} />
              </div>

              {/* Obra */}
              <div>
                <label style={{ fontSize: 12, fontWeight: 700, display: 'block', marginBottom: 5 }}>Obra</label>
                <Select value={form.obra_id || 'nenhuma'} onValueChange={v => setF('obra_id', v === 'nenhuma' ? '' : v)}>
                  <SelectTrigger style={{ height: 36 }}>
                    <SelectValue placeholder="Sem obra" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="nenhuma">Sem obra</SelectItem>
                    {obras.map(o => <SelectItem key={o.id} value={o.id}>{o.nome}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>

              {/* Status */}
              <div>
                <label style={{ fontSize: 12, fontWeight: 700, display: 'block', marginBottom: 5 }}>Status</label>
                <Select value={form.status} onValueChange={v => setF('status', v)}>
                  <SelectTrigger style={{ height: 36 }}>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {STATUS_OPTS.map(s => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>

              {/* Observações */}
              <div style={{ gridColumn: '1/-1' }}>
                <label style={{ fontSize: 12, fontWeight: 700, display: 'block', marginBottom: 5 }}>Observações</label>
                <textarea value={form.observacoes} onChange={e => setF('observacoes', e.target.value)}
                  placeholder="Motivo, detalhes…" rows={3}
                  style={{ width: '100%', padding: '8px 10px', fontSize: 13, border: '1.5px solid #e5e7eb', borderRadius: 6, background: 'var(--background)', color: 'var(--foreground)', resize: 'vertical', fontFamily: 'inherit', boxSizing: 'border-box' }} />
              </div>
            </div>

            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 20 }}>
              <button onClick={() => setModal(false)}
                style={{ padding: '8px 16px', fontSize: 13, border: '1.5px solid #e5e7eb', borderRadius: 6, background: 'transparent', cursor: 'pointer', color: 'var(--foreground)' }}>
                Cancelar
              </button>
              <button disabled={saving} onClick={handleSave}
                style={{ padding: '8px 20px', fontSize: 13, fontWeight: 700, border: 'none', borderRadius: 6, background: '#7c3aed', color: '#fff', cursor: 'pointer', opacity: saving ? 0.6 : 1 }}>
                {saving ? 'Salvando…' : editando ? '💾 Salvar' : '💵 Registrar'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ══ MODAL CONFIRMAR EXCLUSÃO ══ */}
      {deleteId && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 80, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ background: 'var(--background)', borderRadius: 14, width: 360, padding: 28, boxShadow: '0 20px 60px rgba(0,0,0,0.3)', textAlign: 'center' }}>
            <div style={{ fontSize: 38, marginBottom: 8 }}>🗑️</div>
            <h3 style={{ fontWeight: 800, fontSize: 15, margin: '0 0 8px' }}>Confirmar exclusão?</h3>
            <p style={{ fontSize: 13, color: '#6b7280', marginBottom: 20 }}>Esta ação não pode ser desfeita.</p>
            <div style={{ display: 'flex', gap: 10, justifyContent: 'center' }}>
              <button onClick={() => setDeleteId(null)}
                style={{ padding: '8px 16px', fontSize: 13, border: '1.5px solid #e5e7eb', borderRadius: 6, background: 'transparent', cursor: 'pointer', color: 'var(--foreground)' }}>
                Cancelar
              </button>
              <button onClick={handleDelete}
                style={{ padding: '8px 20px', fontSize: 13, fontWeight: 700, border: 'none', borderRadius: 6, background: '#dc2626', color: '#fff', cursor: 'pointer' }}>
                Excluir
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
