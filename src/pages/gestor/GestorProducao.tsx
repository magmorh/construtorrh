import React, { useEffect, useState, useCallback, useMemo } from 'react'
import { supabase } from '@/lib/supabase'
import GestorLayout from './GestorLayout'
import { BarChart3, Loader2 } from 'lucide-react'

interface ProducaoRow {
  id: string; data: string; obra_id: string; obra_nome: string
  colaborador_id: string; colaborador_nome: string; funcao: string
  servico: string; quantidade: number; unidade: string
  tipo_contrato: string; valor_unit: number; valor_total: number
}

export default function GestorProducao() {
  const hoje = new Date().toISOString().slice(0, 10)
  const mesInicio = hoje.slice(0, 8) + '01'

  const [loading, setLoading] = useState(true)
  const [rows, setRows] = useState<ProducaoRow[]>([])
  const [obras, setObras] = useState<{ id: string; nome: string }[]>([])
  const [obraFiltro, setObraFiltro] = useState('todas')
  const [dtIni, setDtIni] = useState(mesInicio)
  const [dtFim, setDtFim] = useState(hoje)
  const [agrupar, setAgrupar] = useState<'servico' | 'colaborador' | 'obra' | 'funcao'>('servico')
  const [fonte, setFonte] = useState<'lancamentos' | 'portal'>('lancamentos')

  const fetchData = useCallback(async () => {
    setLoading(true)
    try {
      let combinado: ProducaoRow[] = []

      // ── Fonte 1: ponto_producao (vinculado a ponto_lancamentos – folha fechada) ──
      if (fonte === 'lancamentos' || fonte === 'portal') {
        const { data: pp } = await supabase
          .from('ponto_producao')
          .select(`
            id, data, obra_id, colaborador_id, quantidade, valor_unit, valor_total,
            playbook_item_id, observacoes,
            obras(nome),
            colaboradores(nome, tipo_contrato, funcoes(nome)),
            playbook_itens(descricao, unidade),
            playbook_atividades:playbook_item_id(descricao, unidade)
          `)
          .gte('data', dtIni)
          .lte('data', dtFim)
          .order('data', { ascending: false })

        for (const r of pp ?? []) {
          const ra = r as any
          const descricao = ra.playbook_itens?.descricao
            ?? ra.playbook_atividades?.descricao
            ?? 'Produção'
          const unidade = ra.playbook_itens?.unidade
            ?? ra.playbook_atividades?.unidade
            ?? 'un'
          combinado.push({
            id: ra.id,
            data: ra.data,
            obra_id: ra.obra_id,
            obra_nome: ra.obras?.nome ?? '—',
            colaborador_id: ra.colaborador_id,
            colaborador_nome: ra.colaboradores?.nome ?? '—',
            funcao: ra.colaboradores?.funcoes?.nome ?? '—',
            servico: descricao,
            quantidade: ra.quantidade ?? 0,
            unidade,
            tipo_contrato: ra.colaboradores?.tipo_contrato ?? 'clt',
            valor_unit: ra.valor_unit ?? 0,
            valor_total: ra.valor_total ?? 0,
          })
        }
      }

      // ── Fonte 2: portal_producao (lançamentos diretos pelo portal) ──
      if (fonte === 'portal' || fonte === 'lancamentos') {
        const { data: pp2 } = await supabase
          .from('portal_producao')
          .select(`
            id, data, obra_id, colaborador_id, quantidade, unidade, servico_descricao,
            obras(nome),
            colaboradores(nome, tipo_contrato, funcoes(nome))
          `)
          .gte('data', dtIni)
          .lte('data', dtFim)
          .not('quantidade', 'is', null)
          .order('data', { ascending: false })

        for (const r of pp2 ?? []) {
          const ra = r as any
          if (!ra.quantidade) continue
          combinado.push({
            id: 'pp2_' + ra.id,
            data: ra.data,
            obra_id: ra.obra_id,
            obra_nome: ra.obras?.nome ?? '—',
            colaborador_id: ra.colaborador_id,
            colaborador_nome: ra.colaboradores?.nome ?? '—',
            funcao: ra.colaboradores?.funcoes?.nome ?? '—',
            servico: ra.servico_descricao ?? '—',
            quantidade: ra.quantidade ?? 0,
            unidade: ra.unidade ?? 'un',
            tipo_contrato: ra.colaboradores?.tipo_contrato ?? 'clt',
            valor_unit: 0,
            valor_total: 0,
          })
        }
      }

      const [{ data: obrasData }] = await Promise.all([
        supabase.from('obras').select('id, nome').neq('status', 'concluida').order('nome'),
      ])
      setObras(obrasData ?? [])
      setRows(combinado)
    } finally {
      setLoading(false)
    }
  }, [dtIni, dtFim, fonte])

  useEffect(() => { fetchData() }, [fetchData])

  const rowsFiltrados = useMemo(() => {
    if (obraFiltro === 'todas') return rows
    return rows.filter(r => r.obra_id === obraFiltro)
  }, [rows, obraFiltro])

  const totaisPorServico = useMemo(() => {
    const m = new Map<string, { qtd: number; unidade: string; obras: Set<string>; cols: Set<string>; valor: number }>()
    rowsFiltrados.forEach(r => {
      const key = r.servico
      if (!m.has(key)) m.set(key, { qtd: 0, unidade: r.unidade, obras: new Set(), cols: new Set(), valor: 0 })
      const v = m.get(key)!
      v.qtd += r.quantidade
      v.valor += r.valor_total
      v.obras.add(r.obra_nome)
      v.cols.add(r.colaborador_nome)
    })
    return Array.from(m.entries())
      .map(([srv, v]) => ({ servico: srv, qtd: v.qtd, unidade: v.unidade, obras: v.obras.size, colaboradores: v.cols.size, valor: v.valor }))
      .sort((a, b) => b.qtd - a.qtd)
  }, [rowsFiltrados])

  const totaisPorColaborador = useMemo(() => {
    const m = new Map<string, { nome: string; funcao: string; qtd: number; tipo: string; servicos: Set<string>; valor: number }>()
    rowsFiltrados.forEach(r => {
      if (!m.has(r.colaborador_id)) m.set(r.colaborador_id, { nome: r.colaborador_nome, funcao: r.funcao, qtd: 0, tipo: r.tipo_contrato, servicos: new Set(), valor: 0 })
      const v = m.get(r.colaborador_id)!
      v.qtd += r.quantidade
      v.valor += r.valor_total
      v.servicos.add(r.servico)
    })
    return Array.from(m.values()).sort((a, b) => b.qtd - a.qtd)
  }, [rowsFiltrados])

  const totaisPorObra = useMemo(() => {
    const m = new Map<string, { nome: string; qtd: number; cols: Set<string>; valor: number }>()
    rowsFiltrados.forEach(r => {
      if (!m.has(r.obra_id)) m.set(r.obra_id, { nome: r.obra_nome, qtd: 0, cols: new Set(), valor: 0 })
      const v = m.get(r.obra_id)!
      v.qtd += r.quantidade
      v.valor += r.valor_total
      v.cols.add(r.colaborador_id)
    })
    return Array.from(m.values()).sort((a, b) => b.qtd - a.qtd)
  }, [rowsFiltrados])

  const fmtBRL = (v: number) => v > 0 ? v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }) : '—'

  const totalGeral = rowsFiltrados.reduce((s, r) => s + r.quantidade, 0)
  const totalValor = rowsFiltrados.reduce((s, r) => s + r.valor_total, 0)
  const maxQtd = Math.max(...totaisPorServico.map(s => s.qtd), 1)

  return (
    <GestorLayout>
      <div style={{ marginBottom: 20 }}>
        <h1 style={{ fontSize: 22, fontWeight: 800, margin: 0, color: '#0f172a', display: 'flex', alignItems: 'center', gap: 8 }}>
          <BarChart3 size={22} color="#b45309" /> Controle de Produção
        </h1>
        <p style={{ color: '#64748b', fontSize: 13, margin: '4px 0 0' }}>Metragens e serviços produzidos por obra e colaborador</p>
      </div>

      {/* KPI Total */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: 12, marginBottom: 20 }}>
        <div style={{ background: 'linear-gradient(135deg, #b45309, #92400e)', borderRadius: 14, padding: 18, color: '#fff' }}>
          <div style={{ fontSize: 11, opacity: 0.75, fontWeight: 600 }}>TOTAL PRODUZIDO</div>
          <div style={{ fontSize: 32, fontWeight: 800, marginTop: 4 }}>{totalGeral.toLocaleString('pt-BR')}</div>
          <div style={{ fontSize: 11, opacity: 0.7, marginTop: 2 }}>unidades / m²</div>
        </div>
        {totalValor > 0 && (
          <div style={{ background: 'linear-gradient(135deg, #15803d, #166534)', borderRadius: 14, padding: 18, color: '#fff' }}>
            <div style={{ fontSize: 11, opacity: 0.75, fontWeight: 600 }}>VALOR TOTAL</div>
            <div style={{ fontSize: 22, fontWeight: 800, marginTop: 4 }}>{fmtBRL(totalValor)}</div>
            <div style={{ fontSize: 11, opacity: 0.7, marginTop: 2 }}>baseado em preços</div>
          </div>
        )}
        <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 14, padding: 18 }}>
          <div style={{ fontSize: 11, color: '#64748b', fontWeight: 600 }}>SERVIÇOS</div>
          <div style={{ fontSize: 28, fontWeight: 800, color: '#7c3aed' }}>{totaisPorServico.length}</div>
          <div style={{ fontSize: 11, color: '#94a3b8' }}>tipos distintos</div>
        </div>
        <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 14, padding: 18 }}>
          <div style={{ fontSize: 11, color: '#64748b', fontWeight: 600 }}>COLABORADORES</div>
          <div style={{ fontSize: 28, fontWeight: 800, color: '#2563eb' }}>{totaisPorColaborador.length}</div>
          <div style={{ fontSize: 11, color: '#94a3b8' }}>com lançamentos</div>
        </div>
        <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 14, padding: 18 }}>
          <div style={{ fontSize: 11, color: '#64748b', fontWeight: 600 }}>OBRAS</div>
          <div style={{ fontSize: 28, fontWeight: 800, color: '#16a34a' }}>{totaisPorObra.length}</div>
          <div style={{ fontSize: 11, color: '#94a3b8' }}>com produção</div>
        </div>
      </div>

      {/* Filtros */}
      <div style={{ background: '#fff', borderRadius: 12, border: '1px solid #e2e8f0', padding: '12px 16px', marginBottom: 16, display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <label style={{ fontSize: 12, fontWeight: 600, color: '#64748b' }}>De</label>
          <input type="date" value={dtIni} onChange={e => setDtIni(e.target.value)}
            style={{ border: '1px solid #e2e8f0', borderRadius: 8, padding: '5px 8px', fontSize: 13 }} />
          <label style={{ fontSize: 12, fontWeight: 600, color: '#64748b' }}>até</label>
          <input type="date" value={dtFim} onChange={e => setDtFim(e.target.value)}
            style={{ border: '1px solid #e2e8f0', borderRadius: 8, padding: '5px 8px', fontSize: 13 }} />
        </div>
        {/* Atalhos de período */}
        <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
          {[
            { l: 'Hoje', f: () => { setDtIni(hoje); setDtFim(hoje) } },
            { l: 'Semana', f: () => { const d = new Date(); const ini = new Date(d); ini.setDate(d.getDate() - d.getDay() + 1); setDtIni(ini.toISOString().split('T')[0]); setDtFim(hoje) } },
            { l: 'Mês', f: () => { setDtIni(mesInicio); setDtFim(hoje) } },
            { l: '3 Meses', f: () => { const d = new Date(); d.setMonth(d.getMonth() - 2); setDtIni(`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-01`); setDtFim(hoje) } },
          ].map(b => (
            <button key={b.l} onClick={b.f}
              style={{ padding: '4px 10px', borderRadius: 6, border: '1px solid #e2e8f0', background: '#f8fafc', fontSize: 11, fontWeight: 600, cursor: 'pointer', color: '#475569' }}>
              {b.l}
            </button>
          ))}
        </div>
        <select value={obraFiltro} onChange={e => setObraFiltro(e.target.value)}
          style={{ border: '1px solid #e2e8f0', borderRadius: 8, padding: '6px 10px', fontSize: 13, background: '#fff' }}>
          <option value="todas">🏗️ Todas as obras</option>
          {obras.map(o => <option key={o.id} value={o.id}>{o.nome}</option>)}
        </select>
        <div style={{ display: 'flex', border: '1px solid #e2e8f0', borderRadius: 8, overflow: 'hidden', marginLeft: 'auto' }}>
          {(['servico', 'colaborador', 'obra', 'funcao'] as const).map(g => (
            <button key={g} onClick={() => setAgrupar(g)} style={{
              padding: '6px 12px', border: 'none', cursor: 'pointer', fontWeight: 600, fontSize: 11,
              background: agrupar === g ? '#b45309' : '#fff', color: agrupar === g ? '#fff' : '#64748b',
            }}>
              {g === 'servico' ? '📦 Serviço' : g === 'colaborador' ? '👤 Colaborador' : g === 'obra' ? '🏗️ Obra' : '🏷️ Função'}
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <div style={{ display: 'flex', justifyContent: 'center', padding: 48 }}>
          <Loader2 size={28} color="#b45309" style={{ animation: 'spin 1s linear infinite' }} />
        </div>
      ) : rowsFiltrados.length === 0 ? (
        <div style={{ background: '#fff', borderRadius: 12, border: '1px solid #e2e8f0', padding: 48, textAlign: 'center', color: '#94a3b8' }}>
          <div style={{ fontSize: 40, marginBottom: 8 }}>📦</div>
          <div style={{ fontWeight: 700, fontSize: 15 }}>Nenhuma produção no período</div>
          <div style={{ fontSize: 13, marginTop: 4 }}>Verifique o intervalo de datas ou selecione outra obra.</div>
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>

          {/* Gráfico por Serviço */}
          {agrupar === 'servico' && (
            <div style={{ gridColumn: '1 / -1', background: '#fff', borderRadius: 12, border: '1px solid #e2e8f0', padding: 18 }}>
              <div style={{ fontWeight: 800, fontSize: 15, marginBottom: 14, color: '#0f172a' }}>📦 Produção por Serviço</div>
              {totaisPorServico.map(s => (
                <div key={s.servico} style={{ marginBottom: 12 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                    <span style={{ fontSize: 13, fontWeight: 600, color: '#374151' }}>{s.servico}</span>
                    <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                      <span style={{ fontSize: 10, color: '#94a3b8' }}>{s.obras} obra(s) · {s.colaboradores} col.</span>
                      {s.valor > 0 && <span style={{ fontSize: 11, color: '#15803d', fontWeight: 600 }}>{fmtBRL(s.valor)}</span>}
                      <span style={{ fontWeight: 800, fontSize: 14, color: '#b45309' }}>{s.qtd.toLocaleString('pt-BR')} {s.unidade}</span>
                    </div>
                  </div>
                  <div style={{ height: 8, background: '#f1f5f9', borderRadius: 4, overflow: 'hidden' }}>
                    <div style={{ height: '100%', width: `${(s.qtd / maxQtd) * 100}%`, background: 'linear-gradient(90deg, #b45309, #f59e0b)', borderRadius: 4, transition: 'width 0.5s' }} />
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Por Colaborador */}
          {agrupar === 'colaborador' && (
            <div style={{ gridColumn: '1 / -1', background: '#fff', borderRadius: 12, border: '1px solid #e2e8f0', overflow: 'hidden' }}>
              <div style={{ padding: '14px 18px', fontWeight: 800, fontSize: 15, color: '#0f172a', borderBottom: '1px solid #e2e8f0' }}>👤 Produção por Colaborador</div>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                <thead>
                  <tr style={{ background: '#f8fafc' }}>
                    <th style={{ padding: '8px 14px', textAlign: 'left', fontWeight: 700, color: '#374151' }}>Colaborador</th>
                    <th style={{ padding: '8px 14px', textAlign: 'left', fontWeight: 700, color: '#374151' }}>Função</th>
                    <th style={{ padding: '8px 14px', textAlign: 'center', fontWeight: 700, color: '#374151' }}>Serviços</th>
                    <th style={{ padding: '8px 14px', textAlign: 'right', fontWeight: 700, color: '#374151' }}>Total Produzido</th>
                    <th style={{ padding: '8px 14px', textAlign: 'right', fontWeight: 700, color: '#374151' }}>Valor</th>
                  </tr>
                </thead>
                <tbody>
                  {totaisPorColaborador.length === 0 ? (
                    <tr><td colSpan={5} style={{ textAlign: 'center', padding: 24, color: '#94a3b8' }}>Nenhum dado</td></tr>
                  ) : totaisPorColaborador.map((c, i) => (
                    <tr key={c.nome} style={{ borderTop: '1px solid #f1f5f9', background: i % 2 === 0 ? '#fff' : '#fafafa' }}>
                      <td style={{ padding: '10px 14px', fontWeight: 600 }}>
                        <div>{c.nome}</div>
                        <div style={{ fontSize: 10, color: '#94a3b8' }}>{c.tipo === 'clt' ? 'CLT' : 'Autôn.'}</div>
                      </td>
                      <td style={{ padding: '10px 14px', color: '#64748b' }}>{c.funcao}</td>
                      <td style={{ padding: '10px 14px', textAlign: 'center', color: '#7c3aed', fontWeight: 700 }}>{c.servicos.size}</td>
                      <td style={{ padding: '10px 14px', textAlign: 'right', fontWeight: 800, color: '#b45309', fontSize: 14 }}>{c.qtd.toLocaleString('pt-BR')}</td>
                      <td style={{ padding: '10px 14px', textAlign: 'right', color: '#15803d', fontWeight: 600, fontSize: 12 }}>{fmtBRL(c.valor)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* Por Obra */}
          {agrupar === 'obra' && (
            <div style={{ gridColumn: '1 / -1', background: '#fff', borderRadius: 12, border: '1px solid #e2e8f0', padding: 18 }}>
              <div style={{ fontWeight: 800, fontSize: 15, marginBottom: 14, color: '#0f172a' }}>🏗️ Produção por Obra</div>
              {totaisPorObra.map((o, i) => {
                const pct = totalGeral > 0 ? (o.qtd / totalGeral) * 100 : 0
                const colors = ['#2563eb', '#16a34a', '#b45309', '#7c3aed', '#0891b2']
                const cor = colors[i % colors.length]
                return (
                  <div key={o.nome} style={{ marginBottom: 14 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                      <span style={{ fontWeight: 700, color: '#374151' }}>{o.nome}</span>
                      <div style={{ display: 'flex', gap: 12, fontSize: 12 }}>
                        <span style={{ color: '#64748b' }}>{o.cols.size} col.</span>
                        {o.valor > 0 && <span style={{ color: '#15803d', fontWeight: 600 }}>{fmtBRL(o.valor)}</span>}
                        <span style={{ fontWeight: 800, color: cor }}>{o.qtd.toLocaleString('pt-BR')} ({pct.toFixed(0)}%)</span>
                      </div>
                    </div>
                    <div style={{ height: 10, background: '#f1f5f9', borderRadius: 5, overflow: 'hidden' }}>
                      <div style={{ height: '100%', width: `${pct}%`, background: cor, borderRadius: 5, transition: 'width 0.5s' }} />
                    </div>
                  </div>
                )
              })}
            </div>
          )}

          {/* Tabela detalhada */}
          <div style={{ gridColumn: '1 / -1', background: '#fff', borderRadius: 12, border: '1px solid #e2e8f0', overflow: 'hidden' }}>
            <div style={{ padding: '14px 18px', fontWeight: 800, fontSize: 15, color: '#0f172a', borderBottom: '1px solid #e2e8f0' }}>
              📋 Lançamentos Detalhados
            </div>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                <thead>
                  <tr style={{ background: '#f8fafc' }}>
                    <th style={{ padding: '8px 12px', textAlign: 'left', fontWeight: 700, color: '#374151' }}>Data</th>
                    <th style={{ padding: '8px 12px', textAlign: 'left', fontWeight: 700, color: '#374151' }}>Obra</th>
                    <th style={{ padding: '8px 12px', textAlign: 'left', fontWeight: 700, color: '#374151' }}>Colaborador</th>
                    <th style={{ padding: '8px 12px', textAlign: 'left', fontWeight: 700, color: '#374151' }}>Serviço</th>
                    <th style={{ padding: '8px 12px', textAlign: 'right', fontWeight: 700, color: '#374151' }}>Qtd.</th>
                    <th style={{ padding: '8px 12px', textAlign: 'right', fontWeight: 700, color: '#374151' }}>Valor</th>
                  </tr>
                </thead>
                <tbody>
                  {rowsFiltrados.slice(0, 100).map((r, i) => (
                    <tr key={r.id} style={{ borderTop: '1px solid #f1f5f9', background: i % 2 === 0 ? '#fff' : '#fafafa' }}>
                      <td style={{ padding: '8px 12px', color: '#64748b' }}>{new Date(r.data + 'T12:00').toLocaleDateString('pt-BR')}</td>
                      <td style={{ padding: '8px 12px', fontWeight: 600 }}>{r.obra_nome}</td>
                      <td style={{ padding: '8px 12px' }}>
                        <div>{r.colaborador_nome}</div>
                        <div style={{ fontSize: 10, color: '#94a3b8' }}>{r.funcao}</div>
                      </td>
                      <td style={{ padding: '8px 12px', color: '#374151' }}>{r.servico}</td>
                      <td style={{ padding: '8px 12px', textAlign: 'right', fontWeight: 800, color: '#b45309' }}>{r.quantidade} {r.unidade}</td>
                      <td style={{ padding: '8px 12px', textAlign: 'right', color: '#15803d' }}>{fmtBRL(r.valor_total)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {rowsFiltrados.length > 100 && (
              <div style={{ padding: '10px 16px', borderTop: '1px solid #e2e8f0', fontSize: 11, color: '#94a3b8', textAlign: 'center' }}>
                Exibindo 100 de {rowsFiltrados.length} lançamentos
              </div>
            )}
          </div>
        </div>
      )}
    </GestorLayout>
  )
}
