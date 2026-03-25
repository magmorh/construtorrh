import React, { useEffect, useState, useCallback, useMemo } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { supabase } from '@/lib/supabase'
import { getPortalSession } from '@/hooks/usePortalAuth'
import PortalLayout from './PortalLayout'
import { ChevronLeft, ChevronRight, Check, X, Clock, Minus, Plus, Save, Loader2, FileText, UserPlus, BarChart2 } from 'lucide-react'

// ── Tipos ────────────────────────────────────────────────────────────────────
type StatusPonto = 'presente' | 'falta' | 'meio_periodo' | 'falta_justificada' | 'producao'

interface ColabRow { id: string; nome: string; chapa?: string; funcao?: string; data_admissao?: string | null; obra_id?: string }
interface PontoRow {
  id?: string; colaborador_id: string; data: string; status: StatusPonto
  horas_trabalhadas?: number; horas_extra?: number; horas_falta?: number; observacoes?: string
  obra_id?: string
}

const STATUS_CONFIG: Record<StatusPonto, { label: string; cor: string; bg: string; icon: React.ReactNode }> = {
  presente:          { label: 'Presente',     cor: '#15803d', bg: '#dcfce7', icon: <Check size={14}/> },
  falta:             { label: 'Falta',         cor: '#dc2626', bg: '#fee2e2', icon: <X size={14}/> },
  meio_periodo:      { label: 'Meio Período',  cor: '#b45309', bg: '#fef3c7', icon: <Minus size={14}/> },
  falta_justificada: { label: 'Falta Justif.', cor: '#6b7280', bg: '#f3f4f6', icon: <Clock size={14}/> },
  producao:          { label: 'Produção',      cor: '#7c3aed', bg: '#f3e8ff', icon: <BarChart2 size={14}/> },
}

