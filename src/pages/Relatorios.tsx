// Relatorios.tsx — Página completa de relatórios do ConstrutorRH
// 28 categorias de relatórios | Sidebar + Painel | Print/PDF profissional
import React, { useState, useEffect, useCallback } from 'react'
import { supabase } from '@/lib/supabase'
import { fetchEmpresaData, gerarCabecalhoHTML, CABECALHO_CSS } from '@/lib/relatorioHeader'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import {
  BarChart3, Users, Building2, Shield, AlertTriangle, DollarSign,
  Clock, TrendingUp, FileText, Award, Truck, Calculator, Package,
  Heart, Printer, Loader2, Filter, ChevronRight, Activity, Star,
  HardHat, Wrench, Target, Calendar, Search, Download, ChevronDown,
} from 'lucide-react'

// ─── Helpers ──────────────────────────────────────────────────────────────────

// helpers de período
const NOME_MES = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro']


const fmtDate = (d: string | null | undefined) =>
  d ? new Date(d + (d.includes('T') ? '' : 'T12:00:00')).toLocaleDateString('pt-BR') : '—'

const fmtCur = (v: number | null | undefined) =>
  v != null ? v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }) : '—'

const fmtMes = (ym: string | null | undefined) => {
  if (!ym) return '—'
  const [y, m] = ym.split('-')
  const meses = ['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez']
  return `${meses[+m - 1]}/${y}`
}

const fmtNum = (v: number | null | undefined) =>
  v != null ? v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '—'

const anoAtual = String(new Date().getFullYear())
const mesAtual = String(new Date().getMonth() + 1).padStart(2, '0')
const hoje = new Date().toISOString().split('T')[0]
const primeiroDiaMes = `${anoAtual}-${mesAtual}-01`

async function abrirPDF(titulo: string, htmlBody: string, subtitulo?: string, periodo?: string) {
  try {
    const emp = await fetchEmpresaData()
    const cabHTML = gerarCabecalhoHTML(emp, { titulo, subtitulo, periodo })
    const html = `<!DOCTYPE html><html lang="pt-BR">
<head><meta charset="utf-8"><title>${titulo}</title>
<style>
${CABECALHO_CSS}
*{box-sizing:border-box;margin:0;padding:0;-webkit-print-color-adjust:exact!important;print-color-adjust:exact!important}
body{font-family:Arial,sans-serif;font-size:11px;color:#111;background:#fff;padding:16px}
h2{font-size:13px;font-weight:700;color:#1e3a5f;margin:14px 0 6px;border-bottom:1px solid #e2e8f0;padding-bottom:4px}
table{width:100%;border-collapse:collapse;font-size:10px;margin-top:6px;margin-bottom:14px}
th{background:#1e3a5f!important;color:#fff!important;padding:6px 8px;text-align:left;font-size:9.5px;-webkit-print-color-adjust:exact}
td{padding:5px 8px;border-bottom:1px solid #e2e8f0;vertical-align:top}
tr:nth-child(even) td{background:#f8fafc!important}
tfoot td{background:#e8f0fe!important;font-weight:700;border-top:2px solid #1e3a5f}
.badge-ok{background:#dcfce7;color:#166534;padding:2px 6px;border-radius:9999px;font-size:9px}
.badge-warn{background:#fef9c3;color:#854d0e;padding:2px 6px;border-radius:9999px;font-size:9px}
.badge-danger{background:#fee2e2;color:#991b1b;padding:2px 6px;border-radius:9999px;font-size:9px}
.badge-info{background:#dbeafe;color:#1e40af;padding:2px 6px;border-radius:9999px;font-size:9px}
.kpi-row{display:flex;gap:12px;flex-wrap:wrap;margin-bottom:14px}
.kpi{flex:1;min-width:120px;background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;padding:10px 14px;text-align:center}
.kpi-val{font-size:18px;font-weight:800;color:#1e3a5f}
.kpi-lbl{font-size:9px;color:#64748b;margin-top:2px;text-transform:uppercase;letter-spacing:.5px}
@media print{body{padding:8px}.no-print{display:none}}
</style></head><body>
${cabHTML}
${htmlBody}
<script>window.onload=()=>setTimeout(()=>window.print(),500)<\/script>
</body></html>`
    const win = window.open('', '_blank', 'width=1200,height=900')
    if (win) { win.document.write(html); win.document.close() }
    else toast.error('Pop-up bloqueado. Permita pop-ups para este site.')
  } catch {
    toast.error('Erro ao gerar PDF.')
  }
}

// ─── Tipos ────────────────────────────────────────────────────────────────────

interface Obra { id: string; nome: string; codigo?: string; status?: string }
interface Colaborador { id: string; nome: string; chapa?: string }
interface Funcao { id: string; nome: string; categoria?: string }

// ─── Menu de relatórios ───────────────────────────────────────────────────────

interface RelatItem { id: string; label: string; icon: React.ReactNode; desc: string }
interface RelatGroup { id: string; label: string; icon: React.ReactNode; color: string; items: RelatItem[] }

const GRUPOS: RelatGroup[] = [
  {
    id: 'obra', label: 'Por Obra', icon: <Building2 size={16}/>, color: '#1e3a5f',
    items: [
      { id: 'headcount-obra', label: 'Headcount por Obra', icon: <Users size={14}/>, desc: 'Colaboradores ativos, inativos e afastados por obra' },
      { id: 'custo-obra', label: 'Custo Total por Obra', icon: <DollarSign size={14}/>, desc: 'Folha + adiantamentos + VT + prêmios por obra/mês' },
      { id: 'producao-obra', label: 'Produtividade por Obra', icon: <BarChart3 size={14}/>, desc: 'Produção por item do playbook com custo/unidade' },
      { id: 'faltas-obra', label: 'Faltas por Obra', icon: <Clock size={14}/>, desc: 'Total de faltas e % de ausência por obra/mês' },
      { id: 'acidentes-obra', label: 'Acidentes por Obra', icon: <AlertTriangle size={14}/>, desc: 'Total de acidentes, gravidade e CAT emitida' },
    ]
  },
  {
    id: 'colaborador', label: 'Por Colaborador', icon: <Users size={16}/>, color: '#0f766e',
    items: [
      { id: 'ficha-financeira', label: 'Ficha Financeira Individual', icon: <DollarSign size={14}/>, desc: 'Pagamentos, adiantamentos, VT e prêmios de 1 colaborador' },
      { id: 'historico-ponto', label: 'Histórico de Ponto', icon: <Clock size={14}/>, desc: 'Espelho de ponto completo mês a mês' },
      { id: 'producao-individual', label: 'Produção Individual', icon: <BarChart3 size={14}/>, desc: 'Quantidade produzida por item/playbook' },
      { id: 'ocorrencias-colab', label: 'Ocorrências do Colaborador', icon: <FileText size={14}/>, desc: 'Advertências, atestados, acidentes e ocorrências' },
      { id: 'custo-colab', label: 'Custo Total do Colaborador', icon: <Calculator size={14}/>, desc: 'Tudo que a empresa gastou com 1 colaborador' },
    ]
  },
  {
    id: 'funcao', label: 'Por Função', icon: <Wrench size={16}/>, color: '#7c3aed',
    items: [
      { id: 'headcount-funcao', label: 'Headcount por Função', icon: <Users size={14}/>, desc: 'Colaboradores por função com salário médio' },
      { id: 'custo-funcao', label: 'Custo por Função', icon: <DollarSign size={14}/>, desc: 'Folha total agrupado por função' },
      { id: 'producao-funcao', label: 'Produtividade por Função', icon: <TrendingUp size={14}/>, desc: 'Produção média por função e categoria' },
    ]
  },
  {
    id: 'desempenho', label: 'Desempenho', icon: <TrendingUp size={16}/>, color: '#b45309',
    items: [
      { id: 'ranking-producao', label: 'Ranking de Produção', icon: <Star size={14}/>, desc: 'Top colaboradores por quantidade produzida' },
      { id: 'producao-playbook', label: 'Produção por Item Playbook', icon: <Package size={14}/>, desc: 'Produção por atividade do playbook' },
      { id: 'meta-realizado', label: 'Meta vs Realizado', icon: <Target size={14}/>, desc: 'Horas contratadas vs trabalhadas vs extras — agrupado por função' },
      { id: 'evolucao-horas', label: 'Evolução de Horas', icon: <Activity size={14}/>, desc: 'Horas trabalhadas, extras e faltas mês a mês' },
      { id: 'coeficiente-producao', label: 'Coeficiente de Produção', icon: <TrendingUp size={14}/>, desc: 'Produtividade real por atividade e função (un/hora) — base para orçamentos' },
    ]
  },
  {
    id: 'seguranca', label: 'Segurança & Saúde', icon: <Shield size={16}/>, color: '#dc2626',
    items: [
      { id: 'painel-acidentes', label: 'Painel de Acidentes', icon: <AlertTriangle size={14}/>, desc: 'Frequência, gravidade e CAT emitidas' },
      { id: 'painel-atestados', label: 'Painel de Atestados', icon: <Heart size={14}/>, desc: 'Dias perdidos por CID, mês e tipo' },
      { id: 'epis-vencidos', label: 'EPIs Vencidos/a Vencer', icon: <HardHat size={14}/>, desc: 'EPIs vencidos ou com vencimento próximo' },
    ]
  },
  {
    id: 'financeiro', label: 'Financeiro', icon: <DollarSign size={16}/>, color: '#166534',
    items: [
      { id: 'resumo-folha', label: 'Resumo de Folha', icon: <FileText size={14}/>, desc: 'Bruto, descontos e líquido por mês/obra' },
      { id: 'provisoes', label: 'Provisões Acumuladas', icon: <Calculator size={14}/>, desc: 'FGTS + Férias + 13º provisionados' },
      { id: 'adiantamentos-aberto', label: 'Adiantamentos em Aberto', icon: <DollarSign size={14}/>, desc: 'Adiantamentos sem quitação por colaborador' },
      { id: 'custo-hora', label: 'Custo Hora Médio', icon: <Clock size={14}/>, desc: 'Custo por hora por função, obra e período' },
    ]
  },
  {
    id: 'operacional', label: 'Operacional', icon: <FileText size={16}/>, color: '#0369a1',
    items: [
      { id: 'aniversariantes', label: 'Aniversariantes do Mês', icon: <Calendar size={14}/>, desc: 'Colaboradores aniversariantes no mês selecionado' },
      { id: 'contratos-vencendo', label: 'Contratos Vencendo', icon: <AlertTriangle size={14}/>, desc: 'Contratos próximos do vencimento' },
      { id: 'playbook-atividades', label: 'Playbook de Atividades', icon: <Package size={14}/>, desc: 'Atividades cadastradas por obra com preço e unidade' },
      { id: 'historico-advertencias', label: 'Histórico de Advertências', icon: <FileText size={14}/>, desc: 'Advertências com filtro tipo, assinatura e período' },
    ]
  },
]

// ─── Componentes auxiliares ───────────────────────────────────────────────────

function EmptyState({ msg = 'Nenhum resultado encontrado.' }: { msg?: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-gray-400 gap-3">
      <Search size={40} className="opacity-30" />
      <p className="text-sm">{msg}</p>
    </div>
  )
}

function LoadingState() {
  return (
    <div className="flex items-center justify-center py-16 text-[#1e3a5f] gap-2">
      <Loader2 size={24} className="animate-spin" />
      <span className="text-sm font-medium">Carregando dados...</span>
    </div>
  )
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <h3 className="text-sm font-semibold text-[#1e3a5f] border-b border-slate-200 pb-2 mb-3 flex items-center gap-2">
      <Filter size={13} /> {children}
    </h3>
  )
}

function FilterRow({ children }: { children: React.ReactNode }) {
  return <div className="flex flex-wrap gap-4 items-end mb-4">{children}</div>
}

function FieldWrap({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1 min-w-[160px]">
      <Label className="text-xs text-gray-500 font-medium">{label}</Label>
      {children}
    </div>
  )
}

// ─── Componente principal ─────────────────────────────────────────────────────

