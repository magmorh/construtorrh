import React, { useEffect, useState, useCallback, useMemo } from 'react'
import { toast } from 'sonner'
import {
  Users, Trash2, Search, Building2,
  CheckCircle2, XCircle, Award, HardHat,
  ChevronRight, Trophy, RefreshCw,
  AlertTriangle, RotateCcw,
} from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { formatCurrency } from '@/lib/utils'
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

// playbook_precos: vincula atividade global (atividade_id) a uma obra
interface PlaybookPreco {
  id: string; atividade_id: string; obra_id: string; preco_unitario: number
  valor_premiacao_enc: number | null; valor_premiacao_cabo: number | null
  encarregado_id: string | null; cabo_id: string | null
  playbook_atividades?: { descricao: string; unidade: string; categoria: string | null }
}

// playbook_itens: item concreto de uma obra (origem das produções no portal)
interface PlaybookItem {
  id: string; obra_id: string; descricao: string; unidade: string; categoria: string | null
}

// Produção lançada pelo colaborador no portal
interface ProducaoItem {
  id: string; colaborador_id: string; obra_id: string | null
  playbook_item_id: string | null; quantidade: number; data: string
  num_retrabalhos?: number | null
  colaboradores?: { nome: string; chapa: string | null }
  playbook_itens?: { descricao: string; unidade: string; categoria: string | null }
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
}

interface EquipeObra { encarregados: ColaboradorInfo[]; cabos: ColaboradorInfo[] }

interface LinhaAtividade {
  playbook_item_id: string; descricao: string; unidade: string
  categoria: string | null; qtdTotal: number; itensProducao: ProducaoItem[]
  valorPremioEnc: number; valorPremioCabo: number
  totalPremioEnc: number; totalPremioCabo: number
  encNome: string | null; caboNome: string | null
  encId: string | null; caboId: string | null
}

type Aba = 'vinculos' | 'calculo'

const MESES = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro']
function mesLabel(ym: string) {
  if (!ym) return '—'
  const [y, m] = ym.split('-')
  return `${MESES[+m - 1]} / ${y}`
}

const STATUS_COR: Record<string, { bg: string; border: string; cor: string; label: string }> = {
  pendente:  { bg: '#fef3c7', border: '#fde68a', cor: '#b45309', label: '⏳ Pendente'  },
  aprovado:  { bg: '#dcfce7', border: '#bbf7d0', cor: '#15803d', label: '✅ Aprovado'  },
  cancelado: { bg: '#fee2e2', border: '#fecaca', cor: '#dc2626', label: '❌ Cancelado' },
}

function fatorRetrabalho(n: number | null | undefined): number {
  const v = n ?? 0; if (v === 0) return 1.0; if (v === 1) return 0.5; return 0.0
}
function badgeRetrabalho(n: number | null | undefined) {
  const num = n ?? 0
  if (num === 0) return { label: '✅ 100%', bg: '#f0fdf4', cor: '#15803d', border: '#bbf7d0' }
  if (num === 1) return { label: '⚠️ 50%', bg: '#fffbeb', cor: '#b45309', border: '#fde68a' }
  return { label: '❌ Perdeu', bg: '#fee2e2', cor: '#dc2626', border: '#fecaca' }
}
function uniqColabs(arr: ColaboradorInfo[]): ColaboradorInfo[] {
  const s = new Set<string>()
  return arr.filter(c => { if (s.has(c.id)) return false; s.add(c.id); return true })
}
/** Normaliza texto para comparação: remove espaços duplos, trim, lowercase */
function norm(s: string | null | undefined) { return (s ?? '').trim().toLowerCase().replace(/\s+/g, ' ') }

