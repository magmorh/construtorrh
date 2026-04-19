import React, { useEffect, useState, useCallback, useMemo } from 'react'
import { toast } from 'sonner'
import {
  Users, Trash2, Search, Building2, CheckCircle2, XCircle,
  Award, HardHat, ChevronRight, Trophy, RefreshCw, AlertTriangle,
  RotateCcw, Lock, ExternalLink,
} from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { formatCurrency } from '@/lib/utils'
import { PageHeader } from '@/components/Shared'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog'
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table'
import { useProfile } from '@/hooks/useProfile'

// ─── Tipos ────────────────────────────────────────────────────────────────────
interface Obra { id: string; nome: string }
interface ColaboradorInfo { id: string; nome: string; chapa: string | null }

interface PlaybookPreco {
  id: string; atividade_id: string; obra_id: string
  preco_unitario: number
  valor_premiacao_enc:  number | null
  valor_premiacao_cabo: number | null
  encarregado_id: string | null
  cabo_id:        string | null
  playbook_atividades?: { descricao: string; unidade: string; categoria: string | null }
}

interface PbItem {
  id: string; obra_id: string; descricao: string; unidade: string; categoria: string | null
}

interface ProducaoItem {
  id: string; colaborador_id: string; obra_id: string | null
  playbook_item_id: string | null; quantidade: number
  mes_referencia: string; num_retrabalhos?: number | null
  colaboradores?: { nome: string; chapa: string | null }
  playbook_itens?:  { descricao: string; unidade: string; categoria: string | null }
}

interface PremioStatus {
  id: string
  status: string  // 'pendente' | 'aprovado' | 'pago' | 'cancelado'
}

interface ComissaoRow {
  id: string; obra_id: string | null; colaborador_id: string
  funcao: 'encarregado' | 'cabo'; descricao: string | null
  quantidade_total: number; valor_unitario_premiacao: number
  valor_bruto: number; num_cabos: number; valor_final: number
  competencia: string; status: string; premio_id: string | null
  observacoes: string | null; data_geracao: string
  obras?: { nome: string } | null
  colaboradores?: { nome: string; chapa: string | null }
  // enriquecido no frontend
  premio_status?: string | null
}

interface LinhaAtividade {
  playbook_item_id: string; descricao: string; unidade: string; categoria: string | null
  qtdTotal: number; totalPremioEnc: number; totalPremioCabo: number
  valorPremioEnc: number; valorPremioCabo: number
  encNome: string | null; caboNome: string | null
  encId: string | null; caboId: string | null
  subColabs: { colaboradorId: string; nome: string; chapa: string | null; qtd: number }[]
}

interface EquipeObra { encarregados: ColaboradorInfo[]; cabos: ColaboradorInfo[] }
type Aba = 'vinculos' | 'calculo'

// ─── Helpers ──────────────────────────────────────────────────────────────────
const MESES = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro']
function mesLabel(ym: string) { if (!ym) return '—'; const [y,m] = ym.split('-'); return `${MESES[+m-1]} / ${y}` }
function norm(s: string | null | undefined) { return (s ?? '').toLowerCase().trim().replace(/\s+/g,' ') }
function fatorRetrabalho(n?: number | null) { const v = n ?? 0; return v === 0 ? 1.0 : v === 1 ? 0.5 : 0.0 }
function uniq<T extends {id:string}>(arr: T[]): T[] {
  const s = new Set<string>(); return arr.filter(c => { if (s.has(c.id)) return false; s.add(c.id); return true })
}

// Status da comissão
const STATUS_COM: Record<string, {bg:string;border:string;cor:string;label:string}> = {
  pendente:  { bg:'#fef3c7', border:'#fde68a', cor:'#b45309', label:'⏳ Pendente'  },
  aprovado:  { bg:'#dcfce7', border:'#bbf7d0', cor:'#15803d', label:'✅ Aprovado'  },
  cancelado: { bg:'#fee2e2', border:'#fecaca', cor:'#dc2626', label:'❌ Cancelado' },
}

// Status do prêmio vinculado
const STATUS_PREMIO: Record<string, {bg:string;border:string;cor:string;label:string}> = {
  pendente:  { bg:'#fef3c7', border:'#fde68a', cor:'#b45309', label:'⏳ Prêmio: Pendente'   },
  aprovado:  { bg:'#dcfce7', border:'#bbf7d0', cor:'#15803d', label:'✅ Prêmio: Aprovado'   },
  pago:      { bg:'#eff6ff', border:'#bfdbfe', cor:'#1d4ed8', label:'💳 Prêmio: Pago'       },
  cancelado: { bg:'#f3f4f6', border:'#e5e7eb', cor:'#6b7280', label:'↩ Prêmio: Cancelado'  },
}

/**
 * Regra de bloqueio por status do prêmio vinculado:
 * - pendente  → bloqueado para edição (aguardando aprovação em Prêmios)
 * - aprovado  → bloqueado (aguardando fechamento/pagamento)
 * - pago      → PERMANENTEMENTE bloqueado
 * - cancelado → liberado (comissão volta para pendente automaticamente)
 */
function getBloqueio(c: ComissaoRow): { bloqueado: boolean; motivo: string; nivelIcon: string } {
  if (!c.premio_id || !c.premio_status) return { bloqueado: false, motivo: '', nivelIcon: '' }
  if (c.premio_status === 'pago')
    return { bloqueado: true, motivo: 'Prêmio já pago no fechamento — permanentemente bloqueado', nivelIcon: '💳' }
  if (c.premio_status === 'aprovado')
    return { bloqueado: true, motivo: 'Prêmio aprovado — aguardando pagamento no fechamento', nivelIcon: '✅' }
  if (c.premio_status === 'pendente')
    return { bloqueado: true, motivo: 'Prêmio pendente em Prêmios — para editar, recuse-o lá primeiro', nivelIcon: '⏳' }
  // cancelado → liberado
  return { bloqueado: false, motivo: '', nivelIcon: '' }
}

