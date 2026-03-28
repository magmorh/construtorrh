import React, { useEffect, useState, useCallback, useMemo, useRef } from 'react'
import { useRefreshOnFocus } from '@/hooks/useRefreshOnFocus'
import { toast } from 'sonner'
import {
  CheckCircle2, Clock, DollarSign, Users, ChevronDown, ChevronRight,
  Search, Building2, X, Eye,
} from 'lucide-react'
import { calcDSRComFaltas } from '@/lib/dsr'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/hooks/useAuth'
import { formatCurrency } from '@/lib/utils'
import { calcINSS, calcIR, fetchTabelasEncargos, type FaixaINSS, type FaixaIR } from '@/lib/encargos'
import { PageHeader, EmptyState, LoadingSkeleton, SummaryCard } from '@/components/Shared'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { traduzirErro } from '@/lib/erros'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from '@/components/ui/dialog'

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
  valor_vt_dia: number          // VT/dia (taxa por dia)
  valor_vt_bruto: number        // VT total líquido do período (a receber)
  vt_desconto_faltas: number    // redução de VT por faltas (faltas × VT/dia)
  vt_adicional_sabdom: number   // VT extra por sáb/dom trabalhados (0 se obra considera sáb útil)
  vt_sabs_dom_trab: number      // qtd de sáb/dom trabalhados
  obra_considera_sabado: boolean // se a obra conta sábado como dia útil
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
  // snap imutável da regra de sábado (congelado ao entrar em fechamento)
  snap_considera_sabado_util?: boolean | null
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
  const [modalEstornar, setModalEstornar] = useState<string | null>(null)
  const [motivoEstorno, setMotivoEstorno] = useState('')
  // Aba ativa: 'pendente' | 'aprovado' | 'recusado' | 'fechamento'
  const [abaFechamento, setAbaFechamento] = useState<'pendente'|'aprovado'|'liberado'|'pago'|'recusado'|'fechamento'>('fechamento')

  // Modal confirmar pagamento
  const [modalLiberar, setModalLiberar] = useState<LancItem | null>(null)
  // Estado do desconto -AD dentro do modal de liberar — Set de IDs marcados para descontar
  const [adSelecionados, setAdSelecionados] = useState<Set<string>>(new Set())
  const [adiantsDisponiveis, setAdiantsDisponiveis] = useState<{id:string;valor:number;desconto_tipo:string;desconto_parcelas:number|null;desconto_parcela_atual:number|null;desconto_obs:string|null;desconto_a_partir:string|null}[]>([])
  // AD disponíveis pré-carregados por lançamento (id do lanc → lista de AD)
  const [adPorLanc, setAdPorLanc] = useState<Record<string, {id:string;valor:number;desconto_tipo:string;desconto_parcelas:number|null;desconto_parcela_atual:number|null;desconto_obs:string|null}[]>>({})
  // Confirmação inline -AD: lancamento_id aguardando confirm
  const [confirmADLancId, setConfirmADLancId] = useState<string | null>(null)
  // Ver detalhes do AD: lancamento_id com painel expandido
  const [verADLancId, setVerADLancId] = useState<string | null>(null)

  // ── Modal Espelho de Ponto ──────────────────────────────────────────────────
  type DiaPonto = {
    data: string          // YYYY-MM-DD
    horas_normais: number
    horas_extras: number
    falta: boolean
    producao: number      // valor de produção nesse dia (0 se não tem)
    domingo: boolean      // é domingo/feriado (off)
    atestado?: boolean
    afastamento?: boolean
    obs?: string
  }
  const [espelhoPorLanc, setEspelhoPorLanc] = useState<Record<string, DiaPonto[]>>({})
  const [modalEspelhoLancId, setModalEspelhoLancId] = useState<string | null>(null)
  const [loadingEspelho, setLoadingEspelho] = useState(false)

  const mesRef = `${ano}-${String(mes).padStart(2, '0')}`

  // ── Debounce no mesRef: aguarda 400ms sem mudança antes de buscar ───────
  const [mesRefDebounced, setMesRefDebounced] = useState(mesRef)
  useEffect(() => {
    const t = setTimeout(() => setMesRefDebounced(mesRef), 400)
    return () => clearTimeout(t)
  }, [mesRef])

  const [filtroObraFech,   setFiltroObraFech]   = useState('todos')
  const [filtroFuncaoFech, setFiltroFuncaoFech] = useState('todos')
  const [obras,   setObras]   = useState<{ id: string; nome: string }[]>([])
  const [funcoes, setFuncoes] = useState<{ id: string; nome: string }[]>([])
  // ── Cache de funcao_valores e funcoes (não muda com o mês) ─────────────────
  const cacheVH = useRef<{
    valorHora: Record<string, number>   // "funcao_id_tipo" → valor
    funcaoFallback: Record<string, number>
    loaded: boolean
  }>({ valorHora: {}, funcaoFallback: {}, loaded: false })

  // Timestamp do último fetch bem-sucedido (evita refetch desnecessário ao trocar aba)
  const lastFetchAt = useRef<number>(0)
  const CACHE_TTL_MS = 30_000   // 30 segundos

  const [, setObrasSabUtil] = useState<Record<string, boolean>>({})

  // Fetch obras e funções para filtros
  useEffect(() => {
    Promise.all([
      supabase.from('obras').select('id,nome,considera_sabado_util').order('nome'),
      supabase.from('funcoes').select('id,nome').order('nome'),
    ]).then(([oRes, fRes]) => {
      if (oRes.data) {
        setObras(oRes.data)
        const mapa: Record<string,boolean> = {}
        oRes.data.forEach((o: any) => { mapa[o.id] = o.considera_sabado_util ?? false })
        setObrasSabUtil(mapa)
      }
      if (fRes.data) setFuncoes(fRes.data)
    })
  }, [])

  // ── Fetch lançamentos aprovados ──────────────────────────────────────────
  const fetchLancamentos = useCallback(async (mr: string) => {
    setLoading(true)

    // ── ROUND-TRIP 1: lançamentos (base) ───────────────────────────────────
    // Fazemos isso separado pois precisamos dos IDs para as queries dependentes
    const { data: lancsRaw, error: lancsErr } = await supabase
      .from('ponto_lancamentos')
      .select(`
        id, colaborador_id, obra_id, mes_referencia, data_inicio, data_fim, status,
        valor_hora_snapshot,
        snap_valor_hora, snap_horas_normais, snap_horas_extras, snap_valor_horas,
        snap_valor_producao, snap_valor_dsr, snap_valor_premio, snap_valor_total,
        snap_faltas, snap_vt_diario, snap_desconto_vt, snap_desconto_adiant,
        snap_inss, snap_ir, snap_liquido, snap_fechado_em,
        colaboradores(nome, chapa, tipo_contrato, funcao_id, vale_transporte, vt_dados, data_admissao, funcoes(nome)),
        obras(nome, considera_sabado_util)
      `)
      .in('status', ['em_fechamento', 'aguardando_aprovacao', 'aprovado', 'liberado', 'pago', 'rascunho', 'recusado'])
      .eq('mes_referencia', mr)
      .order('data_inicio')

    if (lancsErr) {
      console.error('[FechamentoPonto] erro ao buscar lançamentos:', lancsErr)
      toast.error('Erro ao carregar dados do banco: ' + lancsErr.message)
      setLoading(false)
      return
    }
    if (!lancsRaw) { setLoading(false); return }

    const ids      = lancsRaw.map((l: any) => l.id)
    const colabIds = [...new Set(lancsRaw.map((l: any) => l.colaborador_id).filter(Boolean))] as string[]
    const funcaoIds = [...new Set(lancsRaw.map((l: any) => l.colaboradores?.funcao_id).filter(Boolean))] as string[]

    // ── ROUND-TRIP 2: todas as queries dependentes em paralelo ─────────────
    // funcao_valores e funcoes usam cache (não mudam com o mês)
    const needVH = funcaoIds.length > 0 && !cacheVH.current.loaded

    const [
      { data: pontosRaw },
      { data: prodRaw },
      { data: feriadosRaw },
      { data: adiantRaw },
      { data: vtDescRaw },
      valorHoraResult,
      funcoesResult,
    ] = await Promise.all([
      // Registro de ponto (maior tabela — índice idx_reg_ponto_lancamento é crítico)
      ids.length
        ? supabase.from('registro_ponto')
            .select('lancamento_id,horas_trabalhadas,horas_extras,data,falta')
            .in('lancamento_id', ids)
        : Promise.resolve({ data: [] as any[] }),

      // Produção
      ids.length
        ? supabase.from('ponto_producao')
            .select('lancamento_id,valor_total,dias')
            .in('lancamento_id', ids)
        : Promise.resolve({ data: [] as any[] }),

      // Feriados do mês
      supabase.from('feriados')
        .select('data')
        .gte('data', mr + '-01')
        .lte('data', mr + '-31'),

      // Adiantamentos a descontar
      colabIds.length
        ? supabase.from('adiantamentos')
            .select('colaborador_id,valor')
            .eq('competencia', mr)
            .eq('status', 'pago')
            .is('descontado_em', null)
            .in('colaborador_id', colabIds)
        : Promise.resolve({ data: [] as any[] }),

      // VT com desconto 6%
      colabIds.length
        ? supabase.from('vale_transporte')
            .select('colaborador_id')
            .eq('competencia', mr)
            .eq('descontar_6pct', true)
            .in('colaborador_id', colabIds)
        : Promise.resolve({ data: [] as any[] }),

      // funcao_valores — usa cache se já carregado
      needVH
        ? supabase.from('funcao_valores')
            .select('funcao_id,tipo_contrato,valor_hora')
            .in('funcao_id', funcaoIds)
        : Promise.resolve({ data: null as any }),

      // funcoes fallback — usa cache se já carregado
      needVH
        ? supabase.from('funcoes')
            .select('id,valor_hora_clt,valor_hora_autonomo')
            .in('id', funcaoIds)
        : Promise.resolve({ data: null as any }),
    ])

    // ── Atualizar cache funcao_valores / funcoes ───────────────────────────
    if (needVH) {
      ;(valorHoraResult?.data ?? []).forEach((v: any) => {
        cacheVH.current.valorHora[`${v.funcao_id}_${v.tipo_contrato}`] = v.valor_hora
      })
      ;(funcoesResult?.data ?? []).forEach((f: any) => {
        if (f.valor_hora_clt)      cacheVH.current.funcaoFallback[`${f.id}_clt`]      = f.valor_hora_clt
        if (f.valor_hora_autonomo) cacheVH.current.funcaoFallback[`${f.id}_autonomo`]  = f.valor_hora_autonomo
        if (f.valor_hora_clt)      cacheVH.current.funcaoFallback[`${f.id}_pj`]        = f.valor_hora_autonomo ?? f.valor_hora_clt
      })
      cacheVH.current.loaded = true
    }
    const mapaValorH         = cacheVH.current.valorHora
    const mapaFuncaoFallback = cacheVH.current.funcaoFallback

    // ── Montar mapas a partir dos dados brutos ─────────────────────────────

    // Adiantamentos
    const mapaAdiant: Record<string, number> = {}
    ;(adiantRaw ?? []).forEach((a: any) => {
      mapaAdiant[a.colaborador_id] = (mapaAdiant[a.colaborador_id] ?? 0) + a.valor
    })

    // Set de colaboradores que têm desconto VT 6% ativo no mês
    const setDescontoVT6: Set<string> = new Set(
      (vtDescRaw ?? []).map((v: any) => v.colaborador_id)
    )

    // Mapa funcao_valores: chave "funcao_id_tipo_contrato"
    // (já preenchido via cache acima — mapaValorH / mapaFuncaoFallback)

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
    // Também guarda horas por dia para cálculo autônomo (excluir dias de produção)
    const mapaHoras: Record<string, { norm: number; extra: number; dias: number; faltas: number; diasDatas: Set<string>; datasComFalta: Set<string>; sabsDomTrab: number }> = {}
    // mapa de horas por dia (para autônomo excluir dias com produção)
    const mapaHorasPorDia: Record<string, Record<string, { norm: number; extra: number }>> = {}
    ;(pontosRaw ?? []).forEach((p: any) => {
      if (!mapaHoras[p.lancamento_id]) mapaHoras[p.lancamento_id] = { norm: 0, extra: 0, dias: 0, faltas: 0, diasDatas: new Set(), datasComFalta: new Set(), sabsDomTrab: 0 }
      mapaHoras[p.lancamento_id].norm   += (p.horas_trabalhadas ?? 0)
      mapaHoras[p.lancamento_id].extra  += (p.horas_extras ?? 0)
      mapaHoras[p.lancamento_id].dias   += 1
      if (p.falta) {
        mapaHoras[p.lancamento_id].faltas += 1
        if (p.data) mapaHoras[p.lancamento_id].datasComFalta.add(p.data)
      }
      if (p.data) {
        mapaHoras[p.lancamento_id].diasDatas.add(p.data)
        if (!mapaHorasPorDia[p.lancamento_id]) mapaHorasPorDia[p.lancamento_id] = {}
        mapaHorasPorDia[p.lancamento_id][p.data] = { norm: p.horas_trabalhadas ?? 0, extra: p.horas_extras ?? 0 }
        // Conta sábados e domingos efetivamente trabalhados (horas > 0 e não é falta)
        const dow = new Date(p.data + 'T12:00:00').getDay()
        const ehSabDom = dow === 0 || dow === 6
        const temHoras = (p.horas_trabalhadas ?? 0) > 0 || (p.horas_extras ?? 0) > 0
        if (ehSabDom && temHoras && !p.falta) {
          mapaHoras[p.lancamento_id].sabsDomTrab = (mapaHoras[p.lancamento_id].sabsDomTrab ?? 0) + 1
        }
      }
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

    const lista: LancItem[] = lancsRaw.map((l: any) => {
      const colab = l.colaboradores
      const tipo  = colab?.tipo_contrato ?? 'clt'
      const horasAgg = mapaHoras[l.id] ?? { norm: 0, extra: 0, dias: 0, faltas: 0, diasDatas: new Set(), datasComFalta: new Set(), sabsDomTrab: 0 }

      // Segurança: ignorar lançamento se inicio for antes da admissão do colaborador
      if (colab?.data_admissao && l.data_inicio < colab.data_admissao) {
        return null   // será filtrado abaixo
      }

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
          valor_vt_bruto: (l.snap_vt_diario ?? 0) * Math.max(0, horasAgg.dias - (l.snap_faltas ?? 0)),
          vt_desconto_faltas: (l.snap_vt_diario ?? 0) * (l.snap_faltas ?? 0),
          vt_adicional_sabdom: 0,   // snap não guarda, exibe 0
          vt_sabs_dom_trab:   (horasAgg as any).sabsDomTrab ?? 0,
          obra_considera_sabado: !!(l.obras?.considera_sabado_util ?? false),
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
          snap_considera_sabado_util: l.snap_considera_sabado_util ?? null,
        } as LancItem
      }
      // ══ FIM TRAVA — abaixo: cálculo ao vivo apenas para em_fechamento ══════

      // ✅ Prioridade: snapshot do Ponto (valor_hora_snapshot) → snapshot do Fechamento (snap_valor_hora) → ao vivo (funcao_valores)
      const vh = (l.valor_hora_snapshot ?? l.snap_valor_hora ?? getVH(colab?.funcao_id ?? null, tipo)) as number
      const valorProd  = mapaProd[l.id] ?? 0

      let valorTotal = 0
      let dsr = 0
      let premio = 0
      let valorHoras = 0

      if (tipo === 'clt') {
        // CLT: horas totais (não exclui dias de produção)
        valorHoras = horasAgg.norm * vh + horasAgg.extra * vh * 1.5
        // DSR com regra de perda por falta semanal
        const datasComFaltaLanc = (horasAgg as any).datasComFalta ?? new Set<string>()
        const dsrRes = calcDSRComFaltas(valorHoras, l.data_inicio, l.data_fim, datasComFaltaLanc)
        dsr = dsrRes.dsr
        const salario = valorHoras + dsr
        // ═ REGRA PRODUÇÃO CLT ═
        // Se prod > salário → paga salário + bônus (diferença); senão paga só salário
        premio = valorProd > salario ? valorProd - salario : 0
        valorTotal = salario + premio
      } else {
        // ═ REGRA PRODUÇÃO AUTÔNOMO/PJ (IGUAL AO PONTO.TSX) ═
        // Dias COM produção → paga só a produção desses dias (não soma horas)
        // Dias SEM produção → paga as horas normalmente
        const diasComProdLanc = mapaProdDias[l.id] ?? new Set<string>()
        const horasPorDia = mapaHorasPorDia[l.id] ?? {}
        // Somar horas apenas dos dias SEM produção
        let normSemProd = 0, extraSemProd = 0
        Object.entries(horasPorDia).forEach(([data, h]) => {
          if (!diasComProdLanc.has(data)) {
            normSemProd  += h.norm
            extraSemProd += h.extra
          }
        })
        valorHoras = normSemProd * vh + extraSemProd * vh * 1.5
        // Total = horas (dias sem prod) + produção
        valorTotal = valorHoras + valorProd
      }

      // ── Adiantamento: desconto de adiantamentos pagos não descontados ─────
      const descontoAdiant = mapaAdiant[l.colaborador_id] ?? 0

      // ── VT: cálculo por dias reais trabalhados ─────────────────────────────
      // Regra:
      //   - considera_sabado_util = TRUE  → sábado já incluso no VT mensal, não conta como extra
      //   - considera_sabado_util = FALSE → sábado/domingo trabalhados DEVEM ter VT pago
      // VT diário = vt_dados (trechos ida+volta ou gasolina)
      // Dias base = dias trabalhados no período (faltas descontadas)
      // Sáb/Dom trabalhados quando !considera_sabado_util → adicionados ao total de dias VT
      const faltas      = (horasAgg as any).faltas ?? 0
      const sabsDomTrab = (horasAgg as any).sabsDomTrab ?? 0

      // Dados VT do colaborador
      // temVT: verdadeiro se vale_transporte=true OU se vt_dados tem trechos/gasolina configurados
      const vtDados   = colab?.vt_dados as any
      function calcVtDia(vd: any): number {
        if (!vd) return 0
        if (vd.modalidade === 'gasolina') return parseFloat(String(vd.gasolina_valor_dia)) || 0
        const ida   = (vd.trechos_ida   ?? []).reduce((s: number, t: any) => s + (parseFloat(String(t.valor)) || 0), 0)
        const volta = (vd.trechos_volta ?? []).reduce((s: number, t: any) => s + (parseFloat(String(t.valor)) || 0), 0)
        return ida + volta
      }
      const vtDiaValor = calcVtDia(vtDados)
      // Considera VT se: flag vale_transporte=true OU se vt_dados retorna valor >0
      const temVT = !!(colab?.vale_transporte) || vtDiaValor > 0
      const vtDiario = temVT ? vtDiaValor : 0

      // ── Regra considera_sabado_util ─────────────────────────────────────────
      // ⚠️  REGRA IMUTÁVEL: ao entrar em fechamento, o flag da obra é congelado
      //     via snap_considera_sabado_util. Mudanças posteriores na obra NÃO
      //     alteram lançamentos já em fechamento.
      //     Fallback para lançamentos antigos sem snapshot (usa valor atual da obra).
      // TRUE  → sábado é dia útil normal, já está na base do VT mensal
      //         sáb trabalhado NÃO gera adicional de VT
      // FALSE → sábado/domingo são dias extras fora da escala normal
      //         sáb/dom trabalhados GERAM adicional de VT (passagem não estava prevista)
      const obraConsideraSab = l.snap_considera_sabado_util !== null && l.snap_considera_sabado_util !== undefined
        ? !!l.snap_considera_sabado_util               // ← snapshot congelado (imutável)
        : !!(l.obras?.considera_sabado_util ?? false)  // ← fallback para lançamentos antigos

      // Dias normais trabalhados (Mon-Fri, ou Mon-Sat se considera sab útil) sem sáb/dom extras
      // horasAgg.dias = todos os dias com registro (incluindo sáb/dom registrados)
      // sabsDomTrab = sáb/dom com presença (horas > 0, sem falta)
      // diasNormais = dias da semana útil (excluindo sáb/dom para obras que não consideram sáb útil)
      const diasNormais = obraConsideraSab
        ? horasAgg.dias                                // sáb já é normal → todos contam
        : Math.max(0, horasAgg.dias - sabsDomTrab)     // exclui sáb/dom da base

      // Desconto por falta: cada falta = -1 dia de VT
      const vtDescontoFaltas = vtDiario * faltas

      // Adicional por sáb/dom trabalhados: só quando a obra NÃO considera sáb como útil
      // Nesses casos o colaborador foi além da escala e merece VT do transporte extra
      const vtAdicionalSabDom = obraConsideraSab ? 0 : (vtDiario * sabsDomTrab)

      // VT bruto = (dias normais - faltas) × VT/dia + adicional sáb/dom
      // Equivale a: (horasAgg.dias - faltas) × vtDiario (fórmula simplificada)
      const vtBruto = Math.max(0,
        (diasNormais - faltas) * vtDiario + vtAdicionalSabDom
      )

      // ── Base de desconto: CLT = horas+DSR / Autônomo = total recebido ───────
      const baseDesconto = tipo === 'clt' ? (valorHoras + dsr) : valorTotal

      // 6% do salário bruto (baseDesconto) — aplicado somente se descontar_6pct=true no VT do mês
      const descontoVT6pct = setDescontoVT6.has(l.colaborador_id) ? Math.min(baseDesconto * 0.06, vtBruto) : 0
      const descontoVT     = vtDescontoFaltas + descontoVT6pct
      const inss = tipo === 'clt'
        ? calcINSS(baseDesconto, tabelaInss.length ? tabelaInss : undefined)
        : 0   // autônomo não tem INSS retido (é MEI/PJ/autônomo)
      const ir = tipo === 'clt'
        ? calcIR(baseDesconto, inss, tabelaIR.length ? tabelaIR : undefined)
        : 0

      // VT NÃO integra o salário líquido — é pago via cartão/benefício separado.
      // Apenas os AJUSTES impactam o pagamento em conta:
      //   − VT Falta  → colaborador perde o VT do dia ausente (desconta do líquido)
      //   + Sáb/Dom   → colaborador trabalhou dia extra, empresa repassa o VT (soma ao líquido)
      //   − VT 6%     → desconto legal CLT de 6% do salário (desconta do líquido)
      const liquido = valorTotal
        - vtDescontoFaltas      // − dias de falta × VT/dia
        + vtAdicionalSabDom     // + sáb/dom trabalhados × VT/dia (só obras sem sáb útil)
        - descontoVT6pct        // − 6% salário bruto (CLT, se aplicável)
        - inss
        - ir
        - descontoAdiant

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
        valor_vt_bruto: vtBruto,
        vt_desconto_faltas: vtDescontoFaltas,
        vt_adicional_sabdom: vtAdicionalSabDom,
        vt_sabs_dom_trab: sabsDomTrab,
        obra_considera_sabado: obraConsideraSab,
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
    setLancamentos(lista.filter(Boolean) as LancItem[])

    // ── Pré-carregar adiantamentos disponíveis para desconto (-AD) por colaborador ──
    // Busca adiantamentos pendentes/aprovados ainda não quitados para os colaboradores do mês
    if (colabIds.length > 0) {
      const { data: adDisp } = await supabase
        .from('adiantamentos')
        .select('id,colaborador_id,valor,desconto_tipo,desconto_parcelas,desconto_parcela_atual,desconto_obs,desconto_a_partir')
        .in('status', ['aprovado', 'pendente', 'pago'])
        .is('descontado_em', null)
        .or(`desconto_a_partir.is.null,desconto_a_partir.lte.${mr}`)
        .in('colaborador_id', colabIds)
      // Mapear lancamento_id → lista de AD (usando colaborador_id como chave)
      const mapaAD: Record<string, typeof adDisp> = {}
      ;(adDisp ?? []).forEach((a: any) => {
        if (!mapaAD[a.colaborador_id]) mapaAD[a.colaborador_id] = []
        mapaAD[a.colaborador_id]!.push(a)
      })
      // Converter: lançamento id → lista de AD do colaborador daquele lançamento
      const adPorLancMap: Record<string, any[]> = {}
      ;(lista.filter(Boolean) as LancItem[]).forEach(l => {
        if (mapaAD[l.colaborador_id]) adPorLancMap[l.id] = mapaAD[l.colaborador_id]!
      })
      setAdPorLanc(adPorLancMap)
    } else {
      setAdPorLanc({})
    }

    setLoading(false)
    lastFetchAt.current = Date.now()   // registra quando os dados foram carregados
  }, [])

  // Carregar tabelas de encargos uma vez
  useEffect(() => {
    fetchTabelasEncargos(supabase).then(({ tabelaInss: ti, tabelaIR: tir }) => {
      setTabelaInss(ti); setTabelaIR(tir)
    })
  }, [])

  // mesRefDebounced dispara o fetch — evita múltiplas queries ao girar seletor de mês
  useEffect(() => { fetchLancamentos(mesRefDebounced) }, [mesRefDebounced, fetchLancamentos])
  useRefreshOnFocus(() => fetchLancamentos(mesRef))

  // ── Troca de aba: refetch se dados tiverem mais de CACHE_TTL_MS ────────
  function mudarAba(novaAba: typeof abaFechamento) {
    setAbaFechamento(novaAba)
    const agora = Date.now()
    if (agora - lastFetchAt.current > CACHE_TTL_MS) {
      fetchLancamentos(mesRef)
    }
  }

  // ── Contadores para as abas ─────────────────────────────────────────────
  const contAbas = useMemo(() => ({
    fechamento:  lancamentos.filter(l => ['em_fechamento','rascunho','aguardando_aprovacao'].includes(l.status)).length,
    pendente:    lancamentos.filter(l => l.status === 'aguardando_aprovacao').length,
    aprovado:    lancamentos.filter(l => l.status === 'aprovado').length,       // aguardando liberação
    liberado:    lancamentos.filter(l => l.status === 'liberado').length,       // liberado p/ pagamento
    pago:        lancamentos.filter(l => l.status === 'pago').length,           // já pago
    recusado:    lancamentos.filter(l => l.status === 'recusado').length,
  }), [lancamentos])

  // ── Agrupamento por colaborador ───────────────────────────────────────────
  const porColaborador = useMemo(() => {
    const q = busca.toLowerCase()
    // Filtro por aba
    const statusAba: string[] = abaFechamento === 'fechamento'
      ? ['em_fechamento', 'rascunho', 'aguardando_aprovacao']
      : abaFechamento === 'pendente'
        ? ['aguardando_aprovacao']
        : abaFechamento === 'aprovado'
          ? ['aprovado']
          : abaFechamento === 'liberado'
            ? ['liberado']
            : abaFechamento === 'pago'
              ? ['pago']
              : ['recusado']
    const filtrados = lancamentos.filter(l =>
      statusAba.includes(l.status) &&
      (!q || l.colaborador_nome.toLowerCase().includes(q) ||
        (l.colaborador_chapa ?? '').toLowerCase().includes(q) ||
        l.obra_nome.toLowerCase().includes(q)) &&
      (filtroObraFech === 'todos' || l.obra_id === filtroObraFech) &&
      (filtroFuncaoFech === 'todos' || l.funcao_id === filtroFuncaoFech)
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
  }, [lancamentos, busca, abaFechamento, filtroObraFech, filtroFuncaoFech])

  const totalGeral  = useMemo(() => lancamentos.reduce((s, l) => s + l.valor_total, 0), [lancamentos])
  const pendentes    = lancamentos.filter(l => ['em_fechamento','aguardando_aprovacao','aprovado','liberado','rascunho'].includes(l.status))
  const pagos        = lancamentos.filter(l => l.status === 'pago')

  // ── Abrir espelho de ponto de um lançamento ──────────────────────────────
  async function abrirEspelho(lanc: LancItem) {
    setModalEspelhoLancId(lanc.id)

    // Se já carregou, reusar
    if (espelhoPorLanc[lanc.id]) return

    setLoadingEspelho(true)

    const [{ data: pontosRaw }, { data: prodRaw }, { data: atestadosRaw }] = await Promise.all([
      supabase.from('registro_ponto')
        .select('data,horas_trabalhadas,horas_extras,falta,observacoes')
        .eq('lancamento_id', lanc.id)
        .order('data'),
      supabase.from('ponto_producao')
        .select('dias,valor_total')
        .eq('lancamento_id', lanc.id),
      supabase.from('ponto_lancamentos')
        .select('com_afastamento,dias_afastamento,observacoes_atestado')
        .eq('id', lanc.id)
        .single(),
    ])

    // Mapa data → produção proporcional
    const mapaProdDia: Record<string, number> = {}
    let totalProdDias = 0
    ;(prodRaw ?? []).forEach((p: any) => {
      (p.dias ?? []).forEach((d: string) => {
        mapaProdDia[d] = (mapaProdDia[d] ?? 0)
        totalProdDias++
      })
    })
    // Valor de produção por dia = total ÷ nº de dias com prod
    ;(prodRaw ?? []).forEach((p: any) => {
      const nDias = (p.dias ?? []).length
      if (nDias === 0) return
      const porDia = p.valor_total / nDias
      ;(p.dias ?? []).forEach((d: string) => {
        mapaProdDia[d] = (mapaProdDia[d] ?? 0) + porDia
      })
    })

    // Expandir range de datas do lançamento
    const dias: DiaPonto[] = []
    const cur = new Date(lanc.data_inicio + 'T12:00:00')
    const fim = new Date(lanc.data_fim   + 'T12:00:00')

    while (cur <= fim) {
      const dataStr = cur.toISOString().slice(0, 10)
      const dow = cur.getDay()
      const ehDomingo = dow === 0
      const ponto = (pontosRaw ?? []).find((p: any) => p.data === dataStr)
      dias.push({
        data: dataStr,
        horas_normais: ponto?.horas_trabalhadas ?? 0,
        horas_extras:  ponto?.horas_extras ?? 0,
        falta:         ponto?.falta ?? false,
        producao:      mapaProdDia[dataStr] ?? 0,
        domingo:       ehDomingo,
        obs:           ponto?.observacoes ?? undefined,
      })
      cur.setDate(cur.getDate() + 1)
    }

    setEspelhoPorLanc(prev => ({ ...prev, [lanc.id]: dias }))
    setLoadingEspelho(false)
  }

  // ── Aprovar → abre popup de confirmação com resumo ──────────────────────
  async function abrirModalLiberar(id: string) {
    const lanc = lancamentos.find(l => l.id === id)
    if (!lanc) return
    const { data: adData } = await supabase
      .from('adiantamentos')
      .select('id,valor,desconto_tipo,desconto_parcelas,desconto_parcela_atual,desconto_obs,desconto_a_partir')
      .eq('colaborador_id', lanc.colaborador_id)
      .in('status', ['aprovado', 'pendente', 'pago'])
      .is('descontado_em', null)
      .or(`desconto_a_partir.is.null,desconto_a_partir.lte.${mesRef}`)
    const lista = (adData ?? []) as any[]
    setAdiantsDisponiveis(lista)
    // Por padrão, todos os ADs já vêm marcados para descontar
    setAdSelecionados(new Set(lista.map((a: any) => a.id)))
    setModalLiberar(lanc)
  }

  // ── Confirmar: aprovar + liberar direto (em_fechamento → liberado) ────────
  async function confirmarLiberar() {
    const lanc = modalLiberar
    if (!lanc) return
    setSaving(true)

    // Calcular desconto -AD: soma apenas os ADs marcados com checkbox no modal
    const adSelecionadosList = adiantsDisponiveis.filter(a => adSelecionados.has(a.id))
    const descontoAD = adSelecionadosList.reduce((s, a) => {
      const p = a.desconto_parcelas ?? 1
      return s + (p > 1 ? a.valor / p : a.valor)
    }, 0)

    // Líquido = bruto − VT Falta + Sáb/Dom − VT 6% − INSS − IR − AD selecionados
    // (VT base é pago via cartão separado, não entra no salário)
    const liquidoFinal = lanc.valor_total
      - (lanc.vt_desconto_faltas ?? 0)
      + (lanc.vt_adicional_sabdom ?? 0)
      - (lanc.desconto_vt_6pct ?? 0)
      - lanc.inss
      - lanc.ir
      - descontoAD

    const { error } = await supabase.from('ponto_lancamentos').update({
      status:               'liberado',
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
      snap_desconto_adiant: descontoAD,
      snap_inss:            lanc.inss,
      snap_ir:              lanc.ir,
      snap_liquido:         liquidoFinal,
      snap_fechado_em:      new Date().toISOString(),
      snap_fechado_por:     user?.email ?? 'sistema',
    }).eq('id', lanc.id)

    if (error) { setSaving(false); toast.error('Erro ao liberar: ' + error.message); return }

    // Marcar cada AD selecionado como descontado (parcela ou quitado)
    for (const a of adSelecionadosList) {
      const parcelas     = a.desconto_parcelas ?? 1
      const feitas       = (a.desconto_parcela_atual ?? 0) + 1
      const totalQuitado = feitas >= parcelas
      await supabase.from('adiantamentos').update({
        status:                 totalQuitado ? 'pago' : (a as any).status ?? 'aprovado',
        desconto_parcela_atual: feitas,
        descontado_em:          totalQuitado ? mesRef : null,
      }).eq('id', a.id)
    }

    setSaving(false)
    toast.success('✅ Aprovado e liberado para pagamento!')
    setModalLiberar(null)
    setAdiantsDisponiveis([])
    setAdSelecionados(new Set())
    fetchLancamentos(mesRef)
  }

  // ── Liberar para pagamento (aprovado → liberado) — legado p/ status 'aprovado' existente ──
  async function liberarParaPagamento(id: string) {
    const lanc = lancamentos.find(l => l.id === id)
    if (lanc) { setModalLiberar(lanc); return }
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
    em_fechamento:        { bg: '#dbeafe', color: '#1d4ed8', label: '🔒 Em Fechamento' },
    aguardando_aprovacao: { bg: '#fef3c7', color: '#b45309', label: '⏳ Ag. Aprovação' },
    aprovado:             { bg: '#dcfce7', color: '#15803d', label: '✅ Aprovado' },
    liberado:             { bg: '#fef3c7', color: '#b45309', label: '💜 Ag. Pagamento' },
    pago:                 { bg: '#ede9fe', color: '#6d28d9', label: '💰 Pago' },
    rascunho:             { bg: '#f1f5f9', color: '#475569', label: '↩ Devolvido p/ Edição' },
    recusado:             { bg: '#fee2e2', color: '#dc2626', label: '❌ Recusado' },
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
        <select value={filtroObraFech} onChange={e=>setFiltroObraFech(e.target.value)}
          className="h-9 px-3 text-sm border border-input rounded-md bg-background text-foreground min-w-40">
          <option value="todos">Todas as obras</option>
          {obras.map(o => <option key={o.id} value={o.id}>{o.nome}</option>)}
        </select>
        <select value={filtroFuncaoFech} onChange={e=>setFiltroFuncaoFech(e.target.value)}
          className="h-9 px-3 text-sm border border-input rounded-md bg-background text-foreground min-w-40">
          <option value="todos">Todas as funções</option>
          {funcoes.map(f => <option key={f.id} value={f.id}>{f.nome}</option>)}
        </select>
        {(filtroObraFech!=='todos'||filtroFuncaoFech!=='todos') && (
          <button onClick={()=>{setFiltroObraFech('todos');setFiltroFuncaoFech('todos')}}
            className="h-9 px-3 text-sm border border-input rounded-md bg-background text-muted-foreground hover:bg-muted">
            ✕ Limpar
          </button>
        )}
      </div>

      {/* ── Abas de status ── */}
      <div style={{ display: 'flex', gap: 0, marginBottom: 20, borderBottom: '2px solid var(--border)', flexWrap: 'wrap' }}>
        {([
          { key: 'fechamento',  label: '🔒 Pendentes / Em Fechamento',  cnt: contAbas.fechamento,  cor: '#1d4ed8' },
          { key: 'pendente',    label: '⏳ Ag. Aprovação',           cnt: contAbas.pendente,    cor: '#b45309' },
          { key: 'aprovado',    label: '✅ Aprovado',                cnt: contAbas.aprovado,    cor: '#059669' },
          { key: 'liberado',    label: '💜 Liberado p/ Pagamento',   cnt: contAbas.liberado,    cor: '#7c3aed' },
          { key: 'pago',        label: '💳 Pago',                    cnt: contAbas.pago,        cor: '#1d4ed8' },
          { key: 'recusado',    label: '❌ Recusado',                cnt: contAbas.recusado,    cor: '#dc2626' },
        ] as const).map(ab => {
          const ativo = abaFechamento === ab.key
          return (
            <button
              key={ab.key}
              onClick={() => mudarAba(ab.key)}
              style={{
                padding: '10px 18px',
                border: 'none',
                borderBottom: ativo ? `3px solid ${ab.cor}` : '3px solid transparent',
                background: ativo ? `${ab.cor}10` : 'transparent',
                color: ativo ? ab.cor : 'var(--muted-foreground)',
                fontWeight: ativo ? 700 : 500,
                fontSize: 13,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: 6,
                transition: 'all 0.15s',
                marginBottom: -2,
              }}
            >
              {ab.label}
              {ab.cnt > 0 && (
                <span style={{
                  background: ativo ? ab.cor : '#9ca3af',
                  color: '#fff',
                  borderRadius: 9,
                  padding: '1px 7px',
                  fontSize: 11,
                  fontWeight: 700,
                }}>
                  {ab.cnt}
                </span>
              )}
            </button>
          )
        })}
      </div>

      {/* ── Cards de resumo ── */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-5">
        <SummaryCard
          sigla="COL"
          label="Colaboradores"
          value={String(porColaborador.length)}
          sub="no período"
          color="#1e40af"
          bg="#1e40af"
        />
        <SummaryCard
          sigla="AG"
          label="Ag. Pagamento"
          value={String(pendentes.length)}
          sub="lançamentos"
          color="#b45309"
          bg="#b45309"
        />
        <SummaryCard
          sigla="PG"
          label="Pagos"
          value={String(pagos.length)}
          sub="lançamentos"
          color="#15803d"
          bg="#15803d"
        />
        <SummaryCard
          sigla="TOT"
          label="Total Geral"
          value={formatCurrency(totalGeral)}
          color="#7c3aed"
          bg="#7c3aed"
        />
      </div>

      {/* ── Lista por colaborador ── */}
      {loading ? <LoadingSkeleton /> : porColaborador.length === 0 ? (
        <EmptyState
          icon={<CheckCircle2 size={32} />}
          title={
            abaFechamento === 'fechamento' ? `Nenhum lançamento em fechamento em ${MESES[mes - 1]} / ${ano}` :
            abaFechamento === 'pendente'   ? `Nenhum lançamento pendente de aprovação em ${MESES[mes - 1]} / ${ano}` :
            abaFechamento === 'aprovado'   ? `Nenhum lançamento aprovado/liberado em ${MESES[mes - 1]} / ${ano}` :
                                            `Nenhum lançamento recusado em ${MESES[mes - 1]} / ${ano}`
          }
          description={
            abaFechamento === 'fechamento' ? 'Lançamentos enviados para fechamento aparecerão aqui.' :
            abaFechamento === 'pendente'   ? 'Lançamentos aguardando aprovação aparecerão aqui.' :
            abaFechamento === 'aprovado'   ? 'Lançamentos aprovados e liberados para pagamento aparecerão aqui.' :
                                            'Lançamentos recusados aparecerão aqui.'
          }
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
                        <TableHead className="text-right" style={{ fontSize: 11, color: '#dc2626', whiteSpace: 'nowrap' }}>−VT Falta</TableHead>
                        <TableHead className="text-right" style={{ fontSize: 11, color: '#0369a1', whiteSpace: 'nowrap' }}>+Sáb/Dom</TableHead>
                        <TableHead className="text-right" style={{ fontSize: 11, color: '#b45309', whiteSpace: 'nowrap' }}>−VT 6%</TableHead>
                        <TableHead className="text-right" style={{ fontSize: 11, color: '#dc2626' }}>− INSS</TableHead>
                        <TableHead className="text-right" style={{ fontSize: 11, color: '#dc2626' }}>− IR</TableHead>
                        <TableHead className="text-right" style={{ fontSize: 11, color: '#b45309', fontWeight: 700 }}>💳 -AD</TableHead>
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
                          <React.Fragment key={lanc.id}>
                          <TableRow>
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
                                      <span>🎯 Bônus: <span style={{ color: '#15803d', fontWeight: 600 }}>{formatCurrency(lanc.valor_premio)}</span></span></>
                                    )}
                                    {lanc.valor_producao > 0 && lanc.valor_premio === 0 && (
                                      <><span style={{ color: '#9ca3af' }}> · </span>
                                      <span style={{ color: '#9ca3af', fontSize: 9 }}>Prod {formatCurrency(lanc.valor_producao)} &lt; sal. (desconsiderada)</span></>
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
                                  {/* Linha 2: composição — dias s/prod → horas; dias c/prod → só produção */}
                                  <div style={{ display: 'flex', alignItems: 'center', gap: 3, flexWrap: 'wrap', color: '#6b7280' }}>
                                    {lanc.valor_horas > 0 && (
                                      <span>Horas <span style={{fontSize:9,color:'#9ca3af'}}>(dias s/prod)</span>: <span style={{ color: '#1d4ed8', fontWeight: 600 }}>{formatCurrency(lanc.valor_horas)}</span></span>
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
                            {/* ══ −VT Falta ══ */}
                            <TableCell className="text-right" style={{ fontSize: 12 }}>
                              {lanc.vt_desconto_faltas > 0
                                ? (
                                  <span
                                    style={{ color: '#dc2626', fontWeight: 600, cursor: 'help' }}
                                    title={`${lanc.faltas} falta${lanc.faltas !== 1 ? 's' : ''} × R$ ${lanc.valor_vt_dia.toFixed(2)}/dia = −R$ ${lanc.vt_desconto_faltas.toFixed(2)}`}
                                  >
                                    −{formatCurrency(lanc.vt_desconto_faltas)}
                                    <div style={{ fontSize: 9, color: '#fca5a5', fontWeight: 400 }}>
                                      {lanc.faltas} falta{lanc.faltas !== 1 ? 's' : ''}
                                    </div>
                                  </span>
                                )
                                : <span style={{ color: 'var(--muted-foreground)' }}>—</span>}
                            </TableCell>

                            {/* ══ +Sáb/Dom ══ só aparece quando obra NÃO considera sáb útil e houve presença */}
                            <TableCell className="text-right" style={{ fontSize: 12 }}>
                              {lanc.vt_adicional_sabdom > 0
                                ? (
                                  <span
                                    style={{ color: '#0369a1', fontWeight: 600, cursor: 'help' }}
                                    title={`Obra não considera sáb útil\n${lanc.vt_sabs_dom_trab} sáb/dom trabalhado${lanc.vt_sabs_dom_trab !== 1 ? 's' : ''} × R$ ${lanc.valor_vt_dia.toFixed(2)}/dia = +R$ ${lanc.vt_adicional_sabdom.toFixed(2)}`}
                                  >
                                    +{formatCurrency(lanc.vt_adicional_sabdom)}
                                    <div style={{ fontSize: 9, color: '#93c5fd', fontWeight: 400 }}>
                                      {lanc.vt_sabs_dom_trab} sáb/dom
                                    </div>
                                  </span>
                                )
                                : (
                                  <span style={{ color: 'var(--muted-foreground)', fontSize: 11 }}
                                    title={lanc.obra_considera_sabado ? 'Sáb é dia útil nesta obra' : 'Nenhum sáb/dom trabalhado'}>
                                    —
                                  </span>
                                )}
                            </TableCell>

                            {/* ══ −VT 6% (CLT) ══ */}
                            <TableCell className="text-right" style={{ fontSize: 12 }}>
                              {(lanc.desconto_vt_6pct ?? 0) > 0
                                ? (
                                  <span
                                    style={{ color: '#b45309', fontWeight: 600, cursor: 'help' }}
                                    title={`Desconto 6% do salário bruto (CLT)\nBase: R$ ${(lanc.valor_horas + lanc.valor_dsr).toFixed(2)}\n6% = R$ ${lanc.desconto_vt_6pct.toFixed(2)}`}
                                  >
                                    −{formatCurrency(lanc.desconto_vt_6pct)}
                                    <div style={{ fontSize: 9, color: '#fbbf24', fontWeight: 400 }}>
                                      6% CLT
                                    </div>
                                  </span>
                                )
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
                            {/* ════ Coluna -AD ════ */}
                            <TableCell className="text-right">
                              {(() => {
                                const adsLanc = adPorLanc[lanc.id] ?? []
                                const valorAD = adsLanc.reduce((s, a) => {
                                  const p = a.desconto_parcelas ?? 1
                                  return s + (p > 1 ? a.valor / p : a.valor)
                                }, 0)
                                const aplicado = (lanc.snap_desconto_adiant ?? lanc.desconto_adiant ?? 0) > 0
                                if (aplicado) {
                                  return (
                                    <span style={{ fontSize:12, color:'#b45309', fontWeight:800 }}>
                                      −{formatCurrency(lanc.snap_desconto_adiant ?? lanc.desconto_adiant)}
                                      <div style={{ fontSize:9, color:'#92400e' }}>✅ aplicado</div>
                                    </span>
                                  )
                                }
                                if (adsLanc.length === 0) return <span style={{ color:'var(--muted-foreground)', fontSize:12 }}>—</span>
                                return (
                                  <span style={{ fontSize:11, color:'#b45309', fontWeight:800 }}>
                                    −{formatCurrency(valorAD)}
                                    <div style={{ fontSize:9, color:'#b45309', opacity:.7 }}>⚠️ pendente</div>
                                  </span>
                                )
                              })()}
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
                              <div style={{ display: 'flex', gap: 4, justifyContent: 'flex-end', flexWrap: 'wrap' }}>
                                {/* Botão Ver Ponto — sempre visível */}
                                <Button size="sm" variant="outline"
                                  style={{ height: 26, fontSize: 11, borderColor: '#1d4ed8', color: '#1d4ed8', gap: 4 }}
                                  onClick={() => abrirEspelho(lanc)}>
                                  <Eye size={11} /> Ver Ponto
                                </Button>
                                {lanc.status === 'em_fechamento' && (
                                  <>
                                    <Button size="sm" style={{ height: 26, fontSize: 11, background: '#15803d', color: '#fff' }}
                                      disabled={saving}
                                      onClick={() => abrirModalLiberar(lanc.id)}>
                                      ✅ Aprovar e Liberar
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
                                      💜 Ver Resumo
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

                          {/* ════════════════════════════════════════════════
                               BANNER -AD
                               Aparece sempre que há AD vinculado ao colaborador
                               — pendente (amarelo): oferece escolha descontar/pular
                               — aplicado (verde):   confirma e oferece desfazer
                          ════════════════════════════════════════════════ */}
                          {(() => {
                            const adsLanc   = adPorLanc[lanc.id] ?? []
                            const adAplicado = (lanc.snap_desconto_adiant ?? lanc.desconto_adiant ?? 0)
                            const jaAplicado = adAplicado > 0
                            const emFech    = lanc.status === 'em_fechamento'
                            const verDet    = verADLancId === lanc.id

                            // Sem nenhum AD — não mostra banner
                            if (adsLanc.length === 0 && !jaAplicado) return null

                            const valorAD = adsLanc.reduce((s, a) => {
                              const p = a.desconto_parcelas ?? 1
                              return s + (p > 1 ? a.valor / p : a.valor)
                            }, 0)

                            // ── BANNER VERDE: já aplicado ─────────────────
                            if (jaAplicado) {
                              return (
                                <TableRow style={{ background: 'transparent' }}>
                                  <TableCell colSpan={13} style={{ padding: '0 8px 10px 8px', border: 0 }}>
                                    <div style={{
                                      borderRadius: 10,
                                      border: '2px solid #16a34a',
                                      background: 'linear-gradient(135deg, #f0fdf4 0%, #dcfce7 100%)',
                                      padding: '12px 16px',
                                      display: 'flex',
                                      alignItems: 'center',
                                      justifyContent: 'space-between',
                                      flexWrap: 'wrap',
                                      gap: 10,
                                      boxShadow: '0 2px 8px rgba(22,163,74,.1)',
                                    }}>
                                      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                                        <span style={{ fontSize: 20 }}>✅</span>
                                        <div>
                                          <div style={{ fontWeight: 800, fontSize: 13, color: '#15803d' }}>
                                            Desconto de adiantamento aplicado — {formatCurrency(adAplicado)}
                                          </div>
                                          <div style={{ fontSize: 12, color: '#16a34a', marginTop: 2 }}>
                                            Descontado do líquido de {colab.nome} neste fechamento
                                          </div>
                                        </div>
                                      </div>
                                      {/* Desfazer — só em fechamento */}
                                      {emFech && (
                                        <button
                                          disabled={saving}
                                          onClick={async () => {
                                            setSaving(true)
                                            // Buscar os ADs que foram descontados neste mês para reverter
                                            const { data: adsDescontados } = await supabase
                                              .from('adiantamentos')
                                              .select('id,desconto_parcela_atual,desconto_parcelas')
                                              .eq('colaborador_id', lanc.colaborador_id)
                                              .or(`descontado_em.eq.${mesRef},and(status.eq.aprovado,desconto_a_partir.lte.${mesRef})`)
                                            for (const a of (adsDescontados ?? [])) {
                                              const feitas = Math.max(0, (a.desconto_parcela_atual ?? 1) - 1)
                                              await supabase.from('adiantamentos').update({
                                                status: 'aprovado',
                                                desconto_parcela_atual: feitas,
                                                descontado_em: null,
                                              }).eq('id', a.id)
                                            }
                                            const novoLiq = (lanc.snap_liquido ?? lanc.liquido) + adAplicado
                                            await supabase.from('ponto_lancamentos').update({
                                              snap_desconto_adiant: 0,
                                              snap_liquido: novoLiq,
                                            }).eq('id', lanc.id)
                                            setSaving(false)
                                            toast.success('↩ Desconto -AD removido')
                                            fetchLancamentos(mesRef)
                                          }}
                                          style={{
                                            height: 34, padding: '0 16px', borderRadius: 7,
                                            border: '1.5px solid #16a34a', background: '#fff',
                                            color: '#15803d', fontWeight: 700, fontSize: 12,
                                            cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6,
                                          }}>
                                          ↩ Desfazer desconto
                                        </button>
                                      )}
                                    </div>
                                  </TableCell>
                                </TableRow>
                              )
                            }

                            // ── AD pendente: não mostra banner amarelo — a escolha fica no modal "Aprovar e Liberar" ────
                            return null
                          })()}
                          </React.Fragment>
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

      {/* ═══ MODAL APROVAR E LIBERAR — resumo de pagamento ═══ */}
      {modalLiberar && (
        <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.55)', zIndex:80,
          display:'flex', alignItems:'center', justifyContent:'center', padding:16 }}>
          <div style={{ background:'var(--background)', borderRadius:16, width:'100%', maxWidth:480,
            boxShadow:'0 24px 80px rgba(0,0,0,0.35)', overflow:'hidden' }}>

            {/* Header */}
            <div style={{ background:'#15803d', padding:'16px 20px', display:'flex', justifyContent:'space-between', alignItems:'center' }}>
              <div>
                <div style={{ color:'#fff', fontWeight:900, fontSize:16 }}>✅ Confirmar Liberação para Pagamento</div>
                <div style={{ color:'#bbf7d0', fontSize:12, marginTop:2 }}>Revise os valores antes de confirmar</div>
              </div>
            </div>

            {/* Identidade */}
            <div style={{ padding:'16px 20px 0' }}>
              <div style={{ background:'#f0fdf4', border:'1px solid #bbf7d0', borderRadius:10, padding:'10px 14px', marginBottom:14 }}>
                <div style={{ fontWeight:900, fontSize:15, color:'#14532d' }}>
                  {modalLiberar.colaborador_nome}
                  {modalLiberar.colaborador_chapa && (
                    <span style={{ fontSize:11, fontWeight:500, color:'#6b7280', marginLeft:8 }}>
                      {modalLiberar.colaborador_chapa}
                    </span>
                  )}
                </div>
                <div style={{ fontSize:12, color:'#374151', marginTop:2 }}>
                  {modalLiberar.funcao_nome} · {modalLiberar.tipo_contrato.toUpperCase()} · {modalLiberar.obra_nome}
                </div>
                <div style={{ fontSize:11, color:'#6b7280', marginTop:2 }}>
                  {modalLiberar.mes_referencia} · {modalLiberar.data_inicio} → {modalLiberar.data_fim}
                </div>
              </div>

              {/* Tabela de valores */}
              <div style={{ display:'flex', flexDirection:'column', gap:0, borderRadius:10, overflow:'hidden', border:'1px solid #e5e7eb' }}>
                {/* Bruto */}
                <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center',
                  padding:'9px 14px', background:'#f9fafb', borderBottom:'1px solid #f3f4f6' }}>
                  <span style={{ fontSize:13, color:'#374151' }}>💰 Total a Receber (bruto)</span>
                  <span style={{ fontSize:13, fontWeight:700, color:'#111' }}>{formatCurrency(modalLiberar.valor_total)}</span>
                </div>
                {/* Faltas — informativo */}
                {modalLiberar.faltas > 0 && (
                  <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center',
                    padding:'7px 14px', background:'#fff7ed', borderBottom:'1px solid #fed7aa' }}>
                    <span style={{ fontSize:12, color:'#92400e' }}>📅 Faltas: {modalLiberar.faltas} dia{modalLiberar.faltas!==1?'s':''}</span>
                    <span style={{ fontSize:11, color:'#92400e' }}>(descontado no bruto)</span>
                  </div>
                )}
                {/* VT — exibir bruto (crédito), desconto faltas, adicional sáb/dom e desconto 6% */}
                {(modalLiberar.valor_vt_bruto > 0 || modalLiberar.vt_desconto_faltas > 0) && (
                  <>
                    {/* VT base */}
                    {(() => {
                      const diasBase = modalLiberar.obra_considera_sabado
                        ? modalLiberar.dias_trabalhados
                        : Math.max(0, modalLiberar.dias_trabalhados - modalLiberar.vt_sabs_dom_trab)
                      const vtBase = diasBase * modalLiberar.valor_vt_dia
                      return (
                        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center',
                          padding:'9px 14px', background:'#f0fdf4', borderBottom:'1px solid #dcfce7' }}>
                          <span style={{ fontSize:13, color:'#374151' }}>
                            🚌 VT base&nbsp;
                            <span style={{ fontSize:11, color:'#6b7280' }}>({diasBase} dia{diasBase !== 1 ? 's' : ''} × R$ {modalLiberar.valor_vt_dia.toFixed(2)})</span>
                          </span>
                          <span style={{ fontSize:13, fontWeight:600, color:'#16a34a' }}>+ {formatCurrency(vtBase)}</span>
                        </div>
                      )
                    })()}

                    {/* desconto faltas */}
                    {(modalLiberar.vt_desconto_faltas ?? 0) > 0 && (
                      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center',
                        padding:'8px 14px', background:'#fff', borderBottom:'1px solid #fee2e2' }}>
                        <span style={{ fontSize:12, color:'#374151' }}>
                          🚌 − VT faltas&nbsp;
                          <span style={{ fontSize:11, color:'#dc2626' }}>({modalLiberar.faltas} falta{modalLiberar.faltas !== 1 ? 's' : ''})</span>
                        </span>
                        <span style={{ fontSize:12, fontWeight:600, color:'#dc2626' }}>− {formatCurrency(modalLiberar.vt_desconto_faltas)}</span>
                      </div>
                    )}

                    {/* adicional sáb/dom */}
                    {(modalLiberar.vt_adicional_sabdom ?? 0) > 0 && (
                      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center',
                        padding:'8px 14px', background:'#eff6ff', borderBottom:'1px solid #bfdbfe' }}>
                        <span style={{ fontSize:12, color:'#374151' }}>
                          🚌 + Sáb/Dom trabalhados&nbsp;
                          <span style={{ fontSize:11, color:'#0369a1' }}>({modalLiberar.vt_sabs_dom_trab} dia{modalLiberar.vt_sabs_dom_trab !== 1 ? 's' : ''})</span>
                        </span>
                        <span style={{ fontSize:12, fontWeight:600, color:'#0369a1' }}>+ {formatCurrency(modalLiberar.vt_adicional_sabdom)}</span>
                      </div>
                    )}

                    {/* VT líquido total */}
                    <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center',
                      padding:'9px 14px', background:'#f0fdf4', borderBottom:'1px solid #dcfce7' }}>
                      <span style={{ fontSize:13, fontWeight:600, color:'#166534' }}>🚌 = VT líquido</span>
                      <span style={{ fontSize:13, fontWeight:700, color:'#16a34a' }}>+ {formatCurrency(modalLiberar.valor_vt_bruto)}</span>
                    </div>

                    {/* desconto 6% colaborador */}
                    {(modalLiberar.desconto_vt_6pct ?? 0) > 0 && (
                      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center',
                        padding:'8px 14px', background:'#fffbeb', borderBottom:'1px solid #fde68a' }}>
                        <span style={{ fontSize:12, color:'#374151' }}>🚌 − Desc. VT 6% (colaborador)</span>
                        <span style={{ fontSize:12, fontWeight:600, color:'#b45309' }}>− {formatCurrency(modalLiberar.desconto_vt_6pct)}</span>
                      </div>
                    )}
                  </>
                )}
                {modalLiberar.inss > 0 && (
                  <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center',
                    padding:'9px 14px', background:'#f9fafb', borderBottom:'1px solid #f3f4f6' }}>
                    <span style={{ fontSize:13, color:'#374151' }}>🏛️ - INSS</span>
                    <span style={{ fontSize:13, fontWeight:600, color:'#dc2626' }}>- {formatCurrency(modalLiberar.inss)}</span>
                  </div>
                )}
                {modalLiberar.ir > 0 && (
                  <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center',
                    padding:'9px 14px', background:'#fff', borderBottom:'1px solid #f3f4f6' }}>
                    <span style={{ fontSize:13, color:'#374151' }}>📋 - IR Retido</span>
                    <span style={{ fontSize:13, fontWeight:600, color:'#dc2626' }}>- {formatCurrency(modalLiberar.ir)}</span>
                  </div>
                )}
                {/* ── BLOCO -AD: desconto de adiantamentos com checkbox por item ── */}
                {adiantsDisponiveis.length > 0 && (() => {
                  const totalADSel = adiantsDisponiveis
                    .filter(a => adSelecionados.has(a.id))
                    .reduce((s, a) => {
                      const p = a.desconto_parcelas ?? 1
                      return s + (p > 1 ? a.valor / p : a.valor)
                    }, 0)
                  return (
                    <div style={{ margin: '0 0 0 0', borderTop: '1px solid #f3f4f6' }}>
                      {/* Header bloco AD */}
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                        padding: '9px 14px', background: '#fffbeb', borderBottom: '1px solid #fde68a' }}>
                        <span style={{ fontSize: 13, fontWeight: 700, color: '#b45309' }}>💳 Adiantamentos a Descontar</span>
                        <span style={{ fontSize: 12, color: '#92400e' }}>
                          {adSelecionados.size}/{adiantsDisponiveis.length} selecionado(s)
                        </span>
                      </div>
                      {/* Um item por AD com checkbox */}
                      {adiantsDisponiveis.map(a => {
                        const parcelas   = a.desconto_parcelas ?? 1
                        const feitas     = a.desconto_parcela_atual ?? 0
                        const valParcela = parcelas > 1 ? a.valor / parcelas : a.valor
                        const marcado    = adSelecionados.has(a.id)
                        return (
                          <div key={a.id}
                            onClick={() => {
                              setAdSelecionados(prev => {
                                const next = new Set(prev)
                                marcado ? next.delete(a.id) : next.add(a.id)
                                return next
                              })
                            }}
                            style={{ padding: '10px 14px', background: marcado ? '#f0fdf4' : '#fff',
                              borderBottom: '1px solid #f3f4f6', cursor: 'pointer',
                              display: 'flex', alignItems: 'center', gap: 12,
                              transition: 'background 0.15s' }}>
                            {/* Checkbox visual */}
                            <div style={{ width: 20, height: 20, borderRadius: 5, flexShrink: 0,
                              border: `2px solid ${marcado ? '#16a34a' : '#d1d5db'}`,
                              background: marcado ? '#16a34a' : '#fff',
                              display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                              {marcado && <span style={{ color: '#fff', fontSize: 12, fontWeight: 900 }}>✓</span>}
                            </div>
                            {/* Info do AD */}
                            <div style={{ flex: 1 }}>
                              <div style={{ fontSize: 12, fontWeight: 700, color: '#374151' }}>
                                {parcelas > 1
                                  ? `Parcela ${feitas + 1}/${parcelas}`
                                  : 'Desconto único'}
                              </div>
                              {a.desconto_obs && (
                                <div style={{ fontSize: 11, color: '#9ca3af', marginTop: 2 }}>{a.desconto_obs}</div>
                              )}
                            </div>
                            {/* Valor */}
                            <span style={{ fontSize: 14, fontWeight: 800,
                              color: marcado ? '#15803d' : '#9ca3af',
                              textDecoration: marcado ? 'none' : 'line-through' }}>
                              - {formatCurrency(valParcela)}
                            </span>
                          </div>
                        )
                      })}
                      {/* Subtotal AD */}
                      {totalADSel > 0 && (
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                          padding: '8px 14px', background: '#fef3c7', borderBottom: '1px solid #fde68a' }}>
                          <span style={{ fontSize: 12, color: '#92400e', fontWeight: 700 }}>Total descontado (-AD)</span>
                          <span style={{ fontSize: 13, fontWeight: 800, color: '#b45309' }}>- {formatCurrency(totalADSel)}</span>
                        </div>
                      )}
                    </div>
                  )
                })()}

                {/* Líquido — calculado em tempo real com os ADs selecionados */}
                {(() => {
                  const adSel = adiantsDisponiveis
                    .filter(a => adSelecionados.has(a.id))
                    .reduce((s, a) => {
                      const p = a.desconto_parcelas ?? 1
                      return s + (p > 1 ? a.valor / p : a.valor)
                    }, 0)
                  const liquidoReal = modalLiberar.valor_total
                    - (modalLiberar.vt_desconto_faltas ?? 0)
                    + (modalLiberar.vt_adicional_sabdom ?? 0)
                    - (modalLiberar.desconto_vt_6pct ?? 0)
                    - modalLiberar.inss
                    - modalLiberar.ir
                    - adSel
                  return (
                    <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center',
                      padding:'12px 14px', background:'#1e3a5f' }}>
                      <span style={{ fontSize:14, fontWeight:800, color:'#fff' }}>💵 Líquido a Pagar</span>
                      <span style={{ fontSize:17, fontWeight:900, color:'#86efac' }}>{formatCurrency(liquidoReal)}</span>
                    </div>
                  )
                })()}
              </div>

              {/* Botões */}
              <div style={{ display:'flex', gap:10, marginTop:16, marginBottom:20 }}>
                <button onClick={() => setModalLiberar(null)}
                  style={{ flex:1, height:40, borderRadius:8, border:'1px solid #e5e7eb',
                    background:'#f9fafb', color:'#374151', fontWeight:700, fontSize:13, cursor:'pointer' }}>
                  Cancelar
                </button>
                <button onClick={confirmarLiberar} disabled={saving}
                  style={{ flex:2, height:40, borderRadius:8, border:'none',
                    background: saving ? '#9ca3af' : '#15803d',
                    color:'#fff', fontWeight:800, fontSize:13, cursor: saving?'not-allowed':'pointer' }}>
                  {saving ? 'Processando…' : '✅ Confirmar e Liberar para Pagamento'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════════════
           MODAL ESPELHO DE PONTO
           Exibe o calendário diário do lançamento selecionado
      ══════════════════════════════════════════════════════════════════════ */}
      {modalEspelhoLancId && (() => {
        const lanc   = lancamentos.find(l => l.id === modalEspelhoLancId)
        const dias   = espelhoPorLanc[modalEspelhoLancId] ?? []
        const totalH = dias.reduce((s, d) => s + d.horas_normais + d.horas_extras, 0)
        const totalFaltas = dias.filter(d => d.falta && !d.domingo).length
        const totalProd   = dias.reduce((s, d) => s + d.producao, 0)
        const diasTrab    = dias.filter(d => !d.domingo && (d.horas_normais > 0 || d.producao > 0)).length
        const DIAS_SEMANA = ['Dom','Seg','Ter','Qua','Qui','Sex','Sáb']

        return (
          <Dialog open onOpenChange={() => setModalEspelhoLancId(null)}>
            <DialogContent style={{ maxWidth: 700, maxHeight: '90vh', overflowY: 'auto' }}>
              <DialogHeader>
                <DialogTitle style={{ display:'flex', alignItems:'center', gap:8 }}>
                  <Eye size={18} style={{ color:'#1d4ed8' }} />
                  Espelho de Ponto — {lanc?.colaborador_nome}
                </DialogTitle>
              </DialogHeader>

              {/* Cabeçalho identificação */}
              {lanc && (
                <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr 1fr', gap:8, marginBottom:12 }}>
                  <div style={{ background:'#eff6ff', border:'1px solid #bfdbfe', borderRadius:8, padding:'8px 12px' }}>
                    <div style={{ fontSize:10, color:'#6b7280', marginBottom:2 }}>Colaborador</div>
                    <div style={{ fontWeight:700, fontSize:13 }}>{lanc.colaborador_nome}</div>
                    <div style={{ fontSize:11, color:'#6b7280' }}>{lanc.colaborador_chapa} · {lanc.tipo_contrato.toUpperCase()}</div>
                  </div>
                  <div style={{ background:'#eff6ff', border:'1px solid #bfdbfe', borderRadius:8, padding:'8px 12px' }}>
                    <div style={{ fontSize:10, color:'#6b7280', marginBottom:2 }}>Período</div>
                    <div style={{ fontWeight:700, fontSize:13 }}>
                      {new Date(lanc.data_inicio+'T12:00:00').toLocaleDateString('pt-BR')} → {new Date(lanc.data_fim+'T12:00:00').toLocaleDateString('pt-BR')}
                    </div>
                    <div style={{ fontSize:11, color:'#6b7280' }}>{lanc.obra_nome}</div>
                  </div>
                  <div style={{ background:'#eff6ff', border:'1px solid #bfdbfe', borderRadius:8, padding:'8px 12px' }}>
                    <div style={{ fontSize:10, color:'#6b7280', marginBottom:2 }}>Função</div>
                    <div style={{ fontWeight:700, fontSize:13 }}>{lanc.funcao_nome}</div>
                    <div style={{ fontSize:11, color:'#6b7280' }}>{MESES[lanc.mes_referencia.slice(5,7) as any - 1]} / {lanc.mes_referencia.slice(0,4)}</div>
                  </div>
                </div>
              )}

              {/* Resumo estatístico */}
              {lanc && (
                <div style={{ display:'grid', gridTemplateColumns:'repeat(4,1fr)', gap:6, marginBottom:14 }}>
                  {[
                    { label:'Dias Trabalhados', val: diasTrab, cor:'#15803d', bg:'#f0fdf4', brd:'#bbf7d0' },
                    { label:'Horas Totais',     val: fmtHHMM(totalH), cor:'#1d4ed8', bg:'#eff6ff', brd:'#bfdbfe' },
                    { label:'Faltas',           val: totalFaltas, cor: totalFaltas > 0 ? '#dc2626':'#6b7280', bg: totalFaltas > 0 ? '#fef2f2':'#f9fafb', brd: totalFaltas > 0 ? '#fecaca':'#e5e7eb' },
                    { label:'Produção',         val: totalProd > 0 ? formatCurrency(totalProd) : '—', cor:'#7c3aed', bg:'#faf5ff', brd:'#e9d5ff' },
                  ].map(c => (
                    <div key={c.label} style={{ background:c.bg, border:`1px solid ${c.brd}`, borderRadius:7, padding:'8px 10px', textAlign:'center' }}>
                      <div style={{ fontSize:10, color:'#6b7280', marginBottom:3 }}>{c.label}</div>
                      <div style={{ fontSize:15, fontWeight:800, color:c.cor }}>{c.val}</div>
                    </div>
                  ))}
                </div>
              )}

              {/* Tabela calendário */}
              {loadingEspelho ? (
                <div style={{ textAlign:'center', padding:'30px 0', color:'#6b7280' }}>
                  <div style={{ fontSize:14 }}>⏳ Carregando espelho…</div>
                </div>
              ) : dias.length === 0 ? (
                <div style={{ textAlign:'center', padding:'30px 0', color:'#6b7280', fontSize:13 }}>
                  Nenhum registro encontrado para este período.
                </div>
              ) : (
                <div style={{ overflowX:'auto' }}>
                  <table style={{ width:'100%', borderCollapse:'collapse', fontSize:12 }}>
                    <thead>
                      <tr style={{ background:'#1e3a5f', color:'#fff' }}>
                        <th style={{ padding:'7px 10px', textAlign:'left', whiteSpace:'nowrap' }}>Data</th>
                        <th style={{ padding:'7px 10px', textAlign:'center' }}>Dia</th>
                        <th style={{ padding:'7px 10px', textAlign:'center' }}>H. Normais</th>
                        <th style={{ padding:'7px 10px', textAlign:'center' }}>H. Extras</th>
                        <th style={{ padding:'7px 10px', textAlign:'center' }}>Produção</th>
                        <th style={{ padding:'7px 10px', textAlign:'center' }}>Status</th>
                        <th style={{ padding:'7px 10px', textAlign:'left' }}>Obs</th>
                      </tr>
                    </thead>
                    <tbody>
                      {dias.map((d, i) => {
                        const dow = new Date(d.data + 'T12:00:00').getDay()
                        const ehSab = dow === 6
                        const ehDom = dow === 0
                        const bg = d.falta
                          ? '#fef2f2'
                          : ehDom
                            ? '#f3f4f6'
                            : ehSab
                              ? '#fefce8'
                              : i % 2 === 0 ? '#fff' : '#f9fafb'

                        const statusLabel = d.falta
                          ? <span style={{ background:'#fecaca', color:'#dc2626', borderRadius:4, padding:'1px 6px', fontWeight:700 }}>FALTA</span>
                          : ehDom
                            ? <span style={{ background:'#e5e7eb', color:'#6b7280', borderRadius:4, padding:'1px 6px' }}>Domingo</span>
                            : ehSab
                              ? <span style={{ background:'#fef9c3', color:'#92400e', borderRadius:4, padding:'1px 6px' }}>Sábado</span>
                              : d.horas_normais > 0 || d.producao > 0
                                ? <span style={{ background:'#bbf7d0', color:'#15803d', borderRadius:4, padding:'1px 6px', fontWeight:600 }}>✓ OK</span>
                                : <span style={{ background:'#fed7aa', color:'#9a3412', borderRadius:4, padding:'1px 6px' }}>S/ Registro</span>

                        return (
                          <tr key={d.data} style={{ background: bg, borderBottom:'1px solid #e5e7eb' }}>
                            <td style={{ padding:'6px 10px', fontWeight:600, whiteSpace:'nowrap' }}>
                              {new Date(d.data+'T12:00:00').toLocaleDateString('pt-BR')}
                            </td>
                            <td style={{ padding:'6px 10px', textAlign:'center', color:'#6b7280' }}>
                              {DIAS_SEMANA[dow]}
                            </td>
                            <td style={{ padding:'6px 10px', textAlign:'center', fontFamily:'monospace', fontWeight: d.horas_normais > 0 ? 700 : 400, color: d.horas_normais > 0 ? '#1d4ed8' : '#9ca3af' }}>
                              {d.horas_normais > 0 ? fmtHHMM(d.horas_normais) : '—'}
                            </td>
                            <td style={{ padding:'6px 10px', textAlign:'center', fontFamily:'monospace', fontWeight: d.horas_extras > 0 ? 700 : 400, color: d.horas_extras > 0 ? '#7c3aed' : '#9ca3af' }}>
                              {d.horas_extras > 0 ? fmtHHMM(d.horas_extras) : '—'}
                            </td>
                            <td style={{ padding:'6px 10px', textAlign:'center', color: d.producao > 0 ? '#7c3aed':'#9ca3af', fontWeight: d.producao > 0 ? 700:400 }}>
                              {d.producao > 0 ? formatCurrency(d.producao) : '—'}
                            </td>
                            <td style={{ padding:'6px 10px', textAlign:'center' }}>
                              {statusLabel}
                            </td>
                            <td style={{ padding:'6px 10px', color:'#6b7280', fontSize:11, maxWidth:120, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
                              {d.obs || ''}
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                    {/* Totalizador */}
                    <tfoot>
                      <tr style={{ background:'#1e3a5f', color:'#fff', fontWeight:700 }}>
                        <td colSpan={2} style={{ padding:'8px 10px' }}>TOTAL</td>
                        <td style={{ padding:'8px 10px', textAlign:'center', fontFamily:'monospace' }}>
                          {fmtHHMM(dias.reduce((s,d) => s + d.horas_normais, 0))}
                        </td>
                        <td style={{ padding:'8px 10px', textAlign:'center', fontFamily:'monospace' }}>
                          {fmtHHMM(dias.reduce((s,d) => s + d.horas_extras, 0))}
                        </td>
                        <td style={{ padding:'8px 10px', textAlign:'center' }}>
                          {totalProd > 0 ? formatCurrency(totalProd) : '—'}
                        </td>
                        <td colSpan={2} style={{ padding:'8px 10px', textAlign:'center' }}>
                          {totalFaltas > 0 && <span style={{ background:'#fecaca', color:'#7f1d1d', borderRadius:4, padding:'1px 8px' }}>{totalFaltas} falta{totalFaltas > 1 ? 's':''}</span>}
                        </td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              )}

              {/* Botão imprimir */}
              <div style={{ display:'flex', justifyContent:'flex-end', gap:8, marginTop:16 }}>
                <Button variant="outline" onClick={() => setModalEspelhoLancId(null)}>Fechar</Button>
                <Button onClick={() => window.print()} style={{ background:'#1d4ed8', color:'#fff' }}>
                  🖨 Imprimir Espelho
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        )
      })()}
    </div>
  )
}
