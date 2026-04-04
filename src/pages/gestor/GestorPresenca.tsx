import React, { useEffect, useState, useCallback, useMemo } from 'react'
import { supabase } from '@/lib/supabase'
import GestorLayout from './GestorLayout'
import { Users, UserCheck, UserX, Clock, Search, Filter, Loader2, Download, CalendarDays } from 'lucide-react'

type StatusPonto = 'presente' | 'falta' | 'meio_periodo' | 'falta_justificada' | 'producao'

interface ColabRow {
  id: string; nome: string; chapa: string; funcao: string; obra: string
  obra_id: string; tipo_contrato: string
}

interface PontoRow {
  colaborador_id: string; data: string; status: StatusPonto
  horas_trabalhadas?: number; observacoes?: string; obra_id: string
}

const STATUS_CONFIG: Record<string, { label: string; cor: string; bg: string; emoji: string }> = {
  presente:          { label: 'Presente',       cor: '#15803d', bg: '#dcfce7', emoji: '✅' },
  falta:             { label: 'Falta',           cor: '#dc2626', bg: '#fee2e2', emoji: '❌' },
  meio_periodo:      { label: 'Meio Período',    cor: '#b45309', bg: '#fef3c7', emoji: '🌗' },
  falta_justificada: { label: 'Falta Justif.',   cor: '#6b7280', bg: '#f3f4f6', emoji: '📋' },
  producao:          { label: 'Produção',        cor: '#7c3aed', bg: '#f3e8ff', emoji: '⚙️' },
  sem_lancamento:    { label: 'Sem lançamento',  cor: '#94a3b8', bg: '#f8fafc', emoji: '—' },
}

