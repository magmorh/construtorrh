import React, { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { StatCard, PageHeader, BadgeStatus, LoadingSkeleton } from '@/components/Shared'
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts'
import {
  Users,
  Building2,
  AlertTriangle,
  FileWarning,
  DollarSign,
} from 'lucide-react'
import { formatCurrency, formatDate } from '@/lib/utils'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

// ─── Types ────────────────────────────────────────────────────────────────────

interface ObraRecente {
  id: string
  nome: string
  status: string
  data_inicio: string | null
}

interface AcidenteRecente {
  id: string
  data_ocorrencia: string | null
  tipo: string | null
  gravidade: string | null
  colaborador_nome: string | null
}

interface ColaboradoresPorObra {
  obra: string
  total: number
}

interface DashboardData {
  totalColaboradores: number
  obrasAndamento: number
  acidentesMes: number
  atestadosMes: number
  totalFolha: number
  obrasRecentes: ObraRecente[]
  ultimosAcidentes: AcidenteRecente[]
  colabPorObra: ColaboradoresPorObra[]
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function currentMonthRange(): { start: string; end: string } {
  const now = new Date()
  const start = new Date(now.getFullYear(), now.getMonth(), 1)
    .toISOString()
    .slice(0, 10)
  const end = new Date(now.getFullYear(), now.getMonth() + 1, 0)
    .toISOString()
    .slice(0, 10)
  return { start, end }
}

function currentCompetencia(): string {
  const now = new Date()
  const mm = String(now.getMonth() + 1).padStart(2, '0')
  return `${now.getFullYear()}-${mm}`
}

function todayPtBR(): string {
  return new Date().toLocaleDateString('pt-BR', {
    weekday: 'long',
    day: '2-digit',
    month: 'long',
    year: 'numeric',
  })
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function Dashboard() {
  const [data, setData] = useState<DashboardData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    async function fetchDashboard() {
      try {
        setLoading(true)
        const { start, end } = currentMonthRange()
        const competencia = currentCompetencia()

        const [
          colaboradoresRes,
          obrasRes,
          acidentesRes,
          atestadosRes,
          folhaRes,
          obrasRecentesRes,
          ultimosAcidentesRes,
          colabPorObraRes,
        ] = await Promise.all([
          // 1. Colaboradores ativos
          supabase
            .from('colaboradores')
            .select('id', { count: 'exact', head: true })
            .eq('status', 'ativo'),

          // 2. Obras em andamento
          supabase
            .from('obras')
            .select('id', { count: 'exact', head: true })
            .eq('status', 'em_andamento'),

          // 3. Acidentes do mês
          supabase
            .from('acidentes')
            .select('id', { count: 'exact', head: true })
            .gte('data_ocorrencia', start)
            .lte('data_ocorrencia', end),

          // 4. Atestados do mês
          supabase
            .from('atestados')
            .select('id', { count: 'exact', head: true })
            .gte('data', start)
            .lte('data', end),

          // 5. Total folha do mês
          supabase
            .from('pagamentos')
            .select('valor_liquido')
            .eq('competencia', competencia),

          // 6. 5 obras mais recentes
          supabase
            .from('obras')
            .select('id, nome, status, data_inicio')
            .order('created_at', { ascending: false })
            .limit(5),

          // 7. 5 últimos acidentes
          supabase
            .from('acidentes')
            .select('id, data_ocorrencia, tipo, gravidade, colaboradores(nome)')
            .order('data_ocorrencia', { ascending: false })
            .limit(5),

          // 8. Colaboradores por obra (top 5)
          supabase
            .from('colaboradores')
            .select('obras(nome)')
            .eq('status', 'ativo')
            .not('obra_id', 'is', null),
        ])

        // Soma de folha
        const totalFolha = (folhaRes.data ?? []).reduce(
          (acc: number, p: { valor_liquido: number | null }) =>
            acc + (p.valor_liquido ?? 0),
          0
        )

        // Colaboradores por obra — agrupamento client-side
        const obraCount: Record<string, number> = {}
        ;(colabPorObraRes.data ?? []).forEach((c: { obras: { nome: string }[] | { nome: string } | null }) => {
          const obraObj = Array.isArray(c.obras) ? c.obras[0] : c.obras
          const nome = obraObj?.nome ?? 'Sem obra'
          obraCount[nome] = (obraCount[nome] ?? 0) + 1
        })
        const colabPorObra: ColaboradoresPorObra[] = Object.entries(obraCount)
          .sort((a, b) => b[1] - a[1])
          .slice(0, 5)
          .map(([obra, total]) => ({ obra, total }))

        // Últimos acidentes — flatten join
        const ultimosAcidentes: AcidenteRecente[] = (
          ultimosAcidentesRes.data ?? []
        ).map(
          (a: {
            id: string
            data_ocorrencia: string | null
            tipo: string | null
            gravidade: string | null
            colaboradores: { nome: string }[] | { nome: string } | null
          }) => ({
            id: a.id,
            data_ocorrencia: a.data_ocorrencia,
            tipo: a.tipo,
            gravidade: a.gravidade,
            colaborador_nome: (Array.isArray(a.colaboradores) ? a.colaboradores[0]?.nome : (a.colaboradores as { nome: string } | null)?.nome) ?? null,
          })
        )

        setData({
          totalColaboradores: colaboradoresRes.count ?? 0,
          obrasAndamento: obrasRes.count ?? 0,
          acidentesMes: acidentesRes.count ?? 0,
          atestadosMes: atestadosRes.count ?? 0,
          totalFolha,
          obrasRecentes: (obrasRecentesRes.data as ObraRecente[]) ?? [],
          ultimosAcidentes,
          colabPorObra,
        })
      } catch (e: unknown) {
        setError(e instanceof Error ? e.message : 'Erro ao carregar dados')
      } finally {
        setLoading(false)
      }
    }

    fetchDashboard()
  }, [])

  if (loading) {
    return (
      <div className="flex flex-col gap-6 p-6">
        <LoadingSkeleton />
      </div>
    )
  }

  if (error) {
    return (
      <div className="p-6">
        <p className="text-destructive text-sm">Erro: {error}</p>
      </div>
    )
  }

  const d = data!

  return (
    <div className="flex flex-col gap-6 p-6">
      {/* Header */}
      <PageHeader
        title="Dashboard"
        subtitle={todayPtBR()}
      />

      {/* ── Stat cards ─────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-5 gap-4">
        <StatCard
          title="Colaboradores"
          value={d.totalColaboradores}
          subtitle="ativos"
          color="bg-blue-600"
          icon={<Users className="w-5 h-5 text-white" />}
        />
        <StatCard
          title="Obras"
          value={d.obrasAndamento}
          subtitle="em andamento"
          color="bg-orange-500"
          icon={<Building2 className="w-5 h-5 text-white" />}
        />
        <StatCard
          title="Acidentes"
          value={d.acidentesMes}
          subtitle="este mês"
          color="bg-red-600"
          icon={<AlertTriangle className="w-5 h-5 text-white" />}
        />
        <StatCard
          title="Atestados"
          value={d.atestadosMes}
          subtitle="este mês"
          color="bg-yellow-500"
          icon={<FileWarning className="w-5 h-5 text-white" />}
        />
        <StatCard
          title="Folha do mês"
          value={formatCurrency(d.totalFolha)}
          subtitle="total líquido"
          color="bg-emerald-600"
          icon={<DollarSign className="w-5 h-5 text-white" />}
        />
      </div>

      {/* ── Gráfico + Obras recentes ───────────────────────────────── */}
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
        {/* Gráfico de barras — colaboradores por obra */}
        <Card className="xl:col-span-2">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold">
              Colaboradores Ativos por Obra (Top 5)
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-0">
            {d.colabPorObra.length === 0 ? (
              <p className="text-sm text-muted-foreground py-8 text-center">
                Nenhum dado disponível
              </p>
            ) : (
              <ResponsiveContainer width="100%" height={220}>
                <BarChart
                  data={d.colabPorObra}
                  margin={{ top: 4, right: 16, left: -10, bottom: 4 }}
                >
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis
                    dataKey="obra"
                    tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }}
                    tickLine={false}
                    axisLine={false}
                    interval={0}
                    width={80}
                    tickFormatter={(v: string) =>
                      v.length > 12 ? v.slice(0, 12) + '…' : v
                    }
                  />
                  <YAxis
                    tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }}
                    tickLine={false}
                    axisLine={false}
                    allowDecimals={false}
                  />
                  <Tooltip
                    contentStyle={{
                      background: 'hsl(var(--card))',
                      border: '1px solid hsl(var(--border))',
                      borderRadius: 8,
                      fontSize: 12,
                    }}
                    cursor={{ fill: 'hsl(var(--accent)/0.08)' }}
                    formatter={(value: number) => [value, 'Colaboradores']}
                  />
                  <Bar
                    dataKey="total"
                    radius={[4, 4, 0, 0]}
                    fill="hsl(var(--primary))"
                    maxBarSize={48}
                  />
                </BarChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        {/* Obras recentes */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold">Obras Recentes</CardTitle>
          </CardHeader>
          <CardContent className="pt-0">
            {d.obrasRecentes.length === 0 ? (
              <p className="text-sm text-muted-foreground py-8 text-center">
                Nenhuma obra cadastrada
              </p>
            ) : (
              <ul className="flex flex-col gap-3">
                {d.obrasRecentes.map((obra) => (
                  <li
                    key={obra.id}
                    className="flex items-start justify-between gap-2 text-sm"
                  >
                    <div className="flex flex-col gap-0.5 min-w-0">
                      <span className="font-medium text-foreground truncate">
                        {obra.nome}
                      </span>
                      {obra.data_inicio && (
                        <span className="text-xs text-muted-foreground">
                          Início: {formatDate(obra.data_inicio)}
                        </span>
                      )}
                    </div>
                    <BadgeStatus status={obra.status} className="flex-shrink-0" />
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>

      {/* ── Últimos acidentes ──────────────────────────────────────── */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-semibold">Últimos Acidentes</CardTitle>
        </CardHeader>
        <CardContent className="pt-0">
          {d.ultimosAcidentes.length === 0 ? (
            <p className="text-sm text-muted-foreground py-8 text-center">
              Nenhum acidente registrado
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border">
                    <th className="text-left py-2 pr-4 font-medium text-muted-foreground text-xs uppercase tracking-wide">
                      Data
                    </th>
                    <th className="text-left py-2 pr-4 font-medium text-muted-foreground text-xs uppercase tracking-wide">
                      Colaborador
                    </th>
                    <th className="text-left py-2 pr-4 font-medium text-muted-foreground text-xs uppercase tracking-wide">
                      Tipo
                    </th>
                    <th className="text-left py-2 font-medium text-muted-foreground text-xs uppercase tracking-wide">
                      Gravidade
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {d.ultimosAcidentes.map((ac) => (
                    <tr
                      key={ac.id}
                      className="border-b border-border/50 last:border-0 hover:bg-muted/30 transition-colors"
                    >
                      <td className="py-2.5 pr-4 text-muted-foreground whitespace-nowrap">
                        {formatDate(ac.data_ocorrencia)}
                      </td>
                      <td className="py-2.5 pr-4 font-medium text-foreground">
                        {ac.colaborador_nome ?? '—'}
                      </td>
                      <td className="py-2.5 pr-4 text-muted-foreground">
                        {ac.tipo ?? '—'}
                      </td>
                      <td className="py-2.5">
                        {ac.gravidade ? (
                          <BadgeStatus status={ac.gravidade} />
                        ) : (
                          '—'
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
