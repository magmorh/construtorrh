import React, { useEffect, useState, useCallback, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '@/lib/supabase'
import { getPortalSession } from '@/hooks/usePortalAuth'
import PortalLayout from './PortalLayout'
import { BookOpen, ChevronDown, ChevronUp, Tag, Search, AlertCircle } from 'lucide-react'

interface Atividade {
  id: string
  descricao: string
  unidade: string
  categoria: string | null
  codigo: string | null
}

interface Preco {
  atividade_id: string
  preco_unitario: number
}

interface ObraOption { id: string; nome: string }

function fmtBRL(v: number | null | undefined) {
  if (!v) return null
  return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

export default function PortalPlaybook() {
  const nav     = useNavigate()
  const session = useMemo(() => getPortalSession(), [])

  const [obras,     setObras]     = useState<ObraOption[]>([])
  const [obraId,    setObraId]    = useState('')
  const [ativs,     setAtivs]     = useState<Atividade[]>([])
  const [precos,    setPrecos]    = useState<Preco[]>([])
  const [loading,   setLoading]   = useState(false)
  const [erro,      setErro]      = useState<string | null>(null)
  const [catAberta, setCatAberta] = useState<Set<string>>(new Set())
  const [busca,     setBusca]     = useState('')

  // Mapa rápido atividade_id → preco
  const precosMap = useMemo(() => {
    const m = new Map<string, number>()
    precos.forEach(p => m.set(p.atividade_id, p.preco_unitario))
    return m
  }, [precos])

  // ── Carregar obras vinculadas ──────────────────────────────────────────────
  const fetchObras = useCallback(async () => {
    if (!session) { nav('/portal'); return }
    const ids = session.obras_ids ?? []
    if (!ids.length) { setErro('Nenhuma obra vinculada.'); return }
    const { data } = await supabase.from('obras').select('id,nome').in('id', ids).order('nome')
    if (data?.length) {
      setObras(data)
      setObraId(prev => prev || data[0].id)
    }
  }, [session, nav])

  // ── Carregar atividades + preços da obra ──────────────────────────────────
  const fetchPlaybook = useCallback(async () => {
    if (!obraId) return
    setLoading(true); setErro(null)
    const [{ data: ativData, error: e1 }, { data: precoData, error: e2 }] = await Promise.all([
      supabase.from('playbook_atividades')
        .select('id,descricao,unidade,categoria,codigo')
        .eq('ativo', true)
        .order('categoria', { nullsFirst: false })
        .order('descricao'),
      supabase.from('playbook_precos')
        .select('atividade_id, preco_unitario')
        .eq('obra_id', obraId)
        .eq('ativo', true),
    ])
    if (e1) { setErro('Erro ao carregar atividades: ' + e1.message); setLoading(false); return }
    setAtivs(ativData ?? [])
    setPrecos(precoData ?? [])
    // Abre todas as categorias por padrão
    const cats = new Set<string>((ativData ?? []).map((a: any) => a.categoria ?? 'Outros'))
    setCatAberta(cats)
    setLoading(false)
  }, [obraId])

  useEffect(() => { fetchObras() }, [fetchObras])
  useEffect(() => { fetchPlaybook() }, [fetchPlaybook])

  // ── Filtrar + agrupar ─────────────────────────────────────────────────────
  const atvsVisiveis = useMemo(() => {
    const q = busca.toLowerCase()
    return ativs.filter(a => !q || a.descricao.toLowerCase().includes(q) || (a.codigo ?? '').toLowerCase().includes(q))
  }, [ativs, busca])

  const porCategoria = useMemo(() => {
    const m = new Map<string, Atividade[]>()
    atvsVisiveis.forEach(a => {
      const c = a.categoria ?? 'Outros'
      if (!m.has(c)) m.set(c, [])
      m.get(c)!.push(a)
    })
    return Array.from(m.entries()).sort(([a], [b]) => a.localeCompare(b))
  }, [atvsVisiveis])

  function toggleCat(cat: string) {
    setCatAberta(prev => {
      const n = new Set(prev)
      n.has(cat) ? n.delete(cat) : n.add(cat)
      return n
    })
  }

  const obraNome = obras.find(o => o.id === obraId)?.nome ?? ''
  const comPreco = ativs.filter(a => precosMap.has(a.id)).length

  if (!session) return null

  return (
    <PortalLayout>
      <div style={{ padding: '0 0 80px' }}>
        {/* Header */}
        <div style={{ padding: '16px 14px 0' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
            <div style={{ width: 36, height: 36, borderRadius: 10, background: 'linear-gradient(135deg,#059669,#0d9488)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <BookOpen size={18} color="#fff" />
            </div>
            <div>
              <h1 style={{ fontWeight: 800, fontSize: 18, margin: 0, color: '#0f172a' }}>Playbook</h1>
              <p style={{ fontSize: 11, color: '#64748b', margin: 0 }}>Tabela de serviços e preços</p>
            </div>
          </div>

          {/* Seletor de obra */}
          {obras.length > 1 && (
            <select value={obraId} onChange={e => setObraId(e.target.value)}
              style={{ width: '100%', border: '1px solid #e2e8f0', borderRadius: 10, padding: '9px 12px', fontSize: 14, marginBottom: 10, background: '#fff' }}>
              {obras.map(o => <option key={o.id} value={o.id}>{o.nome}</option>)}
            </select>
          )}

          {/* Resumo */}
          {!loading && !erro && (
            <div style={{ display: 'flex', gap: 8, marginBottom: 10, flexWrap: 'wrap' }}>
              <div style={{ flex: 1, background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: 9, padding: '7px 12px', textAlign: 'center' }}>
                <div style={{ fontSize: 18, fontWeight: 800, color: '#15803d' }}>{ativs.length}</div>
                <div style={{ fontSize: 10, color: '#16a34a', fontWeight: 600 }}>Atividades</div>
              </div>
              <div style={{ flex: 1, background: '#fffbeb', border: '1px solid #fde68a', borderRadius: 9, padding: '7px 12px', textAlign: 'center' }}>
                <div style={{ fontSize: 18, fontWeight: 800, color: '#b45309' }}>{comPreco}</div>
                <div style={{ fontSize: 10, color: '#b45309', fontWeight: 600 }}>Com Preço</div>
              </div>
              <div style={{ flex: 1, background: '#f5f3ff', border: '1px solid #ddd6fe', borderRadius: 9, padding: '7px 12px', textAlign: 'center' }}>
                <div style={{ fontSize: 18, fontWeight: 800, color: '#7c3aed' }}>{porCategoria.length}</div>
                <div style={{ fontSize: 10, color: '#7c3aed', fontWeight: 600 }}>Categorias</div>
              </div>
            </div>
          )}

          {/* Busca */}
          <div style={{ position: 'relative', marginBottom: 12 }}>
            <Search size={14} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: '#94a3b8' }} />
            <input
              value={busca} onChange={e => setBusca(e.target.value)}
              placeholder="Buscar serviço ou código…"
              style={{ width: '100%', border: '1px solid #e2e8f0', borderRadius: 10, padding: '9px 10px 9px 32px', fontSize: 14, boxSizing: 'border-box' }}
            />
          </div>
        </div>

        {/* Conteúdo */}
        {loading ? (
          <div style={{ textAlign: 'center', padding: 40, color: '#94a3b8', fontSize: 13 }}>
            Carregando playbook de <strong>{obraNome}</strong>…
          </div>
        ) : erro ? (
          <div style={{ margin: '0 14px', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 12, padding: 20, display: 'flex', gap: 10, alignItems: 'flex-start' }}>
            <AlertCircle size={18} color="#dc2626" style={{ flexShrink: 0, marginTop: 2 }} />
            <div>
              <div style={{ fontWeight: 700, color: '#dc2626', marginBottom: 4 }}>Erro ao carregar</div>
              <div style={{ fontSize: 13, color: '#991b1b' }}>{erro}</div>
            </div>
          </div>
        ) : ativs.length === 0 ? (
          <div style={{ margin: '0 14px', background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 12, padding: 40, textAlign: 'center', color: '#94a3b8' }}>
            <BookOpen size={36} style={{ opacity: .25, margin: '0 auto 10px' }} />
            <div style={{ fontWeight: 600 }}>Nenhum serviço cadastrado</div>
            <div style={{ fontSize: 12, marginTop: 4 }}>Peça ao administrador para cadastrar as atividades padrão.</div>
          </div>
        ) : (
          <div style={{ padding: '0 14px' }}>
            {porCategoria.map(([cat, itens]) => {
              const aberta = catAberta.has(cat)
              return (
                <div key={cat} style={{ marginBottom: 10, border: '1px solid #e2e8f0', borderRadius: 12, overflow: 'hidden' }}>
                  {/* Header categoria */}
                  <button
                    onClick={() => toggleCat(cat)}
                    style={{
                      width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                      padding: '10px 14px', background: '#f8fafc', border: 'none', cursor: 'pointer', textAlign: 'left',
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <Tag size={13} color="#2563eb" />
                      <span style={{ fontWeight: 800, fontSize: 13, color: '#1e293b', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{cat}</span>
                      <span style={{ fontSize: 11, background: '#e0f2fe', color: '#0369a1', borderRadius: 20, padding: '1px 7px', fontWeight: 700 }}>{itens.length}</span>
                    </div>
                    {aberta ? <ChevronUp size={15} color="#64748b" /> : <ChevronDown size={15} color="#64748b" />}
                  </button>

                  {/* Itens */}
                  {aberta && itens.map((a, i) => {
                    const preco = precosMap.get(a.id)
                    return (
                      <div key={a.id} style={{
                        display: 'flex', alignItems: 'center', gap: 10,
                        padding: '11px 14px',
                        borderTop: '1px solid #f1f5f9',
                        background: i % 2 === 0 ? '#fff' : '#fafafa',
                      }}>
                        {/* Código */}
                        {a.codigo && (
                          <span style={{ fontSize: 10, fontFamily: 'monospace', fontWeight: 700, background: '#f1f5f9', borderRadius: 4, padding: '2px 5px', flexShrink: 0, color: '#475569' }}>
                            {a.codigo}
                          </span>
                        )}

                        {/* Descrição */}
                        <div style={{ flex: 1 }}>
                          <div style={{ fontWeight: 600, fontSize: 14, color: '#1e293b' }}>{a.descricao}</div>
                          <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 1 }}>por {a.unidade}</div>
                        </div>

                        {/* Preço */}
                        <div style={{ textAlign: 'right', flexShrink: 0 }}>
                          {preco != null ? (
                            <span style={{ fontWeight: 800, fontSize: 15, color: '#15803d' }}>
                              {fmtBRL(preco)}
                            </span>
                          ) : (
                            <span style={{ fontSize: 11, color: '#94a3b8', fontStyle: 'italic' }}>A consultar</span>
                          )}
                        </div>
                      </div>
                    )
                  })}
                </div>
              )
            })}

            {/* Rodapé */}
            {comPreco > 0 && (
              <div style={{ marginTop: 8, padding: '10px 14px', background: '#f0fdf4', borderRadius: 10, border: '1px solid #bbf7d0', textAlign: 'center', fontSize: 12, color: '#15803d', fontWeight: 600 }}>
                📋 {comPreco} serviço(s) com preços definidos para <strong>{obraNome}</strong>
              </div>
            )}
          </div>
        )}
      </div>
    </PortalLayout>
  )
}
