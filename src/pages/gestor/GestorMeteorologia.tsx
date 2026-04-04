import React, { useEffect, useState, useCallback, useMemo } from 'react'
import { supabase } from '@/lib/supabase'
import GestorLayout from './GestorLayout'
import { CloudRain, Sun, Wind, Thermometer, Loader2, Plus, Droplets, Eye, AlertTriangle } from 'lucide-react'
import { toast } from 'sonner'

interface ClimaRow {
  id: string; data: string; obra_id: string; obra_nome: string
  choveu: boolean; precipitacao_mm?: number | null
  temperatura_max?: number | null; temperatura_min?: number | null
  vento_kmh?: number | null; umidade_pct?: number | null
  condicao: string; impacto_obra: string; observacoes?: string | null
}

const CONDICAO_CFG: Record<string, { emoji: string; label: string; cor: string; bg: string }> = {
  ensolarado:   { emoji: '☀️',  label: 'Ensolarado',   cor: '#b45309', bg: '#fffbeb' },
  nublado:      { emoji: '⛅',  label: 'Nublado',      cor: '#6b7280', bg: '#f3f4f6' },
  chuva_leve:   { emoji: '🌦️', label: 'Chuva Leve',   cor: '#0891b2', bg: '#ecfeff' },
  chuva_forte:  { emoji: '🌧️', label: 'Chuva Forte',  cor: '#2563eb', bg: '#eff6ff' },
  tempestade:   { emoji: '⛈️', label: 'Tempestade',   cor: '#7c3aed', bg: '#f5f3ff' },
  garoa:        { emoji: '🌫️', label: 'Garoa',        cor: '#0369a1', bg: '#f0f9ff' },
  vento_forte:  { emoji: '💨',  label: 'Vento Forte',  cor: '#c2410c', bg: '#fff7ed' },
}

const IMPACTO_CFG: Record<string, { label: string; cor: string; bg: string }> = {
  nenhum:       { label: 'Sem impacto',    cor: '#16a34a', bg: '#dcfce7' },
  pequeno:      { label: 'Pequeno',        cor: '#b45309', bg: '#fef3c7' },
  moderado:     { label: 'Moderado',       cor: '#ea580c', bg: '#fff7ed' },
  grande:       { label: 'Grande',         cor: '#dc2626', bg: '#fee2e2' },
  paralisacao:  { label: 'Paralisação',    cor: '#7c3aed', bg: '#f5f3ff' },
}

interface FormClima {
  obra_id: string; data: string; choveu: boolean
  precipitacao_mm: string; temperatura_max: string; temperatura_min: string
  vento_kmh: string; umidade_pct: string
  condicao: string; impacto_obra: string; observacoes: string
}

const EMPTY_FORM: FormClima = {
  obra_id: '', data: new Date().toISOString().slice(0, 10), choveu: false,
  precipitacao_mm: '', temperatura_max: '', temperatura_min: '',
  vento_kmh: '', umidade_pct: '', condicao: 'ensolarado', impacto_obra: 'nenhum', observacoes: '',
}

