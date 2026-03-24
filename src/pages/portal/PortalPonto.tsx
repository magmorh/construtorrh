import React, { useEffect, useState, useCallback, useMemo } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { supabase } from '@/lib/supabase'
import { getPortalSession } from '@/hooks/usePortalAuth'
import PortalLayout from './PortalLayout'
import { ChevronLeft, ChevronRight, Check, X, Clock, Minus, Plus, Save, Loader2 } from 'lucide-react'

type StatusPonto = 'presente' | 'falta' | 'meio_periodo' | 'falta_justificada'

interface ColabRow { id: string; nome: string; chapa?: string; funcao?: string }
interface PontoRow {
  id?: string; colaborador_id: string; data: string; status: StatusPonto
  hora_entrada?: string; hora_saida?: string
  horas_trabalhadas?: number; horas_extra?: number; horas_falta?: number; observacoes?: string
}

const STATUS_CONFIG: Record<StatusPonto, { label: string; cor: string; bg: string; icon: React.ReactNode }> = {
  presente:          { label: 'Presente',      cor: '#15803d', bg: '#dcfce7', icon: <Check size={14} /> },
  falta:             { label: 'Falta',          cor: '#dc2626', bg: '#fee2e2', icon: <X size={14} /> },
  meio_periodo:      { label: 'Meio Período',   cor: '#b45309', bg: '#fef3c7', icon: <Minus size={14} /> },
  falta_justificada: { label: 'Falta Justif.', cor: '#6b7280', bg: '#f3f4f6', icon: <Clock size={14} /> },
}

