import React, { useEffect, useState, useCallback, useMemo } from 'react'
import { supabase } from '@/lib/supabase'
import GestorLayout from './GestorLayout'
import { fetchEmpresaData, CABECALHO_CSS, gerarCabecalhoHTML } from '@/lib/relatorioHeader'
import { Loader2, FileDown } from 'lucide-react'
import { toast } from 'sonner'

type Tipo   = 'locado' | 'proprio'
type Status = 'ativo' | 'devolvido' | 'baixa' | 'defeito'

interface Equip {
  id: string; obra_id: string; obra_nome: string; tipo: Tipo; nome: string
  descricao?: string; quantidade: number; fornecedor?: string
  data_inicio?: string; data_prevista?: string; data_devolucao?: string
  status: Status; observacoes?: string
}

const STATUS_CFG: Record<Status, { label: string; cor: string; bg: string; emoji: string }> = {
  ativo:     { label:'Ativo',     cor:'#16a34a', bg:'#dcfce7', emoji:'✅' },
  devolvido: { label:'Devolvido', cor:'#0369a1', bg:'#e0f2fe', emoji:'↩️' },
  baixa:     { label:'Baixa',     cor:'#7c3aed', bg:'#f5f3ff', emoji:'🗑️' },
  defeito:   { label:'Defeito',   cor:'#dc2626', bg:'#fee2e2', emoji:'⚠️' },
}

