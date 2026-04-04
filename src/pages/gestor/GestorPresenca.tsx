import React, { useEffect, useState, useCallback, useMemo } from 'react'
import { supabase } from '@/lib/supabase'
import GestorLayout from './GestorLayout'
import { Users, Search, Loader2 } from 'lucide-react'

type StatusPonto = 'presente' | 'falta' | 'meio_periodo' | 'falta_justificada' | 'producao'

interface ColabRow {
  id: string; nome: string; chapa: string; funcao: string
  obra: string; obra_id: string; tipo_contrato: string
}
interface PontoRow {
  colaborador_id: string; data: string; status: StatusPonto
  horas_extra?: number; observacoes?: string; obra_id: string
}

const STATUS_CFG: Record<string, { label: string; cor: string; bg: string; emoji: string }> = {
  presente:          { label: 'Presente',      cor: '#15803d', bg: '#dcfce7', emoji: '✅' },
  falta:             { label: 'Falta',          cor: '#dc2626', bg: '#fee2e2', emoji: '❌' },
  meio_periodo:      { label: 'Meio Período',   cor: '#b45309', bg: '#fef3c7', emoji: '🌗' },
  falta_justificada: { label: 'Falta Justif.',  cor: '#6b7280', bg: '#f3f4f6', emoji: '📋' },
  producao:          { label: 'Produção',       cor: '#7c3aed', bg: '#f3e8ff', emoji: '⚙️'  },
  sem_lancamento:    { label: 'Sem lançamento', cor: '#94a3b8', bg: '#f8fafc', emoji: '—'   },
}

const TAXA_COR = (t: number) => t >= 80 ? '#16a34a' : t >= 50 ? '#b45309' : '#dc2626'

