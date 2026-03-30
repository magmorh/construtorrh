import React, { useEffect, useState, useCallback } from 'react'
import { useRefreshOnFocus } from '@/hooks/useRefreshOnFocus'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/hooks/useAuth'
import { useProfile } from '@/hooks/useProfile'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer,
} from 'recharts'
import {
  Users, Building2, DollarSign, AlertTriangle,
  TrendingUp, Award, FileText, Shield,
  CheckCircle2, Clock, ChevronRight, Briefcase,
} from 'lucide-react'
import { formatCurrency } from '@/lib/utils'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { useNavigate } from 'react-router-dom'

// ─── Helpers de data ──────────────────────────────────────────────────────────

function currentYYYYMM(): string {
  const now = new Date()
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
}

function currentMonthRange(): { start: string; end: string } {
  const now = new Date()
  const start = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0, 10)
  const end   = new Date(now.getFullYear(), now.getMonth() + 1, 0).toISOString().slice(0, 10)
  return { start, end }
}

function saudacao(): string {
  const h = new Date().getHours()
  if (h < 12) return 'Bom dia'
  if (h < 18) return 'Boa tarde'
  return 'Boa noite'
}

function dataPtBR(): string {
  return new Date().toLocaleDateString('pt-BR', {
    weekday: 'long', day: '2-digit', month: 'long', year: 'numeric',
  })
}