export default function ComissaoEquipe() {
  const { permissions: { canCreate, canEdit, canDelete } } = useProfile()
  const [aba, setAba] = useState<Aba>('vinculos')
  const [obras,      setObras]      = useState<Obra[]>([])
  const [colabs,     setColabs]     = useState<ColaboradorInfo[]>([])
  const [precos,     setPrecos]     = useState<PlaybookPreco[]>([])
  const [pbItens,    setPbItens]    = useState<PlaybookItem[]>([])  // playbook_itens por obra
  const [producoes,  setProducoes]  = useState<ProducaoItem[]>([])
  const [comissoes,  setComissoes]  = useState<ComissaoRow[]>([])
  const [loading,    setLoading]    = useState(true)

  const [competencia, setCompetencia]     = useState(new Date().toISOString().slice(0, 7))
  const [filtroStatus, setFiltroStatus]   = useState('todos')
  const [busca, setBusca]                 = useState('')
  const [obraCalcSel, setObraCalcSel]     = useState<Obra | null>(null)
  const [searchObraCalc, setSearchObraCalc] = useState('')

  const [aprovarCom,  setAprovarCom]  = useState<ComissaoRow | null>(null)
  const [cancelarCom, setCancelarCom] = useState<ComissaoRow | null>(null)
  const [deleteCom,   setDeleteCom]   = useState<ComissaoRow | null>(null)
  const [calculando,  setCalculando]  = useState(false)

  type ModalRetrabalho = { producaoId: string; colaboradorNome: string; descricao: string; numAtual: number } | null
  const [modalRetrabalho, setModalRetrabalho] = useState<ModalRetrabalho>(null)
  const [salvandoRetrab, setSalvandoRetrab]   = useState(false)
  const [novoRetrab, setNovoRetrab]           = useState(0)

  // ─── Fetch ─────────────────────────────────────────────────────────────────
  const fetchData = useCallback(async () => {
    setLoading(true)
    const mesInicio = `${competencia}-01`
    const mesFim    = `${competencia}-31`
    const [obrRes, colRes, preRes, pbRes, proRes, comRes] = await Promise.all([
      supabase.from('obras').select('id, nome').order('nome'),
      supabase.from('colaboradores').select('id, nome, chapa').order('nome').limit(2000),
      supabase.from('playbook_precos')
        .select('id, atividade_id, obra_id, preco_unitario, valor_premiacao_enc, valor_premiacao_cabo, encarregado_id, cabo_id, playbook_atividades(descricao, unidade, categoria)'),
      supabase.from('playbook_itens')
        .select('id, obra_id, descricao, unidade, categoria'),
      supabase.from('portal_producao')
        .select('id, colaborador_id, obra_id, playbook_item_id, quantidade, data, num_retrabalhos, colaboradores(nome, chapa), playbook_itens(descricao, unidade, categoria)')
        .gte('data', mesInicio).lte('data', mesFim),
      supabase.from('comissoes_equipe_v2')
        .select('*, obras(nome), colaboradores(nome, chapa)')
        .eq('competencia', competencia)
        .order('created_at', { ascending: false }),
    ])
    setObras((obrRes.data ?? []) as Obra[])
    setColabs((colRes.data ?? []) as ColaboradorInfo[])
    setPrecos((preRes.data ?? []) as PlaybookPreco[])
    setPbItens((pbRes.data ?? []) as PlaybookItem[])
    setProducoes((proRes.data ?? []) as ProducaoItem[])
    setComissoes((comRes.data ?? []) as ComissaoRow[])
    setLoading(false)
  }, [competencia])
  useEffect(() => { fetchData() }, [fetchData])

  // ─── Mapas auxiliares ───────────────────────────────────────────────────────
  const colabsMap = useMemo(() => {
    const m = new Map<string, ColaboradorInfo>()
    colabs.forEach(c => m.set(c.id, c))
    return m
  }, [colabs])

  /**
   * Mapa de preco por obra+item:
   * chave: `${obra_id}::${playbook_item_id}` (via match por descricao)
   * Isso conecta portal_producao.playbook_item_id → playbook_precos
   */
  const precosPorItemId = useMemo(() => {
    const m = new Map<string, PlaybookPreco>()
    // Para cada item (playbook_itens), tentar achar o preço correspondente em playbook_precos
    pbItens.forEach(item => {
      const preco = precos.find(p =>
        p.obra_id === item.obra_id &&
        norm(p.playbook_atividades?.descricao) === norm(item.descricao)
      )
      if (preco) m.set(`${item.obra_id}::${item.id}`, preco)
    })
    return m
  }, [pbItens, precos])

  /** Preco por obra+descricao (fallback quando playbook_item_id é null) */
  const precosPorDescricao = useMemo(() => {
    const m = new Map<string, PlaybookPreco>()
    precos.forEach(p => {
      if (p.playbook_atividades?.descricao) {
        m.set(`${p.obra_id}::${norm(p.playbook_atividades.descricao)}`, p)
      }
    })
    return m
  }, [precos])

  function getPreco(obraId: string, prod: ProducaoItem): PlaybookPreco | undefined {
    // Tentativa 1: via playbook_item_id
    if (prod.playbook_item_id) {
      const v = precosPorItemId.get(`${obraId}::${prod.playbook_item_id}`)
      if (v) return v
    }
    // Tentativa 2: via descricao normalizada
    const desc = norm(prod.playbook_itens?.descricao)
    if (desc) return precosPorDescricao.get(`${obraId}::${desc}`)
    return undefined
  }

  // ─── Equipe por obra (derivada de playbook_precos) ──────────────────────────
  const equipePorObra = useMemo((): Map<string, EquipeObra> => {
    const m = new Map<string, EquipeObra>()
    precos.forEach(p => {
      if (!m.has(p.obra_id)) m.set(p.obra_id, { encarregados: [], cabos: [] })
      const eq = m.get(p.obra_id)!
      if (p.encarregado_id) { const c = colabsMap.get(p.encarregado_id); if (c) eq.encarregados.push(c) }
      if (p.cabo_id)        { const c = colabsMap.get(p.cabo_id);        if (c) eq.cabos.push(c) }
    })
    m.forEach(eq => { eq.encarregados = uniqColabs(eq.encarregados); eq.cabos = uniqColabs(eq.cabos) })
    return m
  }, [precos, colabsMap])

  // ─── Calcular premiações ────────────────────────────────────────────────────
  async function calcularComissoes() {
    if (!canCreate) return
    setCalculando(true)
    let gerados = 0, erros = 0

    // Agrupar produções por obra → item
    const producoesPorObra = new Map<string, ProducaoItem[]>()
    producoes.forEach(p => {
      if (!p.obra_id) return
      if (!producoesPorObra.has(p.obra_id)) producoesPorObra.set(p.obra_id, [])
      producoesPorObra.get(p.obra_id)!.push(p)
    })

    for (const [obraId, prodsObra] of producoesPorObra.entries()) {
      // Agrupar por playbook_item_id (ou descricao como fallback)
      const gpi = new Map<string, ProducaoItem[]>()
      prodsObra.forEach(p => {
        const key = p.playbook_item_id ?? norm(p.playbook_itens?.descricao ?? '')
        if (!key) return
        if (!gpi.has(key)) gpi.set(key, [])
        gpi.get(key)!.push(p)
      })

      // Totais por pessoa (enc e cabo podem ser diferentes por atividade)
      const totalEncPorPessoa  = new Map<string, { total: number; detalhes: string[] }>()
      const totalCaboPorPessoa = new Map<string, { total: number; detalhes: string[] }>()

      for (const [, itens] of gpi.entries()) {
        const ref = itens[0]
        const po  = getPreco(obraId, ref)
        if (!po) continue

        const qtdTotal = itens.reduce((s, p) => s + p.quantidade, 0)
        let qEfetiv = 0
        itens.forEach(prod => { qEfetiv += prod.quantidade * fatorRetrabalho(prod.num_retrabalhos) })

        const nomeProd = ref.playbook_itens?.descricao ?? po.playbook_atividades?.descricao ?? '?'
        const unid     = ref.playbook_itens?.unidade   ?? po.playbook_atividades?.unidade ?? ''

        if (po.encarregado_id && (po.valor_premiacao_enc ?? 0) > 0) {
          const val = (po.valor_premiacao_enc ?? 0) * qEfetiv
          if (!totalEncPorPessoa.has(po.encarregado_id)) totalEncPorPessoa.set(po.encarregado_id, { total: 0, detalhes: [] })
          const e = totalEncPorPessoa.get(po.encarregado_id)!
          e.total += val
          e.detalhes.push(`${nomeProd}: ${qtdTotal}${unid} × R$${(po.valor_premiacao_enc??0).toFixed(2)} = R$${val.toFixed(2)}`)
        }
        if (po.cabo_id && (po.valor_premiacao_cabo ?? 0) > 0) {
          const val = (po.valor_premiacao_cabo ?? 0) * qEfetiv
          if (!totalCaboPorPessoa.has(po.cabo_id)) totalCaboPorPessoa.set(po.cabo_id, { total: 0, detalhes: [] })
          const e = totalCaboPorPessoa.get(po.cabo_id)!
          e.total += val
          e.detalhes.push(`${nomeProd}: ${qtdTotal}${unid} × R$${(po.valor_premiacao_cabo??0).toFixed(2)} = R$${val.toFixed(2)}`)
        }
      }

      // Gravar encarregados
      for (const [encId, { total, detalhes }] of totalEncPorPessoa.entries()) {
        if (total <= 0) continue
        // NÃO sobrescrever se já está aprovado
        const jaAprovado = comissoes.find(c =>
          c.obra_id === obraId && c.colaborador_id === encId &&
          c.funcao === 'encarregado' && c.competencia === competencia && c.status === 'aprovado'
        )
        if (jaAprovado) continue // protege comissão aprovada

        const { error } = await supabase.from('comissoes_equipe_v2').upsert({
          obra_id: obraId, colaborador_id: encId, funcao: 'encarregado' as const,
          descricao: `Premiação Encarregado – ${detalhes.join(' | ')}`,
          quantidade_total: prodsObra.reduce((s,p)=>s+p.quantidade,0),
          valor_unitario_premiacao: 0, valor_bruto: total, num_cabos: 1, valor_final: total,
          competencia, status: 'pendente',
          data_geracao: new Date().toISOString().slice(0,10),
          observacoes: detalhes.join('\n'),
        }, { onConflict: 'obra_id,colaborador_id,funcao,competencia', ignoreDuplicates: false })
        if (error) { console.error(error); erros++ } else gerados++
      }

      // Gravar cabos
      for (const [caboId, { total, detalhes }] of totalCaboPorPessoa.entries()) {
        if (total <= 0) continue
        // NÃO sobrescrever se já está aprovado
        const jaAprovado = comissoes.find(c =>
          c.obra_id === obraId && c.colaborador_id === caboId &&
          c.funcao === 'cabo' && c.competencia === competencia && c.status === 'aprovado'
        )
        if (jaAprovado) continue

        const numCabos = totalCaboPorPessoa.size
        const { error } = await supabase.from('comissoes_equipe_v2').upsert({
          obra_id: obraId, colaborador_id: caboId, funcao: 'cabo' as const,
          descricao: `Premiação Cabo – ${detalhes.join(' | ')}`,
          quantidade_total: prodsObra.reduce((s,p)=>s+p.quantidade,0),
          valor_unitario_premiacao: 0, valor_bruto: total, num_cabos: numCabos, valor_final: total,
          competencia, status: 'pendente',
          data_geracao: new Date().toISOString().slice(0,10),
          observacoes: detalhes.join('\n'),
        }, { onConflict: 'obra_id,colaborador_id,funcao,competencia', ignoreDuplicates: false })
        if (error) { console.error(error); erros++ } else gerados++
      }
    }

    setCalculando(false)
    if (erros > 0) toast.error(`${erros} erro(s) ao calcular.`)
    else if (gerados === 0) toast.warning('Nenhuma premiação gerada. Verifique: (1) há produção lançada no período? (2) encarregados/cabos vinculados nas atividades?')
    else toast.success(`${gerados} premiação(ões) calculada(s) para ${mesLabel(competencia)}!`)
    fetchData()
  }

  async function salvarRetrabalho() {
    if (!modalRetrabalho) return
    setSalvandoRetrab(true)
    const { error } = await supabase.from('portal_producao').update({ num_retrabalhos: novoRetrab }).eq('id', modalRetrabalho.producaoId)
    setSalvandoRetrab(false)
    if (error) { toast.error('Erro. Execute migration_retrabalho.sql no Supabase.'); console.error(error) }
    else { toast.success('Retrabalho atualizado!'); setModalRetrabalho(null); fetchData() }
  }

  async function handleAprovar() {
    if (!aprovarCom) return
    if (aprovarCom.valor_final <= 0) { toast.error('Valor final é zero.'); setAprovarCom(null); return }
    const { data: pd, error: pe } = await supabase.from('premios').insert({
      colaborador_id: aprovarCom.colaborador_id, obra_id: aprovarCom.obra_id, tipo: 'Produtividade',
      descricao: `Premiação ${aprovarCom.funcao === 'encarregado' ? 'Encarregado' : 'Cabo'} — ${mesLabel(aprovarCom.competencia)}`,
      valor: aprovarCom.valor_final, data: new Date().toISOString().slice(0,10),
      competencia: aprovarCom.competencia, observacoes: aprovarCom.observacoes ?? '', status: 'pendente',
    }).select('id').single()
    if (pe || !pd) { toast.error('Erro ao criar prêmio'); return }
    await supabase.from('comissoes_equipe_v2').update({ status: 'aprovado', premio_id: pd.id }).eq('id', aprovarCom.id)
    toast.success('Aprovado! Prêmio gerado.'); setAprovarCom(null); fetchData()
  }
  async function handleCancelar() {
    if (!cancelarCom) return
    await supabase.from('comissoes_equipe_v2').update({ status: 'cancelado' }).eq('id', cancelarCom.id)
    toast.success('Cancelado.'); setCancelarCom(null); fetchData()
  }
  async function handleDelete() {
    if (!deleteCom) return
    await supabase.from('comissoes_equipe_v2').delete().eq('id', deleteCom.id)
    toast.success('Excluído.'); setDeleteCom(null); fetchData()
  }

  // ─── Linhas de atividade para obra selecionada ──────────────────────────────
  const linhasAtividade = useMemo((): LinhaAtividade[] => {
    if (!obraCalcSel) return []
    const prodsObra = producoes.filter(p => p.obra_id === obraCalcSel.id)
    if (prodsObra.length === 0) return []

    const gpi = new Map<string, ProducaoItem[]>()
    prodsObra.forEach(p => {
      const key = p.playbook_item_id ?? norm(p.playbook_itens?.descricao ?? '')
      if (!key) return
      if (!gpi.has(key)) gpi.set(key, [])
      gpi.get(key)!.push(p)
    })

    const linhas: LinhaAtividade[] = []
    for (const [itemId, itens] of gpi.entries()) {
      const ref = itens[0]
      const po  = getPreco(obraCalcSel.id, ref)
      const vEnc  = po?.valor_premiacao_enc  ?? 0
      const vCabo = po?.valor_premiacao_cabo ?? 0
      let tEnc = 0, tCabo = 0
      itens.forEach(prod => {
        const f = fatorRetrabalho(prod.num_retrabalhos)
        tEnc  += prod.quantidade * vEnc  * f
        tCabo += prod.quantidade * vCabo * f
      })
      const encId  = po?.encarregado_id ?? null
      const caboId = po?.cabo_id ?? null
      linhas.push({
        playbook_item_id: itemId,
        descricao:  ref.playbook_itens?.descricao ?? po?.playbook_atividades?.descricao ?? '—',
        unidade:    ref.playbook_itens?.unidade   ?? po?.playbook_atividades?.unidade   ?? '—',
        categoria:  ref.playbook_itens?.categoria ?? po?.playbook_atividades?.categoria ?? null,
        qtdTotal:   itens.reduce((s,p)=>s+p.quantidade, 0),
        itensProducao: itens,
        valorPremioEnc: vEnc, valorPremioCabo: vCabo,
        totalPremioEnc: tEnc, totalPremioCabo: tCabo,
        encNome:  encId  ? (colabsMap.get(encId)?.nome  ?? null) : null,
        caboNome: caboId ? (colabsMap.get(caboId)?.nome ?? null) : null,
        encId, caboId,
      })
    }
    return linhas.sort((a,b)=>(a.categoria??'Z').localeCompare(b.categoria??'Z')||a.descricao.localeCompare(b.descricao))
  }, [obraCalcSel, producoes, precosPorItemId, precosPorDescricao, colabsMap, pbItens])

  const totalEncObra  = linhasAtividade.reduce((s,l)=>s+l.totalPremioEnc,  0)
  const totalCaboObra = linhasAtividade.reduce((s,l)=>s+l.totalPremioCabo, 0)
  const equipeCalc = obraCalcSel ? (equipePorObra.get(obraCalcSel.id) ?? { encarregados: [], cabos: [] }) : { encarregados: [], cabos: [] }

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

  // ─── Render ─────────────────────────────────────────────────────────────────
  return (
    <div style={{ padding: '20px 24px', maxWidth: 1400, margin: '0 auto' }}>

      {/* Header */}
      <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:20, flexWrap:'wrap', gap:12 }}>
        <div style={{ display:'flex', alignItems:'center', gap:12 }}>
          <div style={{ width:42, height:42, borderRadius:12, background:'linear-gradient(135deg,#f59e0b,#d97706)', display:'flex', alignItems:'center', justifyContent:'center' }}>
            <Trophy size={20} color="#fff"/>
          </div>
          <div>
            <h1 style={{ fontSize:20, fontWeight:800, color:'#1e293b', margin:0 }}>Comissão de Equipe</h1>
            <p style={{ fontSize:12, color:'#64748b', margin:0 }}>Premiação automática por produção — Encarregado e Cabo vinculados às atividades</p>
          </div>
        </div>
        {aba==='calculo'&&(
          <Button onClick={calcularComissoes} disabled={calculando} style={{ gap:6, background:'#0d3f56', color:'#fff' }}>
            <RefreshCw size={14} className={calculando?'animate-spin':''}/>
            {calculando?'Calculando…':`Calcular ${mesLabel(competencia)}`}
          </Button>
        )}
      </div>

      {/* Abas */}
      <div style={{ display:'flex', gap:4, marginBottom:20, background:'#f1f5f9', borderRadius:10, padding:4, width:'fit-content' }}>
        {([{id:'vinculos',label:'🔗 Vínculos por Obra'},{id:'calculo',label:'💰 Cálculo de Premiações'}] as const).map(t=>(
          <button key={t.id} onClick={()=>setAba(t.id)} style={{ padding:'7px 18px', borderRadius:8, border:'none', cursor:'pointer', fontSize:13, fontWeight:600, background:aba===t.id?'#fff':'transparent', color:aba===t.id?'#0d3f56':'#64748b', boxShadow:aba===t.id?'0 1px 4px rgba(0,0,0,0.1)':'none', transition:'all 0.15s' }}>{t.label}</button>
        ))}
      </div>

      {/* ══ VÍNCULOS ══════════════════════════════════════════════════════════ */}
      {aba==='vinculos'&&(
        <div>
          <div style={{ background:'#f0f9ff', border:'1px solid #bae6fd', borderRadius:10, padding:'12px 16px', marginBottom:16, fontSize:13, color:'#0369a1' }}>
            📌 Os vínculos de <strong>Encarregado</strong> e <strong>Cabo</strong> são configurados em <strong>Playbooks → Preços por Obra</strong>, coluna R$ Enc. e R$ Cabo. Os dados abaixo refletem esses vínculos automaticamente.
          </div>
          {loading?<div style={{ padding:40, textAlign:'center', color:'#94a3b8' }}>Carregando…</div>
           :obras.length===0?<div style={{ padding:60, textAlign:'center', color:'#94a3b8' }}>Nenhuma obra cadastrada.</div>:(
            <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill, minmax(340px, 1fr))', gap:12 }}>
              {obras.map(obra=>{
                const eq = equipePorObra.get(obra.id) ?? { encarregados: [], cabos: [] }
                const qtdProd = producoes.filter(p=>p.obra_id===obra.id).reduce((s,p)=>s+p.quantidade,0)
                return (
                  <div key={obra.id} style={{ background:'#fff', border:'1px solid #e2e8f0', borderRadius:12, padding:'14px 16px' }}>
                    <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:10 }}>
                      <div style={{ width:36, height:36, borderRadius:9, background:'linear-gradient(135deg,#0d3f56,#1e3a5f)', display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 }}><Building2 size={16} color="#fff"/></div>
                      <div style={{ flex:1, minWidth:0 }}>
                        <div style={{ fontWeight:700, fontSize:14, color:'#1e293b', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{obra.nome}</div>
                        <div style={{ fontSize:11, color:'#64748b' }}>{qtdProd>0?`${qtdProd.toLocaleString('pt-BR')} un. em ${mesLabel(competencia)}`:'Sem produção neste mês'}</div>
                      </div>
                      {eq.encarregados.length===0&&eq.cabos.length===0&&<span style={{ fontSize:10, color:'#94a3b8', background:'#f1f5f9', borderRadius:20, padding:'2px 8px' }}>Sem equipe</span>}
                    </div>
                    <div style={{ marginBottom:8 }}>
                      <div style={{ fontSize:10, fontWeight:700, color:'#c2410c', textTransform:'uppercase', letterSpacing:'0.05em', marginBottom:4 }}>👷 Encarregado(s)</div>
                      {eq.encarregados.length===0?<div style={{ fontSize:12, color:'#94a3b8', fontStyle:'italic' }}>— não vinculado nas atividades —</div>
                       :eq.encarregados.map(c=><div key={c.id} style={{ fontSize:13, fontWeight:600, color:'#1e293b', display:'flex', alignItems:'center', gap:6 }}><HardHat size={13} color="#c2410c"/>{c.nome}{c.chapa&&<span style={{ fontSize:10, color:'#94a3b8', fontFamily:'monospace' }}>({c.chapa})</span>}</div>)}
                    </div>
                    <div>
                      <div style={{ fontSize:10, fontWeight:700, color:'#0369a1', textTransform:'uppercase', letterSpacing:'0.05em', marginBottom:4 }}>🔧 Cabo(s)</div>
                      {eq.cabos.length===0?<div style={{ fontSize:12, color:'#94a3b8', fontStyle:'italic' }}>— não vinculado nas atividades —</div>
                       :eq.cabos.map(c=><div key={c.id} style={{ fontSize:13, fontWeight:600, color:'#1e293b', display:'flex', alignItems:'center', gap:6, marginBottom:2 }}><Users size={12} color="#0369a1"/>{c.nome}{c.chapa&&<span style={{ fontSize:10, color:'#94a3b8', fontFamily:'monospace' }}>({c.chapa})</span>}</div>)}
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      )}

      {/* ══ CÁLCULO DE PREMIAÇÕES ════════════════════════════════════════════ */}
      {aba==='calculo'&&(
        <div>
          <div style={{ display:'flex', gap:10, marginBottom:16 }}>
            <div style={{ display:'flex', alignItems:'center', gap:6, background:'#fff', borderRadius:9, border:'1px solid #e2e8f0', padding:'6px 12px' }}>
              <span style={{ fontSize:12, fontWeight:600, color:'#64748b' }}>Competência:</span>
              <input type="month" value={competencia} onChange={e=>{ setCompetencia(e.target.value); setObraCalcSel(null) }} style={{ border:'none', outline:'none', fontSize:13, fontWeight:700, color:'#0d3f56', background:'transparent' }}/>
            </div>
            <div style={{ background:'#fffbeb', border:'1px solid #fde68a', borderRadius:9, padding:'6px 12px', fontSize:12, color:'#92400e', display:'flex', alignItems:'center', gap:6 }}>
              🔒 Comissões <strong>aprovadas</strong> não são alteradas ao recalcular
            </div>
          </div>

          <div style={{ display:'grid', gridTemplateColumns:'280px 1fr', gap:16, alignItems:'start' }}>

            {/* Lista obras */}
            <div style={{ border:'1px solid #e2e8f0', borderRadius:10, background:'#fff', overflow:'hidden', position:'sticky', top:20 }}>
              <div style={{ padding:'12px 14px', borderBottom:'1px solid #e2e8f0', background:'#f8fafc' }}>
                <p style={{ margin:'0 0 8px', fontSize:13, fontWeight:700, color:'#1e293b', display:'flex', alignItems:'center', gap:6 }}><Building2 size={13} color="#0d3f56"/> Obras</p>
                <div style={{ position:'relative' }}>
                  <Search size={12} style={{ position:'absolute', left:9, top:'50%', transform:'translateY(-50%)', color:'#94a3b8' }}/>
                  <Input style={{ paddingLeft:28, height:30, fontSize:12 }} placeholder="Filtrar obras…" value={searchObraCalc} onChange={e=>setSearchObraCalc(e.target.value)}/>
                </div>
              </div>
              <div style={{ maxHeight:560, overflowY:'auto' }}>
                {loading?<div style={{ padding:20, textAlign:'center', color:'#94a3b8', fontSize:12 }}>Carregando…</div>
                 :obras.filter(o=>!searchObraCalc||o.nome.toLowerCase().includes(searchObraCalc.toLowerCase())).map(obra=>{
                  const isSel = obraCalcSel?.id===obra.id
                  const prodsObra = producoes.filter(p=>p.obra_id===obra.id)
                  const qtdProd = prodsObra.reduce((s,p)=>s+p.quantidade,0)
                  const eq = equipePorObra.get(obra.id)
                  const temEquipe = eq && (eq.encarregados.length>0||eq.cabos.length>0)
                  // Total rápido de premiação
                  let tRapido = 0
                  const gpi2 = new Map<string, ProducaoItem[]>()
                  prodsObra.forEach(p=>{ const k=p.playbook_item_id??norm(p.playbook_itens?.descricao??''); if(!k) return; if(!gpi2.has(k)) gpi2.set(k,[]); gpi2.get(k)!.push(p) })
                  for(const [,itens] of gpi2.entries()){ const ref=itens[0]; const po=getPreco(obra.id,ref); if(!po) continue; itens.forEach(prod=>{ const f=fatorRetrabalho(prod.num_retrabalhos); tRapido+=prod.quantidade*((po.valor_premiacao_enc??0)+(po.valor_premiacao_cabo??0))*f }) }
                  return (
                    <button key={obra.id} type="button" onClick={()=>setObraCalcSel(obra)} style={{ display:'flex', alignItems:'center', gap:10, width:'100%', padding:'11px 14px', border:'none', cursor:'pointer', textAlign:'left', borderLeft:isSel?'3px solid #0d3f56':'3px solid transparent', background:isSel?'rgba(13,63,86,0.06)':'transparent', borderBottom:'1px solid #f1f5f9' }}>
                      <div style={{ width:34, height:34, borderRadius:8, flexShrink:0, display:'flex', alignItems:'center', justifyContent:'center', fontSize:11, fontWeight:700, background:isSel?'#0d3f56':'#f1f5f9', color:isSel?'#fff':'#64748b' }}>{obra.nome.slice(0,2).toUpperCase()}</div>
                      <div style={{ flex:1, minWidth:0 }}>
                        <p style={{ margin:0, fontSize:13, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap', fontWeight:isSel?700:500, color:isSel?'#0d3f56':'#1e293b' }}>{obra.nome}</p>
                        <div style={{ fontSize:10, color:'#94a3b8', marginTop:1 }}>
                          {qtdProd>0?<>{qtdProd.toLocaleString('pt-BR')} un.{tRapido>0&&<span style={{ marginLeft:4, color:'#15803d', fontWeight:600 }}>· {formatCurrency(tRapido)}</span>}</>:<span style={{ color:'#cbd5e1' }}>Sem produção</span>}
                        </div>
                      </div>
                      {!temEquipe&&<span style={{ fontSize:9, background:'#fef3c7', color:'#b45309', borderRadius:10, padding:'1px 6px', flexShrink:0 }}>s/ equipe</span>}
                      <ChevronRight size={12} color={isSel?'#0d3f56':'#cbd5e1'}/>
                    </button>
                  )
                })}
              </div>
            </div>

            {/* Detalhe */}
            {!obraCalcSel?(
              <div style={{ display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', padding:60, border:'2px dashed #e2e8f0', borderRadius:12, color:'#94a3b8', gap:10 }}>
                <Trophy size={40} style={{ opacity:0.2 }}/><p style={{ margin:0, fontSize:15, fontWeight:500 }}>Selecione uma obra</p>
                <p style={{ margin:0, fontSize:13 }}>← Escolha a obra para ver atividades e comissões</p>
              </div>
            ):(
              <div style={{ border:'1px solid #e2e8f0', borderRadius:12, background:'#fff', overflow:'hidden' }}>
                {/* Header azul */}
                <div style={{ padding:'14px 18px', background:'linear-gradient(135deg,#0d3f56,#1e3a5f)', color:'#fff' }}>
                  <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', flexWrap:'wrap', gap:8 }}>
                    <div>
                      <div style={{ fontWeight:800, fontSize:16 }}>{obraCalcSel.nome}</div>
                      <div style={{ fontSize:12, color:'rgba(255,255,255,0.7)', marginTop:2 }}>{linhasAtividade.length} atividade(s) · {mesLabel(competencia)}</div>
                    </div>
                    <div style={{ display:'flex', gap:10, flexWrap:'wrap' }}>
                      <div style={{ background:'rgba(255,255,255,0.15)', borderRadius:8, padding:'8px 14px', minWidth:120 }}>
                        <div style={{ fontSize:10, color:'rgba(255,255,255,0.7)', marginBottom:2 }}>👷 Total Enc.</div>
                        <div style={{ fontSize:15, fontWeight:800, color:'#fde68a' }}>{formatCurrency(totalEncObra)}</div>
                        {equipeCalc.encarregados.length>0&&<div style={{ fontSize:10, color:'rgba(255,255,255,0.6)', marginTop:2 }}>{equipeCalc.encarregados.map(c=>c.nome.split(' ')[0]).join(', ')}</div>}
                      </div>
                      <div style={{ background:'rgba(255,255,255,0.15)', borderRadius:8, padding:'8px 14px', minWidth:120 }}>
                        <div style={{ fontSize:10, color:'rgba(255,255,255,0.7)', marginBottom:2 }}>🔧 Total Cabo</div>
                        <div style={{ fontSize:15, fontWeight:800, color:'#bfdbfe' }}>{formatCurrency(totalCaboObra)}</div>
                        {equipeCalc.cabos.length>0&&<div style={{ fontSize:10, color:'rgba(255,255,255,0.6)', marginTop:2 }}>{equipeCalc.cabos.map(c=>c.nome.split(' ')[0]).join(', ')}</div>}
                      </div>
                    </div>
                  </div>
                  {equipeCalc.encarregados.length===0&&<div style={{ marginTop:8, background:'rgba(245,158,11,0.25)', borderRadius:6, padding:'6px 10px', fontSize:11, color:'#fde68a', display:'flex', alignItems:'center', gap:6 }}><AlertTriangle size={12}/> Nenhum encarregado vinculado nas atividades desta obra</div>}
                  {equipeCalc.cabos.length===0&&<div style={{ marginTop:6, background:'rgba(245,158,11,0.25)', borderRadius:6, padding:'6px 10px', fontSize:11, color:'#fde68a', display:'flex', alignItems:'center', gap:6 }}><AlertTriangle size={12}/> Nenhum cabo vinculado nas atividades desta obra</div>}
                </div>

                {/* Tabela atividades */}
                {linhasAtividade.length===0?(
                  <div style={{ padding:40, textAlign:'center', color:'#94a3b8' }}>
                    <Trophy size={32} style={{ marginBottom:10, opacity:0.2 }}/>
                    <div style={{ fontWeight:600 }}>Sem produção em {mesLabel(competencia)}</div>
                    <div style={{ fontSize:12, marginTop:4 }}>Lance produções no portal para calcular as comissões.</div>
                  </div>
                ):(
                  <div style={{ overflowX:'auto' }}>
                    <Table>
                      <TableHeader>
                        <TableRow style={{ background:'#f8fafc' }}>
                          <TableHead style={{ width:110 }}>Categoria</TableHead>
                          <TableHead>Atividade / Colaborador</TableHead>
                          <TableHead style={{ textAlign:'center', width:70 }}>Unid.</TableHead>
                          <TableHead style={{ textAlign:'right', width:90 }}>Qtd.</TableHead>
                          <TableHead style={{ textAlign:'center', width:130 }}>Enc. Vinculado</TableHead>
                          <TableHead style={{ textAlign:'center', width:130 }}>Cabo Vinculado</TableHead>
                          <TableHead style={{ textAlign:'right', width:110, color:'#c2410c', fontWeight:700 }}>💰 Enc.</TableHead>
                          <TableHead style={{ textAlign:'right', width:110, color:'#0369a1', fontWeight:700 }}>💰 Cabo</TableHead>
                          <TableHead style={{ textAlign:'center', width:100 }}>Retrabalho</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {linhasAtividade.map((linha,idx)=>(
                          <React.Fragment key={linha.playbook_item_id}>
                            <TableRow style={{ background:idx%2===0?'transparent':'#fafafa' }}>
                              <TableCell><span style={{ fontSize:11, background:'rgba(37,99,235,0.07)', color:'#0d3f56', borderRadius:4, padding:'2px 7px' }}>{linha.categoria??'Outros'}</span></TableCell>
                              <TableCell><div style={{ fontWeight:700, fontSize:13, color:'#1e293b' }}>{linha.descricao}</div><div style={{ fontSize:10, color:'#94a3b8' }}>{linha.itensProducao.length} registro(s)</div></TableCell>
                              <TableCell style={{ textAlign:'center' }}><span style={{ fontFamily:'monospace', fontSize:11, fontWeight:700 }}>{linha.unidade}</span></TableCell>
                              <TableCell style={{ textAlign:'right', fontWeight:700, fontSize:13 }}>{linha.qtdTotal.toLocaleString('pt-BR')}</TableCell>
                              <TableCell style={{ textAlign:'center' }}>
                                {linha.encNome?<span style={{ fontSize:11, fontWeight:600, color:'#c2410c', background:'#fff7ed', border:'1px solid #fed7aa', borderRadius:20, padding:'2px 8px', whiteSpace:'nowrap' }}>👷 {linha.encNome.split(' ')[0]}</span>:<span style={{ fontSize:10, color:'#cbd5e1' }}>—</span>}
                                {linha.valorPremioEnc>0&&<div style={{ fontSize:10, color:'#c2410c', marginTop:1 }}>R${linha.valorPremioEnc.toFixed(2)}/un.</div>}
                              </TableCell>
                              <TableCell style={{ textAlign:'center' }}>
                                {linha.caboNome?<span style={{ fontSize:11, fontWeight:600, color:'#0369a1', background:'#f0f9ff', border:'1px solid #bae6fd', borderRadius:20, padding:'2px 8px', whiteSpace:'nowrap' }}>🔧 {linha.caboNome.split(' ')[0]}</span>:<span style={{ fontSize:10, color:'#cbd5e1' }}>—</span>}
                                {linha.valorPremioCabo>0&&<div style={{ fontSize:10, color:'#0369a1', marginTop:1 }}>R${linha.valorPremioCabo.toFixed(2)}/un.</div>}
                              </TableCell>
                              <TableCell style={{ textAlign:'right' }}><span style={{ fontSize:14, fontWeight:800, color:linha.totalPremioEnc>0?'#c2410c':'#cbd5e1' }}>{formatCurrency(linha.totalPremioEnc)}</span></TableCell>
                              <TableCell style={{ textAlign:'right' }}><span style={{ fontSize:14, fontWeight:800, color:linha.totalPremioCabo>0?'#0369a1':'#cbd5e1' }}>{formatCurrency(linha.totalPremioCabo)}</span></TableCell>
                              <TableCell/>
                            </TableRow>
                            {linha.itensProducao.map(prod=>{
                              const badge=badgeRetrabalho(prod.num_retrabalhos); const fator=fatorRetrabalho(prod.num_retrabalhos)
                              return (
                                <TableRow key={prod.id} style={{ background:'#f0f9ff' }}>
                                  <TableCell style={{ paddingTop:3, paddingBottom:3 }}/>
                                  <TableCell style={{ paddingTop:3, paddingBottom:3, paddingLeft:28 }}>
                                    <div style={{ display:'flex', alignItems:'center', gap:6 }}>
                                      <span style={{ fontSize:10, color:'#0369a1' }}>↳</span>
                                      <span style={{ fontSize:12, fontWeight:600, color:'#1e293b' }}>{prod.colaboradores?.nome??'—'}</span>
                                      {prod.colaboradores?.chapa&&<span style={{ fontSize:10, color:'#94a3b8', fontFamily:'monospace' }}>{prod.colaboradores.chapa}</span>}
                                      <span style={{ fontSize:10, color:'#64748b' }}>· {prod.data}</span>
                                    </div>
                                  </TableCell>
                                  <TableCell style={{ textAlign:'center', paddingTop:3, paddingBottom:3 }}><span style={{ fontFamily:'monospace', fontSize:10 }}>{linha.unidade}</span></TableCell>
                                  <TableCell style={{ textAlign:'right', paddingTop:3, paddingBottom:3 }}><span style={{ fontSize:12, fontWeight:600 }}>{prod.quantidade.toLocaleString('pt-BR')}</span></TableCell>
                                  <TableCell colSpan={2} style={{ paddingTop:3, paddingBottom:3 }}/>
                                  <TableCell style={{ textAlign:'right', paddingTop:3, paddingBottom:3 }}><span style={{ fontSize:11, fontWeight:700, color:fator>0?'#c2410c':'#dc2626' }}>{formatCurrency(prod.quantidade*linha.valorPremioEnc*fator)}</span></TableCell>
                                  <TableCell style={{ textAlign:'right', paddingTop:3, paddingBottom:3 }}><span style={{ fontSize:11, fontWeight:700, color:fator>0?'#0369a1':'#dc2626' }}>{formatCurrency(prod.quantidade*linha.valorPremioCabo*fator)}</span></TableCell>
                                  <TableCell style={{ textAlign:'center', paddingTop:3, paddingBottom:3 }}>
                                    <div style={{ display:'flex', alignItems:'center', gap:4, justifyContent:'center' }}>
                                      <span style={{ fontSize:10, fontWeight:700, padding:'2px 7px', borderRadius:20, background:badge.bg, color:badge.cor, border:`1px solid ${badge.border}`, whiteSpace:'nowrap' }}>{badge.label}</span>
                                      {canEdit&&<button title="Indicar retrabalho" onClick={()=>{ setModalRetrabalho({ producaoId:prod.id, colaboradorNome:prod.colaboradores?.nome??'—', descricao:linha.descricao, numAtual:prod.num_retrabalhos??0 }); setNovoRetrab(prod.num_retrabalhos??0) }} style={{ background:'#f1f5f9', border:'1px solid #e2e8f0', borderRadius:6, padding:'2px 6px', cursor:'pointer', fontSize:10, color:'#475569', display:'flex', alignItems:'center', gap:3 }}><RotateCcw size={9}/> editar</button>}
                                    </div>
                                  </TableCell>
                                </TableRow>
                              )
                            })}
                          </React.Fragment>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                )}

                {/* Rodapé resumo */}
                {linhasAtividade.length>0&&(
                  <div style={{ padding:'14px 18px', borderTop:'2px solid #e2e8f0', background:'#f8fafc' }}>
                    <div style={{ display:'flex', gap:24, flexWrap:'wrap', marginBottom:12 }}>
                      <div>
                        <div style={{ fontSize:10, fontWeight:700, color:'#c2410c', textTransform:'uppercase', letterSpacing:'0.05em', marginBottom:6 }}>👷 Encarregado(s) recebem</div>
                        {resumoEncObra.size===0?<div style={{ fontSize:12, color:'#94a3b8', fontStyle:'italic' }}>— Nenhum encarregado vinculado —</div>
                         :[...resumoEncObra.entries()].map(([id,val])=>{ const c=colabsMap.get(id); return <div key={id} style={{ display:'flex', alignItems:'center', gap:8, marginBottom:3 }}><HardHat size={13} color="#c2410c"/><span style={{ fontSize:13, fontWeight:700, color:'#1e293b' }}>{c?.nome??id}</span><span style={{ fontSize:16, fontWeight:800, color:'#c2410c' }}>{formatCurrency(val)}</span></div> })}
                      </div>
                      <div>
                        <div style={{ fontSize:10, fontWeight:700, color:'#0369a1', textTransform:'uppercase', letterSpacing:'0.05em', marginBottom:6 }}>🔧 Cabo(s) recebem</div>
                        {resumoCaboObra.size===0?<div style={{ fontSize:12, color:'#94a3b8', fontStyle:'italic' }}>— Nenhum cabo vinculado —</div>
                         :[...resumoCaboObra.entries()].map(([id,val])=>{ const c=colabsMap.get(id); return <div key={id} style={{ display:'flex', alignItems:'center', gap:8, marginBottom:3 }}><Users size={12} color="#0369a1"/><span style={{ fontSize:13, fontWeight:700, color:'#1e293b' }}>{c?.nome??id}</span><span style={{ fontSize:15, fontWeight:800, color:'#0369a1' }}>{formatCurrency(val)}</span></div> })}
                      </div>
                    </div>
                    {canCreate&&<div style={{ display:'flex', justifyContent:'flex-end' }}><Button onClick={calcularComissoes} disabled={calculando} style={{ gap:6, background:'#0d3f56', color:'#fff' }}><RefreshCw size={14} className={calculando?'animate-spin':''}/>{calculando?'Calculando…':`Gerar lançamento — ${mesLabel(competencia)}`}</Button></div>}
                  </div>
                )}

                {/* Lançamentos da obra */}
                <div style={{ padding:'14px 18px', borderTop:'2px solid #e2e8f0', background:'#fff' }}>
                  <div style={{ fontSize:13, fontWeight:700, color:'#1e293b', marginBottom:12, display:'flex', alignItems:'center', gap:6 }}><Award size={15} color="#f59e0b"/> Prêmios Lançados — {obraCalcSel.nome}</div>
                  <div style={{ display:'flex', gap:8, marginBottom:12, flexWrap:'wrap' }}>
                    <Select value={filtroStatus} onValueChange={setFiltroStatus}><SelectTrigger style={{ width:160, height:32 }}><SelectValue placeholder="Status"/></SelectTrigger><SelectContent><SelectItem value="todos">Todos</SelectItem><SelectItem value="pendente">⏳ Pendente</SelectItem><SelectItem value="aprovado">✅ Aprovado</SelectItem><SelectItem value="cancelado">❌ Cancelado</SelectItem></SelectContent></Select>
                    <div style={{ position:'relative', flex:1, minWidth:160 }}><Search size={12} style={{ position:'absolute', left:9, top:'50%', transform:'translateY(-50%)', color:'#94a3b8' }}/><Input value={busca} onChange={e=>setBusca(e.target.value)} placeholder="Buscar…" style={{ paddingLeft:28, height:32 }}/></div>
                  </div>
                  <div style={{ display:'grid', gridTemplateColumns:'repeat(3,1fr)', gap:8, marginBottom:12 }}>
                    {[
                      {label:'Pendente',valor:formatCurrency(comissoes.filter(c=>c.obra_id===obraCalcSel.id&&c.status==='pendente').reduce((s,c)=>s+c.valor_final,0)),cor:'#b45309',bg:'#fffbeb',icon:'⏳'},
                      {label:'Aprovado',valor:formatCurrency(comissoes.filter(c=>c.obra_id===obraCalcSel.id&&c.status==='aprovado').reduce((s,c)=>s+c.valor_final,0)),cor:'#15803d',bg:'#f0fdf4',icon:'✅'},
                      {label:'Total',valor:formatCurrency(comissoes.filter(c=>c.obra_id===obraCalcSel.id).reduce((s,c)=>s+c.valor_final,0)),cor:'#0d3f56',bg:'#f0f9ff',icon:'📊'},
                    ].map(card=><div key={card.label} style={{ background:card.bg, border:`1px solid ${card.cor}22`, borderRadius:8, padding:'10px 12px' }}><div style={{ fontSize:10, fontWeight:600, color:'#64748b', marginBottom:2 }}>{card.icon} {card.label}</div><div style={{ fontSize:16, fontWeight:800, color:card.cor }}>{card.valor}</div></div>)}
                  </div>
                  {comissoes.filter(c=>c.obra_id===obraCalcSel.id).length===0?(
                    <div style={{ padding:20, textAlign:'center', color:'#94a3b8', fontSize:12, background:'#f8fafc', borderRadius:8 }}>Nenhum lançamento. Clique em "Gerar lançamento" acima.</div>
                  ):(
                    <div style={{ border:'1px solid #e2e8f0', borderRadius:8, overflow:'hidden' }}>
                      <Table>
                        <TableHeader><TableRow style={{ background:'#f8fafc' }}><TableHead>Colaborador</TableHead><TableHead style={{ textAlign:'center' }}>Função</TableHead><TableHead style={{ textAlign:'right', fontWeight:800 }}>💰 Premiação</TableHead><TableHead style={{ textAlign:'center' }}>Status</TableHead><TableHead style={{ textAlign:'center' }}>Ações</TableHead></TableRow></TableHeader>
                        <TableBody>
                          {comissoes.filter(c=>c.obra_id===obraCalcSel.id&&(filtroStatus==='todos'||c.status===filtroStatus)&&(!busca||(c.colaboradores?.nome??'').toLowerCase().includes(busca.toLowerCase()))).map((c,idx)=>{
                            const st=STATUS_COR[c.status]??STATUS_COR.pendente
                            return (
                              <TableRow key={c.id} style={{ background:idx%2===0?'transparent':'#fafafa' }}>
                                <TableCell><div style={{ fontWeight:700, fontSize:13, color:'#1e293b' }}>{c.colaboradores?.nome??'—'}</div>{c.colaboradores?.chapa&&<div style={{ fontSize:10, color:'#94a3b8', fontFamily:'monospace' }}>{c.colaboradores.chapa}</div>}</TableCell>
                                <TableCell style={{ textAlign:'center' }}><span style={{ fontSize:11, fontWeight:700, padding:'3px 9px', borderRadius:20, whiteSpace:'nowrap', background:c.funcao==='encarregado'?'#fff7ed':'#f0f9ff', color:c.funcao==='encarregado'?'#c2410c':'#0369a1', border:`1px solid ${c.funcao==='encarregado'?'#fed7aa':'#bae6fd'}` }}>{c.funcao==='encarregado'?'👷 Encarregado':'🔧 Cabo'}</span></TableCell>
                                <TableCell style={{ textAlign:'right', fontWeight:800, fontSize:16, color:c.valor_final>0?'#15803d':'#dc2626' }}>{formatCurrency(c.valor_final)}{c.funcao==='cabo'&&c.num_cabos>1&&<div style={{ fontSize:10, color:'#64748b', fontWeight:400 }}>÷ {c.num_cabos} cabos</div>}</TableCell>
                                <TableCell style={{ textAlign:'center' }}>
                                  <span style={{ fontSize:10, fontWeight:700, padding:'3px 9px', borderRadius:20, whiteSpace:'nowrap', background:st.bg, color:st.cor, border:`1px solid ${st.border}` }}>{st.label}</span>
                                  {c.status==='aprovado'&&<div style={{ fontSize:9, color:'#64748b', marginTop:1 }}>🔒 protegido</div>}
                                </TableCell>
                                <TableCell style={{ textAlign:'center' }}>
                                  <div style={{ display:'flex', gap:3, justifyContent:'center' }}>
                                    {c.status==='pendente'&&<><Button variant="ghost" size="icon" style={{ width:26, height:26 }} title="Aprovar" onClick={()=>setAprovarCom(c)}><CheckCircle2 size={12} color="#15803d"/></Button><Button variant="ghost" size="icon" style={{ width:26, height:26 }} title="Cancelar" onClick={()=>setCancelarCom(c)}><XCircle size={12} color="#dc2626"/></Button></>}
                                    {c.status==='aprovado'&&<span style={{ fontSize:10, color:'#15803d' }}>✅ Prêmio gerado</span>}
                                    {canDelete&&c.status!=='aprovado'&&<Button variant="ghost" size="icon" style={{ width:26, height:26 }} title="Excluir" onClick={()=>setDeleteCom(c)}><Trash2 size={12} color="#dc2626"/></Button>}
                                  </div>
                                </TableCell>
                              </TableRow>
                            )
                          })}
                        </TableBody>
                      </Table>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Modal Retrabalho */}
      <Dialog open={!!modalRetrabalho} onOpenChange={o=>{ if(!o) setModalRetrabalho(null) }}>
        <DialogContent style={{ maxWidth:420 }}>
          <DialogHeader><DialogTitle style={{ display:'flex', alignItems:'center', gap:8 }}><RotateCcw size={16} color="#b45309"/> Indicar Retrabalho</DialogTitle></DialogHeader>
          <div style={{ padding:'12px 0' }}>
            <div style={{ background:'#f8fafc', borderRadius:8, padding:'10px 14px', marginBottom:14 }}>
              <div style={{ fontSize:12, color:'#64748b', marginBottom:2 }}>Produção</div>
              <div style={{ fontWeight:700, fontSize:14, color:'#1e293b' }}>{modalRetrabalho?.colaboradorNome}</div>
              <div style={{ fontSize:12, color:'#475569' }}>{modalRetrabalho?.descricao}</div>
            </div>
            <div style={{ marginBottom:14 }}>
              <div style={{ fontSize:12, fontWeight:600, color:'#475569', marginBottom:8 }}>Nº de Retrabalhos:</div>
              <div style={{ display:'flex', gap:8 }}>
                {[0,1,2].map(n=>{ const badge=badgeRetrabalho(n); const isSel=novoRetrab===n; return (
                  <button key={n} onClick={()=>setNovoRetrab(n)} style={{ flex:1, padding:'12px 8px', borderRadius:10, cursor:'pointer', border:isSel?`2px solid ${badge.cor}`:'2px solid #e2e8f0', background:isSel?badge.bg:'#fff', transition:'all 0.15s' }}>
                    <div style={{ fontSize:18, marginBottom:4 }}>{n===0?'✅':n===1?'⚠️':'❌'}</div>
                    <div style={{ fontSize:11, fontWeight:700, color:badge.cor }}>{badge.label}</div>
                    <div style={{ fontSize:10, color:'#64748b', marginTop:2 }}>{n===0?'Integral':n===1?'50% da premiação':'Perde a premiação'}</div>
                  </button>
                )})}
              </div>
            </div>
            <div style={{ background:'#fffbeb', border:'1px solid #fde68a', borderRadius:8, padding:'8px 12px', fontSize:12, color:'#92400e' }}>
              <strong>Regra:</strong> 0 → 100% · 1 → 50% · 2+ → perde premiação desta produção
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={()=>setModalRetrabalho(null)}>Cancelar</Button>
            <Button disabled={salvandoRetrab} onClick={salvarRetrabalho} style={{ background:'#0d3f56', color:'#fff', gap:6 }}>{salvandoRetrab?'Salvando…':'✅ Salvar'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!aprovarCom} onOpenChange={o=>!o&&setAprovarCom(null)}>
        <AlertDialogContent><AlertDialogHeader><AlertDialogTitle>Aprovar premiação?</AlertDialogTitle>
          <AlertDialogDescription>
            Prêmio de <strong>{formatCurrency(aprovarCom?.valor_final??0)}</strong> para <strong>{aprovarCom?.colaboradores?.nome}</strong> ({aprovarCom?.funcao}) em {mesLabel(aprovarCom?.competencia??'')}.<br/><br/>
            <div style={{ background:'#f0fdf4', border:'1px solid #bbf7d0', borderRadius:6, padding:'8px 10px', fontSize:12, color:'#15803d', marginTop:4 }}>
              🔒 Após aprovação, este valor <strong>não será alterado</strong> mesmo que o encarregado/cabo seja substituído.
            </div>
            <br/><details style={{ fontSize:12, color:'#475569' }}><summary style={{ cursor:'pointer', fontWeight:600 }}>Ver detalhes da produção</summary><pre style={{ whiteSpace:'pre-wrap', marginTop:8, fontSize:11 }}>{aprovarCom?.observacoes??'—'}</pre></details>
          </AlertDialogDescription>
        </AlertDialogHeader>
          <AlertDialogFooter><AlertDialogCancel>Cancelar</AlertDialogCancel><AlertDialogAction onClick={handleAprovar} style={{ background:'#15803d', color:'#fff' }}>✅ Aprovar</AlertDialogAction></AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      <AlertDialog open={!!cancelarCom} onOpenChange={o=>!o&&setCancelarCom(null)}>
        <AlertDialogContent><AlertDialogHeader><AlertDialogTitle>Cancelar premiação?</AlertDialogTitle><AlertDialogDescription>A premiação de <strong>{cancelarCom?.colaboradores?.nome}</strong> ({formatCurrency(cancelarCom?.valor_final??0)}) será cancelada.</AlertDialogDescription></AlertDialogHeader>
          <AlertDialogFooter><AlertDialogCancel>Voltar</AlertDialogCancel><AlertDialogAction onClick={handleCancelar} style={{ background:'#dc2626', color:'#fff' }}>Cancelar</AlertDialogAction></AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      <AlertDialog open={!!deleteCom} onOpenChange={o=>!o&&setDeleteCom(null)}>
        <AlertDialogContent><AlertDialogHeader><AlertDialogTitle>Excluir lançamento?</AlertDialogTitle><AlertDialogDescription>Esta ação é irreversível.</AlertDialogDescription></AlertDialogHeader>
          <AlertDialogFooter><AlertDialogCancel>Cancelar</AlertDialogCancel><AlertDialogAction onClick={handleDelete} style={{ background:'#dc2626', color:'#fff' }}>Excluir</AlertDialogAction></AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