export default function GestorPresenca() {
  const hoje = new Date().toISOString().slice(0, 10)

  const [loading,      setLoading]      = useState(true)
  const [data,         setData]         = useState(hoje)
  const [viewMode,     setViewMode]     = useState<'dia'|'semana'|'mes'>('dia')
  const [colabs,       setColabs]       = useState<ColabRow[]>([])
  const [pontos,       setPontos]       = useState<PontoRow[]>([])
  const [obras,        setObras]        = useState<{id:string;nome:string}[]>([])
  const [obraFiltro,   setObraFiltro]   = useState('todas')
  const [busca,        setBusca]        = useState('')
  const [statusFiltro, setStatusFiltro] = useState('todos')

  // ── Range de datas do período selecionado ──────────────────────────────────
  const { dataInicio, dataFim } = useMemo(() => {
    if (viewMode === 'semana') {
      const d   = new Date(data + 'T12:00')
      const dom = new Date(d); dom.setDate(d.getDate() - d.getDay())
      const sab = new Date(dom); sab.setDate(dom.getDate() + 5)
      return { dataInicio: dom.toISOString().slice(0,10), dataFim: sab.toISOString().slice(0,10) }
    }
    if (viewMode === 'mes') {
      const ini = data.slice(0,8) + '01'
      const lastDay = new Date(+data.slice(0,4), +data.slice(5,7), 0).getDate()
      return { dataInicio: ini, dataFim: data.slice(0,8) + String(lastDay).padStart(2,'0') }
    }
    return { dataInicio: data, dataFim: data }
  }, [data, viewMode])

  // ── Fetch colaboradores (1x) + pontos do período ───────────────────────────
  const fetchColabs = useCallback(async () => {
    const [{ data: cs }, { data: os }] = await Promise.all([
      supabase.from('colaboradores')
        .select('id,nome,chapa,tipo_contrato,obra_id,funcoes(nome),obras(nome,id)')
        .eq('status','ativo'),
      supabase.from('obras').select('id,nome').neq('status','concluida').order('nome'),
    ])
    setColabs((cs??[]).map((c:any) => ({
      id: c.id, nome: c.nome, chapa: c.chapa??'',
      tipo_contrato: c.tipo_contrato??'clt',
      funcao: c.funcoes?.nome??'—',
      obra:   c.obras?.nome??'—',
      obra_id: c.obra_id??'',
    })))
    setObras(os??[])
  }, [])

  const fetchPontos = useCallback(async () => {
    setLoading(true)
    // Busca TODOS os pontos do período sem limite (padrão Supabase = 1000 rows)
    // Para garantir todos os registros, forçamos limit alto
    const { data: ps } = await supabase.from('portal_ponto_diario')
      .select('colaborador_id,data,status,horas_extra,observacoes,obra_id')
      .gte('data', dataInicio)
      .lte('data', dataFim)
      .order('data', { ascending: true })
      .limit(5000)
    setPontos(ps??[])
    setLoading(false)
  }, [dataInicio, dataFim])

  useEffect(() => { fetchColabs() }, [fetchColabs])
  useEffect(() => { if (colabs.length > 0) fetchPontos() }, [fetchPontos, colabs.length])

  // ── Mapas ──────────────────────────────────────────────────────────────────
  const pontosMap = useMemo(() => {
    // colabId → data → PontoRow
    const m = new Map<string, Map<string, PontoRow>>()
    pontos.forEach(p => {
      if (!m.has(p.colaborador_id)) m.set(p.colaborador_id, new Map())
      m.get(p.colaborador_id)!.set(p.data, p)
    })
    return m
  }, [pontos])

  // ── Dias do range (apenas úteis no modo semana/mês) ────────────────────────
  const diasRange = useMemo(() => {
    if (viewMode === 'dia') return [data]
    const dias: string[] = []
    const cur  = new Date(dataInicio + 'T12:00')
    const endD = new Date(dataFim   + 'T12:00')
    while (cur <= endD) {
      if (cur.getDay() !== 0 && cur.getDay() !== 6) dias.push(cur.toISOString().slice(0,10))
      cur.setDate(cur.getDate()+1)
    }
    return dias
  }, [viewMode, data, dataInicio, dataFim])

  // ── Taxas relativas ao PERÍODO SELECIONADO (não ao dia de hoje fixo) ────────
  const taxas = useMemo(() => {
    if (colabs.length === 0) return { periodo: 0, semana: 0, mes: 0 }
    const total  = colabs.length
    const dias   = diasRange.length || 1

    // Taxa do período selecionado
    const presP  = pontos.filter(p => ['presente','meio_periodo','producao'].includes(p.status)).length
    const txPer  = Math.round((presP / (total * dias)) * 100)

    // Taxa semana corrente (sempre semana atual para referência)
    const semIni = (() => { const d = new Date(); d.setDate(d.getDate()-d.getDay()); return d.toISOString().slice(0,10) })()
    const presSem = pontos.filter(p => p.data >= semIni && p.data <= hoje && ['presente','meio_periodo','producao'].includes(p.status)).length
    const diasSem = pontos.filter(p => p.data >= semIni && p.data <= hoje).map(p=>p.data)
    const uniSem  = [...new Set(diasSem)].length || 1
    const txSem   = Math.round((presSem / (total * uniSem)) * 100)

    // Taxa mês do período
    const presMes = pontos.filter(p => ['presente','meio_periodo','producao'].includes(p.status)).length
    const diasMes = [...new Set(pontos.map(p=>p.data))].length || 1
    const txMes   = Math.round((presMes / (total * diasMes)) * 100)

    return { periodo: txPer, semana: txSem, mes: txMes }
  }, [colabs, pontos, diasRange, hoje])

  // ── Resumo do dia/período ─────────────────────────────────────────────────
  const resumo = useMemo(() => {
    const s = { presentes:0, faltas:0, meio_periodo:0, falta_justificada:0, producao:0, sem_lancamento:0 }
    colabs.forEach(c => {
      // no modo dia usa o dia atual; no modo semana/mês conta pelo último dia do range
      const refData = viewMode==='dia' ? data : dataFim
      const st      = pontosMap.get(c.id)?.get(refData)?.status ?? 'sem_lancamento'
      if (st==='presente') s.presentes++
      else if (st==='falta') s.faltas++
      else if (st==='meio_periodo') s.meio_periodo++
      else if (st==='falta_justificada') s.falta_justificada++
      else if (st==='producao') s.producao++
      else s.sem_lancamento++
    })
    return s
  }, [colabs, pontosMap, data, viewMode, dataFim])

  // ── Filtro de colaboradores ────────────────────────────────────────────────
  const colabsFiltrados = useMemo(() => {
    let arr = colabs
    if (obraFiltro !== 'todas') arr = arr.filter(c => c.obra_id === obraFiltro)
    if (busca.trim()) {
      const q = busca.toLowerCase()
      arr = arr.filter(c => c.nome.toLowerCase().includes(q) || c.chapa.toLowerCase().includes(q) || c.funcao.toLowerCase().includes(q))
    }
    if (statusFiltro !== 'todos') {
      arr = arr.filter(c => {
        const refData = viewMode==='dia' ? data : dataFim
        const st = pontosMap.get(c.id)?.get(refData)?.status ?? 'sem_lancamento'
        return st === statusFiltro
      })
    }
    return arr
  }, [colabs, obraFiltro, busca, statusFiltro, pontosMap, data, viewMode, dataFim])

  const periodoLabel = viewMode==='dia'
    ? new Date(data+'T12:00').toLocaleDateString('pt-BR',{weekday:'short',day:'2-digit',month:'short',year:'numeric'})
    : `${new Date(dataInicio+'T12:00').toLocaleDateString('pt-BR',{day:'2-digit',month:'short'})} → ${new Date(dataFim+'T12:00').toLocaleDateString('pt-BR',{day:'2-digit',month:'short',year:'numeric'})}`

  return (
    <GestorLayout>
      <style>{`@keyframes spin{from{transform:rotate(0deg)}to{transform:rotate(360deg)}}`}</style>

      <div style={{ marginBottom:18 }}>
        <h1 style={{ fontSize:20, fontWeight:800, margin:0, color:'#0f172a', display:'flex', alignItems:'center', gap:8 }}>
          <Users size={20} color="#2563eb"/> Controle de Presença
        </h1>
        <p style={{ color:'#64748b', fontSize:12, margin:'4px 0 0' }}>Acompanhe presenças, faltas e taxas de frequência</p>
      </div>

      {/* ── Taxas do período ───────────────────────────────────────────── */}
      <div style={{ display:'grid', gridTemplateColumns:'repeat(3,1fr)', gap:12, marginBottom:20 }}>
        {[
          { label: viewMode==='dia' ? 'Taxa Hoje' : `Taxa (${diasRange.length}d)`, value: taxas.periodo },
          { label: 'Taxa Semana Atual',                                              value: taxas.semana  },
          { label: `Taxa ${viewMode==='mes'?'Mês Sel.':'Mês Atual'}`,               value: taxas.mes     },
        ].map(t => (
          <div key={t.label} style={{ background:'#fff', borderRadius:12, border:'1px solid #e2e8f0', padding:'12px 14px', textAlign:'center' }}>
            <div style={{ fontSize:26, fontWeight:800, color:TAXA_COR(t.value) }}>{t.value}%</div>
            <div style={{ fontSize:10, color:'#64748b', fontWeight:600, marginTop:2 }}>{t.label}</div>
            <div style={{ height:4, background:'#e2e8f0', borderRadius:2, overflow:'hidden', marginTop:6 }}>
              <div style={{ height:'100%', width:`${t.value}%`, background:TAXA_COR(t.value), borderRadius:2, transition:'width 0.5s' }}/>
            </div>
          </div>
        ))}
      </div>

      {/* ── Controles ─────────────────────────────────────────────────── */}
      <div style={{ background:'#fff', borderRadius:12, border:'1px solid #e2e8f0', padding:'12px 14px', marginBottom:14, display:'flex', gap:8, flexWrap:'wrap', alignItems:'center' }}>
        {/* Modo */}
        <div style={{ display:'flex', border:'1px solid #e2e8f0', borderRadius:8, overflow:'hidden' }}>
          {(['dia','semana','mes'] as const).map(m => (
            <button key={m} onClick={() => setViewMode(m)} style={{
              padding:'6px 12px', border:'none', fontWeight:600, fontSize:12, cursor:'pointer',
              background: viewMode===m ? '#2563eb' : '#fff', color: viewMode===m ? '#fff' : '#64748b',
            }}>
              {m==='dia'?'📅 Dia':m==='semana'?'📆 Semana':'🗓️ Mês'}
            </button>
          ))}
        </div>

        <input type="date" value={data} onChange={e => setData(e.target.value)}
          style={{ border:'1px solid #e2e8f0', borderRadius:8, padding:'6px 10px', fontSize:13, color:'#1e293b' }}/>

        {/* Período */}
        <span style={{ fontSize:11, color:'#64748b', background:'#f0f9ff', border:'1px solid #bae6fd', borderRadius:6, padding:'4px 10px', whiteSpace:'nowrap' }}>
          📅 {periodoLabel}
        </span>

        {/* Busca */}
        <div style={{ position:'relative', flex:1, minWidth:160 }}>
          <Search size={12} style={{ position:'absolute', left:9, top:'50%', transform:'translateY(-50%)', color:'#94a3b8' }}/>
          <input placeholder="Buscar nome, chapa…" value={busca} onChange={e=>setBusca(e.target.value)}
            style={{ width:'100%', border:'1px solid #e2e8f0', borderRadius:8, padding:'6px 10px 6px 28px', fontSize:13, boxSizing:'border-box', color:'#1e293b' }}/>
        </div>

        {/* Obra */}
        <select value={obraFiltro} onChange={e=>setObraFiltro(e.target.value)}
          style={{ border:'1px solid #e2e8f0', borderRadius:8, padding:'6px 8px', fontSize:12, color:'#1e293b', background:'#fff' }}>
          <option value="todas">🏗️ Todas as obras</option>
          {obras.map(o => <option key={o.id} value={o.id}>{o.nome}</option>)}
        </select>

        {/* Status */}
        <select value={statusFiltro} onChange={e=>setStatusFiltro(e.target.value)}
          style={{ border:'1px solid #e2e8f0', borderRadius:8, padding:'6px 8px', fontSize:12, color:'#1e293b', background:'#fff' }}>
          <option value="todos">Todos os status</option>
          {Object.entries(STATUS_CFG).map(([k,v]) => <option key={k} value={k}>{v.emoji} {v.label}</option>)}
        </select>
      </div>

      {/* ── Resumo por status (chips clicáveis) ───────────────────────── */}
      <div style={{ display:'flex', gap:8, marginBottom:14, flexWrap:'wrap' }}>
        {[
          { key:'presentes',          emoji:'✅', label:'Presentes',   val:resumo.presentes,          cor:'#16a34a', bg:'#dcfce7' },
          { key:'falta',              emoji:'❌', label:'Faltas',       val:resumo.faltas,             cor:'#dc2626', bg:'#fee2e2' },
          { key:'meio_periodo',       emoji:'🌗', label:'Meio Per.',    val:resumo.meio_periodo,       cor:'#b45309', bg:'#fef3c7' },
          { key:'producao',           emoji:'⚙️', label:'Produção',    val:resumo.producao,           cor:'#7c3aed', bg:'#f3e8ff' },
          { key:'falta_justificada',  emoji:'📋', label:'F. Justif.',  val:resumo.falta_justificada,  cor:'#6b7280', bg:'#f3f4f6' },
          { key:'sem_lancamento',     emoji:'—',  label:'Sem lanç.',   val:resumo.sem_lancamento,     cor:'#94a3b8', bg:'#f8fafc' },
        ].map(s => (
          <button key={s.key}
            onClick={() => setStatusFiltro(statusFiltro === (s.key==='presentes'?'presente':s.key) ? 'todos' : (s.key==='presentes'?'presente':s.key))}
            style={{
              display:'flex', alignItems:'center', gap:5, padding:'5px 11px', borderRadius:8,
              border:`1px solid ${statusFiltro===(s.key==='presentes'?'presente':s.key) ? s.cor : '#e2e8f0'}`,
              background: statusFiltro===(s.key==='presentes'?'presente':s.key) ? s.bg : '#fff',
              cursor:'pointer', transition:'all 120ms',
            }}>
            <span style={{ fontSize:12 }}>{s.emoji}</span>
            <span style={{ fontSize:12, fontWeight:700, color:s.cor }}>{s.val}</span>
            <span style={{ fontSize:11, color:'#64748b' }}>{s.label}</span>
          </button>
        ))}
      </div>

      {/* ── Tabela ────────────────────────────────────────────────────── */}
      {loading ? (
        <div style={{ display:'flex', justifyContent:'center', padding:40 }}>
          <Loader2 size={24} color="#2563eb" style={{ animation:'spin 1s linear infinite' }}/>
        </div>
      ) : (
        <div style={{ background:'#fff', borderRadius:12, border:'1px solid #e2e8f0', overflow:'hidden' }}>
          <div style={{ overflowX:'auto' }}>
            <table style={{ width:'100%', borderCollapse:'collapse', fontSize:12 }}>
              <thead>
                <tr style={{ background:'#f8fafc', borderBottom:'1px solid #e2e8f0' }}>
                  <th style={{ padding:'10px 12px', textAlign:'left', fontWeight:700, color:'#374151', whiteSpace:'nowrap', position:'sticky', left:0, background:'#f8fafc', zIndex:1 }}>Colaborador</th>
                  <th style={{ padding:'10px 12px', textAlign:'left', fontWeight:700, color:'#374151' }}>Função</th>
                  <th style={{ padding:'10px 12px', textAlign:'left', fontWeight:700, color:'#374151', whiteSpace:'nowrap' }}>Obra</th>
                  {viewMode === 'dia' ? (
                    <>
                      <th style={{ padding:'10px 12px', textAlign:'center', fontWeight:700, color:'#374151' }}>Status</th>
                      <th style={{ padding:'10px 12px', textAlign:'center', fontWeight:700, color:'#374151' }}>H.Extra</th>
                    </>
                  ) : diasRange.map(d => (
                    <th key={d} style={{ padding:'8px 4px', textAlign:'center', fontWeight:700, color:'#374151', minWidth:44, fontSize:10 }}>
                      {new Date(d+'T12:00').toLocaleDateString('pt-BR',{weekday:'short',day:'2-digit'})}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {colabsFiltrados.length === 0 ? (
                  <tr><td colSpan={5+diasRange.length} style={{ textAlign:'center', padding:32, color:'#94a3b8' }}>
                    Nenhum colaborador encontrado
                  </td></tr>
                ) : colabsFiltrados.map((c,i) => {
                  const statusRef = pontosMap.get(c.id)?.get(viewMode==='dia'?data:dataFim)?.status ?? 'sem_lancamento'
                  const sc        = STATUS_CFG[statusRef] ?? STATUS_CFG['sem_lancamento']
                  return (
                    <tr key={c.id} style={{ borderBottom:'1px solid #f1f5f9', background:i%2===0?'#fff':'#fafafa' }}>
                      <td style={{ padding:'8px 12px', position:'sticky', left:0, background:i%2===0?'#fff':'#fafafa', zIndex:1 }}>
                        <div style={{ fontWeight:600, color:'#1e293b', whiteSpace:'nowrap' }}>{c.nome}</div>
                        <div style={{ fontSize:10, color:'#94a3b8' }}>{c.chapa} · {c.tipo_contrato==='clt'?'CLT':'Autôn.'}</div>
                      </td>
                      <td style={{ padding:'8px 12px', color:'#374151', whiteSpace:'nowrap' }}>{c.funcao}</td>
                      <td style={{ padding:'8px 12px', color:'#374151', whiteSpace:'nowrap', maxWidth:130, overflow:'hidden', textOverflow:'ellipsis' }}>{c.obra}</td>
                      {viewMode === 'dia' ? (
                        <>
                          <td style={{ padding:'8px 12px', textAlign:'center' }}>
                            <span style={{ display:'inline-block', padding:'2px 8px', borderRadius:6, background:sc.bg, color:sc.cor, fontWeight:700, fontSize:11, whiteSpace:'nowrap' }}>
                              {sc.emoji} {sc.label}
                            </span>
                          </td>
                          <td style={{ padding:'8px 12px', textAlign:'center', color:'#64748b' }}>
                            {pontosMap.get(c.id)?.get(data)?.horas_extra ?? '—'}
                          </td>
                        </>
                      ) : diasRange.map(d => {
                        const p   = pontosMap.get(c.id)?.get(d)
                        const sc2 = STATUS_CFG[p?.status ?? 'sem_lancamento']
                        return (
                          <td key={d} style={{ padding:'6px 3px', textAlign:'center' }}
                            title={`${c.nome} — ${new Date(d+'T12:00').toLocaleDateString('pt-BR')}: ${sc2?.label??'—'}`}>
                            <span style={{ fontSize:13 }}>{sc2?.emoji??'—'}</span>
                          </td>
                        )
                      })}
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
          <div style={{ padding:'8px 14px', borderTop:'1px solid #e2e8f0', fontSize:11, color:'#64748b', display:'flex', justifyContent:'space-between' }}>
            <span>{colabsFiltrados.length} de {colabs.length} colaboradores · {pontos.length} lançamentos carregados</span>
            <span>{periodoLabel}</span>
          </div>
        </div>
      )}
    </GestorLayout>
  )
}
