/*
 * ─── SQL para criar a tabela rescisoes (execute no Supabase SQL Editor) ──────
 *
 * create table if not exists public.rescisoes (
 *   id                         uuid primary key default gen_random_uuid(),
 *   colaborador_id             uuid not null references public.colaboradores(id) on delete restrict,
 *   data_rescisao              date not null,
 *   tipo                       text not null check (tipo in (
 *     'sem_justa_causa','com_justa_causa','pedido_demissao','acordo','aposentadoria','outros')),
 *   valor_saldo_fgts           numeric(12,2) not null default 0,
 *   valor_aviso_previo         numeric(12,2) not null default 0,
 *   valor_ferias_proporcionais numeric(12,2) not null default 0,
 *   valor_13_proporcional      numeric(12,2) not null default 0,
 *   valor_multa_fgts           numeric(12,2) not null default 0,
 *   valor_outros               numeric(12,2) not null default 0,
 *   total_rescisao             numeric(12,2) not null default 0,
 *   observacoes                text,
 *   created_at                 timestamptz not null default now()
 * );
 * alter table public.rescisoes enable row level security;
 * create policy "resc_all" on public.rescisoes for all to authenticated using (true) with check (true);
 * ─────────────────────────────────────────────────────────────────────────────
 */

import React, { useEffect, useState, useCallback, useMemo } from 'react'
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
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow, TableFooter,
} from '@/components/ui/table'
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { toast } from 'sonner'
import {
  Calculator, Plus, Trash2, Search, TrendingDown, Wallet, Users, FileText,
  ChevronRight, X, BarChart3,
} from 'lucide-react'

// ─── Tipos ────────────────────────────────────────────────────────────────────

type TipoRescisao =
  | 'sem_justa_causa' | 'com_justa_causa' | 'pedido_demissao'
  | 'acordo' | 'aposentadoria' | 'outros'

interface Rescisao {
  id: string
  colaborador_id: string
  data_rescisao: string
  tipo: TipoRescisao
  valor_saldo_fgts: number
  valor_aviso_previo: number
  valor_ferias_proporcionais: number
  valor_13_proporcional: number
  valor_multa_fgts: number
  valor_outros: number
  total_rescisao: number
  observacoes: string | null
  created_at: string
  colaboradores?: { nome: string; chapa: string }
}

/** Linha resumida por colaborador + mês — calculada a partir dos lançamentos pagos */
interface LinhaProvisao {
  colaborador_id: string
  nome: string
  chapa: string
  mes_referencia: string        // YYYY-MM
  bruto: number                 // snap_valor_total
  fgts: number                  // 8%
  ferias: number                // 11,11%
  decimo_terceiro: number       // 8,33%
  total: number                 // soma dos três
}

type FormData = {
  colaborador_id: string
  data_rescisao: string
  tipo: TipoRescisao | ''
  valor_saldo_fgts: string
  valor_aviso_previo: string
  valor_ferias_proporcionais: string
  valor_13_proporcional: string
  valor_multa_fgts: string
  valor_outros: string
  observacoes: string
}

// ─── Constantes ────────────────────────────────────────────────────────────────

const PERC_FGTS   = 0.08
const PERC_FERIAS = 0.1111   // 1/9 (acréscimo de férias incluso = 11,11%)
const PERC_13     = 0.0833   // 1/12

const TIPO_LABELS: Record<TipoRescisao, string> = {
  sem_justa_causa: 'Sem Justa Causa',
  com_justa_causa: 'Com Justa Causa',
  pedido_demissao: 'Pedido de Demissão',
  acordo:          'Acordo (§ 484-A)',
  aposentadoria:   'Aposentadoria',
  outros:          'Outros',
}

const TIPO_COLORS: Record<TipoRescisao, { bg: string; color: string }> = {
  sem_justa_causa: { bg: '#fee2e2', color: '#dc2626' },
  com_justa_causa: { bg: '#fef3c7', color: '#b45309' },
  pedido_demissao: { bg: '#eff6ff', color: '#1d4ed8' },
  acordo:          { bg: '#ede9fe', color: '#7c3aed' },
  aposentadoria:   { bg: '#dcfce7', color: '#15803d' },
  outros:          { bg: '#f3f4f6', color: '#374151' },
}

const EMPTY_FORM: FormData = {
  colaborador_id: '', data_rescisao: new Date().toISOString().slice(0, 10),
  tipo: '', valor_saldo_fgts: '', valor_aviso_previo: '', valor_ferias_proporcionais: '',
  valor_13_proporcional: '', valor_multa_fgts: '', valor_outros: '', observacoes: '',
}