export default function GestorEquipamentos() {
  const [loading,      setLoading]      = useState(true)
  const [rows,         setRows]         = useState<Equip[]>([])
  const [obras,        setObras]        = useState<{ id: string; nome: string }[]>([])
  const [obraFiltro,   setObraFiltro]   = useState('todas')
  const [statusFiltro, setStatusFiltro] = useState<'todos' | Status>('ativo')

  const fetchData = useCallback(async () => {
    setLoading(true)
    const [{ data: eqData, error }, { data: obrasData }] = await Promise.all([
      supabase.from('obra_equipamentos').select('*, obras(nome)').order('obra_id').order('tipo').order('created_at', { ascending: false }),
      supabase.from('obras').select('id, nome').neq('status', 'concluida').order('nome'),
    ])
    if (error) {
      if (error.message.includes('schema cache') || error.message.includes('does not exist')) {
        toast.error('Tabela não criada. Execute docs/fix_equipamentos.sql no Supabase.', { duration: 8000 })
      }
    }
    setObras(obrasData ?? [])
    setRows((eqData ?? []).map((r: any) => ({ ...r, obra_nome: r.obras?.nome ?? '—' })))
    setLoading(false)
  }, [])

  useEffect(() => { fetchData() }, [fetchData])

  async function marcarStatus(id: string, status: Status) {
    const payload: any = { status }
    if (status === 'devolvido') payload.data_devolucao = new Date().toISOString().slice(0, 10)
    const { error } = await supabase.from('obra_equipamentos').update(payload).eq('id', id)
    if (error) { toast.error('Erro: ' + error.message); return }
    toast.success('Status atualizado!'); fetchData()
  }

  async function gerarPDF(obraId?: string) {
    const alvo = obraId ? rows.filter(r => r.obra_id === obraId) : rows
    if (alvo.length === 0) { toast.error('Nenhum item para exportar'); return }
    const emp = await fetchEmpresaData()
    const obraNome = obraId ? (obras.find(o => o.id === obraId)?.nome ?? 'Obra') : 'Todas as Obras'
    const hoje = new Date().toLocaleDateString('pt-BR')
    const STATUS_LABEL: Record<string, string> = { ativo:'Ativo', devolvido:'Devolvido', baixa:'Baixa', defeito:'Defeito' }
    const STATUS_COR:   Record<string, string> = { ativo:'#16a34a', devolvido:'#0369a1', baixa:'#7c3aed', defeito:'#dc2626' }

    // Se 'todas as obras', agrupa por obra para o PDF
    const obrasAlvo = obraId
      ? [{ id: obraId, nome: obraNome }]
      : [...new Map(alvo.map(r => [r.obra_id, { id: r.obra_id, nome: r.obra_nome }])).values()]

    const secaoObra = (oId: string, oNome: string) => {
      const itensObra = alvo.filter(r => r.obra_id === oId)
      const locados  = itensObra.filter(r => r.tipo === 'locado')
      const proprios = itensObra.filter(r => r.tipo === 'proprio')
      const block = (itens: Equip[], tipo: string) => {
        if (itens.length === 0) return ''
        const hBg  = tipo === 'locado' ? '#1d4ed8' : '#15803d'
        const hBg2 = tipo === 'locado' ? '#eff6ff'  : '#f0fdf4'
        const hTit = tipo === 'locado' ? '🚛 EQUIPAMENTOS LOCADOS' : '🔧 FERRAMENTAS PRÓPRIAS'
        const h4   = tipo === 'locado' ? 'Prev. Devolução' : 'Observações'
        const header = `<tr style="background:${hBg};color:#fff"><th colspan="6">${hTit}</th></tr>
          <tr style="background:${hBg2}"><th>Item</th><th>Qtd</th><th>Fornecedor</th><th>Data Início</th><th>${h4}</th><th>Status</th></tr>`
        const linhas = itens.map(r => {
          const venc = tipo==='locado' && r.data_prevista && r.status==='ativo' && new Date(r.data_prevista) < new Date()
          const cor  = venc ? '#dc2626' : STATUS_COR[r.status] ?? '#374151'
          return `<tr>
            <td><strong>${r.nome}</strong>${r.descricao?`<br><small style="color:#6b7280">${r.descricao}</small>`:''}</td>
            <td style="text-align:center">${r.quantidade}</td>
            <td>${r.fornecedor??'—'}</td>
            <td>${r.data_inicio?new Date(r.data_inicio+'T12:00').toLocaleDateString('pt-BR'):'—'}</td>
            <td style="color:${venc?'#dc2626':'inherit'};font-weight:${venc?700:400}">${tipo==='locado'?(r.data_prevista?new Date(r.data_prevista+'T12:00').toLocaleDateString('pt-BR'):'—'):(r.observacoes??'—')}${venc?' ⏰':''}</td>
            <td><span style="color:${cor};font-weight:700">${STATUS_LABEL[r.status]??r.status}</span></td>
          </tr>`
        }).join('')
        return `${header}${linhas}`
      }
      return `<tr style="background:#0f172a;color:#fff"><td colspan="6" style="padding:8px 10px;font-size:12px;font-weight:800">🏗️ ${oNome}</td></tr>${block(locados,'locado')}${block(proprios,'proprio')}`
    }

    const corpoTabela = obrasAlvo.map(o => secaoObra(o.id, o.nome)).join('')

    const html = `<!DOCTYPE html><html><head><meta charset="utf-8"/>
    <title>Equipamentos — ${obraNome}</title>
    <style>*{margin:0;padding:0;box-sizing:border-box}body{font-family:Arial,sans-serif;padding:24px;color:#111;font-size:12px}
    ${CABECALHO_CSS}
    table{width:100%;border-collapse:collapse;margin-bottom:20px}
    th,td{padding:6px 9px;border:1px solid #e2e8f0;text-align:left;font-size:11px}
    th{font-weight:700;font-size:10px;text-transform:uppercase}
    tr:nth-child(even) td{background:#f8fafc}
    .rodape{margin-top:24px;padding-top:10px;border-top:1px solid #e2e8f0;font-size:10px;color:#9ca3af;text-align:right}
    @media print{body{padding:14px}}</style></head><body>
    ${gerarCabecalhoHTML(emp,{titulo:'Listagem de Equipamentos & Ferramentas',subtitulo:'Obras: '+obraNome+' · Emitido em: '+hoje})}
    <table>${corpoTabela}</table>
    <div class="rodape">Total: ${alvo.length} item(s) · Locados: ${alvo.filter(r=>r.tipo==='locado').length} · Próprios: ${alvo.filter(r=>r.tipo==='proprio').length} · Ativos: ${alvo.filter(r=>r.status==='ativo').length}</div>
    <script>window.onload=()=>{window.print()}<\/script></body></html>`
    const win = window.open('','_blank','width=920,height=700')
    if (win) { win.document.write(html); win.document.close() }
  }

  // Filtros
  const rowsFiltrados = useMemo(() => {
    let r = rows
    if (obraFiltro   !== 'todas') r = r.filter(x => x.obra_id === obraFiltro)
    if (statusFiltro !== 'todos') r = r.filter(x => x.status  === statusFiltro)
    return r
  }, [rows, obraFiltro, statusFiltro])

  // Agrupar por obra
  const porObra = useMemo(() => {
    const m = new Map<string, { nome: string; locados: Equip[]; proprios: Equip[] }>()
    rowsFiltrados.forEach(r => {
      if (!m.has(r.obra_id)) m.set(r.obra_id, { nome: r.obra_nome, locados: [], proprios: [] })
      const g = m.get(r.obra_id)!
      if (r.tipo === 'locado') g.locados.push(r); else g.proprios.push(r)
    })
    return Array.from(m.entries()).map(([id, g]) => ({ id, ...g }))
  }, [rowsFiltrados])

  // KPIs globais (sem filtro)
  const totAtivos   = rows.filter(r => r.status === 'ativo').length
  const totLocados  = rows.filter(r => r.tipo === 'locado'  && r.status === 'ativo').length
  const totProprios = rows.filter(r => r.tipo === 'proprio' && r.status === 'ativo').length
  const totVencidos = rows.filter(r => r.tipo === 'locado'  && r.status === 'ativo' &&
    r.data_prevista && new Date(r.data_prevista) < new Date()).length

  return (
    <GestorLayout>
      {/* Header */}
      <div style={{ marginBottom: 20, display:'flex', alignItems:'flex-start', justifyContent:'space-between', flexWrap:'wrap', gap:10 }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 800, margin: '0 0 4px', color: '#0f172a' }}>🔧 Equipamentos & Ferramentas</h1>
          <p style={{ color: '#64748b', fontSize: 13, margin: 0 }}>Equipamentos locados e ferramentas por obra</p>
        </div>
        {rows.length > 0 && (
          <button onClick={() => gerarPDF(obraFiltro !== 'todas' ? obraFiltro : undefined)}
            style={{ display:'flex', alignItems:'center', gap:6, padding:'8px 16px', borderRadius:9, border:'1px solid #e2e8f0', background:'#f8fafc', cursor:'pointer', fontSize:13, fontWeight:700, color:'#374151' }}>
            <FileDown size={15}/> Gerar PDF {obraFiltro !== 'todas' ? '(Obra)' : '(Todas as Obras)'}
          </button>
        )}
      </div>

      {/* KPIs */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(155px,1fr))', gap: 12, marginBottom: 20 }}>
        {[
          { emoji:'✅', label:'Ativos Total',   val: totAtivos,   cor:'#16a34a', bg:'#dcfce7' },
          { emoji:'🚛', label:'Locados Ativos',  val: totLocados,  cor:'#0369a1', bg:'#e0f2fe' },
          { emoji:'🔧', label:'Próprios Ativos', val: totProprios, cor:'#059669', bg:'#f0fdf4' },
          { emoji:'⏰', label:'Locação Vencida', val: totVencidos, cor:'#dc2626', bg:'#fee2e2', alert: totVencidos > 0 },
        ].map(k => (
          <div key={k.label} style={{ background:'#fff', borderRadius:12, border:`1px solid ${(k as any).alert?'#fca5a5':'#e2e8f0'}`, padding:'14px 16px', textAlign:'center' }}>
            <div style={{ fontSize:24, marginBottom:4 }}>{k.emoji}</div>
            <div style={{ fontSize:20, fontWeight:800, color:k.cor }}>{k.val}</div>
            <div style={{ fontSize:10, color:'#64748b', fontWeight:600, marginTop:2 }}>{k.label}</div>
          </div>
        ))}
      </div>

      {/* Filtros */}
      <div style={{ background:'#fff', borderRadius:12, border:'1px solid #e2e8f0', padding:'12px 16px', marginBottom:16, display:'flex', gap:10, flexWrap:'wrap' }}>
        <select value={obraFiltro} onChange={e => setObraFiltro(e.target.value)}
          style={{ border:'1px solid #e2e8f0', borderRadius:8, padding:'6px 10px', fontSize:13, background:'#fff' }}>
          <option value="todas">🏗️ Todas as obras</option>
          {obras.map(o => <option key={o.id} value={o.id}>{o.nome}</option>)}
        </select>
        <select value={statusFiltro} onChange={e => setStatusFiltro(e.target.value as any)}
          style={{ border:'1px solid #e2e8f0', borderRadius:8, padding:'6px 10px', fontSize:13, background:'#fff' }}>
          <option value="todos">📌 Todos os status</option>
          <option value="ativo">✅ Ativos</option>
          <option value="devolvido">↩️ Devolvidos</option>
          <option value="baixa">🗑️ Baixa</option>
          <option value="defeito">⚠️ Defeito</option>
        </select>
      </div>

      {/* Conteúdo */}
      {loading ? (
        <div style={{ display:'flex', justifyContent:'center', padding:48 }}>
          <Loader2 size={28} color="#0369a1" style={{ animation:'spin 1s linear infinite' }} />
        </div>
      ) : porObra.length === 0 ? (
        <div style={{ background:'#fff', borderRadius:12, border:'1px solid #e2e8f0', padding:40, textAlign:'center', color:'#94a3b8' }}>
          <div style={{ fontSize:40, marginBottom:8 }}>🔧</div>
          <div style={{ fontSize:14, fontWeight:600 }}>Nenhum equipamento cadastrado</div>
          <div style={{ fontSize:12, marginTop:4 }}>Cadastre pelo Portal da Obra → Equipamentos</div>
        </div>
      ) : (
        <div style={{ display:'flex', flexDirection:'column', gap:16 }}>
          {porObra.map(grupo => (
            <div key={grupo.id} style={{ background:'#fff', borderRadius:14, border:'1px solid #e2e8f0', overflow:'hidden' }}>
              {/* Header da obra */}
              <div style={{ background:'linear-gradient(135deg,#1e3a5f,#1d4ed8)', padding:'12px 18px', display:'flex', alignItems:'center', justifyContent:'space-between' }}>
                <div style={{ display:'flex', alignItems:'center', gap:10 }}>
                  <span style={{ fontSize:20 }}>🏗️</span>
                  <span style={{ fontWeight:800, fontSize:15, color:'#fff' }}>{grupo.nome}</span>
                </div>
                <div style={{ display:'flex', gap:8, alignItems:'center' }}>
                  {grupo.locados.length > 0 && (
                    <span style={{ background:'rgba(255,255,255,0.2)', color:'#fff', borderRadius:12, padding:'2px 10px', fontSize:11, fontWeight:700 }}>
                      🚛 {grupo.locados.length} locado{grupo.locados.length>1?'s':''}
                    </span>
                  )}
                  {grupo.proprios.length > 0 && (
                    <span style={{ background:'rgba(255,255,255,0.2)', color:'#fff', borderRadius:12, padding:'2px 10px', fontSize:11, fontWeight:700 }}>
                      🔧 {grupo.proprios.length} própri{grupo.proprios.length>1?'os':'o'}
                    </span>
                  )}
                  <button onClick={() => gerarPDF(grupo.id)}
                    style={{ display:'flex', alignItems:'center', gap:4, padding:'3px 10px', borderRadius:7, border:'1px solid rgba(255,255,255,0.4)', background:'rgba(255,255,255,0.15)', color:'#fff', fontWeight:700, fontSize:11, cursor:'pointer' }}>
                    <FileDown size={12}/> PDF
                  </button>
                </div>
              </div>

              <div style={{ padding:'14px 18px' }}>
                {/* Equipamentos Locados */}
                {grupo.locados.length > 0 && (
                  <div style={{ marginBottom: grupo.proprios.length > 0 ? 14 : 0 }}>
                    <div style={{ fontWeight:700, fontSize:12, color:'#1d4ed8', marginBottom:8,
                      textTransform:'uppercase', letterSpacing:'0.05em', display:'flex', alignItems:'center', gap:6 }}>
                      🚛 Equipamentos Locados
                    </div>
                    <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
                      {grupo.locados.map(r => <RowEquip key={r.id} r={r} onStatus={marcarStatus}/>)}
                    </div>
                  </div>
                )}

                {/* Ferramentas Próprias */}
                {grupo.proprios.length > 0 && (
                  <div>
                    {grupo.locados.length > 0 && <div style={{ borderTop:'1px solid #e2e8f0', marginBottom:14 }} />}
                    <div style={{ fontWeight:700, fontSize:12, color:'#15803d', marginBottom:8,
                      textTransform:'uppercase', letterSpacing:'0.05em', display:'flex', alignItems:'center', gap:6 }}>
                      🔧 Ferramentas Próprias
                    </div>
                    <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
                      {grupo.proprios.map(r => <RowEquip key={r.id} r={r} onStatus={marcarStatus}/>)}
                    </div>
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
      <style>{`@keyframes spin{from{transform:rotate(0deg)}to{transform:rotate(360deg)}}`}</style>
    </GestorLayout>
  )
}

// ─── Row de item ──────────────────────────────────────────────────────────────
function RowEquip({ r, onStatus }: { r: Equip; onStatus: (id: string, s: Status) => void }) {
  const sc = STATUS_CFG[r.status]
  const vencido = r.tipo==='locado' && r.data_prevista && r.status==='ativo' && new Date(r.data_prevista) < new Date()
  return (
    <div style={{
      display:'flex', alignItems:'flex-start', gap:12, padding:'10px 14px',
      background: vencido?'#fef2f2':'#f8fafc',
      border:`1px solid ${vencido?'#fca5a5':'#e2e8f0'}`,
      borderLeft:`3px solid ${vencido?'#dc2626':r.tipo==='locado'?'#2563eb':'#16a34a'}`,
      borderRadius:10,
    }}>
      <div style={{ fontSize:22, flexShrink:0 }}>{r.tipo==='locado'?'🚛':'🔧'}</div>
      <div style={{ flex:1 }}>
        <div style={{ display:'flex', alignItems:'center', gap:6, flexWrap:'wrap', marginBottom:2 }}>
          <span style={{ fontWeight:700, fontSize:13, color:'#0f172a' }}>{r.nome}</span>
          <span style={{ fontSize:10, background:sc.bg, color:sc.cor, borderRadius:5, padding:'1px 6px', fontWeight:700 }}>{sc.emoji} {sc.label}</span>
          {vencido && <span style={{ fontSize:10, background:'#fee2e2', color:'#dc2626', borderRadius:5, padding:'1px 6px', fontWeight:700 }}>⏰ Vencido</span>}
        </div>
        {r.descricao && <div style={{ fontSize:11, color:'#64748b' }}>{r.descricao}</div>}
        <div style={{ fontSize:11, color:'#94a3b8', marginTop:3, display:'flex', gap:10, flexWrap:'wrap' }}>
          <span>📦 {r.quantidade}</span>
          {r.fornecedor && <span>🏢 {r.fornecedor}</span>}
          {r.data_inicio && <span>📅 {new Date(r.data_inicio+'T12:00').toLocaleDateString('pt-BR')}</span>}
          {r.tipo==='locado' && r.data_prevista && (
            <span style={{ color:vencido?'#dc2626':'#94a3b8', fontWeight:vencido?700:400 }}>
              🗓️ Prev: {new Date(r.data_prevista+'T12:00').toLocaleDateString('pt-BR')}
            </span>
          )}
        </div>
        {r.observacoes && <div style={{ fontSize:11, color:'#94a3b8', fontStyle:'italic', marginTop:2 }}>"{r.observacoes}"</div>}
      </div>
      {/* Ação rápida */}
      {r.status==='ativo' && (
        <div style={{ display:'flex', flexDirection:'column', gap:4, flexShrink:0 }}>
          {r.tipo==='locado' && (
            <button onClick={()=>onStatus(r.id,'devolvido')} style={{ padding:'4px 9px', borderRadius:6, border:'1px solid #bfdbfe', background:'#eff6ff', color:'#1d4ed8', fontWeight:700, fontSize:10, cursor:'pointer' }}>↩️ Devolvido</button>
          )}
          {r.tipo==='proprio' && (
            <button onClick={()=>onStatus(r.id,'baixa')} style={{ padding:'4px 9px', borderRadius:6, border:'1px solid #ddd6fe', background:'#f5f3ff', color:'#7c3aed', fontWeight:700, fontSize:10, cursor:'pointer' }}>🗑️ Baixa</button>
          )}
          <button onClick={()=>onStatus(r.id,'defeito')} style={{ padding:'4px 9px', borderRadius:6, border:'1px solid #fecaca', background:'#fef2f2', color:'#dc2626', fontWeight:700, fontSize:10, cursor:'pointer' }}>⚠️ Defeito</button>
        </div>
      )}
    </div>
  )
}
