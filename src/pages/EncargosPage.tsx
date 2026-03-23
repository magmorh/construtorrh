import React, { useState, useCallback } from 'react'
import { supabase } from '@/lib/supabase'
import { formatCurrency } from '@/lib/utils'
import { calcINSS, calcIR, fetchTabelasEncargos, type FaixaINSS, type FaixaIR } from '@/lib/encargos'
import { PageHeader, LoadingSkeleton, EmptyState } from '@/components/Shared'
import { Button } from '@/components/ui/button'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import {
  Table, TableBody, TableCell, TableFooter, TableHead, TableHeader, TableRow,
} from '@/components/ui/table'
import { traduzirErro } from '@/lib/erros'
import { Briefcase, Download, Search } from 'lucide-react'
import { toast } from 'sonner'

// ─── Tipos ────────────────────────────────────────────────────────────────────

interface ColaboradorEncargo {
  colaborador_id: string
  nome: string
  chapa: string | null
  funcao_nome: string
  tipo_contrato: string
  salario: number        // horas + DSR
  inss: number           // retido do funcionário
  ir: number             // retido do funcionário
  fgts: number           // empresa
  inssPatronal: number   // empresa
  rat: number            // empresa
  totalEmpresa: number
  totalDescontos: number
}

// ─── Constantes ───────────────────────────────────────────────────────────────

const MESES = [
  'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
  'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro',
]

const ANOS = [2024, 2025, 2026, 2027]

// Tabela INSS 2026 (progressiva)
const FAIXAS_INSS = [
  { ate: 1621.00,  aliq: 0.075, deducao: 0 },
  { ate: 2902.84,  aliq: 0.09,  deducao: 24.32 },
  { ate: 4354.27,  aliq: 0.12,  deducao: 111.40 },
  { ate: 8475.55,  aliq: 0.14,  deducao: 198.49 },
]
const INSS_TETO = 8475.55

// Tabela IR mensal 2026
const FAIXAS_IR = [
  { ate: 2372.27,  aliq: 0,     deducao: 0 },
  { ate: 2826.65,  aliq: 0.075, deducao: 177.92 },
  { ate: 3751.05,  aliq: 0.15,  deducao: 389.92 },
  { ate: 4664.68,  aliq: 0.225, deducao: 671.25 },
  { acima: true,   aliq: 0.275, deducao: 904.48 },
]

// ─── Helpers de cálculo (via lib/encargos) ───────────────────────────────────

// ─── Helpers de período ───────────────────────────────────────────────────────

function expandRange(inicio: string, fim: string): string[] {
  const dias: string[] = []
  const d = new Date(inicio + 'T12:00:00')
  const end = new Date(fim + 'T12:00:00')
  while (d <= end) {
    dias.push(d.toISOString().slice(0, 10))
    d.setDate(d.getDate() + 1)
  }
  return dias
}

function diasUteisPeriodo(inicio: string, fim: string, feriadosSet: Set<string>): number {
  return expandRange(inicio, fim).filter(d => {
    const dow = new Date(d + 'T12:00:00').getDay()
    if (dow < 1 || dow > 6) return false   // exclui domingo
    if (feriadosSet.has(d)) return false
    return true
  }).length
}

function domingosMaisferiadosPeriodo(inicio: string, fim: string, feriadosSet: Set<string>): number {
  const dias = expandRange(inicio, fim)
  const domingos = dias.filter(d => new Date(d + 'T12:00:00').getDay() === 0).length
  const feriadosUteis = dias.filter(d => {
    if (!feriadosSet.has(d)) return false
    const dow = new Date(d + 'T12:00:00').getDay()
    return dow >= 1 && dow <= 5
  }).length
  return domingos + feriadosUteis
}

// ─── Componente principal ─────────────────────────────────────────────────────

