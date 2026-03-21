import React, { useState } from 'react'
import { supabase } from '@/lib/supabase'
import { formatCurrency, formatDate } from '@/lib/utils'
import { PageHeader } from '@/components/Shared'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from '@/components/ui/dialog'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table'
import { toast } from 'sonner'
import {
  BarChart2, Users, DollarSign, AlertTriangle,
  ShieldCheck, FileText, Calendar, Printer, Loader2,
} from 'lucide-react'

// ─── tipos ───────────────────────────────────────────────────────────────────
interface HeadcountRow {
  obra: string
  ativos: number
  inativos: number
  total: number
}

interface ResumoFolhaRow {
  competencia: string
  colaboradores: number
  total_bruto: number
  total_liquido: number
}

interface AcidenteRow {
  id: string
  data_acidente: string
  colaborador: string
  obra: string
  gravidade: string
  tipo: string
  com_afastamento: boolean
  dias_afastamento: number
}

interface EpiVencendoRow {
  colaborador: string
  chapa: string
  epi: string
  data_validade: string
  dias_restantes: number
}

interface DocumentoVencendoRow {
  colaborador: string
  chapa: string
  tipo_documento: string
  data_vencimento: string
  dias_restantes: number
}

interface AtestadoPeriodoRow {
  mes: string
  total_atestados: number
  total_dias: number
  colaboradores_distintos: number
}

type RelatorioId =
  | 'headcount'
  | 'resumo_folha'
  | 'acidentes'
  | 'epis_vencer'
  | 'documentos_vencer'
  | 'atestados'

interface RelatorioConfig {
  id: RelatorioId
  title: string
  description: string
  icon: React.ReactNode
  color: string
}

const RELATORIOS: RelatorioConfig[] = [
  {
    id: 'headcount',
    title: 'Headcount por Obra',
    description: 'Quantidade de colaboradores ativos e inativos distribuídos por obra.',
    icon: <Users className="w-6 h-6" />,
    color: 'bg-blue-500',
  },
  {
    id: 'resumo_folha',
    title: 'Resumo de Folha',
    description: 'Totais de colaboradores e valores de folha agrupados por competência.',
    icon: <DollarSign className="w-6 h-6" />,
    color: 'bg-emerald-500',
  },
  {
    id: 'acidentes',
    title: 'Acidentes do Período',
    description: 'Lista de acidentes de trabalho com filtro por data e gravidade.',
    icon: <AlertTriangle className="w-6 h-6" />,
    color: 'bg-red-500',
  },
  {
    id: 'epis_vencer',
    title: 'EPIs a Vencer',
    description: 'Colaboradores com EPIs com validade nos próximos 30 dias.',
    icon: <ShieldCheck className="w-6 h-6" />,
    color: 'bg-orange-500',
  },
  {
    id: 'documentos_vencer',
    title: 'Documentos a Vencer',
    description: 'Documentos dos colaboradores vencendo nos próximos 30 dias.',
    icon: <FileText className="w-6 h-6" />,
    color: 'bg-purple-500',
  },
  {
    id: 'atestados',
    title: 'Atestados por Período',
    description: 'Total de dias de afastamento por mês no período informado.',
    icon: <Calendar className="w-6 h-6" />,
    color: 'bg-indigo-500',
  },
]

