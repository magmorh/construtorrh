import React, { useEffect, useState, useCallback, useMemo } from 'react'
import { toast } from 'sonner'
import {
  Building2, ChevronRight, DollarSign, Search, Trophy,
  RefreshCw, HardHat, Users, CheckCircle2, XCircle,
  Trash2, AlertTriangle, Award,
} from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { formatCurrency } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { PageHeader } from '@/components/Shared'
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
import { traduzirErro } from '@/lib/erros'

// ─── Tipos ────────────────────────────────────────────────────────────────────
interface Obra { id: string; nome: string; codigo: string | null }

interface ObraVinculo {
  id: string; obra_id: string; colaborador_id: string
  funcao: 'encarregado' | 'cabo'; ativo: boolean
  colaboradores?: { nome: string; chapa: string | null }
}

/** playbook_precos para a obra com nome da atividade */
interface PlaybookPreco {
  id: string; atividade_id: string; obra_id: string
  preco_unitario: number
  valor_premiacao_enc: number | null
  valor_premiacao_cabo: number | null
  encarregado_id: string | null
  cabo_id: string | null
  playbook_atividades?: { descricao: string; unidade: string; categoria: string | null }
}

/** ponto_producao ou portal_producao — linha de produção */
interface ProducaoItem {
  id: string
  colaborador_id: string | null
  obra_id: string | null
  playbook_item_id: string | null
  quantidade: number
  mes_referencia?: string
  data?: string
  retrabalhos?: number          // 0, 1 ou 2+ (armazenado aqui; default null = 0)
  colaboradores?: { nome: string; chapa: string | null }
  playbook_itens?: { descricao: string; unidade: string; categoria: string | null }
}

interface ComissaoRow {
  id: string; obra_id: string | null; colaborador_id: string
  funcao: 'encarregado' | 'cabo'; descricao: string | null
  quantidade_total: number; valor_unitario_premiacao: number
  valor_bruto: number; num_cabos: number; valor_final: number
  competencia: string; status: string; premio_id: string | null; observacoes: string | null
  data_geracao: string
  obras?: { nome: string } | null
  colaboradores?: { nome: string; chapa: string | null }
}

type Aba = 'comissao' | 'calculo'

const MESES = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro']
function mesLabel(ym: string) {
  if (!ym) return '—'
  const [y, m] = ym.split('-')
  return `${MESES[+m - 1]} / ${y}`
}

/** Fator de premiação conforme retrabalhos: 0→1.0  1→0.5  2+→0 */
function fatorRetrabalho(retrabalhos: number): number {
  if (retrabalhos === 0) return 1.0
  if (retrabalhos === 1) return 0.5
  return 0
}

function badgeRetrabalho(r: number) {
  if (r === 0) return { bg: '#f0fdf4', cor: '#15803d', border: '#bbf7d0', label: '✅ Sem retrabalho (100%)' }
  if (r === 1) return { bg: '#fffbeb', cor: '#b45309', border: '#fde68a', label: '⚠️ 1 retrabalho (50%)' }
  return { bg: '#fee2e2', cor: '#dc2626', border: '#fecaca', label: '❌ 2+ retrabalhos (0%)' }
}

const STATUS_COR: Record<string, { bg: string; border: string; cor: string; label: string }> = {
  pendente:  { bg: '#fef3c7', border: '#fde68a', cor: '#b45309', label: '⏳ Pendente'  },
  aprovado:  { bg: '#dcfce7', border: '#bbf7d0', cor: '#15803d', label: '✅ Aprovado'  },
  cancelado: { bg: '#fee2e2', border: '#fecaca', cor: '#dc2626', label: '❌ Cancelado' },
}

