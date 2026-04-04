import React, { useEffect, useState, useCallback, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '@/lib/supabase'
import GestorLayout from './GestorLayout'
import {
  Users, UserCheck, UserX, CloudRain, AlertTriangle, Activity,
  TrendingUp, Clock, HardHat, BarChart3, CheckCircle2,
  Building2, FileText, ShieldAlert, Thermometer, Loader2, Wind,
  CalendarCheck, CalendarX, Trophy
} from 'lucide-react'

interface KpiCard {
  label: string
  value: string | number
  sub?: string
  icon: React.ReactNode
  color: string
  bg: string
  trend?: { val: string; up: boolean }
}

interface ObraData {
  id: string
  nome: string
  codigo?: string
  ativos: number
  presentes: number
  faltando: number
  producao_total: number
}

interface ColabPresente {
  id: string
  nome: string
  chapa: string
  funcao: string
  obra: string
  tipo_contrato: string
  status_hoje: string
  horas?: number
}

export default function GestorDashboard() {
  const navigate = useNavigate()
  const hoje = new Date().toISOString().slice(0, 10)
  const semanaInicio = (() => {
    const d = new Date(); d.setDate(d.getDate() - d.getDay()); return d.toISOString().slice(0, 10)
  })()
  const mesInicio = hoje.slice(0, 8) + '01'

  const [loading, setLoading] = useState(true)
  const [obras, setObras] = useState<ObraData[]>([])
  const [obraFiltro, setObraFiltro] = useState('todas')
  const [presentes, setPresentes] = useState<ColabPresente[]>([])
  const [totalAtivos, setTotalAtivos] = useState(0)
  const [totalCLT, setTotalCLT] = useState(0)
  const [totalAutonomo, setTotalAutonomo] = useState(0)
  const [faltaHoje, setFaltaHoje] = useState(0)
  const [taxaPresencaDia, setTaxaPresencaDia] = useState(0)
  const [taxaPresencaSemana, setTaxaPresencaSemana] = useState(0)
  const [taxaPresencaMes, setTaxaPresencaMes] = useState(0)
  const [producaoTotal, setProducaoTotal] = useState(0)
  const [atestadosPendentes, setAtestadosPendentes] = useState(0)
  const [acidentesMes, setAcidentesMes] = useState(0)
  const [diasChuvososMes, setDiasChuvososMes] = useState(0)
  const [ultimoClima, setUltimoClima] = useState<any>(null)
  const [porFuncao, setPorFuncao] = useState<{ funcao: string; qtd: number; tipo: string }[]>([])
  const [porTipo, setPorTipo] = useState<{ tipo: string; qtd: number }[]>([])

  const fetchTudo = useCallback(async () => {
    setLoading(true)
    try {
      const [
        { data: colabs },
        { data: pontosHoje },
        { data: pontosSemana },
        { data: pontosMes },
        { data: obrasData },
        { data: atestados },
        { data: acidentes },
        { data: clima },
        { data: producao },
      ] = await Promise.all([
        supabase.from('colaboradores')
          .select('id, nome, chapa, tipo_contrato, status, funcao_id, obra_id, funcoes(nome, sigla), obras(nome, codigo)')
          .eq('status', 'ativo'),
        supabase.from('portal_ponto_diario')
          .select('colaborador_id, obra_id, status, horas_trabalhadas, playbook_item_id, servico_descricao')
          .eq('data', hoje),
        supabase.from('portal_ponto_diario')
          .select('colaborador_id, obra_id, status, data')
          .gte('data', semanaInicio)
          .lte('data', hoje),
        supabase.from('portal_ponto_diario')
          .select('colaborador_id, obra_id, status, data')
          .gte('data', mesInicio)
          .lte('data', hoje),
        supabase.from('obras')
          .select('id, nome, codigo')
          .neq('status', 'concluida')
          .order('nome'),
        supabase.from('atestados')
          .select('id')
          .eq('status', 'pendente'),
        supabase.from('acidentes')
          .select('id')
          .gte('data_acidente', mesInicio),
        supabase.from('obra_clima')
          .select('*')
          .gte('data', mesInicio)
          .lte('data', hoje)
          .order('data', { ascending: false }),
        supabase.from('portal_producao')
          .select('id, quantidade, unidade, obra_id, colaborador_id, servico_descricao, data')
          .gte('data', mesInicio),
      ])

      const ativos = colabs ?? []
      setTotalAtivos(ativos.length)
      setTotalCLT(ativos.filter(c => c.tipo_contrato === 'clt').length)
      setTotalAutonomo(ativos.filter(c => c.tipo_contrato !== 'clt').length)

      // Presença hoje
      const pontosMap = new Map<string, any>()
      ;(pontosHoje ?? []).forEach(p => pontosMap.set(p.colaborador_id, p))

      const presentesHoje = ativos.filter(c => {
        const p = pontosMap.get(c.id)
        return p && ['presente', 'meio_periodo', 'producao'].includes(p.status)
      })
      const faltasHoje = ativos.filter(c => {
        const p = pontosMap.get(c.id)
        return p && p.status === 'falta'
      })
      setFaltaHoje(faltasHoje.length)

      const taxa = ativos.length > 0 ? Math.round((presentesHoje.length / ativos.length) * 100) : 0
      setTaxaPresencaDia(taxa)

      // Taxa semana
      const diasUnicos = [...new Set((pontosSemana ?? []).map(p => p.data))]
      const presencasSemana = (pontosSemana ?? []).filter(p => ['presente', 'meio_periodo', 'producao'].includes(p.status)).length
      const totalPossiveisSemana = ativos.length * Math.max(diasUnicos.length, 1)
      setTaxaPresencaSemana(Math.round((presencasSemana / totalPossiveisSemana) * 100))

      // Taxa mês
      const diasUnicosMes = [...new Set((pontosMes ?? []).map(p => p.data))]
      const presencasMes = (pontosMes ?? []).filter(p => ['presente', 'meio_periodo', 'producao'].includes(p.status)).length
      const totalPossiveisMes = ativos.length * Math.max(diasUnicosMes.length, 1)
      setTaxaPresencaMes(Math.round((presencasMes / totalPossiveisMes) * 100))

      // Presentes detalhado
      setPresentes(presentesHoje.map(c => {
        const p = pontosMap.get(c.id)
        return {
          id: c.id,
          nome: c.nome,
          chapa: c.chapa ?? '',
          funcao: (c.funcoes as any)?.nome ?? '—',
          obra: (c.obras as any)?.nome ?? '—',
          tipo_contrato: c.tipo_contrato ?? 'clt',
          status_hoje: p?.status ?? 'presente',
          horas: p?.horas_trabalhadas ?? 0,
        }
      }))

      // Obras com dados
      const obrasComDados: ObraData[] = (obrasData ?? []).map(o => {
        const atvsObra = ativos.filter(c => c.obra_id === o.id)
        const presObra = presentesHoje.filter(c => c.obra_id === o.id)
        const prodObra = (producao ?? [])
          .filter((p: any) => p.obra_id === o.id)
          .reduce((s: number, p: any) => s + (p.quantidade ?? 0), 0)
        return {
          id: o.id,
          nome: o.nome,
          codigo: o.codigo ?? undefined,
          ativos: atvsObra.length,
          presentes: presObra.length,
          faltando: atvsObra.length - presObra.length,
          producao_total: prodObra,
        }
      })
      setObras(obrasComDados)

      // Produção total do mês
      const prodTotal = (producao ?? []).reduce((s: number, p: any) => s + (p.quantidade ?? 0), 0)
      setProducaoTotal(Math.round(prodTotal * 100) / 100)

      // Atestados e acidentes
      setAtestadosPendentes(atestados?.length ?? 0)
      setAcidentesMes(acidentes?.length ?? 0)

      // Clima
      const climaData = clima ?? []
      setDiasChuvososMes(climaData.filter(c => c.choveu).length)
      setUltimoClima(climaData[0] ?? null)

      // Por função
      const funcaoMap = new Map<string, { qtd: number; tipo: string }>()
      ativos.forEach(c => {
        const fn = (c.funcoes as any)?.nome ?? 'Sem função'
        const tipo = c.tipo_contrato ?? 'clt'
        if (!funcaoMap.has(fn)) funcaoMap.set(fn, { qtd: 0, tipo })
        funcaoMap.get(fn)!.qtd++
      })
      const funcaoArr = Array.from(funcaoMap.entries())
        .map(([funcao, v]) => ({ funcao, ...v }))
        .sort((a, b) => b.qtd - a.qtd)
        .slice(0, 8)
      setPorFuncao(funcaoArr)

      // Por tipo de contrato
      const tiposMap = new Map<string, number>()
      ativos.forEach(c => {
        const t = c.tipo_contrato ?? 'clt'
        tiposMap.set(t, (tiposMap.get(t) ?? 0) + 1)
      })
      setPorTipo(Array.from(tiposMap.entries()).map(([tipo, qtd]) => ({ tipo, qtd })))

    } finally {
      setLoading(false)
    }
  }, [hoje, semanaInicio, mesInicio])

  useEffect(() => { fetchTudo() }, [fetchTudo])

  const presentesFiltrados = useMemo(() => {
    if (obraFiltro === 'todas') return presentes
    return presentes.filter(p => obras.find(o => o.nome === p.obra && o.id === obraFiltro))
  }, [presentes, obraFiltro, obras])

  const obrasFiltradas = useMemo(() => {
    if (obraFiltro === 'todas') return obras
    return obras.filter(o => o.id === obraFiltro)
  }, [obras, obraFiltro])

  const kpis: KpiCard[] = [
    {
      label: 'Colaboradores Ativos',
      value: totalAtivos,
      sub: `${totalCLT} CLT · ${totalAutonomo} Autônomos`,
      icon: <Users size={20} />,
      color: '#2563eb', bg: '#eff6ff',
    },
    {
      label: 'Presentes Hoje',
      value: presentes.length,
      sub: `${faltaHoje} falta(s) registrada(s)`,
      icon: <UserCheck size={20} />,
      color: '#16a34a', bg: '#f0fdf4',
      trend: { val: `${taxaPresencaDia}%`, up: taxaPresencaDia >= 80 },
    },
    {
      label: 'Taxa Presença / Dia',
      value: `${taxaPresencaDia}%`,
      sub: `Semana: ${taxaPresencaSemana}% · Mês: ${taxaPresencaMes}%`,
      icon: <CalendarCheck size={20} />,
      color: '#0891b2', bg: '#ecfeff',
    },
    {
      label: 'Produção no Mês',
      value: producaoTotal.toLocaleString('pt-BR'),
      sub: 'Total de unidades/m² produzidos',
      icon: <BarChart3 size={20} />,
      color: '#b45309', bg: '#fffbeb',
    },
    {
      label: 'Atestados Pendentes',
      value: atestadosPendentes,
      sub: 'Aguardando validação',
      icon: <FileText size={20} />,
      color: atestadosPendentes > 0 ? '#7c3aed' : '#64748b',
      bg: atestadosPendentes > 0 ? '#f5f3ff' : '#f8fafc',
    },
    {
      label: 'Acidentes no Mês',
      value: acidentesMes,
      sub: 'Registrados neste mês',
      icon: <ShieldAlert size={20} />,
      color: acidentesMes > 0 ? '#dc2626' : '#64748b',
      bg: acidentesMes > 0 ? '#fef2f2' : '#f8fafc',
    },
    {
      label: 'Dias de Chuva',
      value: diasChuvososMes,
      sub: `Mês atual · Último: ${ultimoClima ? new Date(ultimoClima.data + 'T12:00').toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' }) : '—'}`,
      icon: <CloudRain size={20} />,
      color: '#0369a1', bg: '#f0f9ff',
    },
    {
      label: 'Obras Ativas',
      value: obras.length,
      sub: `${obras.filter(o => o.ativos > 0).length} com colaboradores`,
      icon: <Building2 size={20} />,
      color: '#059669', bg: '#f0fdf4',
    },
  ]

  if (loading) {
    return (
      <GestorLayout>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '60vh', flexDirection: 'column', gap: 12 }}>
          <Loader2 size={32} color="#2563eb" className="animate-spin" style={{ animation: 'spin 1s linear infinite' }} />
          <span style={{ color: '#64748b', fontSize: 14 }}>Carregando dados do gestor…</span>
        </div>
      </GestorLayout>
    )
  }

  return (
    <GestorLayout>
      {/* ── Header ── */}
      <div style={{ marginBottom: 20 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 10 }}>
          <div>
            <h1 style={{ fontSize: 22, fontWeight: 800, margin: 0, color: '#0f172a' }}>
              📊 Dashboard do Gestor
            </h1>
            <p style={{ color: '#64748b', fontSize: 13, margin: '4px 0 0' }}>
              {new Date().toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: 'long', year: 'numeric' })}
            </p>
          </div>

          {/* Filtro por obra */}
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            <button
              onClick={() => setObraFiltro('todas')}
              style={{
                padding: '6px 14px', borderRadius: 8, border: `2px solid ${obraFiltro === 'todas' ? '#2563eb' : '#e2e8f0'}`,
                background: obraFiltro === 'todas' ? '#eff6ff' : '#fff', color: obraFiltro === 'todas' ? '#2563eb' : '#64748b',
                fontWeight: 700, fontSize: 12, cursor: 'pointer',
              }}
            >
              🏗️ Todas as Obras
            </button>
            {obras.map(o => (
              <button
                key={o.id}
                onClick={() => setObraFiltro(o.id)}
                style={{
                  padding: '6px 14px', borderRadius: 8, border: `2px solid ${obraFiltro === o.id ? '#2563eb' : '#e2e8f0'}`,
                  background: obraFiltro === o.id ? '#eff6ff' : '#fff', color: obraFiltro === o.id ? '#2563eb' : '#64748b',
                  fontWeight: 600, fontSize: 12, cursor: 'pointer', maxWidth: 160, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                }}
              >
                {o.codigo ? `[${o.codigo}] ` : ''}{o.nome}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* ── KPIs Grid ── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 14, marginBottom: 24 }}>
        {kpis.map((k, i) => (
          <div key={i} style={{
            background: '#fff', borderRadius: 14, border: '1px solid #e2e8f0',
            padding: '16px 18px', boxShadow: '0 1px 4px rgba(0,0,0,0.06)',
            display: 'flex', alignItems: 'flex-start', gap: 12,
          }}>
            <div style={{ width: 40, height: 40, borderRadius: 10, background: k.bg, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              {React.cloneElement(k.icon as React.ReactElement, { color: k.color })}
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 11, color: '#64748b', fontWeight: 600, marginBottom: 2 }}>{k.label}</div>
              <div style={{ fontSize: 22, fontWeight: 800, color: k.color, lineHeight: 1.2 }}>{k.value}</div>
              {k.sub && <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 3 }}>{k.sub}</div>}
              {k.trend && (
                <div style={{ fontSize: 11, fontWeight: 700, color: k.trend.up ? '#16a34a' : '#dc2626', marginTop: 2 }}>
                  {k.trend.up ? '↑' : '↓'} {k.trend.val}
                </div>
              )}
            </div>
          </div>
        ))}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 20 }}>

        {/* ── Obras overview ── */}
        <div style={{ background: '#fff', borderRadius: 14, border: '1px solid #e2e8f0', padding: 18, boxShadow: '0 1px 4px rgba(0,0,0,0.06)' }}>
          <div style={{ fontWeight: 800, fontSize: 15, marginBottom: 14, display: 'flex', alignItems: 'center', gap: 8, color: '#0f172a' }}>
            <Building2 size={16} color="#2563eb" /> Situação por Obra
          </div>
          {obrasFiltradas.length === 0 ? (
            <div style={{ color: '#94a3b8', textAlign: 'center', padding: 24, fontSize: 13 }}>Nenhuma obra ativa</div>
          ) : obrasFiltradas.map(o => {
            const taxa = o.ativos > 0 ? Math.round((o.presentes / o.ativos) * 100) : 0
            return (
              <div key={o.id} style={{ marginBottom: 14, padding: '12px 14px', background: '#f8fafc', borderRadius: 10, border: '1px solid #e2e8f0' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
                  <div>
                    <span style={{ fontWeight: 700, fontSize: 13, color: '#1e293b' }}>{o.nome}</span>
                    {o.codigo && <span style={{ marginLeft: 6, fontSize: 10, background: '#e0f2fe', color: '#0369a1', borderRadius: 4, padding: '1px 6px', fontWeight: 700 }}>{o.codigo}</span>}
                  </div>
                  <span style={{ fontSize: 12, fontWeight: 800, color: taxa >= 80 ? '#16a34a' : taxa >= 50 ? '#b45309' : '#dc2626' }}>{taxa}%</span>
                </div>
                {/* Progress bar */}
                <div style={{ height: 6, background: '#e2e8f0', borderRadius: 3, overflow: 'hidden', marginBottom: 8 }}>
                  <div style={{ height: '100%', width: `${taxa}%`, borderRadius: 3, background: taxa >= 80 ? '#16a34a' : taxa >= 50 ? '#f59e0b' : '#dc2626', transition: 'width 0.5s' }} />
                </div>
                <div style={{ display: 'flex', gap: 12, fontSize: 11 }}>
                  <span style={{ color: '#16a34a', fontWeight: 700 }}>✓ {o.presentes} pres.</span>
                  <span style={{ color: '#dc2626', fontWeight: 600 }}>✗ {o.faltando} falta</span>
                  <span style={{ color: '#64748b' }}>Total: {o.ativos}</span>
                  {o.producao_total > 0 && <span style={{ color: '#b45309', fontWeight: 600 }}>📦 {o.producao_total.toLocaleString('pt-BR')}</span>}
                </div>
              </div>
            )
          })}
        </div>

        {/* ── Distribuição por Função ── */}
        <div style={{ background: '#fff', borderRadius: 14, border: '1px solid #e2e8f0', padding: 18, boxShadow: '0 1px 4px rgba(0,0,0,0.06)' }}>
          <div style={{ fontWeight: 800, fontSize: 15, marginBottom: 14, display: 'flex', alignItems: 'center', gap: 8, color: '#0f172a' }}>
            <HardHat size={16} color="#f59e0b" /> Equipe por Função
          </div>
          {porFuncao.length === 0 ? (
            <div style={{ color: '#94a3b8', textAlign: 'center', padding: 24, fontSize: 13 }}>Sem dados</div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {porFuncao.map((f, i) => {
                const pct = totalAtivos > 0 ? Math.round((f.qtd / totalAtivos) * 100) : 0
                const colors = ['#2563eb','#16a34a','#b45309','#7c3aed','#0891b2','#dc2626','#059669','#c2410c']
                const cor = colors[i % colors.length]
                return (
                  <div key={f.funcao}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 3 }}>
                      <span style={{ fontSize: 12, fontWeight: 600, color: '#374151' }}>{f.funcao}</span>
                      <span style={{ fontSize: 12, fontWeight: 700, color: cor }}>{f.qtd} <span style={{ fontWeight: 400, color: '#94a3b8' }}>({pct}%)</span></span>
                    </div>
                    <div style={{ height: 5, background: '#e2e8f0', borderRadius: 3, overflow: 'hidden' }}>
                      <div style={{ height: '100%', width: `${pct}%`, background: cor, borderRadius: 3, transition: 'width 0.4s' }} />
                    </div>
                  </div>
                )
              })}
            </div>
          )}

          {/* Tipos de contrato */}
          <div style={{ marginTop: 20, paddingTop: 14, borderTop: '1px solid #e2e8f0' }}>
            <div style={{ fontWeight: 700, fontSize: 12, color: '#64748b', marginBottom: 10, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Por Tipo de Contrato</div>
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
              {porTipo.map(t => (
                <div key={t.tipo} style={{
                  flex: 1, minWidth: 80,
                  background: t.tipo === 'clt' ? '#eff6ff' : '#fff7ed',
                  border: `1px solid ${t.tipo === 'clt' ? '#bfdbfe' : '#fed7aa'}`,
                  borderRadius: 10, padding: '10px 14px', textAlign: 'center',
                }}>
                  <div style={{ fontSize: 22, fontWeight: 800, color: t.tipo === 'clt' ? '#2563eb' : '#ea580c' }}>{t.qtd}</div>
                  <div style={{ fontSize: 11, fontWeight: 600, color: t.tipo === 'clt' ? '#1d4ed8' : '#c2410c' }}>
                    {t.tipo === 'clt' ? 'CLT' : t.tipo === 'autonomo' ? 'Autônomo' : t.tipo.toUpperCase()}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* ── Lista de Presentes ── */}
      <div style={{ background: '#fff', borderRadius: 14, border: '1px solid #e2e8f0', padding: 18, boxShadow: '0 1px 4px rgba(0,0,0,0.06)', marginBottom: 20 }}>
        <div style={{ fontWeight: 800, fontSize: 15, marginBottom: 14, display: 'flex', alignItems: 'center', justifyContent: 'space-between', color: '#0f172a' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <UserCheck size={16} color="#16a34a" />
            Colaboradores Presentes Hoje
            <span style={{ background: '#dcfce7', color: '#15803d', borderRadius: 20, padding: '2px 10px', fontSize: 11, fontWeight: 800 }}>{presentesFiltrados.length}</span>
          </div>
          <button
            onClick={() => navigate('/gestor/presenca')}
            style={{ fontSize: 12, color: '#2563eb', fontWeight: 700, background: 'none', border: 'none', cursor: 'pointer', textDecoration: 'underline' }}
          >
            Ver mais →
          </button>
        </div>

        {presentesFiltrados.length === 0 ? (
          <div style={{ color: '#94a3b8', textAlign: 'center', padding: 28, fontSize: 13 }}>
            📋 Nenhum ponto lançado hoje ainda
          </div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: 10 }}>
            {presentesFiltrados.slice(0, 12).map(c => {
              const statusColor: Record<string, string> = { presente: '#16a34a', meio_periodo: '#b45309', producao: '#7c3aed' }
              const statusLabel: Record<string, string> = { presente: 'Presente', meio_periodo: 'Meio Per.', producao: 'Produção' }
              const cor = statusColor[c.status_hoje] ?? '#64748b'
              return (
                <div key={c.id} style={{
                  display: 'flex', alignItems: 'center', gap: 10,
                  padding: '10px 12px', borderRadius: 10,
                  background: '#f8fafc', border: '1px solid #e2e8f0',
                }}>
                  <div style={{
                    width: 36, height: 36, borderRadius: '50%',
                    background: `linear-gradient(135deg, ${cor}22, ${cor}44)`,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    flexShrink: 0, fontSize: 13, fontWeight: 800, color: cor,
                  }}>
                    {c.nome.slice(0, 2).toUpperCase()}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 700, fontSize: 13, color: '#1e293b', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.nome}</div>
                    <div style={{ fontSize: 11, color: '#64748b', display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                      <span>🏷️ {c.funcao}</span>
                      <span>🏗️ {c.obra}</span>
                    </div>
                  </div>
                  <div style={{ flexShrink: 0, textAlign: 'right' }}>
                    <span style={{ fontSize: 10, fontWeight: 700, background: `${cor}18`, color: cor, borderRadius: 6, padding: '2px 7px', display: 'block' }}>
                      {statusLabel[c.status_hoje] ?? c.status_hoje}
                    </span>
                    {c.horas ? <span style={{ fontSize: 10, color: '#94a3b8' }}>{c.horas}h</span> : null}
                  </div>
                </div>
              )
            })}
          </div>
        )}
        {presentesFiltrados.length > 12 && (
          <div style={{ textAlign: 'center', marginTop: 12, fontSize: 12, color: '#64748b' }}>
            + {presentesFiltrados.length - 12} colaboradores — <button onClick={() => navigate('/gestor/presenca')} style={{ color: '#2563eb', fontWeight: 700, background: 'none', border: 'none', cursor: 'pointer' }}>Ver todos</button>
          </div>
        )}
      </div>

      {/* ── Clima ── */}
      {ultimoClima && (
        <div style={{ background: 'linear-gradient(135deg, #0ea5e9, #0369a1)', borderRadius: 14, padding: 18, boxShadow: '0 4px 12px rgba(14,165,233,0.3)', marginBottom: 20 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 10 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <div style={{ fontSize: 36 }}>
                {ultimoClima.choveu ? '🌧️' : '☀️'}
              </div>
              <div>
                <div style={{ color: 'rgba(255,255,255,0.75)', fontSize: 11, fontWeight: 600 }}>ÚLTIMO REGISTRO CLIMÁTICO</div>
                <div style={{ color: '#fff', fontWeight: 800, fontSize: 16 }}>
                  {new Date(ultimoClima.data + 'T12:00').toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: 'long' })}
                </div>
                <div style={{ color: 'rgba(255,255,255,0.75)', fontSize: 12, marginTop: 2 }}>
                  {ultimoClima.choveu ? `🌧 Choveu${ultimoClima.precipitacao_mm ? ` · ${ultimoClima.precipitacao_mm} mm` : ''}` : '☀️ Sem chuva'}
                  {ultimoClima.temperatura_max ? ` · 🌡 ${ultimoClima.temperatura_max}°C máx.` : ''}
                  {ultimoClima.vento_kmh ? ` · 💨 ${ultimoClima.vento_kmh} km/h` : ''}
                </div>
              </div>
            </div>
            <div style={{ display: 'flex', gap: 12 }}>
              <div style={{ textAlign: 'center', background: 'rgba(255,255,255,0.12)', borderRadius: 10, padding: '8px 16px' }}>
                <div style={{ color: '#fff', fontWeight: 800, fontSize: 20 }}>{diasChuvososMes}</div>
                <div style={{ color: 'rgba(255,255,255,0.70)', fontSize: 10 }}>Dias de chuva no mês</div>
              </div>
              <button
                onClick={() => navigate('/gestor/meteorologia')}
                style={{ background: 'rgba(255,255,255,0.15)', border: '1px solid rgba(255,255,255,0.3)', color: '#fff', borderRadius: 8, padding: '8px 14px', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}
              >
                📊 Ver tudo
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Atalhos ── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: 12 }}>
        {[
          { icon: '👥', label: 'Presença Detalhada', to: '/gestor/presenca', cor: '#2563eb', bg: '#eff6ff' },
          { icon: '📦', label: 'Produção por Obra', to: '/gestor/producao', cor: '#b45309', bg: '#fffbeb' },
          { icon: '🩺', label: 'Atestados', to: '/gestor/atestados', cor: '#7c3aed', bg: '#f5f3ff' },
          { icon: '⚠️', label: 'Acidentes', to: '/gestor/acidentes', cor: '#dc2626', bg: '#fef2f2' },
          { icon: '🌦️', label: 'Meteorologia', to: '/gestor/meteorologia', cor: '#0369a1', bg: '#f0f9ff' },
          { icon: '📊', label: 'Relatórios', to: '/gestor/relatorios', cor: '#64748b', bg: '#f8fafc' },
        ].map(a => (
          <button
            key={a.to}
            onClick={() => navigate(a.to)}
            style={{
              display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8,
              padding: '16px 12px', borderRadius: 12, border: `1px solid ${a.bg}`,
              background: '#fff', cursor: 'pointer', transition: 'transform 100ms, box-shadow 100ms',
              boxShadow: '0 1px 3px rgba(0,0,0,0.06)',
            }}
            onMouseEnter={e => { (e.currentTarget as HTMLElement).style.transform = 'translateY(-2px)'; (e.currentTarget as HTMLElement).style.boxShadow = '0 4px 12px rgba(0,0,0,0.1)' }}
            onMouseLeave={e => { (e.currentTarget as HTMLElement).style.transform = ''; (e.currentTarget as HTMLElement).style.boxShadow = '0 1px 3px rgba(0,0,0,0.06)' }}
          >
            <span style={{ fontSize: 24 }}>{a.icon}</span>
            <span style={{ fontSize: 11, fontWeight: 700, color: a.cor, textAlign: 'center' }}>{a.label}</span>
          </button>
        ))}
      </div>
    </GestorLayout>
  )
}