/** Retorna array com os últimos N meses no formato YYYY-MM (do mais antigo ao mais recente) */
function lastNMonths(n: number): string[] {
  const result: string[] = []
  const now = new Date()
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
    result.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`)
  }
  return result
}

const MES_ABREV: Record<string, string> = {
  '01': 'Jan', '02': 'Fev', '03': 'Mar', '04': 'Abr',
  '05': 'Mai', '06': 'Jun', '07': 'Jul', '08': 'Ago',
  '09': 'Set', '10': 'Out', '11': 'Nov', '12': 'Dez',
}

function mesAbrev(yyyyMM: string): string {
  const [, mm] = yyyyMM.split('-')
  return MES_ABREV[mm] ?? mm
}

// ─── Types ────────────────────────────────────────────────────────────────────

interface FolhaBarData {
  mes: string
  valor: number
}

interface HeadcountObra {
  obra: string
  clt: number
  autonomo: number
  total: number
}

interface AtividadeRecente {
  id: string
  colaborador_nome: string
  mes_referencia: string
  snap_liquido: number
}

interface DashboardData {
  // KPIs
  totalAtivos: number
  totalCLT: number
  totalAutonomo: number
  obrasAndamento: number
  folhaMesAtual: number
  totalProvisionado: number
  adPendenteValor: number
  adPendenteCount: number
  // Gráfico
  folhaMensal: FolhaBarData[]
  // Headcount
  headcountObra: HeadcountObra[]
  // Atividade
  atividadeRecente: AtividadeRecente[]
  // Linha 3
  atestadosMes: number
  premiosAprovadosCount: number
  premiosAprovadosValor: number
  rescisoesMes: number
  rescisoesMesValor: number
  // Alertas
  lancamentosAguardando: number
  // Config
  empresaNome: string
}

// ─── Skeleton ─────────────────────────────────────────────────────────────────

function SkeletonBox({ h = 'h-20', w = 'w-full' }: { h?: string; w?: string }) {
  return (
    <div className={`${w} ${h} rounded-xl bg-gray-100 animate-pulse`} />
  )
}

function DashboardSkeleton() {
  return (
    <div className="flex flex-col gap-6 p-6">
      <SkeletonBox h="h-16" />
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-5 gap-4">
        {Array.from({ length: 5 }).map((_, i) => <SkeletonBox key={i} h="h-28" />)}
      </div>
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
        <SkeletonBox h="h-64 xl:col-span-2" />
        <SkeletonBox h="h-64" />
        <SkeletonBox h="h-64" />
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {Array.from({ length: 3 }).map((_, i) => <SkeletonBox key={i} h="h-24" />)}
      </div>
    </div>
  )
}

// ─── Sub-componentes ──────────────────────────────────────────────────────────

interface KpiCardProps {
  icon: React.ReactNode
  iconBg: string
  title: string
  value: string | number
  sub?: string
  onClick?: () => void
}

function KpiCard({ icon, iconBg, title, value, sub, onClick }: KpiCardProps) {
  return (
    <div
      onClick={onClick}
      style={{
        background: '#fff',
        borderRadius: 14,
        boxShadow: '0 1px 6px rgba(0,0,0,.07)',
        border: '1px solid #f0f0f0',
        padding: '18px 20px',
        display: 'flex',
        alignItems: 'center',
        gap: 14,
        cursor: onClick ? 'pointer' : 'default',
        transition: 'box-shadow .15s',
      }}
      onMouseEnter={e => { if (onClick) (e.currentTarget as HTMLDivElement).style.boxShadow = '0 4px 16px rgba(0,0,0,.11)' }}
      onMouseLeave={e => { if (onClick) (e.currentTarget as HTMLDivElement).style.boxShadow = '0 1px 6px rgba(0,0,0,.07)' }}
    >
      <div style={{ background: iconBg, borderRadius: 10, width: 46, height: 46, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
        {icon}
      </div>
      <div style={{ minWidth: 0 }}>
        <div style={{ fontSize: 11, color: '#6b7280', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '.04em', marginBottom: 2 }}>{title}</div>
        <div style={{ fontSize: 22, fontWeight: 800, color: '#111827', lineHeight: 1.1, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{value}</div>
        {sub && <div style={{ fontSize: 11, color: '#9ca3af', marginTop: 2 }}>{sub}</div>}
      </div>
    </div>
  )
}

// ─── Custom Tooltip do gráfico ────────────────────────────────────────────────

function CustomTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null
  return (
    <div style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 9, padding: '9px 14px', fontSize: 12, boxShadow: '0 4px 14px rgba(0,0,0,.1)' }}>
      <div style={{ fontWeight: 700, color: '#374151', marginBottom: 3 }}>{label}</div>
      <div style={{ color: '#3b82f6', fontWeight: 700 }}>{formatCurrency(payload[0].value)}</div>
    </div>
  )
}

// ─── Componente principal ─────────────────────────────────────────────────────

export default function Dashboard() {
  const { user } = useAuth()
  const { profile } = useProfile()
  const navigate   = useNavigate()

  const [data,    setData]    = useState<DashboardData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error,   setError]   = useState<string | null>(null)

  const fetchAll = useCallback(async () => {
    try {
      setLoading(true)
      const mesAtual  = currentYYYYMM()
      const ultimos6  = lastNMonths(6)
      const { start: mesStart, end: mesEnd } = currentMonthRange()

        // ── Todas as queries em paralelo ──────────────────────────────────────
        const [
          colaboradoresRes,
          obrasRes,
          folhaMesRes,
          lancamentosProvRes,
          adiantamentosRes,
          folhaSeisMesesRes,
          headcountRawRes,
          atividadeRes,
          atestadosRes,
          premiosRes,
          rescisoesMesRes,
          lancAguardandoRes,
          configRes,
        ] = await Promise.all([
          // 1. Colaboradores ativos com tipo_contrato
          supabase
            .from('colaboradores')
            .select('id, tipo_contrato')
            .eq('status', 'ativo'),

          // 2. Obras ativas (aceita 'ativo', 'em_andamento' e 'andamento')
          supabase
            .from('obras')
            .select('id', { count: 'exact', head: true })
            .in('status', ['ativo', 'em_andamento', 'andamento']),

          // 3. Folha mês atual (snap_liquido, status liberado/pago)
          supabase
            .from('ponto_lancamentos')
            .select('snap_liquido')
            .eq('mes_referencia', mesAtual)
            .in('status', ['liberado', 'pago']),

          // 4. Provisionamento: lançamentos CLT liberados/pagos (todos os meses)
          supabase
            .from('ponto_lancamentos')
            .select('snap_valor_horas, snap_valor_dsr, colaborador_id')
            .in('status', ['liberado', 'pago']),

          // 5. Adiantamentos pendentes/aprovados
          supabase
            .from('adiantamentos')
            .select('valor')
            .in('status', ['pendente', 'aprovado']),

          // 6. Folha 6 meses p/ gráfico
          supabase
            .from('ponto_lancamentos')
            .select('mes_referencia, snap_liquido')
            .in('mes_referencia', ultimos6)
            .in('status', ['liberado', 'pago']),

          // 7. Colaboradores ativos com obra e tipo_contrato p/ headcount
          supabase
            .from('colaboradores')
            .select('tipo_contrato, obras(nome)')
            .eq('status', 'ativo'),

          // 8. Atividade recente: 5 últimos lançamentos liberados/pagos
          supabase
            .from('ponto_lancamentos')
            .select('id, mes_referencia, snap_liquido, colaboradores(nome)')
            .in('status', ['liberado', 'pago'])
            .order('created_at', { ascending: false })
            .limit(5),

          // 9. Atestados do mês
          supabase
            .from('atestados')
            .select('id', { count: 'exact', head: true })
            .gte('data', mesStart)
            .lte('data', mesEnd),

          // 10. Prêmios aprovados
          supabase
            .from('premios')
            .select('valor')
            .eq('status', 'aprovado'),

          // 11. Rescisões do mês
          supabase
            .from('rescisoes')
            .select('total_rescisao')
            .gte('data_rescisao', mesStart)
            .lte('data_rescisao', mesEnd),

          // 12. Lançamentos aguardando aprovação
          supabase
            .from('ponto_lancamentos')
            .select('id', { count: 'exact', head: true })
            .eq('status', 'aguardando_aprovacao'),

          // 13. Configurações da empresa
          supabase
            .from('configuracoes')
            .select('chave, valor')
            .in('chave', ['empresa_nome']),
        ])

        // ── KPI 1: colaboradores ──────────────────────────────────────────────
        const colaboradores   = (colaboradoresRes.data ?? []) as any[]
        const totalAtivos     = colaboradores.length
        const totalCLT        = colaboradores.filter((c: any) => (c.tipo_contrato ?? '').toLowerCase() === 'clt').length
        const totalAutonomo   = colaboradores.filter((c: any) => (c.tipo_contrato ?? '').toLowerCase() !== 'clt').length

        // ── KPI 2: obras ──────────────────────────────────────────────────────
        const obrasAndamento  = obrasRes.count ?? 0

        // ── KPI 3: folha mês ─────────────────────────────────────────────────
        const folhaMesAtual   = ((folhaMesRes.data ?? []) as any[])
          .reduce((s: number, r: any) => s + (r.snap_liquido ?? 0), 0)

        // ── KPI 4: provisionamento 27,44% sobre horas+DSR de CLT ─────────────
        // precisamos saber quais colaboradores são CLT
        const cltIds = new Set(
          colaboradores
            .filter((c: any) => (c.tipo_contrato ?? '').toLowerCase() === 'clt')
            .map((c: any) => c.id)
        )
        const totalProvisionado = ((lancamentosProvRes.data ?? []) as any[])
          .filter((r: any) => cltIds.has(r.colaborador_id))
          .reduce((s: number, r: any) => {
            const base = (r.snap_valor_horas ?? 0) + (r.snap_valor_dsr ?? 0)
            return s + base * 0.2744
          }, 0)

        // ── KPI 5: adiantamentos pendentes ───────────────────────────────────
        const adLista         = (adiantamentosRes.data ?? []) as any[]
        const adPendenteValor = adLista.reduce((s: number, r: any) => s + (r.valor ?? 0), 0)
        const adPendenteCount = adLista.length

        // ── Gráfico 6 meses ──────────────────────────────────────────────────
        const folhaAgg: Record<string, number> = {}
        ultimos6.forEach(m => { folhaAgg[m] = 0 })
        ;((folhaSeisMesesRes.data ?? []) as any[]).forEach((r: any) => {
          const m = r.mes_referencia as string
          if (m in folhaAgg) folhaAgg[m] += r.snap_liquido ?? 0
        })
        const folhaMensal: FolhaBarData[] = ultimos6.map(m => ({
          mes: mesAbrev(m),
          valor: folhaAgg[m],
        }))

        // ── Headcount por obra ────────────────────────────────────────────────
        const obraMap: Record<string, { clt: number; autonomo: number }> = {}
        ;((headcountRawRes.data ?? []) as any[]).forEach((c: any) => {
          const obraObj  = Array.isArray(c.obras) ? c.obras[0] : c.obras
          const obraNome = (obraObj as any)?.nome ?? 'Sem obra'
          if (!obraMap[obraNome]) obraMap[obraNome] = { clt: 0, autonomo: 0 }
          const tipo = (c.tipo_contrato ?? '').toLowerCase()
          if (tipo === 'clt') obraMap[obraNome].clt++
          else                obraMap[obraNome].autonomo++
        })
        const headcountObra: HeadcountObra[] = Object.entries(obraMap)
          .map(([obra, v]) => ({ obra, clt: v.clt, autonomo: v.autonomo, total: v.clt + v.autonomo }))
          .sort((a, b) => b.total - a.total)
          .slice(0, 8)

        // ── Atividade recente ─────────────────────────────────────────────────
        const atividadeRecente: AtividadeRecente[] = ((atividadeRes.data ?? []) as any[]).map((r: any) => ({
          id: r.id,
          colaborador_nome: (Array.isArray(r.colaboradores) ? r.colaboradores[0]?.nome : r.colaboradores?.nome) ?? '—',
          mes_referencia: r.mes_referencia ?? '',
          snap_liquido: r.snap_liquido ?? 0,
        }))

        // ── Atestados ─────────────────────────────────────────────────────────
        const atestadosMes = atestadosRes.count ?? 0

        // ── Prêmios aprovados ─────────────────────────────────────────────────
        const premiosLista          = (premiosRes.data ?? []) as any[]
        const premiosAprovadosCount = premiosLista.length
        const premiosAprovadosValor = premiosLista.reduce((s: number, r: any) => s + (r.valor ?? 0), 0)

        // ── Rescisões ─────────────────────────────────────────────────────────
        const rescisoesList      = (rescisoesMesRes.data ?? []) as any[]
        const rescisoesMes       = rescisoesList.length
        const rescisoesMesValor  = rescisoesList.reduce((s: number, r: any) => s + (r.total_rescisao ?? 0), 0)

        // ── Lançamentos aguardando ────────────────────────────────────────────
        const lancamentosAguardando = lancAguardandoRes.count ?? 0

        // ── Config ────────────────────────────────────────────────────────────
        const configList = (configRes.data ?? []) as any[]
        const empresaNome = configList.find((c: any) => c.chave === 'empresa_nome')?.valor ?? 'ConstrutorRH'

        setData({
          totalAtivos, totalCLT, totalAutonomo,
          obrasAndamento,
          folhaMesAtual,
          totalProvisionado,
          adPendenteValor, adPendenteCount,
          folhaMensal,
          headcountObra,
          atividadeRecente,
          atestadosMes,
          premiosAprovadosCount, premiosAprovadosValor,
          rescisoesMes, rescisoesMesValor,
          lancamentosAguardando,
          empresaNome,
        })
      } catch (e: unknown) {
        setError(e instanceof Error ? e.message : 'Erro ao carregar dashboard')
      } finally {
        setLoading(false)
      }
  }, [])

  useEffect(() => { fetchAll(); const t = setInterval(fetchAll, 120_000); return () => clearInterval(t) }, [fetchAll])
  useRefreshOnFocus(fetchAll)

  // ── Saudação ao usuário ────────────────────────────────────────────────────
  const nomeUsuario: string =
    (profile as any)?.nome ??
    user?.user_metadata?.nome ??
    user?.email?.split('@')[0] ??
    'usuário'

  // ── Estados de carregamento / erro ────────────────────────────────────────
  if (loading) return <DashboardSkeleton />
  if (error)   return <div className="p-6 text-red-600 text-sm">Erro: {error}</div>

  const d = data!

  // ── Valor Y-Axis máximo para o gráfico ────────────────────────────────────
  const maxFolha = Math.max(...d.folhaMensal.map(m => m.valor), 1)

  return (
    <div className="flex flex-col gap-6 p-6 min-h-screen bg-gray-50/60">

      {/* ══ TOPO: saudação + alertas ═══════════════════════════════════════ */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 }}>
          <div>
            <h1 style={{ fontSize: 22, fontWeight: 800, color: '#111827', margin: 0 }}>
              {saudacao()}, {nomeUsuario}!
            </h1>
            <p style={{ fontSize: 13, color: '#6b7280', margin: '2px 0 0' }}>
              {dataPtBR()} &nbsp;·&nbsp; <span style={{ fontWeight: 600, color: '#374151' }}>{d.empresaNome}</span>
            </p>
          </div>
        </div>

        {/* Banners de alerta */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {d.adPendenteCount > 0 && (
            <div
              onClick={() => navigate('/adiantamentos')}
              style={{
                background: '#fef9c3', border: '1px solid #fde047', borderRadius: 9,
                padding: '9px 16px', display: 'flex', alignItems: 'center', gap: 10,
                cursor: 'pointer', fontSize: 13, color: '#713f12', fontWeight: 600,
              }}
            >
              <AlertTriangle size={15} style={{ color: '#ca8a04', flexShrink: 0 }} />
              {d.adPendenteCount} adiantamento{d.adPendenteCount > 1 ? 's' : ''} aguardando aprovação
              &nbsp;—&nbsp;{formatCurrency(d.adPendenteValor)}
              <ChevronRight size={14} style={{ marginLeft: 'auto' }} />
            </div>
          )}
          {d.lancamentosAguardando > 0 && (
            <div
              onClick={() => navigate('/fechamento-ponto')}
              style={{
                background: '#fff7ed', border: '1px solid #fed7aa', borderRadius: 9,
                padding: '9px 16px', display: 'flex', alignItems: 'center', gap: 10,
                cursor: 'pointer', fontSize: 13, color: '#7c2d12', fontWeight: 600,
              }}
            >
              <Clock size={15} style={{ color: '#ea580c', flexShrink: 0 }} />
              {d.lancamentosAguardando} fechamento{d.lancamentosAguardando > 1 ? 's' : ''} aguardando aprovação
              <span style={{ marginLeft: 4, fontWeight: 700, color: '#ea580c', textDecoration: 'underline' }}>→ Ver Fechamento</span>
              <ChevronRight size={14} style={{ marginLeft: 'auto' }} />
            </div>
          )}
        </div>
      </div>

      {/* ══ LINHA 1: 5 KPI Cards ═══════════════════════════════════════════ */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-5 gap-4">
        <KpiCard
          iconBg="#eff6ff"
          icon={<Users size={22} style={{ color: '#3b82f6' }} />}
          title="Colaboradores Ativos"
          value={d.totalAtivos}
          sub={`${d.totalCLT} CLT · ${d.totalAutonomo} Autônomo`}
          onClick={() => navigate('/colaboradores')}
        />
        <KpiCard
          iconBg="#fff7ed"
          icon={<Building2 size={22} style={{ color: '#f97316' }} />}
          title="Obras em Andamento"
          value={d.obrasAndamento}
          sub="obras ativas"
          onClick={() => navigate('/obras')}
        />
        <KpiCard
          iconBg="#f0fdf4"
          icon={<DollarSign size={22} style={{ color: '#16a34a' }} />}
          title="Folha do Mês Atual"
          value={formatCurrency(d.folhaMesAtual)}
          sub="líquido liberado/pago"
        />
        <KpiCard
          iconBg="#fdf4ff"
          icon={<TrendingUp size={22} style={{ color: '#a855f7' }} />}
          title="Total Provisionado"
          value={formatCurrency(d.totalProvisionado)}
          sub="27,44% sobre horas+DSR CLT"
        />
        <KpiCard
          iconBg="#fefce8"
          icon={<AlertTriangle size={22} style={{ color: '#eab308' }} />}
          title="AD Pendentes"
          value={formatCurrency(d.adPendenteValor)}
          sub={`${d.adPendenteCount} lançamento${d.adPendenteCount !== 1 ? 's' : ''}`}
          onClick={() => navigate('/adiantamentos')}
        />
      </div>

      {/* ══ LINHA 2: Gráfico + Headcount + Atividade ═══════════════════════ */}
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">

        {/* Gráfico de barras — folha 6 meses */}
        <Card style={{ borderRadius: 14, boxShadow: '0 1px 6px rgba(0,0,0,.07)', border: '1px solid #f0f0f0' }} className="xl:col-span-1">
          <CardHeader className="pb-1 pt-4 px-5">
            <CardTitle style={{ fontSize: 13, fontWeight: 700, color: '#374151' }}>
              📊 Folha Mensal — Últimos 6 Meses
            </CardTitle>
          </CardHeader>
          <CardContent className="px-4 pb-4 pt-1">
            {d.folhaMensal.every(m => m.valor === 0) ? (
              <div style={{ height: 220, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#9ca3af', fontSize: 13 }}>
                Nenhum lançamento encontrado
              </div>
            ) : (
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={d.folhaMensal} margin={{ top: 6, right: 6, left: 0, bottom: 0 }} barCategoryGap="30%">
                  <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" vertical={false} />
                  <XAxis
                    dataKey="mes"
                    tick={{ fontSize: 11, fill: '#6b7280' }}
                    tickLine={false}
                    axisLine={false}
                  />
                  <YAxis
                    tickFormatter={(v: number) =>
                      v >= 1000 ? `${(v / 1000).toFixed(0)}k` : String(v)
                    }
                    tick={{ fontSize: 10, fill: '#9ca3af' }}
                    tickLine={false}
                    axisLine={false}
                    domain={[0, maxFolha * 1.15]}
                    width={42}
                  />
                  <Tooltip content={<CustomTooltip />} cursor={{ fill: '#eff6ff' }} />
                  <Bar dataKey="valor" fill="#3b82f6" radius={[5, 5, 0, 0]} maxBarSize={40} isAnimationActive={false} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        {/* Headcount por obra */}
        <Card style={{ borderRadius: 14, boxShadow: '0 1px 6px rgba(0,0,0,.07)', border: '1px solid #f0f0f0' }}>
          <CardHeader className="pb-1 pt-4 px-5">
            <CardTitle style={{ fontSize: 13, fontWeight: 700, color: '#374151' }}>
              🏗️ Headcount por Obra
            </CardTitle>
          </CardHeader>
          <CardContent className="px-0 pb-2 pt-1">
            {d.headcountObra.length === 0 ? (
              <div style={{ padding: '40px 20px', textAlign: 'center', color: '#9ca3af', fontSize: 13 }}>
                Nenhum colaborador alocado
              </div>
            ) : (
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', fontSize: 12, borderCollapse: 'collapse' }}>
                  <thead>
                    <tr style={{ borderBottom: '1px solid #f3f4f6' }}>
                      <th style={{ textAlign: 'left', padding: '7px 20px', color: '#9ca3af', fontWeight: 600, fontSize: 11, textTransform: 'uppercase' }}>Obra</th>
                      <th style={{ textAlign: 'center', padding: '7px 8px', color: '#9ca3af', fontWeight: 600, fontSize: 11 }}>CLT</th>
                      <th style={{ textAlign: 'center', padding: '7px 8px', color: '#9ca3af', fontWeight: 600, fontSize: 11 }}>Autôn.</th>
                      <th style={{ textAlign: 'center', padding: '7px 20px 7px 8px', color: '#9ca3af', fontWeight: 600, fontSize: 11 }}>Total</th>
                    </tr>
                  </thead>
                  <tbody>
                    {d.headcountObra.map((row, i) => (
                      <tr
                        key={row.obra}
                        style={{ background: i % 2 === 0 ? '#f9fafb' : '#fff', borderBottom: '1px solid #f3f4f6' }}
                      >
                        <td style={{ padding: '8px 20px', color: '#374151', fontWeight: 500, maxWidth: 140, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={row.obra}>
                          {row.obra}
                        </td>
                        <td style={{ padding: '8px', textAlign: 'center', color: '#3b82f6', fontWeight: 700 }}>{row.clt}</td>
                        <td style={{ padding: '8px', textAlign: 'center', color: '#f97316', fontWeight: 700 }}>{row.autonomo}</td>
                        <td style={{ padding: '8px 20px 8px 8px', textAlign: 'center', color: '#111827', fontWeight: 800 }}>{row.total}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Atividade recente */}
        <Card style={{ borderRadius: 14, boxShadow: '0 1px 6px rgba(0,0,0,.07)', border: '1px solid #f0f0f0' }}>
          <CardHeader className="pb-1 pt-4 px-5">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <CardTitle style={{ fontSize: 13, fontWeight: 700, color: '#374151' }}>
                ✅ Atividade Recente
              </CardTitle>
              <button
                onClick={() => navigate('/fechamento-ponto')}
                style={{ fontSize: 11, color: '#3b82f6', background: 'none', border: 'none', cursor: 'pointer', fontWeight: 600, display: 'flex', alignItems: 'center', gap: 2 }}
              >
                Ver tudo <ChevronRight size={12} />
              </button>
            </div>
          </CardHeader>
          <CardContent className="px-5 pb-4 pt-2">
            {d.atividadeRecente.length === 0 ? (
              <div style={{ padding: '30px 0', textAlign: 'center', color: '#9ca3af', fontSize: 13 }}>
                Nenhum lançamento recente
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {d.atividadeRecente.map(item => {
                  const [ano, mm] = item.mes_referencia.split('-')
                  const mesNome = MES_ABREV[mm] ?? mm
                  return (
                    <div key={item.id} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <div style={{ width: 30, height: 30, borderRadius: 8, background: '#f0fdf4', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                        <CheckCircle2 size={16} style={{ color: '#16a34a' }} />
                      </div>
                      <div style={{ minWidth: 0, flex: 1 }}>
                        <div style={{ fontSize: 12, fontWeight: 700, color: '#111827', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {item.colaborador_nome}
                        </div>
                        <div style={{ fontSize: 11, color: '#6b7280' }}>
                          {mesNome}/{ano}
                        </div>
                      </div>
                      <div style={{ fontSize: 12, fontWeight: 800, color: '#16a34a', whiteSpace: 'nowrap' }}>
                        {formatCurrency(item.snap_liquido)}
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* ══ LINHA 3: Atestados · Prêmios · Rescisões ═══════════════════════ */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">

        {/* Atestados este mês */}
        <div
          style={{
            background: '#fff', borderRadius: 14, boxShadow: '0 1px 6px rgba(0,0,0,.07)',
            border: '1px solid #f0f0f0', padding: '18px 20px',
            display: 'flex', alignItems: 'center', gap: 14,
          }}
        >
          <div style={{ background: '#fef3c7', borderRadius: 10, width: 46, height: 46, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <FileText size={22} style={{ color: '#d97706' }} />
          </div>
          <div>
            <div style={{ fontSize: 11, color: '#6b7280', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '.04em', marginBottom: 2 }}>
              🩺 Atestados este mês
            </div>
            <div style={{ fontSize: 28, fontWeight: 800, color: '#111827', lineHeight: 1 }}>
              {d.atestadosMes}
            </div>
            <div style={{ fontSize: 11, color: '#9ca3af', marginTop: 2 }}>afastamentos registrados</div>
          </div>
        </div>

        {/* Prêmios aprovados */}
        <div
          onClick={() => navigate('/premios')}
          style={{
            background: '#fff', borderRadius: 14, boxShadow: '0 1px 6px rgba(0,0,0,.07)',
            border: '1px solid #f0f0f0', padding: '18px 20px',
            display: 'flex', alignItems: 'center', gap: 14, cursor: 'pointer',
          }}
        >
          <div style={{ background: '#fdf4ff', borderRadius: 10, width: 46, height: 46, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <Award size={22} style={{ color: '#a855f7' }} />
          </div>
          <div>
            <div style={{ fontSize: 11, color: '#6b7280', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '.04em', marginBottom: 2 }}>
              🏆 Prêmios aprovados
            </div>
            <div style={{ fontSize: 28, fontWeight: 800, color: '#111827', lineHeight: 1 }}>
              {d.premiosAprovadosCount}
            </div>
            <div style={{ fontSize: 11, color: '#9ca3af', marginTop: 2 }}>{formatCurrency(d.premiosAprovadosValor)}</div>
          </div>
        </div>

        {/* Rescisões */}
        <div
          onClick={() => navigate('/rescisoes')}
          style={{
            background: '#fff', borderRadius: 14, boxShadow: '0 1px 6px rgba(0,0,0,.07)',
            border: '1px solid #f0f0f0', padding: '18px 20px',
            display: 'flex', alignItems: 'center', gap: 14, cursor: 'pointer',
          }}
        >
          <div style={{ background: '#fff1f2', borderRadius: 10, width: 46, height: 46, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <Briefcase size={22} style={{ color: '#e11d48' }} />
          </div>
          <div>
            <div style={{ fontSize: 11, color: '#6b7280', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '.04em', marginBottom: 2 }}>
              💼 Rescisões este mês
            </div>
            <div style={{ fontSize: 28, fontWeight: 800, color: '#111827', lineHeight: 1 }}>
              {d.rescisoesMes}
            </div>
            <div style={{ fontSize: 11, color: '#9ca3af', marginTop: 2 }}>{formatCurrency(d.rescisoesMesValor)}</div>
          </div>
        </div>
      </div>

    </div>
  )
}