export default function PortalPonto() {
  const nav = useNavigate()
  const [params] = useSearchParams()
  const session = getPortalSession()

  const obras = session?.obras_ids ?? []
  const [obraId, setObraId] = useState(params.get('obra') ?? obras[0] ?? '')
  const [obrasData, setObrasData] = useState<{id:string;nome:string}[]>([])

  const [dataSel, setDataSel] = useState(new Date().toISOString().slice(0, 10))
  const [colaboradores, setColaboradores] = useState<ColabRow[]>([])
  const [pontos, setPontos]  = useState<Record<string, PontoRow>>({}) // keyed by colaborador_id
  const [saving, setSaving]  = useState<Set<string>>(new Set())
  const [loading, setLoading] = useState(false)
  const [editandoId, setEditandoId] = useState<string | null>(null)

  function proxDia(dir: 1 | -1) {
    const d = new Date(dataSel + 'T12:00:00')
    d.setDate(d.getDate() + dir)
    setDataSel(d.toISOString().slice(0, 10))
  }

  const fetchColabs = useCallback(async () => {
    if (!obraId) return
    const { data } = await supabase
      .from('colaboradores')
      .select('id, nome, chapa, funcoes(nome)')
      .eq('obra_id', obraId)
      .eq('status', 'ativo')
      .order('nome')
    if (data) setColaboradores(data.map((c: any) => ({
      id: c.id, nome: c.nome, chapa: c.chapa, funcao: c.funcoes?.nome,
    })))
  }, [obraId])

  const fetchPontos = useCallback(async () => {
    if (!obraId || !dataSel) return
    setLoading(true)
    const { data } = await supabase
      .from('portal_ponto_diario')
      .select('*')
      .eq('obra_id', obraId)
      .eq('data', dataSel)
    setPontos(Object.fromEntries((data ?? []).map((r: any) => [r.colaborador_id, r])))
    setLoading(false)
  }, [obraId, dataSel])

  const fetchObras = useCallback(async () => {
    if (!obras.length) return
    const { data } = await supabase.from('obras').select('id,nome').in('id', obras).order('nome')
    if (data) setObrasData(data)
  }, [obras.join(',')])

  useEffect(() => { if (!session) { nav('/portal'); return } fetchObras() }, [])
  useEffect(() => { fetchColabs() }, [fetchColabs])
  useEffect(() => { fetchPontos() }, [fetchPontos])

  async function salvarPonto(colabId: string, dados: Partial<PontoRow>) {
    setSaving(prev => new Set([...prev, colabId]))
    const atual = pontos[colabId]
    const payload = {
      obra_id:           obraId,
      colaborador_id:    colabId,
      data:              dataSel,
      portal_usuario_id: session?.id,
      ...dados,
    }
    let err: any
    if (atual?.id) {
      ({ error: err } = await supabase.from('portal_ponto_diario').update(payload).eq('id', atual.id))
    } else {
      ({ error: err } = await supabase.from('portal_ponto_diario').insert(payload))
    }
    if (!err) await fetchPontos()
    setSaving(prev => { const s = new Set(prev); s.delete(colabId); return s })
    setEditandoId(null)
  }

  const dateFmt = useMemo(() => {
    const [y, m, d] = dataSel.split('-').map(Number)
    const dt = new Date(y, m - 1, d)
    return dt.toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: 'long' })
  }, [dataSel])

  const totalPresentes = colaboradores.filter(c => pontos[c.id]?.status === 'presente').length
  const totalFaltas    = colaboradores.filter(c => pontos[c.id]?.status === 'falta' || pontos[c.id]?.status === 'falta_justificada').length
  const semLancamento  = colaboradores.filter(c => !pontos[c.id]).length

  return (
    <PortalLayout>
      {/* Seletor de obra */}
      {obrasData.length > 1 && (
        <div style={{ padding: '12px 16px 0' }}>
          <select value={obraId} onChange={e => setObraId(e.target.value)}
            style={{
              width: '100%', height: 42, border: '2px solid #e5e7eb', borderRadius: 10,
              padding: '0 12px', fontSize: 14, fontWeight: 600, background: '#fff', color: '#111',
            }}>
            {obrasData.map(o => <option key={o.id} value={o.id}>{o.nome}</option>)}
          </select>
        </div>
      )}

      {/* Seletor de data */}
      <div style={{ padding: '12px 16px 8px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <button onClick={() => proxDia(-1)} style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 8, padding: '8px 12px', cursor: 'pointer' }}>
          <ChevronLeft size={18} />
        </button>
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontWeight: 800, fontSize: 16, color: '#1e3a5f', textTransform: 'capitalize' }}>{dateFmt}</div>
          <input type="date" value={dataSel} onChange={e => setDataSel(e.target.value)}
            style={{ fontSize: 11, color: '#9ca3af', border: 'none', background: 'transparent', textAlign: 'center', cursor: 'pointer' }} />
        </div>
        <button onClick={() => proxDia(1)} style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 8, padding: '8px 12px', cursor: 'pointer' }}>
          <ChevronRight size={18} />
        </button>
      </div>

      {/* Resumo */}
      <div style={{ padding: '0 16px 12px', display: 'flex', gap: 8 }}>
        {[
          { label: 'Presentes', val: totalPresentes, cor: '#15803d', bg: '#dcfce7' },
          { label: 'Faltas',    val: totalFaltas,    cor: '#dc2626', bg: '#fee2e2' },
          { label: 'Sem lançamento', val: semLancamento, cor: '#b45309', bg: '#fef3c7' },
        ].map(s => (
          <div key={s.label} style={{ flex: 1, background: s.bg, borderRadius: 10, padding: '8px 10px', textAlign: 'center' }}>
            <div style={{ fontWeight: 800, fontSize: 18, color: s.cor }}>{s.val}</div>
            <div style={{ fontSize: 10, color: s.cor, fontWeight: 600 }}>{s.label}</div>
          </div>
        ))}
      </div>

      {/* Lista colaboradores */}
      <div style={{ padding: '0 16px 16px' }}>
        {loading ? (
          <div style={{ textAlign: 'center', padding: 32, color: '#9ca3af' }}>
            <Loader2 size={24} className="animate-spin" style={{ margin: '0 auto 8px', display: 'block' }} />
            Carregando…
          </div>
        ) : colaboradores.length === 0 ? (
          <div style={{ background: '#fff', borderRadius: 12, padding: 24, textAlign: 'center', color: '#9ca3af' }}>
            Nenhum colaborador ativo nesta obra
          </div>
        ) : colaboradores.map(c => {
          const p = pontos[c.id]
          const isSaving = saving.has(c.id)
          const isEdit = editandoId === c.id
          const cfg = p ? STATUS_CONFIG[p.status] : null

          return (
            <div key={c.id} style={{
              background: '#fff', borderRadius: 14, border: `2px solid ${cfg?.bg ?? '#e5e7eb'}`,
              marginBottom: 10, overflow: 'hidden',
              boxShadow: '0 1px 4px rgba(0,0,0,0.06)',
            }}>
              {/* Cabeçalho do colaborador */}
              <div style={{ padding: '12px 14px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div>
                  <div style={{ fontWeight: 700, fontSize: 14, color: '#111' }}>{c.nome}</div>
                  <div style={{ fontSize: 11, color: '#9ca3af' }}>
                    {c.chapa && <span style={{ marginRight: 8 }}>{c.chapa}</span>}
                    {c.funcao}
                  </div>
                </div>
                {cfg ? (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <span style={{
                      background: cfg.bg, color: cfg.cor, borderRadius: 8, padding: '4px 10px',
                      fontSize: 11, fontWeight: 700, display: 'flex', alignItems: 'center', gap: 4,
                    }}>
                      {cfg.icon} {cfg.label}
                    </span>
                    <button onClick={() => setEditandoId(isEdit ? null : c.id)}
                      style={{ background: '#f3f4f6', border: 'none', borderRadius: 6, padding: '4px 8px', cursor: 'pointer', fontSize: 11, color: '#374151' }}>
                      Editar
                    </button>
                  </div>
                ) : (
                  <span style={{ fontSize: 11, color: '#f59e0b', fontWeight: 600, background: '#fef3c7', borderRadius: 6, padding: '3px 8px' }}>
                    Sem lançamento
                  </span>
                )}
              </div>

              {/* Botões de status rápido */}
              {(!p || isEdit) && (
                <div style={{ padding: '0 14px 12px', display: 'flex', flexDirection: 'column', gap: 10 }}>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 6 }}>
                    {(Object.entries(STATUS_CONFIG) as [StatusPonto, typeof STATUS_CONFIG[StatusPonto]][]).map(([status, cfg]) => (
                      <button key={status}
                        onClick={() => salvarPonto(c.id, { status, horas_extra: 0, horas_falta: 0 })}
                        disabled={isSaving}
                        style={{
                          background: p?.status === status ? cfg.bg : '#f9fafb',
                          border: `2px solid ${p?.status === status ? cfg.cor : '#e5e7eb'}`,
                          borderRadius: 10, padding: '8px 4px', cursor: 'pointer',
                          display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4,
                          opacity: isSaving ? 0.6 : 1,
                        }}>
                        <span style={{ color: cfg.cor }}>{cfg.icon}</span>
                        <span style={{ fontSize: 9, fontWeight: 700, color: cfg.cor, textAlign: 'center', lineHeight: 1.2 }}>
                          {cfg.label}
                        </span>
                      </button>
                    ))}
                  </div>

                  {/* Ajustes de horas (se presente ou meio período) */}
                  {p && (p.status === 'presente' || p.status === 'meio_periodo') && (
                    <HorasAjuste
                      horasExtra={p.horas_extra ?? 0}
                      horasFalta={p.horas_falta ?? 0}
                      observacoes={p.observacoes ?? ''}
                      onSave={(he, hf, obs) => salvarPonto(c.id, { status: p.status, horas_extra: he, horas_falta: hf, observacoes: obs })}
                      saving={isSaving}
                    />
                  )}
                </div>
              )}

              {/* Detalhes se já lançado e não editando */}
              {p && !isEdit && (p.horas_extra || p.horas_falta || p.observacoes) && (
                <div style={{ padding: '0 14px 12px', display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  {!!p.horas_extra && <span style={{ fontSize: 11, background: '#dbeafe', color: '#1d4ed8', borderRadius: 6, padding: '2px 8px', fontWeight: 600 }}>+{p.horas_extra}h extra</span>}
                  {!!p.horas_falta && <span style={{ fontSize: 11, background: '#fee2e2', color: '#dc2626', borderRadius: 6, padding: '2px 8px', fontWeight: 600 }}>-{p.horas_falta}h falta</span>}
                  {p.observacoes && <span style={{ fontSize: 11, color: '#6b7280', fontStyle: 'italic' }}>{p.observacoes}</span>}
                </div>
              )}
            </div>
          )
        })}
      </div>
    </PortalLayout>
  )
}

