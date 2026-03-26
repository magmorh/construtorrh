import React, { useState, useCallback } from 'react'
import { supabase } from '@/lib/supabase'
import { formatCurrency } from '@/lib/utils'
import { calcINSS, calcIR } from '@/lib/encargos'
import { PageHeader, LoadingSkeleton, EmptyState, SummaryCard } from '@/components/Shared'
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

interface LinhaEncargo {
  colaborador_id: string
  nome:           string
  chapa:          string | null
  funcao_nome:    string
  obra_nome:      string
  // remuneração
  valorHoras:     number   // horas normais + extras
  valorDSR:       number
  valorProducao:  number
  valorPremio:    number
  salarioBruto:   number   // total bruto
  // descontos do funcionário
  descontoVT:     number
  descontoAD:     number
  inss:           number
  ir:             number
  liquido:        number
  // encargos da empresa
  fgts:           number
  inssPatronal:   number
  rat:            number
  totalEmpresa:   number
}

// ─── Constantes ───────────────────────────────────────────────────────────────

const MESES = [
  'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
  'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro',
]
const ANOS = [2024, 2025, 2026, 2027]

// ─── Helpers ──────────────────────────────────────────────────────────────────

function expandRange(inicio: string, fim: string): string[] {
  const dias: string[] = []
  const d   = new Date(inicio + 'T12:00:00')
  const end = new Date(fim   + 'T12:00:00')
  while (d <= end) {
    dias.push(d.toISOString().slice(0, 10))
    d.setDate(d.getDate() + 1)
  }
  return dias
}

function diasUteisPeriodo(inicio: string, fim: string, feriados: Set<string>): number {
  return expandRange(inicio, fim).filter(d => {
    const dow = new Date(d + 'T12:00:00').getDay()
    return dow >= 1 && dow <= 6 && !feriados.has(d)
  }).length
}

function domingosFeriadosPeriodo(inicio: string, fim: string, feriados: Set<string>): number {
  const dias = expandRange(inicio, fim)
  const domingos = dias.filter(d => new Date(d + 'T12:00:00').getDay() === 0).length
  const feriadosUteis = dias.filter(d => {
    if (!feriados.has(d)) return false
    const dow = new Date(d + 'T12:00:00').getDay()
    return dow >= 1 && dow <= 5
  }).length
  return domingos + feriadosUteis
}

// ─── Componente ───────────────────────────────────────────────────────────────

