import React, { useEffect, useState, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '@/lib/supabase'
import { getPortalSession } from '@/hooks/usePortalAuth'
import PortalLayout from './PortalLayout'
import { RefreshCw, AlertCircle, BookOpen, ChevronDown, ChevronUp, Tag, Package } from 'lucide-react'

interface PlaybookItem {
  id: string
  descricao: string
  unidade: string
  preco_unitario?: number | null
  categoria?: string | null
  // ordem removida (coluna não existe no banco)
}

interface ObraOption { id: string; nome: string }

function fmtBRL(v: number | null | undefined) {
  if (!v) return null
  return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

export default function PortalPlaybook() {
  const nav     = useNavigate()
  const session = React.useMemo(() => getPortalSession(), [])

  const [obras,    setObras]    = useState<ObraOption[]>([])
  const [obraId,   setObraId]   = useState<string>('')
  const [items,    setItems]    = useState<PlaybookItem[]>([])
  const [loading,  setLoading]  = useState(false)
  const [erro,     setErro]     = useState<string | null>(null)
  const [catAberta, setCatAberta] = useState<Set<string>>(new Set())

  // ── Carrega obras vinculadas ────────────────────────────────────────────────
  const fetchObras = useCallback(async () => {
    if (!session) { nav('/portal'); return }
    const ids = session.obras_ids ?? []
    if (!ids.length) { setErro('Nenhuma obra vinculada a este acesso.'); return }
    const { data, error } = await supabase.from('obras').select('id,nome').in('id', ids).order('nome')
    if (error) { setErro('Erro ao buscar obras.'); return }
    if (data) {
      setObras(data)
      setObraId(prev => prev || (data[0]?.id ?? ''))
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // ── Carrega itens do playbook ───────────────────────────────────────────────
  const fetchPlaybook = useCallback(async () => {
    if (!obraId) return
    setLoading(true); setErro(null)

    // Tenta buscar com filtro ativo=true
    let { data: dAll, error: eAll } = await supabase
      .from('playbook_itens')
      .select('id,descricao,unidade,preco_unitario,categoria,obra_id')
      .eq('ativo', true)
      .order('categoria', { nullsFirst: false })
      .order('descricao')

    // Se erro de permissão ou coluna inexistente — tenta sem filtro
    if (eAll) {
      console.warn('Tentativa 1 falhou:', eAll.message, '— tentando sem filtro ativo…')
      const fallback = await supabase
        .from('playbook_itens')
        .select('id,descricao,unidade,preco_unitario,categoria,obra_id')
        .order('categoria', { nullsFirst: false })
        .order('descricao')
      if (fallback.error) {
        console.error('Erro definitivo ao buscar playbook:', fallback.error.message)
        setErro(`Erro de permissão: ${fallback.error.message}. Execute EXECUTAR_NO_SUPABASE.sql no Supabase.`)
        setLoading(false)
        return
      }
      dAll = fallback.data
    }

    const all = (dAll ?? []) as (PlaybookItem & { obra_id?: string | null })[]

    if (all.length === 0) {
      setItems([])
      setLoading(false)
      return
    }

    // Deduplicação: preferir itens da obra específica > globais > demais
    const seen = new Map<string, PlaybookItem>()
    all.filter(i => i.obra_id === obraId).forEach(i => seen.set(i.descricao.toLowerCase(), i))
    all.filter(i => !i.obra_id).forEach(i => { if (!seen.has(i.descricao.toLowerCase())) seen.set(i.descricao.toLowerCase(), i) })
    all.filter(i => i.obra_id && i.obra_id !== obraId).forEach(i => { if (!seen.has(i.descricao.toLowerCase())) seen.set(i.descricao.toLowerCase(), i) })

    const merged: PlaybookItem[] = Array.from(seen.values())
    merged.sort((a, b) => (a.categoria ?? 'Geral').localeCompare(b.categoria ?? 'Geral') || a.descricao.localeCompare(b.descricao))

    setItems(merged)
    setCatAberta(new Set(merged.map(i => i.categoria ?? 'Geral')))
    setLoading(false)
  }, [obraId])

  useEffect(() => { fetchObras() }, [fetchObras])
  useEffect(() => { if (obraId) fetchPlaybook() }, [fetchPlaybook, obraId])

  if (!session) return null

  // ── Agrupa por categoria ─────────────────────────────────────────────────────
  const categorias = items.reduce<Record<string, PlaybookItem[]>>((acc, item) => {
    const cat = item.categoria?.trim() || 'Geral'
    if (!acc[cat]) acc[cat] = []
    acc[cat].push(item)
    return acc
  }, {})

  const catKeys = Object.keys(categorias).sort()

  function toggleCat(cat: string) {
    setCatAberta(prev => {
      const next = new Set(prev)
      if (next.has(cat)) next.delete(cat)
      else next.add(cat)
      return next
    })
  }

  // Cores por categoria (cíclico)
  const CORES = ['#3b82f6','#10b981','#f59e0b','#8b5cf6','#ef4444','#06b6d4','#f97316','#84cc16']
  const corCat = (cat: string) => CORES[catKeys.indexOf(cat) % CORES.length]

  return (
    <PortalLayout>
      <div style={{ maxWidth: 700, margin: '0 auto', padding: '16px 12px' }}>

        {/* ── Cabeçalho ── */}
        <div style={{ display:'flex', alignItems:'center', gap:10, marginBottom:16 }}>
          <div style={{ width:38, height:38, borderRadius:10, background:'linear-gradient(135deg,#1565C0,#0D47A1)', display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 }}>
            <BookOpen size={18} color="#fff"/>
          </div>
          <div>
            <h1 style={{ margin:0, fontSize:17, fontWeight:800, color:'#1e293b' }}>Playbook da Obra</h1>
            <p style={{ margin:0, fontSize:11, color:'#64748b' }}>Serviços e preços cadastrados no sistema</p>
          </div>
          <button onClick={fetchPlaybook} disabled={loading}
            style={{ marginLeft:'auto', background:'#f1f5f9', border:'1px solid #e2e8f0', borderRadius:8, padding:'7px 12px', cursor:'pointer', display:'flex', alignItems:'center', gap:5, fontSize:12, fontWeight:600, color:'#475569' }}>
            <RefreshCw size={13} style={{ animation: loading ? 'spin 1s linear infinite' : 'none' }}/> Atualizar
          </button>
        </div>

        {/* ── Seletor de obra ── */}
        {obras.length > 1 && (
          <div style={{ marginBottom:14 }}>
            <select value={obraId} onChange={e => setObraId(e.target.value)}
              style={{ width:'100%', height:44, border:'2px solid #e2e8f0', borderRadius:10, padding:'0 12px', fontSize:13, fontWeight:600, color:'#1e293b', background:'#fff', cursor:'pointer' }}>
              {obras.map(o => <option key={o.id} value={o.id}>{o.nome}</option>)}
            </select>
          </div>
        )}

        {/* ── Erro ── */}
        {erro && (
          <div style={{ background:'#fef2f2', border:'1px solid #fecaca', borderRadius:10, padding:'12px 14px', display:'flex', gap:8, alignItems:'flex-start', marginBottom:14 }}>
            <AlertCircle size={16} color="#dc2626" style={{ flexShrink:0, marginTop:1 }}/>
            <span style={{ fontSize:13, color:'#dc2626' }}>{erro}</span>
          </div>
        )}

        {/* ── Loading ── */}
        {loading && (
          <div style={{ textAlign:'center', padding:'40px 0', color:'#94a3b8' }}>
            <RefreshCw size={24} style={{ animation:'spin 1s linear infinite' }}/>
            <div style={{ marginTop:8, fontSize:13 }}>Carregando playbook...</div>
          </div>
        )}

        {/* ── Vazio ── */}
        {!loading && !erro && items.length === 0 && obraId && (
          <div style={{ textAlign:'center', padding:'48px 24px', background:'#fff', borderRadius:16, border:'2px dashed #e2e8f0' }}>
            <BookOpen size={32} color="#cbd5e1" style={{ marginBottom:12 }}/>
            <div style={{ fontSize:15, fontWeight:700, color:'#64748b' }}>Nenhum item cadastrado</div>
            <div style={{ fontSize:12, color:'#94a3b8', marginTop:4 }}>O playbook desta obra ainda não foi configurado no sistema.</div>
          </div>
        )}

        {/* ── Contador de itens ── */}
        {!loading && items.length > 0 && (
          <div style={{ display:'flex', gap:8, marginBottom:14, flexWrap:'wrap' }}>
            <div style={{ background:'#eff6ff', border:'1px solid #bfdbfe', borderRadius:8, padding:'5px 12px', fontSize:11, fontWeight:700, color:'#1d4ed8', display:'flex', alignItems:'center', gap:5 }}>
              <Package size={12}/> {items.length} serviço{items.length !== 1 ? 's' : ''}
            </div>
            <div style={{ background:'#f0fdf4', border:'1px solid #bbf7d0', borderRadius:8, padding:'5px 12px', fontSize:11, fontWeight:700, color:'#15803d', display:'flex', alignItems:'center', gap:5 }}>
              <Tag size={12}/> {catKeys.length} categoria{catKeys.length !== 1 ? 's' : ''}
            </div>
          </div>
        )}

        {/* ── Categorias ── */}
        {!loading && catKeys.map(cat => {
          const cor    = corCat(cat)
          const aberta = catAberta.has(cat)
          const itens  = categorias[cat]

          return (
            <div key={cat} style={{ marginBottom:10, background:'#fff', borderRadius:14, border:`1.5px solid ${cor}30`, overflow:'hidden', boxShadow:'0 1px 4px rgba(0,0,0,0.05)' }}>

              {/* Header da categoria */}
              <button onClick={() => toggleCat(cat)} style={{
                width:'100%', display:'flex', alignItems:'center', gap:10,
                padding:'12px 16px', border:'none', cursor:'pointer',
                background: aberta ? `${cor}12` : '#fafafa',
                borderBottom: aberta ? `1px solid ${cor}20` : 'none',
                transition:'background 0.15s',
              }}>
                <div style={{ width:32, height:32, borderRadius:9, background:`${cor}20`, display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 }}>
                  <Tag size={14} color={cor}/>
                </div>
                <div style={{ flex:1, textAlign:'left' }}>
                  <div style={{ fontWeight:800, fontSize:14, color:'#1e293b' }}>{cat}</div>
                  <div style={{ fontSize:10, color:'#94a3b8', marginTop:1 }}>{itens.length} item{itens.length !== 1 ? 's' : ''}</div>
                </div>
                {aberta ? <ChevronUp size={16} color="#94a3b8"/> : <ChevronDown size={16} color="#94a3b8"/>}
              </button>

              {/* Tabela de itens */}
              {aberta && (
                <div>
                  {/* Cabeçalho da tabela */}
                  <div style={{ display:'grid', gridTemplateColumns:'1fr 80px 90px', padding:'6px 16px', background:'#f8fafc', borderBottom:'1px solid #f1f5f9' }}>
                    <span style={{ fontSize:9, fontWeight:700, color:'#94a3b8', textTransform:'uppercase', letterSpacing:'0.05em' }}>Serviço</span>
                    <span style={{ fontSize:9, fontWeight:700, color:'#94a3b8', textTransform:'uppercase', letterSpacing:'0.05em', textAlign:'center' }}>Unidade</span>
                    <span style={{ fontSize:9, fontWeight:700, color:'#94a3b8', textTransform:'uppercase', letterSpacing:'0.05em', textAlign:'right' }}>Preço Unit.</span>
                  </div>

                  {itens.map((item, idx) => {
                    const preco = fmtBRL(item.preco_unitario)
                    return (
                      <div key={item.id} style={{
                        display:'grid', gridTemplateColumns:'1fr 80px 90px',
                        padding:'10px 16px', alignItems:'center',
                        background: idx % 2 === 0 ? '#fff' : '#fafafa',
                        borderBottom: idx < itens.length - 1 ? '1px solid #f1f5f9' : 'none',
                      }}>
                        {/* Nome */}
                        <div style={{ display:'flex', alignItems:'center', gap:8 }}>
                          <div style={{ width:6, height:6, borderRadius:'50%', background:cor, flexShrink:0 }}/>
                          <span style={{ fontSize:13, fontWeight:600, color:'#1e293b' }}>{item.descricao}</span>
                        </div>
                        {/* Unidade */}
                        <div style={{ textAlign:'center' }}>
                          <span style={{ background:`${cor}15`, color:cor, borderRadius:5, padding:'3px 8px', fontSize:10, fontWeight:700 }}>
                            {item.unidade ?? '—'}
                          </span>
                        </div>
                        {/* Preço */}
                        <div style={{ textAlign:'right' }}>
                          {preco
                            ? <span style={{ fontWeight:800, fontSize:13, color:'#15803d' }}>{preco}</span>
                            : <span style={{ fontSize:11, color:'#cbd5e1' }}>—</span>
                          }
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

      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
      `}</style>
    </PortalLayout>
  )
}
