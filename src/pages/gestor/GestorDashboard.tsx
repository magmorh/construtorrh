import React, { useEffect, useState, useCallback, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '@/lib/supabase'
import GestorLayout from './GestorLayout'
import {
  Users, UserCheck, CloudRain, BarChart3,
  Building2, FileText, ShieldAlert, Loader2,
  CalendarCheck,
} from 'lucide-react'

// ─── Tipos ───────────────────────────────────────────────────────────────────
interface ObraData {
  id: string; nome: string; codigo?: string
  ativos: number; presentes: number; faltando: number; producao_total: number
}
interface ColabPresente {
  id: string; nome: string; chapa: string; funcao: string
  obra: string; obra_id: string; tipo_contrato: string; status_hoje: string; horas: number
}
interface RawColab {
  id: string; nome: string; chapa: string | null; tipo_contrato: string | null
  obra_id: string | null; funcoes: { nome: string } | null; obras: { nome: string } | null
}

// ─── helpers ─────────────────────────────────────────────────────────────────
const fmtPct = (n: number) => `${n}%`
const TAXA_COR = (t: number) => t >= 80 ? '#16a34a' : t >= 50 ? '#b45309' : '#dc2626'

export default function GestorDashboard() {
  const navigate  = useNavigate()
  const hoje      = useMemo(() => new Date().toISOString().slice(0, 10), [])
  const semanaIni = useMemo(() => { const d = new Date(); d.setDate(d.getDate() - d.getDay()); return d.toISOString().slice(0, 10) }, [])
  const mesIni    = useMemo(() => hoje.slice(0, 8) + '01', [hoje])

  // ── Estado central ──────────────────────────────────────────────────────────
  const [loading,     setLoading]     = useState(true)
  const [obraFiltro,  setObraFiltro]  = useState('todas')

  // dados brutos (sempre todos)
  const [todasObras,    setTodasObras]    = useState<ObraData[]>([])
  const [todosPresentes,setTodosPresentes]= useState<ColabPresente[]>([])
  const [todosAtivos,   setTodosAtivos]   = useState<RawColab[]>([])

  // métricas globais (independentes da obra)
  const [taxaSemana,   setTaxaSemana]   = useState(0)
  const [taxaMes,      setTaxaMes]      = useState(0)
  const [diasChuva,    setDiasChuva]    = useState(0)
  const [ultimoClima,  setUltimoClima]  = useState<any>(null)
  const [atestados,    setAtestados]    = useState(0)
  const [acidentes,    setAcidentes]    = useState(0)
  const [porFuncao,    setPorFuncao]    = useState<{ fn: string; qtd: number }[]>([])
  const [porTipo,      setPorTipo]      = useState<{ tipo: string; qtd: number }[]>([])

  // ── Fetch tudo ──────────────────────────────────────────────────────────────
  const fetchTudo = useCallback(async () => {
    setLoading(true)
    try {
      const [
        { data: colabs    },
        { data: pHoje     },
        { data: pSemana   },
        { data: pMes      },
        { data: obrasRaw  },
        { data: atests    },
        { data: acids     },
        { data: climaData },
        { data: producao  },
      ] = await Promise.all([
        supabase.from('colaboradores')
          .select('id, nome, chapa, tipo_contrato, obra_id, funcoes(nome), obras(nome)')
          .eq('status', 'ativo'),
        supabase.from('portal_ponto_diario')
          .select('colaborador_id, obra_id, status, horas_extra')
          .eq('data', hoje),
        supabase.from('portal_ponto_diario')
          .select('colaborador_id, obra_id, status, data')
          .gte('data', semanaIni).lte('data', hoje),
        supabase.from('portal_ponto_diario')
          .select('colaborador_id, obra_id, status, data')
          .gte('data', mesIni).lte('data', hoje),
        supabase.from('obras')
          .select('id, nome, codigo')
          .neq('status', 'concluida')
          .order('nome'),
        supabase.from('atestados').select('id', { count: 'exact', head: true }).gte('data', mesIni),
        supabase.from('acidentes').select('id', { count: 'exact', head: true }).gte('data_ocorrencia', mesIni),
        supabase.from('obra_clima')
          .select('*').gte('data', mesIni).lte('data', hoje).order('data', { ascending: false }),
        supabase.from('ponto_producao')
          .select('id, quantidade, obra_id, mes_referencia')
          .gte('mes_referencia', mesIni.slice(0, 7)),
      ])

      const ativosArr = (colabs ?? []) as RawColab[]
      setTodosAtivos(ativosArr)

      // mapa ponto → obra hoje
      const pontoMap = new Map<string, { obra_id: string; status: string; horas_extra: number }>()
      ;(pHoje ?? []).forEach((p: any) => pontoMap.set(p.colaborador_id, p))

      // Presentes HOJE — usa obra_id DO PONTO (não do cadastro)
      const presHoje: ColabPresente[] = ativosArr
        .filter(c => {
          const p = pontoMap.get(c.id)
          return p && ['presente', 'meio_periodo', 'producao'].includes(p.status)
        })
        .map(c => {
          const p = pontoMap.get(c.id)!
          const obraObj = (obrasRaw ?? []).find(o => o.id === p.obra_id)
          return {
            id: c.id,
            nome: c.nome,
            chapa: c.chapa ?? '',
            funcao: (c.funcoes as any)?.nome ?? '—',
            obra: obraObj?.nome ?? (c.obras as any)?.nome ?? '—',
            obra_id: p.obra_id,
            tipo_contrato: c.tipo_contrato ?? 'clt',
            status_hoje: p.status,
            horas: p.horas_extra ?? 0,
          }
        })
      setTodosPresentes(presHoje)

      // Obras com métricas — usa obra_id DO PONTO para contagem de presentes
      const obrasComDados: ObraData[] = (obrasRaw ?? []).map(o => {
        const atvsObra  = ativosArr.filter(c => c.obra_id === o.id)
        const presObra  = presHoje.filter(p => p.obra_id === o.id)
        const prodObra  = (producao ?? [])
          .filter((p: any) => p.obra_id === o.id)
          .reduce((s: number, p: any) => s + (p.quantidade ?? 0), 0)
        return {
          id: o.id, nome: o.nome, codigo: o.codigo ?? undefined,
          ativos: atvsObra.length, presentes: presObra.length,
          faltando: atvsObra.length - presObra.length,
          producao_total: Math.round(prodObra * 100) / 100,
        }
      })
      setTodasObras(obrasComDados)

      // Taxa semana/mês (globais)
      const diasUnicos = [...new Set((pSemana ?? []).map((p: any) => p.data))]
      const presSemana = (pSemana ?? []).filter((p: any) => ['presente','meio_periodo','producao'].includes(p.status)).length
      setTaxaSemana(Math.round((presSemana / Math.max(ativosArr.length * Math.max(diasUnicos.length, 1), 1)) * 100))

      const diasUnicosMes = [...new Set((pMes ?? []).map((p: any) => p.data))]
      const presMes = (pMes ?? []).filter((p: any) => ['presente','meio_periodo','producao'].includes(p.status)).length
      setTaxaMes(Math.round((presMes / Math.max(ativosArr.length * Math.max(diasUnicosMes.length, 1), 1)) * 100))

      // Clima
      const cl = climaData ?? []
      setDiasChuva(cl.filter((c: any) => c.choveu).length)
      setUltimoClima(cl[0] ?? null)

      // Alertas
      setAtestados((atests as any)?.length ?? 0)
      setAcidentes((acids as any)?.length ?? 0)

      // Por função — todos os ativos
      const fnMap = new Map<string, number>()
      ativosArr.forEach(c => {
        const fn = (c.funcoes as any)?.nome ?? 'Sem função'
        fnMap.set(fn, (fnMap.get(fn) ?? 0) + 1)
      })
      setPorFuncao(Array.from(fnMap.entries()).map(([fn, qtd]) => ({ fn, qtd })).sort((a, b) => b.qtd - a.qtd).slice(0, 8))

      // Por tipo
      const tpMap = new Map<string, number>()
      ativosArr.forEach(c => { const t = c.tipo_contrato ?? 'clt'; tpMap.set(t, (tpMap.get(t) ?? 0) + 1) })
      setPorTipo(Array.from(tpMap.entries()).map(([tipo, qtd]) => ({ tipo, qtd })))

    } finally {
      setLoading(false)
    }
  }, [hoje, semanaIni, mesIni])

  useEffect(() => { fetchTudo() }, [fetchTudo])

  // ── Dados FILTRADOS por obra ────────────────────────────────────────────────
  const presentes = useMemo(() =>
    obraFiltro === 'todas' ? todosPresentes : todosPresentes.filter(p => p.obra_id === obraFiltro),
  [todosPresentes, obraFiltro])

  const ativos = useMemo(() =>
    obraFiltro === 'todas' ? todosAtivos : todosAtivos.filter(c => c.obra_id === obraFiltro),
  [todosAtivos, obraFiltro])

  const obras = useMemo(() =>
    obraFiltro === 'todas' ? todasObras : todasObras.filter(o => o.id === obraFiltro),
  [todasObras, obraFiltro])

  const faltas = useMemo(() => {
    const presIds = new Set(presentes.map(p => p.id))
    return ativos.filter(c => !presIds.has(c.id)).length
  }, [ativos, presentes])

  const taxaDia = useMemo(() =>
    ativos.length > 0 ? Math.round((presentes.length / ativos.length) * 100) : 0,
  [ativos, presentes])

  const producaoFiltrada = useMemo(() =>
    obras.reduce((s, o) => s + o.producao_total, 0),
  [obras])

  // ── Loading ──────────────────────────────────────────────────────────────────
  if (loading) {
    return (
      <GestorLayout>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '60vh', flexDirection: 'column', gap: 12 }}>
          <Loader2 size={32} color="#2563eb" style={{ animation: 'spin 1s linear infinite' }} />
          <span style={{ color: '#64748b', fontSize: 14 }}>Carregando dados…</span>
          <style>{`@keyframes spin{from{transform:rotate(0deg)}to{transform:rotate(360deg)}}`}</style>
        </div>
      </GestorLayout>
    )
  }

  // ─────────────────────────────────────────────────────────────────────────────
  return (
    <GestorLayout>
      <style>{`
        @keyframes spin{from{transform:rotate(0deg)}to{transform:rotate(360deg)}}
        .dash-grid-2{display:grid;grid-template-columns:1fr 1fr;gap:16px}
        .dash-grid-4{display:grid;grid-template-columns:repeat(4,1fr);gap:14px}
        .dash-grid-6{display:grid;grid-template-columns:repeat(auto-fill,minmax(160px,1fr));gap:12px}
        .kpi-grid   {display:grid;grid-template-columns:repeat(auto-fill,minmax(200px,1fr));gap:12px}
        .presente-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(260px,1fr));gap:10px}
        @media(max-width:640px){
          .dash-grid-2{grid-template-columns:1fr!important}
          .dash-grid-4{grid-template-columns:1fr 1fr!important}
          .kpi-grid   {grid-template-columns:1fr 1fr!important}
          .presente-grid{grid-template-columns:1fr!important}
          .dash-grid-6{grid-template-columns:repeat(3,1fr)!important}
        }
      `}</style>

      {/* ══ HEADER ══════════════════════════════════════════════════════════════ */}
      <div style={{ marginBottom: 20 }}>
        <h1 style={{ fontSize: 20, fontWeight: 800, margin: '0 0 4px', color: '#0f172a', display: 'flex', alignItems: 'center', gap: 8 }}>
          📊 Dashboard do Gestor
        </h1>
        <p style={{ color: '#64748b', fontSize: 12, margin: 0 }}>
          {new Date().toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: 'long', year: 'numeric' })}
        </p>
      </div>

      {/* ══ FILTRO DE OBRA ══════════════════════════════════════════════════════ */}
      <div style={{
        display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 20,
        padding: '10px 14px', background: '#fff',
        borderRadius: 12, border: '1px solid #e2e8f0',
        boxShadow: '0 1px 3px rgba(0,0,0,0.05)',
      }}>
        {[{ id: 'todas', label: '🏗️ Todas as Obras', codigo: '' }, ...todasObras.map(o => ({ id: o.id, label: o.nome, codigo: o.codigo ?? '' }))].map(o => (
          <button
            key={o.id}
            onClick={() => setObraFiltro(o.id)}
            style={{
              padding: '6px 14px', borderRadius: 20,
              border: `2px solid ${obraFiltro === o.id ? '#2563eb' : '#e2e8f0'}`,
              background: obraFiltro === o.id ? '#2563eb' : '#f8fafc',
              color: obraFiltro === o.id ? '#fff' : '#374151',
              fontWeight: 700, fontSize: 12, cursor: 'pointer',
              whiteSpace: 'nowrap', transition: 'all 0.15s',
            }}
          >
            {o.codigo ? `[${o.codigo}] ` : ''}{o.label}
          </button>
        ))}
      </div>

      {/* ══ KPIs ════════════════════════════════════════════════════════════════ */}
      <div className="kpi-grid" style={{ marginBottom: 20 }}>
        {[
          {
            label: 'Colaboradores Ativos', value: ativos.length,
            sub: obraFiltro === 'todas'
              ? `${todosAtivos.filter(c=>c.tipo_contrato==='clt').length} CLT · ${todosAtivos.filter(c=>c.tipo_contrato!=='clt').length} Autônomos`
              : `nesta obra`,
            icon: <Users size={18} />, color: '#2563eb', bg: '#eff6ff',
          },
          {
            label: 'Presentes Hoje', value: presentes.length,
            sub: `${faltas} falta(s) · ${fmtPct(taxaDia)} taxa`,
            icon: <UserCheck size={18} />, color: '#16a34a', bg: '#f0fdf4',
            extra: <span style={{ fontSize: 12, fontWeight: 800, color: TAXA_COR(taxaDia) }}>↑ {fmtPct(taxaDia)}</span>,
          },
          {
            label: 'Taxa Presença', value: fmtPct(taxaDia),
            sub: obraFiltro === 'todas' ? `Semana: ${fmtPct(taxaSemana)} · Mês: ${fmtPct(taxaMes)}` : 'hoje nesta obra',
            icon: <CalendarCheck size={18} />, color: TAXA_COR(taxaDia), bg: taxaDia >= 80 ? '#f0fdf4' : taxaDia >= 50 ? '#fffbeb' : '#fef2f2',
          },
          {
            label: 'Produção no Mês', value: producaoFiltrada.toLocaleString('pt-BR'),
            sub: 'unidades / m²',
            icon: <BarChart3 size={18} />, color: '#b45309', bg: '#fffbeb',
          },
          {
            label: 'Atestados no Mês', value: atestados,
            sub: 'registrados',
            icon: <FileText size={18} />, color: atestados > 0 ? '#7c3aed' : '#64748b', bg: atestados > 0 ? '#f5f3ff' : '#f8fafc',
          },
          {
            label: 'Acidentes no Mês', value: acidentes,
            sub: 'registrados',
            icon: <ShieldAlert size={18} />, color: acidentes > 0 ? '#dc2626' : '#64748b', bg: acidentes > 0 ? '#fef2f2' : '#f8fafc',
          },
          {
            label: 'Dias de Chuva', value: diasChuva,
            sub: 'este mês',
            icon: <CloudRain size={18} />, color: '#0369a1', bg: '#f0f9ff',
          },
          {
            label: 'Obras Ativas', value: todasObras.length,
            sub: `${todasObras.filter(o=>o.ativos>0).length} com colaboradores`,
            icon: <Building2 size={18} />, color: '#059669', bg: '#f0fdf4',
          },
        ].map((k, i) => (
          <div key={i} style={{
            background: '#fff', borderRadius: 12, border: '1px solid #e2e8f0',
            padding: '14px 16px', boxShadow: '0 1px 3px rgba(0,0,0,0.05)',
            display: 'flex', alignItems: 'flex-start', gap: 12,
          }}>
            <div style={{ width: 38, height: 38, borderRadius: 10, background: k.bg, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              {React.cloneElement(k.icon as React.ReactElement, { color: k.color })}
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 10, color: '#64748b', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em' }}>{k.label}</div>
              <div style={{ fontSize: 20, fontWeight: 900, color: k.color, lineHeight: 1.2, marginTop: 2 }}>{k.value}</div>
              <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 2 }}>{k.sub}</div>
              {(k as any).extra && <div style={{ marginTop: 2 }}>{(k as any).extra}</div>}
            </div>
          </div>
        ))}
      </div>

      {/* ══ LINHA 2: Obras + Equipe ══════════════════════════════════════════ */}
      <div className="dash-grid-2" style={{ marginBottom: 20 }}>

        {/* Situação por Obra */}
        <div style={{ background: '#fff', borderRadius: 14, border: '1px solid #e2e8f0', padding: 18 }}>
          <div style={{ fontWeight: 800, fontSize: 14, marginBottom: 14, display: 'flex', alignItems: 'center', gap: 8, color: '#0f172a' }}>
            <Building2 size={15} color="#2563eb" /> Situação por Obra
          </div>
          {obras.length === 0
            ? <div style={{ color: '#94a3b8', textAlign: 'center', padding: 24, fontSize: 13 }}>Nenhuma obra ativa</div>
            : obras.map(o => {
                const taxa = o.ativos > 0 ? Math.round((o.presentes / o.ativos) * 100) : 0
                return (
                  <div key={o.id} style={{ marginBottom: 12, padding: '10px 12px', background: '#f8fafc', borderRadius: 10, border: '1px solid #e2e8f0' }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 5 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6, minWidth: 0 }}>
                        <span style={{ fontWeight: 700, fontSize: 13, color: '#1e293b', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{o.nome}</span>
                        {o.codigo && <span style={{ fontSize: 10, background: '#e0f2fe', color: '#0369a1', borderRadius: 4, padding: '1px 5px', fontWeight: 700, flexShrink: 0 }}>{o.codigo}</span>}
                      </div>
                      <span style={{ fontSize: 13, fontWeight: 800, color: TAXA_COR(taxa), flexShrink: 0, marginLeft: 8 }}>{taxa}%</span>
                    </div>
                    <div style={{ height: 5, background: '#e2e8f0', borderRadius: 3, overflow: 'hidden', marginBottom: 6 }}>
                      <div style={{ height: '100%', width: `${taxa}%`, borderRadius: 3, background: TAXA_COR(taxa), transition: 'width 0.5s' }} />
                    </div>
                    <div style={{ display: 'flex', gap: 10, fontSize: 11, flexWrap: 'wrap' }}>
                      <span style={{ color: '#16a34a', fontWeight: 700 }}>✓ {o.presentes} pres.</span>
                      <span style={{ color: '#dc2626', fontWeight: 600 }}>✗ {o.faltando} falta</span>
                      <span style={{ color: '#64748b' }}>Total: {o.ativos}</span>
                      {o.producao_total > 0 && <span style={{ color: '#b45309', fontWeight: 700 }}>📦 {o.producao_total.toLocaleString('pt-BR')}</span>}
                    </div>
                  </div>
                )
              })
          }
        </div>

        {/* Equipe por Função */}
        <div style={{ background: '#fff', borderRadius: 14, border: '1px solid #e2e8f0', padding: 18 }}>
          <div style={{ fontWeight: 800, fontSize: 14, marginBottom: 14, display: 'flex', alignItems: 'center', gap: 8, color: '#0f172a' }}>
            👷 Equipe por Função
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
            {porFuncao.map((f, i) => {
              const pct   = todosAtivos.length > 0 ? Math.round((f.qtd / todosAtivos.length) * 100) : 0
              const cores = ['#2563eb','#16a34a','#b45309','#7c3aed','#0891b2','#dc2626','#059669','#c2410c']
              const cor   = cores[i % cores.length]
              return (
                <div key={f.fn}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 2 }}>
                    <span style={{ fontSize: 12, fontWeight: 600, color: '#374151' }}>{f.fn}</span>
                    <span style={{ fontSize: 12, fontWeight: 700, color: cor }}>{f.qtd} <span style={{ fontWeight: 400, color: '#94a3b8' }}>({pct}%)</span></span>
                  </div>
                  <div style={{ height: 4, background: '#e2e8f0', borderRadius: 2, overflow: 'hidden' }}>
                    <div style={{ height: '100%', width: `${pct}%`, background: cor, borderRadius: 2 }} />
                  </div>
                </div>
              )
            })}
          </div>

          {/* Tipo de contrato */}
          <div style={{ marginTop: 18, paddingTop: 14, borderTop: '1px solid #e2e8f0' }}>
            <div style={{ fontWeight: 700, fontSize: 11, color: '#64748b', marginBottom: 10, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Por Tipo de Contrato</div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {porTipo.map(t => (
                <div key={t.tipo} style={{
                  flex: 1, minWidth: 70, textAlign: 'center',
                  background: t.tipo === 'clt' ? '#eff6ff' : '#fff7ed',
                  border: `1px solid ${t.tipo === 'clt' ? '#bfdbfe' : '#fed7aa'}`,
                  borderRadius: 10, padding: '10px 12px',
                }}>
                  <div style={{ fontSize: 20, fontWeight: 900, color: t.tipo === 'clt' ? '#2563eb' : '#ea580c' }}>{t.qtd}</div>
                  <div style={{ fontSize: 11, fontWeight: 700, color: t.tipo === 'clt' ? '#1d4ed8' : '#c2410c' }}>
                    {t.tipo === 'clt' ? 'CLT' : t.tipo === 'autonomo' ? 'Autônomo' : t.tipo.toUpperCase()}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* ══ PRESENTES HOJE ══════════════════════════════════════════════════ */}
      <div style={{ background: '#fff', borderRadius: 14, border: '1px solid #e2e8f0', padding: 18, marginBottom: 20 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14, flexWrap: 'wrap', gap: 8 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontWeight: 800, fontSize: 14, color: '#0f172a' }}>
            <UserCheck size={15} color="#16a34a" />
            Colaboradores Presentes Hoje
            <span style={{ background: '#dcfce7', color: '#15803d', borderRadius: 20, padding: '2px 10px', fontSize: 11, fontWeight: 800 }}>
              {presentes.length}
            </span>
          </div>
          <button onClick={() => navigate('/gestor/presenca')}
            style={{ fontSize: 12, color: '#2563eb', fontWeight: 700, background: 'none', border: 'none', cursor: 'pointer' }}>
            Ver todos →
          </button>
        </div>

        {presentes.length === 0 ? (
          <div style={{ textAlign: 'center', padding: 28, color: '#94a3b8', fontSize: 13 }}>
            📋 Nenhum ponto lançado hoje
            {obraFiltro !== 'todas' && <> nesta obra</>}
          </div>
        ) : (
          <div className="presente-grid">
            {presentes.slice(0, 12).map(c => {
              const cmap: Record<string, string> = { presente: '#16a34a', meio_periodo: '#b45309', producao: '#7c3aed' }
              const lmap: Record<string, string> = { presente: 'Presente', meio_periodo: 'Meio Per.', producao: 'Produção' }
              const cor = cmap[c.status_hoje] ?? '#64748b'
              return (
                <div key={c.id} style={{
                  display: 'flex', alignItems: 'center', gap: 10,
                  padding: '10px 12px', borderRadius: 10,
                  background: '#f8fafc', border: '1px solid #e2e8f0',
                }}>
                  <div style={{
                    width: 34, height: 34, borderRadius: '50%',
                    background: `${cor}22`, flexShrink: 0,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: 12, fontWeight: 800, color: cor,
                  }}>
                    {c.nome.replace(/\b(DOS|DE|DA|DO)\b/gi, '').trim().split(' ').filter(Boolean).slice(0,2).map(s=>s[0]).join('').toUpperCase()}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 700, fontSize: 13, color: '#1e293b', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.nome}</div>
                    <div style={{ fontSize: 10, color: '#64748b', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      🏷️ {c.funcao} · 🏗️ {c.obra}
                    </div>
                  </div>
                  <div style={{ flexShrink: 0, textAlign: 'right' }}>
                    <span style={{ fontSize: 10, fontWeight: 700, background: `${cor}18`, color: cor, borderRadius: 6, padding: '2px 7px', display: 'block', whiteSpace: 'nowrap' }}>
                      {lmap[c.status_hoje] ?? c.status_hoje}
                    </span>
                    {c.horas > 0 && <span style={{ fontSize: 10, color: '#94a3b8' }}>{c.horas}h</span>}
                  </div>
                </div>
              )
            })}
          </div>
        )}
        {presentes.length > 12 && (
          <div style={{ textAlign: 'center', marginTop: 12, fontSize: 12, color: '#64748b' }}>
            +{presentes.length - 12} colaboradores —{' '}
            <button onClick={() => navigate('/gestor/presenca')} style={{ color: '#2563eb', fontWeight: 700, background: 'none', border: 'none', cursor: 'pointer' }}>
              Ver todos
            </button>
          </div>
        )}
      </div>

      {/* ══ CLIMA ════════════════════════════════════════════════════════════ */}
      {ultimoClima && (
        <div style={{
          background: 'linear-gradient(135deg,#0ea5e9,#0369a1)',
          borderRadius: 14, padding: 18, marginBottom: 20,
          boxShadow: '0 4px 12px rgba(14,165,233,0.3)',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <span style={{ fontSize: 36 }}>{ultimoClima.choveu ? '🌧️' : '☀️'}</span>
              <div>
                <div style={{ color: 'rgba(255,255,255,0.7)', fontSize: 10, fontWeight: 700, textTransform: 'uppercase' }}>Último Registro Climático</div>
                <div style={{ color: '#fff', fontWeight: 800, fontSize: 15 }}>
                  {new Date(ultimoClima.data + 'T12:00').toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: 'long' })}
                </div>
                <div style={{ color: 'rgba(255,255,255,0.75)', fontSize: 11, marginTop: 2 }}>
                  {ultimoClima.choveu ? `🌧 Choveu${ultimoClima.precipitacao_mm ? ` · ${ultimoClima.precipitacao_mm} mm` : ''}` : '☀️ Sem chuva'}
                  {ultimoClima.temperatura_max ? ` · 🌡 ${ultimoClima.temperatura_max}°C` : ''}
                  {ultimoClima.vento_kmh ? ` · 💨 ${ultimoClima.vento_kmh} km/h` : ''}
                </div>
              </div>
            </div>
            <div style={{ display: 'flex', gap: 10, flexShrink: 0 }}>
              <div style={{ textAlign: 'center', background: 'rgba(255,255,255,0.12)', borderRadius: 10, padding: '8px 16px' }}>
                <div style={{ color: '#fff', fontWeight: 900, fontSize: 22 }}>{diasChuva}</div>
                <div style={{ color: 'rgba(255,255,255,0.7)', fontSize: 10 }}>Dias chuva/mês</div>
              </div>
              <button onClick={() => navigate('/gestor/meteorologia')}
                style={{ background: 'rgba(255,255,255,0.15)', border: '1px solid rgba(255,255,255,0.3)', color: '#fff', borderRadius: 8, padding: '8px 14px', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>
                📊 Ver tudo
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ══ ATALHOS ══════════════════════════════════════════════════════════ */}
      <div className="dash-grid-6">
        {[
          { icon: '👥', label: 'Presença', to: '/gestor/presenca', cor: '#2563eb' },
          { icon: '📦', label: 'Produção', to: '/gestor/producao', cor: '#b45309' },
          { icon: '🩺', label: 'Atestados', to: '/gestor/atestados', cor: '#7c3aed' },
          { icon: '⚠️', label: 'Acidentes', to: '/gestor/acidentes', cor: '#dc2626' },
          { icon: '🌦️', label: 'Meteorologia', to: '/gestor/meteorologia', cor: '#0369a1' },
          { icon: '📊', label: 'Relatórios', to: '/gestor/relatorios', cor: '#64748b' },
        ].map(a => (
          <button key={a.to} onClick={() => navigate(a.to)} style={{
            display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6,
            padding: '14px 10px', borderRadius: 12,
            border: '1px solid #e2e8f0', background: '#fff', cursor: 'pointer',
            transition: 'transform 100ms, box-shadow 100ms',
          }}
            onMouseEnter={e => { (e.currentTarget as HTMLElement).style.cssText += ';transform:translateY(-2px);box-shadow:0 4px 12px rgba(0,0,0,0.10)' }}
            onMouseLeave={e => { (e.currentTarget as HTMLElement).style.transform = ''; (e.currentTarget as HTMLElement).style.boxShadow = '' }}
          >
            <span style={{ fontSize: 22 }}>{a.icon}</span>
            <span style={{ fontSize: 11, fontWeight: 700, color: a.cor }}>{a.label}</span>
          </button>
        ))}
      </div>
    </GestorLayout>
  )
}
