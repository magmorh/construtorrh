import React, { useEffect, useState, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '@/lib/supabase'
import { getPortalSession } from '@/hooks/usePortalAuth'
import PortalLayout from './PortalLayout'
import { AlertTriangle, CheckCircle2, Loader2, ChevronDown } from 'lucide-react'

type Gravidade = 'baixa' | 'media' | 'alta' | 'critica'
type TipoOcorr = 'ocorrencia' | 'acidente' | 'quase_acidente' | 'epi' | 'disciplinar'

const TIPOS: { value: TipoOcorr; label: string; emoji: string }[] = [
  { value: 'ocorrencia',     label: 'Ocorrência Geral', emoji: '📋' },
  { value: 'acidente',       label: 'Acidente',         emoji: '🚨' },
  { value: 'quase_acidente', label: 'Quase Acidente',   emoji: '⚠️' },
  { value: 'epi',            label: 'EPI / Segurança',  emoji: '🦺' },
  { value: 'disciplinar',    label: 'Disciplinar',      emoji: '📌' },
]

const GRAVIDADES: { value: Gravidade; label: string; cor: string; bg: string }[] = [
  { value: 'baixa',   label: 'Baixa',   cor: '#15803d', bg: '#dcfce7' },
  { value: 'media',   label: 'Média',   cor: '#b45309', bg: '#fef3c7' },
  { value: 'alta',    label: 'Alta',    cor: '#dc2626', bg: '#fee2e2' },
  { value: 'critica', label: 'Crítica', cor: '#7c3aed', bg: '#ede9fe' },
]

interface ColabRow { id: string; nome: string }
interface ObraRow  { id: string; nome: string }
interface OcorrRow { id: string; titulo: string; tipo: string; gravidade: string; data: string; criado_em: string; colaboradores?: { nome: string } | null }

export default function PortalOcorrencias() {
  const nav = useNavigate()
  const session = getPortalSession()
  const obras = session?.obras_ids ?? []

  const [obraId, setObraId]     = useState(obras[0] ?? '')
  const [obrasData, setObrasData] = useState<ObraRow[]>([])
  const [colabs, setColabs]     = useState<ColabRow[]>([])
  const [historico, setHistorico] = useState<OcorrRow[]>([])

  // Formulário
  const [tipo, setTipo]         = useState<TipoOcorr>('ocorrencia')
  const [gravidade, setGravidade] = useState<Gravidade>('media')
  const [titulo, setTitulo]     = useState('')
  const [descricao, setDescricao] = useState('')
  const [colabId, setColabId]   = useState('')
  const [data, setData]         = useState(new Date().toISOString().slice(0, 10))
  const [saving, setSaving]     = useState(false)
  const [sucesso, setSucesso]   = useState(false)
  const [aba, setAba]           = useState<'nova' | 'historico'>('nova')

  const fetchObras = useCallback(async () => {
    if (!obras.length) return
    const { data: d } = await supabase.from('obras').select('id,nome').in('id', obras).order('nome')
    if (d) setObrasData(d)
  }, [obras.join(',')])

  const fetchColabs = useCallback(async () => {
    if (!obraId) return
    const { data: d } = await supabase.from('colaboradores').select('id,nome').eq('obra_id', obraId).eq('status', 'ativo').order('nome')
    if (d) setColabs(d)
  }, [obraId])

  const fetchHistorico = useCallback(async () => {
    if (!obraId) return
    const { data: d } = await supabase
      .from('portal_ocorrencias')
      .select('id,titulo,tipo,gravidade,data,criado_em,colaboradores(nome)')
      .eq('obra_id', obraId)
      .order('criado_em', { ascending: false })
      .limit(30)
    if (d) setHistorico(d as unknown as OcorrRow[])
  }, [obraId])

  useEffect(() => { if (!session) { nav('/portal'); return } fetchObras() }, [])
  useEffect(() => { fetchColabs(); fetchHistorico() }, [fetchColabs, fetchHistorico])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!titulo.trim()) return
    setSaving(true)
    const { error } = await supabase.from('portal_ocorrencias').insert({
      obra_id: obraId, colaborador_id: colabId || null,
      tipo, gravidade, titulo, descricao, data,
      portal_usuario_id: session?.id,
    })
    setSaving(false)
    if (!error) {
      setSucesso(true); setTitulo(''); setDescricao(''); setColabId('')
      fetchHistorico()
      setTimeout(() => { setSucesso(false); setAba('historico') }, 1800)
    }
  }

  return (
    <PortalLayout>
      <div style={{ padding: '16px 16px 8px' }}>
        <div style={{ fontWeight: 800, fontSize: 18, color: '#1e3a5f' }}>⚠️ Ocorrências</div>
        <div style={{ fontSize: 12, color: '#9ca3af' }}>Registre e acompanhe eventos na obra</div>
      </div>

      {/* Seletor obra */}
      {obrasData.length > 1 && (
        <div style={{ padding: '0 16px 10px' }}>
          <select value={obraId} onChange={e => setObraId(e.target.value)}
            style={{ width: '100%', height: 40, border: '1px solid #e5e7eb', borderRadius: 8, padding: '0 12px', fontSize: 13, background: '#fff' }}>
            {obrasData.map(o => <option key={o.id} value={o.id}>{o.nome}</option>)}
          </select>
        </div>
      )}

      {/* Abas */}
      <div style={{ display: 'flex', margin: '0 16px 12px', background: '#f3f4f6', borderRadius: 10, padding: 4 }}>
        {(['nova', 'historico'] as const).map(a => (
          <button key={a} onClick={() => setAba(a)}
            style={{
              flex: 1, height: 36, border: 'none', borderRadius: 8, cursor: 'pointer', fontWeight: 700, fontSize: 13,
              background: aba === a ? '#fff' : 'transparent', color: aba === a ? '#1e3a5f' : '#9ca3af',
              boxShadow: aba === a ? '0 1px 4px rgba(0,0,0,0.1)' : 'none',
            }}>
            {a === 'nova' ? '+ Nova Ocorrência' : `Histórico (${historico.length})`}
          </button>
        ))}
      </div>

      {aba === 'nova' && (
        <form onSubmit={handleSubmit} style={{ padding: '0 16px 24px', display: 'flex', flexDirection: 'column', gap: 14 }}>
          {sucesso && (
            <div style={{ background: '#dcfce7', border: '1px solid #86efac', borderRadius: 10, padding: '12px 16px', display: 'flex', alignItems: 'center', gap: 8, color: '#15803d', fontWeight: 700 }}>
              <CheckCircle2 size={18} /> Ocorrência registrada com sucesso!
            </div>
          )}

          {/* Tipo */}
          <div>
            <div style={{ fontSize: 12, fontWeight: 700, color: '#374151', marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Tipo</div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 6 }}>
              {TIPOS.map(t => (
                <button key={t.value} type="button" onClick={() => setTipo(t.value)}
                  style={{
                    background: tipo === t.value ? '#eff6ff' : '#f9fafb',
                    border: `2px solid ${tipo === t.value ? '#3b82f6' : '#e5e7eb'}`,
                    borderRadius: 10, padding: '8px 4px', cursor: 'pointer',
                    display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4,
                  }}>
                  <span style={{ fontSize: 20 }}>{t.emoji}</span>
                  <span style={{ fontSize: 9, fontWeight: 700, color: tipo === t.value ? '#1d4ed8' : '#6b7280', textAlign: 'center', lineHeight: 1.2 }}>{t.label}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Gravidade */}
          <div>
            <div style={{ fontSize: 12, fontWeight: 700, color: '#374151', marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Gravidade</div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 6 }}>
              {GRAVIDADES.map(g => (
                <button key={g.value} type="button" onClick={() => setGravidade(g.value)}
                  style={{
                    background: gravidade === g.value ? g.bg : '#f9fafb',
                    border: `2px solid ${gravidade === g.value ? g.cor : '#e5e7eb'}`,
                    borderRadius: 8, padding: '8px 4px', cursor: 'pointer', fontWeight: 700,
                    fontSize: 11, color: gravidade === g.value ? g.cor : '#9ca3af',
                  }}>
                  {g.label}
                </button>
              ))}
            </div>
          </div>

          {/* Data e Colaborador */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <div>
              <div style={{ fontSize: 12, fontWeight: 700, color: '#374151', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Data</div>
              <input type="date" value={data} onChange={e => setData(e.target.value)}
                style={{ width: '100%', height: 42, border: '1px solid #e5e7eb', borderRadius: 8, padding: '0 10px', fontSize: 13, boxSizing: 'border-box', background: '#fff' }} />
            </div>
            <div>
              <div style={{ fontSize: 12, fontWeight: 700, color: '#374151', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Colaborador</div>
              <select value={colabId} onChange={e => setColabId(e.target.value)}
                style={{ width: '100%', height: 42, border: '1px solid #e5e7eb', borderRadius: 8, padding: '0 8px', fontSize: 12, background: '#fff', boxSizing: 'border-box' }}>
                <option value="">Geral (sem vincular)</option>
                {colabs.map(c => <option key={c.id} value={c.id}>{c.nome}</option>)}
              </select>
            </div>
          </div>

          {/* Título */}
          <div>
            <div style={{ fontSize: 12, fontWeight: 700, color: '#374151', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Título *</div>
            <input value={titulo} onChange={e => setTitulo(e.target.value)} required
              placeholder="Descreva brevemente o que aconteceu…"
              style={{ width: '100%', height: 44, border: '1px solid #e5e7eb', borderRadius: 8, padding: '0 12px', fontSize: 13, boxSizing: 'border-box', background: '#fff' }} />
          </div>

          {/* Descrição */}
          <div>
            <div style={{ fontSize: 12, fontWeight: 700, color: '#374151', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Detalhes</div>
            <textarea value={descricao} onChange={e => setDescricao(e.target.value)} rows={4}
              placeholder="Descreva os detalhes da ocorrência, local, causa…"
              style={{ width: '100%', border: '1px solid #e5e7eb', borderRadius: 8, padding: '10px 12px', fontSize: 13, boxSizing: 'border-box', background: '#fff', resize: 'vertical' }} />
          </div>

          <button type="submit" disabled={saving || !titulo.trim()}
            style={{
              height: 50, background: saving ? '#94a3b8' : '#dc2626', color: '#fff',
              border: 'none', borderRadius: 12, fontSize: 16, fontWeight: 700,
              cursor: saving ? 'not-allowed' : 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
            }}>
            {saving ? <><Loader2 size={18} className="animate-spin" /> Registrando…</> : <><AlertTriangle size={18} /> Registrar Ocorrência</>}
          </button>
        </form>
      )}

      {aba === 'historico' && (
        <div style={{ padding: '0 16px 24px' }}>
          {historico.length === 0 ? (
            <div style={{ background: '#fff', borderRadius: 12, padding: 32, textAlign: 'center', color: '#9ca3af' }}>
              Nenhuma ocorrência registrada nesta obra
            </div>
          ) : historico.map(o => {
            const g = GRAVIDADES.find(g => g.value === o.gravidade)
            const t = TIPOS.find(t => t.value === o.tipo)
            return (
              <div key={o.id} style={{ background: '#fff', borderRadius: 12, border: `2px solid ${g?.bg ?? '#e5e7eb'}`, marginBottom: 8, padding: '12px 14px' }}>
                <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8 }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: 700, fontSize: 13, color: '#111', marginBottom: 4 }}>
                      {t?.emoji} {o.titulo}
                    </div>
                    {(o.colaboradores as any)?.nome && (
                      <div style={{ fontSize: 11, color: '#6b7280', marginBottom: 4 }}>
                        👤 {(o.colaboradores as any).nome}
                      </div>
                    )}
                  </div>
                  <span style={{ fontSize: 10, background: g?.bg, color: g?.cor, borderRadius: 6, padding: '3px 8px', fontWeight: 700, whiteSpace: 'nowrap' }}>
                    {g?.label}
                  </span>
                </div>
                <div style={{ fontSize: 10, color: '#9ca3af' }}>
                  📅 {new Date(o.data).toLocaleDateString('pt-BR')} · {new Date(o.criado_em).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
                </div>
              </div>
            )
          })}
        </div>
      )}
    </PortalLayout>
  )
}