// ─── componente ──────────────────────────────────────────────────────────────
export default function Relatorios() {
  const [modalOpen, setModalOpen] = useState(false)
  const [relatorioAtivo, setRelatorioAtivo] = useState<RelatorioConfig | null>(null)
  const [loading, setLoading] = useState(false)

  // dados dos relatórios
  const [headcountData, setHeadcountData] = useState<HeadcountRow[]>([])
  const [resumoFolhaData, setResumoFolhaData] = useState<ResumoFolhaRow[]>([])
  const [acidenData, setAcidenData] = useState<AcidenteRow[]>([])
  const [episData, setEpisData] = useState<EpiVencendoRow[]>([])
  const [docsData, setDocsData] = useState<DocumentoVencendoRow[]>([])
  const [atestadosData, setAtestadosData] = useState<AtestadoPeriodoRow[]>([])

  // filtros específicos
  const [filtroDataInicio, setFiltroDataInicio] = useState('')
  const [filtroDataFim, setFiltroDataFim] = useState('')
  const [filtroGravidade, setFiltroGravidade] = useState('todas')
  const [filtroObra, setFiltroObra] = useState('')

  // ─── gerar relatório ───────────────────────────────────────────────────────
  async function gerarRelatorio(rel: RelatorioConfig) {
    setRelatorioAtivo(rel)
    setModalOpen(true)
    setLoading(true)

    try {
      if (rel.id === 'headcount') {
        const { data, error } = await supabase
          .from('colaboradores')
          .select('status, obras(nome)')
        if (error) throw error
        type ColRow = { status: string; obras: { nome: string }[] | { nome: string } | null }
        const agg = new Map<string, { ativos: number; inativos: number }>()
        ;(data as unknown as ColRow[]).forEach((c) => {
          const obraObj = Array.isArray(c.obras) ? c.obras[0] : c.obras
          const obra = obraObj?.nome ?? 'Sem Obra'
          if (!agg.has(obra)) agg.set(obra, { ativos: 0, inativos: 0 })
          const entry = agg.get(obra)!
          if (c.status === 'ativo') entry.ativos++
          else entry.inativos++
        })
        const rows: HeadcountRow[] = Array.from(agg.entries()).map(([obra, v]) => ({
          obra,
          ativos: v.ativos,
          inativos: v.inativos,
          total: v.ativos + v.inativos,
        }))
        setHeadcountData(rows)
      }

      else if (rel.id === 'resumo_folha') {
        const { data, error } = await supabase
          .from('pagamentos')
          .select('competencia, colaborador_id, valor_bruto, valor_liquido')
          .order('competencia', { ascending: false })
        if (error) throw error
        type PagRow = { competencia: string; colaborador_id: string; valor_bruto: number | null; valor_liquido: number | null }
        const agg = new Map<string, { cols: Set<string>; bruto: number; liquido: number }>()
        ;(data as PagRow[]).forEach((p) => {
          if (!agg.has(p.competencia)) agg.set(p.competencia, { cols: new Set(), bruto: 0, liquido: 0 })
          const entry = agg.get(p.competencia)!
          entry.cols.add(p.colaborador_id)
          entry.bruto += p.valor_bruto ?? 0
          entry.liquido += p.valor_liquido ?? 0
        })
        const rows: ResumoFolhaRow[] = Array.from(agg.entries()).map(([comp, v]) => ({
          competencia: comp,
          colaboradores: v.cols.size,
          total_bruto: v.bruto,
          total_liquido: v.liquido,
        }))
        setResumoFolhaData(rows)
      }

      else if (rel.id === 'acidentes') {
        let query = supabase
          .from('acidentes')
          .select('id, data_acidente, gravidade, tipo, com_afastamento, dias_afastamento, colaboradores(nome), obras(nome)')
          .order('data_acidente', { ascending: false })
        if (filtroDataInicio) query = query.gte('data_acidente', filtroDataInicio)
        if (filtroDataFim) query = query.lte('data_acidente', filtroDataFim)
        if (filtroGravidade !== 'todas') query = query.eq('gravidade', filtroGravidade)
        const { data, error } = await query
        if (error) throw error
        type AcRow = {
          id: string; data_acidente: string; gravidade: string | null; tipo: string | null
          com_afastamento: boolean; dias_afastamento: number
          colaboradores: { nome: string }[] | { nome: string } | null
          obras: { nome: string }[] | { nome: string } | null
        }
        setAcidenData((data as unknown as AcRow[]).map((r) => ({
          id: r.id,
          data_acidente: r.data_acidente,
          colaborador: (Array.isArray(r.colaboradores) ? r.colaboradores[0]?.nome : (r.colaboradores as { nome: string } | null)?.nome) ?? '—',
          obra: (Array.isArray(r.obras) ? r.obras[0]?.nome : (r.obras as { nome: string } | null)?.nome) ?? '—',
          gravidade: r.gravidade ?? '—',
          tipo: r.tipo ?? '—',
          com_afastamento: r.com_afastamento,
          dias_afastamento: r.dias_afastamento,
        })))
      }

      else if (rel.id === 'epis_vencer') {
        const hoje = new Date()
        const limite = new Date()
        limite.setDate(hoje.getDate() + 30)
        const { data, error } = await supabase
          .from('colaborador_epi')
          .select('data_validade, epi_catalogo(nome), colaboradores(nome, chapa)')
          .eq('status', 'ativo')
          .not('data_validade', 'is', null)
          .lte('data_validade', limite.toISOString().slice(0, 10))
          .gte('data_validade', hoje.toISOString().slice(0, 10))
          .order('data_validade')
        if (error) throw error
        type EpiRow = {
          data_validade: string | null
          epi_catalogo: { nome: string } | { nome: string }[] | null
          colaboradores: { nome: string; chapa: string }[] | { nome: string; chapa: string } | null
        }
        setEpisData((data as unknown as EpiRow[]).map((r) => {
          const validade = new Date(r.data_validade + 'T00:00:00')
          const dias = Math.ceil((validade.getTime() - hoje.getTime()) / 86400000)
          const epiNome = Array.isArray(r.epi_catalogo) ? r.epi_catalogo[0]?.nome : (r.epi_catalogo as { nome: string } | null)?.nome
          return {
            colaborador: (Array.isArray(r.colaboradores) ? r.colaboradores[0]?.nome : (r.colaboradores as { nome: string; chapa: string } | null)?.nome) ?? '—',
            chapa: (Array.isArray(r.colaboradores) ? r.colaboradores[0]?.chapa : (r.colaboradores as { nome: string; chapa: string } | null)?.chapa) ?? '—',
            epi: epiNome ?? '—',
            data_validade: r.data_validade ?? '',
            dias_restantes: dias,
          }
        }))
      }

      else if (rel.id === 'documentos_vencer') {
        const hoje = new Date()
        const limite = new Date()
        limite.setDate(hoje.getDate() + 30)
        // Relatório: documentos avulsos recentes (últimos 30 dias)
        const { data, error } = await supabase
          .from('documentos_avulsos')
          .select('data, tipo, descricao, documento_nome, colaboradores(nome, chapa)')
          .not('data', 'is', null)
          .gte('data', new Date(Date.now() - 90*86400000).toISOString().slice(0, 10))
          .order('data', { ascending: false })
        if (error) throw error
        type DocRow = {
          data: string | null; tipo: string | null; descricao: string | null
          documento_nome: string | null
          colaboradores: { nome: string; chapa: string }[] | { nome: string; chapa: string } | null
        }
        setDocsData((data as unknown as DocRow[]).map((r) => {
          const docDate = new Date(r.data + 'T00:00:00')
          const dias = Math.ceil((hoje.getTime() - docDate.getTime()) / 86400000)
          return {
            colaborador: (Array.isArray(r.colaboradores) ? r.colaboradores[0]?.nome : (r.colaboradores as { nome: string; chapa: string } | null)?.nome) ?? 'Geral',
            chapa: (Array.isArray(r.colaboradores) ? r.colaboradores[0]?.chapa : (r.colaboradores as { nome: string; chapa: string } | null)?.chapa) ?? '—',
            tipo_documento: r.tipo ?? '—',
            data_vencimento: r.data ?? '',
            dias_restantes: dias,
          }
        }))
      }

      else if (rel.id === 'atestados') {
        let query = supabase
          .from('atestados')
          .select('data, dias_afastamento, colaborador_id')
          .order('data', { ascending: false })
        if (filtroDataInicio) query = query.gte('data', filtroDataInicio)
        if (filtroDataFim) query = query.lte('data', filtroDataFim)
        const { data, error } = await query
        if (error) throw error
        type AtRow = { data: string; dias_afastamento: number; colaborador_id: string }
        const agg = new Map<string, { total: number; dias: number; cols: Set<string> }>()
        ;(data as AtRow[]).forEach((a) => {
          const mes = a.data.slice(0, 7)
          if (!agg.has(mes)) agg.set(mes, { total: 0, dias: 0, cols: new Set() })
          const entry = agg.get(mes)!
          entry.total++
          entry.dias += a.dias_afastamento ?? 0
          entry.cols.add(a.colaborador_id)
        })
        const rows: AtestadoPeriodoRow[] = Array.from(agg.entries())
          .sort((a, b) => b[0].localeCompare(a[0]))
          .map(([mes, v]) => ({
            mes,
            total_atestados: v.total,
            total_dias: v.dias,
            colaboradores_distintos: v.cols.size,
          }))
        setAtestadosData(rows)
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Erro ao gerar relatório'
      toast.error(msg)
    } finally {
      setLoading(false)
    }
  }

  // ─── render tabela interna ─────────────────────────────────────────────────
  function renderTabela() {
    if (loading) {
      return (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
        </div>
      )
    }

    switch (relatorioAtivo?.id) {
      case 'headcount':
        return headcountData.length === 0 ? (
          <p className="text-center text-muted-foreground py-8">Nenhum dado encontrado.</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/50">
                <TableHead>Obra</TableHead>
                <TableHead className="text-right">Ativos</TableHead>
                <TableHead className="text-right">Inativos</TableHead>
                <TableHead className="text-right">Total</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {headcountData.map((r) => (
                <TableRow key={r.obra}>
                  <TableCell className="font-medium">{r.obra}</TableCell>
                  <TableCell className="text-right text-emerald-600">{r.ativos}</TableCell>
                  <TableCell className="text-right text-red-600">{r.inativos}</TableCell>
                  <TableCell className="text-right font-semibold">{r.total}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )

      case 'resumo_folha':
        return resumoFolhaData.length === 0 ? (
          <p className="text-center text-muted-foreground py-8">Nenhum dado encontrado.</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/50">
                <TableHead>Competência</TableHead>
                <TableHead className="text-right">Colaboradores</TableHead>
                <TableHead className="text-right">Total Bruto</TableHead>
                <TableHead className="text-right">Total Líquido</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {resumoFolhaData.map((r) => (
                <TableRow key={r.competencia}>
                  <TableCell className="font-medium">{r.competencia}</TableCell>
                  <TableCell className="text-right">{r.colaboradores}</TableCell>
                  <TableCell className="text-right">{formatCurrency(r.total_bruto)}</TableCell>
                  <TableCell className="text-right font-semibold">{formatCurrency(r.total_liquido)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )

      case 'acidentes':
        return acidenData.length === 0 ? (
          <p className="text-center text-muted-foreground py-8">Nenhum acidente no período.</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/50">
                <TableHead>Data</TableHead>
                <TableHead>Colaborador</TableHead>
                <TableHead>Obra</TableHead>
                <TableHead>Tipo</TableHead>
                <TableHead>Gravidade</TableHead>
                <TableHead>Afastamento</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {acidenData.map((r) => (
                <TableRow key={r.id}>
                  <TableCell>{formatDate(r.data_acidente)}</TableCell>
                  <TableCell>{r.colaborador}</TableCell>
                  <TableCell>{r.obra}</TableCell>
                  <TableCell className="capitalize">{r.tipo.replace('_', ' ')}</TableCell>
                  <TableCell>
                    <span className={
                      r.gravidade === 'grave' || r.gravidade === 'fatal'
                        ? 'text-red-600 font-semibold'
                        : r.gravidade === 'moderado'
                        ? 'text-orange-600'
                        : 'text-green-600'
                    }>
                      {r.gravidade}
                    </span>
                  </TableCell>
                  <TableCell>
                    {r.com_afastamento ? `${r.dias_afastamento} dias` : 'Sem afastamento'}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )

      case 'epis_vencer':
        return episData.length === 0 ? (
          <p className="text-center text-muted-foreground py-8">Nenhum EPI vencendo nos próximos 30 dias.</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/50">
                <TableHead>Chapa</TableHead>
                <TableHead>Colaborador</TableHead>
                <TableHead>EPI</TableHead>
                <TableHead>Vencimento</TableHead>
                <TableHead className="text-right">Dias Restantes</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {episData.map((r, i) => (
                <TableRow key={i}>
                  <TableCell className="text-muted-foreground">{r.chapa}</TableCell>
                  <TableCell>{r.colaborador}</TableCell>
                  <TableCell>{r.epi}</TableCell>
                  <TableCell>{formatDate(r.data_validade)}</TableCell>
                  <TableCell className="text-right">
                    <span className={r.dias_restantes <= 7 ? 'text-red-600 font-semibold' : 'text-orange-600'}>
                      {r.dias_restantes} dias
                    </span>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )

      case 'documentos_vencer':
        return docsData.length === 0 ? (
          <p className="text-center text-muted-foreground py-8">Nenhum documento vencendo nos próximos 30 dias.</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/50">
                <TableHead>Chapa</TableHead>
                <TableHead>Colaborador</TableHead>
                <TableHead>Documento</TableHead>
                <TableHead>Vencimento</TableHead>
                <TableHead className="text-right">Dias Restantes</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {docsData.map((r, i) => (
                <TableRow key={i}>
                  <TableCell className="text-muted-foreground">{r.chapa}</TableCell>
                  <TableCell>{r.colaborador}</TableCell>
                  <TableCell>{r.tipo_documento}</TableCell>
                  <TableCell>{formatDate(r.data_vencimento)}</TableCell>
                  <TableCell className="text-right">
                    <span className={r.dias_restantes <= 7 ? 'text-red-600 font-semibold' : 'text-orange-600'}>
                      {r.dias_restantes} dias
                    </span>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )

      case 'atestados':
        return atestadosData.length === 0 ? (
          <p className="text-center text-muted-foreground py-8">Nenhum atestado no período.</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/50">
                <TableHead>Mês</TableHead>
                <TableHead className="text-right">Atestados</TableHead>
                <TableHead className="text-right">Total Dias</TableHead>
                <TableHead className="text-right">Colaboradores</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {atestadosData.map((r) => (
                <TableRow key={r.mes}>
                  <TableCell className="font-medium">{r.mes}</TableCell>
                  <TableCell className="text-right">{r.total_atestados}</TableCell>
                  <TableCell className="text-right">{r.total_dias}</TableCell>
                  <TableCell className="text-right">{r.colaboradores_distintos}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )

      default:
        return null
    }
  }

  // ─── filtros extras por relatório ──────────────────────────────────────────
  function renderFiltros() {
    if (!relatorioAtivo) return null
    if (relatorioAtivo.id === 'acidentes' || relatorioAtivo.id === 'atestados') {
      return (
        <div className="flex flex-wrap gap-3 mb-4 pt-2 border-t border-border">
          <div className="flex items-center gap-1.5">
            <Label className="text-xs text-muted-foreground">De</Label>
            <Input
              type="date"
              value={filtroDataInicio}
              onChange={(e) => setFiltroDataInicio(e.target.value)}
              className="h-8 w-38 text-sm"
            />
          </div>
          <div className="flex items-center gap-1.5">
            <Label className="text-xs text-muted-foreground">Até</Label>
            <Input
              type="date"
              value={filtroDataFim}
              onChange={(e) => setFiltroDataFim(e.target.value)}
              className="h-8 w-38 text-sm"
            />
          </div>
          {relatorioAtivo.id === 'acidentes' && (
            <Select value={filtroGravidade} onValueChange={setFiltroGravidade}>
              <SelectTrigger className="h-8 w-40 text-sm">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="todas">Todas as gravidades</SelectItem>
                <SelectItem value="leve">Leve</SelectItem>
                <SelectItem value="moderado">Moderado</SelectItem>
                <SelectItem value="grave">Grave</SelectItem>
                <SelectItem value="fatal">Fatal</SelectItem>
              </SelectContent>
            </Select>
          )}
          <Button
            size="sm"
            variant="secondary"
            onClick={() => gerarRelatorio(relatorioAtivo)}
          >
            Atualizar
          </Button>
        </div>
      )
    }
    return null
  }

  // ─── render principal ──────────────────────────────────────────────────────
  return (
    <div className="p-6">
      <PageHeader
        title="Relatórios Gerenciais"
        subtitle="Análises e relatórios consolidados do sistema"
      />

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
        {RELATORIOS.map((rel) => (
          <div
            key={rel.id}
            className="bg-card border border-border rounded-xl p-5 flex flex-col gap-3 shadow-sm hover:shadow-md transition-shadow"
          >
            <div className="flex items-start gap-3">
              <div className={`w-11 h-11 rounded-lg flex items-center justify-center flex-shrink-0 text-white ${rel.color}`}>
                {rel.icon}
              </div>
              <div>
                <h3 className="font-semibold text-sm text-foreground">{rel.title}</h3>
                <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">{rel.description}</p>
              </div>
            </div>
            <Button
              size="sm"
              variant="outline"
              className="mt-auto w-full"
              onClick={() => gerarRelatorio(rel)}
            >
              <BarChart2 className="w-3.5 h-3.5 mr-1.5" />
              Gerar Relatório
            </Button>
          </div>
        ))}
      </div>

      {/* Modal de resultado */}
      <Dialog open={modalOpen} onOpenChange={setModalOpen}>
        <DialogContent className="max-w-4xl max-h-[90vh] flex flex-col">
          <DialogHeader className="flex-shrink-0">
            <div className="flex items-center justify-between">
              <DialogTitle className="flex items-center gap-2">
                {relatorioAtivo && (
                  <span className={`w-8 h-8 rounded-lg flex items-center justify-center text-white ${relatorioAtivo.color}`}>
                    {relatorioAtivo.icon}
                  </span>
                )}
                {relatorioAtivo?.title}
              </DialogTitle>
              <Button
                size="sm"
                variant="outline"
                onClick={() => window.print()}
                className="mr-8"
              >
                <Printer className="w-3.5 h-3.5 mr-1.5" />
                Imprimir
              </Button>
            </div>
          </DialogHeader>

          <div className="flex-1 overflow-y-auto">
            {renderFiltros()}
            <div className="rounded-md border border-border overflow-hidden print:border-0">
              {renderTabela()}
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