export default function EncargosPage() {
  const hoje = new Date()
  const [mes, setMes]   = useState<number>(hoje.getMonth() + 1)
  const [ano, setAno]   = useState<number>(hoje.getFullYear())
  const [linhas, setLinhas] = useState<ColaboradorEncargo[]>([])
  const [loading, setLoading] = useState(false)
  const [calculado, setCalculado] = useState(false)

  // ── Calcular ──────────────────────────────────────────────────────────────
  const calcular = useCallback(async () => {
    setLoading(true)
    setCalculado(false)
    try {
      const mesRef = `${ano}-${String(mes).padStart(2, '0')}`
      const mesRefFim = `${mesRef}-31`
      const mesRefIni = `${mesRef}-01`

      // 1. Lançamentos aprovados/pagos do mês
      const { data: lancsRaw, error: errLancs } = await supabase
        .from('ponto_lancamentos')
        .select(`
          id, colaborador_id, data_inicio, data_fim,
          colaboradores(nome, chapa, tipo_contrato, funcao_id, funcoes(nome))
        `)
        .in('status', ['aprovado', 'em_fechamento', 'pago'])
        .eq('mes_referencia', mesRef)

      if (errLancs) throw new Error(traduzirErro(errLancs?.message ?? String(errLancs)))
      if (!lancsRaw || lancsRaw.length === 0) {
        setLinhas([])
        setCalculado(true)
        return
      }

      // 2. Apenas CLT
      const lancsCLT = (lancsRaw as any[]).filter(
        l => (l.colaboradores?.tipo_contrato ?? 'clt') === 'clt'
      )
      if (lancsCLT.length === 0) {
        setLinhas([])
        setCalculado(true)
        return
      }

      const lancIds      = lancsCLT.map((l: any) => l.id)
      const funcaoIds    = [...new Set(lancsCLT.map((l: any) => l.colaboradores?.funcao_id).filter(Boolean) as string[])]

      // 3. Registros de ponto
      const { data: pontosRaw } = await supabase
        .from('registro_ponto')
        .select('lancamento_id, horas_trabalhadas, horas_extras')
        .in('lancamento_id', lancIds)

      // 4. Valor/hora das funções
      const { data: fvRaw } = await supabase
        .from('funcao_valores')
        .select('funcao_id, tipo_contrato, valor_hora')
        .in('funcao_id', funcaoIds)

      // 5. Feriados do período
      const { data: feriadosRaw } = await supabase
        .from('feriados')
        .select('data')
        .gte('data', mesRefIni)
        .lte('data', mesRefFim)

      const feriadosSet = new Set<string>((feriadosRaw ?? []).map((f: any) => f.data as string))

      // Mapa valor/hora por funcao_id (CLT)
      const valorHoraMap: Record<string, number> = {}
      ;(fvRaw ?? []).forEach((fv: any) => {
        if (fv.tipo_contrato === 'clt' || !valorHoraMap[fv.funcao_id]) {
          valorHoraMap[fv.funcao_id] = fv.valor_hora ?? 0
        }
      })

      // Mapa de horas por lançamento
      type PontoAgg = { normais: number; extras: number }
      const pontosMap: Record<string, PontoAgg> = {}
      ;(pontosRaw ?? []).forEach((p: any) => {
        const lid = p.lancamento_id
        if (!pontosMap[lid]) pontosMap[lid] = { normais: 0, extras: 0 }
        pontosMap[lid].normais += p.horas_trabalhadas ?? 0
        pontosMap[lid].extras  += p.horas_extras ?? 0
      })

      // Agrupar lançamentos por colaborador
      const porColab: Record<string, { lancs: any[]; colab: any }> = {}
      lancsCLT.forEach((l: any) => {
        const cid = l.colaborador_id
        if (!porColab[cid]) porColab[cid] = { lancs: [], colab: l.colaboradores }
        porColab[cid].lancs.push(l)
      })

      const resultado: ColaboradorEncargo[] = []

      for (const [colaborador_id, { lancs, colab }] of Object.entries(porColab)) {
        const funcaoId  = colab?.funcao_id ?? null
        const vh        = funcaoId ? (valorHoraMap[funcaoId] ?? 0) : 0

        let totalNormais = 0
        let totalExtras  = 0
        let diasUteis    = 0
        let domingos     = 0

        for (const l of lancs) {
          const p = pontosMap[l.id] ?? { normais: 0, extras: 0 }
          totalNormais += p.normais
          totalExtras  += p.extras
          diasUteis += diasUteisPeriodo(l.data_inicio, l.data_fim, feriadosSet)
          domingos  += domingosMaisferiadosPeriodo(l.data_inicio, l.data_fim, feriadosSet)
        }

        const valorHoras = totalNormais * vh + totalExtras * vh * 1.5
        const dsr = diasUteis > 0 ? (valorHoras / diasUteis) * domingos : 0
        const salario = valorHoras + dsr

        const inss         = calcINSS(salario)
        const ir           = calcIR(salario, inss)
        const fgts         = salario * 0.08
        const inssPatronal = salario * 0.20
        const rat          = salario * 0.035
        const totalEmpresa   = fgts + inssPatronal + rat
        const totalDescontos = inss + ir

        resultado.push({
          colaborador_id,
          nome:      colab?.nome ?? '—',
          chapa:     colab?.chapa ?? null,
          funcao_nome: colab?.funcoes?.nome ?? 'Sem função',
          tipo_contrato: colab?.tipo_contrato ?? 'clt',
          salario,
          inss,
          ir,
          fgts,
          inssPatronal,
          rat,
          totalEmpresa,
          totalDescontos,
        })
      }

      // Ordenar por nome
      resultado.sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'))
      setLinhas(resultado)
      setCalculado(true)
    } catch (err: any) {
      toast.error(err?.message ?? 'Erro ao calcular encargos')
    } finally {
      setLoading(false)
    }
  }, [mes, ano])

  // ── Exportar CSV ─────────────────────────────────────────────────────────
  const exportarCSV = useCallback(() => {
    if (!linhas.length) return
    const cab = ['Colaborador','Chapa','Função','Salário Base','INSS (func.)','IR (func.)','FGTS (emp.)','INSS Pat. (emp.)','RAT (emp.)','Total Emp.','Total Desc.']
    const rows = linhas.map(l => [
      l.nome, l.chapa ?? '', l.funcao_nome,
      l.salario.toFixed(2), l.inss.toFixed(2), l.ir.toFixed(2),
      l.fgts.toFixed(2), l.inssPatronal.toFixed(2), l.rat.toFixed(2),
      l.totalEmpresa.toFixed(2), l.totalDescontos.toFixed(2),
    ])
    const csv = [cab, ...rows].map(r => r.join(';')).join('\n')
    const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `encargos_${ano}-${String(mes).padStart(2, '0')}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }, [linhas, mes, ano])

  // ── Totalizadores ─────────────────────────────────────────────────────────
  const totais = React.useMemo(() => ({
    qtd:           linhas.length,
    salario:       linhas.reduce((s, l) => s + l.salario, 0),
    inss:          linhas.reduce((s, l) => s + l.inss, 0),
    ir:            linhas.reduce((s, l) => s + l.ir, 0),
    fgts:          linhas.reduce((s, l) => s + l.fgts, 0),
    inssPatronal:  linhas.reduce((s, l) => s + l.inssPatronal, 0),
    rat:           linhas.reduce((s, l) => s + l.rat, 0),
    totalEmpresa:  linhas.reduce((s, l) => s + l.totalEmpresa, 0),
    totalDescontos:linhas.reduce((s, l) => s + l.totalDescontos, 0),
  }), [linhas])

  // ─── Render ───────────────────────────────────────────────────────────────
  return (
    <div className="p-6 space-y-6">
      <PageHeader
        title="Encargos Trabalhistas"
        subtitle="Cálculo de INSS, IR, FGTS e encargos patronais por competência"
        action={
          calculado && linhas.length > 0
            ? (
              <Button variant="outline" size="sm" onClick={exportarCSV}>
                <Download className="w-4 h-4 mr-2" />
                Exportar CSV
              </Button>
            ) : undefined
        }
      />

      {/* ── Filtros ── */}
      <div
        style={{
          background: 'var(--card)',
          borderRadius: 10,
          border: '1px solid var(--border)',
          padding: '14px 16px',
        }}
        className="flex flex-wrap items-end gap-4"
      >
        <div className="flex flex-col gap-1">
          <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Mês</span>
          <Select value={String(mes)} onValueChange={v => setMes(Number(v))}>
            <SelectTrigger className="w-40">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {MESES.map((m, i) => (
                <SelectItem key={i + 1} value={String(i + 1)}>{m}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="flex flex-col gap-1">
          <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Ano</span>
          <Select value={String(ano)} onValueChange={v => setAno(Number(v))}>
            <SelectTrigger className="w-28">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {ANOS.map(a => (
                <SelectItem key={a} value={String(a)}>{a}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <Button onClick={calcular} disabled={loading} className="mb-0.5">
          <Search className="w-4 h-4 mr-2" />
          {loading ? 'Calculando…' : 'Calcular'}
        </Button>
      </div>

      {/* ── Loading ── */}
      {loading && <LoadingSkeleton />}

      {/* ── Cards de resumo ── */}
      {!loading && calculado && (
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {/* Card 1 – Colaboradores CLT */}
            <div
              style={{
                background: 'var(--card)',
                borderRadius: 10,
                border: '1px solid var(--border)',
                padding: '14px 16px',
              }}
            >
              <div className="flex items-center gap-3 mb-2">
                <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ background: '#1e3a5f' }}>
                  <Briefcase className="w-4 h-4 text-white" />
                </div>
                <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                  Colaboradores CLT
                </span>
              </div>
              <p className="text-2xl font-bold text-foreground">{totais.qtd}</p>
            </div>

            {/* Card 2 – Total INSS retido */}
            <div
              style={{
                background: 'var(--card)',
                borderRadius: 10,
                border: '1px solid var(--border)',
                padding: '14px 16px',
              }}
            >
              <div className="flex items-center gap-3 mb-2">
                <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ background: '#0369a1' }}>
                  <span className="text-white text-xs font-bold">IN</span>
                </div>
                <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                  INSS Retido (func.)
                </span>
              </div>
              <p className="text-xl font-bold" style={{ color: '#0369a1' }}>
                {formatCurrency(totais.inss)}
              </p>
            </div>

            {/* Card 3 – Total IR retido */}
            <div
              style={{
                background: 'var(--card)',
                borderRadius: 10,
                border: '1px solid var(--border)',
                padding: '14px 16px',
              }}
            >
              <div className="flex items-center gap-3 mb-2">
                <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ background: '#dc2626' }}>
                  <span className="text-white text-xs font-bold">IR</span>
                </div>
                <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                  IR Retido (func.)
                </span>
              </div>
              <p className="text-xl font-bold" style={{ color: '#dc2626' }}>
                {formatCurrency(totais.ir)}
              </p>
            </div>

            {/* Card 4 – Total Encargos Empresa */}
            <div
              style={{
                background: 'var(--card)',
                borderRadius: 10,
                border: '1px solid var(--border)',
                padding: '14px 16px',
              }}
            >
              <div className="flex items-center gap-3 mb-2">
                <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ background: '#7c3aed' }}>
                  <span className="text-white text-xs font-bold">EMP</span>
                </div>
                <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                  Encargos Empresa
                </span>
              </div>
              <p className="text-xl font-bold" style={{ color: '#7c3aed' }}>
                {formatCurrency(totais.totalEmpresa)}
              </p>
              <p className="text-xs text-muted-foreground mt-1">FGTS + INSS Pat. + RAT</p>
            </div>
          </div>

          {/* ── Tabela ── */}
          {linhas.length === 0 ? (
            <EmptyState
              icon={<Briefcase size={32} />}
              title="Nenhum colaborador CLT encontrado"
              description="Não há lançamentos aprovados ou pagos para o período selecionado."
            />
          ) : (
            <div
              style={{
                background: 'var(--card)',
                borderRadius: 10,
                border: '1px solid var(--border)',
                overflow: 'hidden',
              }}
            >
              <Table style={{ fontSize: 12 }}>
                <TableHeader>
                  <TableRow>
                    {[
                      'Colaborador', 'Chapa', 'Função', 'Salário Base',
                      'INSS ¹', 'IR ¹', 'FGTS ²', 'INSS Pat. ²', 'RAT ²',
                      'Total Emp. ²', 'Total Desc. ¹',
                    ].map(h => (
                      <TableHead
                        key={h}
                        style={{
                          background: '#1e3a5f',
                          color: '#fff',
                          fontWeight: 600,
                          whiteSpace: 'nowrap',
                          fontSize: 11,
                        }}
                      >
                        {h}
                      </TableHead>
                    ))}
                  </TableRow>
                </TableHeader>

                <TableBody>
                  {linhas.map(l => (
                    <TableRow key={l.colaborador_id}>
                      <TableCell className="font-medium">{l.nome}</TableCell>
                      <TableCell className="text-muted-foreground">{l.chapa ?? '—'}</TableCell>
                      <TableCell className="text-muted-foreground">{l.funcao_nome}</TableCell>
                      <TableCell className="font-medium">{formatCurrency(l.salario)}</TableCell>
                      <TableCell style={{ color: '#0369a1' }}>{formatCurrency(l.inss)}</TableCell>
                      <TableCell style={{ color: '#dc2626' }}>{formatCurrency(l.ir)}</TableCell>
                      <TableCell style={{ color: '#15803d' }}>{formatCurrency(l.fgts)}</TableCell>
                      <TableCell style={{ color: '#1e3a5f' }}>{formatCurrency(l.inssPatronal)}</TableCell>
                      <TableCell style={{ color: '#92400e' }}>{formatCurrency(l.rat)}</TableCell>
                      <TableCell style={{ color: '#7c3aed', fontWeight: 600 }}>{formatCurrency(l.totalEmpresa)}</TableCell>
                      <TableCell style={{ color: '#be123c', fontWeight: 600 }}>{formatCurrency(l.totalDescontos)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>

                {/* Rodapé com somatórios */}
                <TableFooter>
                  <TableRow style={{ fontWeight: 700, fontSize: 12 }}>
                    <TableCell
                      colSpan={3}
                      style={{ background: '#1e3a5f', color: '#fff', fontWeight: 700 }}
                    >
                      TOTAIS ({totais.qtd} colaboradores)
                    </TableCell>
                    <TableCell style={{ background: '#1e3a5f', color: '#fff' }}>
                      {formatCurrency(totais.salario)}
                    </TableCell>
                    <TableCell style={{ background: '#1e3a5f', color: '#93c5fd' }}>
                      {formatCurrency(totais.inss)}
                    </TableCell>
                    <TableCell style={{ background: '#1e3a5f', color: '#fca5a5' }}>
                      {formatCurrency(totais.ir)}
                    </TableCell>
                    <TableCell style={{ background: '#1e3a5f', color: '#86efac' }}>
                      {formatCurrency(totais.fgts)}
                    </TableCell>
                    <TableCell style={{ background: '#1e3a5f', color: '#bfdbfe' }}>
                      {formatCurrency(totais.inssPatronal)}
                    </TableCell>
                    <TableCell style={{ background: '#1e3a5f', color: '#fde68a' }}>
                      {formatCurrency(totais.rat)}
                    </TableCell>
                    <TableCell style={{ background: '#1e3a5f', color: '#c4b5fd', fontWeight: 700 }}>
                      {formatCurrency(totais.totalEmpresa)}
                    </TableCell>
                    <TableCell style={{ background: '#1e3a5f', color: '#fda4af', fontWeight: 700 }}>
                      {formatCurrency(totais.totalDescontos)}
                    </TableCell>
                  </TableRow>
                </TableFooter>
              </Table>

              {/* Legenda */}
              <div className="flex gap-4 px-4 py-2 border-t border-border text-xs text-muted-foreground">
                <span>¹ Retido do funcionário</span>
                <span>² Encargo da empresa</span>
              </div>
            </div>
          )}

          {/* ── Seção de totais finais ── */}
          {linhas.length > 0 && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* Descontos retidos dos funcionários */}
              <div
                style={{
                  background: 'var(--card)',
                  borderRadius: 10,
                  border: '2px solid #be123c',
                  padding: '18px 20px',
                }}
              >
                <p className="text-sm font-semibold text-muted-foreground mb-3">
                  Descontos Retidos dos Funcionários
                  <span className="text-xs ml-1 font-normal">(a recolher ao governo)</span>
                </p>
                <div className="space-y-2">
                  <div className="flex justify-between items-center text-sm">
                    <span style={{ color: '#0369a1' }} className="font-medium">INSS dos funcionários</span>
                    <span style={{ color: '#0369a1' }} className="font-bold">{formatCurrency(totais.inss)}</span>
                  </div>
                  <div className="flex justify-between items-center text-sm">
                    <span style={{ color: '#dc2626' }} className="font-medium">IR dos funcionários</span>
                    <span style={{ color: '#dc2626' }} className="font-bold">{formatCurrency(totais.ir)}</span>
                  </div>
                  <div
                    className="flex justify-between items-center pt-2 mt-2"
                    style={{ borderTop: '1px solid var(--border)' }}
                  >
                    <span className="font-bold text-base" style={{ color: '#be123c' }}>Total a Recolher</span>
                    <span className="font-bold text-lg" style={{ color: '#be123c' }}>
                      {formatCurrency(totais.totalDescontos)}
                    </span>
                  </div>
                </div>
              </div>

              {/* Encargos da empresa */}
              <div
                style={{
                  background: 'var(--card)',
                  borderRadius: 10,
                  border: '2px solid #7c3aed',
                  padding: '18px 20px',
                }}
              >
                <p className="text-sm font-semibold text-muted-foreground mb-3">
                  Encargos da Empresa
                  <span className="text-xs ml-1 font-normal">(a recolher ao governo)</span>
                </p>
                <div className="space-y-2">
                  <div className="flex justify-between items-center text-sm">
                    <span style={{ color: '#15803d' }} className="font-medium">FGTS (8%)</span>
                    <span style={{ color: '#15803d' }} className="font-bold">{formatCurrency(totais.fgts)}</span>
                  </div>
                  <div className="flex justify-between items-center text-sm">
                    <span style={{ color: '#1e3a5f' }} className="font-medium">INSS Patronal (20%)</span>
                    <span style={{ color: '#1e3a5f' }} className="font-bold">{formatCurrency(totais.inssPatronal)}</span>
                  </div>
                  <div className="flex justify-between items-center text-sm">
                    <span style={{ color: '#92400e' }} className="font-medium">RAT (3,5%)</span>
                    <span style={{ color: '#92400e' }} className="font-bold">{formatCurrency(totais.rat)}</span>
                  </div>
                  <div
                    className="flex justify-between items-center pt-2 mt-2"
                    style={{ borderTop: '1px solid var(--border)' }}
                  >
                    <span className="font-bold text-base" style={{ color: '#7c3aed' }}>Total a Recolher</span>
                    <span className="font-bold text-lg" style={{ color: '#7c3aed' }}>
                      {formatCurrency(totais.totalEmpresa)}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          )}
        </>
      )}

      {/* Estado inicial (antes de calcular) */}
      {!loading && !calculado && (
        <EmptyState
          icon={<Search size={32} />}
          title="Selecione o período"
          description="Escolha o mês e o ano e clique em Calcular para visualizar os encargos trabalhistas."
        />
      )}
    </div>
  )
}
