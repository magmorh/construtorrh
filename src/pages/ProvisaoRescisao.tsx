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
import { SummaryCard } from '@/components/Shared'
import {
  Calculator, Plus, Trash2, Search, TrendingDown, Wallet, Users, FileText,
  ChevronRight, X, BarChart3, Printer, ClipboardList,
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

/** Linha de provisão — calculada por contracheque emitido (publicado/pago) */
interface LinhaProvisao {
  colaborador_id: string
  nome: string
  chapa: string
  mes_referencia: string        // YYYY-MM (competência do contracheque)
  tipo_pagamento: string        // mensal | adiantamento | etc.
  bruto: number                 // base sal+dsr
  fgts: number                  // 8%
  ferias: number                // 11,11%
  decimo_terceiro: number       // 8,33%
  aviso_previo: number          // 8,33% — aviso prévio indenizado
  multa_fgts: number            // 3,20% — multa 40% sobre FGTS
  dec_aviso: number             // 0,69% — 13° sobre aviso prévio
  fer_aviso: number             // 0,93% — férias+1/3 sobre aviso prévio
  total: number                 // soma de todos os itens
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
const PERC_FERIAS = 0.1111   // 1/9 (férias + 1/3 constitucional = 11,11%)
const PERC_13     = 0.0833   // 1/12
const PERC_AVISO  = 0.0833   // 1/12 — aviso prévio de 30 dias indenizado
const PERC_MULTA  = 0.032    // 40% × 8% — multa rescisória sobre FGTS
const PERC_13AV   = 0.0069   // 1/12 × 1/12 — 13° sobre aviso prévio
const PERC_FERAV  = 0.0093   // 1/12 × 1/9  — férias+1/3 sobre aviso prévio

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
  type DetalheKey = 'total' | 'fgts' | 'ferias' | 'decimo' | 'aviso' | 'multa' | 'dec_aviso' | 'fer_aviso'
  const [painelAberto,   setPainelAberto]   = useState<DetalheKey | null>(null)
  const [searchDetalhe,  setSearchDetalhe]  = useState('')

  // modal lançar rescisão
  const [modalOpen, setModalOpen] = useState(false)
  const [form,      setForm]      = useState<FormData>(EMPTY_FORM)
  const [saving,    setSaving]    = useState(false)

  // modal excluir
  const [deleteId,  setDeleteId]  = useState<string | null>(null)
  const [deleting,  setDeleting]  = useState(false)

  // Tabs
  const [aba,           setAba]           = useState<'resumo' | 'provisoes'>('resumo')
  const [buscaProvisoes, setBuscaProvisoes] = useState('')

  // ── Buscar dados ─────────────────────────────────────────────────────────────

  const fetchAll = useCallback(async () => {
    setLoading(true)
    try {
      const [lancRes, rescRes, colabRes] = await Promise.all([
        // Contracheques publicados/pagos — sem filtro CLT no join (faz em JS)
        supabase
          .from('contracheques')
          .select('id, colaborador_id, competencia, tipo, salario_base, valor_dsr')
          .order('competencia', { ascending: false }),
        // rescisões lançadas
        supabase
          .from('rescisoes')
          .select('*, colaboradores(nome, chapa)')
          .order('data_rescisao', { ascending: false }),
        // colaboradores CLT para modal + para enriquecer as linhas de provisão
        supabase
          .from('colaboradores')
          .select('id, nome, chapa, tipo_contrato')
          .eq('tipo_contrato', 'clt')
          .order('nome'),
      ])

      if (lancRes.error) throw new Error(`contracheques: ${lancRes.error.message}`)
      // rescisoes pode ainda não existir — não bloqueia a tela
      if (rescRes.error && !rescRes.error.message?.includes('does not exist') && rescRes.error.code !== '42P01') {
        console.warn('rescisoes query error:', rescRes.error)
      }

      // Mapa de colaboradores CLT para join em JS
      const TIPO_LABELS_PROV: Record<string,string> = {
        mensal:'Mensal', adiantamento:'Adiantamento', ferias:'Férias',
        '13o_1a':'13º 1ª', '13o_2a':'13º 2ª', rescisorio:'Rescisório',
      }
      const colabMap = new Map<string,{nome:string;chapa:string}>(
        (colabRes.data ?? []).map((c: any) => [c.id, { nome: c.nome, chapa: c.chapa ?? '' }])
      )
      const colabCltIds = new Set((colabRes.data ?? []).map((c: any) => c.id))

      // Montar linhas de provisão — somente contracheques de colaboradores CLT
      const linhas: LinhaProvisao[] = (lancRes.data ?? [])
        .filter((l: any) =>
          colabCltIds.has(l.colaborador_id) &&
          ((Number(l.salario_base) || 0) > 0 || (Number(l.valor_dsr) || 0) > 0)
        )
        .map((l: any) => {
          const colab = colabMap.get(l.colaborador_id)
          const bruto  = (Number(l.salario_base) || 0) + (Number(l.valor_dsr) || 0)
          const fgts   = bruto * PERC_FGTS
          const ferias = bruto * PERC_FERIAS
          const dec    = bruto * PERC_13
          const aviso  = bruto * PERC_AVISO
          const multa  = bruto * PERC_MULTA
          const decAv  = bruto * PERC_13AV
          const ferAv  = bruto * PERC_FERAV
          // competencia vem como '2026-04-01' — normalizar para 'YYYY-MM'
          const comp = (l.competencia ?? '').slice(0, 7)
          return {
            colaborador_id: l.colaborador_id,
            nome:  colab?.nome  ?? '—',
            chapa: colab?.chapa ?? '—',
            mes_referencia: comp,
            tipo_pagamento: TIPO_LABELS_PROV[l.tipo] ?? (l.tipo ?? '—'),
            bruto,
            fgts,
            ferias,
            decimo_terceiro: dec,
            aviso_previo: aviso,
            multa_fgts:   multa,
            dec_aviso:    decAv,
            fer_aviso:    ferAv,
            total: fgts + ferias + dec + aviso + multa + decAv + ferAv,
          }
      })

      setLinhasProvisao(linhas)
      setRescisoes((rescRes.data ?? []) as Rescisao[])
      setColaboradores(colabRes.data ?? [])
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : (err as any)?.message ?? 'Erro ao carregar dados'
      toast.error(msg)
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
    aviso:   linhasProvisao.reduce((s, l) => s + l.aviso_previo,    0),
    multa:   linhasProvisao.reduce((s, l) => s + l.multa_fgts,      0),
    dec_av:  linhasProvisao.reduce((s, l) => s + l.dec_aviso,       0),
    fer_av:  linhasProvisao.reduce((s, l) => s + l.fer_aviso,       0),
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
      !q || l.nome.toLowerCase().includes(q) || l.mes_referencia.includes(q) || l.tipo_pagamento.toLowerCase().includes(q)
    )
  }, [linhasProvisao, searchDetalhe])

  const PAINEL_CFG: Record<DetalheKey, { label: string; icon: string; color: string; bg: string; field: keyof LinhaProvisao }> = {
    total:   { label: 'Total Provisionado',       icon: '🏦', color: '#7c3aed', bg: '#ede9fe', field: 'total'            },
    fgts:    { label: 'Provisão FGTS (8%)',       icon: '🏛️', color: '#1d4ed8', bg: '#eff6ff', field: 'fgts'             },
    ferias:  { label: 'Provisão Férias (11,11%)', icon: '🌴', color: '#15803d', bg: '#dcfce7', field: 'ferias'           },
    decimo:  { label: 'Provisão 13º (8,33%)',     icon: '🎁', color: '#b45309', bg: '#fef3c7', field: 'decimo_terceiro'  },
    aviso:   { label: 'Provisão Aviso Prévio',    icon: '📋', color: '#0891b2', bg: '#ecfeff', field: 'aviso_previo'     },
    multa:   { label: 'Provisão Multa FGTS 40%',  icon: '⚡', color: '#dc2626', bg: '#fff1f2', field: 'multa_fgts'       },
    dec_aviso: { label: '13° s/ Aviso Prévio (0,69%)', icon: '📑', color: '#7c3aed', bg: '#f5f3ff', field: 'dec_aviso'      },
    fer_aviso: { label: 'Férias s/ Aviso (0,93%)',     icon: '🌿', color: '#065f46', bg: '#ecfdf5', field: 'fer_aviso'       },
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

  // ── Provisões filtradas (aba) ────────────────────────────────────────────────────
  const linhasProvisoesFiltradas = useMemo(() => {
    const q = buscaProvisoes.toLowerCase()
    return !q
      ? linhasProvisao
      : linhasProvisao.filter(l => l.nome.toLowerCase().includes(q) || l.mes_referencia.includes(q) || l.chapa.toLowerCase().includes(q) || l.tipo_pagamento.toLowerCase().includes(q))
  }, [linhasProvisao, buscaProvisoes])

  const totaisProvFiltrados = useMemo(() => ({
    bruto:  linhasProvisoesFiltradas.reduce((s,l) => s + l.bruto, 0),
    fgts:   linhasProvisoesFiltradas.reduce((s,l) => s + l.fgts, 0),
    ferias: linhasProvisoesFiltradas.reduce((s,l) => s + l.ferias, 0),
    decimo: linhasProvisoesFiltradas.reduce((s,l) => s + l.decimo_terceiro, 0),
    aviso:  linhasProvisoesFiltradas.reduce((s,l) => s + l.aviso_previo, 0),
    multa:  linhasProvisoesFiltradas.reduce((s,l) => s + l.multa_fgts, 0),
    dec_av: linhasProvisoesFiltradas.reduce((s,l) => s + l.dec_aviso, 0),
    fer_av: linhasProvisoesFiltradas.reduce((s,l) => s + l.fer_aviso, 0),
    total:  linhasProvisoesFiltradas.reduce((s,l) => s + l.total, 0),
  }), [linhasProvisoesFiltradas])

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

  // ── PDF Provisões ────────────────────────────────────────────────────────────────
  function gerarPdfProvisoes() {
    const fR = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
    const rows = linhasProvisoesFiltradas.map(l => `
      <tr>
        <td class="nome">${l.nome}</td>
        <td class="center">${l.chapa || '—'}</td>
        <td class="center">${l.tipo_pagamento}</td>
        <td class="num">${fR(l.bruto)}</td>
        <td class="num">${fR(l.fgts)}</td>
        <td class="num">${fR(l.ferias)}</td>
        <td class="num">${fR(l.decimo_terceiro)}</td>
        <td class="num">${fR(l.aviso_previo)}</td>
        <td class="num">${fR(l.multa_fgts)}</td>
        <td class="num">${fR(l.dec_aviso)}</td>
        <td class="num">${fR(l.fer_aviso)}</td>
        <td class="num bold">${fR(l.total)}</td>
      </tr>`).join('')
    const tp = totaisProvFiltrados
    const html = `<!DOCTYPE html><html lang="pt-BR"><head><meta charset="UTF-8"><title>Provisões por Colaborador</title>
<style>*{margin:0;padding:0;box-sizing:border-box}body{font-family:'Segoe UI',Arial,sans-serif;font-size:10px;color:#111}
@page{size:A4 landscape;margin:10mm}@media print{body{margin:0}}
h1{font-size:15px;font-weight:800;color:#1e3a5f;margin-bottom:2px}
p.sub{font-size:9px;color:#666;margin-bottom:10px}
table{width:100%;border-collapse:collapse}
th{background:#1e3a5f;color:#fff;font-weight:700;padding:6px 8px;text-align:right;white-space:nowrap;font-size:10px}
th:first-child,th:nth-child(2),th:nth-child(3){text-align:left}
td{padding:5px 8px;border-bottom:1px solid #e5e7eb;text-align:right;white-space:nowrap}
td.nome{text-align:left;font-weight:600}td.center{text-align:center}
td.num{font-family:monospace}td.bold{font-weight:800;color:#7c3aed}
tr:nth-child(even){background:#f8fafc}
tfoot td{background:#1e3a5f;color:#fff;font-weight:700;padding:6px 8px;text-align:right}
tfoot td:first-child{text-align:left}
</style></head><body>
<h1>Provisões por Colaborador</h1>
<p class="sub">Base: Sal+DSR · FGTS 8% · Férias 11,11% · 13º 8,33% · Aviso 8,33% · Multa 3,2% · 13°s/Av 0,69% · Fér.s/Av 0,93% · ${linhasProvisoesFiltradas.length} lançamentos · Gerado em ${new Date().toLocaleDateString('pt-BR')}</p>
<table>
  <thead><tr>
    <th>Colaborador</th><th>Chapa</th><th>Tipo</th>
    <th>Base Sal+DSR</th><th>FGTS 8%</th><th>Férias 11,11%</th>
    <th>13º 8,33%</th><th>Aviso Prév. 8,33%</th><th>Multa 3,2%</th><th>13°s/Aviso 0,69%</th><th>Férias s/Aviso 0,93%</th>
    <th>TOTAL</th>
  </tr></thead>
  <tbody>${rows}</tbody>
  <tfoot><tr>
    <td colspan="3">TOTAL (${linhasProvisoesFiltradas.length} lançamentos)</td>
    <td>${fR(tp.bruto)}</td><td>${fR(tp.fgts)}</td><td>${fR(tp.ferias)}</td>
    <td>${fR(tp.decimo)}</td><td>${fR(tp.aviso)}</td><td>${fR(tp.multa)}</td>
    <td>${fR(tp.dec_av)}</td><td>${fR(tp.fer_av)}</td>
    <td>${fR(tp.total)}</td>
  </tr></tfoot>
</table>
<script>window.onload=()=>window.print()</script>
</body></html>`
    const w = window.open('', '_blank')
    if (w) { w.document.write(html); w.document.close() }
  }

  // ── PDF Rescisões ─────────────────────────────────────────────────────────────
  function gerarPdfRescisoes() {
    const fR = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
    const fD = (d: string) => d ? new Date(d + 'T00:00:00').toLocaleDateString('pt-BR') : '—'
    const rows = filtered.map(r => {
      const tc = TIPO_COLORS[r.tipo]
      return `<tr>
        <td class="nome">${r.colaboradores?.nome ?? '—'}<br><span style="font-size:9px;color:#666">${r.colaboradores?.chapa ?? ''}</span></td>
        <td class="center"><span style="background:${tc.bg};color:${tc.color};border-radius:4px;padding:2px 6px;font-size:9px;font-weight:700">${TIPO_LABELS[r.tipo]}</span></td>
        <td class="center">${fD(r.data_rescisao)}</td>
        <td class="num">${r.valor_saldo_fgts > 0 ? fR(r.valor_saldo_fgts) : '—'}</td>
        <td class="num">${r.valor_aviso_previo > 0 ? fR(r.valor_aviso_previo) : '—'}</td>
        <td class="num">${r.valor_ferias_proporcionais > 0 ? fR(r.valor_ferias_proporcionais) : '—'}</td>
        <td class="num">${r.valor_13_proporcional > 0 ? fR(r.valor_13_proporcional) : '—'}</td>
        <td class="num">${r.valor_multa_fgts > 0 ? fR(r.valor_multa_fgts) : '—'}</td>
        <td class="num">${r.valor_outros > 0 ? fR(r.valor_outros) : '—'}</td>
        <td class="num bold">${fR(r.total_rescisao)}</td>
      </tr>`
    }).join('')
    const totalGeral = filtered.reduce((s,r) => s + r.total_rescisao, 0)
    const html = `<!DOCTYPE html><html lang="pt-BR"><head><meta charset="UTF-8"><title>Rescisões</title>
<style>*{margin:0;padding:0;box-sizing:border-box}body{font-family:'Segoe UI',Arial,sans-serif;font-size:10px;color:#111}
@page{size:A4 landscape;margin:10mm}@media print{body{margin:0}}
h1{font-size:15px;font-weight:800;color:#1e3a5f;margin-bottom:2px}
p.sub{font-size:9px;color:#666;margin-bottom:10px}
table{width:100%;border-collapse:collapse}
th{background:#1e3a5f;color:#fff;font-weight:700;padding:6px 8px;white-space:nowrap;font-size:10px}
th:not(:nth-child(3)):not(:nth-child(n+4)){text-align:left}
th:nth-child(n+4){text-align:right}
td{padding:5px 8px;border-bottom:1px solid #e5e7eb;text-align:right}
td.nome{text-align:left}td.center{text-align:center}
td.num{font-family:monospace}td.bold{font-weight:800;color:#dc2626}
tr:nth-child(even){background:#f8fafc}
tfoot td{background:#1e3a5f;color:#fff;font-weight:700;padding:6px 8px;text-align:right}
tfoot td:first-child{text-align:left}
</style></head><body>
<h1>Rescisões Registradas</h1>
<p class="sub">${filtered.length} rescisão(ões) · Gerado em ${new Date().toLocaleDateString('pt-BR')}</p>
<table>
  <thead><tr>
    <th>Colaborador</th><th style="text-align:center">Tipo</th><th style="text-align:center">Data</th>
    <th style="text-align:right">Saldo FGTS</th><th style="text-align:right">Aviso Prévio</th>
    <th style="text-align:right">Férias Prop.</th><th style="text-align:right">13º Prop.</th>
    <th style="text-align:right">Multa 40%</th><th style="text-align:right">Outros</th>
    <th style="text-align:right">TOTAL</th>
  </tr></thead>
  <tbody>${rows}</tbody>
  <tfoot><tr>
    <td colspan="9">TOTAL — ${filtered.length} rescisão(ões)</td>
    <td>${fR(totalGeral)}</td>
  </tr></tfoot>
</table>
<script>window.onload=()=>window.print()</script>
</body></html>`
    const w = window.open('', '_blank')
    if (w) { w.document.write(html); w.document.close() }
  }

  return (
    <div className="page-root">

      {/* ── Cabeçalho ──────────────────────────────────────────────────────────── */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24, flexWrap: 'wrap', gap: 12 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          <div style={{ width: 44, height: 44, borderRadius: 10, background: 'var(--primary)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Calculator size={24} color="#93c5fd" />
          </div>
          <div>
            <h1 style={{ fontSize: 22, fontWeight: 800, margin: 0 }}>Provisões &amp; Rescisão
              <span style={{ fontSize: 10, padding: '2px 8px', borderRadius: 99, background: '#dbeafe', color: '#1d4ed8', fontWeight: 700, marginLeft: 8, verticalAlign: 'middle' }}>
                CLT apenas
              </span>
            </h1>
            <p style={{ fontSize: 13, color: 'var(--muted-foreground)', margin: '2px 0 0' }}>
              Calculado por contracheque emitido · Base: Sal+DSR · FGTS 8% · Férias 11,11% · 13º 8,33% · Aviso Prévio 8,33% · Multa FGTS 3,2% · 13°s/Aviso 0,69% · Férias s/Aviso 0,93%
            </p>
          </div>
        </div>
        <Button onClick={() => { setForm(EMPTY_FORM); setModalOpen(true) }} style={{ gap: 6 }}>
          <Plus size={15} /> Lançar Rescisão
        </Button>
      </div>

      {/* ── Abas de navegação ─────────────────────────────────────────────────── */}
      <div style={{ display: 'flex', gap: 0, borderBottom: '2px solid var(--border)', marginBottom: 20 }}>
        {([
          { key: 'resumo',    label: '📊 Resumo & Rescisões',         icon: null },
          { key: 'provisoes', label: '📋 Provisões por Colaborador',  icon: null },
        ] as const).map(t => (
          <button key={t.key} onClick={() => setAba(t.key)}
            style={{
              padding: '10px 22px', fontWeight: aba === t.key ? 700 : 500,
              borderBottom: aba === t.key ? '3px solid #1a56a0' : '3px solid transparent',
              color: aba === t.key ? '#1a56a0' : 'var(--muted-foreground)',
              background: 'transparent', border: 'none', cursor: 'pointer',
              fontSize: 14, marginBottom: -2, transition: 'all .15s',
            }}>
            {t.label}
          </button>
        ))}
      </div>

      {aba === 'resumo' && (
      <>
      {/* ── Cards clicáveis ─────────────────────────────────────────────────────── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 14, marginBottom: 28 }}>

        <SummaryCard
          sigla="TOT"
          label="Total Provisionado"
          value={loading ? '…' : formatCurrency(totais.total)}
          sub={`${totais.lancamentos} fechamento(s) · clique para detalhar`}
          color="#7c3aed"
          bg="#7c3aed"
          onClick={() => { setPainelAberto('total'); setSearchDetalhe('') }}
        />
        <SummaryCard
          sigla="FG"
          label="Provisão FGTS (8%)"
          value={loading ? '…' : formatCurrency(totais.fgts)}
          sub={`${totais.lancamentos} fechamento(s) · clique para detalhar`}
          color="#1d4ed8"
          bg="#1d4ed8"
          onClick={() => { setPainelAberto('fgts'); setSearchDetalhe('') }}
        />
        <SummaryCard
          sigla="FER"
          label="Provisão Férias"
          value={loading ? '…' : formatCurrency(totais.ferias)}
          sub={`${totais.lancamentos} fechamento(s) · clique para detalhar`}
          color="#15803d"
          bg="#15803d"
          onClick={() => { setPainelAberto('ferias'); setSearchDetalhe('') }}
        />
        <SummaryCard
          sigla="13S"
          label="Provisão 13º"
          value={loading ? '…' : formatCurrency(totais.decimo)}
          sub={`${totais.lancamentos} fechamento(s) · clique para detalhar`}
          color="#b45309"
          bg="#b45309"
          onClick={() => { setPainelAberto('decimo'); setSearchDetalhe('') }}
        />
        <SummaryCard
          sigla="AVP"
          label="Provisão Aviso Prévio (8,33%)"
          value={loading ? '…' : formatCurrency(totais.aviso)}
          sub={`${totais.lancamentos} fechamento(s) · clique para detalhar`}
          color="#0891b2"
          bg="#0891b2"
          onClick={() => { setPainelAberto('aviso'); setSearchDetalhe('') }}
        />
        <SummaryCard
          sigla="MLT"
          label="Provisão Multa FGTS (3,2%)"
          value={loading ? '…' : formatCurrency(totais.multa)}
          sub={`${totais.lancamentos} fechamento(s) · clique para detalhar`}
          color="#dc2626"
          bg="#dc2626"
          onClick={() => { setPainelAberto('multa'); setSearchDetalhe('') }}
        />
        <SummaryCard
          sigla="13AV"
          label="13° s/ Aviso Prévio (0,69%)"
          value={formatCurrency(totais.dec_av)}
          sub={`${totais.lancamentos} fechamento(s) - clique para detalhar`}
          onClick={() => setPainelAberto(p => p === 'dec_aviso' ? null : 'dec_aviso')}
          active={painelAberto === 'dec_aviso'}
          color="#7c3aed" bg="#f5f3ff"
        />
        <SummaryCard
          sigla="FAV"
          label="Férias s/ Aviso (0,93%)"
          value={formatCurrency(totais.fer_av)}
          sub={`${totais.lancamentos} fechamento(s) - clique para detalhar`}
          onClick={() => setPainelAberto(p => p === 'fer_aviso' ? null : 'fer_aviso')}
          active={painelAberto === 'fer_aviso'}
          color="#065f46" bg="#ecfdf5"
        />
        <SummaryCard
          sigla="RSC"
          label="Total Pago em Rescisões"
          value={loading ? '…' : formatCurrency(totalRescisoes)}
          sub={`${rescisoes.length} rescisão(ões) registrada(s)`}
          color="#b91c1c"
          bg="#b91c1c"
        />
        <SummaryCard
          sigla={saldoDisponivel >= 0 ? 'SLD' : 'NEG'}
          label={saldoDisponivel >= 0 ? 'Saldo Disponível' : 'Saldo Negativo'}
          value={loading ? '…' : formatCurrency(saldoDisponivel)}
          sub="Provisões – Rescisões"
          color={saldoDisponivel >= 0 ? '#15803d' : '#c2410c'}
          bg={saldoDisponivel >= 0 ? '#15803d' : '#c2410c'}
        />

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
            <div style={{ display: 'flex', alignItems: 'center', marginBottom: 10 }}>
              <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--muted-foreground)', textTransform: 'uppercase', letterSpacing: 1 }}>Detalhamento</span>
              <span style={{ fontSize: 10, padding: '2px 8px', borderRadius: 99, background: '#dbeafe', color: '#1d4ed8', fontWeight: 700, marginLeft: 8 }}>
                CLT apenas
              </span>
            </div>
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
          {filtered.length > 0 && (
            <button onClick={gerarPdfRescisoes} title="Gerar PDF"
              style={{ display:'flex', alignItems:'center', gap:5, padding:'5px 12px', borderRadius:8, border:'1.5px solid #1a56a0', background:'#eff6ff', color:'#1a56a0', fontWeight:700, fontSize:12, cursor:'pointer' }}>
              <Printer size={13} /> PDF
            </button>
          )}
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
      </>
      )}
      {/* fim aba resumo */}

      {/* ══ ABA: Provisões por Colaborador ══════════════════════════════════ */}
      {aba === 'provisoes' && (
        <div>
          {/* Toolbar: busca + PDF */}
          <div style={{ display:'flex', alignItems:'center', gap:12, marginBottom:16, flexWrap:'wrap' }}>
            <div style={{ position:'relative', flex:1, minWidth:220, maxWidth:400 }}>
              <Search size={13} style={{ position:'absolute', left:10, top:'50%', transform:'translateY(-50%)', color:'var(--muted-foreground)' }} />
              <input value={buscaProvisoes} onChange={e => setBuscaProvisoes(e.target.value)}
                placeholder="Filtrar por nome, chapa ou competência…"
                style={{ width:'100%', height:38, paddingLeft:30, paddingRight:10, fontSize:13, border:'1.5px solid var(--border)', borderRadius:9, background:'var(--background)', color:'var(--foreground)', boxSizing:'border-box' }} />
            </div>
            <span style={{ fontSize:12, color:'var(--muted-foreground)' }}>{linhasProvisoesFiltradas.length} lançamento(s)</span>
            {linhasProvisoesFiltradas.length > 0 && (
              <button onClick={gerarPdfProvisoes}
                style={{ display:'flex', alignItems:'center', gap:5, padding:'7px 14px', borderRadius:8, border:'1.5px solid #1a56a0', background:'#eff6ff', color:'#1a56a0', fontWeight:700, fontSize:12, cursor:'pointer' }}>
                <Printer size={13} /> PDF
              </button>
            )}
          </div>

          {/* Tabela estilo Encargos */}
          {loading ? (
            <div style={{ padding:40, textAlign:'center', color:'var(--muted-foreground)' }}>Carregando…</div>
          ) : linhasProvisoesFiltradas.length === 0 ? (
            <div style={{ padding:60, textAlign:'center', color:'var(--muted-foreground)' }}>
              <ClipboardList size={36} style={{ opacity:.2, margin:'0 auto 12px', display:'block' }} />
              <div style={{ fontWeight:700 }}>Nenhuma provisão encontrada</div>
              <div style={{ fontSize:12, marginTop:4 }}>Os dados aparecem quando há fechamentos CLT aprovados.</div>
            </div>
          ) : (
            <div style={{ overflowX:'auto', borderRadius:10, border:'1px solid var(--border)', background:'var(--card)' }}>
              <table style={{ width:'100%', borderCollapse:'collapse', fontSize:11 }}>
                <thead>
                  <tr>
                    {[
                      { label: 'Colaborador' }, { label: 'Chapa' }, { label: 'Tipo' },
                      { label: 'Base Sal+DSR' }, { label: 'FGTS 8%' }, { label: 'Férias 11,11%' },
                      { label: '13º 8,33%' },   { label: 'Aviso Prév. 8,33%' }, { label: 'Multa 3,2%' }, { label: '13°s/Aviso' }, { label: 'Fér.s/Aviso' },
                      { label: 'TOTAL' },
                    ].map((h, i) => (
                      <th key={i} style={{ background:'#1e3a5f', color:'#fff', fontWeight:700, padding:'8px 10px', textAlign: i < 3 ? 'left' : 'right', whiteSpace:'nowrap', fontSize:11 }}>
                        {h.label}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {linhasProvisoesFiltradas.map((l, idx) => (
                    <tr key={`${l.colaborador_id}-${idx}`} style={{ background: idx % 2 === 0 ? 'var(--card)' : 'var(--muted)' }}>
                      <td style={{ padding:'7px 10px', whiteSpace:'nowrap' }}>
                        <div style={{ fontWeight:700, fontSize:12 }}>{l.nome}</div>
                      </td>
                      <td style={{ padding:'7px 10px', color:'var(--muted-foreground)', fontSize:11 }}>{l.chapa || '—'}</td>
                      <td style={{ padding:'7px 10px', fontSize:12 }}><span style={{ background:'#eff6ff', color:'#1a56a0', borderRadius:6, padding:'2px 8px', fontSize:11, fontWeight:700 }}>{l.tipo_pagamento}</span></td>
                      <td style={{ padding:'7px 10px', textAlign:'right', fontWeight:600, color:'#1e3a5f' }}>{formatCurrency(l.bruto)}</td>
                      <td style={{ padding:'7px 10px', textAlign:'right', color:'#15803d' }}>{formatCurrency(l.fgts)}</td>
                      <td style={{ padding:'7px 10px', textAlign:'right', color:'#15803d' }}>{formatCurrency(l.ferias)}</td>
                      <td style={{ padding:'7px 10px', textAlign:'right', color:'#b45309' }}>{formatCurrency(l.decimo_terceiro)}</td>
                      <td style={{ padding:'7px 10px', textAlign:'right', color:'#0891b2' }}>{formatCurrency(l.aviso_previo)}</td>
                      <td style={{ padding:'7px 10px', textAlign:'right', color:'#dc2626' }}>{formatCurrency(l.multa_fgts)}</td>
                      <td style={{ padding:'7px 10px', textAlign:'right', color:'#7c3aed' }}>{formatCurrency(l.dec_aviso)}</td>
                      <td style={{ padding:'7px 10px', textAlign:'right', color:'#065f46' }}>{formatCurrency(l.fer_aviso)}</td>
                      <td style={{ padding:'7px 10px', textAlign:'right', fontWeight:800, color:'#7c3aed', fontSize:12 }}>{formatCurrency(l.total)}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr style={{ fontSize:11 }}>
                    <td colSpan={3} style={{ background:'#1e3a5f', color:'#fff', fontWeight:700, padding:'8px 10px' }}>
                      TOTAIS ({linhasProvisoesFiltradas.length} lançamentos)
                    </td>
                    <td style={{ background:'#1e3a5f', color:'#bfdbfe', textAlign:'right', padding:'8px 10px' }}>{formatCurrency(totaisProvFiltrados.bruto)}</td>
                    <td style={{ background:'#1e3a5f', color:'#86efac', textAlign:'right', padding:'8px 10px' }}>{formatCurrency(totaisProvFiltrados.fgts)}</td>
                    <td style={{ background:'#1e3a5f', color:'#86efac', textAlign:'right', padding:'8px 10px' }}>{formatCurrency(totaisProvFiltrados.ferias)}</td>
                    <td style={{ background:'#1e3a5f', color:'#fde68a', textAlign:'right', padding:'8px 10px' }}>{formatCurrency(totaisProvFiltrados.decimo)}</td>
                    <td style={{ background:'#1e3a5f', color:'#67e8f9', textAlign:'right', padding:'8px 10px' }}>{formatCurrency(totaisProvFiltrados.aviso)}</td>
                    <td style={{ background:'#1e3a5f', color:'#fca5a5', textAlign:'right', padding:'8px 10px' }}>{formatCurrency(totaisProvFiltrados.multa)}</td>
                    <td style={{ background:'#1e3a5f', color:'#d8b4fe', textAlign:'right', padding:'8px 10px' }}>{formatCurrency(totaisProvFiltrados.dec_av)}</td>
                    <td style={{ background:'#1e3a5f', color:'#6ee7b7', textAlign:'right', padding:'8px 10px' }}>{formatCurrency(totaisProvFiltrados.fer_av)}</td>
                    <td style={{ background:'#1e3a5f', color:'#c4b5fd', fontWeight:800, textAlign:'right', padding:'8px 10px', fontSize:12 }}>{formatCurrency(totaisProvFiltrados.total)}</td>
                  </tr>
                </tfoot>
              </table>
            </div>
          )}
        </div>
      )}

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