export default function EncargosPage() {
  const hoje = new Date()
  const [mes,      setMes]      = useState<number>(hoje.getMonth() + 1)
  const [ano,      setAno]      = useState<number>(hoje.getFullYear())
  const [linhas,   setLinhas]   = useState<LinhaEncargo[]>([])
  const [loading,  setLoading]  = useState(false)
  const [calculado, setCalculado] = useState(false)
  const [busca,    setBusca]    = useState('')

  // ── Calcular ────────────────────────────────────────────────────────────────
  const calcular = useCallback(async () => {
    setLoading(true)
    setCalculado(false)
    try {
      const mesRef    = `${ano}-${String(mes).padStart(2, '0')}`
      const mesRefIni = `${mesRef}-01`
      const mesRefFim = `${mesRef}-31`

      // 1. Todos os lançamentos do mês (qualquer status válido)
      const { data: lancsRaw, error: errL } = await supabase
        .from('ponto_lancamentos')
        .select(`
          id, colaborador_id, data_inicio, data_fim, mes_referencia, status,
          snap_valor_horas, snap_valor_dsr, snap_valor_producao, snap_valor_premio,
          snap_valor_total, snap_inss, snap_ir, snap_desconto_vt, snap_desconto_adiant,
          snap_liquido, snap_valor_hora,
          colaboradores(nome, chapa, tipo_contrato, funcao_id, funcoes(nome)),
          obras(nome)
        `)
        .in('status', ['aprovado', 'em_fechamento', 'liberado', 'pago'])
        .eq('mes_referencia', mesRef)

      if (errL) throw new Error(traduzirErro(errL?.message ?? String(errL)))
      if (!lancsRaw || lancsRaw.length === 0) {
        setLinhas([]); setCalculado(true); return
      }

      // 2. Somente CLT
      const lancsCLT = (lancsRaw as any[]).filter(
        l => (l.colaboradores?.tipo_contrato ?? 'clt') === 'clt'
      )
      if (lancsCLT.length === 0) {
        setLinhas([]); setCalculado(true); return
      }

      // ── Dados complementares para lançamentos SEM snap (em aberto) ──────────
      const semSnap = lancsCLT.filter(l => l.snap_valor_total == null)

      let pontosMap:    Record<string, { normais: number; extras: number }> = {}
      let valorHoraMap: Record<string, number> = {}
      let feriadosSet = new Set<string>()

      if (semSnap.length > 0) {
        const semSnapIds  = semSnap.map((l: any) => l.id)
        const funcaoIds   = [...new Set(semSnap.map((l: any) => l.colaboradores?.funcao_id).filter(Boolean) as string[])]

        const [{ data: pontosRaw }, { data: fvRaw }, { data: feriadosRaw }] = await Promise.all([
          supabase.from('registro_ponto')
            .select('lancamento_id, horas_trabalhadas, horas_extras')
            .in('lancamento_id', semSnapIds),
          supabase.from('funcao_valores')
            .select('funcao_id, tipo_contrato, valor_hora')
            .in('funcao_id', funcaoIds),
          supabase.from('feriados')
            .select('data')
            .gte('data', mesRefIni)
            .lte('data', mesRefFim),
        ])

        ;(feriadosRaw ?? []).forEach((f: any) => feriadosSet.add(f.data))

        ;(pontosRaw ?? []).forEach((p: any) => {
          if (!pontosMap[p.lancamento_id]) pontosMap[p.lancamento_id] = { normais: 0, extras: 0 }
          pontosMap[p.lancamento_id].normais += p.horas_trabalhadas ?? 0
          pontosMap[p.lancamento_id].extras  += p.horas_extras      ?? 0
        })

        ;(fvRaw ?? []).forEach((fv: any) => {
          if (fv.tipo_contrato === 'clt' || !valorHoraMap[fv.funcao_id]) {
            valorHoraMap[fv.funcao_id] = fv.valor_hora ?? 0
          }
        })
      }

      // 3. Processar cada lançamento individualmente (1 linha por lançamento)
      const resultado: LinhaEncargo[] = []

      for (const l of lancsCLT) {
        const colab = l.colaboradores as any

        // ── Caso A: snap disponível (lançamento fechado/liberado/pago) ─────────
        let valorHoras   = 0
        let valorDSR     = 0
        let valorProducao = 0
        let valorPremio  = 0
        let salarioBruto = 0
        let descontoVT   = 0
        let descontoAD   = 0
        let inss         = 0
        let ir           = 0
        let liquido      = 0

        if (l.snap_valor_total != null) {
          valorHoras    = l.snap_valor_horas    ?? 0
          valorDSR      = l.snap_valor_dsr      ?? 0
          valorProducao = l.snap_valor_producao  ?? 0
          valorPremio   = l.snap_valor_premio    ?? 0
          salarioBruto  = l.snap_valor_total     ?? 0
          descontoVT    = l.snap_desconto_vt     ?? 0
          descontoAD    = l.snap_desconto_adiant ?? 0
          inss          = l.snap_inss            ?? 0
          ir            = l.snap_ir              ?? 0
          liquido       = l.snap_liquido         ?? (salarioBruto - descontoVT - descontoAD - inss - ir)
        } else {
          // ── Caso B: recalcular (lançamento ainda em aberto) ─────────────────
          const funcaoId  = colab?.funcao_id ?? null
          const vh        = funcaoId ? (valorHoraMap[funcaoId] ?? 0) : (l.snap_valor_hora ?? 0)
          const pt        = pontosMap[l.id] ?? { normais: 0, extras: 0 }
          const duDias    = diasUteisPeriodo(l.data_inicio, l.data_fim, feriadosSet)
          const domFer    = domingosFeriadosPeriodo(l.data_inicio, l.data_fim, feriadosSet)

          valorHoras    = pt.normais * vh + pt.extras * vh * 1.5
          valorDSR      = duDias > 0 ? (valorHoras / duDias) * domFer : 0
          salarioBruto  = valorHoras + valorDSR
          inss          = calcINSS(salarioBruto)
          ir            = calcIR(salarioBruto, inss)
          liquido       = salarioBruto - inss - ir
        }

        // encargos empresa sempre calculados sobre bruto
        const fgts         = salarioBruto * 0.08
        const inssPatronal = salarioBruto * 0.20
        const rat          = salarioBruto * 0.035
        const totalEmpresa = fgts + inssPatronal + rat

        resultado.push({
          colaborador_id: l.colaborador_id,
          nome:         colab?.nome       ?? '—',
          chapa:        colab?.chapa      ?? null,
          funcao_nome:  colab?.funcoes?.nome ?? 'Sem função',
          obra_nome:    (l.obras as any)?.nome ?? '—',
          valorHoras,
          valorDSR,
          valorProducao,
          valorPremio,
          salarioBruto,
          descontoVT,
          descontoAD,
          inss,
          ir,
          liquido,
          fgts,
          inssPatronal,
          rat,
          totalEmpresa,
        })
      }

      resultado.sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'))
      setLinhas(resultado)
      setCalculado(true)
    } catch (err: any) {
      toast.error(err?.message ?? 'Erro ao calcular encargos')
    } finally {
      setLoading(false)
    }
  }, [mes, ano])

  // ── Exportar CSV ────────────────────────────────────────────────────────────
  const exportarCSV = useCallback(() => {
    if (!linhas.length) return
    const cab = [
      'Colaborador','Chapa','Função','Obra',
      'Horas','DSR','Produção','Prêmio','Bruto',
      'VT','AD','INSS','IR','Líquido',
      'FGTS (emp.)','INSS Pat. (emp.)','RAT (emp.)','Total Emp.',
    ]
    const rows = linhas.map(l => [
      l.nome, l.chapa ?? '', l.funcao_nome, l.obra_nome,
      l.valorHoras.toFixed(2), l.valorDSR.toFixed(2),
      l.valorProducao.toFixed(2), l.valorPremio.toFixed(2),
      l.salarioBruto.toFixed(2),
      l.descontoVT.toFixed(2), l.descontoAD.toFixed(2),
      l.inss.toFixed(2), l.ir.toFixed(2), l.liquido.toFixed(2),
      l.fgts.toFixed(2), l.inssPatronal.toFixed(2),
      l.rat.toFixed(2), l.totalEmpresa.toFixed(2),
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

  // ── Filtro por busca ────────────────────────────────────────────────────────
  const linhasFiltradas = React.useMemo(() => {
    if (!busca.trim()) return linhas
    const q = busca.toLowerCase()
    return linhas.filter(l =>
      l.nome.toLowerCase().includes(q) ||
      (l.chapa ?? '').toLowerCase().includes(q) ||
      l.obra_nome.toLowerCase().includes(q) ||
      l.funcao_nome.toLowerCase().includes(q)
    )
  }, [linhas, busca])

  // ── Totalizadores ───────────────────────────────────────────────────────────
  const totais = React.useMemo(() => ({
    qtd:           linhasFiltradas.length,
    salarioBruto:  linhasFiltradas.reduce((s, l) => s + l.salarioBruto,  0),
    valorHoras:    linhasFiltradas.reduce((s, l) => s + l.valorHoras,    0),
    valorDSR:      linhasFiltradas.reduce((s, l) => s + l.valorDSR,      0),
    valorProducao: linhasFiltradas.reduce((s, l) => s + l.valorProducao, 0),
    valorPremio:   linhasFiltradas.reduce((s, l) => s + l.valorPremio,   0),
    descontoVT:    linhasFiltradas.reduce((s, l) => s + l.descontoVT,    0),
    descontoAD:    linhasFiltradas.reduce((s, l) => s + l.descontoAD,    0),
    inss:          linhasFiltradas.reduce((s, l) => s + l.inss,          0),
    ir:            linhasFiltradas.reduce((s, l) => s + l.ir,            0),
    liquido:       linhasFiltradas.reduce((s, l) => s + l.liquido,       0),
    fgts:          linhasFiltradas.reduce((s, l) => s + l.fgts,          0),
    inssPatronal:  linhasFiltradas.reduce((s, l) => s + l.inssPatronal,  0),
    rat:           linhasFiltradas.reduce((s, l) => s + l.rat,           0),
    totalEmpresa:  linhasFiltradas.reduce((s, l) => s + l.totalEmpresa,  0),
  }), [linhasFiltradas])

  // ─── Render ─────────────────────────────────────────────────────────────────
  return (
    <div className="p-6 space-y-6">
      <PageHeader
        title="Encargos Trabalhistas"
        subtitle="INSS, IR, FGTS e encargos patronais — dados do Fechamento de Ponto"
        action={
          calculado && linhas.length > 0 ? (
            <Button variant="outline" size="sm" onClick={exportarCSV}>
              <Download className="w-4 h-4 mr-2" />
              Exportar CSV
            </Button>
          ) : undefined
        }
      />

      {/* ── Filtros ─────────────────────────────────────────────────────────── */}
      <div
        style={{ background: 'var(--card)', borderRadius: 10, border: '1px solid var(--border)', padding: '14px 16px' }}
        className="flex flex-wrap items-end gap-4"
      >
        <div className="flex flex-col gap-1">
          <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Mês</span>
          <Select value={String(mes)} onValueChange={v => setMes(Number(v))}>
            <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
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
            <SelectTrigger className="w-28"><SelectValue /></SelectTrigger>
            <SelectContent>
              {ANOS.map(a => <SelectItem key={a} value={String(a)}>{a}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>

        <Button onClick={calcular} disabled={loading} className="mb-0.5">
          <Search className="w-4 h-4 mr-2" />
          {loading ? 'Calculando…' : 'Calcular'}
        </Button>

        {/* Busca — só aparece após calcular */}
        {calculado && linhas.length > 0 && (
          <div className="flex flex-col gap-1 flex-1 min-w-48">
            <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Buscar</span>
            <input
              value={busca}
              onChange={e => setBusca(e.target.value)}
              placeholder="Colaborador, obra, função…"
              style={{
                height: 36, padding: '0 12px', borderRadius: 8,
                border: '1px solid var(--border)', background: 'var(--background)',
                color: 'var(--foreground)', fontSize: 13, width: '100%',
              }}
            />
          </div>
        )}
      </div>

      {loading && <LoadingSkeleton />}

      {/* ── Cards de resumo ─────────────────────────────────────────────────── */}
      {!loading && calculado && (
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 gap-4">
            <SummaryCard
              sigla="CLT"
              label="Lançamentos"
              value={String(totais.qtd)}
              sub="colaboradores CLT"
              color="#1e3a5f"
              bg="#1e3a5f"
            />
            <SummaryCard
              sigla="RS"
              label="Bruto Total"
              value={formatCurrency(totais.salarioBruto)}
              color="#15803d"
              bg="#15803d"
            />
            <SummaryCard
              sigla="IN"
              label="INSS Retido"
              value={formatCurrency(totais.inss)}
              color="#0369a1"
              bg="#0369a1"
            />
            <SummaryCard
              sigla="IR"
              label="IR Retido"
              value={formatCurrency(totais.ir)}
              color="#dc2626"
              bg="#dc2626"
            />

            <SummaryCard
              sigla="EMP"
              label="Enc. Empresa"
              value={formatCurrency(totais.totalEmpresa)}
              sub="FGTS + INSS Pat. + RAT"
              color="#7c3aed"
              bg="#7c3aed"
            />
          </div>

          {/* ── Tabela ────────────────────────────────────────────────────────── */}
          {linhasFiltradas.length === 0 ? (
            <EmptyState
              icon={<Briefcase size={32} />}
              title="Nenhum resultado"
              description={busca ? 'Nenhum colaborador encontrado para a busca.' : 'Não há lançamentos CLT aprovados no período.'}
            />
          ) : (
            <div style={{ background: 'var(--card)', borderRadius: 10, border: '1px solid var(--border)', overflow: 'hidden' }}>
              <Table style={{ fontSize: 11 }}>
                <TableHeader>
                  <TableRow>
                    {[
                      { label: 'Colaborador',    tip: ''  },
                      { label: 'Chapa',          tip: ''  },
                      { label: 'Horas ³',        tip: 'Normais + extras' },
                      { label: 'DSR ³',          tip: 'Descanso Semanal' },
                      { label: 'Produção ³',     tip: 'Produtividade' },
                      { label: 'Prêmio ³',       tip: 'Bônus produtividade' },
                      { label: '💰 Bruto',       tip: 'Total bruto' },
                      { label: '🚌 - VT ¹',      tip: 'Vale transporte descontado' },
                      { label: '💳 - AD ¹',      tip: 'Adiantamento descontado' },
                      { label: '🏛️ - INSS ¹',    tip: 'INSS retido do funcionário' },
                      { label: '📋 - IR ¹',      tip: 'IR retido do funcionário' },
                      { label: '✅ Líquido',     tip: 'Valor a pagar' },
                      { label: 'FGTS ²',         tip: '8% sobre bruto' },
                      { label: 'INSS Pat. ²',    tip: '20% sobre bruto' },
                      { label: 'RAT ²',          tip: '3,5% sobre bruto' },
                      { label: 'Total Emp. ²',   tip: 'FGTS + INSS Pat. + RAT' },
                    ].map(h => (
                      <TableHead
                        key={h.label}
                        title={h.tip}
                        style={{ background: '#1e3a5f', color: '#fff', fontWeight: 600, whiteSpace: 'nowrap', fontSize: 11, padding: '8px 10px' }}
                      >
                        {h.label}
                      </TableHead>
                    ))}
                  </TableRow>
                </TableHeader>

                <TableBody>
                  {linhasFiltradas.map((l, idx) => (
                    <TableRow key={`${l.colaborador_id}-${idx}`} style={{ background: idx % 2 === 0 ? 'var(--card)' : 'var(--muted)' }}>
                      <TableCell style={{ whiteSpace: 'nowrap', padding: '7px 10px' }}>
                        <div style={{ fontWeight: 700, fontSize: 12 }}>{l.nome}</div>
                        <div style={{ fontSize: 11, color: 'var(--muted-foreground)' }}>{l.funcao_nome} · {l.obra_nome}</div>
                      </TableCell>
                      <TableCell style={{ color: 'var(--muted-foreground)', padding: '7px 10px' }}>{l.chapa ?? '—'}</TableCell>
                      {/* Composição */}
                      <TableCell style={{ padding: '7px 10px' }}>{formatCurrency(l.valorHoras)}</TableCell>
                      <TableCell style={{ padding: '7px 10px', color: '#0369a1' }}>{formatCurrency(l.valorDSR)}</TableCell>
                      <TableCell style={{ padding: '7px 10px', color: '#7c3aed' }}>{l.valorProducao > 0 ? formatCurrency(l.valorProducao) : '—'}</TableCell>
                      <TableCell style={{ padding: '7px 10px', color: '#be185d' }}>{l.valorPremio > 0 ? formatCurrency(l.valorPremio) : '—'}</TableCell>
                      {/* Bruto */}
                      <TableCell style={{ padding: '7px 10px', fontWeight: 700, color: '#15803d' }}>{formatCurrency(l.salarioBruto)}</TableCell>
                      {/* Descontos funcionário */}
                      <TableCell style={{ padding: '7px 10px', color: '#b45309' }}>{l.descontoVT > 0 ? `- ${formatCurrency(l.descontoVT)}` : '—'}</TableCell>
                      <TableCell style={{ padding: '7px 10px', color: '#7c3aed' }}>{l.descontoAD > 0 ? `- ${formatCurrency(l.descontoAD)}` : '—'}</TableCell>
                      <TableCell style={{ padding: '7px 10px', color: '#0369a1' }}>{l.inss > 0 ? `- ${formatCurrency(l.inss)}` : '—'}</TableCell>
                      <TableCell style={{ padding: '7px 10px', color: '#dc2626' }}>{l.ir > 0 ? `- ${formatCurrency(l.ir)}` : '—'}</TableCell>
                      {/* Líquido */}
                      <TableCell style={{ padding: '7px 10px', fontWeight: 800, color: '#1e3a5f' }}>{formatCurrency(l.liquido)}</TableCell>
                      {/* Encargos empresa */}
                      <TableCell style={{ padding: '7px 10px', color: '#15803d' }}>{formatCurrency(l.fgts)}</TableCell>
                      <TableCell style={{ padding: '7px 10px', color: '#1e3a5f' }}>{formatCurrency(l.inssPatronal)}</TableCell>
                      <TableCell style={{ padding: '7px 10px', color: '#92400e' }}>{formatCurrency(l.rat)}</TableCell>
                      <TableCell style={{ padding: '7px 10px', fontWeight: 700, color: '#7c3aed' }}>{formatCurrency(l.totalEmpresa)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>

                <TableFooter>
                  <TableRow style={{ fontSize: 11 }}>
                    <TableCell colSpan={2} style={{ background: '#1e3a5f', color: '#fff', fontWeight: 700, padding: '8px 10px' }}>
                      TOTAIS ({totais.qtd} lançamentos)
                    </TableCell>
                    <TableCell style={{ background: '#1e3a5f', color: '#fff', padding: '8px 10px' }}>{formatCurrency(totais.valorHoras)}</TableCell>
                    <TableCell style={{ background: '#1e3a5f', color: '#93c5fd', padding: '8px 10px' }}>{formatCurrency(totais.valorDSR)}</TableCell>
                    <TableCell style={{ background: '#1e3a5f', color: '#c4b5fd', padding: '8px 10px' }}>{formatCurrency(totais.valorProducao)}</TableCell>
                    <TableCell style={{ background: '#1e3a5f', color: '#f9a8d4', padding: '8px 10px' }}>{formatCurrency(totais.valorPremio)}</TableCell>
                    <TableCell style={{ background: '#1e3a5f', color: '#86efac', fontWeight: 700, padding: '8px 10px' }}>{formatCurrency(totais.salarioBruto)}</TableCell>
                    <TableCell style={{ background: '#1e3a5f', color: '#fde68a', padding: '8px 10px' }}>{totais.descontoVT > 0 ? `- ${formatCurrency(totais.descontoVT)}` : '—'}</TableCell>
                    <TableCell style={{ background: '#1e3a5f', color: '#c4b5fd', padding: '8px 10px' }}>{totais.descontoAD > 0 ? `- ${formatCurrency(totais.descontoAD)}` : '—'}</TableCell>
                    <TableCell style={{ background: '#1e3a5f', color: '#93c5fd', padding: '8px 10px' }}>{formatCurrency(totais.inss)}</TableCell>
                    <TableCell style={{ background: '#1e3a5f', color: '#fca5a5', padding: '8px 10px' }}>{formatCurrency(totais.ir)}</TableCell>
                    <TableCell style={{ background: '#1e3a5f', color: '#86efac', fontWeight: 800, padding: '8px 10px' }}>{formatCurrency(totais.liquido)}</TableCell>
                    <TableCell style={{ background: '#1e3a5f', color: '#86efac', padding: '8px 10px' }}>{formatCurrency(totais.fgts)}</TableCell>
                    <TableCell style={{ background: '#1e3a5f', color: '#bfdbfe', padding: '8px 10px' }}>{formatCurrency(totais.inssPatronal)}</TableCell>
                    <TableCell style={{ background: '#1e3a5f', color: '#fde68a', padding: '8px 10px' }}>{formatCurrency(totais.rat)}</TableCell>
                    <TableCell style={{ background: '#1e3a5f', color: '#c4b5fd', fontWeight: 700, padding: '8px 10px' }}>{formatCurrency(totais.totalEmpresa)}</TableCell>
                  </TableRow>
                </TableFooter>
              </Table>

              {/* Legenda */}
              <div className="flex flex-wrap gap-4 px-4 py-2 border-t border-border text-xs text-muted-foreground">
                <span>¹ Desconto retido do funcionário</span>
                <span>² Encargo da empresa</span>
                <span>³ Composição do salário bruto</span>
              </div>
            </div>
          )}

          {/* ── Painéis de totais ─────────────────────────────────────────────── */}
          {linhasFiltradas.length > 0 && (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">

              {/* Composição do bruto */}
              <div style={{ background: 'var(--card)', borderRadius: 10, border: '2px solid #15803d', padding: '18px 20px' }}>
                <p className="text-sm font-semibold text-muted-foreground mb-3">
                  Composição do Salário Bruto
                </p>
                <div className="space-y-2">
                  {[
                    { label: 'Horas trabalhadas',   val: totais.valorHoras,    cor: '#374151' },
                    { label: 'DSR',                  val: totais.valorDSR,      cor: '#0369a1' },
                    { label: 'Produção',             val: totais.valorProducao, cor: '#7c3aed', skip: totais.valorProducao === 0 },
                    { label: 'Prêmios',              val: totais.valorPremio,   cor: '#be185d', skip: totais.valorPremio === 0 },
                  ].filter(i => !i.skip).map(i => (
                    <div key={i.label} className="flex justify-between items-center text-sm">
                      <span style={{ color: i.cor }} className="font-medium">{i.label}</span>
                      <span style={{ color: i.cor }} className="font-bold">{formatCurrency(i.val)}</span>
                    </div>
                  ))}
                  <div className="flex justify-between items-center pt-2 mt-2" style={{ borderTop: '1px solid var(--border)' }}>
                    <span className="font-bold text-base" style={{ color: '#15803d' }}>Total Bruto</span>
                    <span className="font-bold text-lg" style={{ color: '#15803d' }}>{formatCurrency(totais.salarioBruto)}</span>
                  </div>
                </div>
              </div>

              {/* Descontos dos funcionários */}
              <div style={{ background: 'var(--card)', borderRadius: 10, border: '2px solid #be123c', padding: '18px 20px' }}>
                <p className="text-sm font-semibold text-muted-foreground mb-3">
                  Descontos Retidos dos Funcionários
                  <span className="text-xs ml-1 font-normal">(a recolher ao governo)</span>
                </p>
                <div className="space-y-2">
                  {totais.descontoVT > 0 && (
                    <div className="flex justify-between items-center text-sm">
                      <span style={{ color: '#b45309' }} className="font-medium">🚌 Vale Transporte</span>
                      <span style={{ color: '#b45309' }} className="font-bold">- {formatCurrency(totais.descontoVT)}</span>
                    </div>
                  )}
                  {totais.descontoAD > 0 && (
                    <div className="flex justify-between items-center text-sm">
                      <span style={{ color: '#7c3aed' }} className="font-medium">💳 Adiantamentos</span>
                      <span style={{ color: '#7c3aed' }} className="font-bold">- {formatCurrency(totais.descontoAD)}</span>
                    </div>
                  )}
                  <div className="flex justify-between items-center text-sm">
                    <span style={{ color: '#0369a1' }} className="font-medium">🏛️ INSS dos funcionários</span>
                    <span style={{ color: '#0369a1' }} className="font-bold">- {formatCurrency(totais.inss)}</span>
                  </div>
                  <div className="flex justify-between items-center text-sm">
                    <span style={{ color: '#dc2626' }} className="font-medium">📋 IR dos funcionários</span>
                    <span style={{ color: '#dc2626' }} className="font-bold">- {formatCurrency(totais.ir)}</span>
                  </div>
                  <div className="flex justify-between items-center pt-2 mt-2" style={{ borderTop: '1px solid var(--border)' }}>
                    <span className="font-bold text-base" style={{ color: '#be123c' }}>Total a Recolher</span>
                    <span className="font-bold text-lg" style={{ color: '#be123c' }}>
                      {formatCurrency(totais.inss + totais.ir)}
                    </span>
                  </div>
                  <div className="flex justify-between items-center text-sm pt-1">
                    <span className="font-bold" style={{ color: '#1e3a5f' }}>💵 Líquido total a pagar</span>
                    <span className="font-bold" style={{ color: '#1e3a5f' }}>{formatCurrency(totais.liquido)}</span>
                  </div>
                </div>
              </div>

              {/* Encargos da empresa */}
              <div style={{ background: 'var(--card)', borderRadius: 10, border: '2px solid #7c3aed', padding: '18px 20px' }}>
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
                  <div className="flex justify-between items-center pt-2 mt-2" style={{ borderTop: '1px solid var(--border)' }}>
                    <span className="font-bold text-base" style={{ color: '#7c3aed' }}>Total a Recolher</span>
                    <span className="font-bold text-lg" style={{ color: '#7c3aed' }}>{formatCurrency(totais.totalEmpresa)}</span>
                  </div>
                  <div className="flex justify-between items-center text-sm pt-1">
                    <span className="font-medium text-muted-foreground">Custo total empresa</span>
                    <span className="font-bold" style={{ color: '#dc2626' }}>
                      {formatCurrency(totais.salarioBruto + totais.totalEmpresa)}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          )}
        </>
      )}

      {/* Estado inicial */}
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
