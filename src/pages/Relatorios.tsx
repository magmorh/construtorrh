import React, { useState, useEffect, useCallback } from 'react'
import { supabase } from '@/lib/supabase'
import { formatCurrency } from '@/lib/utils'
import { PageHeader } from '@/components/Shared'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
  Building2, Users, DollarSign, TrendingUp,
  Printer, Loader2, RefreshCw, Calculator, PiggyBank,
} from 'lucide-react'
import { toast } from 'sonner'

// ─── Helpers ─────────────────────────────────────────────────────────────────

const MESES = [
  { value: '01', label: 'Janeiro' },
  { value: '02', label: 'Fevereiro' },
  { value: '03', label: 'Março' },
  { value: '04', label: 'Abril' },
  { value: '05', label: 'Maio' },
  { value: '06', label: 'Junho' },
  { value: '07', label: 'Julho' },
  { value: '08', label: 'Agosto' },
  { value: '09', label: 'Setembro' },
  { value: '10', label: 'Outubro' },
  { value: '11', label: 'Novembro' },
  { value: '12', label: 'Dezembro' },
]

const ANOS = Array.from({ length: 6 }, (_, i) => {
  const y = 2026 - i
  return { value: String(y), label: String(y) }
})

function mesLabel(mesRef: string): string {
  // mesRef = '2026-03'
  const [ano, mes] = mesRef.split('-')
  const m = MESES.find(x => x.value === mes)
  return m ? `${m.label}/${ano}` : mesRef
}