export default function Relatorios() {
  const [grupoAberto, setGrupoAberto] = useState<string>('obra')
  const [relatAtivo, setRelatAtivo] = useState<string>('headcount-obra')
  const [obras, setObras] = useState<Obra[]>([])
  const [colaboradores, setColaboradores] = useState<Colaborador[]>([])
  const [funcoes, setFuncoes] = useState<Funcao[]>([])

  // Filtros globais compartilhados
  const [filtroObra, setFiltroObra] = useState('todos')
  const [filtroColaborador, setFiltroColaborador] = useState('todos')
  const [filtroFuncao, setFiltroFuncao] = useState('todos')
  const [filtroDataIni, setFiltroDataIni] = useState(primeiroDiaMes)
  const [filtroDataFim, setFiltroDataFim] = useState(hoje)
  const [diasVencimento, setDiasVencimento] = useState('30')

  // Estado de dados
  const [dados, setDados] = useState<Record<string, unknown>[]>([])
  const [loading, setLoading] = useState(false)
  const [gerado, setGerado] = useState(false)

  useEffect(() => {
    Promise.all([
      supabase.from('obras').select('id,nome,codigo,status').order('nome'),
      supabase.from('colaboradores').select('id,nome,chapa').eq('status', 'ativo').order('nome'),
      supabase.from('funcoes').select('id,nome,categoria').order('nome'),
    ]).then(([obrasRes, colabRes, funcRes]) => {
      setObras(obrasRes.data ?? [])
      setColaboradores(colabRes.data ?? [])
      setFuncoes(funcRes.data ?? [])
    })
  }, [])

  // Reseta dados ao trocar relatório
  useEffect(() => {
    setDados([]); setGerado(false)
  }, [relatAtivo])

  // Derivados de data → mês (YYYY-MM) para tabelas sem data exata
  const mesRefIni = filtroDataIni.substring(0, 7)
  const mesRefFim = filtroDataFim.substring(0, 7)
  const mesRef = mesRefIni   // relatórios de mês único usam o mês inicial

  // ── Gerar relatório ──────────────────────────────────────────────────────────

  const gerarRelatorio = useCallback(async () => {
    setLoading(true)
    setGerado(false)
    try {
      let resultado: Record<string, unknown>[] = []

      // ── 1. Headcount por Obra ──────────────────────────────────────────────
      if (relatAtivo === 'headcount-obra') {
        const { data } = await supabase
          .from('colaboradores')
          .select(`id, status, tipo_contrato, obra_id, obras(nome, codigo)`)
          .order('status')
        if (data) {
          const map: Record<string, Record<string, unknown>> = {}
          for (const c of data) {
            const o = (c as Record<string, unknown>).obras as Record<string, unknown> | null
            const obraId = String((c as Record<string, unknown>).obra_id ?? 'sem-obra')
            const obraNome = o ? String(o.nome) : '(Sem Obra)'
            if (!map[obraId]) map[obraId] = { obra: obraNome, ativo: 0, inativo: 0, afastado: 0, total: 0, tipos: {} as Record<string, number> }
            const status = String((c as Record<string, unknown>).status ?? 'inativo')
            if (status === 'ativo') (map[obraId].ativo as number)++
            else if (status === 'afastado') (map[obraId].afastado as number)++
            else (map[obraId].inativo as number)++
            ;(map[obraId].total as number)++
            const tipo = String((c as Record<string, unknown>).tipo_contrato ?? 'N/D')
            const tipos = map[obraId].tipos as Record<string, number>
            tipos[tipo] = (tipos[tipo] ?? 0) + 1
          }
          resultado = Object.values(map).sort((a, b) => (b.total as number) - (a.total as number))
        }
      }

      // ── 2. Custo Total por Obra ────────────────────────────────────────────
      else if (relatAtivo === 'custo-obra') {
        // snap_bruto não existe — usar snap_valor_total; adiantamentos status='pago' no banco
        const q = supabase.from('ponto_lancamentos')
          .select(`obra_id, snap_valor_total, snap_liquido, obras(nome)`)
          .gte('mes_referencia', mesRefIni)
          .lte('mes_referencia', mesRefFim)
        const { data: pl } = await q
        const { data: ad } = await supabase.from('adiantamentos')
          .select(`colaborador_id, valor, colaboradores(obra_id)`)
          .gte('competencia', mesRefIni).lte('competencia', mesRefFim).in('status', ['aprovado', 'pago'])
        const { data: vt } = await supabase.from('vale_transporte')
          .select(`colaborador_id, valor_empresa, colaboradores(obra_id)`)
          .gte('competencia', mesRefIni).lte('competencia', mesRefFim)
        const { data: pr } = await supabase.from('premios')
          .select(`colaborador_id, valor, colaboradores(obra_id)`)
          .gte('competencia', mesRefIni).lte('competencia', mesRefFim).in('status', ['aprovado', 'pago'])

        const map: Record<string, Record<string, unknown>> = {}
        const get = (oId: string, nome: string) => {
          if (!map[oId]) map[oId] = { obra: nome, folha_bruto: 0, folha_liquido: 0, adiantamentos: 0, vt: 0, premios: 0, total: 0 }
          return map[oId]
        }
        for (const p of pl ?? []) {
          const o = (p as Record<string, unknown>).obras as Record<string, unknown> | null
          const id = String((p as Record<string, unknown>).obra_id ?? 'sem')
          const row = get(id, o ? String(o.nome) : '(Sem Obra)')
          row.folha_bruto = (row.folha_bruto as number) + ((p as Record<string, unknown>).snap_valor_total as number ?? 0)
          row.folha_liquido = (row.folha_liquido as number) + ((p as Record<string, unknown>).snap_liquido as number ?? 0)
        }
        for (const a of ad ?? []) {
          const c = (a as Record<string, unknown>).colaboradores as Record<string, unknown> | null
          const id = String((c as Record<string, unknown>)?.obra_id ?? 'sem')
          if (map[id]) map[id].adiantamentos = (map[id].adiantamentos as number) + ((a as Record<string, unknown>).valor as number ?? 0)
        }
        for (const v of vt ?? []) {
          const c = (v as Record<string, unknown>).colaboradores as Record<string, unknown> | null
          const id = String((c as Record<string, unknown>)?.obra_id ?? 'sem')
          if (map[id]) map[id].vt = (map[id].vt as number) + ((v as Record<string, unknown>).valor_empresa as number ?? 0)
        }
        for (const p of pr ?? []) {
          const c = (p as Record<string, unknown>).colaboradores as Record<string, unknown> | null
          const id = String((c as Record<string, unknown>)?.obra_id ?? 'sem')
          if (map[id]) map[id].premios = (map[id].premios as number) + ((p as Record<string, unknown>).valor as number ?? 0)
        }
        resultado = Object.values(map).map(r => ({
          ...r,
          total: (r.folha_bruto as number) + (r.adiantamentos as number) + (r.vt as number) + (r.premios as number)
        })).sort((a, b) => (b.total as number) - (a.total as number))
      }

      // ── 3. Produtividade por Obra ─────────────────────────────────────────
      else if (relatAtivo === 'producao-obra') {
        // ponto_producao não tem coluna 'data' — filtrar por mes_referencia; FK é playbook_item_id
        const q = supabase.from('ponto_producao')
          .select(`obra_id, quantidade, playbook_itens!playbook_item_id(descricao, unidade, preco_unitario), obras(nome)`)
          .gte('mes_referencia', mesRefIni)
          .lte('mes_referencia', mesRefFim)
        if (filtroObra !== 'todos') q.eq('obra_id', filtroObra)
        const { data } = await q
        const map: Record<string, Record<string, unknown>> = {}
        for (const d of data ?? []) {
          const pb = (d as Record<string, unknown>).playbook_itens as Record<string, unknown> | null
          const o = (d as Record<string, unknown>).obras as Record<string, unknown> | null
          const key = `${(d as Record<string, unknown>).obra_id}-${pb?.descricao}`
          if (!map[key]) map[key] = {
            obra: o ? String(o.nome) : '—',
            descricao: pb ? String(pb.descricao) : '—',
            unidade: pb ? String(pb.unidade) : '—',
            preco_unitario: pb ? Number(pb.preco_unitario ?? 0) : 0,
            quantidade: 0, custo_total: 0,
          }
          map[key].quantidade = (map[key].quantidade as number) + Number((d as Record<string, unknown>).quantidade ?? 0)
          map[key].custo_total = (map[key].custo_total as number) + (Number((d as Record<string, unknown>).quantidade ?? 0) * Number(pb?.preco_unitario ?? 0))
        }
        resultado = Object.values(map).sort((a, b) => (b.custo_total as number) - (a.custo_total as number))
      }

      // ── 4. Faltas por Obra ───────────────────────────────────────────────
      else if (relatAtivo === 'faltas-obra') {
        // colaboradores = IDs únicos por obra
        const q = supabase.from('ponto_lancamentos')
          .select(`colaborador_id, obra_id, snap_faltas, snap_horas_normais, snap_horas_extras, obras(nome)`)
          .eq('mes_referencia', mesRef)
        if (filtroObra !== 'todos') q.eq('obra_id', filtroObra)
        const { data } = await q
        const map: Record<string, Record<string, unknown>> = {}
        const mapColabs: Record<string, Set<string>> = {}
        for (const d of data ?? []) {
          const o = (d as Record<string, unknown>).obras as Record<string, unknown> | null
          const id = String((d as Record<string, unknown>).obra_id ?? 'sem')
          if (!map[id]) { map[id] = { obra: o ? String(o.nome) : '—', faltas: 0, horas: 0, horas_extras: 0, colaboradores: 0 }; mapColabs[id] = new Set() }
          map[id].faltas = (map[id].faltas as number) + Number((d as Record<string, unknown>).snap_faltas ?? 0)
          map[id].horas = (map[id].horas as number) + Number((d as Record<string, unknown>).snap_horas_normais ?? 0)
          map[id].horas_extras = (map[id].horas_extras as number) + Number((d as Record<string, unknown>).snap_horas_extras ?? 0)
          mapColabs[id].add(String((d as Record<string, unknown>).colaborador_id))
        }
        resultado = Object.entries(map).map(([id, r]) => {
          const horasTotal = (r.horas as number) + (r.horas_extras as number)
          return {
            ...r,
            colaboradores: mapColabs[id]?.size ?? 0,
            horas_total: horasTotal,
            pct_ausencia: horasTotal ? (((r.faltas as number) * 8 / (horasTotal + (r.faltas as number) * 8)) * 100).toFixed(1) : '0.0'
          }
        }).sort((a, b) => (b.faltas as number) - (a.faltas as number))
      }

      // ── 5. Acidentes por Obra ────────────────────────────────────────────
      else if (relatAtivo === 'acidentes-obra') {
        const q = supabase.from('acidentes')
          .select(`obra_id, tipo, gravidade, cat_emitida, obras(nome)`)
          .gte('data_ocorrencia', filtroDataIni)
          .lte('data_ocorrencia', filtroDataFim)
        if (filtroObra !== 'todos') q.eq('obra_id', filtroObra)
        const { data } = await q
        const map: Record<string, Record<string, unknown>> = {}
        for (const d of data ?? []) {
          const o = (d as Record<string, unknown>).obras as Record<string, unknown> | null
          const id = String((d as Record<string, unknown>).obra_id ?? 'sem')
          if (!map[id]) map[id] = { obra: o ? String(o.nome) : '—', total: 0, leve: 0, grave: 0, fatal: 0, cat: 0 }
          map[id].total = (map[id].total as number) + 1
          const grav = String((d as Record<string, unknown>).gravidade ?? '').toLowerCase()
          if (grav === 'grave') map[id].grave = (map[id].grave as number) + 1
          else if (grav === 'fatal') map[id].fatal = (map[id].fatal as number) + 1
          else map[id].leve = (map[id].leve as number) + 1
          if ((d as Record<string, unknown>).cat_emitida) map[id].cat = (map[id].cat as number) + 1
        }
        resultado = Object.values(map).sort((a, b) => (b.total as number) - (a.total as number))
      }

      // ── 6. Ficha Financeira Individual ───────────────────────────────────
      else if (relatAtivo === 'ficha-financeira') {
        if (filtroColaborador === 'todos') { toast.warning('Selecione um colaborador.'); setLoading(false); return }
        // inclui horas normais + extras na ficha
        const { data: pl } = await supabase.from('ponto_lancamentos')
          .select('mes_referencia, snap_valor_total, snap_liquido, snap_inss, snap_ir, snap_desconto_vt, snap_desconto_adiant, snap_valor_premio, snap_horas_normais, snap_horas_extras, snap_faltas')
          .eq('colaborador_id', filtroColaborador)
          .gte('mes_referencia', mesRefIni).lte('mes_referencia', mesRefFim)
          .order('mes_referencia')
        const { data: ad } = await supabase.from('adiantamentos')
          .select('competencia, tipo, valor, status')
          .eq('colaborador_id', filtroColaborador)
          .gte('competencia', mesRefIni).lte('competencia', mesRefFim)
        const { data: vt } = await supabase.from('vale_transporte')
          .select('competencia, tipo, valor, valor_empresa')
          .eq('colaborador_id', filtroColaborador)
          .gte('competencia', mesRefIni).lte('competencia', mesRefFim)
        const { data: pr } = await supabase.from('premios')
          .select('competencia, tipo, descricao, valor')
          .eq('colaborador_id', filtroColaborador)
          .gte('competencia', mesRefIni).lte('competencia', mesRefFim)

        const meses: Record<string, Record<string, unknown>> = {}
        const mk = (m: string) => { if (!meses[m]) meses[m] = { mes: m, bruto: 0, liquido: 0, inss: 0, ir: 0, vt_desc: 0, ad_desc: 0, premio: 0, adiantamentos: 0, vt_empresa: 0, horas_normais: 0, horas_extras: 0, faltas: 0 }; return meses[m] }
        for (const p of pl ?? []) { const r = mk(p.mes_referencia); r.bruto = Number(p.snap_valor_total ?? 0); r.liquido = Number(p.snap_liquido ?? 0); r.inss = Number(p.snap_inss ?? 0); r.ir = Number(p.snap_ir ?? 0); r.vt_desc = Number(p.snap_desconto_vt ?? 0); r.ad_desc = Number(p.snap_desconto_adiant ?? 0); r.premio = Number(p.snap_valor_premio ?? 0); r.horas_normais = Number(p.snap_horas_normais ?? 0); r.horas_extras = Number(p.snap_horas_extras ?? 0); r.faltas = Number(p.snap_faltas ?? 0) }
        for (const a of ad ?? []) { const r = mk(a.competencia); r.adiantamentos = (r.adiantamentos as number) + Number(a.valor ?? 0) }
        for (const v of vt ?? []) { const r = mk(v.competencia); r.vt_empresa = (r.vt_empresa as number) + Number(v.valor_empresa ?? 0) }
        resultado = Object.values(meses).map(r => ({ ...r, horas_total: (r.horas_normais as number) + (r.horas_extras as number) })).sort((a, b) => String(a.mes).localeCompare(String(b.mes)))
      }

      // ── 7. Histórico de Ponto ─────────────────────────────────────────────
      else if (relatAtivo === 'historico-ponto') {
        if (filtroColaborador === 'todos') { toast.warning('Selecione um colaborador.'); setLoading(false); return }
        const { data } = await supabase.from('registro_ponto')
          .select('data, presente, falta, hora_entrada, saida_almoco, retorno_almoco, hora_saida, horas_trabalhadas, horas_extras, justificativa, status')
          .eq('colaborador_id', filtroColaborador)
          .gte('data', filtroDataIni)
          .lte('data', filtroDataFim)
          .order('data')
        resultado = (data ?? []) as Record<string, unknown>[]
      }

      // ── 8. Produção Individual ────────────────────────────────────────────
      else if (relatAtivo === 'producao-individual') {
        if (filtroColaborador === 'todos') { toast.warning('Selecione um colaborador.'); setLoading(false); return }
        // ponto_producao: sem coluna 'data', filtrar por mes_referencia; FK playbook_item_id
        const { data } = await supabase.from('ponto_producao')
          .select('mes_referencia, quantidade, observacoes, playbook_itens!playbook_item_id(descricao, unidade, preco_unitario), obras(nome)')
          .eq('colaborador_id', filtroColaborador)
          .gte('mes_referencia', mesRefIni)
          .lte('mes_referencia', mesRefFim)
          .order('mes_referencia')
        const map: Record<string, Record<string, unknown>> = {}
        for (const d of data ?? []) {
          const pb = (d as Record<string, unknown>).playbook_itens as Record<string, unknown> | null
          const key = String(pb?.descricao ?? 'N/D')
          if (!map[key]) map[key] = { descricao: key, unidade: pb?.unidade ?? '—', preco_unit: Number(pb?.preco_unitario ?? 0), quantidade: 0, total: 0 }
          map[key].quantidade = (map[key].quantidade as number) + Number((d as Record<string, unknown>).quantidade ?? 0)
          map[key].total = (map[key].total as number) + (Number((d as Record<string, unknown>).quantidade ?? 0) * Number(pb?.preco_unitario ?? 0))
        }
        resultado = Object.values(map).sort((a, b) => (b.total as number) - (a.total as number))
      }

      // ── 9. Ocorrências do Colaborador ────────────────────────────────────
      else if (relatAtivo === 'ocorrencias-colab') {
        if (filtroColaborador === 'todos') { toast.warning('Selecione um colaborador.'); setLoading(false); return }
        const cid = filtroColaborador
        const [oRes, adRes, atRes, acRes] = await Promise.all([
          supabase.from('ocorrencias').select('data,tipo,descricao,gravidade,status').eq('colaborador_id', cid).order('data', { ascending: false }),
          supabase.from('advertencias').select('data_advertencia,tipo,motivo,dias_suspensao,assinada').eq('colaborador_id', cid).order('data_advertencia', { ascending: false }),
          supabase.from('atestados').select('data,tipo,dias_afastamento,cid,medico,status').eq('colaborador_id', cid).order('data', { ascending: false }),
          supabase.from('acidentes').select('data_ocorrencia,tipo,gravidade,cat_emitida,status').eq('colaborador_id', cid).order('data_ocorrencia', { ascending: false }),
        ])
        const linha = (tipo: string, data: string | null, desc: string, extra: string, status: string) => ({ tipo, data: data ?? '—', descricao: desc, extra, status })
        resultado = [
          ...(oRes.data ?? []).map(r => linha('Ocorrência', r.data, r.descricao ?? '—', `Gravidade: ${r.gravidade ?? '—'}`, r.status ?? '—')),
          ...(adRes.data ?? []).map(r => linha('Advertência', r.data_advertencia, r.motivo ?? '—', r.tipo ?? '—', r.assinada ? 'Assinada' : 'Não assinada')),
          ...(atRes.data ?? []).map(r => linha('Atestado', r.data, `${r.dias_afastamento ?? 0} dia(s) — CID: ${r.cid ?? '—'}`, r.medico ?? '—', r.status ?? '—')),
          ...(acRes.data ?? []).map(r => linha('Acidente', r.data_ocorrencia, r.tipo ?? '—', `Gravidade: ${r.gravidade ?? '—'} | CAT: ${r.cat_emitida ? 'Sim' : 'Não'}`, r.status ?? '—')),
        ].sort((a, b) => String(b.data).localeCompare(String(a.data)))
      }

      // ── 10. Custo Total do Colaborador ────────────────────────────────────
      else if (relatAtivo === 'custo-colab') {
        if (filtroColaborador === 'todos') { toast.warning('Selecione um colaborador.'); setLoading(false); return }
        const cid = filtroColaborador
        // snap_bruto→snap_valor_total
        const [pl, ad, vt, pr] = await Promise.all([
          supabase.from('ponto_lancamentos').select('mes_referencia,snap_valor_total').eq('colaborador_id', cid).gte('mes_referencia', mesRefIni).lte('mes_referencia', mesRefFim),
          supabase.from('adiantamentos').select('competencia,valor').eq('colaborador_id', cid).gte('competencia', mesRefIni).lte('competencia', mesRefFim),
          supabase.from('vale_transporte').select('competencia,valor_empresa').eq('colaborador_id', cid).gte('competencia', mesRefIni).lte('competencia', mesRefFim),
          supabase.from('premios').select('competencia,valor').eq('colaborador_id', cid).gte('competencia', mesRefIni).lte('competencia', mesRefFim),
        ])
        const map: Record<string, Record<string, unknown>> = {}
        const mk = (m: string) => { if (!map[m]) map[m] = { mes: m, folha_bruta: 0, adiantamentos: 0, vt_empresa: 0, premios: 0, total: 0 }; return map[m] }
        for (const p of pl.data ?? []) { const r = mk(p.mes_referencia); r.folha_bruta = Number(p.snap_valor_total ?? 0) }
        for (const a of ad.data ?? []) { const r = mk(a.competencia); r.adiantamentos = (r.adiantamentos as number) + Number(a.valor ?? 0) }
        for (const v of vt.data ?? []) { const r = mk(v.competencia); r.vt_empresa = (r.vt_empresa as number) + Number(v.valor_empresa ?? 0) }
        for (const p of pr.data ?? []) { const r = mk(p.competencia); r.premios = (r.premios as number) + Number(p.valor ?? 0) }
        resultado = Object.values(map).map(r => ({ ...r, total: (r.folha_bruta as number) + (r.adiantamentos as number) + (r.vt_empresa as number) + (r.premios as number) })).sort((a, b) => String(a.mes).localeCompare(String(b.mes)))
      }

      // ── 11. Headcount por Função ──────────────────────────────────────────
      else if (relatAtivo === 'headcount-funcao') {
        const { data } = await supabase.from('colaboradores')
          .select('funcao_id, salario, tipo_contrato, status, funcoes(nome, categoria)')
          .eq('status', 'ativo')
        const map: Record<string, Record<string, unknown>> = {}
        for (const c of data ?? []) {
          const f = (c as Record<string, unknown>).funcoes as Record<string, unknown> | null
          const id = String((c as Record<string, unknown>).funcao_id ?? 'sem')
          const nome = f ? String(f.nome) : '(Sem Função)'
          if (!map[id]) map[id] = { funcao: nome, categoria: f ? String(f.categoria ?? '—') : '—', total: 0, clt: 0, pj: 0, menor: 0, salario_total: 0, salario_medio: 0 }
          map[id].total = (map[id].total as number) + 1
          const tipo = String((c as Record<string, unknown>).tipo_contrato ?? '').toLowerCase()
          if (tipo.includes('clt')) map[id].clt = (map[id].clt as number) + 1
          else if (tipo.includes('pj')) map[id].pj = (map[id].pj as number) + 1
          map[id].salario_total = (map[id].salario_total as number) + Number((c as Record<string, unknown>).salario ?? 0)
        }
        resultado = Object.values(map).map(r => ({
          ...r, salario_medio: r.total ? (r.salario_total as number) / (r.total as number) : 0
        })).sort((a, b) => (b.total as number) - (a.total as number))
      }

      // ── 12. Custo por Função ──────────────────────────────────────────────
      else if (relatAtivo === 'custo-funcao') {
        // contar colabs_ids únicos por função (um colab em 2 obras = 2 lançamentos, mas 1 colab)
        const { data } = await supabase.from('ponto_lancamentos')
          .select('colaborador_id, snap_valor_total, snap_liquido, colaboradores(funcao_id, funcoes(nome))')
          .eq('mes_referencia', mesRef)
        const map: Record<string, Record<string, unknown>> = {}
        const mapColabs: Record<string, Set<string>> = {}
        for (const d of data ?? []) {
          const colab = (d as Record<string, unknown>).colaboradores as Record<string, unknown> | null
          const func = colab ? (colab.funcoes as Record<string, unknown> | null) : null
          const nome = func ? String(func.nome) : '(Sem Função)'
          if (!map[nome]) { map[nome] = { funcao: nome, bruto: 0, liquido: 0, colaboradores: 0 }; mapColabs[nome] = new Set() }
          map[nome].bruto = (map[nome].bruto as number) + Number((d as Record<string, unknown>).snap_valor_total ?? 0)
          map[nome].liquido = (map[nome].liquido as number) + Number((d as Record<string, unknown>).snap_liquido ?? 0)
          mapColabs[nome].add(String((d as Record<string, unknown>).colaborador_id))
        }
        resultado = Object.values(map).map(r => ({ ...r, colaboradores: mapColabs[String(r.funcao)]?.size ?? 0 })).sort((a, b) => (b.bruto as number) - (a.bruto as number))
      }

      // ── 13. Produtividade por Função ──────────────────────────────────────
      else if (relatAtivo === 'producao-funcao') {
        // ponto_producao: filtrar por mes_referencia (sem coluna 'data')
        const { data } = await supabase.from('ponto_producao')
          .select('quantidade, colaboradores(funcao_id, funcoes(nome, categoria))')
          .gte('mes_referencia', mesRefIni)
          .lte('mes_referencia', mesRefFim)
        const map: Record<string, Record<string, unknown>> = {}
        for (const d of data ?? []) {
          const colab = (d as Record<string, unknown>).colaboradores as Record<string, unknown> | null
          const func = colab ? (colab.funcoes as Record<string, unknown> | null) : null
          const nome = func ? String(func.nome) : '(Sem Função)'
          const cat = func ? String((func as Record<string, unknown>).categoria ?? '—') : '—'
          if (!map[nome]) map[nome] = { funcao: nome, categoria: cat, total: 0, lancamentos: 0, media: 0 }
          map[nome].total = (map[nome].total as number) + Number((d as Record<string, unknown>).quantidade ?? 0)
          map[nome].lancamentos = (map[nome].lancamentos as number) + 1
        }
        resultado = Object.values(map).map(r => ({
          ...r, media: r.lancamentos ? ((r.total as number) / (r.lancamentos as number)) : 0
        })).sort((a, b) => (b.total as number) - (a.total as number))
      }

      // ── 14. Ranking de Produção ───────────────────────────────────────────
      else if (relatAtivo === 'ranking-producao') {
        // ponto_producao: filtrar por mes_referencia; FK playbook_item_id
        const q = supabase.from('ponto_producao')
          .select('colaborador_id, quantidade, playbook_itens!playbook_item_id(preco_unitario), colaboradores(nome, chapa, funcoes(nome))')
          .gte('mes_referencia', mesRefIni)
          .lte('mes_referencia', mesRefFim)
        if (filtroObra !== 'todos') q.eq('obra_id', filtroObra)
        const { data } = await q
        const map: Record<string, Record<string, unknown>> = {}
        for (const d of data ?? []) {
          const colab = (d as Record<string, unknown>).colaboradores as Record<string, unknown> | null
          const pb = (d as Record<string, unknown>).playbook_itens as Record<string, unknown> | null
          const id = String((d as Record<string, unknown>).colaborador_id)
          const func = colab ? (colab.funcoes as Record<string, unknown> | null) : null
          if (!map[id]) map[id] = { colaborador: colab ? String(colab.nome) : '—', chapa: colab ? String(colab.chapa ?? '—') : '—', funcao: func ? String(func.nome) : '—', total_qtd: 0, total_valor: 0 }
          map[id].total_qtd = (map[id].total_qtd as number) + Number((d as Record<string, unknown>).quantidade ?? 0)
          map[id].total_valor = (map[id].total_valor as number) + (Number((d as Record<string, unknown>).quantidade ?? 0) * Number(pb?.preco_unitario ?? 0))
        }
        resultado = Object.values(map).sort((a, b) => (b.total_valor as number) - (a.total_valor as number)).map((r, i) => ({ posicao: i + 1, ...r }))
      }

      // ── 15. Produção por Item Playbook ────────────────────────────────────
      else if (relatAtivo === 'producao-playbook') {
        // ponto_producao: filtrar por mes_referencia; FK playbook_item_id
        const q = supabase.from('ponto_producao')
          .select('quantidade, colaborador_id, obra_id, playbook_itens!playbook_item_id(id, descricao, unidade, preco_unitario, categoria), obras(nome)')
          .gte('mes_referencia', mesRefIni)
          .lte('mes_referencia', mesRefFim)
        if (filtroObra !== 'todos') q.eq('obra_id', filtroObra)
        const { data } = await q
        const mapPB: Record<string, Record<string, unknown>> = {}
        const colaboradoresPorItem: Record<string, Set<string>> = {}
        const todosColabIds = new Set<string>()
        for (const d of data ?? []) {
          const pb = (d as Record<string, unknown>).playbook_itens as Record<string, unknown> | null
          const key = String(pb?.id ?? 'sem')
          const colabId = String((d as Record<string, unknown>).colaborador_id ?? '')
          if (!mapPB[key]) {
            mapPB[key] = { descricao: pb?.descricao ?? '—', unidade: pb?.unidade ?? '—', categoria: pb?.categoria ?? '—', preco: Number(pb?.preco_unitario ?? 0), qtd: 0, total: 0, lancamentos: 0, horas_totais: 0, coeficiente: 0 }
            colaboradoresPorItem[key] = new Set()
          }
          mapPB[key].qtd = (mapPB[key].qtd as number) + Number((d as Record<string, unknown>).quantidade ?? 0)
          mapPB[key].total = (mapPB[key].total as number) + (Number((d as Record<string, unknown>).quantidade ?? 0) * Number(pb?.preco_unitario ?? 0))
          mapPB[key].lancamentos = (mapPB[key].lancamentos as number) + 1
          if (colabId) { colaboradoresPorItem[key].add(colabId); todosColabIds.add(colabId) }
        }
        // Buscar horas dos colaboradores únicos no período
        if (todosColabIds.size > 0) {
          const qHoras = supabase.from('ponto_lancamentos')
            .select('colaborador_id, snap_horas_normais, snap_horas_extras')
            .gte('mes_referencia', mesRefIni)
            .lte('mes_referencia', mesRefFim)
            .in('colaborador_id', Array.from(todosColabIds))
          if (filtroObra !== 'todos') qHoras.eq('obra_id', filtroObra)
          const { data: horasData } = await qHoras
          // mapa colaborador_id → horas totais
          const horasPorColab: Record<string, number> = {}
          for (const h of horasData ?? []) {
            const hid = String((h as Record<string, unknown>).colaborador_id)
            horasPorColab[hid] = (horasPorColab[hid] ?? 0)
              + Number((h as Record<string, unknown>).snap_horas_normais ?? 0)
              + Number((h as Record<string, unknown>).snap_horas_extras ?? 0)
          }
          // Calcular horas_totais e coeficiente por item
          for (const [key, colabSet] of Object.entries(colaboradoresPorItem)) {
            const hTotal = Array.from(colabSet).reduce((acc, cid) => acc + (horasPorColab[cid] ?? 0), 0)
            mapPB[key].horas_totais = hTotal
            const qtdItem = mapPB[key].qtd as number
            mapPB[key].coeficiente = hTotal > 0 ? qtdItem / hTotal : 0
          }
        }
        resultado = Object.values(mapPB).sort((a, b) => (b.total as number) - (a.total as number))
      }

      // ── 16. Meta vs Realizado ─────────────────────────────────────────────
      else if (relatAtivo === 'meta-realizado') {
        // horas realizadas = normais + extras; agrupa por colaborador (pode ter múltiplos lançamentos por obras diferentes)
        const q = supabase.from('ponto_lancamentos')
          .select('colaborador_id, snap_horas_normais, snap_horas_extras, snap_faltas, colaboradores(nome, salario, funcoes(nome)), obras(nome)')
          .gte('mes_referencia', mesRefIni)
          .lte('mes_referencia', mesRefFim)
        if (filtroObra !== 'todos') q.eq('obra_id', filtroObra)
        const { data } = await q
        // Agrupa por colaborador_id somando horas de todos os lançamentos do período
        const mapMR: Record<string, Record<string, unknown>> = {}
        for (const d of data ?? []) {
          const cid = String((d as Record<string, unknown>).colaborador_id)
          const colab = (d as Record<string, unknown>).colaboradores as Record<string, unknown> | null
          const func = colab ? (colab.funcoes as Record<string, unknown> | null) : null
          if (!mapMR[cid]) {
            mapMR[cid] = {
              colaborador: colab ? String(colab.nome) : '—',
              funcao: func ? String(func.nome) : '—',
              salario: Number(colab?.salario ?? 0),
              horas_normais: 0, horas_extras: 0, faltas: 0,
            }
          }
          mapMR[cid].horas_normais = (mapMR[cid].horas_normais as number) + Number((d as Record<string, unknown>).snap_horas_normais ?? 0)
          mapMR[cid].horas_extras  = (mapMR[cid].horas_extras  as number) + Number((d as Record<string, unknown>).snap_horas_extras  ?? 0)
          mapMR[cid].faltas        = (mapMR[cid].faltas        as number) + Number((d as Record<string, unknown>).snap_faltas        ?? 0)
        }
        const metaHoras = 220
        resultado = Object.values(mapMR).map(r => {
          const horas = (r.horas_normais as number) + (r.horas_extras as number)
          const salario = r.salario as number
          return {
            colaborador: r.colaborador,
            funcao: r.funcao,
            meta_horas: metaHoras,
            horas_normais: r.horas_normais,
            horas_extras: r.horas_extras,
            horas_realizadas: horas,
            faltas: r.faltas,
            diferenca: horas - metaHoras,
            pct_atingido: metaHoras > 0 ? ((horas / metaHoras) * 100).toFixed(1) : '0.0',
            custo_hora: salario > 0 && horas > 0 ? salario / horas : 0,
          }
        }).sort((a, b) => Number(a.pct_atingido) - Number(b.pct_atingido))
      }

      // ── 17. Evolução de Horas ─────────────────────────────────────────────
      else if (relatAtivo === 'evolucao-horas') {
        // colaboradores = IDs únicos por mês
        const q = supabase.from('ponto_lancamentos')
          .select('colaborador_id, mes_referencia, snap_horas_normais, snap_horas_extras, snap_faltas, obra_id')
          .gte('mes_referencia', mesRefIni).lte('mes_referencia', mesRefFim)
        if (filtroObra !== 'todos') q.eq('obra_id', filtroObra)
        const { data } = await q
        const map: Record<string, Record<string, unknown>> = {}
        const mapColabs: Record<string, Set<string>> = {}
        for (const d of data ?? []) {
          const m = String((d as Record<string, unknown>).mes_referencia)
          if (!map[m]) { map[m] = { mes: m, horas_normais: 0, horas_extras: 0, horas: 0, faltas: 0, colaboradores: 0 }; mapColabs[m] = new Set() }
          map[m].horas_normais = (map[m].horas_normais as number) + Number((d as Record<string, unknown>).snap_horas_normais ?? 0)
          map[m].horas_extras = (map[m].horas_extras as number) + Number((d as Record<string, unknown>).snap_horas_extras ?? 0)
          map[m].faltas = (map[m].faltas as number) + Number((d as Record<string, unknown>).snap_faltas ?? 0)
          mapColabs[m].add(String((d as Record<string, unknown>).colaborador_id))
        }
        resultado = Object.values(map).map(r => ({ ...r, horas: (r.horas_normais as number) + (r.horas_extras as number), colaboradores: mapColabs[String(r.mes)]?.size ?? 0 })).sort((a, b) => String(a.mes).localeCompare(String(b.mes)))
      }

      // ── Coeficiente de Produção ───────────────────────────────────────────
      else if (relatAtivo === 'coeficiente-producao') {
        const qProd = supabase.from('ponto_producao')
          .select('colaborador_id, quantidade, valor_total, mes_referencia, playbook_itens!playbook_item_id(id, descricao, unidade, categoria, preco_unitario), colaboradores(nome, funcoes(nome))')
          .gte('mes_referencia', mesRefIni)
          .lte('mes_referencia', mesRefFim)
        if (filtroObra !== 'todos') qProd.eq('obra_id', filtroObra)
        const { data: prodData } = await qProd

        const qHoras = supabase.from('ponto_lancamentos')
          .select('colaborador_id, snap_horas_normais, snap_horas_extras')
          .gte('mes_referencia', mesRefIni)
          .lte('mes_referencia', mesRefFim)
        if (filtroObra !== 'todos') qHoras.eq('obra_id', filtroObra)
        const { data: horasData } = await qHoras

        const horasPorColab: Record<string, number> = {}
        for (const h of horasData ?? []) {
          horasPorColab[h.colaborador_id] = (horasPorColab[h.colaborador_id] ?? 0) + Number(h.snap_horas_normais ?? 0) + Number(h.snap_horas_extras ?? 0)
        }

        const map: Record<string, Record<string, unknown>> = {}
        const colabsMap: Record<string, Set<string>> = {}

        for (const d of prodData ?? []) {
          const pb = (d as Record<string,unknown>).playbook_itens as Record<string,unknown> | null
          const colab = (d as Record<string,unknown>).colaboradores as Record<string,unknown> | null
          const func = colab ? (colab.funcoes as Record<string,unknown> | null) : null
          const itemId = String(pb?.id ?? 'sem')
          const funcaoNome = func ? String(func.nome) : '(Sem Função)'
          const key = `${itemId}___${funcaoNome}`

          if (!map[key]) {
            map[key] = {
              descricao: pb?.descricao ?? '—', unidade: pb?.unidade ?? '—',
              categoria: pb?.categoria ?? '—', funcao: funcaoNome,
              quantidade: 0, valor_total: 0, horas_totais: 0, colaboradores: 0,
            }
            colabsMap[key] = new Set()
          }
          const qty = Number(d.quantidade ?? 0)
          map[key].quantidade = (map[key].quantidade as number) + qty
          map[key].valor_total = (map[key].valor_total as number) + Number(d.valor_total ?? qty * Number(pb?.preco_unitario ?? 0))
          colabsMap[key].add(String(d.colaborador_id))
        }

        // calcular horas por item (soma das horas dos colaboradores únicos daquele item)
        for (const key of Object.keys(map)) {
          let h = 0
          for (const cid of colabsMap[key]) { h += horasPorColab[cid] ?? 0 }
          map[key].horas_totais = h
          map[key].colaboradores = colabsMap[key].size
        }

        resultado = Object.values(map).map(r => ({
          ...r,
          coeficiente: (r.horas_totais as number) > 0 ? (r.quantidade as number) / (r.horas_totais as number) : 0,
          custo_por_unidade: (r.quantidade as number) > 0 ? (r.valor_total as number) / (r.quantidade as number) : 0,
        })).sort((a, b) => String(a.categoria).localeCompare(String(b.categoria)) || String(a.descricao).localeCompare(String(b.descricao)))
      }

      // ── 18. Painel de Acidentes ───────────────────────────────────────────
      else if (relatAtivo === 'painel-acidentes') {
        const q = supabase.from('acidentes')
          .select('data_ocorrencia, tipo, gravidade, local_acidente, cat_emitida, descricao, status, colaboradores(nome), obras(nome)')
          .gte('data_ocorrencia', filtroDataIni)
          .lte('data_ocorrencia', filtroDataFim)
        if (filtroObra !== 'todos') q.eq('obra_id', filtroObra)
        const { data } = await q
        resultado = (data ?? []).map(d => ({
          data: fmtDate((d as Record<string, unknown>).data_ocorrencia as string),
          colaborador: ((d as Record<string, unknown>).colaboradores as Record<string, unknown> | null)?.nome ?? '—',
          obra: ((d as Record<string, unknown>).obras as Record<string, unknown> | null)?.nome ?? '—',
          tipo: (d as Record<string, unknown>).tipo,
          gravidade: (d as Record<string, unknown>).gravidade,
          local: (d as Record<string, unknown>).local_acidente,
          cat: (d as Record<string, unknown>).cat_emitida ? 'Sim' : 'Não',
          status: (d as Record<string, unknown>).status,
        })) as Record<string, unknown>[]
      }

      // ── 19. Painel de Atestados ───────────────────────────────────────────
      else if (relatAtivo === 'painel-atestados') {
        const q = supabase.from('atestados')
          .select('data, tipo, dias_afastamento, cid, medico, com_afastamento, status, colaboradores(nome)')
          .gte('data', filtroDataIni)
          .lte('data', filtroDataFim)
        if (filtroColaborador !== 'todos') q.eq('colaborador_id', filtroColaborador)
        const { data } = await q
        const byCid: Record<string, number> = {}
        for (const d of data ?? []) byCid[String(d.cid ?? 'N/D')] = (byCid[String(d.cid ?? 'N/D')] ?? 0) + Number(d.dias_afastamento ?? 0)
        resultado = (data ?? []).map(d => ({
          data: fmtDate(d.data),
          colaborador: ((d as Record<string, unknown>).colaboradores as Record<string, unknown> | null)?.nome ?? '—',
          tipo: d.tipo,
          dias: d.dias_afastamento ?? 0,
          cid: d.cid ?? '—',
          medico: d.medico ?? '—',
          afastamento: d.com_afastamento ? 'Sim' : 'Não',
          status: d.status,
        })) as Record<string, unknown>[]
      }

      // ── 20. EPIs Vencidos/a Vencer ────────────────────────────────────────
      else if (relatAtivo === 'epis-vencidos') {
        const dias = parseInt(diasVencimento) || 30
        const hoje = new Date()
        const limite = new Date(hoje); limite.setDate(hoje.getDate() + dias)
        // FK de colaborador_epi para epi_catalogo é epi_id
        const { data } = await supabase.from('colaborador_epi')
          .select('data_validade, data_entrega, status, quantidade_entregue, colaboradores(nome, chapa), epi_catalogo!epi_id(nome, categoria, numero_ca)')
          .lte('data_validade', limite.toISOString().split('T')[0])
          .order('data_validade')
        resultado = (data ?? []).map(d => {
          const val = d.data_validade ? new Date(d.data_validade) : null
          const vencido = val ? val < hoje : true
          const diasRestantes = val ? Math.ceil((val.getTime() - hoje.getTime()) / 86400000) : null
          return {
            colaborador: ((d as Record<string, unknown>).colaboradores as Record<string, unknown> | null)?.nome ?? '—',
            chapa: ((d as Record<string, unknown>).colaboradores as Record<string, unknown> | null)?.chapa ?? '—',
            epi: ((d as Record<string, unknown>).epi_catalogo as Record<string, unknown> | null)?.nome ?? '—',
            ca: ((d as Record<string, unknown>).epi_catalogo as Record<string, unknown> | null)?.numero_ca ?? '—',
            categoria: ((d as Record<string, unknown>).epi_catalogo as Record<string, unknown> | null)?.categoria ?? '—',
            data_validade: fmtDate(d.data_validade),
            dias_restantes: diasRestantes,
            situacao: vencido ? 'VENCIDO' : diasRestantes !== null && diasRestantes <= 7 ? 'CRÍTICO' : 'A VENCER',
          }
        }) as Record<string, unknown>[]
      }

      // ── 21. Resumo de Folha ───────────────────────────────────────────────
      else if (relatAtivo === 'resumo-folha') {
        // colaboradores = IDs únicos por mês (colab em 2 obras = 2 lançamentos, mas 1 colab)
        const q = supabase.from('ponto_lancamentos')
          .select('colaborador_id, snap_valor_total, snap_liquido, snap_inss, snap_ir, snap_desconto_vt, snap_desconto_adiant, snap_horas_normais, snap_horas_extras, snap_faltas, mes_referencia')
          .gte('mes_referencia', mesRefIni).lte('mes_referencia', mesRefFim)
        if (filtroObra !== 'todos') q.eq('obra_id', filtroObra)
        const { data } = await q
        const map: Record<string, Record<string, unknown>> = {}
        const mapColabs: Record<string, Set<string>> = {}
        for (const d of data ?? []) {
          const m = String((d as Record<string, unknown>).mes_referencia)
          if (!map[m]) { map[m] = { mes: m, bruto: 0, liquido: 0, inss: 0, ir: 0, vt: 0, ad: 0, horas: 0, horas_extras: 0, faltas: 0, colaboradores: 0 }; mapColabs[m] = new Set() }
          map[m].bruto = (map[m].bruto as number) + Number((d as Record<string, unknown>).snap_valor_total ?? 0)
          map[m].liquido = (map[m].liquido as number) + Number((d as Record<string, unknown>).snap_liquido ?? 0)
          map[m].inss = (map[m].inss as number) + Number((d as Record<string, unknown>).snap_inss ?? 0)
          map[m].ir = (map[m].ir as number) + Number((d as Record<string, unknown>).snap_ir ?? 0)
          map[m].vt = (map[m].vt as number) + Number((d as Record<string, unknown>).snap_desconto_vt ?? 0)
          map[m].ad = (map[m].ad as number) + Number((d as Record<string, unknown>).snap_desconto_adiant ?? 0)
          map[m].horas = (map[m].horas as number) + Number((d as Record<string, unknown>).snap_horas_normais ?? 0)
          map[m].horas_extras = (map[m].horas_extras as number) + Number((d as Record<string, unknown>).snap_horas_extras ?? 0)
          map[m].faltas = (map[m].faltas as number) + Number((d as Record<string, unknown>).snap_faltas ?? 0)
          mapColabs[m].add(String((d as Record<string, unknown>).colaborador_id))
        }
        resultado = Object.values(map).map(r => ({ ...r, colaboradores: mapColabs[String(r.mes)]?.size ?? 0, horas_total: (r.horas as number) + (r.horas_extras as number) })).sort((a, b) => String(a.mes).localeCompare(String(b.mes)))
      }

      // ── 22. Provisões Acumuladas ──────────────────────────────────────────
      else if (relatAtivo === 'provisoes') {
        const q = supabase.from('provisoes_fgts')
          .select('colaborador_id, competencia, fgts_mensal, ferias_provisionadas, decimo_terceiro, total_provisao, colaboradores(nome, funcoes(nome))')
          .gte('competencia', mesRefIni).lte('competencia', mesRefFim)
        if (filtroColaborador !== 'todos') q.eq('colaborador_id', filtroColaborador)
        const { data } = await q
        const map: Record<string, Record<string, unknown>> = {}
        for (const d of data ?? []) {
          const id = String((d as Record<string, unknown>).colaborador_id)
          const colab = (d as Record<string, unknown>).colaboradores as Record<string, unknown> | null
          const func = colab ? (colab.funcoes as Record<string, unknown> | null) : null
          if (!map[id]) map[id] = { colaborador: colab?.nome ?? '—', funcao: func?.nome ?? '—', fgts: 0, ferias: 0, decimo: 0, total: 0 }
          map[id].fgts = (map[id].fgts as number) + Number((d as Record<string, unknown>).fgts_mensal ?? 0)
          map[id].ferias = (map[id].ferias as number) + Number((d as Record<string, unknown>).ferias_provisionadas ?? 0)
          map[id].decimo = (map[id].decimo as number) + Number((d as Record<string, unknown>).decimo_terceiro ?? 0)
          map[id].total = (map[id].total as number) + Number((d as Record<string, unknown>).total_provisao ?? 0)
        }
        resultado = Object.values(map).sort((a, b) => (b.total as number) - (a.total as number))
      }

      // ── 23. Adiantamentos em Aberto ───────────────────────────────────────
      else if (relatAtivo === 'adiantamentos-aberto') {
        // inclui 'pago' pois são parcelas ainda em aberto no ciclo real do banco
        const q = supabase.from('adiantamentos')
          .select('competencia, tipo, valor, desconto_parcelas, desconto_parcela_atual, observacoes, colaboradores(nome, chapa, funcoes(nome))')
          .in('status', ['pendente', 'aprovado', 'pago'])
          .order('competencia', { ascending: false })
        if (filtroColaborador !== 'todos') q.eq('colaborador_id', filtroColaborador)
        const { data } = await q
        resultado = (data ?? []).map(d => {
          const colab = (d as Record<string, unknown>).colaboradores as Record<string, unknown> | null
          const func = colab ? (colab.funcoes as Record<string, unknown> | null) : null
          return {
            colaborador: colab?.nome ?? '—',
            chapa: colab?.chapa ?? '—',
            funcao: func?.nome ?? '—',
            competencia: fmtMes(d.competencia),
            tipo: d.tipo ?? '—',
            valor: d.valor,
            parcelas: `${d.desconto_parcela_atual ?? 0}/${d.desconto_parcelas ?? 0}`,
            restante: d.desconto_parcelas && d.desconto_parcela_atual ? Number(d.valor) * ((Number(d.desconto_parcelas) - Number(d.desconto_parcela_atual)) / Number(d.desconto_parcelas)) : d.valor,
          }
        }) as Record<string, unknown>[]
      }

      // ── 24. Custo Hora Médio ──────────────────────────────────────────────
      else if (relatAtivo === 'custo-hora') {
        // contar colabs únicos por função (colab em 2 obras = 2 lançamentos, mas 1 colab)
        const q = supabase.from('ponto_lancamentos')
          .select('colaborador_id, snap_valor_total, snap_horas_normais, snap_horas_extras, colaboradores(funcao_id, funcoes(nome)), obra_id')
          .eq('mes_referencia', mesRef)
        if (filtroObra !== 'todos') q.eq('obra_id', filtroObra)
        const { data } = await q
        const map: Record<string, Record<string, unknown>> = {}
        const mapColabs: Record<string, Set<string>> = {}
        for (const d of data ?? []) {
          const colab = (d as Record<string, unknown>).colaboradores as Record<string, unknown> | null
          const func = colab ? (colab.funcoes as Record<string, unknown> | null) : null
          const nome = func ? String(func.nome) : '(Sem Função)'
          if (!map[nome]) { map[nome] = { funcao: nome, bruto_total: 0, horas_total: 0, horas_extras: 0, colaboradores: 0 }; mapColabs[nome] = new Set() }
          map[nome].bruto_total = (map[nome].bruto_total as number) + Number((d as Record<string, unknown>).snap_valor_total ?? 0)
          const normais = Number((d as Record<string, unknown>).snap_horas_normais ?? 0)
          const extras = Number((d as Record<string, unknown>).snap_horas_extras ?? 0)
          map[nome].horas_total = (map[nome].horas_total as number) + normais + extras
          map[nome].horas_extras = (map[nome].horas_extras as number) + extras
          mapColabs[nome].add(String((d as Record<string, unknown>).colaborador_id))
        }
        resultado = Object.values(map).map(r => ({
          ...r,
          colaboradores: mapColabs[String(r.funcao)]?.size ?? 0,
          custo_hora: r.horas_total ? ((r.bruto_total as number) / (r.horas_total as number)) : 0
        })).sort((a, b) => (b.custo_hora as number) - (a.custo_hora as number))
      }

      // ── 25. Aniversariantes do Mês ────────────────────────────────────────
      else if (relatAtivo === 'aniversariantes') {
        const { data } = await supabase.from('colaboradores')
          .select('nome, chapa, data_nascimento, funcoes(nome), obras(nome), telefone, email')
          .eq('status', 'ativo')
        // gerar lista de meses cobertos pelo período selecionado
        const mesesCobertos: string[] = []
        let [yy, mm] = mesRefIni.split('-').map(Number)
        const [yyFim, mmFim] = mesRefFim.split('-').map(Number)
        while (yy < yyFim || (yy === yyFim && mm <= mmFim)) {
          mesesCobertos.push(String(mm).padStart(2, '0'))
          mm++; if (mm > 12) { mm = 1; yy++ }
        }
        resultado = (data ?? []).filter(c => {
          const dn = c.data_nascimento ? c.data_nascimento.substring(5, 7) : null
          return dn && mesesCobertos.includes(dn)
        }).map(c => ({
          nome: c.nome,
          chapa: c.chapa ?? '—',
          data_nascimento: fmtDate(c.data_nascimento),
          idade: c.data_nascimento ? new Date().getFullYear() - parseInt(c.data_nascimento.substring(0, 4)) : '—',
          funcao: ((c as Record<string, unknown>).funcoes as Record<string, unknown> | null)?.nome ?? '—',
          obra: ((c as Record<string, unknown>).obras as Record<string, unknown> | null)?.nome ?? '—',
          telefone: c.telefone ?? '—',
          email: c.email ?? '—',
        })).sort((a, b) => {
          const ma = String(a.data_nascimento).split('/')[1] || '00'
          const da = String(a.data_nascimento).split('/')[0] || '00'
          const mb = String(b.data_nascimento).split('/')[1] || '00'
          const db = String(b.data_nascimento).split('/')[0] || '00'
          return ma !== mb ? Number(ma) - Number(mb) : Number(da) - Number(db)
        }) as Record<string, unknown>[]
      }

      // ── 26. Contratos Vencendo ────────────────────────────────────────────
      else if (relatAtivo === 'contratos-vencendo') {
        const dias = parseInt(diasVencimento) || 30
        const hoje = new Date()
        const limite = new Date(hoje); limite.setDate(hoje.getDate() + dias)
        const { data } = await supabase.from('colaboradores')
          .select('nome, chapa, data_admissao, data_demissao, tipo_contrato, funcoes(nome), obras(nome)')
          .eq('status', 'ativo')
          .lte('data_demissao', limite.toISOString().split('T')[0])
          .gte('data_demissao', hoje.toISOString().split('T')[0])
          .order('data_demissao')
        resultado = (data ?? []).map(c => {
          const dem = c.data_demissao ? new Date(c.data_demissao) : null
          const diasRest = dem ? Math.ceil((dem.getTime() - hoje.getTime()) / 86400000) : null
          return {
            nome: c.nome, chapa: c.chapa ?? '—',
            data_admissao: fmtDate(c.data_admissao),
            data_vencimento: fmtDate(c.data_demissao),
            dias_restantes: diasRest,
            tipo_contrato: c.tipo_contrato ?? '—',
            funcao: ((c as Record<string, unknown>).funcoes as Record<string, unknown> | null)?.nome ?? '—',
            obra: ((c as Record<string, unknown>).obras as Record<string, unknown> | null)?.nome ?? '—',
          }
        }) as Record<string, unknown>[]
      }

      // ── 27. Playbook de Atividades ────────────────────────────────────────
      else if (relatAtivo === 'playbook-atividades') {
        const q = supabase.from('playbook_itens')
          .select('descricao, unidade, preco_unitario, categoria, ativo, obras(nome)')
          .order('categoria').order('descricao')
        if (filtroObra !== 'todos') q.eq('obra_id', filtroObra)
        const { data } = await q
        resultado = (data ?? []).map(d => ({
          obra: ((d as Record<string, unknown>).obras as Record<string, unknown> | null)?.nome ?? '—',
          categoria: d.categoria ?? '—',
          descricao: d.descricao,
          unidade: d.unidade ?? '—',
          preco: d.preco_unitario,
          ativo: d.ativo ? 'Sim' : 'Não',
        })) as Record<string, unknown>[]
      }

      // ── 28. Histórico de Advertências ─────────────────────────────────────
      else if (relatAtivo === 'historico-advertencias') {
        const q = supabase.from('advertencias')
          .select('data_advertencia, tipo, motivo, dias_suspensao, assinada, colaboradores(nome, chapa, funcoes(nome), obras(nome))')
          .gte('data_advertencia', filtroDataIni)
          .lte('data_advertencia', filtroDataFim)
          .order('data_advertencia', { ascending: false })
        if (filtroColaborador !== 'todos') q.eq('colaborador_id', filtroColaborador)
        const { data } = await q
        resultado = (data ?? []).map(d => {
          const colab = (d as Record<string, unknown>).colaboradores as Record<string, unknown> | null
          const func = colab ? (colab.funcoes as Record<string, unknown> | null) : null
          const obra = colab ? (colab.obras as Record<string, unknown> | null) : null
          return {
            data: fmtDate(d.data_advertencia),
            colaborador: colab?.nome ?? '—',
            chapa: colab?.chapa ?? '—',
            funcao: func?.nome ?? '—',
            obra: obra?.nome ?? '—',
            tipo: d.tipo ?? '—',
            motivo: d.motivo ?? '—',
            dias_suspensao: d.dias_suspensao ?? 0,
            assinada: d.assinada ? 'Sim' : 'Não',
          }
        }) as Record<string, unknown>[]
      }

      setDados(resultado)
      setGerado(true)
      if (resultado.length === 0) toast.info('Nenhum dado encontrado para os filtros selecionados.')
      else toast.success(`${resultado.length} registro(s) carregado(s).`)
    } catch (err) {
      console.error(err)
      toast.error('Erro ao consultar dados. Verifique o console.')
    } finally {
      setLoading(false)
    }
  }, [relatAtivo, filtroObra, filtroColaborador, filtroFuncao, filtroDataIni, filtroDataFim, mesRef, mesRefIni, mesRefFim, diasVencimento])

  // ── Imprimir PDF ────────────────────────────────────────────────────────────

  const imprimirPDF = useCallback(async () => {
    if (!dados.length) { toast.warning('Gere o relatório primeiro.'); return }
    const relat = GRUPOS.flatMap(g => g.items).find(i => i.id === relatAtivo)
    const titulo = relat?.label ?? 'Relatório'
    const periodo = `${fmtMes(mesRefIni)} a ${fmtMes(mesRefFim)}`
    let htmlBody = ''

    const tabelaHTML = (headers: string[], rows: string[][], totais?: string[]) => `
      <table>
        <thead><tr>${headers.map(h => `<th>${h}</th>`).join('')}</tr></thead>
        <tbody>${rows.map(r => `<tr>${r.map(c => `<td>${c}</td>`).join('')}</tr>`).join('')}</tbody>
        ${totais ? `<tfoot><tr>${totais.map(c => `<td>${c}</td>`).join('')}</tr></tfoot>` : ''}
      </table>`

    const kpiHTML = (items: { val: string; lbl: string }[]) =>
      `<div class="kpi-row">${items.map(k => `<div class="kpi"><div class="kpi-val">${k.val}</div><div class="kpi-lbl">${k.lbl}</div></div>`).join('')}</div>`

    const badgeHTML = (v: string) => {
      const lower = String(v ?? '').toLowerCase()
      if (['ativo', 'aprovado', 'sim', 'assinada', 'ok'].includes(lower)) return `<span class="badge-ok">${v}</span>`
      if (['grave', 'vencido', 'crítico'].includes(lower)) return `<span class="badge-danger">${v}</span>`
      if (['a vencer', 'pendente', 'não'].includes(lower)) return `<span class="badge-warn">${v}</span>`
      return `<span class="badge-info">${v}</span>`
    }

    if (relatAtivo === 'headcount-obra') {
      const totalGeral = dados.reduce((s, r) => s + (r.total as number), 0)
      const totalAtivos = dados.reduce((s, r) => s + (r.ativo as number), 0)
      htmlBody = kpiHTML([
        { val: String(totalGeral), lbl: 'Total Colaboradores' },
        { val: String(totalAtivos), lbl: 'Ativos' },
        { val: String(dados.length), lbl: 'Obras' },
      ]) + tabelaHTML(
        ['Obra', 'Ativos', 'Inativos', 'Afastados', 'Total'],
        dados.map(r => [String(r.obra), String(r.ativo), String(r.inativo), String(r.afastado), `<strong>${r.total}</strong>`]),
        ['TOTAL', String(totalAtivos), '—', '—', `<strong>${totalGeral}</strong>`]
      )
    } else if (relatAtivo === 'custo-obra') {
      const totalGeral = dados.reduce((s, r) => s + (r.total as number), 0)
      htmlBody = kpiHTML([
        { val: fmtCur(totalGeral), lbl: 'Custo Total' },
        { val: fmtCur(dados.reduce((s, r) => s + (r.folha_bruto as number), 0)), lbl: 'Folha Bruta' },
        { val: fmtCur(dados.reduce((s, r) => s + (r.adiantamentos as number), 0)), lbl: 'Adiantamentos' },
        { val: fmtCur(dados.reduce((s, r) => s + (r.vt as number), 0)), lbl: 'Vale Transporte' },
      ]) + tabelaHTML(
        ['Obra', 'Folha Bruta', 'Adiantamentos', 'V. Transporte', 'Prêmios', 'Total'],
        dados.map(r => [String(r.obra), fmtCur(r.folha_bruto as number), fmtCur(r.adiantamentos as number), fmtCur(r.vt as number), fmtCur(r.premios as number), `<strong>${fmtCur(r.total as number)}</strong>`])
      )
    } else if (relatAtivo === 'ficha-financeira') {
      const colabNome = colaboradores.find(c => c.id === filtroColaborador)?.nome ?? '—'
      htmlBody = `<h2>Colaborador: ${colabNome}</h2>` + tabelaHTML(
        ['Mês', 'Bruto', 'INSS', 'IR', 'Desc. VT', 'Desc. AD', 'Prêmio', 'Líquido', 'Adiantamentos'],
        dados.map(r => [fmtMes(r.mes as string), fmtCur(r.bruto as number), fmtCur(r.inss as number), fmtCur(r.ir as number), fmtCur(r.vt_desc as number), fmtCur(r.ad_desc as number), fmtCur(r.premio as number), fmtCur(r.liquido as number), fmtCur(r.adiantamentos as number)])
      )
    } else if (relatAtivo === 'historico-ponto') {
      htmlBody = tabelaHTML(
        ['Data', 'Entrada', 'Saída', 'Hs Trabalhadas', 'Hs Extras', 'Presente', 'Falta', 'Justificativa'],
        dados.map(r => [fmtDate(r.data as string), String(r.hora_entrada ?? '—'), String(r.hora_saida ?? '—'), fmtNum(r.horas_trabalhadas as number), fmtNum(r.horas_extras as number), r.presente ? '✔' : '', r.falta ? '✘' : '', String(r.justificativa ?? '')])
      )
    } else if (relatAtivo === 'ranking-producao') {
      htmlBody = kpiHTML([
        { val: String(dados.length), lbl: 'Colaboradores' },
        { val: fmtCur(dados.reduce((s, r) => s + (r.total_valor as number), 0)), lbl: 'Total Produzido' },
      ]) + tabelaHTML(
        ['#', 'Colaborador', 'Chapa', 'Função', 'Qtd Total', 'Valor Total'],
        dados.map(r => [String(r.posicao), String(r.colaborador), String(r.chapa), String(r.funcao), fmtNum(r.total_qtd as number), fmtCur(r.total_valor as number)])
      )
    } else if (relatAtivo === 'resumo-folha') {
      const tb = dados.reduce((s, r) => s + (r.bruto as number), 0)
      const tl = dados.reduce((s, r) => s + (r.liquido as number), 0)
      htmlBody = kpiHTML([
        { val: fmtCur(tb), lbl: 'Total Bruto' },
        { val: fmtCur(tl), lbl: 'Total Líquido' },
        { val: fmtCur(dados.reduce((s, r) => s + (r.inss as number), 0)), lbl: 'Total INSS' },
        { val: fmtCur(dados.reduce((s, r) => s + (r.ir as number), 0)), lbl: 'Total IR' },
      ]) + tabelaHTML(
        ['Mês', 'Colaboradores', 'Bruto', 'INSS', 'IR', 'Desc. VT', 'Desc. AD', 'Líquido', 'Horas', 'Faltas'],
        dados.map(r => [fmtMes(r.mes as string), String(r.colaboradores), fmtCur(r.bruto as number), fmtCur(r.inss as number), fmtCur(r.ir as number), fmtCur(r.vt as number), fmtCur(r.ad as number), fmtCur(r.liquido as number), fmtNum(r.horas as number), String(r.faltas)])
      )
    } else if (relatAtivo === 'provisoes') {
      htmlBody = kpiHTML([
        { val: fmtCur(dados.reduce((s, r) => s + (r.total as number), 0)), lbl: 'Total Provisão' },
        { val: fmtCur(dados.reduce((s, r) => s + (r.fgts as number), 0)), lbl: 'FGTS' },
        { val: fmtCur(dados.reduce((s, r) => s + (r.ferias as number), 0)), lbl: 'Férias' },
        { val: fmtCur(dados.reduce((s, r) => s + (r.decimo as number), 0)), lbl: '13º' },
      ]) + tabelaHTML(
        ['Colaborador', 'Função', 'FGTS', 'Férias', '13º Proporcional', 'Total'],
        dados.map(r => [String(r.colaborador), String(r.funcao), fmtCur(r.fgts as number), fmtCur(r.ferias as number), fmtCur(r.decimo as number), `<strong>${fmtCur(r.total as number)}</strong>`])
      )
    } else if (relatAtivo === 'painel-acidentes') {
      htmlBody = kpiHTML([
        { val: String(dados.length), lbl: 'Total Acidentes' },
        { val: String(dados.filter(r => r.gravidade === 'grave').length), lbl: 'Graves' },
        { val: String(dados.filter(r => r.cat === 'Sim').length), lbl: 'CAT Emitidas' },
      ]) + tabelaHTML(
        ['Data', 'Colaborador', 'Obra', 'Tipo', 'Gravidade', 'CAT', 'Status'],
        dados.map(r => [String(r.data), String(r.colaborador), String(r.obra), String(r.tipo ?? '—'), badgeHTML(String(r.gravidade ?? '—')), badgeHTML(String(r.cat)), String(r.status ?? '—')])
      )
    } else if (relatAtivo === 'epis-vencidos') {
      htmlBody = kpiHTML([
        { val: String(dados.filter(r => r.situacao === 'VENCIDO').length), lbl: 'Vencidos' },
        { val: String(dados.filter(r => r.situacao === 'CRÍTICO').length), lbl: 'Críticos (≤7d)' },
        { val: String(dados.filter(r => r.situacao === 'A VENCER').length), lbl: 'A Vencer' },
      ]) + tabelaHTML(
        ['Colaborador', 'Chapa', 'EPI', 'CA', 'Categoria', 'Validade', 'Dias Restantes', 'Situação'],
        dados.map(r => [String(r.colaborador), String(r.chapa), String(r.epi), String(r.ca), String(r.categoria), String(r.data_validade), r.dias_restantes != null ? String(r.dias_restantes) : '—', badgeHTML(String(r.situacao))])
      )
    } else if (relatAtivo === 'aniversariantes') {
      const mesIniLabel = NOME_MES[parseInt(mesRefIni.split('-')[1]) - 1]
      const mesFimLabel = NOME_MES[parseInt(mesRefFim.split('-')[1]) - 1]
      const lblPeriodo = mesIniLabel === mesFimLabel ? mesIniLabel : `${mesIniLabel} a ${mesFimLabel}`
      htmlBody = kpiHTML([{ val: String(dados.length), lbl: `Aniversariantes — ${lblPeriodo}` }]) +
        tabelaHTML(
          ['Nome', 'Chapa', 'Nascimento', 'Idade', 'Função', 'Obra', 'Telefone', 'E-mail'],
          dados.map(r => [String(r.nome), String(r.chapa), String(r.data_nascimento), String(r.idade), String(r.funcao), String(r.obra), String(r.telefone), String(r.email)])
        )
    } else {
      // Relatório genérico: usa todas as chaves do primeiro objeto
      if (dados.length > 0) {
        const keys = Object.keys(dados[0])
        const headers = keys.map(k => k.replace(/_/g, ' ').toUpperCase())
        htmlBody = tabelaHTML(
          headers,
          dados.map(r => keys.map(k => {
            const v = r[k]
            if (typeof v === 'number' && k.includes('valor') || k.includes('bruto') || k.includes('liquido') || k.includes('total') || k.includes('custo') || k.includes('salario')) return fmtCur(v as number)
            if (typeof v === 'string' && v.match(/^\d{4}-\d{2}-\d{2}$/)) return fmtDate(v)
            return String(v ?? '—')
          }))
        )
      }
    }

    await abrirPDF(titulo, htmlBody, undefined, `${fmtDate(filtroDataIni)} a ${fmtDate(filtroDataFim)}`)
  }, [dados, relatAtivo, mesRefIni, mesRefFim, filtroDataIni, filtroDataFim, filtroColaborador, colaboradores])

  // ── Render ──────────────────────────────────────────────────────────────────

  const grupoAtivo = GRUPOS.find(g => g.items.some(i => i.id === relatAtivo))
  const itemAtivo = GRUPOS.flatMap(g => g.items).find(i => i.id === relatAtivo)

  const isColabRequired = ['ficha-financeira', 'historico-ponto', 'producao-individual', 'ocorrencias-colab', 'custo-colab'].includes(relatAtivo)
  // Todos os relatórios com filtro temporal usam o seletor de datas (exceto epis-vencidos e contratos-vencendo)
  const usaFiltroDatas = !['headcount-obra', 'headcount-funcao', 'epis-vencidos', 'contratos-vencendo', 'playbook-atividades'].includes(relatAtivo)

  return (
    <div className="flex h-full min-h-screen bg-[#f1f5f9]">

      {/* ── Sidebar ── */}
      <aside className="w-72 bg-white border-r border-slate-200 flex flex-col overflow-y-auto shrink-0 shadow-sm">
        <div className="px-5 py-4 border-b border-slate-200 bg-[#1e3a5f]">
          <div className="flex items-center gap-2 text-white">
            <BarChart3 size={20} />
            <span className="text-base font-bold tracking-tight">Relatórios</span>
          </div>
          <p className="text-xs text-blue-200 mt-0.5">28 relatórios disponíveis</p>
        </div>

        <nav className="flex-1 py-2">
          {GRUPOS.map(grupo => (
            <div key={grupo.id}>
              <button
                onClick={() => setGrupoAberto(g => g === grupo.id ? '' : grupo.id)}
                className="w-full flex items-center justify-between px-4 py-2.5 text-xs font-semibold uppercase tracking-wider text-slate-500 hover:bg-slate-50 transition-colors"
              >
                <span className="flex items-center gap-2">
                  <span style={{ color: grupo.color }}>{grupo.icon}</span>
                  {grupo.label}
                </span>
                <ChevronDown
                  size={12}
                  className={`transition-transform duration-200 ${grupoAberto === grupo.id ? 'rotate-180' : ''}`}
                />
              </button>

              {grupoAberto === grupo.id && (
                <div className="pb-1">
                  {grupo.items.map(item => (
                    <button
                      key={item.id}
                      onClick={() => setRelatAtivo(item.id)}
                      className={`w-full flex items-center gap-2.5 px-5 py-2 text-sm transition-all text-left
                        ${relatAtivo === item.id
                          ? 'bg-blue-50 text-[#1e3a5f] font-semibold border-r-2 border-[#1e3a5f]'
                          : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
                        }`}
                    >
                      <span className={relatAtivo === item.id ? 'text-[#1e3a5f]' : 'text-slate-400'}>
                        {item.icon}
                      </span>
                      <span className="leading-tight">{item.label}</span>
                      {relatAtivo === item.id && <ChevronRight size={12} className="ml-auto text-[#1e3a5f]" />}
                    </button>
                  ))}
                </div>
              )}
            </div>
          ))}
        </nav>
      </aside>

      {/* ── Painel principal ── */}
      <main className="flex-1 flex flex-col overflow-auto">

        {/* Header do relatório */}
        <div className="bg-white border-b border-slate-200 px-6 py-4 flex items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 text-xs text-slate-400 mb-1">
              <span style={{ color: grupoAtivo?.color }}>{grupoAtivo?.icon}</span>
              <span>{grupoAtivo?.label}</span>
              <ChevronRight size={10} />
              <span className="text-slate-600 font-medium">{itemAtivo?.label}</span>
            </div>
            <h1 className="text-xl font-bold text-[#1e3a5f]">{itemAtivo?.label}</h1>
            <p className="text-xs text-slate-400 mt-0.5">{itemAtivo?.desc}</p>
          </div>
          {gerado && dados.length > 0 && (
            <Button
              onClick={imprimirPDF}
              className="bg-[#1e3a5f] hover:bg-[#162d4a] text-white gap-2 shrink-0"
              size="sm"
            >
              <Printer size={15} /> Imprimir / PDF
            </Button>
          )}
        </div>

        {/* Filtros */}
        <div className="bg-white border-b border-slate-100 px-6 py-4">
          <SectionTitle>Filtros</SectionTitle>
          <FilterRow>

            {/* Filtro: Obra */}
            {['headcount-obra','custo-obra','producao-obra','faltas-obra','acidentes-obra','producao-playbook','ranking-producao','evolucao-horas','painel-acidentes','resumo-folha','meta-realizado','custo-hora','playbook-atividades'].includes(relatAtivo) && (
              <FieldWrap label="Obra">
                <Select value={filtroObra} onValueChange={setFiltroObra}>
                  <SelectTrigger className="w-52 h-8 text-xs"><SelectValue placeholder="Todas as obras" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="todos">Todas as obras</SelectItem>
                    {obras.map(o => <SelectItem key={o.id} value={o.id}>{o.nome}</SelectItem>)}
                  </SelectContent>
                </Select>
              </FieldWrap>
            )}

            {/* Filtro: Colaborador */}
            {(isColabRequired || ['provisoes','adiantamentos-aberto','painel-atestados','historico-advertencias'].includes(relatAtivo)) && (
              <FieldWrap label={`Colaborador ${isColabRequired ? '*' : ''}`}>
                <Select value={filtroColaborador} onValueChange={setFiltroColaborador}>
                  <SelectTrigger className="w-64 h-8 text-xs"><SelectValue placeholder="Selecione..." /></SelectTrigger>
                  <SelectContent>
                    {!isColabRequired && <SelectItem value="todos">Todos</SelectItem>}
                    {colaboradores.map(c => <SelectItem key={c.id} value={c.id}>{c.nome}{c.chapa ? ` (${c.chapa})` : ''}</SelectItem>)}
                  </SelectContent>
                </Select>
              </FieldWrap>
            )}

            {/* Filtro: Período por data (De / Até) — todos exceto epis/contratos/headcount/playbook */}
            {usaFiltroDatas && (
              <>
                <FieldWrap label="De">
                  <Input
                    type="date"
                    value={filtroDataIni}
                    onChange={e => setFiltroDataIni(e.target.value)}
                    className="h-8 text-xs w-36"
                  />
                </FieldWrap>
                <FieldWrap label="Até">
                  <Input
                    type="date"
                    value={filtroDataFim}
                    onChange={e => setFiltroDataFim(e.target.value)}
                    className="h-8 text-xs w-36"
                  />
                </FieldWrap>
                {/* Atalhos rápidos de período */}
                <FieldWrap label="Atalho">
                  <div className="flex gap-1 flex-wrap">
                    {[
                      { lbl: 'Hoje', fn: () => { setFiltroDataIni(hoje); setFiltroDataFim(hoje) } },
                      { lbl: 'Semana', fn: () => { const d = new Date(); const ini = new Date(d); ini.setDate(d.getDate() - d.getDay() + 1); const fim = new Date(ini); fim.setDate(ini.getDate() + 6); setFiltroDataIni(ini.toISOString().split('T')[0]); setFiltroDataFim(fim.toISOString().split('T')[0]) } },
                      { lbl: 'Quinzena', fn: () => { const d = new Date(); const dia = d.getDate(); const y = d.getFullYear(); const m = d.getMonth(); if (dia <= 15) { setFiltroDataIni(`${y}-${String(m+1).padStart(2,'0')}-01`); setFiltroDataFim(`${y}-${String(m+1).padStart(2,'0')}-15`) } else { const fim = new Date(y, m+1, 0); setFiltroDataIni(`${y}-${String(m+1).padStart(2,'0')}-16`); setFiltroDataFim(fim.toISOString().split('T')[0]) } } },
                      { lbl: 'Mês', fn: () => { const d = new Date(); const y = d.getFullYear(); const m = d.getMonth(); const fim = new Date(y, m+1, 0); setFiltroDataIni(`${y}-${String(m+1).padStart(2,'0')}-01`); setFiltroDataFim(fim.toISOString().split('T')[0]) } },
                      { lbl: 'Trimestre', fn: () => { const d = new Date(); const m = d.getMonth(); const q = Math.floor(m/3); const y = d.getFullYear(); const mIni = q*3; const mFim = q*3+2; const fim = new Date(y, mFim+1, 0); setFiltroDataIni(`${y}-${String(mIni+1).padStart(2,'0')}-01`); setFiltroDataFim(fim.toISOString().split('T')[0]) } },
                      { lbl: 'Ano', fn: () => { const y = new Date().getFullYear(); setFiltroDataIni(`${y}-01-01`); setFiltroDataFim(`${y}-12-31`) } },
                    ].map(({ lbl, fn }) => (
                      <button key={lbl} onClick={fn}
                        className="px-2 py-0.5 text-[10px] font-semibold rounded border border-slate-200 bg-slate-50 hover:bg-[#1e3a5f] hover:text-white hover:border-[#1e3a5f] transition-colors">
                        {lbl}
                      </button>
                    ))}
                  </div>
                </FieldWrap>
              </>
            )}

            {/* Filtro: Dias para vencimento */}
            {['epis-vencidos', 'contratos-vencendo'].includes(relatAtivo) && (
              <FieldWrap label="Vencimento nos próximos">
                <div className="flex items-center gap-2">
                  <Input
                    type="number"
                    min={1}
                    max={365}
                    value={diasVencimento}
                    onChange={e => setDiasVencimento(e.target.value)}
                    className="w-20 h-8 text-xs"
                  />
                  <span className="text-xs text-slate-500">dias</span>
                </div>
              </FieldWrap>
            )}

            {/* Botão Gerar */}
            <div className="flex items-end">
              <Button
                onClick={gerarRelatorio}
                disabled={loading}
                className="bg-[#1e3a5f] hover:bg-[#162d4a] text-white h-8 px-5 text-xs gap-1.5"
              >
                {loading ? <Loader2 size={13} className="animate-spin" /> : <Search size={13} />}
                {loading ? 'Carregando...' : 'Gerar Relatório'}
              </Button>
            </div>
          </FilterRow>
        </div>

        {/* Resultados */}
        <div className="flex-1 px-6 py-5">
          {loading && <LoadingState />}

          {!loading && !gerado && (
            <div className="flex flex-col items-center justify-center h-72 text-slate-300 gap-4">
              <BarChart3 size={56} strokeWidth={1} />
              <p className="text-base font-medium text-slate-400">Configure os filtros e clique em <strong className="text-[#1e3a5f]">Gerar Relatório</strong></p>
              <p className="text-xs text-slate-400">{itemAtivo?.desc}</p>
            </div>
          )}

          {!loading && gerado && dados.length === 0 && <EmptyState />}

          {!loading && gerado && dados.length > 0 && (
            <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">

              {/* Barra de resultados */}
              <div className="flex items-center justify-between px-4 py-3 bg-[#f8fafc] border-b border-slate-200">
                <span className="text-xs font-semibold text-[#1e3a5f]">
                  {dados.length} registro(s) encontrado(s)
                </span>
                <Button variant="ghost" size="sm" onClick={imprimirPDF} className="gap-1.5 text-xs h-7 text-slate-500 hover:text-[#1e3a5f]">
                  <Download size={13} /> Exportar PDF
                </Button>
              </div>

              {/* ── Tabela: Headcount por Obra ── */}
              {relatAtivo === 'headcount-obra' && (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead><tr className="bg-[#1e3a5f] text-white text-xs">
                      <th className="px-4 py-3 text-left font-semibold">Obra</th>
                      <th className="px-4 py-3 text-center">Ativos</th>
                      <th className="px-4 py-3 text-center">Inativos</th>
                      <th className="px-4 py-3 text-center">Afastados</th>
                      <th className="px-4 py-3 text-center font-bold">Total</th>
                    </tr></thead>
                    <tbody>
                      {dados.map((r, i) => (
                        <tr key={i} className={i % 2 === 0 ? 'bg-white' : 'bg-slate-50'}>
                          <td className="px-4 py-2.5 font-medium text-slate-700">{String(r.obra)}</td>
                          <td className="px-4 py-2.5 text-center"><span className="bg-green-100 text-green-800 text-xs px-2 py-0.5 rounded-full font-semibold">{String(r.ativo)}</span></td>
                          <td className="px-4 py-2.5 text-center"><span className="bg-slate-100 text-slate-600 text-xs px-2 py-0.5 rounded-full">{String(r.inativo)}</span></td>
                          <td className="px-4 py-2.5 text-center"><span className="bg-yellow-100 text-yellow-800 text-xs px-2 py-0.5 rounded-full">{String(r.afastado)}</span></td>
                          <td className="px-4 py-2.5 text-center font-bold text-[#1e3a5f]">{String(r.total)}</td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot>
                      <tr className="bg-[#e8f0fe] font-bold text-[#1e3a5f] text-sm">
                        <td className="px-4 py-2.5">TOTAL</td>
                        <td className="px-4 py-2.5 text-center">{dados.reduce((s, r) => s + (r.ativo as number), 0)}</td>
                        <td className="px-4 py-2.5 text-center">{dados.reduce((s, r) => s + (r.inativo as number), 0)}</td>
                        <td className="px-4 py-2.5 text-center">{dados.reduce((s, r) => s + (r.afastado as number), 0)}</td>
                        <td className="px-4 py-2.5 text-center">{dados.reduce((s, r) => s + (r.total as number), 0)}</td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              )}

              {/* ── Tabela: Custo por Obra ── */}
              {relatAtivo === 'custo-obra' && (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead><tr className="bg-[#1e3a5f] text-white text-xs">
                      <th className="px-4 py-3 text-left">Obra</th>
                      <th className="px-4 py-3 text-right">Folha Bruta</th>
                      <th className="px-4 py-3 text-right">Adiantamentos</th>
                      <th className="px-4 py-3 text-right">V. Transporte</th>
                      <th className="px-4 py-3 text-right">Prêmios</th>
                      <th className="px-4 py-3 text-right font-bold">Total</th>
                    </tr></thead>
                    <tbody>
                      {dados.map((r, i) => (
                        <tr key={i} className={i % 2 === 0 ? 'bg-white' : 'bg-slate-50'}>
                          <td className="px-4 py-2.5 font-medium">{String(r.obra)}</td>
                          <td className="px-4 py-2.5 text-right text-slate-600">{fmtCur(r.folha_bruto as number)}</td>
                          <td className="px-4 py-2.5 text-right text-slate-600">{fmtCur(r.adiantamentos as number)}</td>
                          <td className="px-4 py-2.5 text-right text-slate-600">{fmtCur(r.vt as number)}</td>
                          <td className="px-4 py-2.5 text-right text-slate-600">{fmtCur(r.premios as number)}</td>
                          <td className="px-4 py-2.5 text-right font-bold text-[#1e3a5f]">{fmtCur(r.total as number)}</td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot>
                      <tr className="bg-[#e8f0fe] font-bold text-[#1e3a5f]">
                        <td className="px-4 py-2.5">TOTAL</td>
                        <td className="px-4 py-2.5 text-right">{fmtCur(dados.reduce((s, r) => s + (r.folha_bruto as number), 0))}</td>
                        <td className="px-4 py-2.5 text-right">{fmtCur(dados.reduce((s, r) => s + (r.adiantamentos as number), 0))}</td>
                        <td className="px-4 py-2.5 text-right">{fmtCur(dados.reduce((s, r) => s + (r.vt as number), 0))}</td>
                        <td className="px-4 py-2.5 text-right">{fmtCur(dados.reduce((s, r) => s + (r.premios as number), 0))}</td>
                        <td className="px-4 py-2.5 text-right">{fmtCur(dados.reduce((s, r) => s + (r.total as number), 0))}</td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              )}

              {/* ── Tabela: Produtividade por Obra ── */}
              {relatAtivo === 'producao-obra' && (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead><tr className="bg-[#1e3a5f] text-white text-xs">
                      <th className="px-4 py-3 text-left">Obra</th>
                      <th className="px-4 py-3 text-left">Atividade</th>
                      <th className="px-4 py-3 text-center">Unidade</th>
                      <th className="px-4 py-3 text-right">Quantidade</th>
                      <th className="px-4 py-3 text-right">Preço Unit.</th>
                      <th className="px-4 py-3 text-right">Total</th>
                    </tr></thead>
                    <tbody>
                      {dados.map((r, i) => (
                        <tr key={i} className={i % 2 === 0 ? 'bg-white' : 'bg-slate-50'}>
                          <td className="px-4 py-2.5 font-medium">{String(r.obra)}</td>
                          <td className="px-4 py-2.5">{String(r.descricao)}</td>
                          <td className="px-4 py-2.5 text-center"><span className="bg-blue-50 text-blue-700 text-xs px-2 py-0.5 rounded">{String(r.unidade)}</span></td>
                          <td className="px-4 py-2.5 text-right">{fmtNum(r.quantidade as number)}</td>
                          <td className="px-4 py-2.5 text-right text-slate-500">{fmtCur(r.preco_unitario as number)}</td>
                          <td className="px-4 py-2.5 text-right font-semibold text-[#1e3a5f]">{fmtCur(r.custo_total as number)}</td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot>
                      <tr className="bg-[#e8f0fe] font-bold text-[#1e3a5f]">
                        <td colSpan={5} className="px-4 py-2.5">TOTAL</td>
                        <td className="px-4 py-2.5 text-right">{fmtCur(dados.reduce((s, r) => s + (r.custo_total as number), 0))}</td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              )}

              {/* ── Tabela: Faltas por Obra ── */}
              {relatAtivo === 'faltas-obra' && (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead><tr className="bg-[#1e3a5f] text-white text-xs">
                      <th className="px-4 py-3 text-left">Obra</th>
                      <th className="px-4 py-3 text-center">Colaboradores</th>
                      <th className="px-4 py-3 text-center">Total Faltas</th>
                      <th className="px-4 py-3 text-center">Hs Normais</th>
                      <th className="px-4 py-3 text-center">Hs Extras</th>
                      <th className="px-4 py-3 text-center font-bold">Hs Totais</th>
                      <th className="px-4 py-3 text-center">% Ausência</th>
                    </tr></thead>
                    <tbody>
                      {dados.map((r, i) => (
                        <tr key={i} className={i % 2 === 0 ? 'bg-white' : 'bg-slate-50'}>
                          <td className="px-4 py-2.5 font-medium">{String(r.obra)}</td>
                          <td className="px-4 py-2.5 text-center">{String(r.colaboradores)}</td>
                          <td className="px-4 py-2.5 text-center font-semibold text-red-600">{String(r.faltas)}</td>
                          <td className="px-4 py-2.5 text-center text-slate-500">{fmtNum(r.horas as number)}h</td>
                          <td className="px-4 py-2.5 text-center text-green-600">{fmtNum(r.horas_extras as number)}h</td>
                          <td className="px-4 py-2.5 text-center font-bold text-[#1e3a5f]">{fmtNum(r.horas_total as number)}h</td>
                          <td className="px-4 py-2.5 text-center">
                            <span className={`text-xs px-2 py-0.5 rounded-full font-semibold ${Number(r.pct_ausencia) > 10 ? 'bg-red-100 text-red-700' : Number(r.pct_ausencia) > 5 ? 'bg-yellow-100 text-yellow-700' : 'bg-green-100 text-green-700'}`}>
                              {String(r.pct_ausencia)}%
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              {/* ── Tabela: Acidentes por Obra ── */}
              {relatAtivo === 'acidentes-obra' && (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead><tr className="bg-[#1e3a5f] text-white text-xs">
                      <th className="px-4 py-3 text-left">Obra</th>
                      <th className="px-4 py-3 text-center">Total</th>
                      <th className="px-4 py-3 text-center">Leves</th>
                      <th className="px-4 py-3 text-center">Graves</th>
                      <th className="px-4 py-3 text-center">Fatais</th>
                      <th className="px-4 py-3 text-center">CAT Emitidas</th>
                    </tr></thead>
                    <tbody>
                      {dados.map((r, i) => (
                        <tr key={i} className={i % 2 === 0 ? 'bg-white' : 'bg-slate-50'}>
                          <td className="px-4 py-2.5 font-medium">{String(r.obra)}</td>
                          <td className="px-4 py-2.5 text-center font-bold text-[#1e3a5f]">{String(r.total)}</td>
                          <td className="px-4 py-2.5 text-center"><span className="bg-yellow-100 text-yellow-800 text-xs px-2 py-0.5 rounded-full">{String(r.leve)}</span></td>
                          <td className="px-4 py-2.5 text-center"><span className="bg-orange-100 text-orange-800 text-xs px-2 py-0.5 rounded-full">{String(r.grave)}</span></td>
                          <td className="px-4 py-2.5 text-center"><span className="bg-red-100 text-red-800 text-xs px-2 py-0.5 rounded-full font-bold">{String(r.fatal)}</span></td>
                          <td className="px-4 py-2.5 text-center">{String(r.cat)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              {/* ── Tabela: Ficha Financeira ── */}
              {relatAtivo === 'ficha-financeira' && (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead><tr className="bg-[#1e3a5f] text-white text-xs">
                      <th className="px-4 py-3 text-left">Mês</th>
                      <th className="px-4 py-3 text-center">Hs Normais</th>
                      <th className="px-4 py-3 text-center">Hs Extras</th>
                      <th className="px-4 py-3 text-center">Faltas</th>
                      <th className="px-4 py-3 text-right">Bruto</th>
                      <th className="px-4 py-3 text-right">INSS</th>
                      <th className="px-4 py-3 text-right">IR</th>
                      <th className="px-4 py-3 text-right">Desc. VT</th>
                      <th className="px-4 py-3 text-right">Desc. AD</th>
                      <th className="px-4 py-3 text-right">Prêmio</th>
                      <th className="px-4 py-3 text-right font-bold">Líquido</th>
                    </tr></thead>
                    <tbody>
                      {dados.map((r, i) => (
                        <tr key={i} className={i % 2 === 0 ? 'bg-white' : 'bg-slate-50'}>
                          <td className="px-4 py-2.5 font-medium">{fmtMes(r.mes as string)}</td>
                          <td className="px-4 py-2.5 text-center text-slate-600">{fmtNum(r.horas_normais as number)}h</td>
                          <td className="px-4 py-2.5 text-center text-green-600 font-semibold">{fmtNum(r.horas_extras as number)}h</td>
                          <td className="px-4 py-2.5 text-center text-red-600">{String(r.faltas)}</td>
                          <td className="px-4 py-2.5 text-right">{fmtCur(r.bruto as number)}</td>
                          <td className="px-4 py-2.5 text-right text-red-600">{fmtCur(r.inss as number)}</td>
                          <td className="px-4 py-2.5 text-right text-red-600">{fmtCur(r.ir as number)}</td>
                          <td className="px-4 py-2.5 text-right text-red-600">{fmtCur(r.vt_desc as number)}</td>
                          <td className="px-4 py-2.5 text-right text-red-600">{fmtCur(r.ad_desc as number)}</td>
                          <td className="px-4 py-2.5 text-right text-green-600">{fmtCur(r.premio as number)}</td>
                          <td className="px-4 py-2.5 text-right font-bold text-[#1e3a5f]">{fmtCur(r.liquido as number)}</td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot>
                      <tr className="bg-[#e8f0fe] font-bold text-[#1e3a5f] text-xs">
                        <td className="px-4 py-2.5">TOTAL</td>
                        <td className="px-4 py-2.5 text-center">{fmtNum(dados.reduce((s, r) => s + (r.horas_normais as number), 0))}h</td>
                        <td className="px-4 py-2.5 text-center">{fmtNum(dados.reduce((s, r) => s + (r.horas_extras as number), 0))}h</td>
                        <td className="px-4 py-2.5 text-center">{dados.reduce((s, r) => s + (r.faltas as number), 0)}</td>
                        <td className="px-4 py-2.5 text-right">{fmtCur(dados.reduce((s, r) => s + (r.bruto as number), 0))}</td>
                        <td className="px-4 py-2.5 text-right">{fmtCur(dados.reduce((s, r) => s + (r.inss as number), 0))}</td>
                        <td className="px-4 py-2.5 text-right">{fmtCur(dados.reduce((s, r) => s + (r.ir as number), 0))}</td>
                        <td className="px-4 py-2.5 text-right">{fmtCur(dados.reduce((s, r) => s + (r.vt_desc as number), 0))}</td>
                        <td className="px-4 py-2.5 text-right">{fmtCur(dados.reduce((s, r) => s + (r.ad_desc as number), 0))}</td>
                        <td className="px-4 py-2.5 text-right">{fmtCur(dados.reduce((s, r) => s + (r.premio as number), 0))}</td>
                        <td className="px-4 py-2.5 text-right">{fmtCur(dados.reduce((s, r) => s + (r.liquido as number), 0))}</td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              )}

              {/* ── Tabela: Histórico de Ponto ── */}
              {relatAtivo === 'historico-ponto' && (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead><tr className="bg-[#1e3a5f] text-white text-xs">
                      <th className="px-4 py-3 text-left">Data</th>
                      <th className="px-4 py-3 text-center">Entrada</th>
                      <th className="px-4 py-3 text-center">Saída Almoço</th>
                      <th className="px-4 py-3 text-center">Retorno</th>
                      <th className="px-4 py-3 text-center">Saída</th>
                      <th className="px-4 py-3 text-center">Hs Trabalhadas</th>
                      <th className="px-4 py-3 text-center">Hs Extras</th>
                      <th className="px-4 py-3 text-center">Status</th>
                      <th className="px-4 py-3 text-left">Justificativa</th>
                    </tr></thead>
                    <tbody>
                      {dados.map((r, i) => (
                        <tr key={i} className={r.falta ? 'bg-red-50' : i % 2 === 0 ? 'bg-white' : 'bg-slate-50'}>
                          <td className="px-4 py-2 font-medium">{fmtDate(r.data as string)}</td>
                          <td className="px-4 py-2 text-center text-slate-600">{String(r.hora_entrada ?? '—')}</td>
                          <td className="px-4 py-2 text-center text-slate-600">{String(r.saida_almoco ?? '—')}</td>
                          <td className="px-4 py-2 text-center text-slate-600">{String(r.retorno_almoco ?? '—')}</td>
                          <td className="px-4 py-2 text-center text-slate-600">{String(r.hora_saida ?? '—')}</td>
                          <td className="px-4 py-2 text-center font-semibold">{fmtNum(r.horas_trabalhadas as number)}h</td>
                          <td className="px-4 py-2 text-center text-green-600 font-semibold">{fmtNum(r.horas_extras as number)}h</td>
                          <td className="px-4 py-2 text-center">
                            {r.falta
                              ? <span className="bg-red-100 text-red-700 text-xs px-2 py-0.5 rounded-full">Falta</span>
                              : <span className="bg-green-100 text-green-700 text-xs px-2 py-0.5 rounded-full">Presente</span>}
                          </td>
                          <td className="px-4 py-2 text-xs text-slate-500">{String(r.justificativa ?? '')}</td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot>
                      <tr className="bg-[#e8f0fe] font-bold text-[#1e3a5f] text-xs">
                        <td className="px-4 py-2.5" colSpan={5}>TOTAIS</td>
                        <td className="px-4 py-2.5 text-center">{fmtNum(dados.reduce((s, r) => s + (Number(r.horas_trabalhadas) || 0), 0))}h</td>
                        <td className="px-4 py-2.5 text-center">{fmtNum(dados.reduce((s, r) => s + (Number(r.horas_extras) || 0), 0))}h</td>
                        <td className="px-4 py-2.5 text-center">{dados.filter(r => r.falta).length} faltas</td>
                        <td></td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              )}

              {/* ── Tabela: Produção Individual ── */}
              {relatAtivo === 'producao-individual' && (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead><tr className="bg-[#1e3a5f] text-white text-xs">
                      <th className="px-4 py-3 text-left">Atividade</th>
                      <th className="px-4 py-3 text-center">Unidade</th>
                      <th className="px-4 py-3 text-right">Quantidade</th>
                      <th className="px-4 py-3 text-right">Preço Unit.</th>
                      <th className="px-4 py-3 text-right">Total</th>
                    </tr></thead>
                    <tbody>
                      {dados.map((r, i) => (
                        <tr key={i} className={i % 2 === 0 ? 'bg-white' : 'bg-slate-50'}>
                          <td className="px-4 py-2.5">{String(r.descricao)}</td>
                          <td className="px-4 py-2.5 text-center"><span className="bg-blue-50 text-blue-700 text-xs px-2 py-0.5 rounded">{String(r.unidade)}</span></td>
                          <td className="px-4 py-2.5 text-right font-semibold">{fmtNum(r.quantidade as number)}</td>
                          <td className="px-4 py-2.5 text-right text-slate-500">{fmtCur(r.preco_unit as number)}</td>
                          <td className="px-4 py-2.5 text-right font-bold text-[#1e3a5f]">{fmtCur(r.total as number)}</td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot>
                      <tr className="bg-[#e8f0fe] font-bold text-[#1e3a5f]">
                        <td colSpan={4} className="px-4 py-2.5">TOTAL</td>
                        <td className="px-4 py-2.5 text-right">{fmtCur(dados.reduce((s, r) => s + (r.total as number), 0))}</td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              )}

              {/* ── Tabela: Ocorrências do Colaborador ── */}
              {relatAtivo === 'ocorrencias-colab' && (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead><tr className="bg-[#1e3a5f] text-white text-xs">
                      <th className="px-4 py-3 text-left">Data</th>
                      <th className="px-4 py-3 text-left">Tipo</th>
                      <th className="px-4 py-3 text-left">Descrição</th>
                      <th className="px-4 py-3 text-left">Complemento</th>
                      <th className="px-4 py-3 text-left">Status</th>
                    </tr></thead>
                    <tbody>
                      {dados.map((r, i) => (
                        <tr key={i} className={i % 2 === 0 ? 'bg-white' : 'bg-slate-50'}>
                          <td className="px-4 py-2.5 font-medium whitespace-nowrap">{fmtDate(r.data as string)}</td>
                          <td className="px-4 py-2.5">
                            <span className={`text-xs px-2 py-0.5 rounded-full font-semibold ${
                              r.tipo === 'Acidente' ? 'bg-red-100 text-red-700' :
                              r.tipo === 'Advertência' ? 'bg-orange-100 text-orange-700' :
                              r.tipo === 'Atestado' ? 'bg-blue-100 text-blue-700' :
                              'bg-slate-100 text-slate-600'
                            }`}>{String(r.tipo)}</span>
                          </td>
                          <td className="px-4 py-2.5 max-w-xs truncate">{String(r.descricao)}</td>
                          <td className="px-4 py-2.5 text-slate-500 text-xs">{String(r.extra)}</td>
                          <td className="px-4 py-2.5 text-xs">{String(r.status)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              {/* ── Tabela: Custo Total do Colaborador ── */}
              {relatAtivo === 'custo-colab' && (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead><tr className="bg-[#1e3a5f] text-white text-xs">
                      <th className="px-4 py-3 text-left">Mês</th>
                      <th className="px-4 py-3 text-right">Folha Bruta</th>
                      <th className="px-4 py-3 text-right">Adiantamentos</th>
                      <th className="px-4 py-3 text-right">VT Empresa</th>
                      <th className="px-4 py-3 text-right">Prêmios</th>
                      <th className="px-4 py-3 text-right font-bold">Total</th>
                    </tr></thead>
                    <tbody>
                      {dados.map((r, i) => (
                        <tr key={i} className={i % 2 === 0 ? 'bg-white' : 'bg-slate-50'}>
                          <td className="px-4 py-2.5 font-medium">{fmtMes(r.mes as string)}</td>
                          <td className="px-4 py-2.5 text-right">{fmtCur(r.folha_bruta as number)}</td>
                          <td className="px-4 py-2.5 text-right">{fmtCur(r.adiantamentos as number)}</td>
                          <td className="px-4 py-2.5 text-right">{fmtCur(r.vt_empresa as number)}</td>
                          <td className="px-4 py-2.5 text-right">{fmtCur(r.premios as number)}</td>
                          <td className="px-4 py-2.5 text-right font-bold text-[#1e3a5f]">{fmtCur(r.total as number)}</td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot>
                      <tr className="bg-[#e8f0fe] font-bold text-[#1e3a5f]">
                        <td className="px-4 py-2.5">TOTAL</td>
                        <td className="px-4 py-2.5 text-right">{fmtCur(dados.reduce((s, r) => s + (r.folha_bruta as number), 0))}</td>
                        <td className="px-4 py-2.5 text-right">{fmtCur(dados.reduce((s, r) => s + (r.adiantamentos as number), 0))}</td>
                        <td className="px-4 py-2.5 text-right">{fmtCur(dados.reduce((s, r) => s + (r.vt_empresa as number), 0))}</td>
                        <td className="px-4 py-2.5 text-right">{fmtCur(dados.reduce((s, r) => s + (r.premios as number), 0))}</td>
                        <td className="px-4 py-2.5 text-right">{fmtCur(dados.reduce((s, r) => s + (r.total as number), 0))}</td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              )}

              {/* ── Tabela: Headcount por Função ── */}
              {relatAtivo === 'headcount-funcao' && (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead><tr className="bg-[#1e3a5f] text-white text-xs">
                      <th className="px-4 py-3 text-left">Função</th>
                      <th className="px-4 py-3 text-left">Categoria</th>
                      <th className="px-4 py-3 text-center">Total</th>
                      <th className="px-4 py-3 text-center">CLT</th>
                      <th className="px-4 py-3 text-center">PJ</th>
                      <th className="px-4 py-3 text-right">Salário Médio</th>
                    </tr></thead>
                    <tbody>
                      {dados.map((r, i) => (
                        <tr key={i} className={i % 2 === 0 ? 'bg-white' : 'bg-slate-50'}>
                          <td className="px-4 py-2.5 font-medium">{String(r.funcao)}</td>
                          <td className="px-4 py-2.5 text-slate-500">{String(r.categoria)}</td>
                          <td className="px-4 py-2.5 text-center font-bold text-[#1e3a5f]">{String(r.total)}</td>
                          <td className="px-4 py-2.5 text-center">{String(r.clt)}</td>
                          <td className="px-4 py-2.5 text-center">{String(r.pj)}</td>
                          <td className="px-4 py-2.5 text-right font-semibold">{fmtCur(r.salario_medio as number)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              {/* ── Tabela: Custo por Função ── */}
              {relatAtivo === 'custo-funcao' && (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead><tr className="bg-[#1e3a5f] text-white text-xs">
                      <th className="px-4 py-3 text-left">Função</th>
                      <th className="px-4 py-3 text-center">Colaboradores</th>
                      <th className="px-4 py-3 text-right">Folha Bruta</th>
                      <th className="px-4 py-3 text-right">Folha Líquida</th>
                      <th className="px-4 py-3 text-right">Média por Colaborador</th>
                    </tr></thead>
                    <tbody>
                      {dados.map((r, i) => (
                        <tr key={i} className={i % 2 === 0 ? 'bg-white' : 'bg-slate-50'}>
                          <td className="px-4 py-2.5 font-medium">{String(r.funcao)}</td>
                          <td className="px-4 py-2.5 text-center">{String(r.colaboradores)}</td>
                          <td className="px-4 py-2.5 text-right">{fmtCur(r.bruto as number)}</td>
                          <td className="px-4 py-2.5 text-right">{fmtCur(r.liquido as number)}</td>
                          <td className="px-4 py-2.5 text-right font-semibold text-[#1e3a5f]">{fmtCur(r.colaboradores ? (r.bruto as number) / (r.colaboradores as number) : 0)}</td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot>
                      <tr className="bg-[#e8f0fe] font-bold text-[#1e3a5f]">
                        <td className="px-4 py-2.5">TOTAL</td>
                        <td className="px-4 py-2.5 text-center">{dados.reduce((s, r) => s + (r.colaboradores as number), 0)}</td>
                        <td className="px-4 py-2.5 text-right">{fmtCur(dados.reduce((s, r) => s + (r.bruto as number), 0))}</td>
                        <td className="px-4 py-2.5 text-right">{fmtCur(dados.reduce((s, r) => s + (r.liquido as number), 0))}</td>
                        <td></td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              )}

              {/* ── Tabela: Ranking de Produção ── */}
              {relatAtivo === 'ranking-producao' && (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead><tr className="bg-[#1e3a5f] text-white text-xs">
                      <th className="px-4 py-3 text-center w-12">#</th>
                      <th className="px-4 py-3 text-left">Colaborador</th>
                      <th className="px-4 py-3 text-center">Chapa</th>
                      <th className="px-4 py-3 text-left">Função</th>
                      <th className="px-4 py-3 text-right">Qtd Total</th>
                      <th className="px-4 py-3 text-right">Valor Total</th>
                    </tr></thead>
                    <tbody>
                      {dados.map((r, i) => (
                        <tr key={i} className={i % 2 === 0 ? 'bg-white' : 'bg-slate-50'}>
                          <td className="px-4 py-2.5 text-center">
                            <span className={`inline-flex items-center justify-center w-6 h-6 rounded-full text-xs font-bold ${i === 0 ? 'bg-yellow-400 text-white' : i === 1 ? 'bg-slate-300 text-white' : i === 2 ? 'bg-amber-600 text-white' : 'bg-slate-100 text-slate-500'}`}>{String(r.posicao)}</span>
                          </td>
                          <td className="px-4 py-2.5 font-medium">{String(r.colaborador)}</td>
                          <td className="px-4 py-2.5 text-center text-slate-500">{String(r.chapa)}</td>
                          <td className="px-4 py-2.5 text-slate-600">{String(r.funcao)}</td>
                          <td className="px-4 py-2.5 text-right font-semibold">{fmtNum(r.total_qtd as number)}</td>
                          <td className="px-4 py-2.5 text-right font-bold text-[#1e3a5f]">{fmtCur(r.total_valor as number)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              {/* ── Tabela: Resumo de Folha ── */}
              {relatAtivo === 'resumo-folha' && (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead><tr className="bg-[#1e3a5f] text-white text-xs">
                      <th className="px-4 py-3 text-left">Mês</th>
                      <th className="px-4 py-3 text-center">Colabs</th>
                      <th className="px-4 py-3 text-right">Bruto</th>
                      <th className="px-4 py-3 text-right">INSS</th>
                      <th className="px-4 py-3 text-right">IR</th>
                      <th className="px-4 py-3 text-right">Desc. VT</th>
                      <th className="px-4 py-3 text-right">Desc. AD</th>
                      <th className="px-4 py-3 text-right font-bold">Líquido</th>
                      <th className="px-4 py-3 text-right">Hs Normais</th>
                      <th className="px-4 py-3 text-right">Hs Extras</th>
                      <th className="px-4 py-3 text-right font-bold">Hs Totais</th>
                      <th className="px-4 py-3 text-right">Faltas</th>
                    </tr></thead>
                    <tbody>
                      {dados.map((r, i) => (
                        <tr key={i} className={i % 2 === 0 ? 'bg-white' : 'bg-slate-50'}>
                          <td className="px-4 py-2 font-medium">{fmtMes(r.mes as string)}</td>
                          <td className="px-4 py-2 text-center">{String(r.colaboradores)}</td>
                          <td className="px-4 py-2 text-right">{fmtCur(r.bruto as number)}</td>
                          <td className="px-4 py-2 text-right text-red-500">{fmtCur(r.inss as number)}</td>
                          <td className="px-4 py-2 text-right text-red-500">{fmtCur(r.ir as number)}</td>
                          <td className="px-4 py-2 text-right text-red-500">{fmtCur(r.vt as number)}</td>
                          <td className="px-4 py-2 text-right text-red-500">{fmtCur(r.ad as number)}</td>
                          <td className="px-4 py-2 text-right font-bold text-[#1e3a5f]">{fmtCur(r.liquido as number)}</td>
                          <td className="px-4 py-2 text-right text-slate-500">{fmtNum(r.horas as number)}h</td>
                          <td className="px-4 py-2 text-right text-green-600">{fmtNum(r.horas_extras as number)}h</td>
                          <td className="px-4 py-2 text-right font-bold text-[#1e3a5f]">{fmtNum(r.horas_total as number)}h</td>
                          <td className="px-4 py-2 text-right text-red-500">{String(r.faltas)}</td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot>
                      <tr className="bg-[#e8f0fe] font-bold text-[#1e3a5f] text-xs">
                        <td className="px-4 py-2.5">TOTAL</td>
                        <td className="px-4 py-2.5 text-center">{dados.reduce((s, r) => s + (r.colaboradores as number), 0)}</td>
                        <td className="px-4 py-2.5 text-right">{fmtCur(dados.reduce((s, r) => s + (r.bruto as number), 0))}</td>
                        <td className="px-4 py-2.5 text-right">{fmtCur(dados.reduce((s, r) => s + (r.inss as number), 0))}</td>
                        <td className="px-4 py-2.5 text-right">{fmtCur(dados.reduce((s, r) => s + (r.ir as number), 0))}</td>
                        <td className="px-4 py-2.5 text-right">{fmtCur(dados.reduce((s, r) => s + (r.vt as number), 0))}</td>
                        <td className="px-4 py-2.5 text-right">{fmtCur(dados.reduce((s, r) => s + (r.ad as number), 0))}</td>
                        <td className="px-4 py-2.5 text-right">{fmtCur(dados.reduce((s, r) => s + (r.liquido as number), 0))}</td>
                        <td className="px-4 py-2.5 text-right">{fmtNum(dados.reduce((s, r) => s + (r.horas as number), 0))}h</td>
                        <td className="px-4 py-2.5 text-right">{fmtNum(dados.reduce((s, r) => s + (r.horas_extras as number), 0))}h</td>
                        <td className="px-4 py-2.5 text-right">{fmtNum(dados.reduce((s, r) => s + (r.horas_total as number), 0))}h</td>
                        <td className="px-4 py-2.5 text-right">{dados.reduce((s, r) => s + (r.faltas as number), 0)}</td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              )}

              {/* ── Tabela: Provisões ── */}
              {relatAtivo === 'provisoes' && (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead><tr className="bg-[#1e3a5f] text-white text-xs">
                      <th className="px-4 py-3 text-left">Colaborador</th>
                      <th className="px-4 py-3 text-left">Função</th>
                      <th className="px-4 py-3 text-right">FGTS</th>
                      <th className="px-4 py-3 text-right">Férias</th>
                      <th className="px-4 py-3 text-right">13º</th>
                      <th className="px-4 py-3 text-right font-bold">Total</th>
                    </tr></thead>
                    <tbody>
                      {dados.map((r, i) => (
                        <tr key={i} className={i % 2 === 0 ? 'bg-white' : 'bg-slate-50'}>
                          <td className="px-4 py-2.5 font-medium">{String(r.colaborador)}</td>
                          <td className="px-4 py-2.5 text-slate-500">{String(r.funcao)}</td>
                          <td className="px-4 py-2.5 text-right">{fmtCur(r.fgts as number)}</td>
                          <td className="px-4 py-2.5 text-right">{fmtCur(r.ferias as number)}</td>
                          <td className="px-4 py-2.5 text-right">{fmtCur(r.decimo as number)}</td>
                          <td className="px-4 py-2.5 text-right font-bold text-[#1e3a5f]">{fmtCur(r.total as number)}</td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot>
                      <tr className="bg-[#e8f0fe] font-bold text-[#1e3a5f]">
                        <td colSpan={2} className="px-4 py-2.5">TOTAL</td>
                        <td className="px-4 py-2.5 text-right">{fmtCur(dados.reduce((s, r) => s + (r.fgts as number), 0))}</td>
                        <td className="px-4 py-2.5 text-right">{fmtCur(dados.reduce((s, r) => s + (r.ferias as number), 0))}</td>
                        <td className="px-4 py-2.5 text-right">{fmtCur(dados.reduce((s, r) => s + (r.decimo as number), 0))}</td>
                        <td className="px-4 py-2.5 text-right">{fmtCur(dados.reduce((s, r) => s + (r.total as number), 0))}</td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              )}

              {/* ── Tabela: Adiantamentos em Aberto ── */}
              {relatAtivo === 'adiantamentos-aberto' && (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead><tr className="bg-[#1e3a5f] text-white text-xs">
                      <th className="px-4 py-3 text-left">Colaborador</th>
                      <th className="px-4 py-3 text-center">Chapa</th>
                      <th className="px-4 py-3 text-left">Função</th>
                      <th className="px-4 py-3 text-center">Competência</th>
                      <th className="px-4 py-3 text-center">Tipo</th>
                      <th className="px-4 py-3 text-right">Valor</th>
                      <th className="px-4 py-3 text-center">Parcelas</th>
                      <th className="px-4 py-3 text-right">Restante</th>
                    </tr></thead>
                    <tbody>
                      {dados.map((r, i) => (
                        <tr key={i} className={i % 2 === 0 ? 'bg-white' : 'bg-slate-50'}>
                          <td className="px-4 py-2.5 font-medium">{String(r.colaborador)}</td>
                          <td className="px-4 py-2.5 text-center text-slate-500">{String(r.chapa)}</td>
                          <td className="px-4 py-2.5 text-slate-600">{String(r.funcao)}</td>
                          <td className="px-4 py-2.5 text-center">{String(r.competencia)}</td>
                          <td className="px-4 py-2.5 text-center"><span className="bg-amber-100 text-amber-800 text-xs px-2 py-0.5 rounded-full">{String(r.tipo)}</span></td>
                          <td className="px-4 py-2.5 text-right">{fmtCur(r.valor as number)}</td>
                          <td className="px-4 py-2.5 text-center text-slate-500">{String(r.parcelas)}</td>
                          <td className="px-4 py-2.5 text-right font-bold text-amber-700">{fmtCur(r.restante as number)}</td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot>
                      <tr className="bg-[#e8f0fe] font-bold text-[#1e3a5f]">
                        <td colSpan={5} className="px-4 py-2.5">TOTAL</td>
                        <td className="px-4 py-2.5 text-right">{fmtCur(dados.reduce((s, r) => s + Number(r.valor ?? 0), 0))}</td>
                        <td></td>
                        <td className="px-4 py-2.5 text-right">{fmtCur(dados.reduce((s, r) => s + Number(r.restante ?? 0), 0))}</td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              )}

              {/* ── Tabela: Custo Hora Médio ── */}
              {relatAtivo === 'custo-hora' && (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead><tr className="bg-[#1e3a5f] text-white text-xs">
                      <th className="px-4 py-3 text-left">Função</th>
                      <th className="px-4 py-3 text-center">Colaboradores</th>
                      <th className="px-4 py-3 text-right">Hs Normais</th>
                      <th className="px-4 py-3 text-right">Hs Extras</th>
                      <th className="px-4 py-3 text-right font-bold">Total Horas</th>
                      <th className="px-4 py-3 text-right">Custo Total</th>
                      <th className="px-4 py-3 text-right font-bold">Custo/Hora</th>
                    </tr></thead>
                    <tbody>
                      {dados.map((r, i) => (
                        <tr key={i} className={i % 2 === 0 ? 'bg-white' : 'bg-slate-50'}>
                          <td className="px-4 py-2.5 font-medium">{String(r.funcao)}</td>
                          <td className="px-4 py-2.5 text-center">{String(r.colaboradores)}</td>
                          <td className="px-4 py-2.5 text-right text-slate-500">{fmtNum((r.horas_total as number) - (r.horas_extras as number))}h</td>
                          <td className="px-4 py-2.5 text-right text-green-600">{fmtNum(r.horas_extras as number)}h</td>
                          <td className="px-4 py-2.5 text-right font-bold text-[#1e3a5f]">{fmtNum(r.horas_total as number)}h</td>
                          <td className="px-4 py-2.5 text-right">{fmtCur(r.bruto_total as number)}</td>
                          <td className="px-4 py-2.5 text-right font-bold text-[#1e3a5f]">{fmtCur(r.custo_hora as number)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              {/* ── Tabela: Painel de Acidentes ── */}
              {relatAtivo === 'painel-acidentes' && (
                <div>
                  <div className="flex gap-4 px-4 py-3 border-b border-slate-100">
                    <div className="flex-1 text-center p-3 bg-slate-50 rounded-lg">
                      <div className="text-2xl font-black text-[#1e3a5f]">{dados.length}</div>
                      <div className="text-xs text-slate-500 mt-1">Total de Acidentes</div>
                    </div>
                    <div className="flex-1 text-center p-3 bg-orange-50 rounded-lg">
                      <div className="text-2xl font-black text-orange-600">{dados.filter(r => String(r.gravidade).toLowerCase() === 'grave').length}</div>
                      <div className="text-xs text-slate-500 mt-1">Graves</div>
                    </div>
                    <div className="flex-1 text-center p-3 bg-red-50 rounded-lg">
                      <div className="text-2xl font-black text-red-600">{dados.filter(r => String(r.gravidade).toLowerCase() === 'fatal').length}</div>
                      <div className="text-xs text-slate-500 mt-1">Fatais</div>
                    </div>
                    <div className="flex-1 text-center p-3 bg-blue-50 rounded-lg">
                      <div className="text-2xl font-black text-blue-600">{dados.filter(r => r.cat === 'Sim').length}</div>
                      <div className="text-xs text-slate-500 mt-1">CAT Emitidas</div>
                    </div>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead><tr className="bg-[#1e3a5f] text-white text-xs">
                        <th className="px-4 py-3 text-left">Data</th>
                        <th className="px-4 py-3 text-left">Colaborador</th>
                        <th className="px-4 py-3 text-left">Obra</th>
                        <th className="px-4 py-3 text-left">Tipo</th>
                        <th className="px-4 py-3 text-center">Gravidade</th>
                        <th className="px-4 py-3 text-center">CAT</th>
                        <th className="px-4 py-3 text-center">Status</th>
                      </tr></thead>
                      <tbody>
                        {dados.map((r, i) => (
                          <tr key={i} className={i % 2 === 0 ? 'bg-white' : 'bg-slate-50'}>
                            <td className="px-4 py-2.5">{String(r.data)}</td>
                            <td className="px-4 py-2.5 font-medium">{String(r.colaborador)}</td>
                            <td className="px-4 py-2.5 text-slate-600">{String(r.obra)}</td>
                            <td className="px-4 py-2.5">{String(r.tipo ?? '—')}</td>
                            <td className="px-4 py-2.5 text-center">
                              <span className={`text-xs px-2 py-0.5 rounded-full font-semibold ${String(r.gravidade).toLowerCase() === 'grave' ? 'bg-orange-100 text-orange-700' : String(r.gravidade).toLowerCase() === 'fatal' ? 'bg-red-100 text-red-700' : 'bg-yellow-100 text-yellow-700'}`}>{String(r.gravidade ?? '—')}</span>
                            </td>
                            <td className="px-4 py-2.5 text-center">
                              <span className={`text-xs px-2 py-0.5 rounded-full ${r.cat === 'Sim' ? 'bg-blue-100 text-blue-700' : 'bg-slate-100 text-slate-500'}`}>{String(r.cat)}</span>
                            </td>
                            <td className="px-4 py-2.5 text-center text-slate-500 text-xs">{String(r.status ?? '—')}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* ── Tabela: Painel de Atestados ── */}
              {relatAtivo === 'painel-atestados' && (
                <div>
                  <div className="flex gap-4 px-4 py-3 border-b border-slate-100">
                    <div className="flex-1 text-center p-3 bg-slate-50 rounded-lg">
                      <div className="text-2xl font-black text-[#1e3a5f]">{dados.length}</div>
                      <div className="text-xs text-slate-500 mt-1">Total de Atestados</div>
                    </div>
                    <div className="flex-1 text-center p-3 bg-red-50 rounded-lg">
                      <div className="text-2xl font-black text-red-600">{dados.reduce((s, r) => s + (Number(r.dias) || 0), 0)}</div>
                      <div className="text-xs text-slate-500 mt-1">Dias Perdidos</div>
                    </div>
                    <div className="flex-1 text-center p-3 bg-orange-50 rounded-lg">
                      <div className="text-2xl font-black text-orange-600">{dados.filter(r => r.afastamento === 'Sim').length}</div>
                      <div className="text-xs text-slate-500 mt-1">Com Afastamento</div>
                    </div>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead><tr className="bg-[#1e3a5f] text-white text-xs">
                        <th className="px-4 py-3 text-left">Data</th>
                        <th className="px-4 py-3 text-left">Colaborador</th>
                        <th className="px-4 py-3 text-center">Tipo</th>
                        <th className="px-4 py-3 text-center">Dias</th>
                        <th className="px-4 py-3 text-center">CID</th>
                        <th className="px-4 py-3 text-left">Médico</th>
                        <th className="px-4 py-3 text-center">Afastamento</th>
                      </tr></thead>
                      <tbody>
                        {dados.map((r, i) => (
                          <tr key={i} className={i % 2 === 0 ? 'bg-white' : 'bg-slate-50'}>
                            <td className="px-4 py-2.5">{String(r.data)}</td>
                            <td className="px-4 py-2.5 font-medium">{String(r.colaborador)}</td>
                            <td className="px-4 py-2.5 text-center"><span className="bg-blue-50 text-blue-700 text-xs px-2 py-0.5 rounded">{String(r.tipo ?? '—')}</span></td>
                            <td className="px-4 py-2.5 text-center font-bold text-red-600">{String(r.dias)}</td>
                            <td className="px-4 py-2.5 text-center font-mono text-slate-600">{String(r.cid)}</td>
                            <td className="px-4 py-2.5 text-slate-500">{String(r.medico)}</td>
                            <td className="px-4 py-2.5 text-center">
                              <span className={`text-xs px-2 py-0.5 rounded-full ${r.afastamento === 'Sim' ? 'bg-red-100 text-red-700' : 'bg-green-100 text-green-700'}`}>{String(r.afastamento)}</span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* ── Tabela: EPIs Vencidos ── */}
              {relatAtivo === 'epis-vencidos' && (
                <div>
                  <div className="flex gap-4 px-4 py-3 border-b border-slate-100">
                    <div className="flex-1 text-center p-3 bg-red-50 rounded-lg">
                      <div className="text-2xl font-black text-red-600">{dados.filter(r => r.situacao === 'VENCIDO').length}</div>
                      <div className="text-xs text-slate-500 mt-1">Vencidos</div>
                    </div>
                    <div className="flex-1 text-center p-3 bg-orange-50 rounded-lg">
                      <div className="text-2xl font-black text-orange-600">{dados.filter(r => r.situacao === 'CRÍTICO').length}</div>
                      <div className="text-xs text-slate-500 mt-1">Críticos (≤7 dias)</div>
                    </div>
                    <div className="flex-1 text-center p-3 bg-yellow-50 rounded-lg">
                      <div className="text-2xl font-black text-yellow-600">{dados.filter(r => r.situacao === 'A VENCER').length}</div>
                      <div className="text-xs text-slate-500 mt-1">A Vencer</div>
                    </div>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead><tr className="bg-[#1e3a5f] text-white text-xs">
                        <th className="px-4 py-3 text-left">Colaborador</th>
                        <th className="px-4 py-3 text-center">Chapa</th>
                        <th className="px-4 py-3 text-left">EPI</th>
                        <th className="px-4 py-3 text-center">CA</th>
                        <th className="px-4 py-3 text-center">Categoria</th>
                        <th className="px-4 py-3 text-center">Validade</th>
                        <th className="px-4 py-3 text-center">Dias Rest.</th>
                        <th className="px-4 py-3 text-center">Situação</th>
                      </tr></thead>
                      <tbody>
                        {dados.map((r, i) => (
                          <tr key={i} className={r.situacao === 'VENCIDO' ? 'bg-red-50' : r.situacao === 'CRÍTICO' ? 'bg-orange-50' : i % 2 === 0 ? 'bg-white' : 'bg-slate-50'}>
                            <td className="px-4 py-2.5 font-medium">{String(r.colaborador)}</td>
                            <td className="px-4 py-2.5 text-center text-slate-500">{String(r.chapa)}</td>
                            <td className="px-4 py-2.5">{String(r.epi)}</td>
                            <td className="px-4 py-2.5 text-center font-mono text-xs">{String(r.ca)}</td>
                            <td className="px-4 py-2.5 text-center text-xs">{String(r.categoria)}</td>
                            <td className="px-4 py-2.5 text-center">{String(r.data_validade)}</td>
                            <td className="px-4 py-2.5 text-center font-semibold">{r.dias_restantes != null ? `${r.dias_restantes}d` : '—'}</td>
                            <td className="px-4 py-2.5 text-center">
                              <span className={`text-xs px-2 py-0.5 rounded-full font-bold ${r.situacao === 'VENCIDO' ? 'bg-red-200 text-red-800' : r.situacao === 'CRÍTICO' ? 'bg-orange-200 text-orange-800' : 'bg-yellow-100 text-yellow-800'}`}>{String(r.situacao)}</span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* ── Tabela: Aniversariantes ── */}
              {relatAtivo === 'aniversariantes' && (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead><tr className="bg-[#1e3a5f] text-white text-xs">
                      <th className="px-4 py-3 text-left">Nome</th>
                      <th className="px-4 py-3 text-center">Chapa</th>
                      <th className="px-4 py-3 text-center">Nascimento</th>
                      <th className="px-4 py-3 text-center">Idade</th>
                      <th className="px-4 py-3 text-left">Função</th>
                      <th className="px-4 py-3 text-left">Obra</th>
                      <th className="px-4 py-3 text-left">Telefone</th>
                    </tr></thead>
                    <tbody>
                      {dados.map((r, i) => (
                        <tr key={i} className={i % 2 === 0 ? 'bg-white' : 'bg-slate-50'}>
                          <td className="px-4 py-2.5 font-medium">
                            <span className="mr-1">🎂</span>{String(r.nome)}
                          </td>
                          <td className="px-4 py-2.5 text-center text-slate-500">{String(r.chapa)}</td>
                          <td className="px-4 py-2.5 text-center">{String(r.data_nascimento)}</td>
                          <td className="px-4 py-2.5 text-center">
                            <span className="bg-pink-100 text-pink-700 text-xs px-2 py-0.5 rounded-full font-semibold">{String(r.idade)} anos</span>
                          </td>
                          <td className="px-4 py-2.5 text-slate-600">{String(r.funcao)}</td>
                          <td className="px-4 py-2.5 text-slate-600">{String(r.obra)}</td>
                          <td className="px-4 py-2.5 text-slate-500">{String(r.telefone)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              {/* ── Tabela: Contratos Vencendo ── */}
              {relatAtivo === 'contratos-vencendo' && (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead><tr className="bg-[#1e3a5f] text-white text-xs">
                      <th className="px-4 py-3 text-left">Nome</th>
                      <th className="px-4 py-3 text-center">Chapa</th>
                      <th className="px-4 py-3 text-center">Admissão</th>
                      <th className="px-4 py-3 text-center">Vencimento</th>
                      <th className="px-4 py-3 text-center">Dias Restantes</th>
                      <th className="px-4 py-3 text-center">Tipo Contrato</th>
                      <th className="px-4 py-3 text-left">Função</th>
                      <th className="px-4 py-3 text-left">Obra</th>
                    </tr></thead>
                    <tbody>
                      {dados.map((r, i) => (
                        <tr key={i} className={Number(r.dias_restantes) <= 7 ? 'bg-red-50' : i % 2 === 0 ? 'bg-white' : 'bg-slate-50'}>
                          <td className="px-4 py-2.5 font-medium">{String(r.nome)}</td>
                          <td className="px-4 py-2.5 text-center text-slate-500">{String(r.chapa)}</td>
                          <td className="px-4 py-2.5 text-center">{String(r.data_admissao)}</td>
                          <td className="px-4 py-2.5 text-center font-semibold">{String(r.data_vencimento)}</td>
                          <td className="px-4 py-2.5 text-center">
                            <span className={`text-xs px-2 py-0.5 rounded-full font-bold ${Number(r.dias_restantes) <= 7 ? 'bg-red-200 text-red-800' : Number(r.dias_restantes) <= 15 ? 'bg-orange-100 text-orange-700' : 'bg-yellow-100 text-yellow-700'}`}>{r.dias_restantes != null ? `${r.dias_restantes}d` : '—'}</span>
                          </td>
                          <td className="px-4 py-2.5 text-center text-xs">{String(r.tipo_contrato)}</td>
                          <td className="px-4 py-2.5 text-slate-600">{String(r.funcao)}</td>
                          <td className="px-4 py-2.5 text-slate-600">{String(r.obra)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              {/* ── Tabela: Playbook de Atividades ── */}
              {relatAtivo === 'playbook-atividades' && (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead><tr className="bg-[#1e3a5f] text-white text-xs">
                      <th className="px-4 py-3 text-left">Obra</th>
                      <th className="px-4 py-3 text-center">Categoria</th>
                      <th className="px-4 py-3 text-left">Descrição</th>
                      <th className="px-4 py-3 text-center">Unidade</th>
                      <th className="px-4 py-3 text-right">Preço Unit.</th>
                      <th className="px-4 py-3 text-center">Ativo</th>
                    </tr></thead>
                    <tbody>
                      {dados.map((r, i) => (
                        <tr key={i} className={i % 2 === 0 ? 'bg-white' : 'bg-slate-50'}>
                          <td className="px-4 py-2.5 font-medium">{String(r.obra)}</td>
                          <td className="px-4 py-2.5 text-center"><span className="bg-purple-50 text-purple-700 text-xs px-2 py-0.5 rounded">{String(r.categoria)}</span></td>
                          <td className="px-4 py-2.5">{String(r.descricao)}</td>
                          <td className="px-4 py-2.5 text-center"><span className="bg-blue-50 text-blue-700 text-xs px-2 py-0.5 rounded font-mono">{String(r.unidade)}</span></td>
                          <td className="px-4 py-2.5 text-right font-semibold text-[#1e3a5f]">{fmtCur(r.preco as number)}</td>
                          <td className="px-4 py-2.5 text-center">
                            <span className={`text-xs px-2 py-0.5 rounded-full ${r.ativo === 'Sim' ? 'bg-green-100 text-green-700' : 'bg-slate-100 text-slate-500'}`}>{String(r.ativo)}</span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              {/* ── Tabela: Histórico de Advertências ── */}
              {relatAtivo === 'historico-advertencias' && (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead><tr className="bg-[#1e3a5f] text-white text-xs">
                      <th className="px-4 py-3 text-left">Data</th>
                      <th className="px-4 py-3 text-left">Colaborador</th>
                      <th className="px-4 py-3 text-center">Chapa</th>
                      <th className="px-4 py-3 text-left">Função</th>
                      <th className="px-4 py-3 text-left">Obra</th>
                      <th className="px-4 py-3 text-center">Tipo</th>
                      <th className="px-4 py-3 text-left">Motivo</th>
                      <th className="px-4 py-3 text-center">Susp. (dias)</th>
                      <th className="px-4 py-3 text-center">Assinada</th>
                    </tr></thead>
                    <tbody>
                      {dados.map((r, i) => (
                        <tr key={i} className={i % 2 === 0 ? 'bg-white' : 'bg-slate-50'}>
                          <td className="px-4 py-2.5 whitespace-nowrap">{String(r.data)}</td>
                          <td className="px-4 py-2.5 font-medium">{String(r.colaborador)}</td>
                          <td className="px-4 py-2.5 text-center text-slate-500">{String(r.chapa)}</td>
                          <td className="px-4 py-2.5 text-slate-600">{String(r.funcao)}</td>
                          <td className="px-4 py-2.5 text-slate-600">{String(r.obra)}</td>
                          <td className="px-4 py-2.5 text-center"><span className="bg-orange-100 text-orange-700 text-xs px-2 py-0.5 rounded-full">{String(r.tipo)}</span></td>
                          <td className="px-4 py-2.5 max-w-xs text-xs text-slate-600">{String(r.motivo)}</td>
                          <td className="px-4 py-2.5 text-center">{Number(r.dias_suspensao) > 0 ? <span className="bg-red-100 text-red-700 text-xs px-2 py-0.5 rounded-full">{String(r.dias_suspensao)}d</span> : '—'}</td>
                          <td className="px-4 py-2.5 text-center">
                            <span className={`text-xs px-2 py-0.5 rounded-full ${r.assinada === 'Sim' ? 'bg-green-100 text-green-700' : 'bg-slate-100 text-slate-500'}`}>{String(r.assinada)}</span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              {/* ── Tabela: Coeficiente de Produção ── */}
              {relatAtivo === 'coeficiente-producao' && (() => {
                const porCategoria: Record<string, Record<string, unknown>[]> = {}
                dados.forEach(r => {
                  const cat = String(r.categoria ?? 'Geral')
                  if (!porCategoria[cat]) porCategoria[cat] = []
                  porCategoria[cat].push(r)
                })
                const totalQtd = dados.reduce((s,r) => s + (r.quantidade as number), 0)
                const totalH   = dados.reduce((s,r) => s + (r.horas_totais as number), 0)
                return (
                  <div>
                    <div className="flex gap-3 px-4 py-3 border-b border-slate-100 flex-wrap">
                      <div className="flex-1 min-w-[110px] text-center p-3 bg-slate-50 rounded-lg">
                        <div className="text-2xl font-black text-[#1e3a5f]">{dados.length}</div>
                        <div className="text-[10px] text-slate-500 mt-1 uppercase tracking-wide">Combinações</div>
                      </div>
                      <div className="flex-1 min-w-[110px] text-center p-3 bg-blue-50 rounded-lg">
                        <div className="text-2xl font-black text-blue-700">{fmtNum(totalQtd)}</div>
                        <div className="text-[10px] text-slate-500 mt-1 uppercase tracking-wide">Total Produzido</div>
                      </div>
                      <div className="flex-1 min-w-[110px] text-center p-3 bg-green-50 rounded-lg">
                        <div className="text-2xl font-black text-green-700">{fmtNum(totalH)}h</div>
                        <div className="text-[10px] text-slate-500 mt-1 uppercase tracking-wide">Horas Totais</div>
                      </div>
                      <div className="flex-1 min-w-[110px] text-center p-3 bg-emerald-50 rounded-lg">
                        <div className="text-2xl font-black text-emerald-700">{totalH > 0 ? fmtNum(totalQtd/totalH) : '—'}</div>
                        <div className="text-[10px] text-slate-500 mt-1 uppercase tracking-wide">Coef. Geral un/h</div>
                      </div>
                    </div>
                    {Object.entries(porCategoria).map(([cat, rows]) => (
                      <div key={cat}>
                        <div className="px-4 py-2 bg-[#f1f5f9] border-y border-slate-200 text-[11px] font-bold text-[#1e3a5f] uppercase tracking-wide flex items-center gap-2">
                          <span>📦 {cat}</span>
                          <span className="text-slate-400 font-normal">— {rows.length} item(ns)</span>
                        </div>
                        <div className="overflow-x-auto">
                          <table className="w-full text-sm">
                            <thead>
                              <tr className="bg-[#1e3a5f] text-white text-[10px]">
                                <th className="px-3 py-2.5 text-left">Atividade</th>
                                <th className="px-3 py-2.5 text-left">Função</th>
                                <th className="px-3 py-2.5 text-center">Un</th>
                                <th className="px-3 py-2.5 text-right">Qtd</th>
                                <th className="px-3 py-2.5 text-right">Horas</th>
                                <th className="px-3 py-2.5 text-right font-bold">Coeficiente</th>
                                <th className="px-3 py-2.5 text-right">R$/un</th>
                                <th className="px-3 py-2.5 text-center">Colabs</th>
                              </tr>
                            </thead>
                            <tbody>
                              {rows.map((r, i) => (
                                <tr key={i} className={i % 2 === 0 ? 'bg-white' : 'bg-slate-50'}>
                                  <td className="px-3 py-2 font-medium text-slate-800">{String(r.descricao)}</td>
                                  <td className="px-3 py-2 text-slate-500 text-xs">{String(r.funcao)}</td>
                                  <td className="px-3 py-2 text-center"><span className="bg-blue-50 text-blue-700 text-xs px-1.5 py-0.5 rounded font-mono">{String(r.unidade)}</span></td>
                                  <td className="px-3 py-2 text-right font-semibold">{fmtNum(r.quantidade as number)}</td>
                                  <td className="px-3 py-2 text-right text-slate-500">{fmtNum(r.horas_totais as number)}h</td>
                                  <td className="px-3 py-2 text-right">
                                    <span className="bg-emerald-100 text-emerald-800 font-bold text-xs px-2 py-0.5 rounded-full">
                                      {(r.horas_totais as number) > 0 ? `${fmtNum(r.coeficiente as number)} ${String(r.unidade)}/h` : '—'}
                                    </span>
                                  </td>
                                  <td className="px-3 py-2 text-right text-slate-600">{fmtCur(r.custo_por_unidade as number)}</td>
                                  <td className="px-3 py-2 text-center text-slate-500">{String(r.colaboradores)}</td>
                                </tr>
                              ))}
                            </tbody>
                            <tfoot>
                              <tr className="bg-[#e8f0fe] font-bold text-[#1e3a5f] text-xs">
                                <td colSpan={3} className="px-3 py-2">SUBTOTAL {cat.toUpperCase()}</td>
                                <td className="px-3 py-2 text-right">{fmtNum(rows.reduce((s,r) => s + (r.quantidade as number), 0))}</td>
                                <td className="px-3 py-2 text-right">{fmtNum(rows.reduce((s,r) => s + (r.horas_totais as number), 0))}h</td>
                                <td className="px-3 py-2 text-right">
                                  {(() => { const tq = rows.reduce((s,r) => s + (r.quantidade as number),0); const th = rows.reduce((s,r) => s + (r.horas_totais as number),0); return th > 0 ? `${fmtNum(tq/th)} un/h` : '—' })()}
                                </td>
                                <td colSpan={2}></td>
                              </tr>
                            </tfoot>
                          </table>
                        </div>
                      </div>
                    ))}
                  </div>
                )
              })()}

              {/* ── Tabela: Meta vs Realizado (agrupado por função) ── */}
              {relatAtivo === 'meta-realizado' && (() => {
                const porFuncao: Record<string, Record<string, unknown>[]> = {}
                dados.forEach(r => {
                  const f = String(r.funcao ?? '(Sem Função)')
                  if (!porFuncao[f]) porFuncao[f] = []
                  porFuncao[f].push(r)
                })
                return (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="bg-[#1e3a5f] text-white text-xs">
                          {['Colaborador', 'Meta (h)', 'Hs Normais', 'Hs Extras', 'Total Real.', 'Faltas', 'Diferença (h)', '% Atingido', 'Custo/Hora'].map(h => (
                            <th key={h} className="px-4 py-3 text-left">{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {Object.entries(porFuncao).map(([funcao, rows]) => (
                          <React.Fragment key={funcao}>
                            <tr>
                              <td colSpan={9} className="px-4 py-1.5 bg-[#f1f5f9] text-[10px] font-bold text-[#1e3a5f] uppercase tracking-wide border-t-2 border-[#1e3a5f]">
                                🔧 {funcao} — {rows.length} colaborador(es)
                                <span className="ml-3 font-normal text-slate-500">
                                  Total: {fmtNum(rows.reduce((s,r) => s + (r.horas_realizadas as number), 0))}h realizadas
                                </span>
                              </td>
                            </tr>
                            {rows.map((r, i) => (
                              <tr key={i} className={i % 2 === 0 ? 'bg-white' : 'bg-slate-50'}>
                                <td className="px-4 py-2.5 font-medium">{String(r.colaborador)}</td>
                                <td className="px-4 py-2.5 text-right">{String(r.meta_horas)}h</td>
                                <td className="px-4 py-2.5 text-right text-slate-500">{fmtNum(r.horas_normais as number)}h</td>
                                <td className="px-4 py-2.5 text-right text-green-600 font-semibold">{fmtNum(r.horas_extras as number)}h</td>
                                <td className="px-4 py-2.5 text-right font-bold text-[#1e3a5f]">{fmtNum(r.horas_realizadas as number)}h</td>
                                <td className="px-4 py-2.5 text-right text-red-600">{String(r.faltas)}</td>
                                <td className={`px-4 py-2.5 text-right font-semibold ${Number(r.diferenca) >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                                  {Number(r.diferenca) >= 0 ? '+' : ''}{fmtNum(r.diferenca as number)}h
                                </td>
                                <td className="px-4 py-2.5 text-right">
                                  <span className={`text-xs px-2 py-0.5 rounded-full font-semibold ${Number(r.pct_atingido) >= 95 ? 'bg-green-100 text-green-700' : Number(r.pct_atingido) >= 80 ? 'bg-yellow-100 text-yellow-700' : 'bg-red-100 text-red-700'}`}>
                                    {String(r.pct_atingido)}%
                                  </span>
                                </td>
                                <td className="px-4 py-2.5 text-right font-semibold text-[#1e3a5f]">{fmtCur(r.custo_hora as number)}</td>
                              </tr>
                            ))}
                          </React.Fragment>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )
              })()}

              {/* ── Tabelas genéricas (Evolução de Horas, Produtividade por Função, Produção Playbook) ── */}
              {['evolucao-horas', 'producao-funcao', 'producao-playbook'].includes(relatAtivo) && (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="bg-[#1e3a5f] text-white text-xs">
                        {relatAtivo === 'evolucao-horas' && ['Mês', 'Colaboradores', 'Hs Normais', 'Hs Extras', 'Total Horas', 'Faltas', 'Média Hs/Colab'].map(h => <th key={h} className="px-4 py-3 text-left">{h}</th>)}
                        {relatAtivo === 'producao-funcao' && ['Função', 'Categoria', 'Qtd Total', 'Lançamentos', 'Média por Lanç.'].map(h => <th key={h} className="px-4 py-3 text-left">{h}</th>)}
                        {relatAtivo === 'producao-playbook' && ['Atividade', 'Unidade', 'Categoria', 'Preço Unit.', 'Qtd Total', 'Lançamentos', 'Total', 'Horas Totais', 'Coeficiente'].map(h => <th key={h} className="px-4 py-3 text-left">{h}</th>)}
                      </tr>
                    </thead>
                    <tbody>
                      {dados.map((r, i) => (
                        <tr key={i} className={i % 2 === 0 ? 'bg-white' : 'bg-slate-50'}>
                          {relatAtivo === 'evolucao-horas' && [
                            <td key="m" className="px-4 py-2.5 font-medium">{fmtMes(r.mes as string)}</td>,
                            <td key="c" className="px-4 py-2.5">{String(r.colaboradores)}</td>,
                            <td key="hn" className="px-4 py-2.5 text-right text-slate-500">{fmtNum(r.horas_normais as number)}h</td>,
                            <td key="he" className="px-4 py-2.5 text-right text-green-600 font-semibold">{fmtNum(r.horas_extras as number)}h</td>,
                            <td key="h" className="px-4 py-2.5 text-right font-bold text-[#1e3a5f]">{fmtNum(r.horas as number)}h</td>,
                            <td key="f" className="px-4 py-2.5 text-right text-red-600 font-semibold">{String(r.faltas)}</td>,
                            <td key="avg" className="px-4 py-2.5 text-right">{r.colaboradores ? fmtNum((r.horas as number) / (r.colaboradores as number)) : '0.00'}h</td>,
                          ]}
                          {relatAtivo === 'producao-funcao' && [
                            <td key="f" className="px-4 py-2.5 font-medium">{String(r.funcao)}</td>,
                            <td key="c" className="px-4 py-2.5"><span className="bg-purple-50 text-purple-700 text-xs px-2 py-0.5 rounded">{String(r.categoria)}</span></td>,
                            <td key="t" className="px-4 py-2.5 text-right font-bold text-[#1e3a5f]">{fmtNum(r.total as number)}</td>,
                            <td key="l" className="px-4 py-2.5 text-right">{String(r.lancamentos)}</td>,
                            <td key="avg" className="px-4 py-2.5 text-right">{fmtNum(r.media as number)}</td>,
                          ]}
                          {relatAtivo === 'producao-playbook' && [
                            <td key="d" className="px-4 py-2.5 font-medium">{String(r.descricao)}</td>,
                            <td key="u" className="px-4 py-2.5 text-center"><span className="bg-blue-50 text-blue-700 text-xs px-2 py-0.5 rounded font-mono">{String(r.unidade)}</span></td>,
                            <td key="c" className="px-4 py-2.5"><span className="bg-purple-50 text-purple-700 text-xs px-2 py-0.5 rounded">{String(r.categoria)}</span></td>,
                            <td key="p" className="px-4 py-2.5 text-right">{fmtCur(r.preco as number)}</td>,
                            <td key="q" className="px-4 py-2.5 text-right font-semibold">{fmtNum(r.qtd as number)}</td>,
                            <td key="l" className="px-4 py-2.5 text-right text-slate-500">{String(r.lancamentos)}</td>,
                            <td key="t" className="px-4 py-2.5 text-right font-bold text-[#1e3a5f]">{fmtCur(r.total as number)}</td>,
                            <td key="h" className="px-4 py-2.5 text-right text-slate-600">{(r.horas_totais as number) > 0 ? `${fmtNum(r.horas_totais as number)}h` : '—'}</td>,
                            <td key="cf" className="px-4 py-2.5 text-right font-semibold text-emerald-700">{(r.coeficiente as number) > 0 ? `${(r.coeficiente as number).toLocaleString('pt-BR', {minimumFractionDigits:2,maximumFractionDigits:2})} ${String(r.unidade)}/h` : '—'}</td>,
                          ]}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

            </div>
          )}
        </div>
      </main>
    </div>
  )
}