export default function GestorPresenca() {
  const hoje = new Date().toISOString().slice(0, 10)
  const mesInicio = hoje.slice(0, 8) + '01'

  const [loading, setLoading] = useState(true)
  const [data, setData] = useState(hoje)
  const [viewMode, setViewMode] = useState<'dia' | 'semana' | 'mes'>('dia')
  const [colabs, setColabs] = useState<ColabRow[]>([])
  const [pontos, setPontos] = useState<PontoRow[]>([])
  const [obras, setObras] = useState<{ id: string; nome: string }[]>([])
  const [obraFiltro, setObraFiltro] = useState('todas')
  const [busca, setBusca] = useState('')
  const [statusFiltro, setStatusFiltro] = useState('todos')

  // Taxas
  const [taxaDia, setTaxaDia] = useState(0)
  const [taxaSemana, setTaxaSemana] = useState(0)
  const [taxaMes, setTaxaMes] = useState(0)

  const fetchData = useCallback(async () => {
    setLoading(true)
    try {
      let dataInicio = data
      let dataFim = data

      if (viewMode === 'semana') {
        const d = new Date(data + 'T12:00')
        const dom = new Date(d); dom.setDate(d.getDate() - d.getDay())
        const sab = new Date(d); sab.setDate(d.getDate() - d.getDay() + 6)
        dataInicio = dom.toISOString().slice(0, 10)
        dataFim = sab.toISOString().slice(0, 10)
      } else if (viewMode === 'mes') {
        dataInicio = data.slice(0, 8) + '01'
        const lastDay = new Date(parseInt(data.slice(0, 4)), parseInt(data.slice(5, 7)), 0).getDate()
        dataFim = data.slice(0, 8) + String(lastDay).padStart(2, '0')
      }

      const [
        { data: colabsData },
        { data: pontosData },
        { data: obrasData },
        { data: pontosSemana },
        { data: pontosMes },
      ] = await Promise.all([
        supabase.from('colaboradores')
          .select('id, nome, chapa, tipo_contrato, obra_id, funcoes(nome), obras(nome, id)')
          .eq('status', 'ativo'),
        supabase.from('portal_ponto_diario')
          .select('colaborador_id, data, status, horas_trabalhadas, observacoes, obra_id')
          .gte('data', dataInicio)
          .lte('data', dataFim),
        supabase.from('obras').select('id, nome').neq('status', 'concluida').order('nome'),
        supabase.from('portal_ponto_diario')
          .select('colaborador_id, status, data')
          .gte('data', (() => { const d = new Date(); d.setDate(d.getDate() - d.getDay()); return d.toISOString().slice(0, 10) })())
          .lte('data', hoje),
        supabase.from('portal_ponto_diario')
          .select('colaborador_id, status, data')
          .gte('data', mesInicio)
          .lte('data', hoje),
      ])

      const cs: ColabRow[] = (colabsData ?? []).map((c: any) => ({
        id: c.id, nome: c.nome, chapa: c.chapa ?? '', tipo_contrato: c.tipo_contrato ?? 'clt',
        funcao: c.funcoes?.nome ?? '—',
        obra: c.obras?.nome ?? '—',
        obra_id: c.obra_id ?? '',
      }))
      setColabs(cs)
      setPontos(pontosData ?? [])
      setObras(obrasData ?? [])

      // Taxas
      const total = cs.length
      if (total > 0) {
        // Dia
        const presHoje = (pontosData ?? []).filter((p: any) => p.data === hoje && ['presente', 'meio_periodo', 'producao'].includes(p.status)).length
        setTaxaDia(Math.round((presHoje / total) * 100))

        // Semana
        const diasSem = [...new Set((pontosSemana ?? []).map((p: any) => p.data))]
        const presSem = (pontosSemana ?? []).filter((p: any) => ['presente', 'meio_periodo', 'producao'].includes(p.status)).length
        setTaxaSemana(Math.round((presSem / (total * Math.max(diasSem.length, 1))) * 100))

        // Mês
        const diasMes = [...new Set((pontosMes ?? []).map((p: any) => p.data))]
        const presMes = (pontosMes ?? []).filter((p: any) => ['presente', 'meio_periodo', 'producao'].includes(p.status)).length
        setTaxaMes(Math.round((presMes / (total * Math.max(diasMes.length, 1))) * 100))
      }
    } finally {
      setLoading(false)
    }
  }, [data, viewMode, hoje, mesInicio])

  useEffect(() => { fetchData() }, [fetchData])

  const pontosMap = useMemo(() => {
    const m = new Map<string, Map<string, PontoRow>>()
    pontos.forEach(p => {
      if (!m.has(p.colaborador_id)) m.set(p.colaborador_id, new Map())
      m.get(p.colaborador_id)!.set(p.data, p)
    })
    return m
  }, [pontos])

  const diasRange = useMemo(() => {
    if (viewMode === 'dia') return [data]
    let start = data, end = data
    if (viewMode === 'semana') {
      const d = new Date(data + 'T12:00')
      const dom = new Date(d); dom.setDate(d.getDate() - d.getDay())
      start = dom.toISOString().slice(0, 10)
      const sab = new Date(dom); sab.setDate(dom.getDate() + 5)
      end = sab.toISOString().slice(0, 10)
    } else {
      start = data.slice(0, 8) + '01'
      const lastDay = new Date(parseInt(data.slice(0, 4)), parseInt(data.slice(5, 7)), 0).getDate()
      end = data.slice(0, 8) + String(lastDay).padStart(2, '0')
    }
    const dias: string[] = []
    const cur = new Date(start + 'T12:00')
    const endD = new Date(end + 'T12:00')
    while (cur <= endD) {
      const day = cur.getDay()
      if (day !== 0 && day !== 6) dias.push(cur.toISOString().slice(0, 10))
      cur.setDate(cur.getDate() + 1)
    }
    return dias
  }, [data, viewMode])

  const colabsFiltrados = useMemo(() => {
    let arr = colabs
    if (obraFiltro !== 'todas') arr = arr.filter(c => c.obra_id === obraFiltro)
    if (busca.trim()) {
      const q = busca.toLowerCase()
      arr = arr.filter(c => c.nome.toLowerCase().includes(q) || c.chapa.toLowerCase().includes(q) || c.funcao.toLowerCase().includes(q))
    }
    if (statusFiltro !== 'todos') {
      arr = arr.filter(c => {
        const s = pontosMap.get(c.id)?.get(data)?.status ?? 'sem_lancamento'
        return s === statusFiltro
      })
    }
    return arr
  }, [colabs, obraFiltro, busca, statusFiltro, pontosMap, data])

  const resumo = useMemo(() => {
    if (viewMode !== 'dia') return null
    const stats = { presentes: 0, faltas: 0, meio_periodo: 0, falta_justificada: 0, producao: 0, sem_lancamento: 0 }
    colabs.forEach(c => {
      const s = pontosMap.get(c.id)?.get(data)?.status ?? 'sem_lancamento'
      if (s === 'presente') stats.presentes++
      else if (s === 'falta') stats.faltas++
      else if (s === 'meio_periodo') stats.meio_periodo++
      else if (s === 'falta_justificada') stats.falta_justificada++
      else if (s === 'producao') stats.producao++
      else stats.sem_lancamento++
    })
    return stats
  }, [colabs, pontosMap, data, viewMode])

  return (
    <GestorLayout>
      <div style={{ marginBottom: 20 }}>
        <h1 style={{ fontSize: 22, fontWeight: 800, margin: 0, color: '#0f172a', display: 'flex', alignItems: 'center', gap: 8 }}>
          <Users size={22} color="#2563eb" /> Controle de Presença
        </h1>
        <p style={{ color: '#64748b', fontSize: 13, margin: '4px 0 0' }}>Acompanhe presenças, faltas e taxas de frequência</p>
      </div>

      {/* Taxas */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12, marginBottom: 20 }}>
        {[
          { label: 'Taxa Hoje', value: taxaDia, cor: taxaDia >= 80 ? '#16a34a' : taxaDia >= 50 ? '#b45309' : '#dc2626' },
          { label: 'Taxa Semana', value: taxaSemana, cor: taxaSemana >= 80 ? '#16a34a' : taxaSemana >= 50 ? '#b45309' : '#dc2626' },
          { label: 'Taxa Mês', value: taxaMes, cor: taxaMes >= 80 ? '#16a34a' : taxaMes >= 50 ? '#b45309' : '#dc2626' },
        ].map(t => (
          <div key={t.label} style={{ background: '#fff', borderRadius: 12, border: '1px solid #e2e8f0', padding: '14px 18px', textAlign: 'center' }}>
            <div style={{ fontSize: 28, fontWeight: 800, color: t.cor }}>{t.value}%</div>
            <div style={{ fontSize: 11, color: '#64748b', fontWeight: 600 }}>{t.label}</div>
            <div style={{ height: 4, background: '#e2e8f0', borderRadius: 2, overflow: 'hidden', marginTop: 8 }}>
              <div style={{ height: '100%', width: `${t.value}%`, background: t.cor, borderRadius: 2, transition: 'width 0.5s' }} />
            </div>
          </div>
        ))}
      </div>

      {/* Controles */}
      <div style={{ background: '#fff', borderRadius: 12, border: '1px solid #e2e8f0', padding: '12px 16px', marginBottom: 16, display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
        {/* Modo visualização */}
        <div style={{ display: 'flex', border: '1px solid #e2e8f0', borderRadius: 8, overflow: 'hidden' }}>
          {(['dia', 'semana', 'mes'] as const).map(m => (
            <button key={m} onClick={() => setViewMode(m)} style={{
              padding: '6px 14px', border: 'none', fontWeight: 600, fontSize: 12, cursor: 'pointer',
              background: viewMode === m ? '#2563eb' : '#fff', color: viewMode === m ? '#fff' : '#64748b',
            }}>
              {m === 'dia' ? '📅 Dia' : m === 'semana' ? '📆 Semana' : '🗓️ Mês'}
            </button>
          ))}
        </div>

        <input
          type="date" value={data} onChange={e => setData(e.target.value)}
          style={{ border: '1px solid #e2e8f0', borderRadius: 8, padding: '6px 10px', fontSize: 13, color: '#1e293b' }}
        />

        {/* Busca */}
        <div style={{ position: 'relative', flex: 1, minWidth: 180 }}>
          <Search size={13} style={{ position: 'absolute', left: 9, top: '50%', transform: 'translateY(-50%)', color: '#94a3b8' }} />
          <input
            placeholder="Buscar por nome, chapa…"
            value={busca} onChange={e => setBusca(e.target.value)}
            style={{ width: '100%', border: '1px solid #e2e8f0', borderRadius: 8, padding: '6px 10px 6px 30px', fontSize: 13, boxSizing: 'border-box', color: '#1e293b' }}
          />
        </div>

        {/* Filtro obra */}
        <select value={obraFiltro} onChange={e => setObraFiltro(e.target.value)}
          style={{ border: '1px solid #e2e8f0', borderRadius: 8, padding: '6px 10px', fontSize: 13, color: '#1e293b', background: '#fff' }}>
          <option value="todas">🏗️ Todas as obras</option>
          {obras.map(o => <option key={o.id} value={o.id}>{o.nome}</option>)}
        </select>

        {/* Filtro status */}
        <select value={statusFiltro} onChange={e => setStatusFiltro(e.target.value)}
          style={{ border: '1px solid #e2e8f0', borderRadius: 8, padding: '6px 10px', fontSize: 13, color: '#1e293b', background: '#fff' }}>
          <option value="todos">Todos os status</option>
          {Object.entries(STATUS_CONFIG).map(([k, v]) => <option key={k} value={k}>{v.emoji} {v.label}</option>)}
        </select>
      </div>

      {/* Resumo do dia */}
      {resumo && (
        <div style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap' }}>
          {[
            { key: 'presentes', emoji: '✅', label: 'Presentes', val: resumo.presentes, cor: '#16a34a', bg: '#dcfce7' },
            { key: 'faltas', emoji: '❌', label: 'Faltas', val: resumo.faltas, cor: '#dc2626', bg: '#fee2e2' },
            { key: 'meio_periodo', emoji: '🌗', label: 'Meio Per.', val: resumo.meio_periodo, cor: '#b45309', bg: '#fef3c7' },
            { key: 'producao', emoji: '⚙️', label: 'Produção', val: resumo.producao, cor: '#7c3aed', bg: '#f3e8ff' },
            { key: 'falta_justificada', emoji: '📋', label: 'F. Justif.', val: resumo.falta_justificada, cor: '#6b7280', bg: '#f3f4f6' },
            { key: 'sem_lancamento', emoji: '—', label: 'Sem lanç.', val: resumo.sem_lancamento, cor: '#94a3b8', bg: '#f8fafc' },
          ].map(s => (
            <button key={s.key} onClick={() => setStatusFiltro(statusFiltro === s.key ? 'todos' : s.key)}
              style={{
                display: 'flex', alignItems: 'center', gap: 6,
                padding: '6px 12px', borderRadius: 8, border: `1px solid ${statusFiltro === s.key ? s.cor : '#e2e8f0'}`,
                background: statusFiltro === s.key ? s.bg : '#fff', cursor: 'pointer', transition: 'all 150ms',
              }}>
              <span style={{ fontSize: 13 }}>{s.emoji}</span>
              <span style={{ fontSize: 12, fontWeight: 700, color: s.cor }}>{s.val}</span>
              <span style={{ fontSize: 11, color: '#64748b' }}>{s.label}</span>
            </button>
          ))}
        </div>
      )}

      {/* Tabela */}
      {loading ? (
        <div style={{ display: 'flex', justifyContent: 'center', padding: 40 }}>
          <Loader2 size={24} color="#2563eb" style={{ animation: 'spin 1s linear infinite' }} />
        </div>
      ) : (
        <div style={{ background: '#fff', borderRadius: 12, border: '1px solid #e2e8f0', overflow: 'hidden' }}>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
              <thead>
                <tr style={{ background: '#f8fafc', borderBottom: '1px solid #e2e8f0' }}>
                  <th style={{ padding: '10px 12px', textAlign: 'left', fontWeight: 700, color: '#374151', whiteSpace: 'nowrap' }}>Colaborador</th>
                  <th style={{ padding: '10px 12px', textAlign: 'left', fontWeight: 700, color: '#374151' }}>Função</th>
                  <th style={{ padding: '10px 12px', textAlign: 'left', fontWeight: 700, color: '#374151' }}>Obra</th>
                  {viewMode === 'dia' ? (
                    <>
                      <th style={{ padding: '10px 12px', textAlign: 'center', fontWeight: 700, color: '#374151' }}>Status</th>
                      <th style={{ padding: '10px 12px', textAlign: 'center', fontWeight: 700, color: '#374151' }}>Horas</th>
                    </>
                  ) : diasRange.map(d => (
                    <th key={d} style={{ padding: '8px 6px', textAlign: 'center', fontWeight: 700, color: '#374151', minWidth: 52, fontSize: 10 }}>
                      {new Date(d + 'T12:00').toLocaleDateString('pt-BR', { weekday: 'short', day: '2-digit' })}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {colabsFiltrados.length === 0 ? (
                  <tr><td colSpan={5 + diasRange.length} style={{ textAlign: 'center', padding: 32, color: '#94a3b8' }}>Nenhum colaborador encontrado</td></tr>
                ) : colabsFiltrados.map((c, i) => {
                  const statusHoje = pontosMap.get(c.id)?.get(data)?.status ?? 'sem_lancamento'
                  const sc = STATUS_CONFIG[statusHoje] ?? STATUS_CONFIG['sem_lancamento']
                  return (
                    <tr key={c.id} style={{ borderBottom: '1px solid #f1f5f9', background: i % 2 === 0 ? '#fff' : '#fafafa' }}>
                      <td style={{ padding: '8px 12px' }}>
                        <div style={{ fontWeight: 600, color: '#1e293b' }}>{c.nome}</div>
                        <div style={{ fontSize: 10, color: '#94a3b8' }}>{c.chapa} · {c.tipo_contrato === 'clt' ? 'CLT' : 'Autôn.'}</div>
                      </td>
                      <td style={{ padding: '8px 12px', color: '#374151' }}>{c.funcao}</td>
                      <td style={{ padding: '8px 12px', color: '#374151' }}>{c.obra}</td>
                      {viewMode === 'dia' ? (
                        <>
                          <td style={{ padding: '8px 12px', textAlign: 'center' }}>
                            <span style={{ display: 'inline-block', padding: '2px 8px', borderRadius: 6, background: sc.bg, color: sc.cor, fontWeight: 700, fontSize: 11 }}>
                              {sc.emoji} {sc.label}
                            </span>
                          </td>
                          <td style={{ padding: '8px 12px', textAlign: 'center', color: '#64748b' }}>
                            {pontosMap.get(c.id)?.get(data)?.horas_trabalhadas ?? '—'}h
                          </td>
                        </>
                      ) : diasRange.map(d => {
                        const p = pontosMap.get(c.id)?.get(d)
                        const s = p?.status ?? 'sem_lancamento'
                        const sc2 = STATUS_CONFIG[s]
                        return (
                          <td key={d} style={{ padding: '6px 4px', textAlign: 'center' }} title={`${c.nome} — ${d}: ${sc2?.label ?? '—'}`}>
                            <span style={{ fontSize: 14 }}>{sc2?.emoji ?? '—'}</span>
                          </td>
                        )
                      })}
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
          <div style={{ padding: '10px 16px', borderTop: '1px solid #e2e8f0', fontSize: 11, color: '#64748b' }}>
            {colabsFiltrados.length} de {colabs.length} colaboradores
          </div>
        </div>
      )}
    </GestorLayout>
  )
}