export default function GestorMeteorologia() {
  const hoje = new Date().toISOString().slice(0, 10)
  const mesInicio = hoje.slice(0, 8) + '01'

  const [loading, setLoading] = useState(true)
  const [rows, setRows] = useState<ClimaRow[]>([])
  const [obras, setObras] = useState<{ id: string; nome: string }[]>([])
  const [obraFiltro, setObraFiltro] = useState('todas')
  const [dtIni, setDtIni] = useState(mesInicio)
  const [dtFim, setDtFim] = useState(hoje)
  const [modal, setModal] = useState(false)
  const [form, setForm] = useState<FormClima>(EMPTY_FORM)
  const [saving, setSaving] = useState(false)
  const [editId, setEditId] = useState<string | null>(null)

  const fetchData = useCallback(async () => {
    setLoading(true)
    try {
      const [{ data }, { data: obrasData }] = await Promise.all([
        supabase.from('obra_clima')
          .select('*, obras(nome)')
          .gte('data', dtIni)
          .lte('data', dtFim)
          .order('data', { ascending: false }),
        supabase.from('obras').select('id, nome').neq('status', 'concluida').order('nome'),
      ])
      setObras(obrasData ?? [])
      setRows((data ?? []).map((r: any) => ({
        id: r.id, data: r.data, obra_id: r.obra_id,
        obra_nome: r.obras?.nome ?? '—',
        choveu: r.choveu ?? false,
        precipitacao_mm: r.precipitacao_mm,
        temperatura_max: r.temperatura_max,
        temperatura_min: r.temperatura_min,
        vento_kmh: r.vento_kmh,
        umidade_pct: r.umidade_pct,
        condicao: r.condicao ?? 'ensolarado',
        impacto_obra: r.impacto_obra ?? 'nenhum',
        observacoes: r.observacoes,
      })))
    } finally {
      setLoading(false)
    }
  }, [dtIni, dtFim])

  useEffect(() => { fetchData() }, [fetchData])

  const rowsFiltrados = useMemo(() => {
    if (obraFiltro === 'todas') return rows
    return rows.filter(r => r.obra_id === obraFiltro)
  }, [rows, obraFiltro])

  const resumo = useMemo(() => {
    const arr = rowsFiltrados
    return {
      total: arr.length,
      diasChuva: arr.filter(r => r.choveu).length,
      diasSol: arr.filter(r => !r.choveu && r.condicao === 'ensolarado').length,
      paralisacoes: arr.filter(r => r.impacto_obra === 'paralisacao').length,
      precipTotal: arr.reduce((s, r) => s + (r.precipitacao_mm ?? 0), 0),
      tempMax: arr.length > 0 ? Math.max(...arr.filter(r => r.temperatura_max).map(r => r.temperatura_max!)) : null,
      tempMin: arr.length > 0 ? Math.min(...arr.filter(r => r.temperatura_min).map(r => r.temperatura_min!)) : null,
    }
  }, [rowsFiltrados])

  const setF = (k: keyof FormClima, v: any) => setForm(p => ({ ...p, [k]: v }))

  const handleSave = async () => {
    if (!form.obra_id) { toast.error('Selecione a obra'); return }
    if (!form.data) { toast.error('Informe a data'); return }
    setSaving(true)
    try {
      const payload = {
        obra_id: form.obra_id,
        data: form.data,
        choveu: form.choveu,
        precipitacao_mm: form.precipitacao_mm ? parseFloat(form.precipitacao_mm) : null,
        temperatura_max: form.temperatura_max ? parseFloat(form.temperatura_max) : null,
        temperatura_min: form.temperatura_min ? parseFloat(form.temperatura_min) : null,
        vento_kmh: form.vento_kmh ? parseFloat(form.vento_kmh) : null,
        umidade_pct: form.umidade_pct ? parseFloat(form.umidade_pct) : null,
        condicao: form.condicao,
        impacto_obra: form.impacto_obra,
        observacoes: form.observacoes || null,
      }
      const { error } = editId
        ? await supabase.from('obra_clima').update(payload).eq('id', editId)
        : await supabase.from('obra_clima').insert(payload)
      if (error) { toast.error('Erro: ' + error.message); return }
      toast.success(editId ? 'Registro atualizado!' : 'Registro climático salvo!')
      setModal(false); setEditId(null); setForm(EMPTY_FORM); fetchData()
    } finally {
      setSaving(false)
    }
  }

  const handleEdit = (r: ClimaRow) => {
    setEditId(r.id)
    setForm({
      obra_id: r.obra_id, data: r.data, choveu: r.choveu,
      precipitacao_mm: r.precipitacao_mm ? String(r.precipitacao_mm) : '',
      temperatura_max: r.temperatura_max ? String(r.temperatura_max) : '',
      temperatura_min: r.temperatura_min ? String(r.temperatura_min) : '',
      vento_kmh: r.vento_kmh ? String(r.vento_kmh) : '',
      umidade_pct: r.umidade_pct ? String(r.umidade_pct) : '',
      condicao: r.condicao, impacto_obra: r.impacto_obra,
      observacoes: r.observacoes ?? '',
    })
    setModal(true)
  }

  // Agrupar por data para timeline
  const porData = useMemo(() => {
    const m = new Map<string, ClimaRow[]>()
    rowsFiltrados.forEach(r => {
      if (!m.has(r.data)) m.set(r.data, [])
      m.get(r.data)!.push(r)
    })
    return Array.from(m.entries()).sort((a, b) => b[0].localeCompare(a[0]))
  }, [rowsFiltrados])

  return (
    <GestorLayout>
      <div style={{ marginBottom: 20, display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', flexWrap: 'wrap', gap: 10 }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 800, margin: 0, color: '#0f172a', display: 'flex', alignItems: 'center', gap: 8 }}>
            <CloudRain size={22} color="#0369a1" /> Estação Meteorológica
          </h1>
          <p style={{ color: '#64748b', fontSize: 13, margin: '4px 0 0' }}>Registro de condições climáticas e impacto nas obras</p>
        </div>
        <button onClick={() => { setEditId(null); setForm({ ...EMPTY_FORM, obra_id: obras[0]?.id ?? '' }); setModal(true) }}
          style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 16px', borderRadius: 9, border: 'none', background: '#0369a1', color: '#fff', fontWeight: 700, fontSize: 13, cursor: 'pointer' }}>
          <Plus size={14} /> Novo Registro Climático
        </button>
      </div>

      {/* KPIs */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(155px, 1fr))', gap: 12, marginBottom: 20 }}>
        {[
          { emoji: '🌧️', label: 'Dias de Chuva', value: resumo.diasChuva, cor: '#2563eb', bg: '#eff6ff' },
          { emoji: '☀️', label: 'Dias de Sol', value: resumo.diasSol, cor: '#b45309', bg: '#fffbeb' },
          { emoji: '⚠️', label: 'Paralisações', value: resumo.paralisacoes, cor: '#dc2626', bg: '#fee2e2', alert: resumo.paralisacoes > 0 },
          { emoji: '💧', label: 'Precipitação Total', value: resumo.precipTotal.toFixed(0) + ' mm', cor: '#0891b2', bg: '#ecfeff' },
          { emoji: '🌡️', label: 'Temp. Máx.', value: resumo.tempMax != null ? `${resumo.tempMax}°C` : '—', cor: '#ea580c', bg: '#fff7ed' },
          { emoji: '❄️', label: 'Temp. Mín.', value: resumo.tempMin != null ? `${resumo.tempMin}°C` : '—', cor: '#0369a1', bg: '#f0f9ff' },
        ].map(k => (
          <div key={k.label} style={{
            background: '#fff', borderRadius: 12, border: `1px solid ${k.alert ? k.cor + '44' : '#e2e8f0'}`,
            padding: '14px 16px', textAlign: 'center',
          }}>
            <div style={{ fontSize: 24, marginBottom: 4 }}>{k.emoji}</div>
            <div style={{ fontSize: 20, fontWeight: 800, color: k.cor }}>{k.value}</div>
            <div style={{ fontSize: 10, color: '#64748b', fontWeight: 600, marginTop: 2 }}>{k.label}</div>
          </div>
        ))}
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
        <select value={obraFiltro} onChange={e => setObraFiltro(e.target.value)}
          style={{ border: '1px solid #e2e8f0', borderRadius: 8, padding: '6px 10px', fontSize: 13, background: '#fff' }}>
          <option value="todas">🏗️ Todas as obras</option>
          {obras.map(o => <option key={o.id} value={o.id}>{o.nome}</option>)}
        </select>
      </div>

      {/* Timeline */}
      {loading ? (
        <div style={{ display: 'flex', justifyContent: 'center', padding: 48 }}>
          <Loader2 size={28} color="#0369a1" style={{ animation: 'spin 1s linear infinite' }} />
        </div>
      ) : porData.length === 0 ? (
        <div style={{ background: '#fff', borderRadius: 12, border: '1px solid #e2e8f0', padding: 40, textAlign: 'center', color: '#94a3b8' }}>
          <div style={{ fontSize: 40, marginBottom: 8 }}>🌤️</div>
          <div style={{ fontSize: 14, fontWeight: 600 }}>Nenhum registro climático no período</div>
          <div style={{ fontSize: 12, marginTop: 4 }}>Clique em "Novo Registro Climático" para começar</div>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {porData.map(([data, registros]) => {
            const dataFmt = new Date(data + 'T12:00').toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: 'long' })
            const temChuva = registros.some(r => r.choveu)
            const temParalisacao = registros.some(r => r.impacto_obra === 'paralisacao')
            return (
              <div key={data} style={{ background: '#fff', borderRadius: 12, border: `1px solid ${temParalisacao ? '#dc2626' : temChuva ? '#bfdbfe' : '#e2e8f0'}`, overflow: 'hidden' }}>
                {/* Header do dia */}
                <div style={{
                  padding: '10px 16px', borderBottom: '1px solid #f1f5f9',
                  background: temParalisacao ? '#fef2f2' : temChuva ? '#eff6ff' : '#f8fafc',
                  display: 'flex', alignItems: 'center', gap: 10,
                }}>
                  <span style={{ fontSize: 18 }}>{temParalisacao ? '⚠️' : temChuva ? '🌧️' : '☀️'}</span>
                  <span style={{ fontWeight: 800, fontSize: 14, color: '#0f172a' }}>{dataFmt}</span>
                  {temParalisacao && <span style={{ fontSize: 11, background: '#fee2e2', color: '#dc2626', borderRadius: 5, padding: '1px 7px', fontWeight: 700 }}>⚠️ Paralisação</span>}
                  {temChuva && !temParalisacao && <span style={{ fontSize: 11, background: '#eff6ff', color: '#2563eb', borderRadius: 5, padding: '1px 7px', fontWeight: 700 }}>🌧️ Dia Chuvoso</span>}
                </div>
                {/* Registros do dia */}
                <div style={{ padding: '12px 16px', display: 'flex', flexDirection: 'column', gap: 10 }}>
                  {registros.map(r => {
                    const cc = CONDICAO_CFG[r.condicao] ?? CONDICAO_CFG['ensolarado']
                    const ic = IMPACTO_CFG[r.impacto_obra] ?? IMPACTO_CFG['nenhum']
                    return (
                      <div key={r.id} style={{ display: 'flex', alignItems: 'flex-start', gap: 14, padding: '10px 14px', background: '#f8fafc', borderRadius: 10, border: '1px solid #e2e8f0' }}>
                        <div style={{ fontSize: 28, flexShrink: 0 }}>{cc.emoji}</div>
                        <div style={{ flex: 1 }}>
                          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', marginBottom: 6 }}>
                            <span style={{ fontWeight: 700, fontSize: 13, color: '#374151' }}>{r.obra_nome}</span>
                            <span style={{ fontSize: 11, background: cc.bg, color: cc.cor, borderRadius: 5, padding: '1px 7px', fontWeight: 600 }}>{cc.emoji} {cc.label}</span>
                            <span style={{ fontSize: 11, background: ic.bg, color: ic.cor, borderRadius: 5, padding: '1px 7px', fontWeight: 600 }}>Impacto: {ic.label}</span>
                          </div>
                          <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', fontSize: 12, color: '#64748b' }}>
                            {r.precipitacao_mm != null && <span>💧 {r.precipitacao_mm} mm</span>}
                            {r.temperatura_max != null && <span>🌡️ {r.temperatura_max}°C máx.</span>}
                            {r.temperatura_min != null && <span>❄️ {r.temperatura_min}°C mín.</span>}
                            {r.vento_kmh != null && <span>💨 {r.vento_kmh} km/h</span>}
                            {r.umidade_pct != null && <span>💦 {r.umidade_pct}% umidade</span>}
                          </div>
                          {r.observacoes && <div style={{ fontSize: 12, color: '#374151', marginTop: 4, fontStyle: 'italic' }}>"{r.observacoes}"</div>}
                        </div>
                        <button onClick={() => handleEdit(r)}
                          style={{ flexShrink: 0, background: 'none', border: '1px solid #e2e8f0', borderRadius: 7, padding: '4px 10px', fontSize: 11, cursor: 'pointer', color: '#64748b' }}>
                          ✏️ Editar
                        </button>
                      </div>
                    )
                  })}
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* Modal */}
      {modal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 300, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
          <div style={{ background: '#fff', borderRadius: 14, width: '100%', maxWidth: 520, maxHeight: '92vh', overflow: 'auto', boxShadow: '0 20px 60px rgba(0,0,0,0.3)' }}>
            {/* Header */}
            <div style={{ padding: '16px 20px', borderBottom: '1px solid #e2e8f0', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div style={{ fontWeight: 800, fontSize: 16 }}>🌦️ {editId ? 'Editar' : 'Novo'} Registro Climático</div>
              <button onClick={() => setModal(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 18, color: '#64748b' }}>✕</button>
            </div>
            {/* Form */}
            <div style={{ padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div>
                  <label style={{ fontSize: 12, fontWeight: 700, color: '#374151', display: 'block', marginBottom: 4 }}>Obra *</label>
                  <select value={form.obra_id} onChange={e => setF('obra_id', e.target.value)}
                    style={{ width: '100%', border: '1px solid #e2e8f0', borderRadius: 8, padding: '7px 10px', fontSize: 13 }}>
                    <option value="">Selecione…</option>
                    {obras.map(o => <option key={o.id} value={o.id}>{o.nome}</option>)}
                  </select>
                </div>
                <div>
                  <label style={{ fontSize: 12, fontWeight: 700, color: '#374151', display: 'block', marginBottom: 4 }}>Data *</label>
                  <input type="date" value={form.data} onChange={e => setF('data', e.target.value)}
                    style={{ width: '100%', border: '1px solid #e2e8f0', borderRadius: 8, padding: '7px 10px', fontSize: 13, boxSizing: 'border-box' }} />
                </div>
              </div>

              {/* Condição climática */}
              <div>
                <label style={{ fontSize: 12, fontWeight: 700, color: '#374151', display: 'block', marginBottom: 6 }}>Condição Climática</label>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                  {Object.entries(CONDICAO_CFG).map(([k, v]) => (
                    <button key={k} onClick={() => { setF('condicao', k); setF('choveu', k.includes('chuva') || k === 'garoa' || k === 'tempestade') }}
                      style={{
                        padding: '6px 12px', borderRadius: 8, border: `2px solid ${form.condicao === k ? v.cor : '#e2e8f0'}`,
                        background: form.condicao === k ? v.bg : '#fff', color: form.condicao === k ? v.cor : '#64748b',
                        fontWeight: 600, fontSize: 12, cursor: 'pointer',
                      }}>
                      {v.emoji} {v.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Toggle choveu */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <button type="button" onClick={() => setF('choveu', !form.choveu)}
                  style={{ position: 'relative', display: 'inline-flex', width: 44, height: 24, borderRadius: 12, border: 'none', cursor: 'pointer', background: form.choveu ? '#2563eb' : 'rgba(0,0,0,0.15)', transition: 'background 150ms', flexShrink: 0 }}>
                  <span style={{ position: 'absolute', top: 3, left: form.choveu ? 22 : 3, width: 18, height: 18, borderRadius: '50%', background: '#fff', transition: 'left 150ms' }} />
                </button>
                <span style={{ fontSize: 13, fontWeight: 600, color: form.choveu ? '#2563eb' : '#374151' }}>
                  {form.choveu ? '🌧️ Choveu neste dia' : '☀️ Não choveu'}
                </span>
              </div>

              {/* Medições */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10 }}>
                {[
                  { key: 'precipitacao_mm', label: '💧 Chuva (mm)', show: form.choveu },
                  { key: 'temperatura_max', label: '🌡️ Temp. Máx. (°C)', show: true },
                  { key: 'temperatura_min', label: '❄️ Temp. Mín. (°C)', show: true },
                  { key: 'vento_kmh', label: '💨 Vento (km/h)', show: true },
                  { key: 'umidade_pct', label: '💦 Umidade (%)', show: true },
                ].filter(f => f.show).map(f => (
                  <div key={f.key}>
                    <label style={{ fontSize: 11, fontWeight: 700, color: '#374151', display: 'block', marginBottom: 3 }}>{f.label}</label>
                    <input type="number" step="0.1" value={(form as any)[f.key]} onChange={e => setF(f.key as any, e.target.value)}
                      style={{ width: '100%', border: '1px solid #e2e8f0', borderRadius: 8, padding: '6px 8px', fontSize: 13, boxSizing: 'border-box' }}
                      placeholder="0" />
                  </div>
                ))}
              </div>

              {/* Impacto na obra */}
              <div>
                <label style={{ fontSize: 12, fontWeight: 700, color: '#374151', display: 'block', marginBottom: 6 }}>Impacto na Obra</label>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                  {Object.entries(IMPACTO_CFG).map(([k, v]) => (
                    <button key={k} onClick={() => setF('impacto_obra', k)}
                      style={{
                        padding: '6px 12px', borderRadius: 8, border: `2px solid ${form.impacto_obra === k ? v.cor : '#e2e8f0'}`,
                        background: form.impacto_obra === k ? v.bg : '#fff', color: form.impacto_obra === k ? v.cor : '#64748b',
                        fontWeight: 600, fontSize: 12, cursor: 'pointer',
                      }}>
                      {v.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Observações */}
              <div>
                <label style={{ fontSize: 12, fontWeight: 700, color: '#374151', display: 'block', marginBottom: 3 }}>Observações</label>
                <textarea value={form.observacoes} onChange={e => setF('observacoes', e.target.value)} rows={2}
                  placeholder="Detalhes sobre o clima, impacto nas atividades…"
                  style={{ width: '100%', border: '1px solid #e2e8f0', borderRadius: 8, padding: '8px 10px', fontSize: 13, boxSizing: 'border-box', resize: 'vertical' }} />
              </div>
            </div>
            {/* Footer */}
            <div style={{ padding: '12px 20px', borderTop: '1px solid #e2e8f0', display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
              <button onClick={() => setModal(false)} style={{ padding: '8px 16px', borderRadius: 8, border: '1px solid #e2e8f0', background: '#fff', cursor: 'pointer', fontWeight: 600, color: '#64748b' }}>
                Cancelar
              </button>
              <button onClick={handleSave} disabled={saving}
                style={{ padding: '8px 20px', borderRadius: 8, border: 'none', background: saving ? '#94a3b8' : '#0369a1', color: '#fff', fontWeight: 700, cursor: saving ? 'not-allowed' : 'pointer' }}>
                {saving ? 'Salvando…' : editId ? 'Atualizar' : '💾 Salvar Registro'}
              </button>
            </div>
          </div>
        </div>
      )}
    </GestorLayout>
  )
}
