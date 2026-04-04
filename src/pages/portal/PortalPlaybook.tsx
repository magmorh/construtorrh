import React, { useEffect, useState, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '@/lib/supabase'
import { getPortalSession } from '@/hooks/usePortalAuth'
import PortalLayout from './PortalLayout'
import { RefreshCw, AlertCircle, BookOpen, ChevronDown, ChevronUp, Tag, Package, Search, X } from 'lucide-react'

interface PlaybookItem {
  id: string
  descricao: string
  unidade: string
  preco_unitario?: number | null
  categoria?: string | null
  obra_id?: string | null
}

interface ObraOption { id: string; nome: string }

function fmtBRL(v: number | null | undefined) {
  if (!v) return null
  return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

export default function PortalPlaybook() {
  const nav     = useNavigate()
  const session = React.useMemo(() => getPortalSession(), [])

  const [obras,      setObras]      = useState<ObraOption[]>([])
  const [obraId,     setObraId]     = useState<string>('')
  const [items,      setItems]      = useState<PlaybookItem[]>([])
  const [loading,    setLoading]    = useState(false)
  const [erro,       setErro]       = useState<string | null>(null)
  const [catAberta,  setCatAberta]  = useState<Set<string>>(new Set())
  const [busca,      setBusca]      = useState('')

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

  // ── Carrega itens do playbook FILTRADOS pela obra ───────────────────────────
  const fetchPlaybook = useCallback(async () => {
    if (!obraId) return
    setLoading(true)
    setErro(null)

    // 1. Busca itens específicos da obra (obra_id = obraId)
    const { data: específicos, error: e1 } = await supabase
      .from('playbook_itens')
      .select('id,descricao,unidade,preco_unitario,categoria,obra_id')
      .eq('obra_id', obraId)
      .eq('ativo', true)
      .order('categoria', { nullsFirst: false })
      .order('descricao')

    // 2. Busca itens globais (obra_id IS NULL) — template base
    const { data: globais, error: e2 } = await supabase
      .from('playbook_itens')
      .select('id,descricao,unidade,preco_unitario,categoria,obra_id')
      .is('obra_id', null)
      .eq('ativo', true)
      .order('categoria', { nullsFirst: false })
      .order('descricao')

    // Se ambas as queries falharam, tenta sem filtro ativo
    if (e1 && e2) {
      console.warn('Tentativa com ativo=true falhou. Tentando sem filtro…')
      const { data: semFiltro, error: e3 } = await supabase
        .from('playbook_itens')
        .select('id,descricao,unidade,preco_unitario,categoria,obra_id')
        .or(`obra_id.eq.${obraId},obra_id.is.null`)
        .order('categoria', { nullsFirst: false })
        .order('descricao')
      if (e3) {
        setErro(`Erro de permissão: ${e3.message}. Verifique as políticas de acesso no Supabase.`)
        setLoading(false)
        return
      }
      processar(semFiltro ?? [])
      return
    }

    // Mescla: específicos da obra têm prioridade; globais complementam (sem duplicar por descricao)
    const specificsArr = (específicos ?? []) as PlaybookItem[]
    const globaisArr   = (globais   ?? []) as PlaybookItem[]

    // Índice dos específicos por descricao normalizada
    const specificsIdx = new Set(specificsArr.map(i => i.descricao.trim().toLowerCase()))

    // Globais que NÃO existem na lista específica da obra
    const globaisComplem = globaisArr.filter(i => !specificsIdx.has(i.descricao.trim().toLowerCase()))

    processar([...specificsArr, ...globaisComplem])
  }, [obraId])

  function processar(arr: PlaybookItem[]) {
    const sorted = [...arr].sort(
      (a, b) =>
        (a.categoria ?? 'Geral').localeCompare(b.categoria ?? 'Geral') ||
        a.descricao.localeCompare(b.descricao)
    )
    setItems(sorted)
    setCatAberta(new Set(sorted.map(i => i.categoria ?? 'Geral')))
    setLoading(false)
  }

  useEffect(() => { fetchObras() }, [fetchObras])
  useEffect(() => { if (obraId) fetchPlaybook() }, [fetchPlaybook, obraId])

  if (!session) return null

  // ── Filtra por busca ─────────────────────────────────────────────────────────
  const buscaNorm = busca.trim().toLowerCase()
  const itensFiltrados = buscaNorm
    ? items.filter(i =>
        i.descricao.toLowerCase().includes(buscaNorm) ||
        (i.categoria ?? '').toLowerCase().includes(buscaNorm) ||
        (i.unidade ?? '').toLowerCase().includes(buscaNorm)
      )
    : items

  // ── Agrupa por categoria ─────────────────────────────────────────────────────
  const categorias = itensFiltrados.reduce<Record<string, PlaybookItem[]>>((acc, item) => {
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
  const allCatKeys = Object.keys(
    items.reduce<Record<string,boolean>>((acc, i) => { acc[i.categoria?.trim() || 'Geral'] = true; return acc }, {})
  ).sort()
  const corCat = (cat: string) => CORES[allCatKeys.indexOf(cat) % CORES.length]

  // Badge indicando origem do item
  function badgeOrigem(item: PlaybookItem) {
    if (!item.obra_id) return (
      <span style={{ fontSize:9, padding:'1px 5px', borderRadius:4, background:'#e0f2fe', color:'#0369a1', fontWeight:700, marginLeft:6 }}>
        PADRÃO
      </span>
    )
    return null
  }

  const obraAtual = obras.find(o => o.id === obraId)

  return (
    <PortalLayout>
      <div style={{ maxWidth: 700, margin: '0 auto', padding: '16px 12px' }}>

        {/* ── Cabeçalho ── */}
        <div style={{ display:'flex', alignItems:'center', gap:10, marginBottom:16 }}>
          <div style={{ width:38, height:38, borderRadius:10, background:'linear-gradient(135deg,#1565C0,#0D47A1)', display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 }}>
            <BookOpen size={18} color="#fff"/>
          </div>
          <div style={{ flex:1, minWidth:0 }}>
            <h1 style={{ margin:0, fontSize:17, fontWeight:800, color:'#1e293b' }}>Playbook da Obra</h1>
            <p style={{ margin:0, fontSize:11, color:'#64748b' }}>
              {obraAtual ? `Serviços cadastrados para ${obraAtual.nome}` : 'Serviços e preços cadastrados no sistema'}
            </p>
          </div>
          <button onClick={fetchPlaybook} disabled={loading}
            style={{ background:'#f1f5f9', border:'1px solid #e2e8f0', borderRadius:8, padding:'7px 12px', cursor:'pointer', display:'flex', alignItems:'center', gap:5, fontSize:12, fontWeight:600, color:'#475569', flexShrink:0 }}>
            <RefreshCw size={13} style={{ animation: loading ? 'spin 1s linear infinite' : 'none' }}/> Atualizar
          </button>
        </div>

        {/* ── Seletor de obra ── */}
        {obras.length > 1 && (
          <div style={{ marginBottom:12 }}>
            <select value={obraId} onChange={e => { setObraId(e.target.value); setBusca('') }}
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

        {/* ── Barra de busca + contador ── */}
        {!loading && items.length > 0 && (
          <>
            {/* Busca */}
            <div style={{ position:'relative', marginBottom:12 }}>
              <Search size={14} style={{ position:'absolute', left:12, top:'50%', transform:'translateY(-50%)', color:'#94a3b8', pointerEvents:'none' }}/>
              <input
                type="text"
                placeholder="Buscar serviço, categoria ou unidade…"
                value={busca}
                onChange={e => setBusca(e.target.value)}
                style={{ width:'100%', height:40, border:'1.5px solid #e2e8f0', borderRadius:10, padding:'0 36px 0 34px', fontSize:13, background:'#fff', boxSizing:'border-box', outline:'none' }}
              />
              {busca && (
                <button onClick={() => setBusca('')} style={{ position:'absolute', right:10, top:'50%', transform:'translateY(-50%)', background:'none', border:'none', cursor:'pointer', color:'#94a3b8', padding:4 }}>
                  <X size={14}/>
                </button>
              )}
            </div>

            {/* Contadores */}
            <div style={{ display:'flex', gap:8, marginBottom:14, flexWrap:'wrap' }}>
              <div style={{ background:'#eff6ff', border:'1px solid #bfdbfe', borderRadius:8, padding:'5px 12px', fontSize:11, fontWeight:700, color:'#1d4ed8', display:'flex', alignItems:'center', gap:5 }}>
                <Package size={12}/>
                {buscaNorm
                  ? `${itensFiltrados.length} de ${items.length} serviço${items.length !== 1 ? 's' : ''}`
                  : `${items.length} serviço${items.length !== 1 ? 's' : ''}`}
              </div>
              {!buscaNorm && (
                <div style={{ background:'#f0fdf4', border:'1px solid #bbf7d0', borderRadius:8, padding:'5px 12px', fontSize:11, fontWeight:700, color:'#15803d', display:'flex', alignItems:'center', gap:5 }}>
                  <Tag size={12}/> {allCatKeys.length} categoria{allCatKeys.length !== 1 ? 's' : ''}
                </div>
              )}
              {/* Indica se há itens específicos da obra */}
              {items.some(i => i.obra_id === obraId) && (
                <div style={{ background:'#fefce8', border:'1px solid #fde68a', borderRadius:8, padding:'5px 12px', fontSize:11, fontWeight:700, color:'#92400e', display:'flex', alignItems:'center', gap:5 }}>
                  🏗️ {items.filter(i => i.obra_id === obraId).length} personalizado{items.filter(i => i.obra_id === obraId).length !== 1 ? 's' : ''}
                </div>
              )}
            </div>
          </>
        )}

        {/* ── Sem resultado na busca ── */}
        {!loading && buscaNorm && itensFiltrados.length === 0 && (
          <div style={{ textAlign:'center', padding:'32px 24px', background:'#fff', borderRadius:12, border:'1.5px dashed #e2e8f0' }}>
            <Search size={28} color="#cbd5e1" style={{ marginBottom:8 }}/>
            <div style={{ fontSize:14, fontWeight:700, color:'#64748b' }}>Nenhum resultado para "{busca}"</div>
            <button onClick={() => setBusca('')} style={{ marginTop:10, fontSize:12, color:'#3b82f6', background:'none', border:'none', cursor:'pointer', fontWeight:600 }}>
              Limpar busca
            </button>
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
                  <div style={{ display:'grid', gridTemplateColumns:'1fr 70px 90px', padding:'6px 16px', background:'#f8fafc', borderBottom:'1px solid #f1f5f9' }}>
                    <span style={{ fontSize:9, fontWeight:700, color:'#94a3b8', textTransform:'uppercase', letterSpacing:'0.05em' }}>Serviço</span>
                    <span style={{ fontSize:9, fontWeight:700, color:'#94a3b8', textTransform:'uppercase', letterSpacing:'0.05em', textAlign:'center' }}>Unid.</span>
                    <span style={{ fontSize:9, fontWeight:700, color:'#94a3b8', textTransform:'uppercase', letterSpacing:'0.05em', textAlign:'right' }}>Preço Unit.</span>
                  </div>

                  {itens.map((item, idx) => {
                    const preco = fmtBRL(item.preco_unitario)
                    const isEspecifico = item.obra_id === obraId
                    return (
                      <div key={item.id} style={{
                        display:'grid', gridTemplateColumns:'1fr 70px 90px',
                        padding:'10px 16px', alignItems:'center',
                        background: idx % 2 === 0 ? '#fff' : '#fafafa',
                        borderBottom: idx < itens.length - 1 ? '1px solid #f1f5f9' : 'none',
                        borderLeft: isEspecifico ? `3px solid ${cor}` : '3px solid transparent',
                      }}>
                        {/* Nome */}
                        <div style={{ display:'flex', alignItems:'center', gap:6, flexWrap:'wrap' }}>
                          <div style={{ width:6, height:6, borderRadius:'50%', background:cor, flexShrink:0 }}/>
                          <span style={{ fontSize:13, fontWeight:600, color:'#1e293b' }}>{item.descricao}</span>
                          {badgeOrigem(item)}
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

        {/* Legenda */}
        {!loading && items.length > 0 && (
          <div style={{ marginTop:8, padding:'10px 14px', background:'#f8fafc', borderRadius:10, border:'1px solid #e2e8f0', display:'flex', gap:16, flexWrap:'wrap' }}>
            <div style={{ display:'flex', alignItems:'center', gap:6, fontSize:11, color:'#64748b' }}>
              <div style={{ width:3, height:14, background:'#3b82f6', borderRadius:2 }}/>
              Personalizado desta obra
            </div>
            <div style={{ display:'flex', alignItems:'center', gap:6, fontSize:11, color:'#64748b' }}>
              <span style={{ fontSize:10, padding:'1px 5px', borderRadius:4, background:'#e0f2fe', color:'#0369a1', fontWeight:700 }}>PADRÃO</span>
              Item global do sistema
            </div>
          </div>
        )}
      </div>

      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
      `}</style>
    </PortalLayout>
  )
}