// ─── Componente principal ─────────────────────────────────────────────────────
export default function ComissaoEquipe() {
  const { permissions: { canCreate, canEdit, canDelete } } = useProfile()
  const [aba,        setAba]        = useState<Aba>('vinculos')
  const [obras,      setObras]      = useState<Obra[]>([])
  const [colabs,     setColabs]     = useState<ColaboradorInfo[]>([])
  const [precos,     setPrecos]     = useState<PlaybookPreco[]>([])
  const [pbItens,    setPbItens]    = useState<PbItem[]>([])
  const [producoes,  setProducoes]  = useState<ProducaoItem[]>([])
  const [comissoes,  setComissoes]  = useState<ComissaoRow[]>([])
  const [loading,    setLoading]    = useState(true)

  const [competencia,    setCompetencia]    = useState(new Date().toISOString().slice(0, 7))
  const [filtroStatus,   setFiltroStatus]   = useState('todos')
  const [busca,          setBusca]          = useState('')
  const [obraCalcSel,    setObraCalcSel]    = useState<Obra | null>(null)
  const [searchObraCalc, setSearchObraCalc] = useState('')

  const [aprovarCom,  setAprovarCom]  = useState<ComissaoRow | null>(null)
  const [cancelarCom, setCancelarCom] = useState<ComissaoRow | null>(null)
  const [deleteCom,   setDeleteCom]   = useState<ComissaoRow | null>(null)
  const [calculando,  setCalculando]  = useState(false)

  // ─── Fetch ──────────────────────────────────────────────────────────────────
  const fetchData = useCallback(async () => {
    setLoading(true)
    const [obrRes, preRes, pbRes, proRes, colRes, comRes] = await Promise.all([
      supabase.from('obras').select('id,nome').order('nome'),
      supabase.from('playbook_precos').select('id,obra_id,atividade_id,preco_unitario,valor_premiacao_enc,valor_premiacao_cabo,encarregado_id,cabo_id,playbook_atividades(descricao,unidade,categoria)'),
      supabase.from('playbook_itens').select('id,obra_id,descricao,unidade,categoria'),
      supabase.from('ponto_producao').select('id,colaborador_id,obra_id,playbook_item_id,quantidade,mes_referencia,colaboradores(nome,chapa),playbook_itens(descricao,unidade,categoria)').eq('mes_referencia', competencia),
      supabase.from('colaboradores').select('id,nome,chapa').order('nome').limit(2000),
      supabase.from('comissoes_equipe_v2').select('*,obras(nome),colaboradores(nome,chapa)').eq('competencia', competencia).order('created_at', { ascending: false }),
    ])
    setObras    ((obrRes.data ?? []) as Obra[])
    setPrecos   ((preRes.data ?? []) as PlaybookPreco[])
    setPbItens  ((pbRes.data  ?? []) as PbItem[])
    setProducoes((proRes.data ?? []).map((p: any) => ({ ...p, num_retrabalhos: p.num_retrabalhos ?? 0 })) as ProducaoItem[])
    setColabs   ((colRes.data ?? []) as ColaboradorInfo[])

    let comList = (comRes.data ?? []) as ComissaoRow[]

    // ── Enriquecer com status do prêmio vinculado ──────────────────────────
    const premioIds = comList.filter(c => c.premio_id).map(c => c.premio_id!)
    if (premioIds.length > 0) {
      const { data: premData } = await supabase.from('premios').select('id,status').in('id', premioIds)
      const premMap = new Map<string, string>((premData ?? []).map((p: PremioStatus) => [p.id, p.status]))
      // Se prêmio cancelado → comissão volta para pendente automaticamente
      const voltarPendente = comList.filter(c => c.premio_id && premMap.get(c.premio_id) === 'cancelado' && c.status === 'aprovado')
      for (const c of voltarPendente) {
        await supabase.from('comissoes_equipe_v2').update({ status: 'pendente', premio_id: null }).eq('id', c.id)
      }
      comList = comList.map(c => ({
        ...c,
        status: (c.premio_id && premMap.get(c.premio_id) === 'cancelado' && c.status === 'aprovado') ? 'pendente' : c.status,
        premio_id: (c.premio_id && premMap.get(c.premio_id) === 'cancelado') ? null : c.premio_id,
        premio_status: c.premio_id ? (premMap.get(c.premio_id) ?? null) : null,
      }))
    }

    setComissoes(comList)
    setLoading(false)
  }, [competencia])
  useEffect(() => { fetchData() }, [fetchData])

  // ─── Mapas ──────────────────────────────────────────────────────────────────
  const colabsMap = useMemo(() => {
    const m = new Map<string, ColaboradorInfo>(); colabs.forEach(c => m.set(c.id, c)); return m
  }, [colabs])

  const precosPorItemId = useMemo(() => {
    const m = new Map<string, PlaybookPreco>()
    pbItens.forEach(item => {
      const p = precos.find(p => p.obra_id === item.obra_id && norm(p.playbook_atividades?.descricao) === norm(item.descricao))
      if (p) m.set(`${item.obra_id}::${item.id}`, p)
    })
    return m
  }, [pbItens, precos])

  const precosPorDesc = useMemo(() => {
    const m = new Map<string, PlaybookPreco>()
    precos.forEach(p => { if (p.playbook_atividades?.descricao) m.set(`${p.obra_id}::${norm(p.playbook_atividades.descricao)}`, p) })
    return m
  }, [precos])

  function getPreco(obraId: string, prod: ProducaoItem): PlaybookPreco | undefined {
    if (prod.playbook_item_id) { const v = precosPorItemId.get(`${obraId}::${prod.playbook_item_id}`); if (v) return v }
    const d = norm(prod.playbook_itens?.descricao); if (d) return precosPorDesc.get(`${obraId}::${d}`)
    return undefined
  }

  const equipePorObra = useMemo(() => {
    const m = new Map<string, EquipeObra>()
    precos.forEach(p => {
      if (!m.has(p.obra_id)) m.set(p.obra_id, { encarregados: [], cabos: [] })
      const eq = m.get(p.obra_id)!
      if (p.encarregado_id) { const c = colabsMap.get(p.encarregado_id); if (c) eq.encarregados.push(c) }
      if (p.cabo_id)        { const c = colabsMap.get(p.cabo_id);        if (c) eq.cabos.push(c) }
    })
    m.forEach(eq => { eq.encarregados = uniq(eq.encarregados); eq.cabos = uniq(eq.cabos) })
    return m
  }, [precos, colabsMap])

  // ─── Calcular ───────────────────────────────────────────────────────────────
  async function calcularComissoes() {
    if (!canCreate) return
    setCalculando(true); let gerados = 0, erros = 0

    const porObra = new Map<string, ProducaoItem[]>()
    producoes.forEach(p => { if (!p.obra_id) return; if (!porObra.has(p.obra_id)) porObra.set(p.obra_id, []); porObra.get(p.obra_id)!.push(p) })

    for (const [obraId, prods] of porObra.entries()) {
      const gpi = new Map<string, ProducaoItem[]>()
      prods.forEach(p => { const k = p.playbook_item_id ?? norm(p.playbook_itens?.descricao ?? ''); if (!k) return; if (!gpi.has(k)) gpi.set(k, []); gpi.get(k)!.push(p) })
      const totEnc  = new Map<string, { total: number; det: string[] }>()
      const totCabo = new Map<string, { total: number; det: string[] }>()

      for (const [, itens] of gpi.entries()) {
        const ref = itens[0]; const po = getPreco(obraId, ref); if (!po) continue
        const qtdTot = itens.reduce((s, p) => s + p.quantidade, 0)
        let qEf = 0; itens.forEach(p => { qEf += p.quantidade * fatorRetrabalho(p.num_retrabalhos) })
        const nom = ref.playbook_itens?.descricao ?? po.playbook_atividades?.descricao ?? '?'
        const un  = ref.playbook_itens?.unidade ?? ''
        if (po.encarregado_id && (po.valor_premiacao_enc ?? 0) > 0) {
          const val = (po.valor_premiacao_enc ?? 0) * qEf
          if (!totEnc.has(po.encarregado_id)) totEnc.set(po.encarregado_id, { total: 0, det: [] })
          const e = totEnc.get(po.encarregado_id)!; e.total += val
          e.det.push(`${nom}: ${qtdTot}${un} × R$${(po.valor_premiacao_enc ?? 0).toFixed(2)} = R$${val.toFixed(2)}`)
        }
        if (po.cabo_id && (po.valor_premiacao_cabo ?? 0) > 0) {
          const val = (po.valor_premiacao_cabo ?? 0) * qEf
          if (!totCabo.has(po.cabo_id)) totCabo.set(po.cabo_id, { total: 0, det: [] })
          const e = totCabo.get(po.cabo_id)!; e.total += val
          e.det.push(`${nom}: ${qtdTot}${un} × R$${(po.valor_premiacao_cabo ?? 0).toFixed(2)} = R$${val.toFixed(2)}`)
        }
      }

      const qtdObraTot = prods.reduce((s, p) => s + p.quantidade, 0)
      for (const [encId, { total, det }] of totEnc.entries()) {
        if (total <= 0) continue
        // Não sobrescrever se aprovado E prêmio ativo (pendente/aprovado/pago)
        const jaAprov = comissoes.find(c =>
          c.obra_id === obraId && c.colaborador_id === encId && c.funcao === 'encarregado' &&
          c.competencia === competencia && c.status === 'aprovado' &&
          c.premio_id && c.premio_status !== 'cancelado'
        )
        if (jaAprov) continue
        const { error } = await supabase.from('comissoes_equipe_v2').upsert({
          obra_id: obraId, colaborador_id: encId, funcao: 'encarregado' as const,
          descricao: `Premiação Encarregado – ${det.join(' | ')}`,
          quantidade_total: qtdObraTot, valor_unitario_premiacao: 0, valor_bruto: total,
          num_cabos: 1, valor_final: total, competencia, status: 'pendente',
          data_geracao: new Date().toISOString().slice(0, 10), observacoes: det.join('\n'),
        }, { onConflict: 'obra_id,colaborador_id,funcao,competencia', ignoreDuplicates: false })
        if (error) { console.error('[ENC]', error); erros++ } else gerados++
      }
      for (const [caboId, { total, det }] of totCabo.entries()) {
        if (total <= 0) continue
        const jaAprov = comissoes.find(c =>
          c.obra_id === obraId && c.colaborador_id === caboId && c.funcao === 'cabo' &&
          c.competencia === competencia && c.status === 'aprovado' &&
          c.premio_id && c.premio_status !== 'cancelado'
        )
        if (jaAprov) continue
        const { error } = await supabase.from('comissoes_equipe_v2').upsert({
          obra_id: obraId, colaborador_id: caboId, funcao: 'cabo' as const,
          descricao: `Premiação Cabo – ${det.join(' | ')}`,
          quantidade_total: qtdObraTot, valor_unitario_premiacao: 0, valor_bruto: total,
          num_cabos: totCabo.size, valor_final: total, competencia, status: 'pendente',
          data_geracao: new Date().toISOString().slice(0, 10), observacoes: det.join('\n'),
        }, { onConflict: 'obra_id,colaborador_id,funcao,competencia', ignoreDuplicates: false })
        if (error) { console.error('[CABO]', error); erros++ } else gerados++
      }
    }
    setCalculando(false)
    if (erros > 0) toast.error(`${erros} erro(s). Verifique o console.`)
    else if (gerados === 0) toast.warning('Nenhuma premiação gerada. Verifique encarregado/cabo no Playbook → Preços.')
    else toast.success(`${gerados} premiação(ões) calculada(s) para ${mesLabel(competencia)}!`)
    fetchData()
  }

  // ─── Ações ──────────────────────────────────────────────────────────────────
  async function handleAprovar() {
    if (!aprovarCom) return
    if (aprovarCom.valor_final <= 0) { toast.error('Valor final é zero.'); setAprovarCom(null); return }
    // Verificar se já existe prêmio ativo (pendente/aprovado/pago) para evitar duplicata
    const { data: premExist } = await supabase.from('premios')
      .select('id,status')
      .eq('colaborador_id', aprovarCom.colaborador_id)
      .eq('competencia', aprovarCom.competencia)
      .eq('tipo', 'Produtividade')
      .eq('obra_id', aprovarCom.obra_id ?? '')
      .in('status', ['pendente', 'aprovado', 'pago'])
      .limit(1)
    if (premExist && premExist.length > 0) {
      const st = premExist[0].status
      toast.error(`Prêmio duplicado! Já existe um prêmio de Produtividade ${st === 'pago' ? 'pago' : st === 'aprovado' ? 'aprovado' : 'pendente'} para este colaborador nesta competência.`)
      setAprovarCom(null)
      return
    }
    const { data: pd, error: pe } = await supabase.from('premios').insert({
      colaborador_id: aprovarCom.colaborador_id, obra_id: aprovarCom.obra_id, tipo: 'Produtividade',
      descricao: `Premiação ${aprovarCom.funcao === 'encarregado' ? 'Encarregado' : 'Cabo'} — ${mesLabel(aprovarCom.competencia)}`,
      valor: aprovarCom.valor_final, data: new Date().toISOString().slice(0, 10),
      competencia: aprovarCom.competencia, observacoes: aprovarCom.observacoes ?? '', status: 'pendente',
    }).select('id').single()
    if (pe || !pd) { toast.error('Erro ao criar prêmio'); return }
    await supabase.from('comissoes_equipe_v2').update({ status: 'aprovado', premio_id: pd.id }).eq('id', aprovarCom.id)
    toast.success('✅ Aprovado! Prêmio gerado — acesse Prêmios para aprovar o pagamento.')
    setAprovarCom(null); fetchData()
  }

  async function handleDelete() {
    if (!deleteCom) return
    await supabase.from('comissoes_equipe_v2').delete().eq('id', deleteCom.id)
    toast.success('Excluído.'); setDeleteCom(null); fetchData()
  }

  // ─── Linhas de atividade (agrupadas por colaborador) ─────────────────────────
  const linhasAtividade = useMemo((): LinhaAtividade[] => {
    if (!obraCalcSel) return []
    const prodsObra = producoes.filter(p => p.obra_id === obraCalcSel.id)
    if (!prodsObra.length) return []

    const gpi = new Map<string, ProducaoItem[]>()
    prodsObra.forEach(p => {
      const k = p.playbook_item_id ?? norm(p.playbook_itens?.descricao ?? '')
      if (!k) return
      if (!gpi.has(k)) gpi.set(k, []); gpi.get(k)!.push(p)
    })

    const linhas: LinhaAtividade[] = []
    for (const [itemId, itens] of gpi.entries()) {
      const ref = itens[0]; const po = getPreco(obraCalcSel.id, ref)
      const vEnc = po?.valor_premiacao_enc ?? 0; const vCabo = po?.valor_premiacao_cabo ?? 0
      let tEnc = 0, tCabo = 0
      const colabQtd = new Map<string, number>()
      itens.forEach(prod => {
        const f = fatorRetrabalho(prod.num_retrabalhos)
        tEnc  += prod.quantidade * vEnc  * f
        tCabo += prod.quantidade * vCabo * f
        colabQtd.set(prod.colaborador_id, (colabQtd.get(prod.colaborador_id) ?? 0) + prod.quantidade)
      })
      const subColabs = [...colabQtd.entries()].map(([cid, qtd]) => {
        const c = colabsMap.get(cid)
        return { colaboradorId: cid, nome: c?.nome ?? cid, chapa: c?.chapa ?? null, qtd }
      }).sort((a, b) => a.nome.localeCompare(b.nome))

      linhas.push({
        playbook_item_id: itemId,
        descricao:  ref.playbook_itens?.descricao ?? po?.playbook_atividades?.descricao ?? '—',
        unidade:    ref.playbook_itens?.unidade   ?? po?.playbook_atividades?.unidade   ?? '—',
        categoria:  ref.playbook_itens?.categoria ?? po?.playbook_atividades?.categoria ?? null,
        qtdTotal:   itens.reduce((s, p) => s + p.quantidade, 0),
        totalPremioEnc: tEnc, totalPremioCabo: tCabo,
        valorPremioEnc: vEnc, valorPremioCabo: vCabo,
        encId:    po?.encarregado_id ?? null, caboId: po?.cabo_id ?? null,
        encNome:  po?.encarregado_id ? (colabsMap.get(po.encarregado_id)?.nome ?? null) : null,
        caboNome: po?.cabo_id        ? (colabsMap.get(po.cabo_id)?.nome         ?? null) : null,
        subColabs,
      })
    }
    return linhas.sort((a, b) => (a.categoria ?? 'Z').localeCompare(b.categoria ?? 'Z') || a.descricao.localeCompare(b.descricao))
  }, [obraCalcSel, producoes, precosPorItemId, precosPorDesc, colabsMap])

  const totalEncObra  = linhasAtividade.reduce((s, l) => s + l.totalPremioEnc,  0)
  const totalCaboObra = linhasAtividade.reduce((s, l) => s + l.totalPremioCabo, 0)
  const equipeCalc    = obraCalcSel ? (equipePorObra.get(obraCalcSel.id) ?? { encarregados: [], cabos: [] }) : { encarregados: [], cabos: [] }

  const resumoEncObra = useMemo(() => {
    const m = new Map<string, number>()
    linhasAtividade.forEach(l => { if (l.encId && l.totalPremioEnc > 0) m.set(l.encId, (m.get(l.encId) ?? 0) + l.totalPremioEnc) })
    return m
  }, [linhasAtividade])

  const resumoCaboObra = useMemo(() => {
    const m = new Map<string, number>()
    linhasAtividade.forEach(l => { if (l.caboId && l.totalPremioCabo > 0) m.set(l.caboId, (m.get(l.caboId) ?? 0) + l.totalPremioCabo) })
    return m
  }, [linhasAtividade])

  // Comissões filtradas para a obra selecionada
  const comissoesObra = useMemo(() =>
    comissoes.filter(c =>
      c.obra_id === obraCalcSel?.id &&
      (filtroStatus === 'todos' || c.status === filtroStatus) &&
      (!busca || (c.colaboradores?.nome ?? '').toLowerCase().includes(busca.toLowerCase()))
    ), [comissoes, obraCalcSel, filtroStatus, busca])

  // ─── Render ──────────────────────────────────────────────────────────────────
  return (
    <div className="p-6 space-y-6 bg-background min-h-full">

      {/* PageHeader padrão */}
      <PageHeader
        title="Comissão sobre Produtividade"
        subtitle="Premiação automática por produção — Encarregado e Cabo vinculados nas atividades do Playbook"
        icon={<Trophy size={20} />}
        action={aba === 'calculo' ? (
          <Button onClick={calcularComissoes} disabled={calculando} size="sm" className="gap-2">
            <RefreshCw size={14} className={calculando ? 'animate-spin' : ''} />
            {calculando ? 'Calculando…' : `Calcular ${mesLabel(competencia)}`}
          </Button>
        ) : undefined}
      />

      {/* Card principal */}
      <div className="bg-card border border-border rounded-xl shadow-sm overflow-hidden">

        {/* Abas internas */}
        <div className="flex items-center gap-2 px-5 pt-4 pb-0 border-b border-border">
          {([
            { id: 'vinculos', label: '🔗 Vínculos por Obra' },
            { id: 'calculo',  label: '💰 Cálculo de Premiações' },
          ] as const).map(t => (
            <button
              key={t.id}
              onClick={() => setAba(t.id)}
              className={`px-4 py-2 text-sm font-semibold rounded-t-lg border-b-2 transition-colors ${
                aba === t.id
                  ? 'border-primary text-primary bg-primary/5'
                  : 'border-transparent text-muted-foreground hover:text-foreground'
              }`}
            >{t.label}</button>
          ))}
        </div>

        <div className="p-5">

          {/* ══ VÍNCULOS ══════════════════════════════════════════════════════ */}
          {aba === 'vinculos' && (
            <div className="space-y-4">
              <div className="flex items-start gap-2 rounded-lg bg-blue-50 border border-blue-200 px-4 py-3 text-sm text-blue-800">
                <span className="mt-0.5">📌</span>
                <span>Os vínculos de <strong>Encarregado</strong> e <strong>Cabo</strong> são configurados em <strong>Playbooks → Preços por Obra</strong>, colunas R$ Enc. e R$ Cabo. Refletidos automaticamente abaixo.</span>
              </div>
              {loading ? (
                <div className="py-16 text-center text-muted-foreground">Carregando…</div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                  {obras.map(obra => {
                    const eq = equipePorObra.get(obra.id) ?? { encarregados: [], cabos: [] }
                    const qtdProd = producoes.filter(p => p.obra_id === obra.id).reduce((s, p) => s + p.quantidade, 0)
                    return (
                      <div key={obra.id} className="rounded-xl border border-border bg-card p-4 space-y-3">
                        <div className="flex items-center gap-3">
                          <div className="w-9 h-9 rounded-lg bg-primary flex items-center justify-center flex-shrink-0">
                            <Building2 size={15} className="text-primary-foreground" />
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="font-bold text-sm text-foreground truncate">{obra.nome}</p>
                            <p className="text-xs text-muted-foreground">
                              {qtdProd > 0 ? `${qtdProd.toLocaleString('pt-BR')} un. em ${mesLabel(competencia)}` : 'Sem produção neste mês'}
                            </p>
                          </div>
                        </div>
                        <div className="space-y-2">
                          <div className="text-[10px] font-bold text-orange-600 uppercase tracking-wide">👷 Encarregado(s)</div>
                          {eq.encarregados.length === 0
                            ? <p className="text-xs text-muted-foreground italic">— não vinculado —</p>
                            : eq.encarregados.map(c => (
                                <div key={c.id} className="flex items-center gap-1.5">
                                  <HardHat size={12} className="text-orange-500 flex-shrink-0" />
                                  <span className="text-sm font-semibold">{c.nome}</span>
                                  {c.chapa && <span className="text-xs text-muted-foreground font-mono">({c.chapa})</span>}
                                </div>
                              ))
                          }
                          <div className="text-[10px] font-bold text-blue-600 uppercase tracking-wide mt-1">🔧 Cabo(s)</div>
                          {eq.cabos.length === 0
                            ? <p className="text-xs text-muted-foreground italic">— não vinculado —</p>
                            : eq.cabos.map(c => (
                                <div key={c.id} className="flex items-center gap-1.5">
                                  <Users size={12} className="text-blue-500 flex-shrink-0" />
                                  <span className="text-sm font-semibold">{c.nome}</span>
                                  {c.chapa && <span className="text-xs text-muted-foreground font-mono">({c.chapa})</span>}
                                </div>
                              ))
                          }
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          )}

          {/* ══ CÁLCULO ═══════════════════════════════════════════════════════ */}
          {aba === 'calculo' && (
            <div className="space-y-4">
              {/* Filtro de competência */}
              <div className="flex items-center gap-3 flex-wrap">
                <div className="flex items-center gap-2 bg-muted rounded-lg px-3 py-1.5">
                  <span className="text-xs font-semibold text-muted-foreground">Competência:</span>
                  <input
                    type="month" value={competencia}
                    onChange={e => { setCompetencia(e.target.value); setObraCalcSel(null) }}
                    className="bg-transparent border-none outline-none text-sm font-bold text-primary"
                  />
                </div>
                <div className="flex items-center gap-2 rounded-lg bg-amber-50 border border-amber-200 px-3 py-1.5 text-xs text-amber-800">
                  <Lock size={12} />
                  <span>Comissões <strong>aprovadas em prêmio</strong> não são recalculadas</span>
                </div>
              </div>

              <div className="grid grid-cols-[260px_1fr] gap-4 items-start">

                {/* Lista obras */}
                <div className="rounded-xl border border-border bg-card overflow-hidden sticky top-4">
                  <div className="px-4 py-3 border-b border-border bg-muted/40">
                    <p className="text-sm font-bold text-foreground flex items-center gap-2 mb-2">
                      <Building2 size={13} className="text-primary" /> Obras
                    </p>
                    <div className="relative">
                      <Search size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
                      <Input className="pl-8 h-8 text-xs" placeholder="Filtrar obras…" value={searchObraCalc} onChange={e => setSearchObraCalc(e.target.value)} />
                    </div>
                  </div>
                  <div className="max-h-[60vh] overflow-y-auto">
                    {loading ? <div className="p-5 text-center text-xs text-muted-foreground">Carregando…</div> :
                      obras.filter(o => !searchObraCalc || o.nome.toLowerCase().includes(searchObraCalc.toLowerCase())).map(obra => {
                        const isSel = obraCalcSel?.id === obra.id
                        const prodsObra = producoes.filter(p => p.obra_id === obra.id)
                        const qtdProd = prodsObra.reduce((s, p) => s + p.quantidade, 0)
                        const eq = equipePorObra.get(obra.id)
                        const temEquipe = eq && (eq.encarregados.length > 0 || eq.cabos.length > 0)
                        // Total rápido de premiação
                        let tRapido = 0
                        const gpi2 = new Map<string, ProducaoItem[]>()
                        prodsObra.forEach(p => { const k = p.playbook_item_id ?? norm(p.playbook_itens?.descricao ?? ''); if (!k) return; if (!gpi2.has(k)) gpi2.set(k, []); gpi2.get(k)!.push(p) })
                        for (const [, itens] of gpi2.entries()) { const ref = itens[0]; const po = getPreco(obra.id, ref); if (!po) continue; itens.forEach(p => { tRapido += p.quantidade * ((po.valor_premiacao_enc ?? 0) + (po.valor_premiacao_cabo ?? 0)) }) }
                        return (
                          <button key={obra.id} type="button" onClick={() => setObraCalcSel(obra)}
                            className={`flex items-center gap-2.5 w-full px-4 py-3 border-none cursor-pointer text-left border-l-2 transition-all border-b border-border/50 ${isSel ? 'border-l-primary bg-primary/5' : 'border-l-transparent hover:bg-muted/50'}`}
                          >
                            <div className={`w-8 h-8 rounded-lg flex-shrink-0 flex items-center justify-center text-[11px] font-bold ${isSel ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground'}`}>
                              {obra.nome.slice(0, 2).toUpperCase()}
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className={`text-sm truncate ${isSel ? 'font-bold text-primary' : 'font-medium text-foreground'}`}>{obra.nome}</p>
                              <div className="text-[10px] text-muted-foreground mt-0.5">
                                {qtdProd > 0 ? <>{qtdProd.toLocaleString('pt-BR')} un.{tRapido > 0 && <span className="ml-1.5 text-green-600 font-semibold">· {formatCurrency(tRapido)}</span>}</> : <span>Sem produção</span>}
                              </div>
                            </div>
                            {!temEquipe && <span className="text-[9px] bg-amber-100 text-amber-700 rounded-full px-1.5 py-0.5 flex-shrink-0">s/ equipe</span>}
                            <ChevronRight size={12} className={isSel ? 'text-primary' : 'text-muted-foreground'} />
                          </button>
                        )
                      })
                    }
                  </div>
                </div>

                {/* Detalhe da obra */}
                {!obraCalcSel ? (
                  <div className="flex flex-col items-center justify-center py-20 border-2 border-dashed border-border rounded-xl text-muted-foreground gap-3">
                    <Trophy size={40} className="opacity-20" />
                    <p className="text-base font-medium">Selecione uma obra</p>
                    <p className="text-sm">← Escolha a obra para ver atividades e comissões</p>
                  </div>
                ) : (
                  <div className="rounded-xl border border-border overflow-hidden">

                    {/* Header azul da obra */}
                    <div className="px-5 py-4 bg-gradient-to-r from-[#0d3f56] to-[#1e3a5f] text-white">
                      <div className="flex items-start justify-between flex-wrap gap-3">
                        <div>
                          <h2 className="font-bold text-base">{obraCalcSel.nome}</h2>
                          <p className="text-xs text-white/70 mt-0.5">{linhasAtividade.length} atividade(s) · {mesLabel(competencia)}</p>
                        </div>
                        <div className="flex gap-3 flex-wrap">
                          <div className="bg-white/15 rounded-lg px-3 py-2 min-w-[110px]">
                            <p className="text-[10px] text-white/70 mb-0.5">👷 Total Enc.</p>
                            <p className="text-sm font-bold text-yellow-200">{formatCurrency(totalEncObra)}</p>
                            {equipeCalc.encarregados.length > 0 && <p className="text-[10px] text-white/60 mt-0.5">{equipeCalc.encarregados.map(c => c.nome.split(' ')[0]).join(', ')}</p>}
                          </div>
                          <div className="bg-white/15 rounded-lg px-3 py-2 min-w-[110px]">
                            <p className="text-[10px] text-white/70 mb-0.5">🔧 Total Cabo</p>
                            <p className="text-sm font-bold text-blue-200">{formatCurrency(totalCaboObra)}</p>
                            {equipeCalc.cabos.length > 0 && <p className="text-[10px] text-white/60 mt-0.5">{equipeCalc.cabos.map(c => c.nome.split(' ')[0]).join(', ')}</p>}
                          </div>
                        </div>
                      </div>
                      {equipeCalc.encarregados.length === 0 && (
                        <div className="mt-2.5 flex items-center gap-2 bg-amber-400/25 rounded-md px-3 py-1.5 text-[11px] text-yellow-200">
                          <AlertTriangle size={11} /> Nenhum encarregado vinculado nas atividades desta obra
                        </div>
                      )}
                    </div>

                    {/* Tabela de atividades */}
                    {linhasAtividade.length === 0 ? (
                      <div className="py-12 text-center text-muted-foreground space-y-2">
                        <Trophy size={28} className="mx-auto opacity-20" />
                        <p className="font-semibold">Sem produção em {mesLabel(competencia)}</p>
                        <p className="text-sm">Lance produções no portal para calcular as comissões.</p>
                      </div>
                    ) : (
                      <div className="overflow-x-auto">
                        <Table>
                          <TableHeader>
                            <TableRow className="bg-muted/40">
                              <TableHead className="w-24">Categoria</TableHead>
                              <TableHead>Atividade / Colaboradores</TableHead>
                              <TableHead className="text-center w-16">Unid.</TableHead>
                              <TableHead className="text-right w-20">Qtd.</TableHead>
                              <TableHead className="text-center w-32">Enc. Vinculado</TableHead>
                              <TableHead className="text-center w-32">Cabo Vinculado</TableHead>
                              <TableHead className="text-right w-28 text-orange-600 font-bold">💰 Enc.</TableHead>
                              <TableHead className="text-right w-28 text-blue-600 font-bold">💰 Cabo</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {linhasAtividade.map((linha, idx) => (
                              <React.Fragment key={linha.playbook_item_id}>
                                {/* Linha da atividade */}
                                <TableRow className={idx % 2 === 0 ? '' : 'bg-muted/20'}>
                                  <TableCell>
                                    <span className="text-[10px] bg-primary/10 text-primary rounded px-1.5 py-0.5">{linha.categoria ?? 'Outros'}</span>
                                  </TableCell>
                                  <TableCell>
                                    <p className="font-bold text-sm">{linha.descricao}</p>
                                    <p className="text-[10px] text-muted-foreground">{linha.subColabs.length} colaborador(es)</p>
                                  </TableCell>
                                  <TableCell className="text-center">
                                    <span className="font-mono text-xs font-bold">{linha.unidade}</span>
                                  </TableCell>
                                  <TableCell className="text-right font-bold">{linha.qtdTotal.toLocaleString('pt-BR')}</TableCell>
                                  <TableCell className="text-center">
                                    {linha.encNome
                                      ? <span className="text-[11px] font-semibold text-orange-700 bg-orange-50 border border-orange-200 rounded-full px-2 py-0.5">👷 {linha.encNome.split(' ')[0]}</span>
                                      : <span className="text-[10px] text-muted-foreground">—</span>}
                                    {linha.valorPremioEnc > 0 && <p className="text-[10px] text-orange-600 mt-0.5">R${linha.valorPremioEnc.toFixed(2)}/un.</p>}
                                  </TableCell>
                                  <TableCell className="text-center">
                                    {linha.caboNome
                                      ? <span className="text-[11px] font-semibold text-blue-700 bg-blue-50 border border-blue-200 rounded-full px-2 py-0.5">🔧 {linha.caboNome.split(' ')[0]}</span>
                                      : <span className="text-[10px] text-muted-foreground">—</span>}
                                    {linha.valorPremioCabo > 0 && <p className="text-[10px] text-blue-600 mt-0.5">R${linha.valorPremioCabo.toFixed(2)}/un.</p>}
                                  </TableCell>
                                  <TableCell className="text-right">
                                    <span className={`text-sm font-bold ${linha.totalPremioEnc > 0 ? 'text-orange-600' : 'text-muted-foreground'}`}>{formatCurrency(linha.totalPremioEnc)}</span>
                                  </TableCell>
                                  <TableCell className="text-right">
                                    <span className={`text-sm font-bold ${linha.totalPremioCabo > 0 ? 'text-blue-600' : 'text-muted-foreground'}`}>{formatCurrency(linha.totalPremioCabo)}</span>
                                  </TableCell>
                                </TableRow>
                                {/* Sub-linhas: colaboradores agrupados */}
                                {linha.subColabs.map(sc => (
                                  <TableRow key={sc.colaboradorId} className="bg-blue-50/40">
                                    <TableCell className="py-1.5" />
                                    <TableCell className="py-1.5 pl-8">
                                      <div className="flex items-center gap-2">
                                        <span className="text-[10px] text-blue-500">↳</span>
                                        <span className="text-xs font-semibold text-foreground">{sc.nome}</span>
                                        {sc.chapa && <span className="text-[10px] text-muted-foreground font-mono">{sc.chapa}</span>}
                                      </div>
                                    </TableCell>
                                    <TableCell className="py-1.5 text-center">
                                      <span className="font-mono text-[10px]">{linha.unidade}</span>
                                    </TableCell>
                                    <TableCell className="py-1.5 text-right">
                                      <span className="text-xs font-semibold">{sc.qtd.toLocaleString('pt-BR')}</span>
                                    </TableCell>
                                    <TableCell colSpan={2} className="py-1.5" />
                                    <TableCell className="py-1.5 text-right">
                                      <span className="text-xs font-semibold text-orange-600">{formatCurrency(sc.qtd * linha.valorPremioEnc)}</span>
                                    </TableCell>
                                    <TableCell className="py-1.5 text-right">
                                      <span className="text-xs font-semibold text-blue-600">{formatCurrency(sc.qtd * linha.valorPremioCabo)}</span>
                                    </TableCell>
                                  </TableRow>
                                ))}
                              </React.Fragment>
                            ))}
                          </TableBody>
                        </Table>
                      </div>
                    )}

                    {/* Rodapé resumo */}
                    {linhasAtividade.length > 0 && (
                      <div className="px-5 py-4 border-t-2 border-border bg-muted/30 space-y-4">
                        <div className="flex gap-8 flex-wrap">
                          <div>
                            <p className="text-[10px] font-bold text-orange-600 uppercase tracking-wide mb-2">👷 Encarregado(s) recebem</p>
                            {resumoEncObra.size === 0
                              ? <p className="text-xs text-muted-foreground italic">— Nenhum encarregado vinculado —</p>
                              : [...resumoEncObra.entries()].map(([id, val]) => {
                                  const c = colabsMap.get(id)
                                  return (
                                    <div key={id} className="flex items-center gap-2 mb-1">
                                      <HardHat size={13} className="text-orange-500" />
                                      <span className="text-sm font-bold">{c?.nome ?? id}</span>
                                      <span className="text-base font-black text-orange-600">{formatCurrency(val)}</span>
                                    </div>
                                  )
                                })
                            }
                          </div>
                          <div>
                            <p className="text-[10px] font-bold text-blue-600 uppercase tracking-wide mb-2">🔧 Cabo(s) recebem</p>
                            {resumoCaboObra.size === 0
                              ? <p className="text-xs text-muted-foreground italic">— Nenhum cabo vinculado —</p>
                              : [...resumoCaboObra.entries()].map(([id, val]) => {
                                  const c = colabsMap.get(id)
                                  return (
                                    <div key={id} className="flex items-center gap-2 mb-1">
                                      <Users size={12} className="text-blue-500" />
                                      <span className="text-sm font-bold">{c?.nome ?? id}</span>
                                      <span className="text-base font-black text-blue-600">{formatCurrency(val)}</span>
                                    </div>
                                  )
                                })
                            }
                          </div>
                        </div>
                        {canCreate && (
                          <div className="flex justify-end">
                            <Button onClick={calcularComissoes} disabled={calculando} size="sm" className="gap-2">
                              <RefreshCw size={13} className={calculando ? 'animate-spin' : ''} />
                              {calculando ? 'Calculando…' : `Gerar lançamento — ${mesLabel(competencia)}`}
                            </Button>
                          </div>
                        )}
                      </div>
                    )}

                    {/* ── Prêmios lançados ────────────────────────────────── */}
                    <div className="px-5 py-4 border-t-2 border-border space-y-4">
                      <div className="flex items-center justify-between flex-wrap gap-2">
                        <h3 className="text-sm font-bold flex items-center gap-2">
                          <Award size={14} className="text-amber-500" /> Prêmios Lançados — {obraCalcSel.nome}
                        </h3>
                        {/* Legenda do fluxo */}
                        <div className="text-[10px] text-muted-foreground flex items-center gap-1.5 flex-wrap">
                          <span className="bg-amber-100 text-amber-700 rounded px-1.5 py-0.5">⏳ Pendente</span>
                          <span>→ aprovar aqui →</span>
                          <span className="bg-green-100 text-green-700 rounded px-1.5 py-0.5">⏳ Prêmio Pendente</span>
                          <span>→ aprovar em Prêmios →</span>
                          <span className="bg-blue-100 text-blue-700 rounded px-1.5 py-0.5">💳 Pago no fechamento</span>
                        </div>
                      </div>

                      {/* Filtros */}
                      <div className="flex gap-2 flex-wrap">
                        <Select value={filtroStatus} onValueChange={setFiltroStatus}>
                          <SelectTrigger className="w-40 h-8 text-xs"><SelectValue placeholder="Status" /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="todos">Todos</SelectItem>
                            <SelectItem value="pendente">⏳ Pendente</SelectItem>
                            <SelectItem value="aprovado">✅ Aprovado</SelectItem>
                          </SelectContent>
                        </Select>
                        <div className="relative flex-1 min-w-[160px]">
                          <Search size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
                          <Input value={busca} onChange={e => setBusca(e.target.value)} placeholder="Buscar colaborador…" className="pl-8 h-8 text-xs" />
                        </div>
                      </div>

                      {/* Cards de totais */}
                      <div className="grid grid-cols-3 gap-3">
                        {[
                          { label: 'Pendente', val: comissoes.filter(c => c.obra_id === obraCalcSel.id && c.status === 'pendente').reduce((s, c) => s + c.valor_final, 0), cor: '#b45309', bg: '#fffbeb', icon: '⏳' },
                          { label: 'Aprovado',  val: comissoes.filter(c => c.obra_id === obraCalcSel.id && c.status === 'aprovado').reduce((s, c) => s + c.valor_final, 0),  cor: '#15803d', bg: '#f0fdf4', icon: '✅' },
                          { label: 'Total',     val: comissoes.filter(c => c.obra_id === obraCalcSel.id).reduce((s, c) => s + c.valor_final, 0),                             cor: '#0d3f56', bg: '#f0f9ff', icon: '📊' },
                        ].map(card => (
                          <div key={card.label} style={{ background: card.bg, border: `1px solid ${card.cor}22` }} className="rounded-lg px-3 py-2.5">
                            <p className="text-[10px] font-semibold text-muted-foreground">{card.icon} {card.label}</p>
                            <p style={{ color: card.cor }} className="text-base font-black mt-0.5">{formatCurrency(card.val)}</p>
                          </div>
                        ))}
                      </div>

                      {/* Tabela de comissões */}
                      {comissoesObra.length === 0 ? (
                        <div className="py-8 text-center text-muted-foreground text-sm bg-muted/30 rounded-lg">
                          Nenhum lançamento. Clique em "Gerar lançamento" acima.
                        </div>
                      ) : (
                        <div className="border border-border rounded-lg overflow-hidden">
                          <Table>
                            <TableHeader>
                              <TableRow className="bg-muted/40">
                                <TableHead>Colaborador</TableHead>
                                <TableHead className="text-center">Função</TableHead>
                                <TableHead className="text-right font-bold">💰 Premiação</TableHead>
                                <TableHead className="text-center">Status</TableHead>
                                <TableHead className="text-center">Status Prêmio</TableHead>
                                <TableHead className="text-center w-32">Ações</TableHead>
                              </TableRow>
                            </TableHeader>
                            <TableBody>
                              {comissoesObra.map((c, idx) => {
                                const stCom   = STATUS_COM[c.status]   ?? STATUS_COM.pendente
                                const stPremio = c.premio_status ? STATUS_PREMIO[c.premio_status] : null
                                const bloq    = getBloqueio(c)
                                return (
                                  <TableRow key={c.id} className={idx % 2 === 0 ? '' : 'bg-muted/20'}>
                                    <TableCell>
                                      <p className="font-bold text-sm">{c.colaboradores?.nome ?? '—'}</p>
                                      {c.colaboradores?.chapa && <p className="text-[10px] text-muted-foreground font-mono">{c.colaboradores.chapa}</p>}
                                    </TableCell>
                                    <TableCell className="text-center">
                                      <span className={`text-[11px] font-bold px-2 py-0.5 rounded-full border ${c.funcao === 'encarregado' ? 'bg-orange-50 text-orange-700 border-orange-200' : 'bg-blue-50 text-blue-700 border-blue-200'}`}>
                                        {c.funcao === 'encarregado' ? '👷 Encarregado' : '🔧 Cabo'}
                                      </span>
                                    </TableCell>
                                    <TableCell className="text-right">
                                      <span className={`text-base font-black ${c.valor_final > 0 ? 'text-green-700' : 'text-destructive'}`}>{formatCurrency(c.valor_final)}</span>
                                    </TableCell>
                                    <TableCell className="text-center">
                                      <span style={{ background: stCom.bg, color: stCom.cor, borderColor: stCom.border }} className="text-[10px] font-bold px-2 py-0.5 rounded-full border">
                                        {stCom.label}
                                      </span>
                                    </TableCell>
                                    {/* Coluna status do prêmio vinculado */}
                                    <TableCell className="text-center">
                                      {stPremio ? (
                                        <div className="flex flex-col items-center gap-0.5">
                                          <span style={{ background: stPremio.bg, color: stPremio.cor, borderColor: stPremio.border }} className="text-[10px] font-bold px-2 py-0.5 rounded-full border">
                                            {stPremio.label}
                                          </span>
                                          {bloq.bloqueado && (
                                            <span className="text-[9px] text-muted-foreground flex items-center gap-0.5 mt-0.5">
                                              <Lock size={8} /> bloqueado
                                            </span>
                                          )}
                                        </div>
                                      ) : (
                                        <span className="text-[10px] text-muted-foreground">—</span>
                                      )}
                                    </TableCell>
                                    {/* Ações */}
                                    <TableCell className="text-center">
                                      {bloq.bloqueado ? (
                                        <div className="flex items-center justify-center gap-1" title={bloq.motivo}>
                                          <Lock size={12} className="text-muted-foreground" />
                                          <span className="text-[10px] text-muted-foreground">{bloq.nivelIcon}</span>
                                        </div>
                                      ) : (
                                        <div className="flex items-center justify-center gap-1">
                                          {c.status === 'pendente' && canCreate && (
                                            <Button variant="ghost" size="icon" className="w-7 h-7" title="Aprovar — gera prêmio" onClick={() => setAprovarCom(c)}>
                                              <CheckCircle2 size={13} className="text-green-600" />
                                            </Button>
                                          )}
                                          {canDelete && c.status === 'pendente' && (
                                            <Button variant="ghost" size="icon" className="w-7 h-7" title="Excluir" onClick={() => setDeleteCom(c)}>
                                              <Trash2 size={12} className="text-destructive" />
                                            </Button>
                                          )}
                                          {c.status === 'aprovado' && !bloq.bloqueado && (
                                            <span className="text-[10px] text-green-600 font-semibold">✅ OK</span>
                                          )}
                                        </div>
                                      )}
                                    </TableCell>
                                  </TableRow>
                                )
                              })}
                            </TableBody>
                          </Table>
                        </div>
                      )}

                      {/* Aviso sobre o fluxo */}
                      <div className="rounded-lg bg-blue-50 border border-blue-200 px-4 py-3 text-xs text-blue-800 space-y-1">
                        <p className="font-bold flex items-center gap-1.5"><ExternalLink size={11} /> Fluxo de aprovação completo:</p>
                        <ol className="list-decimal list-inside space-y-0.5 text-blue-700 ml-2">
                          <li>Aqui: clique <strong>✅ Aprovar</strong> → cria prêmio com status <em>Pendente</em></li>
                          <li>Em <strong>Prêmios</strong>: aprove o prêmio → valor é somado ao fechamento</li>
                          <li>No <strong>Fechamento de Ponto</strong>: prêmio é pago junto ao salário</li>
                          <li>Se recusar em Prêmios → comissão volta automaticamente a <em>Pendente</em> aqui</li>
                        </ol>
                      </div>
                    </div>

                  </div>
                )}

              </div>
            </div>
          )}

        </div>
      </div>

      {/* ── Modais ─────────────────────────────────────────────────────────── */}

      {/* Aprovar */}
      <AlertDialog open={!!aprovarCom} onOpenChange={o => !o && setAprovarCom(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Aprovar premiação?</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-2 text-sm text-muted-foreground">
                <p>Prêmio de <strong className="text-foreground">{formatCurrency(aprovarCom?.valor_final ?? 0)}</strong> para <strong className="text-foreground">{aprovarCom?.colaboradores?.nome}</strong> ({aprovarCom?.funcao}) em {mesLabel(aprovarCom?.competencia ?? '')}.</p>
                <div className="rounded-lg bg-green-50 border border-green-200 p-3 text-green-800 text-xs">
                  <p className="font-bold mb-1">✅ O que acontece ao aprovar:</p>
                  <ol className="list-decimal list-inside space-y-0.5">
                    <li>Um prêmio é criado em <strong>Prêmios</strong> com status <em>Pendente</em></li>
                    <li>Esta comissão fica <strong>bloqueada</strong> enquanto o prêmio não for cancelado lá</li>
                    <li>Após aprovado em Prêmios → incluído no próximo fechamento de ponto</li>
                  </ol>
                </div>
                {aprovarCom?.observacoes && (
                  <details className="text-xs">
                    <summary className="cursor-pointer font-semibold text-foreground">Ver detalhes da produção</summary>
                    <pre className="whitespace-pre-wrap mt-2 text-muted-foreground">{aprovarCom.observacoes}</pre>
                  </details>
                )}
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handleAprovar} className="bg-green-600 hover:bg-green-700">✅ Aprovar</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Excluir */}
      <AlertDialog open={!!deleteCom} onOpenChange={o => !o && setDeleteCom(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir lançamento?</AlertDialogTitle>
            <AlertDialogDescription>Esta ação é irreversível e remove o registro de comissão.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-destructive hover:bg-destructive/90">Excluir</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

    </div>
  )
}