function toNum(v: string) { const n = parseFloat(v.replace(',', '.')); return isNaN(n) ? 0 : n }

function fmtMes(ym: string) {
  if (!ym) return '—'
  const [y, m] = ym.split('-')
  const nomes = ['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez']
  return `${nomes[+m - 1]}/${y}`
}

// ─── Componente principal ──────────────────────────────────────────────────────

export default function ProvisaoRescisao() {
  const [linhasProvisao, setLinhasProvisao] = useState<LinhaProvisao[]>([])
  const [rescisoes,      setRescisoes]      = useState<Rescisao[]>([])
  const [colaboradores,  setColaboradores]  = useState<{ id: string; nome: string; chapa: string }[]>([])
  const [loading,        setLoading]        = useState(true)
  const [search,         setSearch]         = useState('')

  // painel de detalhamento
  type DetalheKey = 'total' | 'fgts' | 'ferias' | 'decimo'
  const [painelAberto,   setPainelAberto]   = useState<DetalheKey | null>(null)
  const [searchDetalhe,  setSearchDetalhe]  = useState('')

  // modal lançar rescisão
  const [modalOpen, setModalOpen] = useState(false)
  const [form,      setForm]      = useState<FormData>(EMPTY_FORM)
  const [saving,    setSaving]    = useState(false)

  // modal excluir
  const [deleteId,  setDeleteId]  = useState<string | null>(null)
  const [deleting,  setDeleting]  = useState(false)

  // ── Buscar dados ─────────────────────────────────────────────────────────────

  const fetchAll = useCallback(async () => {
    setLoading(true)
    try {
      const [lancRes, rescRes, colabRes] = await Promise.all([
        // Fechamentos CLT — status liberado OU pago — com snap_valor_total
        supabase
          .from('ponto_lancamentos')
          .select(`
            colaborador_id,
            mes_referencia,
            snap_valor_total,
            snap_valor_horas,
            snap_valor_dsr,
            status,
            colaboradores!inner(nome, chapa, tipo_contrato)
          `)
          .in('status', ['liberado', 'pago'])
          .eq('colaboradores.tipo_contrato', 'clt')
          .order('mes_referencia', { ascending: false }),
        // rescisões lançadas
        supabase
          .from('rescisoes')
          .select('*, colaboradores(nome, chapa)')
          .order('data_rescisao', { ascending: false }),
        // colaboradores CLT ativos para o modal
        supabase
          .from('colaboradores')
          .select('id, nome, chapa')
          .eq('status', 'ativo')
          .eq('tipo_contrato', 'clt')
          .order('nome'),
      ])

      if (lancRes.error) throw lancRes.error
      if (rescRes.error) throw rescRes.error

      // Montar linhas de provisão — base: horas CLT + DSR apenas (sem produção/prêmio/outros)
      const linhas: LinhaProvisao[] = (lancRes.data ?? [])
        .filter((l: any) => (l.snap_valor_horas ?? 0) > 0 || (l.snap_valor_dsr ?? 0) > 0)
        .map((l: any) => {
          // Base de cálculo = horas normais/extras + DSR (exclui produção, prêmio, etc.)
          const bruto  = (Number(l.snap_valor_horas) || 0) + (Number(l.snap_valor_dsr) || 0)
          const fgts   = bruto * PERC_FGTS
          const ferias = bruto * PERC_FERIAS
          const dec    = bruto * PERC_13
          return {
            colaborador_id: l.colaborador_id,
            nome:  l.colaboradores?.nome  ?? '—',
            chapa: l.colaboradores?.chapa ?? '—',
            mes_referencia: l.mes_referencia ?? '',
            bruto,
            fgts,
            ferias,
            decimo_terceiro: dec,
            total: fgts + ferias + dec,
          }
      })

      setLinhasProvisao(linhas)
      setRescisoes((rescRes.data ?? []) as Rescisao[])
      setColaboradores(colabRes.data ?? [])
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Erro ao carregar dados')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { fetchAll() }, [fetchAll])

  // ── Totais acumulados ────────────────────────────────────────────────────────

  const totais = useMemo(() => ({
    fgts:    linhasProvisao.reduce((s, l) => s + l.fgts,            0),
    ferias:  linhasProvisao.reduce((s, l) => s + l.ferias,          0),
    decimo:  linhasProvisao.reduce((s, l) => s + l.decimo_terceiro, 0),
    total:   linhasProvisao.reduce((s, l) => s + l.total,           0),
    bruto:   linhasProvisao.reduce((s, l) => s + l.bruto,           0),
    lancamentos: linhasProvisao.length,
  }), [linhasProvisao])

  const totalRescisoes  = rescisoes.reduce((s, r) => s + r.total_rescisao, 0)
  const saldoDisponivel = totais.total - totalRescisoes

  // ── Dados do painel de detalhe ───────────────────────────────────────────────

  /** Agrupa por colaborador + mês; filtrado pela busca do painel */
  const linhasDetalhe = useMemo(() => {
    const q = searchDetalhe.toLowerCase()
    return linhasProvisao.filter(l =>
      !q || l.nome.toLowerCase().includes(q) || l.mes_referencia.includes(q)
    )
  }, [linhasProvisao, searchDetalhe])

  const PAINEL_CFG: Record<DetalheKey, { label: string; icon: string; color: string; bg: string; field: keyof LinhaProvisao }> = {
    total:   { label: 'Total Provisionado',  icon: '🏦', color: '#7c3aed', bg: '#ede9fe', field: 'total'            },
    fgts:    { label: 'Provisão FGTS (8%)',  icon: '🏛️', color: '#1d4ed8', bg: '#eff6ff', field: 'fgts'             },
    ferias:  { label: 'Provisão Férias',     icon: '🌴', color: '#15803d', bg: '#dcfce7', field: 'ferias'           },
    decimo:  { label: 'Provisão 13º',        icon: '🎁', color: '#b45309', bg: '#fef3c7', field: 'decimo_terceiro'  },
  }

  // ── Totais do painel filtrado ────────────────────────────────────────────────

  const totalPainelFiltrado = useMemo(() => {
    if (!painelAberto) return 0
    const field = PAINEL_CFG[painelAberto].field
    return linhasDetalhe.reduce((s, l) => s + (Number(l[field]) || 0), 0)
  }, [linhasDetalhe, painelAberto])

  // ── Modal helpers ─────────────────────────────────────────────────────────────

  const totalCalc =
    toNum(form.valor_saldo_fgts) + toNum(form.valor_aviso_previo) +
    toNum(form.valor_ferias_proporcionais) + toNum(form.valor_13_proporcional) +
    toNum(form.valor_multa_fgts) + toNum(form.valor_outros)

  function setF(k: keyof FormData, v: string) { setForm(p => ({ ...p, [k]: v })) }

  async function handleSave() {
    if (!form.colaborador_id) return toast.warning('Selecione o colaborador')
    if (!form.data_rescisao)  return toast.warning('Informe a data')
    if (!form.tipo)           return toast.warning('Selecione o tipo de rescisão')
    if (totalCalc <= 0)       return toast.warning('Informe ao menos um valor')
    setSaving(true)
    try {
      const { error } = await supabase.from('rescisoes').insert({
        colaborador_id: form.colaborador_id,
        data_rescisao:  form.data_rescisao,
        tipo:           form.tipo as TipoRescisao,
        valor_saldo_fgts:           toNum(form.valor_saldo_fgts),
        valor_aviso_previo:         toNum(form.valor_aviso_previo),
        valor_ferias_proporcionais: toNum(form.valor_ferias_proporcionais),
        valor_13_proporcional:      toNum(form.valor_13_proporcional),
        valor_multa_fgts:           toNum(form.valor_multa_fgts),
        valor_outros:               toNum(form.valor_outros),
        total_rescisao:             totalCalc,
        observacoes:                form.observacoes || null,
      })
      if (error) throw error
      toast.success('Rescisão lançada com sucesso!')
      setModalOpen(false)
      fetchAll()
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Erro ao salvar')
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete() {
    if (!deleteId) return
    setDeleting(true)
    try {
      const { error } = await supabase.from('rescisoes').delete().eq('id', deleteId)
      if (error) throw error
      toast.success('Rescisão excluída')
      setDeleteId(null)
      fetchAll()
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Erro ao excluir')
    } finally {
      setDeleting(false)
    }
  }

  // ── Filtro da tabela de rescisões ─────────────────────────────────────────────

  const filtered = rescisoes.filter(r => {
    const q = search.toLowerCase()
    return !q
      || (r.colaboradores?.nome ?? '').toLowerCase().includes(q)
      || TIPO_LABELS[r.tipo].toLowerCase().includes(q)
  })

  // ─────────────────────────────────────────────────────────────────────────────
  // Render
  // ─────────────────────────────────────────────────────────────────────────────

  return (
    <div style={{ padding: 24, maxWidth: 1400, margin: '0 auto' }}>

      {/* ── Cabeçalho ──────────────────────────────────────────────────────────── */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24, flexWrap: 'wrap', gap: 12 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          <div style={{ width: 48, height: 48, borderRadius: 12, background: '#1e3a5f', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Calculator size={24} color="#93c5fd" />
          </div>
          <div>
            <h1 style={{ fontSize: 22, fontWeight: 800, margin: 0 }}>Provisões &amp; Rescisão</h1>
            <p style={{ fontSize: 13, color: 'var(--muted-foreground)', margin: '2px 0 0' }}>
              Base: Horas CLT + DSR · Exclui produção e prêmios · FGTS 8% · Férias 11,11% · 13º 8,33%
            </p>
          </div>
        </div>
        <Button onClick={() => { setForm(EMPTY_FORM); setModalOpen(true) }} style={{ gap: 6 }}>
          <Plus size={15} /> Lançar Rescisão
        </Button>
      </div>

      {/* ── Cards clicáveis ─────────────────────────────────────────────────────── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 14, marginBottom: 28 }}>

        {/* Total acumulado */}
        {(['total','fgts','ferias','decimo'] as DetalheKey[]).map(key => {
          const cfg = PAINEL_CFG[key]
          const valor = key === 'total' ? totais.total : key === 'fgts' ? totais.fgts : key === 'ferias' ? totais.ferias : totais.decimo
          return (
            <button key={key} onClick={() => { setPainelAberto(key); setSearchDetalhe('') }}
              style={{
                background: cfg.bg, border: `2px solid ${painelAberto === key ? cfg.color : cfg.bg}`,
                borderRadius: 12, padding: '16px 18px', textAlign: 'left', cursor: 'pointer',
                transition: 'all 0.15s', boxShadow: painelAberto === key ? `0 0 0 3px ${cfg.color}25` : 'none',
              }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <span style={{ fontSize: 20 }}>{cfg.icon}</span>
                <ChevronRight size={14} color={cfg.color} style={{ opacity: painelAberto === key ? 1 : 0.4 }} />
              </div>
              <div style={{ fontSize: 22, fontWeight: 800, color: cfg.color, marginTop: 8 }}>
                {loading ? '…' : formatCurrency(valor)}
              </div>
              <div style={{ fontSize: 11, fontWeight: 700, color: cfg.color, marginTop: 2 }}>{cfg.label}</div>
              <div style={{ fontSize: 10, color: cfg.color, opacity: .7, marginTop: 2 }}>
                {totais.lancamentos} fechamento(s) · horas+DSR · clique para detalhar
              </div>
            </button>
          )
        })}

        {/* Total pago em rescisões */}
        <div style={{ background: '#fee2e2', border: '2px solid #fee2e2', borderRadius: 12, padding: '16px 18px' }}>
          <div style={{ fontSize: 20 }}><TrendingDown size={20} color="#dc2626" /></div>
          <div style={{ fontSize: 22, fontWeight: 800, color: '#dc2626', marginTop: 8 }}>
            {loading ? '…' : formatCurrency(totalRescisoes)}
          </div>
          <div style={{ fontSize: 11, fontWeight: 700, color: '#dc2626', marginTop: 2 }}>Total Pago em Rescisões</div>
          <div style={{ fontSize: 10, color: '#dc2626', opacity: .7, marginTop: 2 }}>{rescisoes.length} rescisão(ões) registrada(s)</div>
        </div>

        {/* Saldo disponível */}
        <div style={{
          background: saldoDisponivel >= 0 ? '#dcfce7' : '#fff7ed',
          border: `2px solid ${saldoDisponivel >= 0 ? '#dcfce7' : '#fed7aa'}`,
          borderRadius: 12, padding: '16px 18px',
        }}>
          <div style={{ fontSize: 20 }}><Wallet size={20} color={saldoDisponivel >= 0 ? '#15803d' : '#c2410c'} /></div>
          <div style={{ fontSize: 22, fontWeight: 800, color: saldoDisponivel >= 0 ? '#15803d' : '#c2410c', marginTop: 8 }}>
            {loading ? '…' : formatCurrency(saldoDisponivel)}
          </div>
          <div style={{ fontSize: 11, fontWeight: 700, color: saldoDisponivel >= 0 ? '#15803d' : '#c2410c', marginTop: 2 }}>
            {saldoDisponivel >= 0 ? '✅ Saldo Disponível' : '⚠️ Saldo Negativo'}
          </div>
          <div style={{ fontSize: 10, color: saldoDisponivel >= 0 ? '#15803d' : '#c2410c', opacity: .7, marginTop: 2 }}>Provisões – Rescisões</div>
        </div>

      </div>

      {/* ── Painel de detalhamento (slide-in) ──────────────────────────────────── */}
      {painelAberto && (() => {
        const cfg = PAINEL_CFG[painelAberto]
        const field = cfg.field

        // agrupar por colaborador
        type ColabAgg = { id: string; nome: string; chapa: string; valor: number; meses: number }
        const porColab = new Map<string, ColabAgg>()
        linhasDetalhe.forEach(l => {
          const existing = porColab.get(l.colaborador_id)
          const v = Number(l[field]) || 0
          if (existing) { existing.valor += v; existing.meses++ }
          else porColab.set(l.colaborador_id, { id: l.colaborador_id, nome: l.nome, chapa: l.chapa, valor: v, meses: 1 })
        })
        const aggColab = Array.from(porColab.values()).sort((a, b) => b.valor - a.valor)

        return (
          <div style={{
            background: 'var(--card)', border: `2px solid ${cfg.color}40`,
            borderRadius: 14, padding: 20, marginBottom: 28,
            boxShadow: `0 4px 20px ${cfg.color}20`,
          }}>
            {/* Header do painel */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <span style={{ fontSize: 22 }}>{cfg.icon}</span>
                <div>
                  <div style={{ fontWeight: 800, fontSize: 16, color: cfg.color }}>{cfg.label}</div>
                  <div style={{ fontSize: 12, color: 'var(--muted-foreground)' }}>
                    {linhasDetalhe.length} lançamentos · {aggColab.length} colaboradores · Total: <strong>{formatCurrency(totalPainelFiltrado)}</strong>
                  </div>
                </div>
              </div>
              <button onClick={() => setPainelAberto(null)}
                style={{ width: 32, height: 32, borderRadius: 8, border: '1px solid var(--border)', background: 'var(--muted)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <X size={14} />
              </button>
            </div>

            {/* Busca no painel */}
            <div style={{ position: 'relative', marginBottom: 14, maxWidth: 360 }}>
              <Search size={13} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--muted-foreground)' }} />
              <input value={searchDetalhe} onChange={e => setSearchDetalhe(e.target.value)}
                placeholder="Filtrar por nome ou mês (ex: 2025-11)…"
                style={{ width: '100%', height: 36, paddingLeft: 30, paddingRight: 10, fontSize: 13, border: '1.5px solid var(--border)', borderRadius: 8, background: 'var(--background)', color: 'var(--foreground)', boxSizing: 'border-box' }} />
            </div>

            {/* Duas colunas: por colaborador + por mês */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>

              {/* Por colaborador */}
              <div>
                <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--muted-foreground)', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 8 }}>
                  <Users size={12} style={{ display: 'inline', marginRight: 4 }} />Por Colaborador
                </div>
                <div style={{ border: '1px solid var(--border)', borderRadius: 10, overflow: 'hidden', maxHeight: 340, overflowY: 'auto' }}>
                  <Table>
                    <TableHeader>
                      <TableRow style={{ background: `${cfg.color}10` }}>
                        <TableHead style={{ fontSize: 11 }}>Colaborador</TableHead>
                        <TableHead style={{ fontSize: 11 }} className="text-center">Meses</TableHead>
                        <TableHead style={{ fontSize: 11 }} className="text-right">Provisionado</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {aggColab.length === 0
                        ? <TableRow><TableCell colSpan={3} className="text-center text-sm text-muted-foreground py-6">Nenhum resultado</TableCell></TableRow>
                        : aggColab.map(c => (
                          <TableRow key={c.id}>
                            <TableCell>
                              <div style={{ fontWeight: 700, fontSize: 12 }}>{c.nome}</div>
                              <div style={{ fontSize: 10, color: 'var(--muted-foreground)' }}>{c.chapa}</div>
                            </TableCell>
                            <TableCell className="text-center" style={{ fontSize: 12 }}>{c.meses}</TableCell>
                            <TableCell className="text-right" style={{ fontWeight: 700, color: cfg.color, fontSize: 13 }}>
                              {formatCurrency(c.valor)}
                            </TableCell>
                          </TableRow>
                        ))
                      }
                    </TableBody>
                    <TableFooter>
                      <TableRow>
                        <TableCell colSpan={2} style={{ fontSize: 11, fontWeight: 700 }}>Total</TableCell>
                        <TableCell className="text-right" style={{ fontWeight: 800, color: cfg.color, fontSize: 13 }}>
                          {formatCurrency(aggColab.reduce((s, c) => s + c.valor, 0))}
                        </TableCell>
                      </TableRow>
                    </TableFooter>
                  </Table>
                </div>
              </div>

              {/* Por mês */}
              <div>
                <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--muted-foreground)', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 8 }}>
                  <BarChart3 size={12} style={{ display: 'inline', marginRight: 4 }} />Por Competência
                </div>
                {(() => {
                  // agrupar por mês
                  const porMes = new Map<string, number>()
                  linhasDetalhe.forEach(l => {
                    const v = Number(l[field]) || 0
                    porMes.set(l.mes_referencia, (porMes.get(l.mes_referencia) ?? 0) + v)
                  })
                  const mesList = Array.from(porMes.entries())
                    .sort((a, b) => b[0].localeCompare(a[0]))
                  const maxVal = mesList.reduce((mx, [, v]) => Math.max(mx, v), 0)
                  return (
                    <div style={{ border: '1px solid var(--border)', borderRadius: 10, overflow: 'hidden', maxHeight: 340, overflowY: 'auto' }}>
                      <Table>
                        <TableHeader>
                          <TableRow style={{ background: `${cfg.color}10` }}>
                            <TableHead style={{ fontSize: 11 }}>Competência</TableHead>
                            <TableHead style={{ fontSize: 11 }}>Distribuição</TableHead>
                            <TableHead style={{ fontSize: 11 }} className="text-right">Provisionado</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {mesList.length === 0
                            ? <TableRow><TableCell colSpan={3} className="text-center text-sm text-muted-foreground py-6">Nenhum resultado</TableCell></TableRow>
                            : mesList.map(([mes, val]) => (
                              <TableRow key={mes}>
                                <TableCell style={{ fontSize: 12, fontWeight: 700 }}>{fmtMes(mes)}</TableCell>
                                <TableCell style={{ minWidth: 80 }}>
                                  <div style={{ background: 'var(--muted)', borderRadius: 99, height: 6, overflow: 'hidden' }}>
                                    <div style={{ background: cfg.color, height: '100%', width: `${maxVal > 0 ? (val / maxVal) * 100 : 0}%`, borderRadius: 99, transition: 'width .3s' }} />
                                  </div>
                                </TableCell>
                                <TableCell className="text-right" style={{ fontWeight: 700, color: cfg.color, fontSize: 12 }}>
                                  {formatCurrency(val)}
                                </TableCell>
                              </TableRow>
                            ))
                          }
                        </TableBody>
                        <TableFooter>
                          <TableRow>
                            <TableCell colSpan={2} style={{ fontSize: 11, fontWeight: 700 }}>Total</TableCell>
                            <TableCell className="text-right" style={{ fontWeight: 800, color: cfg.color, fontSize: 13 }}>
                              {formatCurrency(mesList.reduce((s, [, v]) => s + v, 0))}
                            </TableCell>
                          </TableRow>
                        </TableFooter>
                      </Table>
                    </div>
                  )
                })()}
              </div>

            </div>
          </div>
        )
      })()}

      {/* ── Tabela de rescisões ──────────────────────────────────────────────────── */}
      <div style={{ border: '1px solid var(--border)', borderRadius: 12, overflow: 'hidden', background: 'var(--card)' }}>
        {/* Toolbar */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 16px', borderBottom: '1px solid var(--border)', flexWrap: 'wrap' }}>
          <div style={{ fontWeight: 700, fontSize: 14, display: 'flex', alignItems: 'center', gap: 6 }}>
            <FileText size={15} /> Rescisões Registradas
          </div>
          <div style={{ position: 'relative', flex: 1, minWidth: 200, maxWidth: 360 }}>
            <Search size={13} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--muted-foreground)' }} />
            <Input placeholder="Buscar colaborador ou tipo…" value={search} onChange={e => setSearch(e.target.value)}
              className="pl-8 h-9" />
          </div>
          <span style={{ fontSize: 12, color: 'var(--muted-foreground)' }}>{filtered.length} registro(s)</span>
        </div>

        {loading ? (
          <div style={{ padding: 40, textAlign: 'center', color: 'var(--muted-foreground)' }}>Carregando…</div>
        ) : filtered.length === 0 ? (
          <div style={{ padding: 60, textAlign: 'center', color: 'var(--muted-foreground)' }}>
            <FileText size={36} style={{ opacity: .2, margin: '0 auto 12px', display: 'block' }} />
            <div style={{ fontWeight: 700 }}>{search ? 'Nenhum resultado para a busca' : 'Nenhuma rescisão lançada ainda'}</div>
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Colaborador</TableHead>
                  <TableHead>Tipo</TableHead>
                  <TableHead className="text-center">Data</TableHead>
                  <TableHead className="text-right">Saldo FGTS</TableHead>
                  <TableHead className="text-right">Aviso Prév.</TableHead>
                  <TableHead className="text-right">Férias Prop.</TableHead>
                  <TableHead className="text-right">13º Prop.</TableHead>
                  <TableHead className="text-right">Multa 40%</TableHead>
                  <TableHead className="text-right">Outros</TableHead>
                  <TableHead className="text-right" style={{ fontWeight: 700 }}>Total</TableHead>
                  <TableHead />
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map(r => {
                  const tc = TIPO_COLORS[r.tipo]
                  return (
                    <TableRow key={r.id}>
                      <TableCell>
                        <div style={{ fontWeight: 700, fontSize: 13 }}>{r.colaboradores?.nome ?? '—'}</div>
                        <div style={{ fontSize: 11, color: 'var(--muted-foreground)' }}>{r.colaboradores?.chapa}</div>
                      </TableCell>
                      <TableCell>
                        <span style={{ background: tc.bg, color: tc.color, borderRadius: 6, padding: '3px 10px', fontSize: 11, fontWeight: 700 }}>
                          {TIPO_LABELS[r.tipo]}
                        </span>
                      </TableCell>
                      <TableCell className="text-center" style={{ fontSize: 12 }}>
                        {r.data_rescisao ? new Date(r.data_rescisao + 'T00:00:00').toLocaleDateString('pt-BR') : '—'}
                      </TableCell>
                      <TableCell className="text-right text-sm">{r.valor_saldo_fgts > 0 ? formatCurrency(r.valor_saldo_fgts) : '—'}</TableCell>
                      <TableCell className="text-right text-sm">{r.valor_aviso_previo > 0 ? formatCurrency(r.valor_aviso_previo) : '—'}</TableCell>
                      <TableCell className="text-right text-sm">{r.valor_ferias_proporcionais > 0 ? formatCurrency(r.valor_ferias_proporcionais) : '—'}</TableCell>
                      <TableCell className="text-right text-sm">{r.valor_13_proporcional > 0 ? formatCurrency(r.valor_13_proporcional) : '—'}</TableCell>
                      <TableCell className="text-right text-sm">{r.valor_multa_fgts > 0 ? formatCurrency(r.valor_multa_fgts) : '—'}</TableCell>
                      <TableCell className="text-right text-sm">{r.valor_outros > 0 ? formatCurrency(r.valor_outros) : '—'}</TableCell>
                      <TableCell className="text-right" style={{ fontWeight: 800, color: '#dc2626', fontSize: 14 }}>
                        {formatCurrency(r.total_rescisao)}
                      </TableCell>
                      <TableCell>
                        <button onClick={() => setDeleteId(r.id)}
                          title="Excluir"
                          style={{ width: 28, height: 28, borderRadius: 6, border: '1px solid #fecaca', background: '#fff5f5', color: '#dc2626', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                          <Trash2 size={13} />
                        </button>
                      </TableCell>
                    </TableRow>
                  )
                })}
              </TableBody>
              <TableFooter>
                <TableRow>
                  <TableCell colSpan={9} style={{ fontWeight: 700, fontSize: 13 }}>
                    Total — {filtered.length} rescisão(ões)
                  </TableCell>
                  <TableCell className="text-right" style={{ fontWeight: 800, color: '#dc2626', fontSize: 14 }}>
                    {formatCurrency(filtered.reduce((s, r) => s + r.total_rescisao, 0))}
                  </TableCell>
                  <TableCell />
                </TableRow>
              </TableFooter>
            </Table>
          </div>
        )}
      </div>

      {/* ══ MODAL: Lançar Rescisão ══════════════════════════════════════════════ */}
      {modalOpen && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.5)', zIndex: 50, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
          <div style={{ background: 'var(--background)', borderRadius: 14, width: '100%', maxWidth: 580, boxShadow: '0 25px 50px rgba(0,0,0,.3)', overflow: 'hidden', maxHeight: '90vh', overflowY: 'auto' }}>
            {/* Header */}
            <div style={{ background: 'linear-gradient(135deg, #1e3a5f, #1e40af)', padding: '20px 24px', position: 'sticky', top: 0, zIndex: 1 }}>
              <h2 style={{ fontWeight: 800, fontSize: 17, margin: 0, color: '#fff', display: 'flex', alignItems: 'center', gap: 8 }}>
                <Calculator size={18} /> Lançar Rescisão
              </h2>
              <p style={{ fontSize: 12, color: 'rgba(255,255,255,.75)', margin: '4px 0 0' }}>
                Informe os valores devidos ao colaborador
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
                      {colaboradores.map(c => (
                        <SelectItem key={c.id} value={c.id}>{c.nome}{c.chapa ? ` — ${c.chapa}` : ''}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                {/* Data */}
                <div>
                  <Label className="mb-1 block">Data da Rescisão *</Label>
                  <Input type="date" value={form.data_rescisao} onChange={e => setF('data_rescisao', e.target.value)} />
                </div>
                {/* Tipo */}
                <div>
                  <Label className="mb-1 block">Tipo de Rescisão *</Label>
                  <Select value={form.tipo} onValueChange={v => setF('tipo', v)}>
                    <SelectTrigger><SelectValue placeholder="Selecionar…" /></SelectTrigger>
                    <SelectContent>
                      {(Object.keys(TIPO_LABELS) as TipoRescisao[]).map(k => (
                        <SelectItem key={k} value={k}>{TIPO_LABELS[k]}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {/* Separador */}
                <div style={{ gridColumn: '1/-1', borderTop: '1px solid var(--border)', paddingTop: 4, fontSize: 11, fontWeight: 700, color: 'var(--muted-foreground)', textTransform: 'uppercase', letterSpacing: 1 }}>
                  Componentes
                </div>

                {[
                  { key: 'valor_saldo_fgts'           as keyof FormData, label: '🏛️ Saldo FGTS'            },
                  { key: 'valor_aviso_previo'          as keyof FormData, label: '📋 Aviso Prévio'           },
                  { key: 'valor_ferias_proporcionais'  as keyof FormData, label: '🌴 Férias Proporcionais'   },
                  { key: 'valor_13_proporcional'       as keyof FormData, label: '🎁 13º Proporcional'       },
                  { key: 'valor_multa_fgts'            as keyof FormData, label: '⚡ Multa FGTS (40%)'       },
                  { key: 'valor_outros'                as keyof FormData, label: '📦 Outros'                 },
                ].map(({ key, label }) => (
                  <div key={key}>
                    <Label className="mb-1 block" style={{ fontSize: 12 }}>{label}</Label>
                    <Input type="number" min="0" step="0.01" placeholder="0,00"
                      value={form[key] as string} onChange={e => setF(key, e.target.value)} />
                  </div>
                ))}

                {/* Total calculado */}
                <div style={{ gridColumn: '1/-1', background: '#eff6ff', border: '1.5px solid #bfdbfe', borderRadius: 10, padding: '12px 16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontWeight: 700, fontSize: 14, color: '#1d4ed8' }}>Total da Rescisão</span>
                  <span style={{ fontWeight: 800, fontSize: 22, color: '#1d4ed8' }}>{formatCurrency(totalCalc)}</span>
                </div>

                {/* Observações */}
                <div style={{ gridColumn: '1/-1' }}>
                  <Label className="mb-1 block">Observações</Label>
                  <Textarea placeholder="Informações adicionais…" rows={2}
                    value={form.observacoes} onChange={e => setF('observacoes', e.target.value)} />
                </div>
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 20 }}>
                <Button variant="outline" onClick={() => setModalOpen(false)}>Cancelar</Button>
                <Button disabled={saving} onClick={handleSave} style={{ gap: 6 }}>
                  {saving ? 'Salvando…' : <><Plus size={14} /> Lançar Rescisão</>}
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ══ CONFIRMAR EXCLUSÃO ═════════════════════════════════════════════════ */}
      <AlertDialog open={!!deleteId} onOpenChange={o => { if (!o) setDeleteId(null) }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>🗑️ Excluir rescisão?</AlertDialogTitle>
            <AlertDialogDescription>
              Esta ação não pode ser desfeita. O saldo disponível será recalculado.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} disabled={deleting}
              style={{ background: '#dc2626', color: '#fff' }}>
              {deleting ? 'Excluindo…' : 'Excluir'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

    </div>
  )
}