// Sub-componente de ajuste de horas
function HorasAjuste({ horasExtra, horasFalta, observacoes, onSave, saving }: {
  horasExtra: number; horasFalta: number; observacoes: string
  onSave: (he: number, hf: number, obs: string) => void; saving: boolean
}) {
  const [he, setHe] = useState(horasExtra)
  const [hf, setHf] = useState(horasFalta)
  const [obs, setObs] = useState(observacoes)

  function step(field: 'he' | 'hf', dir: 1 | -1) {
    if (field === 'he') setHe(v => Math.max(0, +(v + dir * 0.5).toFixed(1)))
    else setHf(v => Math.max(0, +(v + dir * 0.5).toFixed(1)))
  }

  return (
    <div style={{ background: '#f9fafb', borderRadius: 10, padding: 12, display: 'flex', flexDirection: 'column', gap: 10 }}>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
        {/* Hora extra */}
        <div>
          <div style={{ fontSize: 10, fontWeight: 700, color: '#1d4ed8', marginBottom: 4, textTransform: 'uppercase' }}>
            + Horas Extra
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            <button onClick={() => step('he', -1)} style={{ width: 32, height: 32, background: '#fff', border: '1px solid #e5e7eb', borderRadius: 6, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Minus size={14} /></button>
            <span style={{ flex: 1, textAlign: 'center', fontWeight: 800, fontSize: 16, color: '#1d4ed8' }}>{he}h</span>
            <button onClick={() => step('he', 1)} style={{ width: 32, height: 32, background: '#fff', border: '1px solid #e5e7eb', borderRadius: 6, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Plus size={14} /></button>
          </div>
        </div>
        {/* Hora falta */}
        <div>
          <div style={{ fontSize: 10, fontWeight: 700, color: '#dc2626', marginBottom: 4, textTransform: 'uppercase' }}>
            - Horas Falta
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            <button onClick={() => step('hf', -1)} style={{ width: 32, height: 32, background: '#fff', border: '1px solid #e5e7eb', borderRadius: 6, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Minus size={14} /></button>
            <span style={{ flex: 1, textAlign: 'center', fontWeight: 800, fontSize: 16, color: '#dc2626' }}>{hf}h</span>
            <button onClick={() => step('hf', 1)} style={{ width: 32, height: 32, background: '#fff', border: '1px solid #e5e7eb', borderRadius: 6, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Plus size={14} /></button>
          </div>
        </div>
      </div>
      <input value={obs} onChange={e => setObs(e.target.value)}
        placeholder="Observação (opcional)..."
        style={{ width: '100%', height: 36, border: '1px solid #e5e7eb', borderRadius: 8, padding: '0 10px', fontSize: 12, boxSizing: 'border-box', background: '#fff' }} />
      <button onClick={() => onSave(he, hf, obs)} disabled={saving}
        style={{
          background: saving ? '#94a3b8' : '#1e3a5f', color: '#fff', border: 'none', borderRadius: 8,
          height: 36, cursor: saving ? 'not-allowed' : 'pointer', fontWeight: 700, fontSize: 13,
          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
        }}>
        {saving ? <><Loader2 size={14} className="animate-spin" /> Salvando…</> : <><Save size={14} /> Salvar ajustes</>}
      </button>
    </div>
  )
}
