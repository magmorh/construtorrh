import React, { useEffect, useState, useCallback, useMemo } from 'react'
import { toast } from 'sonner'
import {
  CheckCircle2, Clock, DollarSign, Users, ChevronDown, ChevronRight,
  Search, Building2, X,
} from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { formatCurrency } from '@/lib/utils'
import { calcINSS, calcIR, fetchTabelasEncargos, type FaixaINSS, type FaixaIR } from '@/lib/encargos'
import { PageHeader, EmptyState, LoadingSkeleton } from '@/components/Shared'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { traduzirErro } from '@/lib/erros'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table'

// ─── Tipos ────────────────────────────────────────────────────────────────────
interface LancItem {
  id: string
  colaborador_id: string
  colaborador_nome: string
  colaborador_chapa: string | null
  funcao_nome: string
  funcao_id: string | null
  tipo_contrato: string
  obra_id: string
  obra_nome: string
  mes_referencia: string
  data_inicio: string
  data_fim: string
  status: string
  horas_normais: number
  horas_extras: number
  valor_horas: number
  valor_producao: number
  valor_dsr: number
  valor_premio: number
  valor_total: number
  dias_trabalhados: number
  faltas: number
  desconto_vt: number
  valor_vt_dia: number
  inss: number
  ir: number
  liquido: number
}

const MESES = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho',
               'Julho','Agosto','Setembro','Outubro','Novembro','Dezembro']
const MESES_ABR = ['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez']

function fmtHHMM(horas: number): string {
  const h = Math.floor(horas); const m = Math.round((horas - h) * 60)
  return `${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}`
}

