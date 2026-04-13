import React, { useEffect, useState, useCallback, useMemo } from 'react'
import { supabase } from '@/lib/supabase'
import GestorLayout from './GestorLayout'
import { Loader2, Wrench } from 'lucide-react'

type Tipo   = 'locado' | 'proprio'
type Status = 'ativo' | 'devolvido' | 'baixa' | 'defeito'

interface Equip {
  id: string; obra_id: string; obra_nome: string; tipo: Tipo; nome: string
  descricao?: string; quantidade: number; fornecedor?: string
  data_inicio?: string; data_prevista?: string; data_devolucao?: string
  status: Status; observacoes?: string
}

const STATUS_CFG: Record<Status, { label: string; cor: string; bg: string; emoji: string }> = {
  ativo:     { label: 'Ativo',     cor: '#16a34a', bg: '#dcfce7', emoji: '✅' },
  devolvido: { label: 'Devolvido', cor: '#0369a1', bg: '#e0f2fe', emoji: '↩️' },
  baixa:     { label: 'Baixa',     cor: '#7c3aed', bg: '#f5f3ff', emoji: '🗑️' },
  defeito:   { label: 'Defeito',   cor: '#dc2626', bg: '#fee2e2', emoji: '⚠️' },
}

export default function GestorEquipamentos() {
  const [loading,     setLoading]     = useState(true)
  const [rows,        setRows]        = useState<Equip[]>([])
  const [obras,       setObras]       = useState<{ id: string; nome: string }[]>([])
  const [obraFiltro,  setObraFiltro]  = useState('todas')
  const [tipoFiltro,  setTipoFiltro]  = useState<'todos' | Tipo>('todos')
  const [statusFiltro,setStatusFiltro]= useState<'todos' | Status>('ativo')

  const fetchData = useCallback(async () => {
    setLoading(true)
    const [{ data: equipData }, { data: obrasData }] = await Promise.all([
      supabase.from('obra_equipamentos')
        .select('*, obras(nome)')
        .order('created_at', { ascending: false }),
      supabase.from('obras').select('id, nome').neq('status', 'concluida').order('nome'),
    ])
    setObras(obrasData ?? [])
    setRows((equipData ?? []).map((r: any) => ({
      ...r, obra_nome: r.obras?.nome ?? '—',
    })))
    setLoading(false)
  }, [])

  useEffect(() => { fetchData() }, [fetchData])

  async function marcarStatus(id: string, status: Status) {
    const payload: any = { status }
    if (status === 'devolvido') payload.data_devolucao = new Date().toISOString().slice(0, 10)
    await supabase.from('obra_equipamentos').update(payload).eq('id', id)
    fetchData()
  }

  const rowsFiltrados = useMemo(() => {
    let r = rows
    if (obraFiltro  !== 'todas') r = r.filter(x => x.obra_id  === obraFiltro)
    if (tipoFiltro  !== 'todos') r = r.filter(x => x.tipo     === tipoFiltro)
    if (statusFiltro !== 'todos') r = r.filter(x => x.status   === statusFiltro)
    return r
  }, [rows, obraFiltro, tipoFiltro, statusFiltro])

  // KPIs globais
  const totAtivos   = rows.filter(r => r.status === 'ativo').length
  const totLocados  = rows.filter(r => r.tipo === 'locado' && r.status === 'ativo').length
  const totProprios = rows.filter(r => r.tipo === 'proprio' && r.status === 'ativo').length
  const totVencidos = rows.filter(r => r.tipo === 'locado' && r.status === 'ativo' &&
    r.data_prevista && new Date(r.data_prevista) < new Date()).length

  return (
    <GestorLayout>
      <div style={{ marginBottom: 20, display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', flexWrap: 'wrap', gap: 10 }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 800, margin: '0 0 4px', color: '#0f172a', display: 'flex', alignItems: 'center', gap: 8 }}>
            🔧 Equipamentos & Ferramentas
          </h1>
          <p style={{ color: '#64748b', fontSize: 13, margin: 0 }}>Visão consolidada de todos os equipamentos e ferramentas nas obras</p>
        </div>
      </div>

      {/* KPIs */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(155px,1fr))', gap: 12, marginBottom: 20 }}>
        {[
          { emoji: '✅', label: 'Ativos Total',  val: totAtivos,   cor: '#16a34a', bg: '#dcfce7' },
          { emoji: '🚛', label: 'Locados Ativos', val: totLocados,  cor: '#0369a1', bg: '#e0f2fe' },
          { emoji: '🔧', label: 'Próprios Ativos',val: totProprios, cor: '#059669', bg: '#f0fdf4' },
          { emoji: '⏰', label: 'Locação Vencida', val: totVencidos, cor: '#dc2626', bg: '#fee2e2', alert: totVencidos > 0 },
        ].map(k => (
          <div key={k.label} style={{ background: '#fff', borderRadius: 12, border: `1px solid ${(k as any).alert ? '#fca5a5' : '#e2e8f0'}`, padding: '14px 16px', textAlign: 'center' }}>
            <div style={{ fontSize: 24, marginBottom: 4 }}>{k.emoji}</div>
            <div style={{ fontSize: 20, fontWeight: 800, color: k.cor }}>{k.val}</div>
            <div style={{ fontSize: 10, color: '#64748b', fontWeight: 600, marginTop: 2 }}>{k.label}</div>
          </div>
        ))}
      </div>

      {/* Filtros */}
      <div style={{ background: '#fff', borderRadius: 12, border: '1px solid #e2e8f0', padding: '12px 16px', marginBottom: 16, display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
        <select value={obraFiltro} onChange={e => setObraFiltro(e.target.value)}
          style={{ border: '1px solid #e2e8f0', borderRadius: 8, padding: '6px 10px', fontSize: 13, background: '#fff' }}>
          <option value="todas">🏗️ Todas as obras</option>
          {obras.map(o => <option key={o.id} value={o.id}>{o.nome}</option>)}
        </select>
        <select value={tipoFiltro} onChange={e => setTipoFiltro(e.target.value as any)}
          style={{ border: '1px solid #e2e8f0', borderRadius: 8, padding: '6px 10px', fontSize: 13, background: '#fff' }}>
          <option value="todos">📋 Todos os tipos</option>
          <option value="locado">🚛 Locados</option>
          <option value="proprio">🔧 Próprios</option>
        </select>
        <select value={statusFiltro} onChange={e => setStatusFiltro(e.target.value as any)}
          style={{ border: '1px solid #e2e8f0', borderRadius: 8, padding: '6px 10px', fontSize: 13, background: '#fff' }}>
          <option value="todos">📌 Todos os status</option>
          <option value="ativo">✅ Ativos</option>
          <option value="devolvido">↩️ Devolvidos</option>
          <option value="baixa">🗑️ Baixa</option>
          <option value="defeito">⚠️ Defeito</option>
        </select>
      </div>

      {/* Lista */}
      {loading ? (
        <div style={{ display: 'flex', justifyContent: 'center', padding: 48 }}>
          <Loader2 size={28} color="#0369a1" style={{ animation: 'spin 1s linear infinite' }} />
        </div>
      ) : rowsFiltrados.length === 0 ? (
        <div style={{ background: '#fff', borderRadius: 12, border: '1px solid #e2e8f0', padding: 40, textAlign: 'center', color: '#94a3b8' }}>
          <div style={{ fontSize: 40, marginBottom: 8 }}>🔧</div>
          <div style={{ fontSize: 14, fontWeight: 600 }}>Nenhum equipamento cadastrado</div>
          <div style={{ fontSize: 12, marginTop: 4 }}>Cadastre pelo Portal da Obra → Equipamentos</div>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {rowsFiltrados.map(r => {
            const sc = STATUS_CFG[r.status]
            const vencido = r.tipo === 'locado' && r.data_prevista && r.status === 'ativo' &&
              new Date(r.data_prevista) < new Date()
            return (
              <div key={r.id} style={{
                background: '#fff', borderRadius: 12,
                border: `1px solid ${vencido ? '#fca5a5' : '#e2e8f0'}`,
                borderLeft: `4px solid ${vencido ? '#dc2626' : r.tipo === 'locado' ? '#0369a1' : '#059669'}`,
                padding: '14px 16px',
              }}>
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
                  <div style={{ fontSize: 30, flexShrink: 0 }}>{r.tipo === 'locado' ? '🚛' : '🔧'}</div>
                  <div style={{ flex: 1 }}>
                    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', marginBottom: 5 }}>
                      <span style={{ fontWeight: 800, fontSize: 15, color: '#0f172a' }}>{r.nome}</span>
                      <span style={{ fontSize: 11, background: '#e0f2fe', color: '#0369a1', borderRadius: 5, padding: '1px 7px', fontWeight: 700 }}>{r.obra_nome}</span>
                      <span style={{ fontSize: 11, background: sc.bg, color: sc.cor, borderRadius: 5, padding: '1px 7px', fontWeight: 700 }}>{sc.emoji} {sc.label}</span>
                      {vencido && <span style={{ fontSize: 11, background: '#fee2e2', color: '#dc2626', borderRadius: 5, padding: '1px 7px', fontWeight: 700 }}>⏰ Locação Vencida</span>}
                    </div>
                    {r.descricao && <div style={{ fontSize: 12, color: '#64748b' }}>{r.descricao}</div>}
                    <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', fontSize: 12, color: '#64748b', marginTop: 5 }}>
                      <span>📦 Qtd: <strong>{r.quantidade}</strong></span>
                      {r.fornecedor && <span>🏢 {r.fornecedor}</span>}
                      {r.data_inicio && <span>📅 Início: {new Date(r.data_inicio + 'T12:00').toLocaleDateString('pt-BR')}</span>}
                      {r.tipo === 'locado' && r.data_prevista && (
                        <span style={{ color: vencido ? '#dc2626' : '#64748b', fontWeight: vencido ? 700 : 400 }}>
                          🗓️ Prev: {new Date(r.data_prevista + 'T12:00').toLocaleDateString('pt-BR')}
                        </span>
                      )}
                      {r.data_devolucao && <span style={{ color: '#0369a1' }}>✅ Devolvido: {new Date(r.data_devolucao + 'T12:00').toLocaleDateString('pt-BR')}</span>}
                    </div>
                    {r.observacoes && <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 4, fontStyle: 'italic' }}>"{r.observacoes}"</div>}
                  </div>
                  {/* Ação rápida */}
                  {r.status === 'ativo' && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 5, flexShrink: 0 }}>
                      {r.tipo === 'locado' && (
                        <button onClick={() => marcarStatus(r.id, 'devolvido')}
                          style={{ padding: '5px 10px', borderRadius: 7, border: '1px solid #bfdbfe', background: '#eff6ff', color: '#1d4ed8', fontWeight: 700, fontSize: 11, cursor: 'pointer', whiteSpace: 'nowrap' }}>
                          ↩️ Devolvido
                        </button>
                      )}
                      {r.tipo === 'proprio' && (
                        <button onClick={() => marcarStatus(r.id, 'baixa')}
                          style={{ padding: '5px 10px', borderRadius: 7, border: '1px solid #ddd6fe', background: '#f5f3ff', color: '#7c3aed', fontWeight: 700, fontSize: 11, cursor: 'pointer', whiteSpace: 'nowrap' }}>
                          🗑️ Baixa
                        </button>
                      )}
                      <button onClick={() => marcarStatus(r.id, 'defeito')}
                        style={{ padding: '5px 10px', borderRadius: 7, border: '1px solid #fecaca', background: '#fef2f2', color: '#dc2626', fontWeight: 700, fontSize: 11, cursor: 'pointer', whiteSpace: 'nowrap' }}>
                        ⚠️ Defeito
                      </button>
                    </div>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}
      <style>{`@keyframes spin{from{transform:rotate(0deg)}to{transform:rotate(360deg)}}`}</style>
    </GestorLayout>
  )
}
