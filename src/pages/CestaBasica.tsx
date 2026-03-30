import React, { useEffect, useState, useMemo, useCallback } from 'react'
import { supabase } from '@/lib/supabase'
import { toast } from 'sonner'
import {
  ShoppingBasket, Search, RefreshCw, Printer, ChevronDown, ChevronRight,
  Check, X, Building2, Users, Package, FileText, Filter,
  CheckSquare, Square, AlertTriangle,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { fetchEmpresaData, CABECALHO_CSS, gerarCabecalhoHTML, type EmpresaData } from '@/lib/relatorioHeader'

// ─── Tipos ───────────────────────────────────────────────────────────────────
interface Obra    { id: string; nome: string; codigo?: string }
interface Funcao  { id: string; nome: string }

interface ColabRow {
  id: string
  nome: string
  chapa: string | null
  funcao_id: string | null
  funcao_nome: string
  obra_id: string | null
  obra_nome: string
  obra_codigo: string
  status: string
  tipo_contrato: string | null
  // calculados
  faltas: number
  presencas: number
  totalDias: number
  elegivel: boolean
  // controle manual (override)
  override: boolean | null  // null = automático, true/false = forçado
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
function mesLabel(competencia: string) {
  const [a, m] = competencia.split('-').map(Number)
  return new Date(a, m - 1, 1).toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' })
}
function diasNoMes(comp: string) {
  const [a, m] = comp.split('-').map(Number)
  return new Date(a, m, 0).getDate()
}

// ─── Componente principal ────────────────────────────────────────────────────
export default function CestaBasica() {
  const hoje = new Date()
  const [competencia, setCompetencia] = useState(
    `${hoje.getFullYear()}-${String(hoje.getMonth() + 1).padStart(2, '0')}`
  )
  const [maxFaltas, setMaxFaltas]   = useState(0)   // 0 = ilimitado (todas recebem)
  const [obraFiltro, setObraFiltro] = useState('')
  const [busca, setBusca]           = useState('')
  const [loading, setLoading]       = useState(false)

  const [obras,     setObras]     = useState<Obra[]>([])
  const [colabs,    setColabs]    = useState<ColabRow[]>([])
  const [overrides, setOverrides] = useState<Record<string, boolean | null>>({})
  const [expanded,  setExpanded]  = useState<Record<string, boolean>>({})
  const [gerado,    setGerado]    = useState(false)

  // ── Carrega obras ──────────────────────────────────────────────────────────
  useEffect(() => {
    supabase.from('obras').select('id,nome,codigo').eq('ativo', true).order('nome')
      .then(({ data }) => setObras(data ?? []))
  }, [])

  // ── Gerar listagem ─────────────────────────────────────────────────────────
  const gerar = useCallback(async () => {
    setLoading(true)
    setGerado(false)
    setOverrides({})

    const ini = `${competencia}-01`
    const fim = `${competencia}-${String(diasNoMes(competencia)).padStart(2, '0')}`

    // 1. Busca colaboradores ativos com obra e função
    let qColab = supabase
      .from('colaboradores')
      .select('id,nome,chapa,funcao_id,obra_id,status,tipo_contrato,funcoes(nome),obras(nome,codigo)')
      .in('status', ['ativo'])
      .order('nome')
    if (obraFiltro) qColab = qColab.eq('obra_id', obraFiltro)
    const { data: colabData, error: errColab } = await qColab

    if (errColab || !colabData) {
      toast.error('Erro ao buscar colaboradores: ' + (errColab?.message ?? 'desconhecido'))
      setLoading(false)
      return
    }

    const colabIds = colabData.map(c => c.id)

    // 2. Busca faltas no período (registro_ponto + portal_ponto_diario)
    const [{ data: rpData }, { data: ppData }] = await Promise.all([
      supabase
        .from('registro_ponto')
        .select('colaborador_id,data,falta,presente')
        .in('colaborador_id', colabIds)
        .gte('data', ini).lte('data', fim),
      supabase
        .from('portal_ponto_diario')
        .select('colaborador_id,data,status')
        .in('colaborador_id', colabIds)
        .gte('data', ini).lte('data', fim),
    ])

    // 3. Monta mapa colabId → { faltas, presencas }
    const mapaFP: Record<string, { faltas: number; presencas: number }> = {}
    const ensure = (id: string) => { if (!mapaFP[id]) mapaFP[id] = { faltas: 0, presencas: 0 } }

    // — registro_ponto (sistema) —
    for (const r of (rpData ?? [])) {
      ensure(r.colaborador_id)
      if (r.falta) mapaFP[r.colaborador_id].faltas++
      else if (r.presente) mapaFP[r.colaborador_id].presencas++
    }

    // — portal_ponto_diario —
    // Para evitar dupla contagem (registro já sincronizado ao sistema), usa apenas os
    // registros do portal que NÃO estejam no registro_ponto do mesmo dia
    const sistDias = new Set((rpData ?? []).map(r => `${r.colaborador_id}|${r.data}`))
    for (const r of (ppData ?? [])) {
      const key = `${r.colaborador_id}|${r.data}`
      if (sistDias.has(key)) continue  // já contabilizado via sistema
      ensure(r.colaborador_id)
      if (r.status === 'falta' || r.status === 'falta_justificada') mapaFP[r.colaborador_id].faltas++
      else if (r.status === 'presente' || r.status === 'meio_periodo' || r.status === 'producao') mapaFP[r.colaborador_id].presencas++
    }

    // 4. Monta lista final
    const lista: ColabRow[] = colabData.map(c => {
      const fp    = mapaFP[c.id] ?? { faltas: 0, presencas: 0 }
      const total = fp.faltas + fp.presencas
      const elig  = maxFaltas === 0 ? true : fp.faltas <= maxFaltas
      return {
        id:         c.id,
        nome:       c.nome,
        chapa:      c.chapa,
        funcao_id:  c.funcao_id,
        funcao_nome:(c as any).funcoes?.nome ?? 'Sem função',
        obra_id:    c.obra_id,
        obra_nome:  (c as any).obras?.nome ?? 'Sem obra',
        obra_codigo:(c as any).obras?.codigo ?? '',
        status:     c.status,
        tipo_contrato: c.tipo_contrato,
        faltas:     fp.faltas,
        presencas:  fp.presencas,
        totalDias:  total,
        elegivel:   elig,
        override:   null,
      }
    })

    setColabs(lista)
    // expande todas as obras por padrão
    const obraIds = [...new Set(lista.map(c => c.obra_id ?? '__sem__'))]
    const exp: Record<string, boolean> = {}
    obraIds.forEach(id => { exp[id] = true })
    setExpanded(exp)
    setGerado(true)
    setLoading(false)
  }, [competencia, obraFiltro, maxFaltas])

  // ── Elegibilidade final (automática + override) ────────────────────────────
  const colabsFinal = useMemo(() =>
    colabs.map(c => ({
      ...c,
      elegivel: overrides[c.id] !== undefined && overrides[c.id] !== null
        ? overrides[c.id]!
        : c.elegivel,
    })),
    [colabs, overrides]
  )

  // ── Filtragem visual ───────────────────────────────────────────────────────
  const colabsFiltrados = useMemo(() => {
    const q = busca.trim().toLowerCase()
    if (!q) return colabsFinal
    return colabsFinal.filter(c =>
      c.nome.toLowerCase().includes(q) ||
      (c.chapa ?? '').toLowerCase().includes(q) ||
      c.funcao_nome.toLowerCase().includes(q)
    )
  }, [colabsFinal, busca])

  // ── Agrupamento por obra ───────────────────────────────────────────────────
  const grupos = useMemo(() => {
    const map: Record<string, { obraId: string; obraNome: string; obraCodigo: string; itens: typeof colabsFiltrados }> = {}
    colabsFiltrados.forEach(c => {
      const k = c.obra_id ?? '__sem__'
      if (!map[k]) map[k] = { obraId: k, obraNome: c.obra_nome, obraCodigo: c.obra_codigo, itens: [] }
      map[k].itens.push(c)
    })
    return Object.values(map).sort((a, b) => a.obraNome.localeCompare(b.obraNome))
  }, [colabsFiltrados])

  // ── Totais globais ─────────────────────────────────────────────────────────
  const totais = useMemo(() => {
    const elegíveis    = colabsFinal.filter(c => c.elegivel).length
    const naoElegiveis = colabsFinal.filter(c => !c.elegivel).length
    return { total: colabsFinal.length, elegíveis, naoElegiveis }
  }, [colabsFinal])

  // ── Toggle override ────────────────────────────────────────────────────────
  function toggleOverride(id: string, valor: boolean) {
    setOverrides(prev => {
      const atual = prev[id]
      // Clicou no mesmo estado ativo → remove override (volta automático)
      if (atual === valor) return { ...prev, [id]: null }
      return { ...prev, [id]: valor }
    })
  }

  // ── Imprimir relatório por obra ────────────────────────────────────────────
  async function imprimirPorObra(obraId: string) {
    const grupo = grupos.find(g => g.obraId === obraId)
    if (!grupo) return
    const elegMes = grupo.itens.filter(c => c.elegivel)
    const emp = await fetchEmpresaData()

    const periodoFmt = mesLabel(competencia).charAt(0).toUpperCase() + mesLabel(competencia).slice(1)

    const linhas = elegMes.map((c, i) => `
      <tr>
        <td>${i + 1}</td>
        <td>${c.chapa ?? '—'}</td>
        <td>${c.nome}</td>
        <td>${c.funcao_nome}</td>
        <td style="text-align:center">${c.faltas}</td>
        <td style="text-align:center">1</td>
        <td class="assinatura"></td>
      </tr>
    `).join('')

    const cabecalho = gerarCabecalhoHTML(emp, {
      titulo: 'Controle de Cesta Básica',
      subtitulo: `${grupo.obraNome}${grupo.obraCodigo ? ` · Cód. ${grupo.obraCodigo}` : ''}`,
      periodo: periodoFmt,
    })

    const html = `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8"/>
  <title>Cesta Básica — ${grupo.obraNome} — ${periodoFmt}</title>
  <style>
    @page { size: A4 portrait; margin: 18mm 14mm; }
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: Arial, Helvetica, sans-serif; font-size: 10pt; color: #111; }
    ${CABECALHO_CSS}
    table { width: 100%; border-collapse: collapse; margin-bottom: 18px; }
    thead tr { background: #1e3a5f; color: #fff; }
    thead th { padding: 6px 8px; font-size: 9pt; font-weight: 700; text-align: left; }
    tbody tr:nth-child(even) { background: #f1f5f9; }
    tbody td { padding: 6px 8px; font-size: 9pt; border-bottom: 1px solid #e5e7eb; }
    .assinatura { width: 180px; border-bottom: 1.5px solid #374151 !important; height: 22px; }
    .footer { margin-top: 20px; border-top: 1px solid #d1d5db; padding-top: 14px;
              display: flex; justify-content: space-around; }
    .footer .ass-block { text-align: center; width: 30%; }
    .footer .ass-block .linha { border-top: 1px solid #374151; margin-bottom: 4px; height: 36px; }
    .footer .ass-block .nome  { font-size: 8.5pt; color: #374151; font-weight: 600; }
    .footer .ass-block .cargo { font-size: 7.5pt; color: #9ca3af; }
    @media print { .no-print { display:none; } }
  </style>
</head>
<body>
  ${cabecalho}

  <table>
    <thead>
      <tr>
        <th>#</th>
        <th>Chapa</th>
        <th>Nome</th>
        <th>Função</th>
        <th style="text-align:center">Faltas</th>
        <th style="text-align:center">Qtd.</th>
        <th style="text-align:center;width:180px">Assinatura</th>
      </tr>
    </thead>
    <tbody>
      ${linhas || '<tr><td colspan="7" style="text-align:center;padding:20px;color:#6b7280">Nenhum colaborador elegível nesta obra</td></tr>'}
    </tbody>
  </table>

  <div class="footer">
    <div class="ass-block">
      <div class="linha"></div>
      <div class="nome">Responsável pela Entrega</div>
      <div class="cargo">Encarregado / RH</div>
    </div>
    <div class="ass-block">
      <div class="linha"></div>
      <div class="nome">Conferência</div>
      <div class="cargo">Supervisor de Obra</div>
    </div>
    <div class="ass-block">
      <div class="linha"></div>
      <div class="nome">Aprovação</div>
      <div class="cargo">Gestão / Diretoria</div>
    </div>
  </div>
</body>
</html>`

    const win = window.open('', '_blank', 'width=900,height=700')
    if (win) { win.document.write(html); win.document.close() }
  }

  // ── Imprimir TODOS os relatórios (uma obra por vez) ────────────────────────
    async function imprimirTodos() {
    const periodoFmt = mesLabel(competencia).charAt(0).toUpperCase() + mesLabel(competencia).slice(1)
    const emp = await fetchEmpresaData()
    const allObras = grupos

    const pagesHtml = allObras.map(grupo => {
      const elegMes = grupo.itens.filter(c => c.elegivel)
      const linhas = elegMes.map((c, i) => `
        <tr>
          <td>${i + 1}</td>
          <td>${c.chapa ?? '—'}</td>
          <td>${c.nome}</td>
          <td>${c.funcao_nome}</td>
          <td style="text-align:center">${c.faltas}</td>
          <td style="text-align:center">1</td>
          <td class="assinatura"></td>
        </tr>
      `).join('')

      const cab = gerarCabecalhoHTML(emp, {
        titulo: 'Controle de Cesta Básica',
        subtitulo: `${grupo.obraNome}${grupo.obraCodigo ? ` · Cód. ${grupo.obraCodigo}` : ''}`,
        periodo: periodoFmt,
      })

      return `
        <div class="page">
          ${cab}
          <table>
            <thead>
              <tr>
                <th>#</th><th>Chapa</th><th>Nome</th><th>Função</th>
                <th style="text-align:center">Faltas</th>
                <th style="text-align:center">Qtd.</th>
                <th style="text-align:center;width:180px">Assinatura</th>
              </tr>
            </thead>
            <tbody>
              ${linhas || '<tr><td colspan="7" style="text-align:center;padding:20px;color:#6b7280">Nenhum elegível</td></tr>'}
            </tbody>
          </table>
          <div class="footer">
            <div class="ass-block"><div class="linha"></div><div class="nome">Responsável pela Entrega</div><div class="cargo">Encarregado / RH</div></div>
            <div class="ass-block"><div class="linha"></div><div class="nome">Conferência</div><div class="cargo">Supervisor de Obra</div></div>
            <div class="ass-block"><div class="linha"></div><div class="nome">Aprovação</div><div class="cargo">Gestão / Diretoria</div></div>
          </div>
        </div>
      `
    }).join('')

    const html = `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8"/>
  <title>Cesta Básica — Todas as Obras — ${periodoFmt}</title>
  <style>
    @page { size: A4 portrait; margin: 18mm 14mm; }
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: Arial, Helvetica, sans-serif; font-size: 10pt; color: #111; }
    ${CABECALHO_CSS}
    .page { page-break-after: always; padding-bottom: 10mm; }
    .page:last-child { page-break-after: auto; }
    table { width: 100%; border-collapse: collapse; margin-bottom: 18px; }
    thead tr { background: #1e3a5f; color: #fff; }
    thead th { padding: 6px 8px; font-size: 9pt; font-weight: 700; text-align: left; }
    tbody tr:nth-child(even) { background: #f1f5f9; }
    tbody td { padding: 6px 8px; font-size: 9pt; border-bottom: 1px solid #e5e7eb; }
    .assinatura { width: 180px; border-bottom: 1.5px solid #374151 !important; height: 22px; }
    .footer { margin-top: 20px; border-top: 1px solid #d1d5db; padding-top: 14px;
              display: flex; justify-content: space-around; }
    .footer .ass-block { text-align: center; width: 30%; }
    .footer .ass-block .linha { border-top: 1px solid #374151; margin-bottom: 4px; height: 36px; }
    .footer .ass-block .nome  { font-size: 8.5pt; color: #374151; font-weight: 600; }
    .footer .ass-block .cargo { font-size: 7.5pt; color: #9ca3af; }
  </style>
</head>
<body>${pagesHtml}</body>
</html>`

    const win = window.open('', '_blank', 'width=900,height=700')
    if (win) { win.document.write(html); win.document.close() }
  }

  // ── Resumo consolidado imprimível ──────────────────────────────────────────
  async function imprimirResumo() {
    const periodoFmt = mesLabel(competencia).charAt(0).toUpperCase() + mesLabel(competencia).slice(1)
    const emp = await fetchEmpresaData()

    const linhasGrupos = grupos.map(g => {
      const elig = g.itens.filter(c => c.elegivel).length
      const nElig = g.itens.length - elig
      return `
        <tr>
          <td>${g.obraCodigo || '—'}</td>
          <td>${g.obraNome}</td>
          <td style="text-align:center">${g.itens.length}</td>
          <td style="text-align:center;color:#15803d;font-weight:700">${elig}</td>
          <td style="text-align:center;color:#dc2626">${nElig}</td>
        </tr>
      `
    }).join('')

    const cabecalho = gerarCabecalhoHTML(emp, {
      titulo: 'Resumo — Cesta Básica',
      periodo: periodoFmt,
    })

    const html = `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8"/>
  <title>Resumo Cesta Básica — ${periodoFmt}</title>
  <style>
    @page { size: A4 portrait; margin: 18mm 14mm; }
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: Arial, Helvetica, sans-serif; font-size: 10pt; color: #111; }
    ${CABECALHO_CSS}
    table { width: 100%; border-collapse: collapse; }
    thead tr { background: #1e3a5f; color: #fff; }
    thead th { padding: 7px 10px; font-size: 9.5pt; font-weight: 700; text-align: left; }
    tbody tr:nth-child(even) { background: #f1f5f9; }
    tbody td { padding: 7px 10px; font-size: 9.5pt; border-bottom: 1px solid #e5e7eb; }
    tfoot tr { background: #1e3a5f; color: #fff; font-weight: 700; }
    tfoot td { padding: 7px 10px; font-size: 9.5pt; }
  </style>
</head>
<body>
  ${cabecalho}
  <table>
    <thead>
      <tr>
        <th>Código</th><th>Obra</th>
        <th style="text-align:center">Colaboradores</th>
        <th style="text-align:center">Com Direito</th>
        <th style="text-align:center">Sem Direito</th>
      </tr>
    </thead>
    <tbody>${linhasGrupos}</tbody>
    <tfoot>
      <tr>
        <td colspan="2">TOTAL</td>
        <td style="text-align:center">${totais.total}</td>
        <td style="text-align:center">${totais.elegíveis}</td>
        <td style="text-align:center">${totais.naoElegiveis}</td>
      </tr>
    </tfoot>
  </table>
</body>
</html>`

    const win = window.open('', '_blank', 'width=900,height=600')
    if (win) { win.document.write(html); win.document.close() }
  }

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div style={{ padding: '24px 28px', maxWidth: 1100, margin: '0 auto' }}>

      {/* ── Cabeçalho ── */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 24 }}>
        <div style={{ width: 48, height: 48, borderRadius: 14, background: 'linear-gradient(135deg,#1e3a5f,#2563eb)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
          <ShoppingBasket size={26} color="#fff" />
        </div>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 800, color: 'var(--foreground)', margin: 0 }}>Cesta Básica</h1>
          <p style={{ fontSize: 13, color: 'var(--muted-foreground)', margin: 0 }}>
            Controle de elegibilidade e geração de relatórios por obra
          </p>
        </div>
      </div>

      {/* ── Painel de filtros ── */}
      <div style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 12, padding: 20, marginBottom: 24 }}>
        <div style={{ fontWeight: 700, fontSize: 13, color: 'var(--foreground)', marginBottom: 16, display: 'flex', alignItems: 'center', gap: 8 }}>
          <Filter size={15} /> Configurações do Período
        </div>
        <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', alignItems: 'flex-end' }}>

          {/* Mês */}
          <div>
            <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--muted-foreground)', marginBottom: 5, textTransform: 'uppercase' }}>Mês / Ano</div>
            <input
              type="month"
              value={competencia}
              onChange={e => { setCompetencia(e.target.value); setGerado(false) }}
              style={{ height: 38, borderRadius: 8, border: '1.5px solid var(--border)', padding: '0 10px', fontSize: 13, background: 'var(--card)', color: 'var(--foreground)', outline: 'none' }}
            />
          </div>

          {/* Obra */}
          <div>
            <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--muted-foreground)', marginBottom: 5, textTransform: 'uppercase' }}>Obra</div>
            <select
              value={obraFiltro}
              onChange={e => { setObraFiltro(e.target.value); setGerado(false) }}
              style={{ height: 38, borderRadius: 8, border: '1.5px solid var(--border)', padding: '0 10px', fontSize: 13, background: 'var(--card)', color: 'var(--foreground)', minWidth: 200 }}
            >
              <option value="">— Todas as obras —</option>
              {obras.map(o => <option key={o.id} value={o.id}>{o.nome}</option>)}
            </select>
          </div>

          {/* Máximo de faltas */}
          <div>
            <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--muted-foreground)', marginBottom: 5, textTransform: 'uppercase' }}>
              Máx. faltas permitidas
            </div>
            <div style={{ display: 'flex', gap: 0, border: '1.5px solid var(--border)', borderRadius: 8, overflow: 'hidden', height: 38 }}>
              {[0, 1, 2, 3].map(v => (
                <button
                  key={v}
                  onClick={() => { setMaxFaltas(v); setGerado(false) }}
                  style={{
                    padding: '0 14px', border: 'none', cursor: 'pointer', fontSize: 13, fontWeight: 600,
                    background: maxFaltas === v ? '#1e3a5f' : 'var(--card)',
                    color: maxFaltas === v ? '#fff' : 'var(--muted-foreground)',
                    borderRight: '1px solid var(--border)',
                    transition: 'all 120ms',
                  }}
                >
                  {v === 0 ? 'Livre' : `≤${v}`}
                </button>
              ))}
            </div>
            <div style={{ fontSize: 10, color: 'var(--muted-foreground)', marginTop: 3 }}>
              {maxFaltas === 0 ? 'Todos recebem independente de faltas' : `Colaboradores com até ${maxFaltas} falta${maxFaltas > 1 ? 's' : ''}`}
            </div>
          </div>

          {/* Botão gerar */}
          <button
            onClick={gerar}
            disabled={loading}
            style={{
              height: 38, padding: '0 20px', borderRadius: 8, border: 'none', cursor: loading ? 'not-allowed' : 'pointer',
              background: loading ? '#94a3b8' : '#1e3a5f', color: '#fff', fontSize: 13, fontWeight: 700,
              display: 'flex', alignItems: 'center', gap: 8, transition: 'all 120ms',
            }}
          >
            {loading ? <RefreshCw size={15} className="animate-spin" /> : <ShoppingBasket size={15} />}
            {loading ? 'Calculando…' : 'Gerar Listagem'}
          </button>
        </div>
      </div>

      {/* ── Resultados ── */}
      {gerado && (
        <>
          {/* Totalizadores */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 14, marginBottom: 20 }}>
            {[
              { label: 'Total de Colaboradores', valor: totais.total,         cor: '#1e3a5f', bg: '#eff6ff',  icon: <Users size={20} color="#1e3a5f" /> },
              { label: 'Com Direito à Cesta',    valor: totais.elegíveis,     cor: '#15803d', bg: '#dcfce7', icon: <Check size={20} color="#15803d" /> },
              { label: 'Sem Direito (faltas)',    valor: totais.naoElegiveis,  cor: '#dc2626', bg: '#fee2e2', icon: <X     size={20} color="#dc2626" /> },
            ].map(s => (
              <div key={s.label} style={{ background: s.bg, borderRadius: 12, padding: '16px 18px', display: 'flex', alignItems: 'center', gap: 14, border: `1.5px solid ${s.cor}22` }}>
                <div style={{ width: 40, height: 40, borderRadius: 10, background: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 1px 4px rgba(0,0,0,0.08)' }}>
                  {s.icon}
                </div>
                <div>
                  <div style={{ fontSize: 24, fontWeight: 800, color: s.cor, lineHeight: 1 }}>{s.valor}</div>
                  <div style={{ fontSize: 11, color: s.cor, fontWeight: 600, marginTop: 2 }}>{s.label}</div>
                </div>
              </div>
            ))}
          </div>

          {/* Barra de ações */}
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center', marginBottom: 16 }}>
            {/* Busca */}
            <div style={{ position: 'relative', flex: 1, minWidth: 200, maxWidth: 340 }}>
              <Search size={14} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: '#9ca3af' }} />
              <input
                type="text"
                placeholder="Buscar por nome, chapa ou função…"
                value={busca}
                onChange={e => setBusca(e.target.value)}
                style={{ width: '100%', height: 36, paddingLeft: 30, paddingRight: 10, borderRadius: 8, border: '1.5px solid var(--border)', fontSize: 13, background: 'var(--card)', color: 'var(--foreground)', outline: 'none', boxSizing: 'border-box' }}
              />
            </div>
            <div style={{ marginLeft: 'auto', display: 'flex', gap: 8 }}>
              <button
                onClick={imprimirResumo}
                style={{ height: 36, padding: '0 14px', borderRadius: 8, border: '1.5px solid var(--border)', cursor: 'pointer', background: 'var(--card)', color: 'var(--foreground)', fontSize: 12, fontWeight: 700, display: 'flex', alignItems: 'center', gap: 6 }}
              >
                <FileText size={14} /> Resumo Geral
              </button>
              <button
                onClick={imprimirTodos}
                style={{ height: 36, padding: '0 14px', borderRadius: 8, border: 'none', cursor: 'pointer', background: '#1e3a5f', color: '#fff', fontSize: 12, fontWeight: 700, display: 'flex', alignItems: 'center', gap: 6 }}
              >
                <Printer size={14} /> Imprimir Todas as Obras
              </button>
            </div>
          </div>

          {/* Grupos por obra */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {grupos.length === 0 && (
              <div style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 12, padding: 32, textAlign: 'center', color: 'var(--muted-foreground)' }}>
                Nenhum colaborador encontrado para os filtros selecionados.
              </div>
            )}
            {grupos.map(grupo => {
              const isOpen   = expanded[grupo.obraId] !== false
              const elegNum  = grupo.itens.filter(c => c.elegivel).length
              const nElegNum = grupo.itens.length - elegNum

              // Agrupa por função dentro da obra
              const porFuncao: Record<string, typeof grupo.itens> = {}
              grupo.itens.forEach(c => {
                if (!porFuncao[c.funcao_nome]) porFuncao[c.funcao_nome] = []
                porFuncao[c.funcao_nome].push(c)
              })

              return (
                <div key={grupo.obraId} style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 12, overflow: 'hidden' }}>
                  {/* Header da obra */}
                  <div
                    onClick={() => setExpanded(prev => ({ ...prev, [grupo.obraId]: !isOpen }))}
                    style={{ padding: '12px 16px', background: '#1e3a5f', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 10 }}
                  >
                    <div style={{ color: '#93c5fd', transition: 'transform 200ms', transform: isOpen ? 'rotate(0deg)' : 'rotate(-90deg)' }}>
                      {isOpen ? <ChevronDown size={18} /> : <ChevronRight size={18} />}
                    </div>
                    <Building2 size={16} color="#60a5fa" />
                    <div style={{ flex: 1 }}>
                      <span style={{ fontWeight: 700, color: '#fff', fontSize: 14 }}>{grupo.obraNome}</span>
                      {grupo.obraCodigo && <span style={{ color: '#93c5fd', fontSize: 11, marginLeft: 8 }}>Cód. {grupo.obraCodigo}</span>}
                    </div>
                    <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                      <span style={{ background: '#dcfce7', color: '#15803d', borderRadius: 6, padding: '2px 10px', fontSize: 11, fontWeight: 700 }}>
                        ✓ {elegNum} cesta{elegNum !== 1 ? 's' : ''}
                      </span>
                      {nElegNum > 0 && (
                        <span style={{ background: '#fee2e2', color: '#dc2626', borderRadius: 6, padding: '2px 10px', fontSize: 11, fontWeight: 700 }}>
                          ✗ {nElegNum} sem direito
                        </span>
                      )}
                      <button
                        onClick={e => { e.stopPropagation(); imprimirPorObra(grupo.obraId) }}
                        style={{ background: 'rgba(255,255,255,0.15)', border: '1px solid rgba(255,255,255,0.2)', borderRadius: 6, padding: '4px 10px', color: '#fff', fontSize: 11, fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 5 }}
                      >
                        <Printer size={12} /> Imprimir
                      </button>
                    </div>
                  </div>

                  {/* Tabela de colaboradores */}
                  {isOpen && (
                    <div>
                      {Object.entries(porFuncao).sort(([a], [b]) => a.localeCompare(b)).map(([funcao, itens]) => (
                        <div key={funcao}>
                          {/* Sub-header da função */}
                          <div style={{ padding: '5px 16px', background: '#f1f5f9', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: 6 }}>
                            <span style={{ fontSize: 10, fontWeight: 800, color: '#475569', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                              👷 {funcao}
                            </span>
                            <span style={{ fontSize: 10, color: '#94a3b8' }}>({itens.length})</span>
                          </div>

                          {/* Linhas dos colaboradores */}
                          {itens.sort((a, b) => a.nome.localeCompare(b.nome)).map((c, idx) => {
                            const ovr = overrides[c.id]
                            const isEleg = ovr !== undefined && ovr !== null ? ovr : c.elegivel

                            return (
                              <div
                                key={c.id}
                                style={{
                                  padding: '10px 16px',
                                  borderBottom: '1px solid var(--border)',
                                  display: 'flex',
                                  alignItems: 'center',
                                  gap: 12,
                                  background: idx % 2 === 0 ? 'var(--card)' : 'var(--muted, #f9fafb)',
                                  opacity: isEleg ? 1 : 0.65,
                                }}
                              >
                                {/* Status elegível */}
                                <div style={{ width: 4, height: 36, borderRadius: 3, background: isEleg ? '#22c55e' : '#ef4444', flexShrink: 0 }} />

                                {/* Info do colaborador */}
                                <div style={{ flex: 1, minWidth: 0 }}>
                                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                                    <span style={{ fontWeight: 700, fontSize: 13, color: 'var(--foreground)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                      {c.nome}
                                    </span>
                                    {c.chapa && (
                                      <span style={{ background: '#dbeafe', color: '#1d4ed8', borderRadius: 4, padding: '1px 7px', fontSize: 10, fontWeight: 700, flexShrink: 0 }}>
                                        {c.chapa}
                                      </span>
                                    )}
                                    {ovr !== null && ovr !== undefined && (
                                      <span style={{ background: '#fef9c3', color: '#92400e', borderRadius: 4, padding: '1px 7px', fontSize: 9, fontWeight: 700 }}>
                                        ✎ Manual
                                      </span>
                                    )}
                                  </div>
                                  <div style={{ fontSize: 11, color: 'var(--muted-foreground)', marginTop: 2 }}>{c.funcao_nome}</div>
                                </div>

                                {/* Contadores de presença */}
                                <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
                                  <div style={{ textAlign: 'center' }}>
                                    <div style={{ fontSize: 13, fontWeight: 700, color: '#15803d' }}>{c.presencas}</div>
                                    <div style={{ fontSize: 9, color: '#9ca3af', textTransform: 'uppercase' }}>Pres.</div>
                                  </div>
                                  <div style={{ textAlign: 'center' }}>
                                    <div style={{ fontSize: 13, fontWeight: 700, color: c.faltas > 0 ? '#dc2626' : '#9ca3af' }}>{c.faltas}</div>
                                    <div style={{ fontSize: 9, color: '#9ca3af', textTransform: 'uppercase' }}>Faltas</div>
                                  </div>
                                </div>

                                {/* Badge elegível */}
                                <div style={{ width: 90, textAlign: 'center', flexShrink: 0 }}>
                                  <span style={{
                                    display: 'inline-block', padding: '3px 10px', borderRadius: 6, fontSize: 11, fontWeight: 700,
                                    background: isEleg ? '#dcfce7' : '#fee2e2',
                                    color: isEleg ? '#15803d' : '#dc2626',
                                  }}>
                                    {isEleg ? '✓ Elegível' : '✗ Sem direito'}
                                  </span>
                                </div>

                                {/* Botões de override */}
                                <div style={{ display: 'flex', gap: 4, flexShrink: 0 }}>
                                  <button
                                    title="Forçar ELEGÍVEL (override manual)"
                                    onClick={() => toggleOverride(c.id, true)}
                                    style={{
                                      width: 28, height: 28, borderRadius: 6, border: '1.5px solid',
                                      cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
                                      borderColor: (ovr === true) ? '#15803d' : '#e5e7eb',
                                      background:  (ovr === true) ? '#dcfce7' : 'var(--card)',
                                      color:       (ovr === true) ? '#15803d' : '#9ca3af',
                                    }}
                                  >
                                    <Check size={13} />
                                  </button>
                                  <button
                                    title="Forçar SEM DIREITO (override manual)"
                                    onClick={() => toggleOverride(c.id, false)}
                                    style={{
                                      width: 28, height: 28, borderRadius: 6, border: '1.5px solid',
                                      cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
                                      borderColor: (ovr === false) ? '#dc2626' : '#e5e7eb',
                                      background:  (ovr === false) ? '#fee2e2' : 'var(--card)',
                                      color:       (ovr === false) ? '#dc2626' : '#9ca3af',
                                    }}
                                  >
                                    <X size={13} />
                                  </button>
                                </div>
                              </div>
                            )
                          })}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </>
      )}

      {/* Estado inicial (antes de gerar) */}
      {!gerado && !loading && (
        <div style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 12, padding: '48px 32px', textAlign: 'center', color: 'var(--muted-foreground)' }}>
          <ShoppingBasket size={48} style={{ margin: '0 auto 14px', opacity: 0.3 }} />
          <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 6 }}>Nenhuma listagem gerada</div>
          <div style={{ fontSize: 13 }}>Selecione o mês e as configurações acima e clique em <strong>Gerar Listagem</strong></div>
        </div>
      )}
    </div>
  )
}