// ─── Componente ───────────────────────────────────────────────────────────────
export default function FechamentoPonto() {
  const hoje = new Date()
  const [ano, setAno] = useState(hoje.getFullYear())
  const [mes, setMes] = useState(hoje.getMonth() + 1)
  const [busca, setBusca] = useState('')

  const [lancamentos, setLancamentos] = useState<LancItem[]>([])
  const [loading, setLoading] = useState(false)
  const [expandidos, setExpandidos] = useState<Set<string>>(new Set())

  // Modal recusar
  const [modalRecusar, setModalRecusar] = useState<string | null>(null)
  const [motivoRecusa, setMotivoRecusa] = useState('')
  const [saving, setSaving] = useState(false)
  const [tabelaInss, setTabelaInss] = useState<FaixaINSS[]>([])
  const [tabelaIR, setTabelaIR]     = useState<FaixaIR[]>([])

  // Modal confirmar pagamento
  const [modalPagar, setModalPagar] = useState<string | null>(null)

  const mesRef = `${ano}-${String(mes).padStart(2, '0')}`

  // ── Fetch lançamentos aprovados ──────────────────────────────────────────
  const fetchLancamentos = useCallback(async (mr: string) => {
    setLoading(true)
    const { data: lancsRaw } = await supabase
      .from('ponto_lancamentos')
      .select(`
        id, colaborador_id, obra_id, mes_referencia, data_inicio, data_fim, status,
        colaboradores(nome, chapa, tipo_contrato, funcao_id, vale_transporte, vt_dados, funcoes(nome)),
        obras(nome)
      `)
      .in('status', ['aprovado', 'em_fechamento', 'pago'])
      .eq('mes_referencia', mr)
      .order('data_inicio')

    if (!lancsRaw) { setLoading(false); return }

    const ids = lancsRaw.map((l: any) => l.id)
    const [{ data: pontosRaw }, { data: prodRaw }, { data: feriadosRaw }] = await Promise.all([
      ids.length ? supabase.from('registro_ponto').select('lancamento_id,horas_trabalhadas,horas_extras,data,falta').in('lancamento_id', ids) : Promise.resolve({ data: [] }),
      ids.length ? supabase.from('ponto_producao').select('lancamento_id,valor_total,dias').in('lancamento_id', ids) : Promise.resolve({ data: [] }),
      supabase.from('feriados').select('data').gte('data', mr+'-01').lte('data', mr+'-31'),
    ])

    const funcaoIds = [...new Set(lancsRaw.map((l: any) => l.colaboradores?.funcao_id).filter(Boolean))]
    const { data: valorHoraRaw } = funcaoIds.length
      ? await supabase.from('funcao_valores').select('funcao_id,tipo_contrato,valor_hora').in('funcao_id', funcaoIds)
      : { data: [] as {funcao_id:string;tipo_contrato:string;valor_hora:number}[] }

    const mapaValorH: Record<string, number> = {}
    ;(valorHoraRaw ?? []).forEach((v: any) => { mapaValorH[`${v.funcao_id}_${v.tipo_contrato}`] = v.valor_hora })

    // Feriados do período
    const feriadosSet = new Set<string>((feriadosRaw ?? []).map((f: any) => f.data as string))

    // Agregar horas e faltas por lançamento
    const mapaHoras: Record<string, { norm: number; extra: number; dias: number; faltas: number; diasDatas: Set<string> }> = {}
    ;(pontosRaw ?? []).forEach((p: any) => {
      if (!mapaHoras[p.lancamento_id]) mapaHoras[p.lancamento_id] = { norm: 0, extra: 0, dias: 0, faltas: 0, diasDatas: new Set() }
      mapaHoras[p.lancamento_id].norm   += (p.horas_trabalhadas ?? 0)
      mapaHoras[p.lancamento_id].extra  += (p.horas_extras ?? 0)
      mapaHoras[p.lancamento_id].dias   += 1
      if (p.falta) mapaHoras[p.lancamento_id].faltas += 1
      if (p.data) mapaHoras[p.lancamento_id].diasDatas.add(p.data)
    })

    // Agregar produção por lançamento
    const mapaProd: Record<string, number> = {}
    const mapaProdDias: Record<string, Set<string>> = {}
    ;(prodRaw ?? []).forEach((p: any) => {
      mapaProd[p.lancamento_id] = (mapaProd[p.lancamento_id] ?? 0) + p.valor_total
      if (!mapaProdDias[p.lancamento_id]) mapaProdDias[p.lancamento_id] = new Set()
      ;(p.dias ?? []).forEach((d: string) => mapaProdDias[p.lancamento_id].add(d))
    })

    // Helpers DSR
    function expandRange(ini: string, fim: string): string[] {
      const dias: string[] = []
      const d = new Date(ini + 'T12:00:00')
      const end = new Date(fim + 'T12:00:00')
      while (d <= end) { dias.push(d.toISOString().slice(0, 10)); d.setDate(d.getDate() + 1) }
      return dias
    }
    function diasUteisPeriodo(ini: string, fim: string): number {
      return expandRange(ini, fim).filter(d => {
        const dow = new Date(d + 'T12:00:00').getDay()
        return dow >= 1 && dow <= 6 && !feriadosSet.has(d)
      }).length
    }
    function domingosFeriadosPeriodo(ini: string, fim: string): number {
      const dias = expandRange(ini, fim)
      const doms = dias.filter(d => new Date(d + 'T12:00:00').getDay() === 0).length
      const ferDiasUteis = feriadosSet.size > 0
        ? dias.filter(d => { const dow = new Date(d + 'T12:00:00').getDay(); return feriadosSet.has(d) && dow !== 0 }).length
        : 0
      return doms + ferDiasUteis
    }

    // ── Função VT (INSS e IR vêm do lib/encargos) ───────────────────────────
    function vtDia(vtDados: any): number {
      if (!vtDados) return 0
      const ida   = (vtDados.trechos_ida   ?? []).reduce((s: number, t: any) => s + (parseFloat(t.valor) || 0), 0)
      const volta = (vtDados.trechos_volta ?? []).reduce((s: number, t: any) => s + (parseFloat(t.valor) || 0), 0)
      const gasolina = vtDados.gasolina_valor_dia ?? 0
      return vtDados.modalidade === 'gasolina' ? gasolina : (ida + volta)
    }

    const lista: LancItem[] = lancsRaw.map((l: any) => {
      const colab = l.colaboradores
      const horasAgg = mapaHoras[l.id] ?? { norm: 0, extra: 0, dias: 0, diasDatas: new Set() }
      const vh = mapaValorH[`${colab?.funcao_id}_${colab?.tipo_contrato}`] ?? 0
      const valorHoras = horasAgg.norm * vh + horasAgg.extra * vh * 1.5
      const valorProd  = mapaProd[l.id] ?? 0
      const tipo = colab?.tipo_contrato ?? 'clt'

      let valorTotal = 0
      let dsr = 0
      let premio = 0

      if (tipo === 'clt') {
        // DSR = (valorHoras / diasUteis) × domingos
        const du  = diasUteisPeriodo(l.data_inicio, l.data_fim)
        const dom = domingosFeriadosPeriodo(l.data_inicio, l.data_fim)
        dsr = du > 0 && dom > 0 ? (valorHoras / du) * dom : 0
        const salario = valorHoras + dsr
        // Regra produção: se prod > salário → paga salário + prêmio
        premio = valorProd > salario ? valorProd - salario : 0
        valorTotal = salario + premio
      } else {
        // Autônomo/PJ: horas (dias sem prod) + produção
        const diasComProd = mapaProdDias[l.id] ?? new Set<string>()
        const normSemProd = horasAgg.norm  // simplificado: usa total (prod já soma separado)
        // Para autônomo, Total = horas de dias SEM prod + produção
        // Como não temos horas por dia aqui, usamos: valorHoras - valorHorasDiasComProd
        // Aproximação: se tem prod, não soma horas dos dias com prod
        const diasTotalLanc = horasAgg.dias || 1
        const diasSemProd = Math.max(0, diasTotalLanc - diasComProd.size)
        const horasPorDia = diasTotalLanc > 0 ? valorHoras / diasTotalLanc : 0
        const valorHorasSemProd = horasPorDia * diasSemProd
        valorTotal = diasComProd.size > 0 ? valorHorasSemProd + valorProd : valorHoras + valorProd
      }

      // ── VT: desconto por faltas ──────────────────────────────────────────
      const faltas     = (horasAgg as any).faltas ?? 0
      const vtDiario   = (colab?.vale_transporte && colab?.vt_dados) ? vtDia(colab.vt_dados) : 0
      const descontoVT = vtDiario * faltas  // desconta passagem por dia de falta

      // ── Base de desconto: CLT = horas+DSR / Autônomo = total recebido ───────
      // CLT: desconto sobre salário (horas+DSR), NÃO sobre prêmio de produção
      // Autônomo: desconto sobre total (horas + produção)
      const baseDesconto = tipo === 'clt' ? (valorHoras + dsr) : valorTotal
      const inss = tipo === 'clt'
        ? calcINSS(baseDesconto, tabelaInss.length ? tabelaInss : undefined)
        : 0   // autônomo não tem INSS retido (é MEI/PJ/autônomo)
      const ir = tipo === 'clt'
        ? calcIR(baseDesconto, inss, tabelaIR.length ? tabelaIR : undefined)
        : 0

      // Líquido = total a receber - desconto VT - INSS - IR
      const liquido = valorTotal - descontoVT - inss - ir

      return {
        id: l.id,
        colaborador_id: l.colaborador_id,
        colaborador_nome: colab?.nome ?? '—',
        colaborador_chapa: colab?.chapa ?? null,
        funcao_nome: colab?.funcoes?.nome ?? '—',
        funcao_id: colab?.funcao_id ?? null,
        tipo_contrato: tipo,
        obra_id: l.obra_id,
        obra_nome: l.obras?.nome ?? '—',
        mes_referencia: l.mes_referencia,
        data_inicio: l.data_inicio,
        data_fim: l.data_fim,
        status: l.status,
        horas_normais: horasAgg.norm,
        horas_extras: horasAgg.extra,
        valor_horas: valorHoras,
        valor_producao: valorProd,
        valor_dsr: dsr,
        valor_premio: premio,
        valor_total: valorTotal,
        dias_trabalhados: horasAgg.dias,
        faltas,
        desconto_vt: descontoVT,
        valor_vt_dia: vtDiario,
        inss,
        ir,
        liquido,
      }
    })
    setLancamentos(lista)
    setLoading(false)
  }, [])

  // Carregar tabelas de encargos uma vez
  useEffect(() => {
    fetchTabelasEncargos(supabase).then(({ tabelaInss: ti, tabelaIR: tir }) => {
      setTabelaInss(ti); setTabelaIR(tir)
    })
  }, [])

  useEffect(() => { fetchLancamentos(mesRef) }, [mesRef, fetchLancamentos])

  // ── Agrupamento por colaborador ───────────────────────────────────────────
  const porColaborador = useMemo(() => {
    const q = busca.toLowerCase()
    const filtrados = lancamentos.filter(l =>
      !q || l.colaborador_nome.toLowerCase().includes(q) ||
      (l.colaborador_chapa ?? '').toLowerCase().includes(q) ||
      l.obra_nome.toLowerCase().includes(q)
    )
    const mapa: Record<string, { nome: string; chapa: string | null; funcao: string; tipo: string; lancs: LancItem[] }> = {}
    filtrados.forEach(l => {
      if (!mapa[l.colaborador_id]) mapa[l.colaborador_id] = { nome: l.colaborador_nome, chapa: l.colaborador_chapa, funcao: l.funcao_nome, tipo: l.tipo_contrato, lancs: [] }
      mapa[l.colaborador_id].lancs.push(l)
    })
    return Object.entries(mapa).map(([id, v]) => ({
      id, ...v,
      totalHoras: v.lancs.reduce((s, l) => s + l.horas_normais + l.horas_extras, 0),
      totalValor: v.lancs.reduce((s, l) => s + l.valor_total, 0),
      totalLiquido: v.lancs.reduce((s, l) => s + l.liquido, 0),
      totalInss: v.lancs.reduce((s, l) => s + l.inss, 0),
      totalIr: v.lancs.reduce((s, l) => s + l.ir, 0),
      totalVt: v.lancs.reduce((s, l) => s + l.desconto_vt, 0),
    }))
  }, [lancamentos, busca])

  const totalGeral = useMemo(() => lancamentos.reduce((s, l) => s + l.valor_total, 0), [lancamentos])
  const pendentes   = lancamentos.filter(l => l.status === 'aprovado')
  const pagos       = lancamentos.filter(l => l.status === 'pago')

  // ── Recusar lançamento ────────────────────────────────────────────────────
  async function recusarLanc(id: string) {
    if (!motivoRecusa.trim()) { toast.error('Informe o motivo'); return }
    setSaving(true)
    const { error } = await supabase.from('ponto_lancamentos').update({
      status: 'recusado', motivo_recusa: motivoRecusa,
    }).eq('id', id)
    setSaving(false)
    if (error) { toast.error('Erro: ' + error.message); return }
    toast.success('Lançamento devolvido para edição')
    setModalRecusar(null); setMotivoRecusa('')
    fetchLancamentos(mesRef)
  }

  // ── Liberar para pagamento (direto, sem fechamento intermediário) ──────────
  async function liberarPagamento(lancId: string) {
    setSaving(true)
    const { error } = await supabase.from('ponto_lancamentos')
      .update({ status: 'pago' }).eq('id', lancId)
    setSaving(false)
    if (error) { toast.error('Erro: ' + error.message); return }
    toast.success('✅ Lançamento liberado para pagamento!')
    setModalPagar(null)
    fetchLancamentos(mesRef)
  }

  // ── Liberar todos aprovados de um colaborador ─────────────────────────────
  async function liberarTodosColab(colabId: string) {
    const ids = lancamentos.filter(l => l.colaborador_id === colabId && l.status === 'aprovado').map(l => l.id)
    if (!ids.length) return
    setSaving(true)
    const { error } = await supabase.from('ponto_lancamentos').update({ status: 'pago' }).in('id', ids)
    setSaving(false)
    if (error) { toast.error('Erro: ' + error.message); return }
    toast.success(`${ids.length} lançamento(s) liberado(s) para pagamento!`)
    fetchLancamentos(mesRef)
  }

  const STATUS_BADGE: Record<string, { bg: string; color: string; label: string }> = {
    aprovado:     { bg: '#dcfce7', color: '#15803d', label: '✅ Aprovado' },
    pago:         { bg: '#ede9fe', color: '#6d28d9', label: '💰 Pago' },
    em_fechamento:{ bg: '#dbeafe', color: '#1d4ed8', label: '🔒 Fechamento' },
  }

  // ─────────────────────────────────────────────────────────────────────────
  return (
    <div className="p-6">
      <PageHeader
        title="Fechamento de Ponto"
        subtitle="Aprovação e liberação de lançamentos para pagamento"
      />

      {/* ── Filtros ── */}
      <div className="flex flex-wrap items-center gap-3 mb-5">
        <Select value={String(mes)} onValueChange={v => setMes(Number(v))}>
          <SelectTrigger className="w-32 h-9"><SelectValue /></SelectTrigger>
          <SelectContent>
            {MESES_ABR.map((m, i) => <SelectItem key={i + 1} value={String(i + 1)}>{m}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={String(ano)} onValueChange={v => setAno(Number(v))}>
          <SelectTrigger className="w-24 h-9"><SelectValue /></SelectTrigger>
          <SelectContent>
            {[2024, 2025, 2026, 2027].map(y => <SelectItem key={y} value={String(y)}>{y}</SelectItem>)}
          </SelectContent>
        </Select>
        <div className="relative flex-1 min-w-48">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input placeholder="Colaborador, obra..." value={busca} onChange={e => setBusca(e.target.value)} className="pl-8 h-9" />
        </div>
      </div>

      {/* ── Cards de resumo ── */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        {[
          { icon: <Users size={16} />, label: 'Colaboradores', value: porColaborador.length, color: '#2563eb' },
          { icon: <Clock size={16} />, label: 'Pendentes pgto', value: pendentes.length, color: '#b45309', suffix: ' lanç.' },
          { icon: <CheckCircle2 size={16} />, label: 'Pagos', value: pagos.length, color: '#15803d', suffix: ' lanç.' },
          { icon: <DollarSign size={16} />, label: 'Total a Pagar', value: formatCurrency(totalGeral), color: '#7c3aed', isMoney: true },
        ].map((c, i) => (
          <div key={i} style={{ background: 'var(--card)', borderRadius: 10, padding: '14px 16px', border: '1px solid var(--border)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: c.color, marginBottom: 4 }}>
              {c.icon}<span style={{ fontSize: 11, fontWeight: 600 }}>{c.label}</span>
            </div>
            <div style={{ fontSize: 20, fontWeight: 800, color: c.color }}>
              {c.isMoney ? c.value : `${c.value}${c.suffix ?? ''}`}
            </div>
          </div>
        ))}
      </div>

      {/* ── Lista por colaborador ── */}
      {loading ? <LoadingSkeleton /> : porColaborador.length === 0 ? (
        <EmptyState
          icon={<CheckCircle2 size={32} />}
          title={`Nenhum lançamento aprovado em ${MESES[mes - 1]} / ${ano}`}
          description="Lançamentos de ponto aprovados aparecerão aqui para liberação de pagamento."
        />
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {porColaborador.map(colab => {
            const exp = expandidos.has(colab.id)
            const todosAprovados = colab.lancs.every(l => l.status === 'aprovado')
            return (
              <div key={colab.id} style={{ border: '1px solid var(--border)', borderRadius: 10, overflow: 'hidden', background: 'var(--card)' }}>
                {/* Header colaborador */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '12px 16px', cursor: 'pointer', background: exp ? 'var(--muted)' : undefined }}
                  onClick={() => setExpandidos(prev => { const n = new Set(prev); n.has(colab.id) ? n.delete(colab.id) : n.add(colab.id); return n })}>
                  {exp ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                  <div style={{ flex: 1 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span style={{ fontWeight: 700, fontSize: 14 }}>{colab.nome}</span>
                      {colab.chapa && <span style={{ fontSize: 10, fontFamily: 'monospace', background: 'var(--muted)', borderRadius: 4, padding: '1px 5px' }}>{colab.chapa}</span>}
                      <span style={{ fontSize: 11, color: 'var(--muted-foreground)' }}>{colab.funcao} · {colab.tipo}</span>
                    </div>
                    <div style={{ fontSize: 11, color: 'var(--muted-foreground)', marginTop: 2 }}>
                      {colab.lancs.length} lançamento(s) · {fmtHHMM(colab.totalHoras)}h · Bruto: <strong>{formatCurrency(colab.totalValor)}</strong>
                      {colab.totalLiquido !== colab.totalValor && <> · Líquido: <strong style={{color:'#15803d'}}>{formatCurrency(colab.totalLiquido)}</strong></>}
                    </div>
                  </div>
                  {todosAprovados && (
                    <Button size="sm" style={{ background: '#7c3aed', color: '#fff', height: 28, fontSize: 11, gap: 4 }}
                      disabled={saving}
                      onClick={e => { e.stopPropagation(); liberarTodosColab(colab.id) }}>
                      💰 Liberar Todos
                    </Button>
                  )}
                </div>

                {/* Lançamentos expandidos */}
                {exp && (
                  <Table>
                    <TableHeader>
                      <TableRow style={{ background: 'rgba(0,0,0,0.03)' }}>
                        <TableHead style={{ fontSize: 11 }}>Obra</TableHead>
                        <TableHead style={{ fontSize: 11 }}>Período</TableHead>
                        <TableHead className="text-center" style={{ fontSize: 11 }}>Dias</TableHead>
                        <TableHead className="text-right" style={{ fontSize: 11 }}>Horas</TableHead>
                        <TableHead style={{ fontSize: 11, color: '#7c3aed', fontWeight: 700, minWidth: 260 }}>💵 Composição do Salário</TableHead>
                        <TableHead className="text-center" style={{ fontSize: 11, color: '#dc2626' }}>Faltas</TableHead>
                        <TableHead className="text-right" style={{ fontSize: 11, color: '#dc2626' }}>− VT</TableHead>
                        <TableHead className="text-right" style={{ fontSize: 11, color: '#dc2626' }}>− INSS</TableHead>
                        <TableHead className="text-right" style={{ fontSize: 11, color: '#dc2626' }}>− IR</TableHead>
                        <TableHead className="text-right" style={{ fontSize: 11, color: '#15803d', fontWeight: 700 }}>✅ Líquido</TableHead>
                        <TableHead className="text-center" style={{ fontSize: 11 }}>Status</TableHead>
                        <TableHead></TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {colab.lancs.map(lanc => {
                        const badge = STATUS_BADGE[lanc.status] ?? { bg: '#f3f4f6', color: '#6b7280', label: lanc.status }
                        const ehCLT = lanc.tipo_contrato === 'clt'

                        // Composição do salário em texto
                        const partesSal: string[] = []
                        if (lanc.valor_horas > 0) partesSal.push(`Horas: ${formatCurrency(lanc.valor_horas)}`)
                        if (ehCLT && lanc.valor_dsr > 0) partesSal.push(`DSR: ${formatCurrency(lanc.valor_dsr)}`)
                        if (ehCLT && lanc.valor_premio > 0) partesSal.push(`Prêmio: ${formatCurrency(lanc.valor_premio)}`)
                        if (!ehCLT && lanc.valor_producao > 0) partesSal.push(`Prod: ${formatCurrency(lanc.valor_producao)}`)

                        return (
                          <TableRow key={lanc.id}>
                            <TableCell>
                              <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                                <Building2 size={12} style={{ color: 'var(--muted-foreground)' }} />
                                <span style={{ fontSize: 12 }}>{lanc.obra_nome}</span>
                              </div>
                            </TableCell>
                            <TableCell style={{ fontFamily: 'monospace', fontSize: 11, whiteSpace: 'nowrap' }}>
                              {lanc.data_inicio.slice(8)}/{lanc.data_inicio.slice(5,7)} → {lanc.data_fim.slice(8)}/{lanc.data_fim.slice(5,7)}
                            </TableCell>
                            <TableCell className="text-center" style={{ fontSize: 12 }}>{lanc.dias_trabalhados}</TableCell>
                            <TableCell className="text-right" style={{ fontFamily: 'monospace', fontSize: 11 }}>{fmtHHMM(lanc.horas_normais)}</TableCell>

                            {/* ── Composição do Salário ── */}
                            <TableCell style={{ minWidth: 260 }}>
                              <div style={{ display: 'flex', alignItems: 'center', gap: 4, flexWrap: 'wrap', fontSize: 11 }}>
                                {partesSal.map((p, i) => (
                                  <span key={i} style={{ color: 'var(--muted-foreground)' }}>
                                    {i > 0 && <span style={{ margin: '0 3px', color: '#9ca3af' }}>+</span>}
                                    {p}
                                  </span>
                                ))}
                                <span style={{ margin: '0 4px', color: '#9ca3af', fontWeight: 700 }}>=</span>
                                <span style={{ fontWeight: 800, color: '#7c3aed', fontSize: 12 }}>
                                  {formatCurrency(lanc.valor_total)}
                                </span>
                              </div>
                            </TableCell>

                            {/* ── Descontos ── */}
                            <TableCell className="text-center" style={{ color: lanc.faltas > 0 ? '#dc2626' : 'var(--muted-foreground)', fontSize: 12 }}>
                              {lanc.faltas > 0 ? lanc.faltas : '—'}
                            </TableCell>
                            <TableCell className="text-right" style={{ color: '#dc2626', fontSize: 12 }}>
                              {lanc.desconto_vt > 0
                                ? <span title={`R$ ${lanc.valor_vt_dia.toFixed(2)}/dia × ${lanc.faltas} falta(s)`}>
                                    −{formatCurrency(lanc.desconto_vt)}
                                  </span>
                                : <span style={{ color: 'var(--muted-foreground)' }}>—</span>}
                            </TableCell>
                            <TableCell className="text-right" style={{ color: '#dc2626', fontSize: 12 }}>
                              {lanc.inss > 0
                                ? <span title={ehCLT ? `Base: ${formatCurrency(lanc.valor_horas + lanc.valor_dsr)}` : ''}>
                                    −{formatCurrency(lanc.inss)}
                                  </span>
                                : <span style={{ color: 'var(--muted-foreground)' }}>—</span>}
                            </TableCell>
                            <TableCell className="text-right" style={{ color: '#dc2626', fontSize: 12 }}>
                              {lanc.ir > 0
                                ? <span title={ehCLT ? `Base IR: ${formatCurrency(lanc.valor_horas + lanc.valor_dsr - lanc.inss)}` : ''}>
                                    −{formatCurrency(lanc.ir)}
                                  </span>
                                : <span style={{ color: 'var(--muted-foreground)' }}>—</span>}
                            </TableCell>
                            <TableCell className="text-right" style={{ fontWeight: 800, color: '#15803d', fontSize: 13 }}>
                              {formatCurrency(lanc.liquido)}
                            </TableCell>

                            <TableCell className="text-center">
                              <span style={{ ...badge, borderRadius: 10, padding: '2px 8px', fontSize: 11, fontWeight: 600, display: 'inline-block' }}>
                                {badge.label}
                              </span>
                            </TableCell>
                            <TableCell>
                              <div style={{ display: 'flex', gap: 4, justifyContent: 'flex-end' }}>
                                {lanc.status === 'aprovado' && (
                                  <>
                                    <Button size="sm" style={{ height: 26, fontSize: 11, background: '#7c3aed', color: '#fff' }}
                                      onClick={() => setModalPagar(lanc.id)}>
                                      💰 Pagar
                                    </Button>
                                    <Button size="sm" variant="outline" style={{ height: 26, fontSize: 11, borderColor: '#dc2626', color: '#dc2626' }}
                                      onClick={() => { setModalRecusar(lanc.id); setMotivoRecusa('') }}>
                                      ✕ Recusar
                                    </Button>
                                  </>
                                )}
                              </div>
                            </TableCell>
                          </TableRow>
                        )
                      })}
                    </TableBody>
                  </Table>
                )}
              </div>
            )
          })}
        </div>
      )}

      {/* ═══ MODAL CONFIRMAR PAGAMENTO ═══ */}
      {modalPagar && (() => {
        const lanc = lancamentos.find(l => l.id === modalPagar)
        return (
          <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 70, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <div style={{ background: 'var(--background)', borderRadius: 12, width: 400, padding: 28, boxShadow: '0 20px 60px rgba(0,0,0,0.3)' }}>
              <div style={{ textAlign: 'center', marginBottom: 20 }}>
                <div style={{ fontSize: 36, marginBottom: 8 }}>💰</div>
                <h3 style={{ fontWeight: 800, fontSize: 15, margin: 0 }}>Liberar para Pagamento</h3>
                <p style={{ fontSize: 13, color: 'var(--muted-foreground)', marginTop: 8 }}>
                  <strong>{lanc?.obra_nome}</strong><br />
                  {lanc?.data_inicio.slice(8)}/{lanc?.data_inicio.slice(5,7)} → {lanc?.data_fim.slice(8)}/{lanc?.data_fim.slice(5,7)}<br />
                  Valor: <strong>{formatCurrency(lanc?.valor_total ?? 0)}</strong>
                </p>
              </div>
              <div style={{ display: 'flex', gap: 10, justifyContent: 'center' }}>
                <Button variant="outline" onClick={() => setModalPagar(null)}>Cancelar</Button>
                <Button disabled={saving} style={{ background: '#7c3aed', color: '#fff' }}
                  onClick={() => liberarPagamento(modalPagar)}>
                  {saving ? 'Processando…' : '💰 Confirmar Pagamento'}
                </Button>
              </div>
            </div>
          </div>
        )
      })()}

      {/* ═══ MODAL RECUSAR ═══ */}
      {modalRecusar && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 70, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ background: 'var(--background)', borderRadius: 12, width: 420, padding: 28, boxShadow: '0 20px 60px rgba(0,0,0,0.3)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <h3 style={{ fontWeight: 800, fontSize: 15, margin: 0, color: '#b91c1c' }}>❌ Recusar Lançamento</h3>
              <button onClick={() => setModalRecusar(null)} style={{ border: 'none', background: 'none', cursor: 'pointer' }}><X size={16} /></button>
            </div>
            <div style={{ marginBottom: 16 }}>
              <label style={{ fontSize: 12, fontWeight: 600, display: 'block', marginBottom: 6 }}>Motivo da recusa *</label>
              <textarea
                value={motivoRecusa}
                onChange={e => setMotivoRecusa(e.target.value)}
                placeholder="Descreva o motivo para orientar o colaborador…"
                rows={4}
                style={{ width: '100%', padding: '8px 10px', fontSize: 13, border: '2px solid #fecaca', borderRadius: 6, background: 'var(--background)', color: 'var(--foreground)', resize: 'vertical', fontFamily: 'inherit', boxSizing: 'border-box' }}
              />
              {!motivoRecusa.trim() && <div style={{ fontSize: 11, color: '#b91c1c', marginTop: 4 }}>⚠️ O motivo é obrigatório</div>}
            </div>
            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
              <Button variant="outline" onClick={() => setModalRecusar(null)}>Cancelar</Button>
              <Button disabled={!motivoRecusa.trim() || saving} style={{ background: '#dc2626', color: '#fff', opacity: !motivoRecusa.trim() ? 0.5 : 1 }}
                onClick={() => recusarLanc(modalRecusar)}>
                {saving ? 'Salvando…' : '❌ Confirmar Recusa'}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
