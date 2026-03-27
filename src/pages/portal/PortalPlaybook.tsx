import React, { useEffect, useState, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '@/lib/supabase'
import { getPortalSession } from '@/hooks/usePortalAuth'
import PortalLayout from './PortalLayout'
import { CheckSquare, Square, ChevronDown, ChevronUp, RefreshCw } from 'lucide-react'

interface PlaybookItem {
  id: string
  descricao: string
  unidade: string
  categoria?: string | null
  ordem?: number | null
}

interface ObraOption { id: string; nome: string }

export default function PortalPlaybook() {
  const nav     = useNavigate()
  const session = getPortalSession()

  const [obras,       setObras]       = useState<ObraOption[]>([])
  const [obraId,      setObraId]      = useState<string>('')
  const [items,       setItems]       = useState<PlaybookItem[]>([])
  const [loading,     setLoading]     = useState(false)
  const [expandidos,  setExpandidos]  = useState<Set<string>>(new Set())
  const [concluidos,  setConcluidos]  = useState<Set<string>>(new Set())

  // ── Carrega lista de obras do encarregado ──────────────────────────────────
  const fetchObras = useCallback(async () => {
    if (!session) { nav('/portal'); return }
    const ids = session.obras_ids ?? []
    if (!ids.length) return
    const { data } = await supabase.from('obras').select('id,nome').in('id', ids).order('nome')
    if (data) {
      setObras(data)
      if (!obraId && data.length > 0) setObraId(data[0].id)
    }
  }, [session, nav])

  // ── Carrega playbook da obra selecionada ───────────────────────────────────
  const fetchPlaybook = useCallback(async () => {
    if (!obraId) return
    setLoading(true)
    const { data } = await supabase
      .from('playbook_items')
      .select('id,descricao,unidade,categoria,ordem')
      .eq('obra_id', obraId)
      .order('ordem', { ascending: true })
    setItems(data ?? [])
    setLoading(false)
  }, [obraId])

  useEffect(() => { fetchObras() }, [fetchObras])
  useEffect(() => { fetchPlaybook() }, [fetchPlaybook])

  if (!session) return null

  // Agrupa por categoria
  const categorias = [...new Set(items.map(i => i.categoria ?? 'Geral'))].sort()

  function toggleExpand(cat: string) {
    setExpandidos(prev => {
      const next = new Set(prev)
      next.has(cat) ? next.delete(cat) : next.add(cat)
      return next
    })
  }

  function toggleConcluido(id: string) {
    setConcluidos(prev => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  const totalItems = items.length
  const totalConc  = concluidos.size
  const pct        = totalItems > 0 ? Math.round((totalConc / totalItems) * 100) : 0

  return (
    <PortalLayout>
      <div style={{ padding: '16px 16px 8px' }}>
        <div style={{ fontSize: 20, fontWeight: 800, color: '#1e3a5f', marginBottom: 4 }}>
          📋 Playbook da Obra
        </div>
        <div style={{ fontSize: 12, color: '#6b7280', marginBottom: 12 }}>
          Checklist de serviços e atividades
        </div>

        {/* Seletor de obra */}
        {obras.length > 1 && (
          <select value={obraId} onChange={e => setObraId(e.target.value)}
            style={{ width:'100%', height:38, borderRadius:8, border:'1px solid #d1d5db', background:'#fff', fontSize:13, paddingLeft:10, marginBottom:12, color:'#111' }}>
            {obras.map(o => <option key={o.id} value={o.id}>{o.nome}</option>)}
          </select>
        )}

        {/* Barra de progresso */}
        {totalItems > 0 && (
          <div style={{ background:'#f1f5f9', borderRadius:10, padding:'12px 14px', marginBottom:14 }}>
            <div style={{ display:'flex', justifyContent:'space-between', marginBottom:6 }}>
              <span style={{ fontSize:12, fontWeight:600, color:'#374151' }}>Progresso da visita</span>
              <span style={{ fontSize:12, fontWeight:800, color: pct===100 ? '#15803d':'#1e3a5f' }}>{pct}%</span>
            </div>
            <div style={{ height:8, borderRadius:4, background:'#e2e8f0', overflow:'hidden' }}>
              <div style={{ height:'100%', width:`${pct}%`, background: pct===100?'#15803d':'#1e3a5f', borderRadius:4, transition:'width 0.4s' }} />
            </div>
            <div style={{ fontSize:11, color:'#6b7280', marginTop:4 }}>{totalConc} de {totalItems} item(ns) marcado(s)</div>
          </div>
        )}

        {/* Botão refresh */}
        <button onClick={fetchPlaybook}
          style={{ display:'flex', alignItems:'center', gap:6, fontSize:11, color:'#6b7280', background:'transparent', border:'none', cursor:'pointer', marginBottom:8, padding:0 }}>
          <RefreshCw size={12} /> Atualizar lista
        </button>
      </div>

      {/* Lista por categoria */}
      {loading ? (
        <div style={{ padding:40, textAlign:'center', color:'#9ca3af', fontSize:13 }}>Carregando…</div>
      ) : items.length === 0 ? (
        <div style={{ padding:40, textAlign:'center' }}>
          <div style={{ fontSize:40, marginBottom:10 }}>📭</div>
          <div style={{ fontWeight:700, color:'#374151' }}>Nenhum item no playbook</div>
          <div style={{ fontSize:12, color:'#9ca3af', marginTop:4 }}>O responsável deve cadastrar os serviços desta obra no sistema.</div>
        </div>
      ) : (
        <div style={{ padding:'0 16px 24px', display:'flex', flexDirection:'column', gap:10 }}>
          {categorias.map(cat => {
            const catItems = items.filter(i => (i.categoria ?? 'Geral') === cat)
            const catConc  = catItems.filter(i => concluidos.has(i.id)).length
            const aberto   = expandidos.has(cat) || !expandidos.size
            return (
              <div key={cat} style={{ background:'#fff', borderRadius:12, border:'1px solid #e5e7eb', overflow:'hidden', boxShadow:'0 1px 4px rgba(0,0,0,0.04)' }}>
                {/* Header da categoria */}
                <button onClick={() => toggleExpand(cat)}
                  style={{ width:'100%', padding:'12px 14px', display:'flex', alignItems:'center', justifyContent:'space-between', background:'transparent', border:'none', cursor:'pointer' }}>
                  <div style={{ display:'flex', alignItems:'center', gap:8 }}>
                    <span style={{ background:'#1e3a5f', color:'#fff', borderRadius:5, padding:'2px 8px', fontSize:10, fontWeight:700 }}>{cat}</span>
                    <span style={{ fontSize:11, color:'#6b7280' }}>{catConc}/{catItems.length} item(ns)</span>
                  </div>
                  {aberto ? <ChevronUp size={16} color="#9ca3af"/> : <ChevronDown size={16} color="#9ca3af"/>}
                </button>

                {/* Itens */}
                {aberto && (
                  <div style={{ borderTop:'1px solid #f1f5f9' }}>
                    {catItems.map((item, idx) => {
                      const done = concluidos.has(item.id)
                      return (
                        <div key={item.id}
                          onClick={() => toggleConcluido(item.id)}
                          style={{
                            padding:'11px 14px', display:'flex', alignItems:'center', gap:12, cursor:'pointer',
                            borderBottom: idx < catItems.length-1 ? '1px solid #f8fafc':'none',
                            background: done ? '#f0fdf4':'transparent',
                            transition:'background 0.15s',
                          }}>
                          {done
                            ? <CheckSquare size={20} color="#15803d" strokeWidth={2.5}/>
                            : <Square size={20} color="#d1d5db" strokeWidth={1.8}/>
                          }
                          <div style={{ flex:1, minWidth:0 }}>
                            <div style={{ fontSize:13, fontWeight:600, color: done?'#15803d':'#111', textDecoration: done?'line-through':'none' }}>
                              {item.descricao}
                            </div>
                            <div style={{ fontSize:10, color:'#9ca3af', marginTop:2 }}>
                              Unidade: <strong>{item.unidade}</strong>
                            </div>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </PortalLayout>
  )
}