function formatNum(v: number | null | undefined): string {
  if (v == null) return '—'
  return v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

// ─── Tipos ────────────────────────────────────────────────────────────────────

interface ObraOption {
  id: string
  nome: string
}

interface ConfigMap {
  empresa_nome?: string
  empresa_cnpj?: string
  empresa_endereco?: string
  empresa_cidade?: string
  empresa_cep?: string
  empresa_telefone?: string
  empresa_logo_url?: string
  empresa_razao_social?: string
}

// Aba 1
interface ObraFuncaoRow {
  obraId: string
  obraNome: string
  funcaoId: string
  funcaoNome: string
  qtdColab: number
  hNormais: number
  hExtras: number
  valorHoras: number
  dsr: number
  producao: number
  premio: number
  bruto: number
  inss: number
  ir: number
  descontoVt: number
  descontoAd: number
  liquido: number
}

// Aba 2
interface EncargosRow {
  obraId: string
  obraNome: string
  mes: string
  baseSalarial: number
  fgts: number
  inssEmpresa: number
  seguro: number
  sesiSenai: number
  totalEncargos: number
}

// Aba 3
interface ProvisaoRow {
  funcaoId: string
  funcaoNome: string
  mes: string
  base: number
  fgts: number
  ferias: number
  decimoTerceiro: number
  totalProvisao: number
}

// ─── Componente de filtros de período ────────────────────────────────────────

interface PeriodoFiltros {
  mesInicio: string
  anoInicio: string
  mesFim: string
  anoFim: string
}

function PeriodoSelector({
  value,
  onChange,
}: {
  value: PeriodoFiltros
  onChange: (v: PeriodoFiltros) => void
}) {
  return (
    <div className="flex flex-wrap gap-3 items-end">
      <div className="flex flex-col gap-1">
        <Label className="text-xs">Mês Início</Label>
        <Select
          value={value.mesInicio}
          onValueChange={v => onChange({ ...value, mesInicio: v })}
        >
          <SelectTrigger className="w-36">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {MESES.map(m => (
              <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="flex flex-col gap-1">
        <Label className="text-xs">Ano Início</Label>
        <Select
          value={value.anoInicio}
          onValueChange={v => onChange({ ...value, anoInicio: v })}
        >
          <SelectTrigger className="w-24">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {ANOS.map(a => (
              <SelectItem key={a.value} value={a.value}>{a.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <span className="text-muted-foreground text-sm pb-2">até</span>
      <div className="flex flex-col gap-1">
        <Label className="text-xs">Mês Fim</Label>
        <Select
          value={value.mesFim}
          onValueChange={v => onChange({ ...value, mesFim: v })}
        >
          <SelectTrigger className="w-36">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {MESES.map(m => (
              <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="flex flex-col gap-1">
        <Label className="text-xs">Ano Fim</Label>
        <Select
          value={value.anoFim}
          onValueChange={v => onChange({ ...value, anoFim: v })}
        >
          <SelectTrigger className="w-24">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {ANOS.map(a => (
              <SelectItem key={a.value} value={a.value}>{a.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    </div>
  )
}

// ─── Função de impressão ─────────────────────────────────────────────────────

function abrirJanelaImpressao(
  titulo: string,
  periodo: string,
  conteudoHtml: string,
  config: ConfigMap,
) {
  const logoHtml = config.empresa_logo_url
    ? `<img src="${config.empresa_logo_url}" alt="Logo" style="height:60px;object-fit:contain;" />`
    : `<div style="width:60px;height:60px;background:#1e3a5f;border-radius:8px;display:flex;align-items:center;justify-content:center;color:white;font-size:20px;font-weight:bold;">${(config.empresa_nome ?? 'E')[0]}</div>`

  const agora = new Date().toLocaleString('pt-BR')

  const html = `<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="UTF-8"/>
<title>${titulo}</title>
<style>
  * { margin:0; padding:0; box-sizing:border-box; }
  body { font-family: Arial, sans-serif; font-size: 11px; color: #111; padding: 20px 28px; }
  .header { display:flex; align-items:flex-start; gap:18px; margin-bottom:8px; }
  .header-info { flex:1; }
  .header-info .empresa { font-size:15px; font-weight:bold; color:#1e3a5f; margin-bottom:2px; }
  .header-info .linha { font-size:11px; color:#333; }
  hr.topo { border:none; border-top:2px solid #1e3a5f; margin:8px 0 6px; }
  hr.meio { border:none; border-top:1px solid #ccc; margin:6px 0; }
  .meta { margin-bottom:6px; }
  .meta .titulo-relatorio { font-size:13px; font-weight:bold; color:#1e3a5f; }
  .meta .subtitulo { font-size:11px; color:#555; margin-top:2px; }
  table { width:100%; border-collapse:collapse; margin-top:8px; font-size:10px; }
  thead tr th { background:#1e3a5f; color:white; padding:5px 4px; text-align:right; font-weight:600; }
  thead tr th:first-child, thead tr th:nth-child(2) { text-align:left; }
  tbody tr:nth-child(even) { background:#f4f7fc; }
  tbody tr td { padding:4px 4px; text-align:right; border-bottom:1px solid #e5e7eb; }
  tbody tr td:first-child, tbody tr td:nth-child(2) { text-align:left; }
  tfoot tr td { padding:5px 4px; font-weight:bold; text-align:right; background:#e8f0fe; border-top:2px solid #1e3a5f; }
  tfoot tr td:first-child, tfoot tr td:nth-child(2) { text-align:left; }
  .assinatura { margin-top:28px; }
  .assinatura .linha-ass { border-top:1px solid #555; width:260px; margin-top:28px; padding-top:4px; font-size:10px; color:#555; }
  @media print {
    body { padding:10px 14px; }
    .no-print { display:none; }
  }
</style>
</head>
<body>
<div class="header">
  ${logoHtml}
  <div class="header-info">
    <div class="empresa">${config.empresa_nome ?? ''}</div>
    ${config.empresa_razao_social ? `<div class="linha">${config.empresa_razao_social}</div>` : ''}
    ${config.empresa_cnpj ? `<div class="linha">CNPJ: ${config.empresa_cnpj}</div>` : ''}
    ${config.empresa_endereco ? `<div class="linha">${config.empresa_endereco}${config.empresa_cidade ? ' — ' + config.empresa_cidade : ''}${config.empresa_cep ? ' — CEP ' + config.empresa_cep : ''}</div>` : ''}
    ${config.empresa_telefone ? `<div class="linha">Telefone: ${config.empresa_telefone}</div>` : ''}
  </div>
</div>
<hr class="topo"/>
<div class="meta">
  <div class="titulo-relatorio">RELATÓRIO: ${titulo}</div>
  <div class="subtitulo">Período: ${periodo} &nbsp;|&nbsp; Gerado em: ${agora}</div>
</div>
<hr class="meio"/>
${conteudoHtml}
<hr class="meio" style="margin-top:16px;"/>
<div class="assinatura">
  <div class="linha-ass">Assinatura: _________________________</div>
</div>
<script>window.onload = function(){ window.print(); }</script>
</body>
</html>`

  const win = window.open('', '_blank', 'width=1000,height=700')
  if (win) {
    win.document.write(html)
    win.document.close()
  } else {
    toast.error('Pop-up bloqueado. Permita pop-ups para este site.')
  }
}

// ─── ABA 1: Por Obra e Função ─────────────────────────────────────────────────

interface Aba1Props {
  obras: ObraOption[]
  config: ConfigMap
}

function Aba1ObraFuncao({ obras, config }: Aba1Props) {
  const now = new Date()
  const mesAtual = String(now.getMonth() + 1).padStart(2, '0')
  const anoAtual = String(now.getFullYear())

  const [periodo, setPeriodo] = useState<PeriodoFiltros>({
    mesInicio: mesAtual,
    anoInicio: anoAtual,
    mesFim: mesAtual,
    anoFim: anoAtual,
  })
  const [obraFiltro, setObraFiltro] = useState<string>('todos')
  const [tipoContrato, setTipoContrato] = useState<string>('todos')
  const [rows, setRows] = useState<ObraFuncaoRow[]>([])
  const [loading, setLoading] = useState(false)

  const periodoInicio = `${periodo.anoInicio}-${periodo.mesInicio}`
  const periodoFim = `${periodo.anoFim}-${periodo.mesFim}`

  const buscar = useCallback(async () => {
    setLoading(true)
    try {
      let q = supabase
        .from('ponto_lancamentos')
        .select(`
          obra_id,
          mes_referencia,
          snap_valor_horas,
          snap_valor_dsr,
          snap_valor_producao,
          snap_valor_premio,
          snap_inss,
          snap_ir,
          snap_desconto_vt,
          snap_desconto_adiant,
          snap_liquido,
          snap_horas_normais,
          snap_horas_extras,
          colaboradores!inner(id, tipo_contrato, funcao_id, funcoes!inner(id, nome)),
          obras!inner(id, nome)
        `)
        .in('status', ['liberado', 'pago'])
        .gte('mes_referencia', periodoInicio)
        .lte('mes_referencia', periodoFim)

      if (obraFiltro !== 'todos') q = q.eq('obra_id', obraFiltro)
      if (tipoContrato !== 'todos') q = q.eq('colaboradores.tipo_contrato', tipoContrato)

      const { data, error } = await q
      if (error) throw error

      // Agrupar por obra + função
      const map = new Map<string, ObraFuncaoRow>()
      const colabMap = new Map<string, Set<string>>() // key -> set of colabIds

      for (const r of (data ?? []) as any[]) {
        const obraId: string = r.obra_id
        const obraNome: string = r.obras?.nome ?? '—'
        const funcaoId: string = r.colaboradores?.funcao_id ?? ''
        const funcaoNome: string = r.colaboradores?.funcoes?.nome ?? '—'
        const colabId: string = r.colaboradores?.id ?? r.colaborador_id

        if (tipoContrato !== 'todos' && r.colaboradores?.tipo_contrato !== tipoContrato) continue

        const key = `${obraId}__${funcaoId}`
        if (!map.has(key)) {
          map.set(key, {
            obraId, obraNome, funcaoId, funcaoNome,
            qtdColab: 0, hNormais: 0, hExtras: 0, valorHoras: 0, dsr: 0,
            producao: 0, premio: 0, bruto: 0, inss: 0, ir: 0,
            descontoVt: 0, descontoAd: 0, liquido: 0,
          })
          colabMap.set(key, new Set())
        }
        const row = map.get(key)!
        const cs = colabMap.get(key)!
        if (colabId) cs.add(colabId)

        row.hNormais += Number(r.snap_horas_normais ?? 0)
        row.hExtras += Number(r.snap_horas_extras ?? 0)
        row.valorHoras += Number(r.snap_valor_horas ?? 0)
        row.dsr += Number(r.snap_valor_dsr ?? 0)
        row.producao += Number(r.snap_valor_producao ?? 0)
        row.premio += Number(r.snap_valor_premio ?? 0)
        row.inss += Number(r.snap_inss ?? 0)
        row.ir += Number(r.snap_ir ?? 0)
        row.descontoVt += Number(r.snap_desconto_vt ?? 0)
        row.descontoAd += Number(r.snap_desconto_adiant ?? 0)
        row.liquido += Number(r.snap_liquido ?? 0)
      }

      // Calcular bruto e qtdColab
      map.forEach((row, key) => {
        row.bruto = row.valorHoras + row.dsr + row.producao + row.premio
        row.qtdColab = colabMap.get(key)?.size ?? 0
      })

      // Ordenar por obra > função
      const sorted = Array.from(map.values()).sort((a, b) => {
        const oc = a.obraNome.localeCompare(b.obraNome, 'pt-BR')
        if (oc !== 0) return oc
        return a.funcaoNome.localeCompare(b.funcaoNome, 'pt-BR')
      })

      setRows(sorted)
    } catch (e: any) {
      toast.error('Erro ao buscar dados: ' + (e?.message ?? e))
    } finally {
      setLoading(false)
    }
  }, [periodoInicio, periodoFim, obraFiltro, tipoContrato])

  // Totais
  const totais = rows.reduce(
    (acc, r) => ({
      qtdColab: acc.qtdColab + r.qtdColab,
      hNormais: acc.hNormais + r.hNormais,
      hExtras: acc.hExtras + r.hExtras,
      valorHoras: acc.valorHoras + r.valorHoras,
      dsr: acc.dsr + r.dsr,
      producao: acc.producao + r.producao,
      premio: acc.premio + r.premio,
      bruto: acc.bruto + r.bruto,
      inss: acc.inss + r.inss,
      ir: acc.ir + r.ir,
      descontoVt: acc.descontoVt + r.descontoVt,
      descontoAd: acc.descontoAd + r.descontoAd,
      liquido: acc.liquido + r.liquido,
    }),
    {
      qtdColab: 0, hNormais: 0, hExtras: 0, valorHoras: 0, dsr: 0,
      producao: 0, premio: 0, bruto: 0, inss: 0, ir: 0,
      descontoVt: 0, descontoAd: 0, liquido: 0,
    },
  )

  // Agrupa obras distintas para span
  const obrasDistintas = [...new Set(rows.map(r => r.obraId))]

  function imprimir() {
    const cabecalho = `<thead><tr>
      <th>Obra</th><th>Função</th><th>Qtd</th><th>H.Norm</th><th>H.Ext</th>
      <th>Vl.Horas</th><th>DSR</th><th>Produção</th><th>Prêmio</th>
      <th>Bruto</th><th>INSS</th><th>IR</th><th>-VT</th><th>-Adian</th><th>Líquido</th>
    </tr></thead>`

    const corpo = rows.map(r => `<tr>
      <td>${r.obraNome}</td><td>${r.funcaoNome}</td><td style="text-align:center">${r.qtdColab}</td>
      <td>${formatNum(r.hNormais)}</td><td>${formatNum(r.hExtras)}</td>
      <td>${formatCurrency(r.valorHoras)}</td><td>${formatCurrency(r.dsr)}</td>
      <td>${formatCurrency(r.producao)}</td><td>${formatCurrency(r.premio)}</td>
      <td>${formatCurrency(r.bruto)}</td>
      <td style="color:#b91c1c">${formatCurrency(r.inss)}</td>
      <td style="color:#b91c1c">${formatCurrency(r.ir)}</td>
      <td style="color:#b91c1c">${formatCurrency(r.descontoVt)}</td>
      <td style="color:#b91c1c">${formatCurrency(r.descontoAd)}</td>
      <td style="color:#15803d;font-weight:600">${formatCurrency(r.liquido)}</td>
    </tr>`).join('')

    const rodape = `<tfoot><tr>
      <td colspan="2">TOTAL GERAL</td>
      <td style="text-align:center">${totais.qtdColab}</td>
      <td>${formatNum(totais.hNormais)}</td><td>${formatNum(totais.hExtras)}</td>
      <td>${formatCurrency(totais.valorHoras)}</td><td>${formatCurrency(totais.dsr)}</td>
      <td>${formatCurrency(totais.producao)}</td><td>${formatCurrency(totais.premio)}</td>
      <td>${formatCurrency(totais.bruto)}</td>
      <td>${formatCurrency(totais.inss)}</td><td>${formatCurrency(totais.ir)}</td>
      <td>${formatCurrency(totais.descontoVt)}</td><td>${formatCurrency(totais.descontoAd)}</td>
      <td>${formatCurrency(totais.liquido)}</td>
    </tr></tfoot>`

    abrirJanelaImpressao(
      'Folha por Obra e Função',
      `${periodoInicio} a ${periodoFim}`,
      `<table>${cabecalho}<tbody>${corpo}</tbody>${rodape}</table>`,
      config,
    )
  }

  return (
    <div className="space-y-4">
      {/* Filtros */}
      <Card>
        <CardContent className="pt-5 pb-4">
          <div className="flex flex-wrap gap-4 items-end">
            <PeriodoSelector value={periodo} onChange={setPeriodo} />
            <div className="flex flex-col gap-1">
              <Label className="text-xs">Obra</Label>
              <Select value={obraFiltro} onValueChange={setObraFiltro}>
                <SelectTrigger className="w-48">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="todos">Todas as obras</SelectItem>
                  {obras.map(o => (
                    <SelectItem key={o.id} value={o.id}>{o.nome}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex flex-col gap-1">
              <Label className="text-xs">Tipo Contrato</Label>
              <Select value={tipoContrato} onValueChange={setTipoContrato}>
                <SelectTrigger className="w-40">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="todos">Todos</SelectItem>
                  <SelectItem value="CLT">CLT</SelectItem>
                  <SelectItem value="Autonomo">Autônomo</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <Button onClick={buscar} disabled={loading} className="bg-blue-900 hover:bg-blue-800">
              {loading ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : <RefreshCw className="w-4 h-4 mr-1" />}
              Gerar
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Cards de resumo */}
      {rows.length > 0 && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <Card className="border-l-4 border-l-blue-700">
            <CardContent className="pt-4 pb-3">
              <p className="text-xs text-muted-foreground uppercase tracking-wide">Colaboradores</p>
              <p className="text-2xl font-bold text-blue-900">{obrasDistintas.length > 1 ? `${rows.reduce((s, r) => s + r.qtdColab, 0)}` : totais.qtdColab}</p>
              <p className="text-xs text-muted-foreground mt-0.5">{obrasDistintas.length} obra(s)</p>
            </CardContent>
          </Card>
          <Card className="border-l-4 border-l-indigo-500">
            <CardContent className="pt-4 pb-3">
              <p className="text-xs text-muted-foreground uppercase tracking-wide">Total Bruto</p>
              <p className="text-xl font-bold text-indigo-800">{formatCurrency(totais.bruto)}</p>
            </CardContent>
          </Card>
          <Card className="border-l-4 border-l-red-500">
            <CardContent className="pt-4 pb-3">
              <p className="text-xs text-muted-foreground uppercase tracking-wide">Total Descontos</p>
              <p className="text-xl font-bold text-red-700">{formatCurrency(totais.inss + totais.ir + totais.descontoVt + totais.descontoAd)}</p>
            </CardContent>
          </Card>
          <Card className="border-l-4 border-l-emerald-500">
            <CardContent className="pt-4 pb-3">
              <p className="text-xs text-muted-foreground uppercase tracking-wide">Total Líquido</p>
              <p className="text-xl font-bold text-emerald-700">{formatCurrency(totais.liquido)}</p>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Tabela */}
      {rows.length > 0 && (
        <Card>
          <CardHeader className="pb-2 flex flex-row items-center justify-between">
            <CardTitle className="text-base text-blue-900">Resultado por Obra › Função</CardTitle>
            <Button variant="outline" size="sm" onClick={imprimir} className="gap-1">
              <Printer className="w-4 h-4" />
              Imprimir / PDF
            </Button>
          </CardHeader>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="bg-blue-900 hover:bg-blue-900">
                    <TableHead className="text-white font-semibold text-xs">Obra</TableHead>
                    <TableHead className="text-white font-semibold text-xs">Função</TableHead>
                    <TableHead className="text-white font-semibold text-xs text-center">Qtd</TableHead>
                    <TableHead className="text-white font-semibold text-xs text-right">H.Norm</TableHead>
                    <TableHead className="text-white font-semibold text-xs text-right">H.Ext</TableHead>
                    <TableHead className="text-white font-semibold text-xs text-right">Vl.Horas</TableHead>
                    <TableHead className="text-white font-semibold text-xs text-right">DSR</TableHead>
                    <TableHead className="text-white font-semibold text-xs text-right">Produção</TableHead>
                    <TableHead className="text-white font-semibold text-xs text-right">Prêmio</TableHead>
                    <TableHead className="text-white font-semibold text-xs text-right">Bruto</TableHead>
                    <TableHead className="text-white font-semibold text-xs text-right">INSS</TableHead>
                    <TableHead className="text-white font-semibold text-xs text-right">IR</TableHead>
                    <TableHead className="text-white font-semibold text-xs text-right">-VT</TableHead>
                    <TableHead className="text-white font-semibold text-xs text-right">-Adian.</TableHead>
                    <TableHead className="text-white font-semibold text-xs text-right">Líquido</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map((r, i) => (
                    <TableRow key={`${r.obraId}-${r.funcaoId}`} className={i % 2 === 0 ? 'bg-white' : 'bg-slate-50'}>
                      <TableCell className="text-xs font-medium text-blue-900">{r.obraNome}</TableCell>
                      <TableCell className="text-xs">{r.funcaoNome}</TableCell>
                      <TableCell className="text-xs text-center">{r.qtdColab}</TableCell>
                      <TableCell className="text-xs text-right">{formatNum(r.hNormais)}</TableCell>
                      <TableCell className="text-xs text-right">{formatNum(r.hExtras)}</TableCell>
                      <TableCell className="text-xs text-right text-green-700">{formatCurrency(r.valorHoras)}</TableCell>
                      <TableCell className="text-xs text-right text-green-700">{formatCurrency(r.dsr)}</TableCell>
                      <TableCell className="text-xs text-right text-green-700">{formatCurrency(r.producao)}</TableCell>
                      <TableCell className="text-xs text-right text-green-700">{formatCurrency(r.premio)}</TableCell>
                      <TableCell className="text-xs text-right font-semibold">{formatCurrency(r.bruto)}</TableCell>
                      <TableCell className="text-xs text-right text-red-600">{formatCurrency(r.inss)}</TableCell>
                      <TableCell className="text-xs text-right text-red-600">{formatCurrency(r.ir)}</TableCell>
                      <TableCell className="text-xs text-right text-red-600">{formatCurrency(r.descontoVt)}</TableCell>
                      <TableCell className="text-xs text-right text-red-600">{formatCurrency(r.descontoAd)}</TableCell>
                      <TableCell className="text-xs text-right font-bold text-emerald-700">{formatCurrency(r.liquido)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
                <tfoot>
                  <tr className="bg-blue-50 font-bold border-t-2 border-blue-900">
                    <td className="px-4 py-2 text-xs font-bold text-blue-900" colSpan={2}>TOTAL GERAL</td>
                    <td className="px-4 py-2 text-xs text-center">{totais.qtdColab}</td>
                    <td className="px-4 py-2 text-xs text-right">{formatNum(totais.hNormais)}</td>
                    <td className="px-4 py-2 text-xs text-right">{formatNum(totais.hExtras)}</td>
                    <td className="px-4 py-2 text-xs text-right text-green-700">{formatCurrency(totais.valorHoras)}</td>
                    <td className="px-4 py-2 text-xs text-right text-green-700">{formatCurrency(totais.dsr)}</td>
                    <td className="px-4 py-2 text-xs text-right text-green-700">{formatCurrency(totais.producao)}</td>
                    <td className="px-4 py-2 text-xs text-right text-green-700">{formatCurrency(totais.premio)}</td>
                    <td className="px-4 py-2 text-xs text-right font-bold">{formatCurrency(totais.bruto)}</td>
                    <td className="px-4 py-2 text-xs text-right text-red-600">{formatCurrency(totais.inss)}</td>
                    <td className="px-4 py-2 text-xs text-right text-red-600">{formatCurrency(totais.ir)}</td>
                    <td className="px-4 py-2 text-xs text-right text-red-600">{formatCurrency(totais.descontoVt)}</td>
                    <td className="px-4 py-2 text-xs text-right text-red-600">{formatCurrency(totais.descontoAd)}</td>
                    <td className="px-4 py-2 text-xs text-right font-bold text-emerald-700">{formatCurrency(totais.liquido)}</td>
                  </tr>
                </tfoot>
              </Table>
            </div>
          </CardContent>
        </Card>
      )}

      {!loading && rows.length === 0 && (
        <div className="text-center py-16 text-muted-foreground text-sm">
          <Building2 className="w-10 h-10 mx-auto mb-3 opacity-30" />
          Clique em <strong>Gerar</strong> para carregar os dados.
        </div>
      )}
    </div>
  )
}

// ─── ABA 2: Encargos Empresa ─────────────────────────────────────────────────

interface Aba2Props {
  obras: ObraOption[]
  config: ConfigMap
}

function Aba2Encargos({ obras, config }: Aba2Props) {
  const now = new Date()
  const mesAtual = String(now.getMonth() + 1).padStart(2, '0')
  const anoAtual = String(now.getFullYear())

  const [periodo, setPeriodo] = useState<PeriodoFiltros>({
    mesInicio: mesAtual,
    anoInicio: anoAtual,
    mesFim: mesAtual,
    anoFim: anoAtual,
  })
  const [obraFiltro, setObraFiltro] = useState<string>('todos')
  const [rows, setRows] = useState<EncargosRow[]>([])
  const [loading, setLoading] = useState(false)

  const periodoInicio = `${periodo.anoInicio}-${periodo.mesInicio}`
  const periodoFim = `${periodo.anoFim}-${periodo.mesFim}`

  const buscar = useCallback(async () => {
    setLoading(true)
    try {
      let q = supabase
        .from('ponto_lancamentos')
        .select(`
          obra_id,
          mes_referencia,
          snap_valor_horas,
          snap_valor_dsr,
          colaboradores!inner(tipo_contrato),
          obras!inner(id, nome)
        `)
        .in('status', ['liberado', 'pago'])
        .eq('colaboradores.tipo_contrato', 'CLT')
        .gte('mes_referencia', periodoInicio)
        .lte('mes_referencia', periodoFim)

      if (obraFiltro !== 'todos') q = q.eq('obra_id', obraFiltro)

      const { data, error } = await q
      if (error) throw error

      const map = new Map<string, EncargosRow>()

      for (const r of (data ?? []) as any[]) {
        if (r.colaboradores?.tipo_contrato !== 'CLT') continue
        const obraId: string = r.obra_id
        const obraNome: string = r.obras?.nome ?? '—'
        const mes: string = r.mes_referencia

        const key = `${obraId}__${mes}`
        if (!map.has(key)) {
          map.set(key, {
            obraId, obraNome, mes,
            baseSalarial: 0, fgts: 0, inssEmpresa: 0, seguro: 0, sesiSenai: 0, totalEncargos: 0,
          })
        }
        const row = map.get(key)!
        row.baseSalarial += Number(r.snap_valor_horas ?? 0) + Number(r.snap_valor_dsr ?? 0)
      }

      // Calcular encargos
      map.forEach(row => {
        row.fgts = row.baseSalarial * 0.08
        row.inssEmpresa = row.baseSalarial * 0.20
        row.seguro = row.baseSalarial * 0.03
        row.sesiSenai = row.baseSalarial * 0.025
        row.totalEncargos = row.baseSalarial * 0.335
      })

      const sorted = Array.from(map.values()).sort((a, b) => {
        const oc = a.obraNome.localeCompare(b.obraNome, 'pt-BR')
        if (oc !== 0) return oc
        return a.mes.localeCompare(b.mes)
      })
      setRows(sorted)
    } catch (e: any) {
      toast.error('Erro ao buscar dados: ' + (e?.message ?? e))
    } finally {
      setLoading(false)
    }
  }, [periodoInicio, periodoFim, obraFiltro])

  const totais = rows.reduce(
    (acc, r) => ({
      baseSalarial: acc.baseSalarial + r.baseSalarial,
      fgts: acc.fgts + r.fgts,
      inssEmpresa: acc.inssEmpresa + r.inssEmpresa,
      seguro: acc.seguro + r.seguro,
      sesiSenai: acc.sesiSenai + r.sesiSenai,
      totalEncargos: acc.totalEncargos + r.totalEncargos,
    }),
    { baseSalarial: 0, fgts: 0, inssEmpresa: 0, seguro: 0, sesiSenai: 0, totalEncargos: 0 },
  )

  function imprimir() {
    const cab = `<thead><tr>
      <th>Obra</th><th>Mês</th><th>Base Salarial</th>
      <th>FGTS 8%</th><th>INSS Emp. 20%</th><th>Seg.Acid. 3%</th>
      <th>SESI/SENAI 2.5%</th><th>Total Encargos</th>
    </tr></thead>`
    const corpo = rows.map(r => `<tr>
      <td>${r.obraNome}</td><td>${mesLabel(r.mes)}</td>
      <td>${formatCurrency(r.baseSalarial)}</td>
      <td>${formatCurrency(r.fgts)}</td>
      <td>${formatCurrency(r.inssEmpresa)}</td>
      <td>${formatCurrency(r.seguro)}</td>
      <td>${formatCurrency(r.sesiSenai)}</td>
      <td style="font-weight:bold;color:#1e3a5f">${formatCurrency(r.totalEncargos)}</td>
    </tr>`).join('')
    const rodape = `<tfoot><tr>
      <td colspan="2">TOTAL GERAL</td>
      <td>${formatCurrency(totais.baseSalarial)}</td>
      <td>${formatCurrency(totais.fgts)}</td>
      <td>${formatCurrency(totais.inssEmpresa)}</td>
      <td>${formatCurrency(totais.seguro)}</td>
      <td>${formatCurrency(totais.sesiSenai)}</td>
      <td>${formatCurrency(totais.totalEncargos)}</td>
    </tr></tfoot>`
    abrirJanelaImpressao(
      'Encargos Empresa (CLT)',
      `${periodoInicio} a ${periodoFim}`,
      `<table>${cab}<tbody>${corpo}</tbody>${rodape}</table>`,
      config,
    )
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardContent className="pt-5 pb-4">
          <div className="flex flex-wrap gap-4 items-end">
            <PeriodoSelector value={periodo} onChange={setPeriodo} />
            <div className="flex flex-col gap-1">
              <Label className="text-xs">Obra</Label>
              <Select value={obraFiltro} onValueChange={setObraFiltro}>
                <SelectTrigger className="w-48">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="todos">Todas as obras</SelectItem>
                  {obras.map(o => (
                    <SelectItem key={o.id} value={o.id}>{o.nome}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <Button onClick={buscar} disabled={loading} className="bg-blue-900 hover:bg-blue-800">
              {loading ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : <RefreshCw className="w-4 h-4 mr-1" />}
              Gerar
            </Button>
          </div>
        </CardContent>
      </Card>

      {rows.length > 0 && (
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
          <Card className="border-l-4 border-l-blue-700">
            <CardContent className="pt-4 pb-3">
              <p className="text-xs text-muted-foreground uppercase tracking-wide">Base Salarial CLT</p>
              <p className="text-xl font-bold text-blue-900">{formatCurrency(totais.baseSalarial)}</p>
            </CardContent>
          </Card>
          <Card className="border-l-4 border-l-amber-500">
            <CardContent className="pt-4 pb-3">
              <p className="text-xs text-muted-foreground uppercase tracking-wide">Total Encargos (33.5%)</p>
              <p className="text-xl font-bold text-amber-700">{formatCurrency(totais.totalEncargos)}</p>
            </CardContent>
          </Card>
          <Card className="border-l-4 border-l-orange-500">
            <CardContent className="pt-4 pb-3">
              <p className="text-xs text-muted-foreground uppercase tracking-wide">Custo Total (Base+Enc.)</p>
              <p className="text-xl font-bold text-orange-700">{formatCurrency(totais.baseSalarial + totais.totalEncargos)}</p>
            </CardContent>
          </Card>
        </div>
      )}

      {rows.length > 0 && (
        <Card>
          <CardHeader className="pb-2 flex flex-row items-center justify-between">
            <CardTitle className="text-base text-blue-900">Encargos por Obra › Mês</CardTitle>
            <Button variant="outline" size="sm" onClick={imprimir} className="gap-1">
              <Printer className="w-4 h-4" />
              Imprimir / PDF
            </Button>
          </CardHeader>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="bg-blue-900 hover:bg-blue-900">
                    <TableHead className="text-white font-semibold text-xs">Obra</TableHead>
                    <TableHead className="text-white font-semibold text-xs">Mês</TableHead>
                    <TableHead className="text-white font-semibold text-xs text-right">Base Salarial</TableHead>
                    <TableHead className="text-white font-semibold text-xs text-right">FGTS 8%</TableHead>
                    <TableHead className="text-white font-semibold text-xs text-right">INSS Emp. 20%</TableHead>
                    <TableHead className="text-white font-semibold text-xs text-right">Seg.Acid. 3%</TableHead>
                    <TableHead className="text-white font-semibold text-xs text-right">SESI/SENAI 2.5%</TableHead>
                    <TableHead className="text-white font-semibold text-xs text-right">Total Encargos</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map((r, i) => (
                    <TableRow key={`${r.obraId}-${r.mes}`} className={i % 2 === 0 ? 'bg-white' : 'bg-slate-50'}>
                      <TableCell className="text-xs font-medium text-blue-900">{r.obraNome}</TableCell>
                      <TableCell className="text-xs">{mesLabel(r.mes)}</TableCell>
                      <TableCell className="text-xs text-right">{formatCurrency(r.baseSalarial)}</TableCell>
                      <TableCell className="text-xs text-right text-amber-700">{formatCurrency(r.fgts)}</TableCell>
                      <TableCell className="text-xs text-right text-amber-700">{formatCurrency(r.inssEmpresa)}</TableCell>
                      <TableCell className="text-xs text-right text-amber-700">{formatCurrency(r.seguro)}</TableCell>
                      <TableCell className="text-xs text-right text-amber-700">{formatCurrency(r.sesiSenai)}</TableCell>
                      <TableCell className="text-xs text-right font-bold text-orange-700">{formatCurrency(r.totalEncargos)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
                <tfoot>
                  <tr className="bg-blue-50 font-bold border-t-2 border-blue-900">
                    <td className="px-4 py-2 text-xs font-bold text-blue-900" colSpan={2}>TOTAL GERAL</td>
                    <td className="px-4 py-2 text-xs text-right">{formatCurrency(totais.baseSalarial)}</td>
                    <td className="px-4 py-2 text-xs text-right text-amber-700">{formatCurrency(totais.fgts)}</td>
                    <td className="px-4 py-2 text-xs text-right text-amber-700">{formatCurrency(totais.inssEmpresa)}</td>
                    <td className="px-4 py-2 text-xs text-right text-amber-700">{formatCurrency(totais.seguro)}</td>
                    <td className="px-4 py-2 text-xs text-right text-amber-700">{formatCurrency(totais.sesiSenai)}</td>
                    <td className="px-4 py-2 text-xs text-right font-bold text-orange-700">{formatCurrency(totais.totalEncargos)}</td>
                  </tr>
                </tfoot>
              </Table>
            </div>
          </CardContent>
        </Card>
      )}

      {!loading && rows.length === 0 && (
        <div className="text-center py-16 text-muted-foreground text-sm">
          <Calculator className="w-10 h-10 mx-auto mb-3 opacity-30" />
          Clique em <strong>Gerar</strong> para carregar os dados.
        </div>
      )}
    </div>
  )
}

// ─── ABA 3: Total Provisionado ────────────────────────────────────────────────

interface Aba3Props {
  obras: ObraOption[]
  config: ConfigMap
}

function Aba3Provisao({ obras, config }: Aba3Props) {
  const now = new Date()
  const mesAtual = String(now.getMonth() + 1).padStart(2, '0')
  const anoAtual = String(now.getFullYear())

  const [periodo, setPeriodo] = useState<PeriodoFiltros>({
    mesInicio: mesAtual,
    anoInicio: anoAtual,
    mesFim: mesAtual,
    anoFim: anoAtual,
  })
  const [obraFiltro, setObraFiltro] = useState<string>('todos')
  const [rows, setRows] = useState<ProvisaoRow[]>([])
  const [loading, setLoading] = useState(false)

  const periodoInicio = `${periodo.anoInicio}-${periodo.mesInicio}`
  const periodoFim = `${periodo.anoFim}-${periodo.mesFim}`

  const buscar = useCallback(async () => {
    setLoading(true)
    try {
      let q = supabase
        .from('ponto_lancamentos')
        .select(`
          obra_id,
          mes_referencia,
          snap_valor_horas,
          snap_valor_dsr,
          colaboradores!inner(tipo_contrato, funcao_id, funcoes!inner(id, nome))
        `)
        .in('status', ['liberado', 'pago'])
        .eq('colaboradores.tipo_contrato', 'CLT')
        .gte('mes_referencia', periodoInicio)
        .lte('mes_referencia', periodoFim)

      if (obraFiltro !== 'todos') q = q.eq('obra_id', obraFiltro)

      const { data, error } = await q
      if (error) throw error

      const map = new Map<string, ProvisaoRow>()

      for (const r of (data ?? []) as any[]) {
        if (r.colaboradores?.tipo_contrato !== 'CLT') continue
        const funcaoId: string = r.colaboradores?.funcao_id ?? ''
        const funcaoNome: string = r.colaboradores?.funcoes?.nome ?? '—'
        const mes: string = r.mes_referencia

        const key = `${funcaoId}__${mes}`
        if (!map.has(key)) {
          map.set(key, {
            funcaoId, funcaoNome, mes,
            base: 0, fgts: 0, ferias: 0, decimoTerceiro: 0, totalProvisao: 0,
          })
        }
        const row = map.get(key)!
        row.base += Number(r.snap_valor_horas ?? 0) + Number(r.snap_valor_dsr ?? 0)
      }

      // Calcular provisões
      map.forEach(row => {
        row.fgts = row.base * 0.08
        row.ferias = row.base * 0.1111
        row.decimoTerceiro = row.base * 0.0833
        row.totalProvisao = row.base * (0.08 + 0.1111 + 0.0833)
      })

      const sorted = Array.from(map.values()).sort((a, b) => {
        const fc = a.funcaoNome.localeCompare(b.funcaoNome, 'pt-BR')
        if (fc !== 0) return fc
        return a.mes.localeCompare(b.mes)
      })
      setRows(sorted)
    } catch (e: any) {
      toast.error('Erro ao buscar dados: ' + (e?.message ?? e))
    } finally {
      setLoading(false)
    }
  }, [periodoInicio, periodoFim, obraFiltro])

  const totais = rows.reduce(
    (acc, r) => ({
      base: acc.base + r.base,
      fgts: acc.fgts + r.fgts,
      ferias: acc.ferias + r.ferias,
      decimoTerceiro: acc.decimoTerceiro + r.decimoTerceiro,
      totalProvisao: acc.totalProvisao + r.totalProvisao,
    }),
    { base: 0, fgts: 0, ferias: 0, decimoTerceiro: 0, totalProvisao: 0 },
  )

  function imprimir() {
    const cab = `<thead><tr>
      <th>Função</th><th>Mês</th><th>Base</th>
      <th>FGTS 8%</th><th>Férias 11.11%</th><th>13º 8.33%</th><th>Total Provisão</th>
    </tr></thead>`
    const corpo = rows.map(r => `<tr>
      <td>${r.funcaoNome}</td><td>${mesLabel(r.mes)}</td>
      <td>${formatCurrency(r.base)}</td>
      <td>${formatCurrency(r.fgts)}</td>
      <td>${formatCurrency(r.ferias)}</td>
      <td>${formatCurrency(r.decimoTerceiro)}</td>
      <td style="font-weight:bold;color:#15803d">${formatCurrency(r.totalProvisao)}</td>
    </tr>`).join('')
    const rodape = `<tfoot><tr>
      <td colspan="2">TOTAL GERAL</td>
      <td>${formatCurrency(totais.base)}</td>
      <td>${formatCurrency(totais.fgts)}</td>
      <td>${formatCurrency(totais.ferias)}</td>
      <td>${formatCurrency(totais.decimoTerceiro)}</td>
      <td>${formatCurrency(totais.totalProvisao)}</td>
    </tr></tfoot>`
    abrirJanelaImpressao(
      'Total Provisionado (CLT)',
      `${periodoInicio} a ${periodoFim}`,
      `<table>${cab}<tbody>${corpo}</tbody>${rodape}</table>`,
      config,
    )
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardContent className="pt-5 pb-4">
          <div className="flex flex-wrap gap-4 items-end">
            <PeriodoSelector value={periodo} onChange={setPeriodo} />
            <div className="flex flex-col gap-1">
              <Label className="text-xs">Obra</Label>
              <Select value={obraFiltro} onValueChange={setObraFiltro}>
                <SelectTrigger className="w-48">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="todos">Todas as obras</SelectItem>
                  {obras.map(o => (
                    <SelectItem key={o.id} value={o.id}>{o.nome}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <Button onClick={buscar} disabled={loading} className="bg-blue-900 hover:bg-blue-800">
              {loading ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : <RefreshCw className="w-4 h-4 mr-1" />}
              Gerar
            </Button>
          </div>
        </CardContent>
      </Card>

      {rows.length > 0 && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <Card className="border-l-4 border-l-blue-700">
            <CardContent className="pt-4 pb-3">
              <p className="text-xs text-muted-foreground uppercase tracking-wide">Base CLT</p>
              <p className="text-xl font-bold text-blue-900">{formatCurrency(totais.base)}</p>
            </CardContent>
          </Card>
          <Card className="border-l-4 border-l-yellow-500">
            <CardContent className="pt-4 pb-3">
              <p className="text-xs text-muted-foreground uppercase tracking-wide">FGTS 8%</p>
              <p className="text-xl font-bold text-yellow-700">{formatCurrency(totais.fgts)}</p>
            </CardContent>
          </Card>
          <Card className="border-l-4 border-l-purple-500">
            <CardContent className="pt-4 pb-3">
              <p className="text-xs text-muted-foreground uppercase tracking-wide">Férias + 13º</p>
              <p className="text-xl font-bold text-purple-700">{formatCurrency(totais.ferias + totais.decimoTerceiro)}</p>
            </CardContent>
          </Card>
          <Card className="border-l-4 border-l-emerald-500">
            <CardContent className="pt-4 pb-3">
              <p className="text-xs text-muted-foreground uppercase tracking-wide">Total Provisão</p>
              <p className="text-xl font-bold text-emerald-700">{formatCurrency(totais.totalProvisao)}</p>
            </CardContent>
          </Card>
        </div>
      )}

      {rows.length > 0 && (
        <Card>
          <CardHeader className="pb-2 flex flex-row items-center justify-between">
            <CardTitle className="text-base text-blue-900">Provisão por Função › Mês</CardTitle>
            <Button variant="outline" size="sm" onClick={imprimir} className="gap-1">
              <Printer className="w-4 h-4" />
              Imprimir / PDF
            </Button>
          </CardHeader>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="bg-blue-900 hover:bg-blue-900">
                    <TableHead className="text-white font-semibold text-xs">Função</TableHead>
                    <TableHead className="text-white font-semibold text-xs">Mês</TableHead>
                    <TableHead className="text-white font-semibold text-xs text-right">Base</TableHead>
                    <TableHead className="text-white font-semibold text-xs text-right">FGTS 8%</TableHead>
                    <TableHead className="text-white font-semibold text-xs text-right">Férias 11.11%</TableHead>
                    <TableHead className="text-white font-semibold text-xs text-right">13º 8.33%</TableHead>
                    <TableHead className="text-white font-semibold text-xs text-right">Total Provisão</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map((r, i) => (
                    <TableRow key={`${r.funcaoId}-${r.mes}`} className={i % 2 === 0 ? 'bg-white' : 'bg-slate-50'}>
                      <TableCell className="text-xs font-medium text-blue-900">{r.funcaoNome}</TableCell>
                      <TableCell className="text-xs">{mesLabel(r.mes)}</TableCell>
                      <TableCell className="text-xs text-right">{formatCurrency(r.base)}</TableCell>
                      <TableCell className="text-xs text-right text-yellow-700">{formatCurrency(r.fgts)}</TableCell>
                      <TableCell className="text-xs text-right text-purple-700">{formatCurrency(r.ferias)}</TableCell>
                      <TableCell className="text-xs text-right text-purple-700">{formatCurrency(r.decimoTerceiro)}</TableCell>
                      <TableCell className="text-xs text-right font-bold text-emerald-700">{formatCurrency(r.totalProvisao)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
                <tfoot>
                  <tr className="bg-blue-50 font-bold border-t-2 border-blue-900">
                    <td className="px-4 py-2 text-xs font-bold text-blue-900" colSpan={2}>TOTAL GERAL</td>
                    <td className="px-4 py-2 text-xs text-right">{formatCurrency(totais.base)}</td>
                    <td className="px-4 py-2 text-xs text-right text-yellow-700">{formatCurrency(totais.fgts)}</td>
                    <td className="px-4 py-2 text-xs text-right text-purple-700">{formatCurrency(totais.ferias)}</td>
                    <td className="px-4 py-2 text-xs text-right text-purple-700">{formatCurrency(totais.decimoTerceiro)}</td>
                    <td className="px-4 py-2 text-xs text-right font-bold text-emerald-700">{formatCurrency(totais.totalProvisao)}</td>
                  </tr>
                </tfoot>
              </Table>
            </div>
          </CardContent>
        </Card>
      )}

      {!loading && rows.length === 0 && (
        <div className="text-center py-16 text-muted-foreground text-sm">
          <PiggyBank className="w-10 h-10 mx-auto mb-3 opacity-30" />
          Clique em <strong>Gerar</strong> para carregar os dados.
        </div>
      )}
    </div>
  )
}

// ─── Componente Principal ─────────────────────────────────────────────────────

export default function Relatorios() {
  const [obras, setObras] = useState<ObraOption[]>([])
  const [config, setConfig] = useState<ConfigMap>({})
  const [loadingInit, setLoadingInit] = useState(true)

  useEffect(() => {
    async function init() {
      try {
        const [obrasRes, configRes] = await Promise.all([
          supabase
            .from('obras')
            .select('id, nome')
            .order('nome'),
          supabase
            .from('configuracoes')
            .select('chave, valor'),
        ])

        if (obrasRes.data) {
          setObras((obrasRes.data as any[]).map(o => ({ id: o.id, nome: o.nome })))
        }
        if (configRes.data) {
          const map: ConfigMap = {}
          for (const row of configRes.data as any[]) {
            (map as any)[row.chave] = row.valor
          }
          setConfig(map)
        }
      } catch (e: any) {
        toast.error('Erro ao carregar dados base: ' + (e?.message ?? e))
      } finally {
        setLoadingInit(false)
      }
    }
    init()
  }, [])

  if (loadingInit) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-8 h-8 animate-spin text-blue-900" />
        <span className="ml-3 text-muted-foreground">Carregando...</span>
      </div>
    )
  }

  return (
    <div className="page-root">
      <PageHeader
        title="Relatórios"
        subtitle="Folha por obra/função, encargos patronais e provisões CLT"
      />

      <Tabs defaultValue="aba1" className="space-y-4">
        <TabsList className="bg-blue-950 p-1 h-auto gap-1">
          <TabsTrigger
            value="aba1"
            className="data-[state=active]:bg-white data-[state=active]:text-blue-900 text-blue-100 px-4 py-2 text-sm gap-2"
          >
            <Users className="w-4 h-4" />
            Por Obra e Função
          </TabsTrigger>
          <TabsTrigger
            value="aba2"
            className="data-[state=active]:bg-white data-[state=active]:text-blue-900 text-blue-100 px-4 py-2 text-sm gap-2"
          >
            <DollarSign className="w-4 h-4" />
            Encargos Empresa
          </TabsTrigger>
          <TabsTrigger
            value="aba3"
            className="data-[state=active]:bg-white data-[state=active]:text-blue-900 text-blue-100 px-4 py-2 text-sm gap-2"
          >
            <TrendingUp className="w-4 h-4" />
            Total Provisionado
          </TabsTrigger>
        </TabsList>

        <TabsContent value="aba1">
          <Aba1ObraFuncao obras={obras} config={config} />
        </TabsContent>

        <TabsContent value="aba2">
          <Aba2Encargos obras={obras} config={config} />
        </TabsContent>

        <TabsContent value="aba3">
          <Aba3Provisao obras={obras} config={config} />
        </TabsContent>
      </Tabs>
    </div>
  )
}