// ─── Componente ───────────────────────────────────────────────────────────────
export default function ComissaoEquipe() {
  const { permissions: { canCreate, canEdit, canDelete } } = useProfile()
  const [aba, setAba] = useState<Aba>('comissao')

  // ── Dados base ──────────────────────────────────────────────────────────────
  const [obras,      setObras]      = useState<Obra[]>([])
  const [vinculos,   setVinculos]   = useState<ObraVinculo[]>([])
  const [precos,     setPrecos]     = useState<PlaybookPreco[]>([])
  const [producoes,  setProducoes]  = useState<ProducaoItem[]>([])
  const [comissoes,  setComissoes]  = useState<ComissaoRow[]>([])
  const [loading,    setLoading]    = useState(true)

  // ── Filtros globais ─────────────────────────────────────────────────────────
  const [competencia, setCompetencia] = useState(new Date().toISOString().slice(0, 7))

  // ── Aba 1: Comissão por Obra ─────────────────────────────────────────────────
  const [obraSel,    setObraSel]    = useState<Obra | null>(null)
  const [searchObra, setSearchObra] = useState('')

  // ── Aba 2: Cálculo de Premiação ──────────────────────────────────────────────
  const [filtroObra,   setFiltroObra]   = useState('todas')
  const [filtroStatus, setFiltroStatus] = useState('todos')
  const [busca,        setBusca]        = useState('')
  const [calculando,   setCalculando]   = useState(false)
  const [aprovarCom,   setAprovarCom]   = useState<ComissaoRow | null>(null)
  const [cancelarCom,  setCancelarCom]  = useState<ComissaoRow | null>(null)
  const [deleteCom,    setDeleteCom]    = useState<ComissaoRow | null>(null)

  // ── Modal de retrabalho ──────────────────────────────────────────────────────
  // { prodId, retrabalhos, colaboradorNome, atividadeDescricao, quantidade }
  const [modalRetrabalho, setModalRetrabalho] = useState<{
    prodId: string; retrabalhos: number
    colaboradorNome: string; atividadeDescricao: string; quantidade: number
  } | null>(null)
  const [savingRetrab, setSavingRetrab] = useState(false)

  // ─── Fetch ──────────────────────────────────────────────────────────────────
  const fetchData = useCallback(async () => {
    setLoading(true)
    const mesInicio = `${competencia}-01`
    const mesFim    = `${competencia}-31`

    const [obrRes, vinRes, preRes, proRes, comRes] = await Promise.all([
      supabase.from('obras').select('id, nome, codigo').order('nome'),
      supabase.from('obra_vinculos_equipe')
        .select('id, obra_id, colaborador_id, funcao, ativo, colaboradores(nome, chapa)')
        .eq('ativo', true),
      supabase.from('playbook_precos')
        .select('id, atividade_id, obra_id, preco_unitario, valor_premiacao_enc, valor_premiacao_cabo, encarregado_id, cabo_id, playbook_atividades(descricao, unidade, categoria)')
        .not('valor_premiacao_enc', 'is', null),
      supabase.from('ponto_producao')
        .select('id, colaborador_id, obra_id, playbook_item_id, quantidade, mes_referencia, retrabalhos, colaboradores(nome, chapa), playbook_itens(descricao, unidade, categoria)')
        .gte('mes_referencia', `${competencia}-01`)
        .lte('mes_referencia', `${competencia}-31`),
      supabase.from('comissoes_equipe_v2')
        .select('*, obras(nome), colaboradores(nome, chapa)')
        .eq('competencia', competencia)
        .order('created_at', { ascending: false }),
    ])

    setObras((obrRes.data ?? []) as Obra[])
    setVinculos((vinRes.data ?? []) as ObraVinculo[])
    setPrecos((preRes.data ?? []) as PlaybookPreco[])

    // ponto_producao com fallback: se der erro de coluna retrabalhos, busca sem ela
    if (proRes.error) {
      console.warn('[ComissaoEquipe] ponto_producao com retrabalhos falhou, tentando sem:', proRes.error.message)
      const { data: proFallback } = await supabase.from('ponto_producao')
        .select('id, colaborador_id, obra_id, playbook_item_id, quantidade, mes_referencia, colaboradores(nome, chapa), playbook_itens(descricao, unidade, categoria)')
        .gte('mes_referencia', `${competencia}-01`)
        .lte('mes_referencia', `${competencia}-31`)
      setProducoes((proFallback ?? []).map((p: any) => ({ ...p, retrabalhos: p.retrabalhos ?? 0 })) as ProducaoItem[])
    } else {
      setProducoes((proRes.data ?? []).map((p: any) => ({ ...p, retrabalhos: p.retrabalhos ?? 0 })) as ProducaoItem[])
    }

    setComissoes((comRes.data ?? []) as ComissaoRow[])
    setLoading(false)
  }, [competencia])

  useEffect(() => { fetchData() }, [fetchData])

  // ─── Salvar retrabalho numa linha de produção ────────────────────────────────
  async function salvarRetrabalho(prodId: string, retrabalhos: number) {
    setSavingRetrab(true)
    const { error } = await supabase.from('ponto_producao')
      .update({ retrabalhos })
      .eq('id', prodId)
    setSavingRetrab(false)
    if (error) {
      if (error.code === '42703') {
        toast.error('⚠️ Execute a migração SQL para adicionar a coluna retrabalhos. Veja abaixo.')
      } else {
        toast.error(traduzirErro(error.message))
      }
      return
    }
    toast.success('Retrabalho atualizado!')
    setModalRetrabalho(null)
    fetchData()
  }

  // ─── Calcular premiações ─────────────────────────────────────────────────────
  async function calcularComissoes() {
    if (!canCreate) return
    setCalculando(true)

    const vinculosPorObra = new Map<string, { encarregado: ObraVinculo | null; cabos: ObraVinculo[] }>()
    vinculos.forEach(v => {
      if (!vinculosPorObra.has(v.obra_id)) vinculosPorObra.set(v.obra_id, { encarregado: null, cabos: [] })
      const obj = vinculosPorObra.get(v.obra_id)!
      if (v.funcao === 'encarregado') obj.encarregado = v
      else obj.cabos.push(v)
    })

    let gerados = 0; let erros = 0

    for (const [obraId, equipe] of vinculosPorObra.entries()) {
      if (!equipe.encarregado && equipe.cabos.length === 0) continue
      const prodsObra = producoes.filter(p => p.obra_id === obraId)
      if (prodsObra.length === 0) continue

      let totalPremioEnc = 0; let totalPremioCabo = 0
      const detalhesEnc: string[] = []; const detalhesCabo: string[] = []

      for (const prod of prodsObra) {
        if (!prod.playbook_item_id) continue
        const preco = precos.find(p =>
          p.obra_id === obraId &&
          p.playbook_atividades?.descricao === prod.playbook_itens?.descricao
        )
        if (!preco) continue
        const fator = fatorRetrabalho(prod.retrabalhos ?? 0)
        const qtd   = prod.quantidade
        const descAtiv = prod.playbook_itens?.descricao ?? '?'
        const und      = prod.playbook_itens?.unidade   ?? ''
        const colab    = prod.colaboradores?.nome ?? '?'

        const valEnc  = (preco.valor_premiacao_enc  ?? 0) * qtd * fator
        const valCabo = (preco.valor_premiacao_cabo ?? 0) * qtd * fator

        if (valEnc > 0) {
          totalPremioEnc += valEnc
          const sufRetrab = fator < 1 ? ` [fator ${fator}]` : ''
          detalhesEnc.push(`${colab} – ${descAtiv}: ${qtd}${und} × R$${preco.valor_premiacao_enc?.toFixed(2)}${sufRetrab} = R$${valEnc.toFixed(2)}`)
        }
        if (valCabo > 0) {
          totalPremioCabo += valCabo
          const sufRetrab = fator < 1 ? ` [fator ${fator}]` : ''
          detalhesCabo.push(`${colab} – ${descAtiv}: ${qtd}${und} × R$${preco.valor_premiacao_cabo?.toFixed(2)}${sufRetrab} = R$${valCabo.toFixed(2)}`)
        }
      }

      if (equipe.encarregado && totalPremioEnc > 0) {
        const { error } = await supabase.from('comissoes_equipe_v2').upsert({
          obra_id: obraId, colaborador_id: equipe.encarregado.colaborador_id,
          funcao: 'encarregado', descricao: `Premiação Encarregado – ${detalhesEnc.join(' | ')}`,
          quantidade_total: prodsObra.reduce((s, p) => s + p.quantidade, 0),
          valor_unitario_premiacao: 0, valor_bruto: totalPremioEnc, num_cabos: 1,
          valor_final: totalPremioEnc, competencia, status: 'pendente',
          data_geracao: new Date().toISOString().slice(0, 10), observacoes: detalhesEnc.join('\n'),
        }, { onConflict: 'obra_id,colaborador_id,funcao,competencia', ignoreDuplicates: false })
        if (error) { console.error(error); erros++ } else gerados++
      }

      if (equipe.cabos.length > 0 && totalPremioCabo > 0) {
        const numCabos  = equipe.cabos.length
        const valPorCabo = totalPremioCabo / numCabos
        for (const cabo of equipe.cabos) {
          const { error } = await supabase.from('comissoes_equipe_v2').upsert({
            obra_id: obraId, colaborador_id: cabo.colaborador_id,
            funcao: 'cabo', descricao: `Premiação Cabo (${numCabos} cabo${numCabos > 1 ? 's' : ''}) – ${detalhesCabo.join(' | ')}`,
            quantidade_total: prodsObra.reduce((s, p) => s + p.quantidade, 0),
            valor_unitario_premiacao: 0, valor_bruto: totalPremioCabo, num_cabos: numCabos,
            valor_final: valPorCabo, competencia, status: 'pendente',
            data_geracao: new Date().toISOString().slice(0, 10), observacoes: detalhesCabo.join('\n'),
          }, { onConflict: 'obra_id,colaborador_id,funcao,competencia', ignoreDuplicates: false })
          if (error) { console.error(error); erros++ } else gerados++
        }
      }
    }

    setCalculando(false)
    if (erros > 0) toast.error(`${erros} erro(s) ao calcular. Verifique o console.`)
    else toast.success(`${gerados} premiação(ões) calculada(s) para ${mesLabel(competencia)}!`)
    fetchData()
  }

  async function handleAprovar() {
    if (!aprovarCom) return
    const { data: prem, error } = await supabase.from('premios').insert({
      colaborador_id: aprovarCom.colaborador_id, obra_id: aprovarCom.obra_id,
      tipo: 'Produtividade',
      descricao: `Premiação ${aprovarCom.funcao === 'encarregado' ? 'Encarregado' : 'Cabo'} — ${mesLabel(aprovarCom.competencia)}`,
      valor: aprovarCom.valor_final, data: new Date().toISOString().slice(0, 10),
      competencia: aprovarCom.competencia, observacoes: aprovarCom.observacoes ?? '', status: 'pendente',
    }).select('id').single()
    if (error || !prem) { toast.error('Erro ao criar prêmio'); return }
    await supabase.from('comissoes_equipe_v2').update({ status: 'aprovado', premio_id: prem.id }).eq('id', aprovarCom.id)
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

  // ─── Derivados: Aba Comissão por Obra ────────────────────────────────────────
  const precosObra = useMemo(() =>
    obraSel ? precos.filter(p => p.obra_id === obraSel.id) : [],
    [precos, obraSel]
  )

  const vinculosObra = useMemo(() =>
    obraSel ? vinculos.filter(v => v.obra_id === obraSel.id) : [],
    [vinculos, obraSel]
  )

  const encObra  = useMemo(() => vinculosObra.find(v => v.funcao === 'encarregado'), [vinculosObra])
  const cabosObra = useMemo(() => vinculosObra.filter(v => v.funcao === 'cabo'),      [vinculosObra])

  // Producoes da obra no mês, agrupadas por atividade
  const producaoObraAgrupada = useMemo(() => {
    if (!obraSel) return []
    const prodsObra = producoes.filter(p => p.obra_id === obraSel.id)
    // agrupar por playbook_item_id
    const map = new Map<string, {
      descricao: string; unidade: string; categoria: string | null
      linhas: ProducaoItem[]
      qtdTotal: number
    }>()
    prodsObra.forEach(p => {
      if (!p.playbook_item_id) return
      const key  = p.playbook_item_id
      const desc = p.playbook_itens?.descricao ?? key
      if (!map.has(key)) map.set(key, { descricao: desc, unidade: p.playbook_itens?.unidade ?? '', categoria: p.playbook_itens?.categoria ?? null, linhas: [], qtdTotal: 0 })
      const g = map.get(key)!
      g.linhas.push(p)
      g.qtdTotal += p.quantidade
    })
    return Array.from(map.values()).sort((a, b) => (a.categoria ?? '').localeCompare(b.categoria ?? '') || a.descricao.localeCompare(b.descricao))
  }, [producoes, obraSel])

  // Totais de comissão da obra
  const totaisObra = useMemo(() => {
    if (!obraSel) return { enc: 0, cabo: 0 }
    let enc = 0; let cabo = 0
    producoes.filter(p => p.obra_id === obraSel.id).forEach(prod => {
      const preco = precos.find(pr => pr.obra_id === obraSel.id && pr.playbook_atividades?.descricao === prod.playbook_itens?.descricao)
      if (!preco) return
      const fator = fatorRetrabalho(prod.retrabalhos ?? 0)
      enc  += (preco.valor_premiacao_enc  ?? 0) * prod.quantidade * fator
      cabo += (preco.valor_premiacao_cabo ?? 0) * prod.quantidade * fator
    })
    return { enc, cabo: cabosObra.length > 1 ? cabo / cabosObra.length : cabo }
  }, [producoes, precos, obraSel, cabosObra])

  // ─── Derivados: Aba Cálculo ──────────────────────────────────────────────────
  const comFiltradas = useMemo(() => {
    const q = busca.toLowerCase()
    return comissoes.filter(c =>
      (filtroObra   === 'todas' || c.obra_id === filtroObra) &&
      (filtroStatus === 'todos' || c.status === filtroStatus) &&
      (!q || (c.colaboradores?.nome ?? '').toLowerCase().includes(q) || (c.obras?.nome ?? '').toLowerCase().includes(q))
    )
  }, [comissoes, filtroObra, filtroStatus, busca])

  const totalPend  = comFiltradas.filter(c => c.status === 'pendente').reduce((s, c) => s + c.valor_final, 0)
  const totalAprov = comFiltradas.filter(c => c.status === 'aprovado').reduce((s, c) => s + c.valor_final, 0)
  const totalGeral = comFiltradas.reduce((s, c) => s + c.valor_final, 0)

  // ─── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="page-root" style={{ height: '100%' }}>
      <PageHeader
        title="Comissão de Equipe"
        subtitle={`Premiação por produção — ${mesLabel(competencia)}`}
        action={undefined}
      />

      {/* ── Abas + Filtro Competência ─────────────────────────────────────── */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid var(--border)', marginBottom: 18, flexWrap: 'wrap', gap: 8 }}>
        <div style={{ display: 'flex' }}>
          {([
            { key: 'comissao', label: '💰 Comissão por Obra' },
            { key: 'calculo',  label: '🏆 Cálculo de Premiação' },
          ] as const).map(t => (
            <button key={t.key} onClick={() => setAba(t.key)} style={{
              padding: '9px 18px', border: 'none', background: 'none', cursor: 'pointer',
              fontSize: 13, fontWeight: aba === t.key ? 700 : 400,
              color: aba === t.key ? 'var(--primary)' : 'var(--muted-foreground)',
              borderBottom: aba === t.key ? '2.5px solid var(--primary)' : '2.5px solid transparent',
              transition: 'all 0.15s',
            }}>{t.label}</button>
          ))}
        </div>
        {/* Seletor de competência */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'var(--card)', borderRadius: 9, border: '1px solid var(--border)', padding: '6px 14px' }}>
          <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--muted-foreground)' }}>Competência:</span>
          <input type="month" value={competencia} onChange={e => setCompetencia(e.target.value)}
            style={{ border: 'none', outline: 'none', fontSize: 13, fontWeight: 700, color: 'var(--primary)', background: 'transparent' }} />
        </div>
      </div>

      {/* ══════════════════════════════════════════════════════════════════════
          ABA 1: COMISSÃO POR OBRA
      ══════════════════════════════════════════════════════════════════════ */}
      {aba === 'comissao' && (
        <div style={{ display: 'grid', gridTemplateColumns: '260px 1fr', gap: 16, alignItems: 'start' }}>

          {/* ── Lista de Obras (esquerda) ── */}
          <div style={{ border: '1px solid var(--border)', borderRadius: 10, background: 'var(--card)', overflow: 'hidden' }}>
            <div style={{ padding: '12px 14px', borderBottom: '1px solid var(--border)', background: 'var(--muted)' }}>
              <p style={{ margin: '0 0 8px', fontSize: 13, fontWeight: 700, display: 'flex', alignItems: 'center', gap: 6 }}>
                <Building2 size={13} color="var(--primary)" /> Obras
              </p>
              <div style={{ position: 'relative' }}>
                <Search size={13} style={{ position: 'absolute', left: 9, top: '50%', transform: 'translateY(-50%)', color: 'var(--muted-foreground)' }} />
                <Input style={{ paddingLeft: 28, height: 30, fontSize: 12 }} placeholder="Filtrar…" value={searchObra} onChange={e => setSearchObra(e.target.value)} />
              </div>
            </div>
            <div style={{ maxHeight: 560, overflowY: 'auto' }}>
              {obras.filter(o => !searchObra || o.nome.toLowerCase().includes(searchObra.toLowerCase())).map(obra => {
                const isSel     = obraSel?.id === obra.id
                const qtdProds  = producoes.filter(p => p.obra_id === obra.id).length
                const temVincul = vinculos.some(v => v.obra_id === obra.id)
                return (
                  <button key={obra.id} type="button" onClick={() => setObraSel(obra)} style={{
                    display: 'flex', alignItems: 'center', gap: 10, width: '100%', padding: '11px 14px',
                    border: 'none', cursor: 'pointer', textAlign: 'left',
                    borderLeft: isSel ? '3px solid var(--primary)' : '3px solid transparent',
                    background: isSel ? 'rgba(37,99,235,0.06)' : 'transparent',
                    borderBottom: '1px solid var(--border)',
                  }}>
                    <div style={{
                      width: 34, height: 34, borderRadius: 8, flexShrink: 0,
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      fontSize: 11, fontWeight: 700,
                      background: isSel ? 'var(--primary)' : 'var(--muted)',
                      color: isSel ? '#fff' : 'var(--muted-foreground)',
                    }}>
                      {obra.codigo?.slice(0, 3).toUpperCase() ?? obra.nome.slice(0, 2).toUpperCase()}
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <p style={{ margin: 0, fontSize: 13, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontWeight: isSel ? 700 : 400, color: isSel ? 'var(--primary)' : 'var(--foreground)' }}>
                        {obra.nome}
                      </p>
                      <div style={{ display: 'flex', gap: 6, marginTop: 2, flexWrap: 'wrap' }}>
                        {qtdProds > 0 && <span style={{ fontSize: 10, color: '#15803d', background: '#f0fdf4', borderRadius: 20, padding: '1px 6px', border: '1px solid #bbf7d0' }}>{qtdProds} prod.</span>}
                        {!temVincul && <span style={{ fontSize: 10, color: '#94a3b8', background: '#f1f5f9', borderRadius: 20, padding: '1px 6px' }}>sem equipe</span>}
                      </div>
                    </div>
                    <ChevronRight size={13} color={isSel ? 'var(--primary)' : 'var(--border)'} />
                  </button>
                )
              })}
            </div>
          </div>

          {/* ── Painel Direito ── */}
          {!obraSel ? (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: 60, border: '2px dashed var(--border)', borderRadius: 10, color: 'var(--muted-foreground)', gap: 10 }}>
              <DollarSign size={38} style={{ opacity: 0.2 }} />
              <p style={{ margin: 0, fontSize: 15, fontWeight: 500 }}>Selecione uma obra</p>
              <p style={{ margin: 0, fontSize: 13 }}>← Escolha a obra para ver a comissão</p>
            </div>
          ) : (
            <div style={{ border: '1px solid var(--border)', borderRadius: 10, background: 'var(--card)', overflow: 'hidden' }}>

              {/* Header da obra */}
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 16px', background: 'var(--muted)', borderBottom: '1px solid var(--border)', flexWrap: 'wrap', gap: 8 }}>
                <div>
                  <div style={{ fontWeight: 700, fontSize: 15 }}>
                    {obraSel.nome}
                    {obraSel.codigo && <span style={{ marginLeft: 8, fontSize: 11, padding: '2px 7px', borderRadius: 20, background: 'rgba(37,99,235,0.1)', color: 'var(--primary)', fontFamily: 'monospace' }}>{obraSel.codigo}</span>}
                  </div>
                  <div style={{ fontSize: 12, color: 'var(--muted-foreground)', marginTop: 2 }}>{mesLabel(competencia)}</div>
                </div>
                {/* Chips de equipe */}
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                  {encObra ? (
                    <span style={{ fontSize: 11, fontWeight: 700, padding: '4px 10px', borderRadius: 20, background: '#fff7ed', color: '#c2410c', border: '1px solid #fed7aa' }}>
                      👷 {encObra.colaboradores?.nome?.split(' ')[0] ?? 'Enc.'}
                    </span>
                  ) : (
                    <span style={{ fontSize: 11, color: '#94a3b8', background: '#f1f5f9', borderRadius: 20, padding: '4px 10px', border: '1px solid #e2e8f0' }}>👷 Sem enc.</span>
                  )}
                  {cabosObra.length > 0 ? cabosObra.map(c => (
                    <span key={c.id} style={{ fontSize: 11, fontWeight: 700, padding: '4px 10px', borderRadius: 20, background: '#f0f9ff', color: '#0369a1', border: '1px solid #bae6fd' }}>
                      🔧 {c.colaboradores?.nome?.split(' ')[0] ?? 'Cabo'}
                    </span>
                  )) : (
                    <span style={{ fontSize: 11, color: '#94a3b8', background: '#f1f5f9', borderRadius: 20, padding: '4px 10px', border: '1px solid #e2e8f0' }}>🔧 Sem cabo</span>
                  )}
                </div>
              </div>

              {/* Cards de totais */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 10, padding: '12px 16px', borderBottom: '1px solid var(--border)', background: '#fafcff' }}>
                {[
                  { label: 'Total Produzido', valor: `${producoes.filter(p => p.obra_id === obraSel.id).reduce((s,p) => s + p.quantidade, 0).toLocaleString('pt-BR')} un.`, cor: '#0d3f56', bg: '#f0f9ff', icon: '📦' },
                  { label: encObra ? `Premiação Enc. (${encObra.colaboradores?.nome?.split(' ')[0]})` : 'Premiação Enc.', valor: formatCurrency(totaisObra.enc), cor: '#c2410c', bg: '#fff7ed', icon: '👷' },
                  { label: cabosObra.length > 1 ? `Premiação Cabo (cada, ÷${cabosObra.length})` : 'Premiação Cabo', valor: formatCurrency(totaisObra.cabo), cor: '#0369a1', bg: '#f0f9ff', icon: '🔧' },
                ].map(card => (
                  <div key={card.label} style={{ background: card.bg, borderRadius: 9, padding: '10px 14px', border: `1px solid ${card.cor}22` }}>
                    <div style={{ fontSize: 10, fontWeight: 600, color: '#64748b', marginBottom: 3 }}>{card.icon} {card.label}</div>
                    <div style={{ fontSize: 18, fontWeight: 800, color: card.cor }}>{card.valor}</div>
                  </div>
                ))}
              </div>

              {/* Tabela de atividades com produção */}
              {producaoObraAgrupada.length === 0 ? (
                <div style={{ padding: 40, textAlign: 'center', color: 'var(--muted-foreground)' }}>
                  Nenhuma produção lançada para esta obra em {mesLabel(competencia)}.
                </div>
              ) : (
                <div style={{ overflowX: 'auto' }}>
                  <Table>
                    <TableHeader>
                      <TableRow style={{ background: 'var(--muted)' }}>
                        <TableHead>Atividade</TableHead>
                        <TableHead style={{ width: 90, textAlign: 'center' }}>Unidade</TableHead>
                        <TableHead style={{ width: 110 }}>Categoria</TableHead>
                        <TableHead style={{ width: 120, textAlign: 'right' }}>R$ Enc./un.</TableHead>
                        <TableHead style={{ width: 120, textAlign: 'right' }}>R$ Cabo/un.</TableHead>
                        <TableHead style={{ width: 130, textAlign: 'right', fontWeight: 800 }}>Qtd. Produzida</TableHead>
                        <TableHead style={{ width: 130, textAlign: 'right' }}>💰 Comissão Enc.</TableHead>
                        <TableHead style={{ width: 130, textAlign: 'right' }}>💰 Comissão Cabo</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {producaoObraAgrupada.map((grupo, idx) => {
                        const preco = precos.find(p => p.obra_id === obraSel.id && p.playbook_atividades?.descricao === grupo.descricao)
                        // Comissão considera retrabalhos por linha
                        let comEnc = 0; let comCabo = 0
                        grupo.linhas.forEach(l => {
                          const fator = fatorRetrabalho(l.retrabalhos ?? 0)
                          comEnc  += (preco?.valor_premiacao_enc  ?? 0) * l.quantidade * fator
                          comCabo += (preco?.valor_premiacao_cabo ?? 0) * l.quantidade * fator
                        })
                        const cabosDiv = cabosObra.length > 1 ? cabosObra.length : 1
                        return (
                          <React.Fragment key={grupo.descricao}>
                            {/* Linha de totais da atividade */}
                            <TableRow style={{ background: idx % 2 === 0 ? 'transparent' : 'var(--muted)/10', fontWeight: 600 }}>
                              <TableCell>
                                <div style={{ fontWeight: 700, fontSize: 13 }}>{grupo.descricao}</div>
                                <div style={{ fontSize: 10, color: 'var(--muted-foreground)', marginTop: 2 }}>
                                  {grupo.linhas.length} lançamento(s) · clique ▼ para ver retrabalhos
                                </div>
                              </TableCell>
                              <TableCell style={{ textAlign: 'center' }}>
                                <span style={{ fontFamily: 'monospace', fontSize: 11, fontWeight: 700 }}>{grupo.unidade}</span>
                              </TableCell>
                              <TableCell>
                                {grupo.categoria && <span style={{ fontSize: 11, background: 'rgba(37,99,235,0.07)', color: 'var(--primary)', borderRadius: 4, padding: '2px 7px' }}>{grupo.categoria}</span>}
                              </TableCell>
                              <TableCell style={{ textAlign: 'right', fontSize: 12, color: preco?.valor_premiacao_enc ? '#15803d' : '#cbd5e1', fontWeight: 700 }}>
                                {preco?.valor_premiacao_enc ? formatCurrency(preco.valor_premiacao_enc) : '—'}
                              </TableCell>
                              <TableCell style={{ textAlign: 'right', fontSize: 12, color: preco?.valor_premiacao_cabo ? '#b45309' : '#cbd5e1', fontWeight: 700 }}>
                                {preco?.valor_premiacao_cabo ? formatCurrency(preco.valor_premiacao_cabo) : '—'}
                              </TableCell>
                              <TableCell style={{ textAlign: 'right', fontWeight: 800, fontSize: 15, color: '#0d3f56' }}>
                                {grupo.qtdTotal.toLocaleString('pt-BR')} {grupo.unidade}
                              </TableCell>
                              <TableCell style={{ textAlign: 'right', fontWeight: 800, fontSize: 14, color: comEnc > 0 ? '#c2410c' : '#cbd5e1' }}>
                                {comEnc > 0 ? formatCurrency(comEnc) : '—'}
                              </TableCell>
                              <TableCell style={{ textAlign: 'right', fontWeight: 800, fontSize: 14, color: comCabo > 0 ? '#0369a1' : '#cbd5e1' }}>
                                {comCabo > 0 ? formatCurrency(comCabo / cabosDiv) : '—'}
                                {cabosObra.length > 1 && comCabo > 0 && <div style={{ fontSize: 9, color: '#94a3b8', fontWeight: 400 }}>÷{cabosDiv} = {formatCurrency(comCabo / cabosDiv)}</div>}
                              </TableCell>
                            </TableRow>

                            {/* Sub-linhas: cada lançamento com controle de retrabalho */}
                            {grupo.linhas.map(linha => {
                              const ret = linha.retrabalhos ?? 0
                              const badge = badgeRetrabalho(ret)
                              const fator = fatorRetrabalho(ret)
                              const valEncLinha  = (preco?.valor_premiacao_enc  ?? 0) * linha.quantidade * fator
                              const valCaboLinha = (preco?.valor_premiacao_cabo ?? 0) * linha.quantidade * fator
                              return (
                                <TableRow key={linha.id} style={{ background: '#fafcff', borderTop: '1px dashed #e2e8f0' }}>
                                  <TableCell style={{ paddingLeft: 28, paddingTop: 6, paddingBottom: 6 }}>
                                    <div style={{ fontSize: 12, color: '#64748b' }}>
                                      👤 {linha.colaboradores?.nome ?? '—'}
                                      {linha.colaboradores?.chapa && <span style={{ fontSize: 10, fontFamily: 'monospace', marginLeft: 5, color: '#94a3b8' }}>({linha.colaboradores.chapa})</span>}
                                    </div>
                                  </TableCell>
                                  <TableCell style={{ textAlign: 'center', paddingTop: 6, paddingBottom: 6 }}>
                                    <span style={{ fontSize: 12, color: '#475569' }}>{linha.quantidade} {grupo.unidade}</span>
                                  </TableCell>
                                  <TableCell colSpan={3} style={{ paddingTop: 6, paddingBottom: 6 }}>
                                    {/* Badge de retrabalho + botão editar */}
                                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                      <span style={{ fontSize: 10, fontWeight: 700, padding: '3px 8px', borderRadius: 20, background: badge.bg, color: badge.cor, border: `1px solid ${badge.border}`, whiteSpace: 'nowrap' }}>
                                        {badge.label}
                                      </span>
                                      {canEdit && (
                                        <button type="button" onClick={() => setModalRetrabalho({ prodId: linha.id, retrabalhos: ret, colaboradorNome: linha.colaboradores?.nome ?? '?', atividadeDescricao: grupo.descricao, quantidade: linha.quantidade })}
                                          style={{ fontSize: 10, color: 'var(--primary)', border: '1px solid var(--primary)', borderRadius: 6, padding: '2px 8px', background: 'transparent', cursor: 'pointer', fontWeight: 600 }}>
                                          ✏️ Indicar retrabalho
                                        </button>
                                      )}
                                    </div>
                                  </TableCell>
                                  <TableCell style={{ textAlign: 'right', fontSize: 12, color: '#64748b', paddingTop: 6, paddingBottom: 6 }}>
                                    {linha.quantidade} {grupo.unidade}
                                  </TableCell>
                                  <TableCell style={{ textAlign: 'right', fontSize: 12, fontWeight: 700, color: valEncLinha > 0 ? '#c2410c' : '#cbd5e1', paddingTop: 6, paddingBottom: 6 }}>
                                    {valEncLinha > 0 ? formatCurrency(valEncLinha) : ret >= 2 ? <span style={{ fontSize: 10, color: '#dc2626' }}>❌ perdeu</span> : '—'}
                                  </TableCell>
                                  <TableCell style={{ textAlign: 'right', fontSize: 12, fontWeight: 700, color: valCaboLinha > 0 ? '#0369a1' : '#cbd5e1', paddingTop: 6, paddingBottom: 6 }}>
                                    {valCaboLinha > 0 ? formatCurrency(valCaboLinha / cabosDiv) : ret >= 2 ? <span style={{ fontSize: 10, color: '#dc2626' }}>❌ perdeu</span> : '—'}
                                  </TableCell>
                                </TableRow>
                              )
                            })}
                          </React.Fragment>
                        )
                      })}
                    </TableBody>
                  </Table>
                </div>
              )}

              {/* Rodapé totais */}
              {producaoObraAgrupada.length > 0 && (
                <div style={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'center', gap: 20, padding: '10px 16px', borderTop: '2px solid var(--border)', background: 'var(--muted)', flexWrap: 'wrap' }}>
                  <span style={{ fontSize: 12, color: 'var(--muted-foreground)' }}>{producoes.filter(p => p.obra_id === obraSel.id).length} lançamento(s) no mês</span>
                  <span style={{ fontSize: 13, fontWeight: 700, color: '#c2410c' }}>👷 Enc.: {formatCurrency(totaisObra.enc)}</span>
                  <span style={{ fontSize: 13, fontWeight: 700, color: '#0369a1' }}>🔧 Cabo: {formatCurrency(totaisObra.cabo)}{cabosObra.length > 1 ? ` (cada)` : ''}</span>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════════════
          ABA 2: CÁLCULO DE PREMIAÇÃO
      ══════════════════════════════════════════════════════════════════════ */}
      {aba === 'calculo' && (
        <div>
          {/* Filtros + botão calcular */}
          <div style={{ display: 'flex', gap: 10, marginBottom: 16, flexWrap: 'wrap', alignItems: 'center' }}>
            <Select value={filtroObra} onValueChange={setFiltroObra}>
              <SelectTrigger style={{ width: 200 }}><SelectValue placeholder="Obra" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="todas">Todas as obras</SelectItem>
                {obras.map(o => <SelectItem key={o.id} value={o.id}>{o.nome}</SelectItem>)}
              </SelectContent>
            </Select>
            <Select value={filtroStatus} onValueChange={setFiltroStatus}>
              <SelectTrigger style={{ width: 160 }}><SelectValue placeholder="Status" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="todos">Todos</SelectItem>
                <SelectItem value="pendente">⏳ Pendente</SelectItem>
                <SelectItem value="aprovado">✅ Aprovado</SelectItem>
                <SelectItem value="cancelado">❌ Cancelado</SelectItem>
              </SelectContent>
            </Select>
            <div style={{ position: 'relative', flex: 1, minWidth: 180 }}>
              <Search size={13} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: '#94a3b8' }} />
              <Input value={busca} onChange={e => setBusca(e.target.value)} placeholder="Buscar colaborador, obra…" style={{ paddingLeft: 30 }} />
            </div>
            {canCreate && (
              <Button onClick={calcularComissoes} disabled={calculando} style={{ gap: 6, background: '#0d3f56', color: '#fff', flexShrink: 0 }}>
                <RefreshCw size={14} className={calculando ? 'animate-spin' : ''} />
                {calculando ? 'Calculando…' : `Recalcular ${mesLabel(competencia)}`}
              </Button>
            )}
          </div>

          {/* Cards de totais */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12, marginBottom: 16 }}>
            {[
              { label: '⏳ Pendente', valor: formatCurrency(totalPend), cor: '#b45309', bg: '#fffbeb' },
              { label: '✅ Aprovado', valor: formatCurrency(totalAprov), cor: '#15803d', bg: '#f0fdf4' },
              { label: '📊 Total', valor: formatCurrency(totalGeral), cor: '#0d3f56', bg: '#f0f9ff' },
            ].map(card => (
              <div key={card.label} style={{ background: card.bg, borderRadius: 10, padding: '12px 16px', border: `1px solid ${card.cor}22` }}>
                <div style={{ fontSize: 11, fontWeight: 600, color: '#64748b', marginBottom: 3 }}>{card.label}</div>
                <div style={{ fontSize: 20, fontWeight: 800, color: card.cor }}>{card.valor}</div>
              </div>
            ))}
          </div>

          {/* Info retrabalho */}
          <div style={{ background: '#f0f9ff', border: '1px solid #bae6fd', borderRadius: 8, padding: '10px 14px', marginBottom: 14, fontSize: 12, color: '#0369a1', display: 'flex', gap: 8, alignItems: 'flex-start' }}>
            <AlertTriangle size={14} style={{ flexShrink: 0, marginTop: 1 }} />
            <span>
              <strong>Regra de retrabalho:</strong> Sem retrabalho = 100% · 1 retrabalho = 50% · 2+ retrabalhos = perde a premiação daquela produção.
              Configure os retrabalhos na aba <strong>Comissão por Obra</strong> → cada lançamento tem o botão "Indicar retrabalho".
            </span>
          </div>

          {/* Vazio */}
          {comFiltradas.length === 0 && !loading && (
            <div style={{ padding: 60, textAlign: 'center', color: '#94a3b8', background: '#fff', borderRadius: 12, border: '1px solid #e2e8f0' }}>
              <Trophy size={40} style={{ marginBottom: 12, opacity: 0.25 }} />
              <div style={{ fontWeight: 600, marginBottom: 4 }}>Nenhuma premiação calculada para {mesLabel(competencia)}</div>
              <div style={{ fontSize: 12, marginBottom: 16 }}>
                1. Configure R$ Enc. e R$ Cabo nos Playbooks → Preços por Obra<br />
                2. Vincule Encarregado/Cabo a cada obra (Playbooks)<br />
                3. Clique em "Recalcular" acima
              </div>
              {canCreate && (
                <Button onClick={calcularComissoes} disabled={calculando} style={{ gap: 6, background: '#0d3f56', color: '#fff' }}>
                  <RefreshCw size={14} className={calculando ? 'animate-spin' : ''} />
                  Calcular Agora
                </Button>
              )}
            </div>
          )}

          {/* Tabela de premiações por colaborador */}
          {comFiltradas.length > 0 && (
            <div style={{ background: '#fff', borderRadius: 12, border: '1px solid #e2e8f0', overflow: 'hidden' }}>
              <div style={{ overflowX: 'auto' }}>
                <Table>
                  <TableHeader>
                    <TableRow style={{ background: '#f8fafc' }}>
                      <TableHead>Colaborador</TableHead>
                      <TableHead style={{ textAlign: 'center' }}>Função</TableHead>
                      <TableHead>Obra</TableHead>
                      <TableHead style={{ textAlign: 'right' }}>Bruto (sem retrabalho)</TableHead>
                      <TableHead style={{ textAlign: 'center' }}>Cabos</TableHead>
                      <TableHead style={{ textAlign: 'right', fontWeight: 800 }}>💰 A Receber</TableHead>
                      <TableHead style={{ textAlign: 'center' }}>Status</TableHead>
                      <TableHead style={{ textAlign: 'center' }}>Ações</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {comFiltradas.map((c, idx) => {
                      const st = STATUS_COR[c.status] ?? STATUS_COR.pendente
                      return (
                        <TableRow key={c.id} style={{ background: idx % 2 === 0 ? 'transparent' : '#fafafa' }}>
                          <TableCell>
                            <div style={{ fontWeight: 700, fontSize: 13 }}>{c.colaboradores?.nome ?? '—'}</div>
                            {c.colaboradores?.chapa && <div style={{ fontSize: 10, color: '#94a3b8', fontFamily: 'monospace' }}>{c.colaboradores.chapa}</div>}
                          </TableCell>
                          <TableCell style={{ textAlign: 'center' }}>
                            <span style={{ fontSize: 11, fontWeight: 700, padding: '3px 9px', borderRadius: 20, whiteSpace: 'nowrap',
                              background: c.funcao === 'encarregado' ? '#fff7ed' : '#f0f9ff',
                              color: c.funcao === 'encarregado' ? '#c2410c' : '#0369a1',
                              border: `1px solid ${c.funcao === 'encarregado' ? '#fed7aa' : '#bae6fd'}` }}>
                              {c.funcao === 'encarregado' ? '👷 Encarregado' : '🔧 Cabo'}
                            </span>
                          </TableCell>
                          <TableCell style={{ fontSize: 12, color: '#64748b' }}>{c.obras?.nome ?? '—'}</TableCell>
                          <TableCell style={{ textAlign: 'right', fontSize: 12, color: '#94a3b8' }}>{formatCurrency(c.valor_bruto)}</TableCell>
                          <TableCell style={{ textAlign: 'center', fontSize: 12 }}>
                            {c.funcao === 'cabo' && c.num_cabos > 1
                              ? <span style={{ background: '#f0f9ff', color: '#0369a1', borderRadius: 20, padding: '2px 8px', fontSize: 11, fontWeight: 600 }}>÷ {c.num_cabos}</span>
                              : '—'}
                          </TableCell>
                          <TableCell style={{ textAlign: 'right', fontWeight: 800, fontSize: 17, color: c.valor_final > 0 ? '#15803d' : '#dc2626' }}>
                            {formatCurrency(c.valor_final)}
                          </TableCell>
                          <TableCell style={{ textAlign: 'center' }}>
                            <span style={{ fontSize: 10, fontWeight: 700, padding: '3px 9px', borderRadius: 20, whiteSpace: 'nowrap',
                              background: st.bg, color: st.cor, border: `1px solid ${st.border}` }}>
                              {st.label}
                            </span>
                          </TableCell>
                          <TableCell style={{ textAlign: 'center' }}>
                            <div style={{ display: 'flex', gap: 3, justifyContent: 'center' }}>
                              {c.status === 'pendente' && (
                                <>
                                  <Button variant="ghost" size="icon" style={{ width: 26, height: 26 }} title="Aprovar → gerar Prêmio" onClick={() => setAprovarCom(c)}>
                                    <CheckCircle2 size={12} color="#15803d" />
                                  </Button>
                                  <Button variant="ghost" size="icon" style={{ width: 26, height: 26 }} title="Cancelar" onClick={() => setCancelarCom(c)}>
                                    <XCircle size={12} color="#dc2626" />
                                  </Button>
                                </>
                              )}
                              {c.status === 'aprovado' && <span style={{ fontSize: 10, color: '#15803d' }}>✅ Prêmio gerado</span>}
                              {canDelete && c.status !== 'aprovado' && (
                                <Button variant="ghost" size="icon" style={{ width: 26, height: 26 }} onClick={() => setDeleteCom(c)}>
                                  <Trash2 size={12} color="#dc2626" />
                                </Button>
                              )}
                            </div>
                          </TableCell>
                        </TableRow>
                      )
                    })}
                  </TableBody>
                </Table>
              </div>
              <div style={{ padding: '8px 16px', borderTop: '1px solid #e2e8f0', background: '#f8fafc', fontSize: 11, color: '#64748b' }}>
                💡 Clique em ✅ para aprovar e gerar prêmio automaticamente.
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── Modal: Indicar Retrabalho ─────────────────────────────────────── */}
      <Dialog open={!!modalRetrabalho} onOpenChange={o => { if (!o) setModalRetrabalho(null) }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <AlertTriangle size={16} color="#b45309" /> Indicar Retrabalho
            </DialogTitle>
          </DialogHeader>
          {modalRetrabalho && (
            <div className="py-3 space-y-4">
              <div style={{ background: '#f8fafc', borderRadius: 9, padding: '12px 14px', fontSize: 13 }}>
                <div style={{ fontWeight: 700, color: '#1e293b' }}>{modalRetrabalho.colaboradorNome}</div>
                <div style={{ fontSize: 12, color: '#64748b', marginTop: 2 }}>{modalRetrabalho.atividadeDescricao} · {modalRetrabalho.quantidade} un.</div>
              </div>
              {/* Seleção visual de retrabalho */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {[
                  { val: 0, label: '✅ Sem retrabalho', sub: '100% da premiação', cor: '#15803d', bg: '#f0fdf4', border: '#bbf7d0' },
                  { val: 1, label: '⚠️ 1 retrabalho', sub: '50% da premiação', cor: '#b45309', bg: '#fffbeb', border: '#fde68a' },
                  { val: 2, label: '❌ 2+ retrabalhos', sub: 'Perde a premiação desta produção', cor: '#dc2626', bg: '#fee2e2', border: '#fecaca' },
                ].map(opt => {
                  const sel = modalRetrabalho.retrabalhos === opt.val
                  return (
                    <button key={opt.val} type="button"
                      onClick={() => setModalRetrabalho(prev => prev ? { ...prev, retrabalhos: opt.val } : null)}
                      style={{
                        display: 'flex', alignItems: 'center', gap: 12, padding: '10px 14px',
                        borderRadius: 9, cursor: 'pointer', textAlign: 'left',
                        border: sel ? `2px solid ${opt.cor}` : `1.5px solid ${opt.border}`,
                        background: sel ? opt.bg : '#fff',
                        transition: 'all 0.12s',
                      }}>
                      <div style={{ width: 18, height: 18, borderRadius: '50%', border: `2.5px solid ${sel ? opt.cor : '#d1d5db'}`, background: sel ? opt.cor : '#fff', flexShrink: 0 }} />
                      <div>
                        <div style={{ fontSize: 13, fontWeight: 700, color: sel ? opt.cor : '#1e293b' }}>{opt.label}</div>
                        <div style={{ fontSize: 11, color: '#64748b' }}>{opt.sub}</div>
                      </div>
                    </button>
                  )
                })}
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setModalRetrabalho(null)}>Cancelar</Button>
            <Button disabled={savingRetrab} onClick={() => modalRetrabalho && salvarRetrabalho(modalRetrabalho.prodId, modalRetrabalho.retrabalhos)}
              style={{ background: '#0d3f56', color: '#fff' }}>
              {savingRetrab ? 'Salvando…' : '✅ Confirmar'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Aprovar ──────────────────────────────────────────────────────────── */}
      <AlertDialog open={!!aprovarCom} onOpenChange={o => !o && setAprovarCom(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Aprovar premiação?</AlertDialogTitle>
            <AlertDialogDescription>
              Será gerado um prêmio de <strong>{formatCurrency(aprovarCom?.valor_final ?? 0)}</strong> para{' '}
              <strong>{aprovarCom?.colaboradores?.nome}</strong> ({aprovarCom?.funcao}) — {mesLabel(aprovarCom?.competencia ?? '')}.
              <br /><br />
              <details style={{ fontSize: 12, color: '#475569' }}>
                <summary style={{ cursor: 'pointer', fontWeight: 600 }}>Ver detalhes da produção</summary>
                <pre style={{ whiteSpace: 'pre-wrap', marginTop: 8, fontSize: 11 }}>{aprovarCom?.observacoes ?? '—'}</pre>
              </details>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handleAprovar} style={{ background: '#15803d', color: '#fff' }}>✅ Aprovar</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* ── Cancelar ─────────────────────────────────────────────────────────── */}
      <AlertDialog open={!!cancelarCom} onOpenChange={o => !o && setCancelarCom(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Cancelar premiação?</AlertDialogTitle>
            <AlertDialogDescription>
              A premiação de <strong>{cancelarCom?.colaboradores?.nome}</strong> ({formatCurrency(cancelarCom?.valor_final ?? 0)}) será marcada como cancelada.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Voltar</AlertDialogCancel>
            <AlertDialogAction onClick={handleCancelar} style={{ background: '#dc2626', color: '#fff' }}>Cancelar Premiação</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* ── Excluir ──────────────────────────────────────────────────────────── */}
      <AlertDialog open={!!deleteCom} onOpenChange={o => !o && setDeleteCom(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir lançamento?</AlertDialogTitle>
            <AlertDialogDescription>Esta ação é irreversível. Recalcule quando necessário.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} style={{ background: '#dc2626', color: '#fff' }}>Excluir</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
