import React, { useEffect, useState, useCallback, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '@/lib/supabase'
import { getPortalSession } from '@/hooks/usePortalAuth'
import PortalLayout from './PortalLayout'
import { Plus, Trash2, Loader2, CheckCircle2, AlertTriangle, Wrench, Truck } from 'lucide-react'
import { toast } from 'sonner'

// ─── Tipos ───────────────────────────────────────────────────────────────────

type Tipo   = 'locado' | 'proprio'
type Status = 'ativo' | 'devolvido' | 'baixa' | 'defeito'

interface Equip {
  id: string; obra_id: string; tipo: Tipo; nome: string; descricao?: string
  quantidade: number; fornecedor?: string
  data_inicio?: string; data_prevista?: string; data_devolucao?: string
  status: Status; observacoes?: string; created_at: string
}

interface FormEquip {
  tipo: Tipo; nome: string; descricao: string; quantidade: string
  fornecedor: string; data_inicio: string; data_prevista: string; observacoes: string
}

const EMPTY: FormEquip = {
  tipo: 'locado', nome: '', descricao: '', quantidade: '1',
  fornecedor: '', data_inicio: new Date().toISOString().slice(0, 10),
  data_prevista: '', observacoes: '',
}

// ─── Configs visuais ─────────────────────────────────────────────────────────

const STATUS_CFG: Record<Status, { label: string; cor: string; bg: string; emoji: string }> = {
  ativo:      { label: 'Ativo',      cor: '#16a34a', bg: '#dcfce7', emoji: '✅' },
  devolvido:  { label: 'Devolvido',  cor: '#0369a1', bg: '#e0f2fe', emoji: '↩️' },
  baixa:      { label: 'Baixa',      cor: '#7c3aed', bg: '#f5f3ff', emoji: '🗑️' },
  defeito:    { label: 'Defeito',    cor: '#dc2626', bg: '#fee2e2', emoji: '⚠️' },
}

const I: React.CSSProperties = {
  width: '100%', height: 40, border: '1px solid #d1d5db', borderRadius: 8,
  padding: '0 10px', fontSize: 13, boxSizing: 'border-box', background: '#fff',
}

// ─── Componente ──────────────────────────────────────────────────────────────

export default function PortalEquipamentos() {
  const nav     = useNavigate()
  const session = getPortalSession()
  const obras   = session?.obras_ids ?? []

  const [obraId,    setObraId]    = useState(obras[0] ?? '')
  const [obrasData, setObrasData] = useState<{ id: string; nome: string }[]>([])
  const [rows,      setRows]      = useState<Equip[]>([])
  const [loading,   setLoading]   = useState(false)
  const [saving,    setSaving]    = useState(false)
  const [aba,       setAba]       = useState<'lista' | 'novo'>('lista')
  const [tipoFiltro,setTipoFiltro]= useState<'todos' | Tipo>('todos')
  const [form,      setForm]      = useState<FormEquip>({ ...EMPTY })
  const [editId,    setEditId]    = useState<string | null>(null)
  const [modal,     setModal]     = useState<Equip | null>(null)

  // Fetch
  useEffect(() => {
    if (!session) { nav('/portal'); return }
    if (!obras.length) return
    supabase.from('obras').select('id,nome').in('id', obras).order('nome')
      .then(({ data }) => { if (data) setObrasData(data) })
  }, [])

  const fetchRows = useCallback(async () => {
    if (!obraId) return
    setLoading(true)
    const { data } = await supabase.from('obra_equipamentos')
      .select('*').eq('obra_id', obraId).order('created_at', { ascending: false })
    setRows(data ?? [])
    setLoading(false)
  }, [obraId])

  useEffect(() => { fetchRows() }, [fetchRows])

  const setF = (k: keyof FormEquip, v: string) => setForm(p => ({ ...p, [k]: v }))

  async function handleSalvar(e: React.FormEvent) {
    e.preventDefault()
    if (!form.nome.trim()) { toast.error('Informe o nome'); return }
    setSaving(true)
    const payload = {
      obra_id: obraId,
      tipo: form.tipo,
      nome: form.nome.trim(),
      descricao: form.descricao || null,
      quantidade: parseInt(form.quantidade) || 1,
      fornecedor: form.fornecedor || null,
      data_inicio: form.data_inicio || null,
      data_prevista: form.tipo === 'locado' ? (form.data_prevista || null) : null,
      observacoes: form.observacoes || null,
      lancado_por: session?.nome ?? session?.login ?? 'portal',
      status: 'ativo',
    }
    const { error } = editId
      ? await supabase.from('obra_equipamentos').update(payload).eq('id', editId)
      : await supabase.from('obra_equipamentos').insert(payload)
    setSaving(false)
    if (error) { toast.error('Erro: ' + error.message); return }
    toast.success(editId ? 'Atualizado!' : 'Cadastrado!')
    setForm({ ...EMPTY }); setEditId(null); setAba('lista'); fetchRows()
  }

  async function marcarStatus(id: string, status: Status, obs?: string) {
    const payload: any = { status }
    if (status === 'devolvido') payload.data_devolucao = new Date().toISOString().slice(0, 10)
    if (obs) payload.observacoes = obs
    const { error } = await supabase.from('obra_equipamentos').update(payload).eq('id', id)
    if (error) { toast.error('Erro: ' + error.message); return }
    toast.success('Status atualizado!')
    setModal(null); fetchRows()
  }

  async function excluir(id: string) {
    if (!confirm('Excluir este registro?')) return
    await supabase.from('obra_equipamentos').delete().eq('id', id)
    toast.success('Removido')
    fetchRows()
  }

  function abrirEditar(r: Equip) {
    setForm({
      tipo: r.tipo, nome: r.nome, descricao: r.descricao ?? '',
      quantidade: String(r.quantidade), fornecedor: r.fornecedor ?? '',
      data_inicio: r.data_inicio ?? '', data_prevista: r.data_prevista ?? '',
      observacoes: r.observacoes ?? '',
    })
    setEditId(r.id); setAba('novo')
  }

  // Dados filtrados
  const rowsFiltrados = useMemo(() =>
    tipoFiltro === 'todos' ? rows : rows.filter(r => r.tipo === tipoFiltro),
  [rows, tipoFiltro])

  const qtdAtivos   = rows.filter(r => r.status === 'ativo').length
  const qtdLocados  = rows.filter(r => r.tipo === 'locado').length
  const qtdProprios = rows.filter(r => r.tipo === 'proprio').length

  if (!session) return null

  return (
    <PortalLayout>
      {/* Header */}
      <div style={{ padding: '16px 16px 8px' }}>
        <div style={{ fontWeight: 800, fontSize: 17, color: '#1e3a5f', display: 'flex', alignItems: 'center', gap: 8 }}>
          🔧 Equipamentos & Ferramentas
        </div>
        <div style={{ fontSize: 12, color: '#9ca3af', marginTop: 2 }}>
          Controle de locações e ferramentas da obra
        </div>
      </div>

      {/* Seletor de obra */}
      {obrasData.length > 1 && (
        <div style={{ padding: '0 16px 10px' }}>
          <select value={obraId} onChange={e => setObraId(e.target.value)}
            style={{ ...I, cursor: 'pointer' }}>
            {obrasData.map(o => <option key={o.id} value={o.id}>{o.nome}</option>)}
          </select>
        </div>
      )}

      {/* KPIs */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8, padding: '0 16px 12px' }}>
        {[
          { emoji: '✅', val: qtdAtivos,   label: 'Ativos'   },
          { emoji: '🚛', val: qtdLocados,  label: 'Locados'  },
          { emoji: '🔧', val: qtdProprios, label: 'Próprios' },
        ].map(k => (
          <div key={k.label} style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 10, padding: '10px 0', textAlign: 'center' }}>
            <div style={{ fontSize: 20 }}>{k.emoji}</div>
            <div style={{ fontSize: 18, fontWeight: 800, color: '#1e3a5f' }}>{k.val}</div>
            <div style={{ fontSize: 10, color: '#6b7280', fontWeight: 600 }}>{k.label}</div>
          </div>
        ))}
      </div>

      {/* Abas */}
      <div style={{ display: 'flex', margin: '0 16px 12px', background: '#f3f4f6', borderRadius: 10, padding: 4 }}>
        {([['lista', '📋 Lista'], ['novo', editId ? '✏️ Editar' : '➕ Novo Cadastro']] as [string, string][]).map(([k, l]) => (
          <button key={k} onClick={() => { setAba(k as any); if (k === 'lista') { setEditId(null); setForm({ ...EMPTY }) } }}
            style={{ flex: 1, height: 34, border: 'none', borderRadius: 7, cursor: 'pointer', fontWeight: 700, fontSize: 13,
              background: aba === k ? '#fff' : 'transparent', color: aba === k ? '#1e3a5f' : '#9ca3af',
              boxShadow: aba === k ? '0 1px 4px rgba(0,0,0,0.1)' : 'none' }}>
            {l}
          </button>
        ))}
      </div>

      {/* ═══════════ FORMULÁRIO ═══════════ */}
      {aba === 'novo' && (
        <form onSubmit={handleSalvar} style={{ padding: '0 16px 32px', display: 'flex', flexDirection: 'column', gap: 12 }}>
          {/* Tipo */}
          <div>
            <label style={{ fontSize: 11, fontWeight: 700, color: '#374151', display: 'block', marginBottom: 6, textTransform: 'uppercase' }}>Tipo</label>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
              {([['locado', '🚛 Equipamento Locado', 'Alugado de fornecedor'],
                 ['proprio', '🔧 Ferramenta Própria', 'Comprada para a obra']] as [Tipo, string, string][]).map(([t, l, s]) => (
                <button key={t} type="button" onClick={() => setF('tipo', t)} style={{
                  padding: '10px 8px', borderRadius: 10, cursor: 'pointer', textAlign: 'center',
                  border: `2px solid ${form.tipo === t ? '#1e3a5f' : '#e5e7eb'}`,
                  background: form.tipo === t ? '#eff6ff' : '#fff',
                }}>
                  <div style={{ fontSize: 20 }}>{l.split(' ')[0]}</div>
                  <div style={{ fontSize: 12, fontWeight: 700, color: form.tipo === t ? '#1e3a5f' : '#374151' }}>{l.split(' ').slice(1).join(' ')}</div>
                  <div style={{ fontSize: 10, color: '#9ca3af' }}>{s}</div>
                </button>
              ))}
            </div>
          </div>

          {/* Nome */}
          <div>
            <label style={{ fontSize: 11, fontWeight: 700, color: '#374151', display: 'block', marginBottom: 4, textTransform: 'uppercase' }}>
              {form.tipo === 'locado' ? '🚛 Equipamento *' : '🔧 Ferramenta *'}
            </label>
            <input value={form.nome} onChange={e => setF('nome', e.target.value)} required
              placeholder={form.tipo === 'locado' ? 'Ex: Betoneira 400L, Andaime tubular…' : 'Ex: Martelete, Serra circular…'}
              style={I} />
          </div>

          {/* Descrição */}
          <div>
            <label style={{ fontSize: 11, fontWeight: 700, color: '#374151', display: 'block', marginBottom: 4, textTransform: 'uppercase' }}>Descrição / Modelo</label>
            <input value={form.descricao} onChange={e => setF('descricao', e.target.value)}
              placeholder="Modelo, marca, referência…" style={I} />
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            {/* Quantidade */}
            <div>
              <label style={{ fontSize: 11, fontWeight: 700, color: '#374151', display: 'block', marginBottom: 4, textTransform: 'uppercase' }}>Qtd.</label>
              <input type="number" min="1" value={form.quantidade} onChange={e => setF('quantidade', e.target.value)} style={I} />
            </div>
            {/* Data início */}
            <div>
              <label style={{ fontSize: 11, fontWeight: 700, color: '#374151', display: 'block', marginBottom: 4, textTransform: 'uppercase' }}>
                {form.tipo === 'locado' ? 'Início Locação' : 'Data Compra'}
              </label>
              <input type="date" value={form.data_inicio} onChange={e => setF('data_inicio', e.target.value)} style={I} />
            </div>
          </div>

          {/* Fornecedor */}
          <div>
            <label style={{ fontSize: 11, fontWeight: 700, color: '#374151', display: 'block', marginBottom: 4, textTransform: 'uppercase' }}>
              {form.tipo === 'locado' ? '🏢 Fornecedor / Locadora' : '🏪 Fornecedor / Loja'}
            </label>
            <input value={form.fornecedor} onChange={e => setF('fornecedor', e.target.value)}
              placeholder="Nome do fornecedor…" style={I} />
          </div>

          {/* Previsão devolução (só locado) */}
          {form.tipo === 'locado' && (
            <div>
              <label style={{ fontSize: 11, fontWeight: 700, color: '#374151', display: 'block', marginBottom: 4, textTransform: 'uppercase' }}>📅 Previsão Devolução</label>
              <input type="date" value={form.data_prevista} onChange={e => setF('data_prevista', e.target.value)} style={I} />
            </div>
          )}

          {/* Observações */}
          <div>
            <label style={{ fontSize: 11, fontWeight: 700, color: '#374151', display: 'block', marginBottom: 4, textTransform: 'uppercase' }}>Observações</label>
            <textarea value={form.observacoes} onChange={e => setF('observacoes', e.target.value)} rows={2}
              placeholder="Detalhes adicionais…"
              style={{ width: '100%', border: '1px solid #d1d5db', borderRadius: 8, padding: '8px 10px', fontSize: 13, boxSizing: 'border-box', resize: 'vertical', fontFamily: 'inherit' }} />
          </div>

          <button type="submit" disabled={saving} style={{
            height: 50, background: saving ? '#94a3b8' : 'linear-gradient(135deg,#1e3a5f,#0369a1)',
            color: '#fff', border: 'none', borderRadius: 12, fontSize: 15, fontWeight: 700,
            cursor: saving ? 'not-allowed' : 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
            boxShadow: saving ? 'none' : '0 4px 12px rgba(30,58,95,0.3)',
          }}>
            {saving ? <><Loader2 size={17} style={{ animation: 'spin 1s linear infinite' }} />Salvando…</> : `💾 ${editId ? 'Atualizar' : 'Cadastrar'}`}
          </button>
        </form>
      )}

      {/* ═══════════ LISTA ═══════════ */}
      {aba === 'lista' && (
        <div style={{ padding: '0 16px 32px' }}>
          {/* Filtro tipo */}
          <div style={{ display: 'flex', gap: 6, marginBottom: 12, flexWrap: 'wrap' }}>
            {([['todos', '📋 Todos'], ['locado', '🚛 Locados'], ['proprio', '🔧 Próprios']] as [string, string][]).map(([k, l]) => (
              <button key={k} onClick={() => setTipoFiltro(k as any)} style={{
                padding: '5px 14px', borderRadius: 20, fontSize: 12, fontWeight: 700,
                border: `2px solid ${tipoFiltro === k ? '#1e3a5f' : '#e5e7eb'}`,
                background: tipoFiltro === k ? '#1e3a5f' : '#fff',
                color: tipoFiltro === k ? '#fff' : '#374151', cursor: 'pointer',
              }}>{l}</button>
            ))}
          </div>

          {loading ? (
            <div style={{ textAlign: 'center', padding: 32 }}><Loader2 size={24} color="#1e3a5f" style={{ animation: 'spin 1s linear infinite' }} /></div>
          ) : rowsFiltrados.length === 0 ? (
            <div style={{ background: '#f8fafc', borderRadius: 12, border: '1px solid #e5e7eb', padding: 28, textAlign: 'center', color: '#9ca3af' }}>
              <div style={{ fontSize: 36, marginBottom: 8 }}>🔧</div>
              <div style={{ fontWeight: 600, fontSize: 13 }}>Nenhum item cadastrado</div>
              <button onClick={() => setAba('novo')} style={{ marginTop: 12, padding: '8px 20px', borderRadius: 8, border: 'none', background: '#1e3a5f', color: '#fff', fontWeight: 700, fontSize: 13, cursor: 'pointer' }}>
                ➕ Cadastrar
              </button>
            </div>
          ) : rowsFiltrados.map(r => {
            const sc = STATUS_CFG[r.status]
            const vencido = r.tipo === 'locado' && r.data_prevista && r.status === 'ativo' &&
              new Date(r.data_prevista) < new Date()
            return (
              <div key={r.id} style={{
                background: '#fff', border: `1px solid ${vencido ? '#fca5a5' : '#e5e7eb'}`,
                borderLeft: `4px solid ${vencido ? '#dc2626' : r.tipo === 'locado' ? '#0369a1' : '#059669'}`,
                borderRadius: 10, padding: '12px 14px', marginBottom: 8,
              }}>
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
                  <div style={{ fontSize: 26, flexShrink: 0 }}>{r.tipo === 'locado' ? '🚛' : '🔧'}</div>
                  <div style={{ flex: 1 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                      <span style={{ fontWeight: 800, fontSize: 14, color: '#1e3a5f' }}>{r.nome}</span>
                      <span style={{ fontSize: 10, background: sc.bg, color: sc.cor, borderRadius: 5, padding: '1px 7px', fontWeight: 700 }}>
                        {sc.emoji} {sc.label}
                      </span>
                      {vencido && <span style={{ fontSize: 10, background: '#fee2e2', color: '#dc2626', borderRadius: 5, padding: '1px 7px', fontWeight: 700 }}>⏰ Vencido</span>}
                    </div>
                    {r.descricao && <div style={{ fontSize: 11, color: '#6b7280', marginTop: 2 }}>{r.descricao}</div>}
                    <div style={{ fontSize: 11, color: '#64748b', marginTop: 4, display: 'flex', gap: 12, flexWrap: 'wrap' }}>
                      <span>📦 Qtd: <strong>{r.quantidade}</strong></span>
                      {r.fornecedor && <span>🏢 {r.fornecedor}</span>}
                      {r.data_inicio && <span>📅 {new Date(r.data_inicio + 'T12:00').toLocaleDateString('pt-BR')}</span>}
                      {r.tipo === 'locado' && r.data_prevista && (
                        <span style={{ color: vencido ? '#dc2626' : '#64748b' }}>
                          🗓️ Prev: {new Date(r.data_prevista + 'T12:00').toLocaleDateString('pt-BR')}
                        </span>
                      )}
                    </div>
                    {r.observacoes && <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 3, fontStyle: 'italic' }}>"{r.observacoes}"</div>}
                  </div>
                </div>
                {/* Botões de ação */}
                {r.status === 'ativo' && (
                  <div style={{ display: 'flex', gap: 6, marginTop: 10, flexWrap: 'wrap' }}>
                    {r.tipo === 'locado' && (
                      <button onClick={() => marcarStatus(r.id, 'devolvido')}
                        style={{ flex: 1, padding: '7px 0', borderRadius: 8, border: '1px solid #bfdbfe', background: '#eff6ff', color: '#1d4ed8', fontWeight: 700, fontSize: 12, cursor: 'pointer' }}>
                        ↩️ Marcar Devolvido
                      </button>
                    )}
                    {r.tipo === 'proprio' && (
                      <button onClick={() => marcarStatus(r.id, 'baixa')}
                        style={{ flex: 1, padding: '7px 0', borderRadius: 8, border: '1px solid #ddd6fe', background: '#f5f3ff', color: '#7c3aed', fontWeight: 700, fontSize: 12, cursor: 'pointer' }}>
                        🗑️ Dar Baixa
                      </button>
                    )}
                    <button onClick={() => marcarStatus(r.id, 'defeito')}
                      style={{ flex: 1, padding: '7px 0', borderRadius: 8, border: '1px solid #fecaca', background: '#fef2f2', color: '#dc2626', fontWeight: 700, fontSize: 12, cursor: 'pointer' }}>
                      ⚠️ Defeito
                    </button>
                    <button onClick={() => abrirEditar(r)}
                      style={{ padding: '7px 12px', borderRadius: 8, border: '1px solid #e5e7eb', background: '#fff', color: '#6b7280', fontWeight: 700, fontSize: 12, cursor: 'pointer' }}>
                      ✏️
                    </button>
                  </div>
                )}
                {r.status !== 'ativo' && (
                  <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
                    <button onClick={() => marcarStatus(r.id, 'ativo')}
                      style={{ flex: 1, padding: '6px 0', borderRadius: 7, border: '1px solid #bbf7d0', background: '#f0fdf4', color: '#15803d', fontWeight: 700, fontSize: 11, cursor: 'pointer' }}>
                      ↺ Reativar
                    </button>
                    <button onClick={() => excluir(r.id)}
                      style={{ padding: '6px 12px', borderRadius: 7, border: '1px solid #fecaca', background: '#fef2f2', color: '#dc2626', fontWeight: 700, fontSize: 11, cursor: 'pointer' }}>
                      <Trash2 size={13} />
                    </button>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
      <style>{`@keyframes spin{from{transform:rotate(0deg)}to{transform:rotate(360deg)}}`}</style>
    </PortalLayout>
  )
}