// ── Componente principal ──────────────────────────────────────────────────────
export default function PortalPonto() {
  const nav    = useNavigate()
  const [params] = useSearchParams()
  const session  = getPortalSession()

  const obras = session?.obras_ids ?? []
  const [obraId,    setObraId]    = useState(params.get('obra') ?? obras[0] ?? '')
  const [obrasData, setObrasData] = useState<{id:string;nome:string}[]>([])
  const [dataSel,   setDataSel]   = useState(new Date().toISOString().slice(0, 10))
  const [colaboradores, setColaboradores] = useState<ColabRow[]>([])
  const [pontos,    setPontos]    = useState<Record<string, PontoRow>>({})
  const [saving,    setSaving]    = useState<Set<string>>(new Set())
  const [loading,   setLoading]   = useState(false)
  const [editandoId, setEditandoId] = useState<string | null>(null)
  const [subAba,    setSubAba]    = useState<'ponto'|'relatorio'|'avulso'>('ponto')

  // ── Relatório ──────────────────────────────────────────────────────────────
  const [relColabId, setRelColabId] = useState('')
  const [relDtIni,   setRelDtIni]   = useState(() => {
    const d = new Date(); d.setDate(1); return d.toISOString().slice(0,10)
  })
  const [relDtFim,   setRelDtFim]   = useState(new Date().toISOString().slice(0,10))
  const [relRows,    setRelRows]    = useState<any[]>([])
  const [relLoading, setRelLoading] = useState(false)

  // ── Avulso ─────────────────────────────────────────────────────────────────
  const [avulsoColabId,  setAvulsoColabId]  = useState('')
  const [avulsoColabs,   setAvulsoColabs]   = useState<ColabRow[]>([])
  const [avulsoObraId,   setAvulsoObraId]   = useState(obraId)
  const [avulsoStatus,   setAvulsoStatus]   = useState<StatusPonto>('presente')
  const [avulsoSaving,   setAvulsoSaving]   = useState(false)
  const [avulsoSucesso,  setAvulsoSucesso]  = useState(false)
  const [avulsoErro,     setAvulsoErro]     = useState('')

  // ── Conflito de obra ───────────────────────────────────────────────────────
  // Guarda: colabId → obra_id já lançada no dia (de OUTRA obra)
  const [conflitos, setConflitos] = useState<Record<string, string>>({})

  function proxDia(dir: 1 | -1) {
    const d = new Date(dataSel + 'T12:00:00')
    d.setDate(d.getDate() + dir)
    setDataSel(d.toISOString().slice(0, 10))
  }

  // ── Carregamentos ──────────────────────────────────────────────────────────
  const fetchObras = useCallback(async () => {
    if (!obras.length) return
    const { data } = await supabase.from('obras').select('id,nome').in('id', obras).order('nome')
    if (data) setObrasData(data)
  }, [obras.join(',')])

  const fetchColabs = useCallback(async () => {
    if (!obraId) return
    const { data } = await supabase
      .from('colaboradores').select('id,nome,chapa,data_admissao,obra_id,funcoes(nome)')
      .eq('obra_id', obraId).eq('status','ativo').order('nome')
    if (data) setColaboradores(data.map((c: any) => ({
      id: c.id, nome: c.nome, chapa: c.chapa, funcao: c.funcoes?.nome,
      data_admissao: c.data_admissao ?? null, obra_id: c.obra_id,
    })))
  }, [obraId])

  const fetchPontos = useCallback(async () => {
    if (!obraId || !dataSel) return
    setLoading(true)
    const { data } = await supabase.from('portal_ponto_diario')
      .select('*').eq('obra_id', obraId).eq('data', dataSel)
    setPontos(Object.fromEntries((data ?? []).map((r: any) => [r.colaborador_id, r])))
    setLoading(false)
  }, [obraId, dataSel])

  // Verifica se algum colaborador da lista já tem ponto em OUTRA obra no dia
  const checkConflitos = useCallback(async (colabIds: string[], data: string, obraAtual: string) => {
    if (!colabIds.length) return
    const { data: rows } = await supabase.from('portal_ponto_diario')
      .select('colaborador_id,obra_id').in('colaborador_id', colabIds).eq('data', data).neq('obra_id', obraAtual)
    const map: Record<string,string> = {}
    rows?.forEach((r: any) => { map[r.colaborador_id] = r.obra_id })
    setConflitos(map)
  }, [])

  const fetchAvulsos = useCallback(async () => {
    // Colaboradores sem obra alocada ou de todas as obras do gestor
    const { data } = await supabase
      .from('colaboradores').select('id,nome,chapa,obra_id,funcoes(nome)')
      .eq('status','ativo').order('nome')
    if (data) setAvulsoColabs(data.map((c: any) => ({
      id: c.id, nome: c.nome, chapa: c.chapa, funcao: c.funcoes?.nome, obra_id: c.obra_id,
    })))
  }, [])

  useEffect(() => { if (!session) { nav('/portal'); return } fetchObras() }, [])
  useEffect(() => { fetchColabs() }, [fetchColabs])
  useEffect(() => {
    fetchPontos().then(() => {
      if (colaboradores.length) {
        checkConflitos(colaboradores.map(c=>c.id), dataSel, obraId)
      }
    })
  }, [fetchPontos, dataSel, obraId])
  useEffect(() => { if (colaboradores.length) checkConflitos(colaboradores.map(c=>c.id), dataSel, obraId) }, [colaboradores, dataSel, obraId])
  useEffect(() => { if (subAba === 'avulso') fetchAvulsos() }, [subAba])

  // ── Salvar ponto normal ────────────────────────────────────────────────────
  async function salvarPonto(colabId: string, dados: Partial<PontoRow>) {
    // Verifica conflito de obra
    if (conflitos[colabId]) {
      const obraNome = obrasData.find(o=>o.id===conflitos[colabId])?.nome ?? 'outra obra'
      alert(`⚠️ Este colaborador já tem ponto lançado em "${obraNome}" neste dia.\nUm colaborador só pode ter ponto em uma obra por dia.`)
      return
    }
    setSaving(prev => new Set([...prev, colabId]))
    const atual = pontos[colabId]
    const payload = { obra_id: obraId, colaborador_id: colabId, data: dataSel, portal_usuario_id: session?.id, ...dados }
    let err: any
    if (atual?.id) {
      ;({ error: err } = await supabase.from('portal_ponto_diario').update(payload).eq('id', atual.id))
    } else {
      ;({ error: err } = await supabase.from('portal_ponto_diario').insert(payload))
    }
    if (!err) await fetchPontos()
    setSaving(prev => { const s = new Set(prev); s.delete(colabId); return s })
    setEditandoId(null)
  }

  // ── Salvar ponto avulso ───────────────────────────────────────────────────
  async function salvarAvulso() {
    if (!avulsoColabId) { setAvulsoErro('⚠️ Selecione o colaborador.'); return }
    if (!avulsoObraId)  { setAvulsoErro('⚠️ Selecione a obra.'); return }
    setAvulsoSaving(true); setAvulsoErro('')
    // Verifica conflito
    const { data: conf } = await supabase.from('portal_ponto_diario')
      .select('obra_id').eq('colaborador_id', avulsoColabId).eq('data', dataSel).neq('obra_id', avulsoObraId)
    if (conf && conf.length > 0) {
      const obraNome = obrasData.find(o=>o.id===conf[0].obra_id)?.nome ?? 'outra obra'
      setAvulsoErro(`⚠️ Este colaborador já tem ponto em "${obraNome}" neste dia.`)
      setAvulsoSaving(false); return
    }
    // Verifica duplicata na mesma obra
    const { data: exist } = await supabase.from('portal_ponto_diario')
      .select('id').eq('colaborador_id', avulsoColabId).eq('data', dataSel).eq('obra_id', avulsoObraId)
    let err: any
    if (exist && exist.length > 0) {
      ;({ error: err } = await supabase.from('portal_ponto_diario').update({ status: avulsoStatus, portal_usuario_id: session?.id }).eq('id', exist[0].id))
    } else {
      ;({ error: err } = await supabase.from('portal_ponto_diario').insert({ obra_id: avulsoObraId, colaborador_id: avulsoColabId, data: dataSel, status: avulsoStatus, portal_usuario_id: session?.id }))
    }
    setAvulsoSaving(false)
    if (err) { setAvulsoErro('Erro: ' + err.message); return }
    setAvulsoSucesso(true); setAvulsoColabId('')
    setTimeout(() => setAvulsoSucesso(false), 2500)
  }

  // ── Relatório ──────────────────────────────────────────────────────────────
  async function gerarRelatorio() {
    if (!relColabId) return
    setRelLoading(true)
    const { data } = await supabase.from('portal_ponto_diario')
      .select('data,status,horas_extra,horas_falta,observacoes,obra_id')
      .eq('colaborador_id', relColabId)
      .gte('data', relDtIni).lte('data', relDtFim)
      .order('data')
    setRelRows(data ?? [])
    setRelLoading(false)
  }

  function imprimirRelatorio() {
    const colab = [...colaboradores, ...avulsoColabs].find(c=>c.id===relColabId)
    const statusLabel: Record<string,string> = { presente:'Presente', falta:'Falta', meio_periodo:'Meio Período', falta_justificada:'Falta Justif.', producao:'Produção' }
    const statusCor:   Record<string,string> = { presente:'#15803d', falta:'#dc2626', meio_periodo:'#b45309', falta_justificada:'#6b7280', producao:'#7c3aed' }
    const totais = { presente:0, falta:0, meio_periodo:0, falta_justificada:0, producao:0, horas_extra:0, horas_falta:0 }
    relRows.forEach(r => {
      if (r.status in totais) (totais as any)[r.status]++
      totais.horas_extra  += r.horas_extra  ?? 0
      totais.horas_falta  += r.horas_falta  ?? 0
    })
    const linhas = relRows.map(r => {
      const dt  = new Date(r.data+'T12:00:00').toLocaleDateString('pt-BR', { weekday:'short', day:'2-digit', month:'2-digit' })
      const cor = statusCor[r.status] ?? '#374151'
      const ob  = obrasData.find(o=>o.id===r.obra_id)?.nome ?? '—'
      return `<tr>
        <td style="padding:5px 8px;border-bottom:1px solid #e5e7eb;font-size:12px">${dt}</td>
        <td style="padding:5px 8px;border-bottom:1px solid #e5e7eb;font-size:12px;color:${cor};font-weight:700">${statusLabel[r.status]??r.status}</td>
        <td style="padding:5px 8px;border-bottom:1px solid #e5e7eb;font-size:12px;color:#1d4ed8">${r.horas_extra?'+'+r.horas_extra+'h':''}</td>
        <td style="padding:5px 8px;border-bottom:1px solid #e5e7eb;font-size:12px;color:#dc2626">${r.horas_falta?'-'+r.horas_falta+'h':''}</td>
        <td style="padding:5px 8px;border-bottom:1px solid #e5e7eb;font-size:11px;color:#6b7280">${ob}</td>
        <td style="padding:5px 8px;border-bottom:1px solid #e5e7eb;font-size:11px;color:#6b7280;font-style:italic">${r.observacoes??''}</td>
      </tr>`
    }).join('')
    const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Relatório de Ponto</title>
    <style>*{box-sizing:border-box;margin:0;padding:0}body{font-family:Arial,sans-serif;padding:28px;color:#111}
    h1{font-size:18px;color:#1e3a5f;margin-bottom:4px}.sub{font-size:12px;color:#6b7280;margin-bottom:18px}
    table{width:100%;border-collapse:collapse}.th{background:#1e3a5f;color:#fff;padding:7px 8px;font-size:11px;text-align:left}
    .totais{display:grid;grid-template-columns:repeat(4,1fr);gap:12px;margin:18px 0}
    .tot{background:#f9fafb;border:1px solid #e5e7eb;border-radius:8px;padding:10px;text-align:center}
    .tot .n{font-size:22px;font-weight:800}.tot .l{font-size:10px;color:#6b7280;text-transform:uppercase;margin-top:2px}
    @media print{body{padding:14px}}</style></head><body>
    <h1>📋 Relatório de Ponto — ${colab?.nome ?? '—'}</h1>
    <div class="sub">Período: ${new Date(relDtIni+'T12:00:00').toLocaleDateString('pt-BR')} a ${new Date(relDtFim+'T12:00:00').toLocaleDateString('pt-BR')} &nbsp;|&nbsp; Gerado em ${new Date().toLocaleString('pt-BR')}</div>
    <div class="totais">
      <div class="tot"><div class="n" style="color:#15803d">${totais.presente}</div><div class="l">Presenças</div></div>
      <div class="tot"><div class="n" style="color:#dc2626">${totais.falta}</div><div class="l">Faltas</div></div>
      <div class="tot"><div class="n" style="color:#7c3aed">${totais.producao}</div><div class="l">Produção</div></div>
      <div class="tot"><div class="n" style="color:#1d4ed8">+${totais.horas_extra}h</div><div class="l">H. Extra</div></div>
    </div>
    <table><thead><tr>
      <th class="th">Data</th><th class="th">Status</th><th class="th">H. Extra</th>
      <th class="th">H. Falta</th><th class="th">Obra</th><th class="th">Observação</th>
    </tr></thead><tbody>${linhas}</tbody></table>
    <script>window.onload=()=>{window.print()}<\/script></body></html>`
    const win = window.open('','_blank','width=900,height=650')
    if (win) { win.document.write(html); win.document.close() }
  }

  // ── Filtro por data_admissao ───────────────────────────────────────────────
  const colaboradoresVisiveis = colaboradores.filter(c =>
    !c.data_admissao || c.data_admissao <= dataSel
  )

  const totalPresentes  = colaboradoresVisiveis.filter(c => pontos[c.id]?.status === 'presente').length
  const totalFaltas     = colaboradoresVisiveis.filter(c => pontos[c.id]?.status === 'falta' || pontos[c.id]?.status === 'falta_justificada').length
  const totalProducao   = colaboradoresVisiveis.filter(c => pontos[c.id]?.status === 'producao').length
  const semLancamento   = colaboradoresVisiveis.filter(c => !pontos[c.id]).length

  const dateFmt = useMemo(() => {
    const [y, m, d] = dataSel.split('-').map(Number)
    return new Date(y, m-1, d).toLocaleDateString('pt-BR', { weekday:'long', day:'2-digit', month:'long' })
  }, [dataSel])

  const INP: React.CSSProperties = { width:'100%', height:42, border:'2px solid #e5e7eb', borderRadius:8, padding:'0 12px', fontSize:13, boxSizing:'border-box', background:'#fff' }
  const SEL: React.CSSProperties = { ...INP, cursor:'pointer' }

  return (
    <PortalLayout>
      {/* Sub-abas */}
      <div style={{ display:'flex', margin:'12px 16px 0', background:'#f3f4f6', borderRadius:10, padding:4 }}>
        {([
          { id:'ponto',     label:'📋 Lançar Ponto' },
          { id:'avulso',    label:'👤 Avulso' },
          { id:'relatorio', label:'📊 Relatório' },
        ] as const).map(a => (
          <button type="button" key={a.id} onClick={() => setSubAba(a.id)} style={{
            flex:1, height:34, border:'none', borderRadius:8, cursor:'pointer', fontWeight:700, fontSize:11,
            background: subAba===a.id ? '#fff' : 'transparent',
            color: subAba===a.id ? '#1e3a5f' : '#9ca3af',
            boxShadow: subAba===a.id ? '0 1px 4px rgba(0,0,0,0.1)' : 'none',
          }}>
            {a.label}
          </button>
        ))}
      </div>

      {/* ── ABA PONTO ── */}
      {subAba === 'ponto' && (<>
        {obrasData.length > 1 && (
          <div style={{ padding:'10px 16px 0' }}>
            <select value={obraId} onChange={e => setObraId(e.target.value)} style={SEL}>
              {obrasData.map(o => <option key={o.id} value={o.id}>{o.nome}</option>)}
            </select>
          </div>
        )}

        <div style={{ padding:'10px 16px 8px', display:'flex', alignItems:'center', justifyContent:'space-between' }}>
          <button onClick={() => proxDia(-1)} style={{ background:'#fff', border:'1px solid #e5e7eb', borderRadius:8, padding:'8px 12px', cursor:'pointer' }}>
            <ChevronLeft size={18}/>
          </button>
          <div style={{ textAlign:'center' }}>
            <div style={{ fontWeight:800, fontSize:15, color:'#1e3a5f', textTransform:'capitalize' }}>{dateFmt}</div>
            <input type="date" value={dataSel} onChange={e => setDataSel(e.target.value)}
              style={{ fontSize:11, color:'#9ca3af', border:'none', background:'transparent', textAlign:'center', cursor:'pointer' }}/>
          </div>
          <button onClick={() => proxDia(1)} style={{ background:'#fff', border:'1px solid #e5e7eb', borderRadius:8, padding:'8px 12px', cursor:'pointer' }}>
            <ChevronRight size={18}/>
          </button>
        </div>

        {/* Resumo */}
        <div style={{ padding:'0 16px 12px', display:'flex', gap:6 }}>
          {[
            { label:'Presentes', val:totalPresentes,  cor:'#15803d', bg:'#dcfce7' },
            { label:'Produção',  val:totalProducao,   cor:'#7c3aed', bg:'#f3e8ff' },
            { label:'Faltas',    val:totalFaltas,     cor:'#dc2626', bg:'#fee2e2' },
            { label:'Sem lançamento', val:semLancamento, cor:'#b45309', bg:'#fef3c7' },
          ].map(s => (
            <div key={s.label} style={{ flex:1, background:s.bg, borderRadius:10, padding:'6px 4px', textAlign:'center' }}>
              <div style={{ fontWeight:800, fontSize:16, color:s.cor }}>{s.val}</div>
              <div style={{ fontSize:9, color:s.cor, fontWeight:600, lineHeight:1.2 }}>{s.label}</div>
            </div>
          ))}
        </div>

        {/* Lista */}
        <div style={{ padding:'0 16px 16px' }}>
          {loading ? (
            <div style={{ textAlign:'center', padding:32, color:'#9ca3af' }}>
              <Loader2 size={24} className="animate-spin" style={{ margin:'0 auto 8px', display:'block' }}/>Carregando…
            </div>
          ) : colaboradoresVisiveis.length === 0 ? (
            <div style={{ background:'#fff', borderRadius:12, padding:24, textAlign:'center', color:'#9ca3af' }}>
              Nenhum colaborador ativo nesta obra para esta data
            </div>
          ) : colaboradoresVisiveis.map(c => {
            const p       = pontos[c.id]
            const isSaving = saving.has(c.id)
            const isEdit   = editandoId === c.id
            const cfg      = p ? STATUS_CONFIG[p.status] : null
            const conflito = conflitos[c.id]
            const obraConflito = conflito ? (obrasData.find(o=>o.id===conflito)?.nome ?? 'outra obra') : null

            return (
              <div key={c.id} style={{
                background:'#fff', borderRadius:14,
                border:`2px solid ${obraConflito ? '#fca5a5' : (cfg?.bg ?? '#e5e7eb')}`,
                marginBottom:10, overflow:'hidden', boxShadow:'0 1px 4px rgba(0,0,0,0.06)',
              }}>
                <div style={{ padding:'12px 14px', display:'flex', alignItems:'center', justifyContent:'space-between' }}>
                  <div>
                    <div style={{ fontWeight:700, fontSize:14, color:'#111' }}>{c.nome}</div>
                    <div style={{ fontSize:11, color:'#9ca3af' }}>
                      {c.chapa && <span style={{ marginRight:8 }}>{c.chapa}</span>}{c.funcao}
                    </div>
                    {obraConflito && (
                      <div style={{ fontSize:11, color:'#dc2626', fontWeight:700, marginTop:3 }}>
                        🔒 Já lançado em: {obraConflito}
                      </div>
                    )}
                  </div>
                  {cfg && !obraConflito ? (
                    <div style={{ display:'flex', alignItems:'center', gap:6 }}>
                      <span style={{ background:cfg.bg, color:cfg.cor, borderRadius:8, padding:'4px 10px', fontSize:11, fontWeight:700, display:'flex', alignItems:'center', gap:4 }}>
                        {cfg.icon} {cfg.label}
                      </span>
                      <button onClick={() => setEditandoId(isEdit ? null : c.id)}
                        style={{ background:'#f3f4f6', border:'none', borderRadius:6, padding:'4px 8px', cursor:'pointer', fontSize:11, color:'#374151' }}>
                        Editar
                      </button>
                    </div>
                  ) : !obraConflito ? (
                    <span style={{ fontSize:11, color:'#f59e0b', fontWeight:600, background:'#fef3c7', borderRadius:6, padding:'3px 8px' }}>Sem lançamento</span>
                  ) : null}
                </div>

                {(!p || isEdit) && !obraConflito && (
                  <div style={{ padding:'0 14px 12px', display:'flex', flexDirection:'column', gap:10 }}>
                    <div style={{ display:'grid', gridTemplateColumns:'repeat(5,1fr)', gap:5 }}>
                      {(Object.entries(STATUS_CONFIG) as [StatusPonto, typeof STATUS_CONFIG[StatusPonto]][]).map(([status, sc]) => (
                        <button key={status} onClick={() => salvarPonto(c.id, { status, horas_extra:0, horas_falta:0 })}
                          disabled={isSaving} style={{
                            background: p?.status===status ? sc.bg : '#f9fafb',
                            border:`2px solid ${p?.status===status ? sc.cor : '#e5e7eb'}`,
                            borderRadius:10, padding:'7px 2px', cursor:'pointer',
                            display:'flex', flexDirection:'column', alignItems:'center', gap:3,
                            opacity: isSaving ? 0.6 : 1,
                          }}>
                          <span style={{ color:sc.cor }}>{sc.icon}</span>
                          <span style={{ fontSize:8, fontWeight:700, color:sc.cor, textAlign:'center', lineHeight:1.2 }}>{sc.label}</span>
                        </button>
                      ))}
                    </div>
                    {p && (p.status==='presente' || p.status==='meio_periodo' || p.status==='producao') && (
                      <HorasAjuste
                        horasExtra={p.horas_extra ?? 0} horasFalta={p.horas_falta ?? 0}
                        observacoes={p.observacoes ?? ''}
                        onSave={(he,hf,obs) => salvarPonto(c.id, { status:p.status, horas_extra:he, horas_falta:hf, observacoes:obs })}
                        saving={isSaving}
                      />
                    )}
                  </div>
                )}

                {p && !isEdit && (p.horas_extra || p.horas_falta || p.observacoes) && (
                  <div style={{ padding:'0 14px 12px', display:'flex', gap:6, flexWrap:'wrap' }}>
                    {!!p.horas_extra && <span style={{ fontSize:11, background:'#dbeafe', color:'#1d4ed8', borderRadius:6, padding:'2px 8px', fontWeight:600 }}>+{p.horas_extra}h extra</span>}
                    {!!p.horas_falta && <span style={{ fontSize:11, background:'#fee2e2', color:'#dc2626', borderRadius:6, padding:'2px 8px', fontWeight:600 }}>-{p.horas_falta}h falta</span>}
                    {p.observacoes && <span style={{ fontSize:11, color:'#6b7280', fontStyle:'italic' }}>{p.observacoes}</span>}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      </>)}

      {/* ── ABA AVULSO ── */}
      {subAba === 'avulso' && (
        <div style={{ padding:'16px 16px 32px', display:'flex', flexDirection:'column', gap:14 }}>
          <div style={{ background:'#eff6ff', border:'1px solid #bfdbfe', borderRadius:10, padding:'10px 14px', fontSize:13, color:'#1d4ed8', fontWeight:600 }}>
            👤 Lance o ponto de qualquer colaborador em qualquer obra, independente do vínculo.
          </div>

          {avulsoSucesso && (
            <div style={{ background:'#dcfce7', border:'1px solid #86efac', borderRadius:10, padding:'10px 14px', color:'#15803d', fontWeight:700, fontSize:13 }}>
              ✓ Ponto lançado com sucesso!
            </div>
          )}
          {avulsoErro && (
            <div style={{ background:'#fee2e2', border:'1px solid #fca5a5', borderRadius:10, padding:'10px 14px', color:'#dc2626', fontWeight:700, fontSize:13 }}>
              {avulsoErro}
            </div>
          )}

          {/* Data */}
          <div>
            <label style={{ fontSize:12, fontWeight:700, color:'#374151', display:'block', marginBottom:6, textTransform:'uppercase' }}>Data</label>
            <input type="date" value={dataSel} onChange={e => setDataSel(e.target.value)} style={INP}/>
          </div>

          {/* Colaborador */}
          <div>
            <label style={{ fontSize:12, fontWeight:700, color:'#374151', display:'block', marginBottom:6, textTransform:'uppercase' }}>Colaborador</label>
            <select value={avulsoColabId} onChange={e => setAvulsoColabId(e.target.value)} style={SEL}>
              <option value="">Selecione…</option>
              {avulsoColabs.map(c => (
                <option key={c.id} value={c.id}>{c.nome}{c.chapa ? ` (${c.chapa})` : ''}</option>
              ))}
            </select>
          </div>

          {/* Obra */}
          <div>
            <label style={{ fontSize:12, fontWeight:700, color:'#374151', display:'block', marginBottom:6, textTransform:'uppercase' }}>Obra</label>
            <select value={avulsoObraId} onChange={e => setAvulsoObraId(e.target.value)} style={SEL}>
              <option value="">Selecione…</option>
              {obrasData.map(o => <option key={o.id} value={o.id}>{o.nome}</option>)}
            </select>
          </div>

          {/* Status */}
          <div>
            <label style={{ fontSize:12, fontWeight:700, color:'#374151', display:'block', marginBottom:8, textTransform:'uppercase' }}>Status</label>
            <div style={{ display:'grid', gridTemplateColumns:'repeat(5,1fr)', gap:6 }}>
              {(Object.entries(STATUS_CONFIG) as [StatusPonto, typeof STATUS_CONFIG[StatusPonto]][]).map(([status, sc]) => (
                <button type="button" key={status} onClick={() => setAvulsoStatus(status)} style={{
                  background: avulsoStatus===status ? sc.bg : '#f9fafb',
                  border:`2px solid ${avulsoStatus===status ? sc.cor : '#e5e7eb'}`,
                  borderRadius:10, padding:'8px 4px', cursor:'pointer',
                  display:'flex', flexDirection:'column', alignItems:'center', gap:4,
                }}>
                  <span style={{ color:sc.cor }}>{sc.icon}</span>
                  <span style={{ fontSize:9, fontWeight:700, color:sc.cor, textAlign:'center', lineHeight:1.2 }}>{sc.label}</span>
                </button>
              ))}
            </div>
          </div>

          <button onClick={salvarAvulso} disabled={avulsoSaving} style={{
            height:50, background: avulsoSaving ? '#94a3b8' : '#1e3a5f', color:'#fff',
            border:'none', borderRadius:12, fontSize:15, fontWeight:700,
            cursor: avulsoSaving ? 'not-allowed' : 'pointer',
            display:'flex', alignItems:'center', justifyContent:'center', gap:8,
          }}>
            {avulsoSaving ? <><Loader2 size={17} className="animate-spin"/>Salvando…</> : <><UserPlus size={17}/>Lançar Ponto Avulso</>}
          </button>
        </div>
      )}

      {/* ── ABA RELATÓRIO ── */}
      {subAba === 'relatorio' && (
        <div style={{ padding:'16px 16px 32px', display:'flex', flexDirection:'column', gap:14 }}>
          {/* Colaborador */}
          <div>
            <label style={{ fontSize:12, fontWeight:700, color:'#374151', display:'block', marginBottom:6, textTransform:'uppercase' }}>Colaborador</label>
            <select value={relColabId} onChange={e => setRelColabId(e.target.value)} style={SEL}>
              <option value="">Selecione…</option>
              {colaboradores.map(c => <option key={c.id} value={c.id}>{c.nome}</option>)}
            </select>
          </div>

          {/* Período */}
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10 }}>
            <div>
              <label style={{ fontSize:12, fontWeight:700, color:'#374151', display:'block', marginBottom:6, textTransform:'uppercase' }}>De</label>
              <input type="date" value={relDtIni} onChange={e => setRelDtIni(e.target.value)} style={INP}/>
            </div>
            <div>
              <label style={{ fontSize:12, fontWeight:700, color:'#374151', display:'block', marginBottom:6, textTransform:'uppercase' }}>Até</label>
              <input type="date" value={relDtFim} onChange={e => setRelDtFim(e.target.value)} style={INP}/>
            </div>
          </div>

          <button onClick={gerarRelatorio} disabled={!relColabId || relLoading} style={{
            height:46, background: (!relColabId||relLoading) ? '#94a3b8' : '#1e3a5f', color:'#fff',
            border:'none', borderRadius:12, fontSize:14, fontWeight:700,
            cursor: (!relColabId||relLoading) ? 'not-allowed' : 'pointer',
            display:'flex', alignItems:'center', justifyContent:'center', gap:8,
          }}>
            {relLoading ? <><Loader2 size={16} className="animate-spin"/>Buscando…</> : <>🔍 Buscar</>}
          </button>

          {relRows.length > 0 && (<>
            {/* Totais rápidos */}
            {(() => {
              const t = { presente:0, falta:0, producao:0, he:0, hf:0 }
              relRows.forEach(r => {
                if (r.status==='presente'||r.status==='meio_periodo') t.presente++
                if (r.status==='falta'||r.status==='falta_justificada') t.falta++
                if (r.status==='producao') t.producao++
                t.he += r.horas_extra ?? 0; t.hf += r.horas_falta ?? 0
              })
              return (
                <div style={{ display:'grid', gridTemplateColumns:'repeat(4,1fr)', gap:8 }}>
                  {[
                    { l:'Presenças', v:t.presente,  cor:'#15803d', bg:'#dcfce7' },
                    { l:'Produção',  v:t.producao,  cor:'#7c3aed', bg:'#f3e8ff' },
                    { l:'Faltas',    v:t.falta,     cor:'#dc2626', bg:'#fee2e2' },
                    { l:'H. Extra',  v:'+'+t.he+'h',cor:'#1d4ed8', bg:'#dbeafe' },
                  ].map(s => (
                    <div key={s.l} style={{ background:s.bg, borderRadius:10, padding:'8px 4px', textAlign:'center' }}>
                      <div style={{ fontWeight:800, fontSize:16, color:s.cor }}>{s.v}</div>
                      <div style={{ fontSize:9, color:s.cor, fontWeight:600 }}>{s.l}</div>
                    </div>
                  ))}
                </div>
              )
            })()}

            {/* Linhas */}
            <div style={{ background:'#fff', borderRadius:12, overflow:'hidden', border:'1px solid #e5e7eb' }}>
              {relRows.map((r, i) => {
                const sc  = STATUS_CONFIG[r.status as StatusPonto] ?? { cor:'#374151', bg:'#f3f4f6', label:r.status }
                const ob  = obrasData.find(o=>o.id===r.obra_id)?.nome ?? '—'
                const dt  = new Date(r.data+'T12:00:00').toLocaleDateString('pt-BR', { weekday:'short', day:'2-digit', month:'2-digit' })
                return (
                  <div key={i} style={{ padding:'10px 14px', borderTop:i>0?'1px solid #f3f4f6':'none', display:'flex', gap:10, alignItems:'center' }}>
                    <div style={{ width:4, height:32, borderRadius:4, background:sc.cor, flexShrink:0 }}/>
                    <div style={{ flex:1 }}>
                      <div style={{ display:'flex', gap:8, alignItems:'center' }}>
                        <span style={{ fontWeight:700, fontSize:12, color:'#111', textTransform:'capitalize' }}>{dt}</span>
                        <span style={{ background:sc.bg, color:sc.cor, borderRadius:4, padding:'1px 7px', fontSize:11, fontWeight:700 }}>{sc.label}</span>
                        {!!r.horas_extra && <span style={{ fontSize:11, color:'#1d4ed8', fontWeight:600 }}>+{r.horas_extra}h</span>}
                        {!!r.horas_falta && <span style={{ fontSize:11, color:'#dc2626', fontWeight:600 }}>-{r.horas_falta}h</span>}
                      </div>
                      {r.observacoes && <div style={{ fontSize:10, color:'#6b7280', marginTop:2 }}>{r.observacoes}</div>}
                      <div style={{ fontSize:10, color:'#9ca3af' }}>📍 {ob}</div>
                    </div>
                  </div>
                )
              })}
            </div>

            <button onClick={imprimirRelatorio} style={{
              height:46, background:'#1e3a5f', color:'#fff', border:'none', borderRadius:12,
              fontSize:14, fontWeight:700, cursor:'pointer',
              display:'flex', alignItems:'center', justifyContent:'center', gap:8,
            }}>
              <FileText size={16}/> Imprimir / PDF
            </button>
          </>)}

          {relRows.length === 0 && relColabId && !relLoading && (
            <div style={{ background:'#f9fafb', borderRadius:10, padding:24, textAlign:'center', color:'#9ca3af' }}>
              Nenhum lançamento encontrado neste período
            </div>
          )}
        </div>
      )}
    </PortalLayout>
  )
}

// ── Sub-componente HorasAjuste ────────────────────────────────────────────────
function HorasAjuste({ horasExtra, horasFalta, observacoes, onSave, saving }: {
  horasExtra: number; horasFalta: number; observacoes: string
  onSave: (he: number, hf: number, obs: string) => void; saving: boolean
}) {
  const [he,  setHe]  = useState(horasExtra)
  const [hf,  setHf]  = useState(horasFalta)
  const [obs, setObs] = useState(observacoes)
  function step(field: 'he'|'hf', dir: 1|-1) {
    if (field==='he') setHe(v => Math.max(0, +(v+dir*0.5).toFixed(1)))
    else              setHf(v => Math.max(0, +(v+dir*0.5).toFixed(1)))
  }
  return (
    <div style={{ background:'#f9fafb', borderRadius:10, padding:12, display:'flex', flexDirection:'column', gap:10 }}>
      <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:8 }}>
        {[
          { f:'he' as const, label:'+ Horas Extra', cor:'#1d4ed8', val:he },
          { f:'hf' as const, label:'- Horas Falta', cor:'#dc2626', val:hf },
        ].map(({ f, label, cor, val }) => (
          <div key={f}>
            <div style={{ fontSize:10, fontWeight:700, color:cor, marginBottom:4, textTransform:'uppercase' }}>{label}</div>
            <div style={{ display:'flex', alignItems:'center', gap:4 }}>
              <button onClick={() => step(f, -1)} style={{ width:30, height:30, background:'#fff', border:'1px solid #e5e7eb', borderRadius:6, cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center' }}><Minus size={13}/></button>
              <span style={{ flex:1, textAlign:'center', fontWeight:800, fontSize:16, color:cor }}>{val}h</span>
              <button onClick={() => step(f, 1)} style={{ width:30, height:30, background:'#fff', border:'1px solid #e5e7eb', borderRadius:6, cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center' }}><Plus size={13}/></button>
            </div>
          </div>
        ))}
      </div>
      <input value={obs} onChange={e => setObs(e.target.value)} placeholder="Observação (opcional)…"
        style={{ width:'100%', height:36, border:'1px solid #e5e7eb', borderRadius:8, padding:'0 10px', fontSize:12, boxSizing:'border-box', background:'#fff' }}/>
      <button onClick={() => onSave(he, hf, obs)} disabled={saving} style={{
        background: saving ? '#94a3b8' : '#1e3a5f', color:'#fff', border:'none', borderRadius:8,
        height:36, cursor: saving ? 'not-allowed' : 'pointer', fontWeight:700, fontSize:13,
        display:'flex', alignItems:'center', justifyContent:'center', gap:6,
      }}>
        {saving ? <><Loader2 size={14} className="animate-spin"/>Salvando…</> : <><Save size={14}/>Salvar ajustes</>}
      </button>
    </div>
  )
}
