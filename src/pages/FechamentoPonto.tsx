import React, { useEffect, useState, useCallback, useMemo } from 'react'
import { toast } from 'sonner'
import {
  CheckCircle2, Clock, DollarSign, Users, ChevronDown, ChevronRight,
  Search, Building2, X,
} from 'lucide-react'
import { calcDSRComFaltas } from '@/lib/dsr'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/hooks/useAuth'
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
  desconto_vt_6pct: number     // parcela do desconto referente ao 6% do VT
  desconto_adiant: number
  valor_vt_dia: number
  inss: number
  ir: number
  liquido: number
  // ── campos gravados no banco ao aprovar (snapshot) ──
  vh_usado: number          // valor/hora no momento do cálculo
  vt_diario_usado: number   // VT/dia no momento do cálculo
  // snap do banco (se já aprovado anteriormente)
  snap_valor_total:   number | null
  snap_liquido:       number | null
  snap_valor_horas:   number | null
  snap_valor_dsr:     number | null
  snap_valor_premio:  number | null
  snap_valor_producao:number | null
  snap_inss:          number | null
  snap_ir:            number | null
  snap_desconto_vt:   number | null
  snap_desconto_adiant: number | null
  snap_faltas:        number | null
  snap_valor_hora:    number | null
  snap_fechado_em:    string | null
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

  const { user } = useAuth()
  const [lancamentos, setLancamentos] = useState<LancItem[]>([])
  const [loading, setLoading] = useState(false)
  const [expandidos, setExpandidos] = useState<Set<string>>(new Set())

  // Modal recusar
  const [modalRecusar, setModalRecusar] = useState<string | null>(null)
  const [motivoRecusa, setMotivoRecusa] = useState('')
  const [saving, setSaving] = useState(false)
  const [tabelaInss, setTabelaInss] = useState<FaixaINSS[]>([])
  const [tabelaIR, setTabelaIR]     = useState<FaixaIR[]>([])
  const [modalEstornar, setModalEstornar] = useState<string | null>(null)   // lancId
  const [motivoEstorno, setMotivoEstorno] = useState('')

  // Modal confirmar pagamento

  const mesRef = `${ano}-${String(mes).padStart(2, '0')}`

  // ── Fetch lançamentos aprovados ──────────────────────────────────────────
  const fetchLancamentos = useCallback(async (mr: string) => {
    setLoading(true)
    const { data: lancsRaw } = await supabase
      .from('ponto_lancamentos')
      .select(`
        id, colaborador_id, obra_id, mes_referencia, data_inicio, data_fim, status,
        valor_hora_snapshot,
        snap_valor_hora, snap_horas_normais, snap_horas_extras, snap_valor_horas,
        snap_valor_producao, snap_valor_dsr, snap_valor_premio, snap_valor_total,
        snap_faltas, snap_vt_diario, snap_desconto_vt, snap_desconto_adiant,
        snap_inss, snap_ir, snap_liquido, snap_fechado_em,
        colaboradores(nome, chapa, tipo_contrato, funcao_id, vale_transporte, vt_dados, funcoes(nome)),
        obras(nome)
      `)
      .in('status', ['em_fechamento', 'aprovado', 'liberado', 'pago', 'rascunho', 'recusado'])
      .eq('mes_referencia', mr)
      .order('data_inicio')

    if (!lancsRaw) { setLoading(false); return }

    const ids = lancsRaw.map((l: any) => l.id)
    const colabIds = [...new Set(lancsRaw.map((l: any) => l.colaborador_id).filter(Boolean))]
    const [{ data: pontosRaw }, { data: prodRaw }, { data: feriadosRaw }, { data: adiantRaw }, { data: vtDescRaw }] = await Promise.all([
      ids.length ? supabase.from('registro_ponto').select('lancamento_id,horas_trabalhadas,horas_extras,data,falta').in('lancamento_id', ids) : Promise.resolve({ data: [] }),
      ids.length ? supabase.from('ponto_producao').select('lancamento_id,valor_total,dias').in('lancamento_id', ids) : Promise.resolve({ data: [] }),
      supabase.from('feriados').select('data').gte('data', mr+'-01').lte('data', mr+'-31'),
      colabIds.length
        ? supabase.from('adiantamentos').select('colaborador_id,valor').eq('competencia', mr).eq('status','pago').is('descontado_em', null).in('colaborador_id', colabIds)
        : Promise.resolve({ data: [] }),
      // VT com desconto 6% no mês
      colabIds.length
        ? supabase.from('vale_transporte').select('colaborador_id,desconto_colaborador,descontar_6pct').eq('competencia', mr).eq('descontar_6pct', true).in('colaborador_id', colabIds)
        : Promise.resolve({ data: [] }),
    ])

    // Somar adiantamentos pagos e ainda não descontados por colaborador
    const mapaAdiant: Record<string, number> = {}
    ;(adiantRaw ?? []).forEach((a: any) => {
      mapaAdiant[a.colaborador_id] = (mapaAdiant[a.colaborador_id] ?? 0) + a.valor
    })

    // Somar desconto VT (6%) por colaborador — apenas registros com descontar_6pct=true
    const mapaDescontoVT6: Record<string, number> = {}
    ;(vtDescRaw ?? []).forEach((v: any) => {
      mapaDescontoVT6[v.colaborador_id] = (mapaDescontoVT6[v.colaborador_id] ?? 0) + (v.desconto_colaborador ?? 0)
    })

    const funcaoIds = [...new Set(lancsRaw.map((l: any) => l.colaboradores?.funcao_id).filter(Boolean))]
    // Buscar valor/hora: funcao_valores (por tipo_contrato) + fallback em funcoes
    const [{ data: valorHoraRaw }, { data: funcoesRaw }] = await Promise.all([
      funcaoIds.length
        ? supabase.from('funcao_valores').select('funcao_id,tipo_contrato,valor_hora').in('funcao_id', funcaoIds)
        : Promise.resolve({ data: [] as {funcao_id:string;tipo_contrato:string;valor_hora:number}[] }),
      funcaoIds.length
        ? supabase.from('funcoes').select('id,valor_hora_clt,valor_hora_autonomo').in('id', funcaoIds)
        : Promise.resolve({ data: [] as {id:string;valor_hora_clt:number|null;valor_hora_autonomo:number|null}[] }),
    ])

    // Mapa funcao_valores: chave "funcao_id_tipo_contrato"
    const mapaValorH: Record<string, number> = {}
    ;(valorHoraRaw ?? []).forEach((v: any) => { mapaValorH[`${v.funcao_id}_${v.tipo_contrato}`] = v.valor_hora })

    // Mapa fallback funcoes: chave "funcao_id_clt" / "funcao_id_autonomo"
    const mapaFuncaoFallback: Record<string, number> = {}
    ;(funcoesRaw ?? []).forEach((f: any) => {
      if (f.valor_hora_clt)      mapaFuncaoFallback[`${f.id}_clt`]      = f.valor_hora_clt
      if (f.valor_hora_autonomo) mapaFuncaoFallback[`${f.id}_autonomo`]  = f.valor_hora_autonomo
      if (f.valor_hora_clt)      mapaFuncaoFallback[`${f.id}_pj`]        = f.valor_hora_autonomo ?? f.valor_hora_clt
    })

    // Helper: busca vh com fallback
    function getVH(funcaoId: string | null, tipoContrato: string): number {
      if (!funcaoId) return 0
      return mapaValorH[`${funcaoId}_${tipoContrato}`]
          ?? mapaFuncaoFallback[`${funcaoId}_${tipoContrato}`]
          ?? mapaValorH[`${funcaoId}_clt`]
          ?? mapaFuncaoFallback[`${funcaoId}_clt`]
          ?? 0
    }

    // Feriados do período
    const feriadosSet = new Set<string>((feriadosRaw ?? []).map((f: any) => f.data as string))

    // Agregar horas, faltas e datas de falta por lançamento
    const mapaHoras: Record<string, { norm: number; extra: number; dias: number; faltas: number; diasDatas: Set<string>; datasComFalta: Set<string> }> = {}
    ;(pontosRaw ?? []).forEach((p: any) => {
      if (!mapaHoras[p.lancamento_id]) mapaHoras[p.lancamento_id] = { norm: 0, extra: 0, dias: 0, faltas: 0, diasDatas: new Set(), datasComFalta: new Set() }
      mapaHoras[p.lancamento_id].norm   += (p.horas_trabalhadas ?? 0)
      mapaHoras[p.lancamento_id].extra  += (p.horas_extras ?? 0)
      mapaHoras[p.lancamento_id].dias   += 1
      if (p.falta) {
        mapaHoras[p.lancamento_id].faltas += 1
        if (p.data) mapaHoras[p.lancamento_id].datasComFalta.add(p.data)
      }
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
        return dow >= 1 && dow <= 5 && !feriadosSet.has(d)  // Seg-Sex apenas
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
      const tipo  = colab?.tipo_contrato ?? 'clt'
      const horasAgg = mapaHoras[l.id] ?? { norm: 0, extra: 0, dias: 0, diasDatas: new Set() }

      // ══ TRAVA DE SNAPSHOT ══════════════════════════════════════════════════
      // Lançamentos já aprovados/liberados/pagos usam EXCLUSIVAMENTE os valores
      // gravados no banco no momento do fechamento. Nenhuma alteração posterior
      // em valor/hora, horário da obra ou playbook afeta registros fechados.
      const jaFechado = !['em_fechamento','rascunho','recusado'].includes(l.status) && l.snap_valor_total != null
      if (jaFechado) {
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
          horas_normais:  l.snap_horas_normais  ?? horasAgg.norm,
          horas_extras:   l.snap_horas_extras   ?? horasAgg.extra,
          valor_horas:    l.snap_valor_horas    ?? 0,
          valor_producao: l.snap_valor_producao ?? 0,
          valor_dsr:      l.snap_valor_dsr      ?? 0,
          valor_premio:   l.snap_valor_premio   ?? 0,
          valor_total:    l.snap_valor_total     ?? 0,
          dias_trabalhados: horasAgg.dias,
          faltas:         l.snap_faltas          ?? 0,
          desconto_vt:    l.snap_desconto_vt     ?? 0,
          desconto_vt_6pct: 0,    // snap não guarda separado, usamos 0
          desconto_adiant:l.snap_desconto_adiant ?? 0,
          valor_vt_dia:   l.snap_vt_diario       ?? 0,
          inss:           l.snap_inss            ?? 0,
          ir:             l.snap_ir              ?? 0,
          liquido:        l.snap_liquido         ?? 0,
          vh_usado:       l.snap_valor_hora      ?? 0,
          vt_diario_usado:l.snap_vt_diario       ?? 0,
          snap_valor_total:    l.snap_valor_total,
          snap_liquido:        l.snap_liquido,
          snap_valor_horas:    l.snap_valor_horas,
          snap_valor_dsr:      l.snap_valor_dsr,
          snap_valor_premio:   l.snap_valor_premio,
          snap_valor_producao: l.snap_valor_producao,
          snap_inss:           l.snap_inss,
          snap_ir:             l.snap_ir,
          snap_desconto_vt:    l.snap_desconto_vt,
          snap_desconto_adiant:l.snap_desconto_adiant,
          snap_faltas:         l.snap_faltas,
          snap_valor_hora:     l.snap_valor_hora,
          snap_fechado_em:     l.snap_fechado_em,
        } as LancItem
      }
      // ══ FIM TRAVA — abaixo: cálculo ao vivo apenas para em_fechamento ══════

      // ✅ Prioridade: snapshot do Ponto (valor_hora_snapshot) → snapshot do Fechamento (snap_valor_hora) → ao vivo (funcao_valores)
      const vh = (l.valor_hora_snapshot ?? l.snap_valor_hora ?? getVH(colab?.funcao_id ?? null, tipo)) as number
      const valorHoras = horasAgg.norm * vh + horasAgg.extra * vh * 1.5
      const valorProd  = mapaProd[l.id] ?? 0

      let valorTotal = 0
      let dsr = 0
      let premio = 0

      if (tipo === 'clt') {
        // DSR com regra de perda por falta semanal
        const datasComFaltaLanc = (horasAgg as any).datasComFalta ?? new Set<string>()
        const dsrRes = calcDSRComFaltas(valorHoras, l.data_inicio, l.data_fim, datasComFaltaLanc)
        dsr = dsrRes.dsr
        const salario = valorHoras + dsr
        // Regra produção: se prod > salário → paga salário + prêmio
        premio = valorProd > salario ? valorProd - salario : 0
        valorTotal = salario + premio
      } else {
        // Autônomo/PJ: igual ao Ponto — Total = valorHoras + produção
        // Regra: autônomo recebe por horas trabalhadas + produção (sem DSR)
        // Se há produção em algum dia, ainda recebe horas normais do período
        valorTotal = valorHoras + valorProd
      }

      // ── Adiantamento: desconto de adiantamentos pagos não descontados ─────
      const descontoAdiant = mapaAdiant[l.colaborador_id] ?? 0

      // ── VT: desconto por faltas + desconto 6% do salário (se configurado no VT) ──
      const faltas     = (horasAgg as any).faltas ?? 0
      const vtDiario   = (colab?.vale_transporte && colab?.vt_dados) ? vtDia(colab.vt_dados) : 0
      const descontoVTFaltas = vtDiario * faltas          // desconta passagem por dia de falta
      const descontoVT6pct   = mapaDescontoVT6[l.colaborador_id] ?? 0  // desconto 6% sal do lançamento VT
      const descontoVT       = descontoVTFaltas + descontoVT6pct

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
      const liquido = valorTotal - descontoVT - inss - ir - descontoAdiant

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
        desconto_vt_6pct: descontoVT6pct,
        desconto_adiant: descontoAdiant,
        valor_vt_dia: vtDiario,
        inss,
        ir,
        liquido,
        // campos para snapshot
        vh_usado: vh,
        vt_diario_usado: vtDiario,
        // snap do banco (nulos se ainda não aprovado)
        snap_valor_total:    l.snap_valor_total    ?? null,
        snap_liquido:        l.snap_liquido        ?? null,
        snap_valor_horas:    l.snap_valor_horas    ?? null,
        snap_valor_dsr:      l.snap_valor_dsr      ?? null,
        snap_valor_premio:   l.snap_valor_premio   ?? null,
        snap_valor_producao: l.snap_valor_producao ?? null,
        snap_inss:           l.snap_inss           ?? null,
        snap_ir:             l.snap_ir             ?? null,
        snap_desconto_vt:    l.snap_desconto_vt    ?? null,
        snap_desconto_adiant:l.snap_desconto_adiant?? null,
        snap_faltas:         l.snap_faltas         ?? null,
        snap_valor_hora:     l.snap_valor_hora     ?? null,
        snap_fechado_em:     l.snap_fechado_em     ?? null,
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
      totalAdiant: v.lancs.reduce((s, l) => s + l.desconto_adiant, 0),
    }))
  }, [lancamentos, busca])

  const totalGeral = useMemo(() => lancamentos.reduce((s, l) => s + l.valor_total, 0), [lancamentos])
  const pendentes   = lancamentos.filter(l => ['em_fechamento','aprovado','liberado','rascunho'].includes(l.status))
  const pagos       = lancamentos.filter(l => l.status === 'pago')

  // ── Aprovar lançamento (em_fechamento → aprovado) ────────────────────────
  // ── Aprovar + gravar snapshot imutável dos valores calculados ────────────
  async function aprovarLanc(id: string) {
    const lanc = lancamentos.find(l => l.id === id)
    if (!lanc) return
    setSaving(true)
    const { error } = await supabase.from('ponto_lancamentos').update({
      status: 'aprovado',
      // ──── SNAPSHOT: valores congelados no momento do fechamento ────────────
      snap_valor_hora:      lanc.vh_usado,
      snap_horas_normais:   lanc.horas_normais,
      snap_horas_extras:    lanc.horas_extras,
      snap_valor_horas:     lanc.valor_horas,
      snap_valor_producao:  lanc.valor_producao,
      snap_valor_dsr:       lanc.valor_dsr,
      snap_valor_premio:    lanc.valor_premio,
      snap_valor_total:     lanc.valor_total,
      snap_faltas:          lanc.faltas,
      snap_vt_diario:       lanc.vt_diario_usado,
      snap_desconto_vt:     lanc.desconto_vt,
      snap_desconto_adiant: lanc.desconto_adiant,
      snap_inss:            lanc.inss,
      snap_ir:              lanc.ir,
      snap_liquido:         lanc.liquido,
      snap_fechado_em:      new Date().toISOString(),
      snap_fechado_por:     user?.email ?? 'sistema',
      // ─────────────────────────────────────────────────────────────────────
    }).eq('id', id)
    setSaving(false)
    if (error) toast.error('Erro ao aprovar: ' + error.message)
    else { toast.success('✅ Lançamento aprovado e valores congelados!'); fetchLancamentos(mesRef) }
  }

  // ── Liberar para pagamento (aprovado → liberado) ───────────────────────────
  async function liberarParaPagamento(id: string) {
    setSaving(true)
    const { error } = await supabase.from('ponto_lancamentos')
      .update({ status: 'liberado' }).eq('id', id)
    setSaving(false)
    if (error) toast.error('Erro ao liberar')
    else { toast.success('Liberado para pagamento! Vá até Pagamentos para efetivar.'); fetchLancamentos(mesRef) }
  }

  // ── Estornar lançamento (liberado → em_fechamento) ─────────────────────────
  // Usado após estorno no Pagamentos: permite re-aprovar ou devolver ao Ponto
  async function estornarLanc(id: string) {
    if (!motivoEstorno.trim()) { toast.error('Informe o motivo do estorno'); return }
    setSaving(true)
    const { error } = await supabase.from('ponto_lancamentos').update({
      status: 'em_fechamento',
      // Limpar snapshot para recalcular com fórmulas atuais
      snap_valor_hora: null,
      snap_horas_normais: null,
      snap_horas_extras: null,
      snap_valor_horas: null,
      snap_valor_producao: null,
      snap_valor_dsr: null,
      snap_valor_premio: null,
      snap_valor_total: null,
      snap_faltas: null,
      snap_vt_diario: null,
      snap_desconto_vt: null,
      snap_desconto_adiant: null,
      snap_inss: null,
      snap_ir: null,
      snap_liquido: null,
      snap_fechado_em: null,
      snap_fechado_por: null,
      motivo_recusa: `Estornado: ${motivoEstorno}`,
      data_pagamento: null,
      obs_pagamento: null,
    }).eq('id', id)
    setSaving(false)
    if (error) toast.error('Erro ao estornar')
    else {
      toast.success('↩ Lançamento estornado — retornou para Fechamento para re-aprovação')
      setModalEstornar(null)
      setMotivoEstorno('')
      fetchLancamentos(mesRef)
    }
  }

  // ── Devolver ao Ponto (liberado/em_fechamento → rascunho, limpa tudo) ──────
  async function devolverAoPonto(id: string) {
    if (!motivoEstorno.trim()) { toast.error('Informe o motivo'); return }
    setSaving(true)
    const { error } = await supabase.from('ponto_lancamentos').update({
      status: 'rascunho',
      valor_hora_snapshot: null,
      snap_valor_hora: null,
      snap_horas_normais: null,
      snap_horas_extras: null,
      snap_valor_horas: null,
      snap_valor_producao: null,
      snap_valor_dsr: null,
      snap_valor_premio: null,
      snap_valor_total: null,
      snap_faltas: null,
      snap_vt_diario: null,
      snap_desconto_vt: null,
      snap_desconto_adiant: null,
      snap_inss: null,
      snap_ir: null,
      snap_liquido: null,
      snap_fechado_em: null,
      snap_fechado_por: null,
      motivo_recusa: `Devolvido: ${motivoEstorno}`,
      data_pagamento: null,
      obs_pagamento: null,
    }).eq('id', id)
    setSaving(false)
    if (error) toast.error('Erro ao devolver')
    else {
      toast.success('↩ Lançamento devolvido ao Ponto — pode ser editado e excluído')
      setModalEstornar(null)
      setMotivoEstorno('')
      fetchLancamentos(mesRef)
    }
  }

  // ── Recusar lançamento ────────────────────────────────────────────────────
  async function recusarLanc(id: string) {
    if (!motivoRecusa.trim()) { toast.error('Informe o motivo'); return }
    setSaving(true)
    const { error } = await supabase.from('ponto_lancamentos').update({
      status: 'rascunho', motivo_recusa: motivoRecusa,  // volta para rascunho no Ponto
    }).eq('id', id)
    setSaving(false)
    if (error) { toast.error('Erro: ' + error.message); return }
    toast.success('⚠️ Lançamento devolvido para edição no Ponto')
    setModalRecusar(null); setMotivoRecusa('')
    fetchLancamentos(mesRef)
  }

  // ── Liberar para pagamento (direto, sem fechamento intermediário) ──────────
    const STATUS_BADGE: Record<string, { bg: string; color: string; label: string }> = {
    em_fechamento:{ bg: '#dbeafe', color: '#1d4ed8', label: '🔒 Em Fechamento' },
    aprovado:     { bg: '#dcfce7', color: '#15803d', label: '✅ Aprovado' },
    liberado:     { bg: '#fef3c7', color: '#b45309', label: '💜 Ag. Pagamento' },
    pago:         { bg: '#ede9fe', color: '#6d28d9', label: '💰 Pago' },
    rascunho:     { bg: '#f1f5f9', color: '#475569', label: '↩ Devolvido p/ Edição' },
    recusado:     { bg: '#fee2e2', color: '#dc2626', label: '❌ Recusado' },
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

                </div>

                {/* Lançamentos expandidos */}
                {exp && (
                  <Table>
                    <TableHeader>
                      <TableRow style={{ background: 'rgba(0,0,0,0.03)' }}>
                        <TableHead style={{ fontSize: 11 }}>Obra</TableHead>
                        <TableHead style={{ fontSize: 11 }}>Período</TableHead>
                        <TableHead className="text-center" style={{ fontSize: 11 }}>Dias</TableHead>
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

                        // Valores pré-calculados para composição
                        const salarioBase = lanc.valor_horas + lanc.valor_dsr   // CLT: base p/ descontos


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
                            {/* ── Composição do Salário ── */}
                            <TableCell style={{ minWidth: 300 }}>
                              {/* Indicador de snapshot */}
                              {lanc.snap_fechado_em && (
                                <div title={`Valores congelados em ${new Date(lanc.snap_fechado_em).toLocaleString('pt-BR')} · R$ ${lanc.snap_valor_hora?.toFixed(4)}/h`}
                                  style={{ display: 'inline-flex', alignItems: 'center', gap: 3, fontSize: 10, background: '#f0fdf4', color: '#15803d', border: '1px solid #bbf7d0', borderRadius: 5, padding: '1px 6px', marginBottom: 4, cursor: 'default' }}>
                                  🔒 valores congelados · R${lanc.snap_valor_hora?.toFixed(2)}/h
                                </div>
                              )}
                              {ehCLT ? (
                                // CLT — idêntico ao card do Ponto:
                                // 💵 Salário  R$ 4.500,00
                                // Horas: R$ 1.930,30 + DSR: R$ 438,70 + Prêmio: R$ 2.131,00
                                <div style={{ fontSize: 11, lineHeight: 1.7 }}>
                                  {/* Linha 1: total em destaque */}
                                  <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginBottom: 1 }}>
                                    <span style={{ fontSize: 10, color: '#6b7280', fontWeight: 600 }}>💵 Salário</span>
                                    <span style={{ fontWeight: 800, color: '#7c3aed', fontSize: 13 }}>{formatCurrency(lanc.valor_total)}</span>
                                  </div>
                                  {/* Linha 2: composição */}
                                  <div style={{ display: 'flex', alignItems: 'center', gap: 3, flexWrap: 'wrap', color: '#6b7280' }}>
                                    {lanc.valor_horas > 0 && (
                                      <span>Horas: <span style={{ color: '#1d4ed8', fontWeight: 600 }}>{formatCurrency(lanc.valor_horas)}</span></span>
                                    )}
                                    {lanc.valor_dsr > 0 && (
                                      <><span style={{ color: '#9ca3af' }}>+</span>
                                      <span>DSR: <span style={{ color: '#0369a1', fontWeight: 600 }}>{formatCurrency(lanc.valor_dsr)}</span></span></>
                                    )}
                                    {lanc.valor_premio > 0 && (
                                      <><span style={{ color: '#9ca3af' }}>+</span>
                                      <span>Prêmio: <span style={{ color: '#15803d', fontWeight: 600 }}>{formatCurrency(lanc.valor_premio)}</span></span></>
                                    )}
                                  </div>
                                </div>
                              ) : (
                                // Autônomo — idêntico ao card do Ponto:
                                // 💵 Total a Receber  R$ 7.107,57
                                // Horas: R$ 5.607,57 + Prod: R$ 1.500,00
                                <div style={{ fontSize: 11, lineHeight: 1.7 }}>
                                  {/* Linha 1: total */}
                                  <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginBottom: 1 }}>
                                    <span style={{ fontSize: 10, color: '#6b7280', fontWeight: 600 }}>💵 Total a Receber</span>
                                    <span style={{ fontWeight: 800, color: '#7c3aed', fontSize: 13 }}>{formatCurrency(lanc.valor_total)}</span>
                                  </div>
                                  {/* Linha 2: composição */}
                                  <div style={{ display: 'flex', alignItems: 'center', gap: 3, flexWrap: 'wrap', color: '#6b7280' }}>
                                    {lanc.valor_horas > 0 && (
                                      <span>Horas: <span style={{ color: '#1d4ed8', fontWeight: 600 }}>{formatCurrency(lanc.valor_horas)}</span></span>
                                    )}
                                    {lanc.valor_producao > 0 && (
                                      <><span style={{ color: '#9ca3af' }}>+</span>
                                      <span>Prod: <span style={{ color: '#b45309', fontWeight: 600 }}>{formatCurrency(lanc.valor_producao)}</span></span></>
                                    )}
                                  </div>
                                </div>
                              )}
                            </TableCell>

                            {/* ── Descontos ── */}
                            <TableCell className="text-center" style={{ color: lanc.faltas > 0 ? '#dc2626' : 'var(--muted-foreground)', fontSize: 12 }}>
                              {lanc.faltas > 0 ? lanc.faltas : '—'}
                            </TableCell>
                            <TableCell className="text-right" style={{ color: '#dc2626', fontSize: 12 }}>
                              {lanc.desconto_vt > 0 ? (() => {
                                const parts: string[] = []
                                const vtFalta = lanc.desconto_vt - (lanc.desconto_vt_6pct ?? 0)
                                if (vtFalta > 0) parts.push(`Falta: R$ ${lanc.valor_vt_dia.toFixed(2)}/dia × ${lanc.faltas} falta(s)`)
                                if ((lanc.desconto_vt_6pct ?? 0) > 0) parts.push(`Desc. VT 6%: R$ ${lanc.desconto_vt_6pct.toFixed(2)}`)
                                return (
                                  <span title={parts.join('\n')}>
                                    −{formatCurrency(lanc.desconto_vt)}
                                    {(lanc.desconto_vt_6pct ?? 0) > 0 && (
                                      <div style={{ fontSize: 9, color: '#b45309' }}>incl. 6% VT</div>
                                    )}
                                  </span>
                                )
                              })()
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
                            <TableCell className="text-right" style={{ color: '#b45309', fontSize: 12 }}>
                              {lanc.desconto_adiant > 0
                                ? <span title="Adiantamento descontado">−{formatCurrency(lanc.desconto_adiant)}</span>
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
                                {lanc.status === 'em_fechamento' && (
                                  <>
                                    <Button size="sm" style={{ height: 26, fontSize: 11, background: '#15803d', color: '#fff' }}
                                      disabled={saving}
                                      onClick={() => aprovarLanc(lanc.id)}>
                                      ✅ Aprovar
                                    </Button>
                                    <Button size="sm" variant="outline" style={{ height: 26, fontSize: 11, borderColor: '#dc2626', color: '#dc2626' }}
                                      onClick={() => { setModalRecusar(lanc.id); setMotivoRecusa('') }}>
                                      ✕ Recusar
                                    </Button>
                                  </>
                                )}
                                {lanc.status === 'aprovado' && (
                                  <>
                                    <Button size="sm" variant="outline" style={{ height: 26, fontSize: 11, borderColor: '#7c3aed', color: '#7c3aed' }}
                                      disabled={saving}
                                      onClick={() => liberarParaPagamento(lanc.id)}>
                                      💜 Liberar p/ Pgto
                                    </Button>
                                    <Button size="sm" variant="outline" style={{ height: 26, fontSize: 11, borderColor: '#dc2626', color: '#dc2626' }}
                                      onClick={() => { setModalRecusar(lanc.id); setMotivoRecusa('') }}>
                                      ✕ Devolver
                                    </Button>
                                  </>
                                )}
                                {lanc.status === 'liberado' && (
                                  <Button size="sm" variant="outline"
                                    style={{ height: 26, fontSize: 11, borderColor: '#dc2626', color: '#dc2626' }}
                                    onClick={() => { setModalEstornar(lanc.id); setMotivoEstorno('') }}>
                                    ↩ Estornar
                                  </Button>
                                )}
                                {(lanc.status === 'rascunho' || lanc.status === 'recusado') && (
                                  <span style={{ fontSize: 10, color: '#6b7280', fontStyle: 'italic' }}>
                                    ↩ Aguardando edição no Ponto
                                  </span>
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



      {/* ═══ MODAL ESTORNAR ═══ */}
      {modalEstornar && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 70, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ background: 'var(--background)', borderRadius: 12, width: 460, padding: 28, boxShadow: '0 20px 60px rgba(0,0,0,0.3)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <h3 style={{ fontWeight: 800, fontSize: 15, margin: 0, color: '#b91c1c' }}>↩ Estornar Lançamento</h3>
              <button onClick={() => setModalEstornar(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 18 }}>✕</button>
            </div>

            <div style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 8, padding: 12, marginBottom: 16, fontSize: 12, color: '#991b1b' }}>
              ⚠️ Este lançamento está <strong>Ag. Pagamento</strong>. Antes de estornar aqui, certifique-se de ter estornado o pagamento na aba <strong>Pagamentos</strong>.
            </div>

            <label style={{ fontSize: 12, fontWeight: 600, display: 'block', marginBottom: 6 }}>Motivo do estorno *</label>
            <textarea
              value={motivoEstorno}
              onChange={e => setMotivoEstorno(e.target.value)}
              placeholder="Descreva o motivo do estorno..."
              style={{ width: '100%', minHeight: 70, borderRadius: 6, border: '1px solid var(--border)', padding: 8, fontSize: 13, resize: 'vertical' }}
            />

            <div style={{ marginTop: 8, padding: 10, background: '#f8fafc', borderRadius: 8, fontSize: 12, color: '#374151', border: '1px solid #e5e7eb' }}>
              <strong>Escolha a ação:</strong>
              <div style={{ marginTop: 6, fontSize: 11, color: '#6b7280' }}>
                <div>🔄 <strong>Re-aprovar</strong>: volta para Fechamento com valores recalculados (fórmulas atuais)</div>
                <div style={{ marginTop: 4 }}>🗑 <strong>Devolver ao Ponto</strong>: permite editar e excluir o ponto (apaga todos os valores)</div>
              </div>
            </div>

            <div style={{ display: 'flex', gap: 8, marginTop: 16, justifyContent: 'flex-end' }}>
              <button onClick={() => setModalEstornar(null)}
                style={{ padding: '6px 14px', borderRadius: 6, border: '1px solid var(--border)', background: 'transparent', cursor: 'pointer', fontSize: 13 }}>
                Cancelar
              </button>
              <button onClick={() => devolverAoPonto(modalEstornar!)}
                disabled={saving || !motivoEstorno.trim()}
                style={{ padding: '6px 14px', borderRadius: 6, border: 'none', background: saving ? '#9ca3af' : '#dc2626', color: '#fff', cursor: saving ? 'not-allowed' : 'pointer', fontSize: 13, fontWeight: 600 }}>
                🗑 Devolver ao Ponto
              </button>
              <button onClick={() => estornarLanc(modalEstornar!)}
                disabled={saving || !motivoEstorno.trim()}
                style={{ padding: '6px 14px', borderRadius: 6, border: 'none', background: saving ? '#9ca3af' : '#7c3aed', color: '#fff', cursor: saving ? 'not-allowed' : 'pointer', fontSize: 13, fontWeight: 600 }}>
                🔄 Re-aprovar no Fechamento
              </button>
            </div>
          </div>
        </div>
      )}

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
