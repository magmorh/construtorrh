import React, { useEffect, useState, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '@/lib/supabase'
import { getPortalSession } from '@/hooks/usePortalAuth'
import PortalLayout from './PortalLayout'
import { Bus, FileText, CheckCircle2, Loader2, Shield, MapPin } from 'lucide-react'

interface VTRow {
  id: string
  competencia: string
  data_inicio: string | null
  data_fim: string | null
  dias_trabalhados: number
  valor: number
  valor_empresa: number
  desconto_colaborador: number | null
  tipo: string | null
  status: string
  data_pagamento: string | null
  observacoes: string | null
}

interface AceiteVT {
  id: string
  vt_id: string
  aceito_em: string
  ip_address: string | null
  user_agent: string | null
  device_fingerprint: string | null
  geo_lat: number | null
  geo_lng: number | null
  plataforma: string | null
  fuso_horario: string | null
}

const STATUS_VT: Record<string, { label: string; bg: string; cor: string }> = {
  pago:                { label: '✅ Pago',        bg: '#dcfce7', cor: '#15803d' },
  aguardando_pagamento:{ label: '⏳ Aguardando',  bg: '#fef3c7', cor: '#b45309' },
  cancelado:           { label: '❌ Cancelado',   bg: '#fee2e2', cor: '#dc2626' },
}

function fmtData(s: string | null) {
  if (!s) return '—'
  const [y, m, d] = s.split('-')
  return `${d}/${m}/${y}`
}
function fmtBRL(v: number) {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v)
}
function fmtComp(c: string) {
  if (!c) return '—'
  const [y, m] = c.split('-')
  const meses = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro']
  return `${meses[parseInt(m) - 1]}/${y}`
}

// ── Fingerprint do dispositivo ──────────────────────────────────────────────
async function getDeviceFingerprint(): Promise<string> {
  try {
    const canvas = document.createElement('canvas')
    const ctx = canvas.getContext('2d')
    if (ctx) {
      ctx.textBaseline = 'top'; ctx.font = '14px Arial'
      ctx.fillText('ConstrutorRH🏗️', 2, 2)
    }
    const canvasData = canvas.toDataURL()
    const raw = [
      navigator.userAgent,
      navigator.language,
      screen.width + 'x' + screen.height + 'x' + screen.colorDepth,
      new Date().getTimezoneOffset().toString(),
      navigator.hardwareConcurrency?.toString() ?? '',
      (navigator as any).deviceMemory?.toString() ?? '',
      canvasData.slice(-60),
      Intl.DateTimeFormat().resolvedOptions().timeZone,
    ].join('|')
    // Hash simples (djb2)
    let hash = 5381
    for (let i = 0; i < raw.length; i++) {
      hash = ((hash << 5) + hash) ^ raw.charCodeAt(i)
      hash = hash & hash
    }
    return Math.abs(hash).toString(16).toUpperCase().padStart(8, '0')
  } catch {
    return 'UNKNOWN'
  }
}

async function getIpPublico(): Promise<string> {
  try {
    const r = await fetch('https://api.ipify.org?format=json', { signal: AbortSignal.timeout(3000) })
    const j = await r.json()
    return j.ip ?? 'desconhecido'
  } catch { return 'desconhecido' }
}

function getPlataforma(): string {
  const ua = navigator.userAgent
  if (/Android/i.test(ua)) return 'Android'
  if (/iPhone|iPad/i.test(ua)) return 'iOS'
  if (/Windows/i.test(ua)) return 'Windows'
  if (/Mac/i.test(ua)) return 'macOS'
  if (/Linux/i.test(ua)) return 'Linux'
  return 'Desconhecido'
}

function getPosicao(): Promise<{ lat: number; lng: number; accuracy: number } | null> {
  return new Promise(resolve => {
    if (!navigator.geolocation) { resolve(null); return }
    navigator.geolocation.getCurrentPosition(
      p => resolve({ lat: p.coords.latitude, lng: p.coords.longitude, accuracy: p.coords.accuracy }),
      () => resolve(null),
      { timeout: 5000, maximumAge: 60000 }
    )
  })
}

// ── Gerador de PDF com carimbo de aceite ────────────────────────────────────
function gerarReciboPdf(vt: VTRow, nomeColab: string, cpfColab: string, aceite?: AceiteVT | null) {
  const status = STATUS_VT[vt.status]?.label ?? vt.status
  const periodo = vt.data_inicio && vt.data_fim
    ? `${fmtData(vt.data_inicio)} a ${fmtData(vt.data_fim)}`
    : fmtComp(vt.competencia)

  const carimboHtml = aceite ? `
    <div style="background:#f0fdf4;border:2px solid #22c55e;border-radius:8px;padding:10px 14px;margin-bottom:10px">
      <div style="display:flex;align-items:center;gap:8px;margin-bottom:6px">
        <span style="font-size:16px">✅</span>
        <div>
          <div style="font-size:11px;font-weight:800;color:#15803d">ACEITE DIGITAL CONFIRMADO</div>
          <div style="font-size:9px;color:#16a34a">${new Date(aceite.aceito_em).toLocaleString('pt-BR')} (Horário de Brasília)</div>
        </div>
      </div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:6px;font-size:9px;color:#374151">
        <div><span style="font-weight:700;color:#166534">IP:</span> ${aceite.ip_address ?? '—'}</div>
        <div><span style="font-weight:700;color:#166534">Plataforma:</span> ${aceite.plataforma ?? '—'}</div>
        <div><span style="font-weight:700;color:#166534">Device ID:</span> ${aceite.device_fingerprint ?? '—'}</div>
        <div><span style="font-weight:700;color:#166534">Fuso:</span> ${aceite.fuso_horario ?? '—'}</div>
        ${aceite.geo_lat ? `<div style="grid-column:span 2"><span style="font-weight:700;color:#166534">GPS:</span> ${aceite.geo_lat?.toFixed(6)}, ${aceite.geo_lng?.toFixed(6)}</div>` : ''}
        <div style="grid-column:span 2;font-size:8px;color:#6b7280;font-style:italic;margin-top:2px">${(aceite.user_agent ?? '').slice(0, 90)}</div>
      </div>
    </div>` : `
    <div style="background:#fef9c3;border:1.5px dashed #d97706;border-radius:8px;padding:8px 14px;margin-bottom:10px;font-size:10px;color:#92400e;text-align:center">
      ⚠️ Aceite digital pendente — colaborador ainda não assinou este recibo
    </div>`

  const html = `<!DOCTYPE html><html lang="pt-BR"><head><meta charset="UTF-8">
<style>*{margin:0;padding:0;box-sizing:border-box}body{font-family:'Segoe UI',Arial,sans-serif;font-size:11px;color:#111;background:#fff}@page{size:A4 portrait;margin:0}.page{width:210mm;min-height:297mm;padding:12mm;background:#fff}</style>
</head><body><div class="page">
<div style="background:#1e3a5f;padding:12px 18px;border-radius:8px;display:flex;justify-content:space-between;align-items:center;margin-bottom:14px">
  <div><div style="color:#fff;font-size:17px;font-weight:800">🚌 Recibo de Vale Transporte</div><div style="color:rgba(255,255,255,.7);font-size:10px;margin-top:2px">Comprovante de pagamento em dinheiro — ${fmtComp(vt.competencia)}</div></div>
  <div style="text-align:right"><div style="color:#93c5fd;font-size:12px;font-weight:700">${status}</div></div>
</div>
<div style="background:#f0f4f8;border-radius:8px;padding:10px 14px;margin-bottom:12px">
  <div style="display:grid;grid-template-columns:2fr 1fr 1fr 1fr;gap:8px">
    <div><div style="font-size:8px;text-transform:uppercase;color:#6b7280;font-weight:700;margin-bottom:2px">Colaborador</div><div style="font-size:13px;font-weight:800">${nomeColab}</div></div>
    <div><div style="font-size:8px;text-transform:uppercase;color:#6b7280;font-weight:700;margin-bottom:2px">CPF</div><div style="font-size:11px">${cpfColab || '—'}</div></div>
    <div><div style="font-size:8px;text-transform:uppercase;color:#6b7280;font-weight:700;margin-bottom:2px">Competência</div><div style="font-size:12px;font-weight:700">${fmtComp(vt.competencia)}</div></div>
    <div><div style="font-size:8px;text-transform:uppercase;color:#6b7280;font-weight:700;margin-bottom:2px">Período</div><div style="font-size:10px">${periodo}</div></div>
  </div>
</div>
<table style="width:100%;border-collapse:collapse;border:1px solid #e2e8f0;border-radius:8px;overflow:hidden;margin-bottom:12px">
  <thead><tr style="background:#1a56a0">
    <th style="padding:7px 10px;color:#fff;font-size:9px;font-weight:700;text-align:left">PERÍODO</th>
    <th style="padding:7px 10px;color:#fff;font-size:9px;font-weight:700;text-align:center">DIAS</th>
    <th style="padding:7px 10px;color:#fff;font-size:9px;font-weight:700;text-align:right">VT EMPRESA</th>
    ${vt.desconto_colaborador ? `<th style="padding:7px 10px;color:#fff;font-size:9px;font-weight:700;text-align:right">DESC. COLAB.</th>` : ''}
    <th style="padding:7px 10px;color:#fff;font-size:9px;font-weight:700;text-align:right">TOTAL PAGO</th>
    <th style="padding:7px 10px;color:#fff;font-size:9px;font-weight:700;text-align:center">FORMA</th>
    <th style="padding:7px 10px;color:#fff;font-size:9px;font-weight:700;text-align:center">DATA PAG.</th>
  </tr></thead>
  <tbody><tr style="background:#f8fafc">
    <td style="padding:8px 10px;font-weight:600">${periodo}</td>
    <td style="padding:8px 10px;text-align:center;font-weight:700;color:#1d4ed8">${vt.dias_trabalhados}</td>
    <td style="padding:8px 10px;text-align:right;font-weight:700">${fmtBRL(vt.valor_empresa)}</td>
    ${vt.desconto_colaborador ? `<td style="padding:8px 10px;text-align:right;color:#dc2626;font-weight:600">−${fmtBRL(vt.desconto_colaborador)}</td>` : ''}
    <td style="padding:8px 10px;text-align:right;font-weight:900;font-size:14px;color:#15803d">${fmtBRL(vt.valor)}</td>
    <td style="padding:8px 10px;text-align:center;font-weight:700;color:#7c3aed;font-size:11px">${(vt.tipo ?? 'DINHEIRO').toUpperCase()}</td>
    <td style="padding:8px 10px;text-align:center;font-weight:600">${fmtData(vt.data_pagamento)}</td>
  </tr></tbody>
</table>
${carimboHtml}
<div style="background:#fffbeb;border:1px solid #fde68a;border-radius:6px;padding:8px 12px;margin-bottom:14px;font-size:10px;color:#92400e">
  ⚖️ <strong>Declaração:</strong> O(a) colaborador(a) acima identificado(a) declara ter recebido o vale transporte em <strong>${(vt.tipo ?? 'DINHEIRO').toUpperCase()}</strong>, conforme Lei 7.418/85 e Decreto 95.247/87.
</div>
<div style="display:grid;grid-template-columns:1fr 1fr;gap:40px;margin-top:16px;padding-top:20px;border-top:1px solid #e5e7eb">
  <div style="border-top:1.5px solid #1a56a0;padding-top:6px;text-align:center">
    <div style="font-size:10px;color:#374151;font-weight:600">${nomeColab.toUpperCase()}</div>
    <div style="font-size:9px;color:#9ca3af">Colaborador(a) — Assinatura</div>
  </div>
  <div style="border-top:1.5px solid #1a56a0;padding-top:6px;text-align:center">
    <div style="font-size:10px;color:#374151">___________________________</div>
    <div style="font-size:9px;color:#9ca3af">Responsável RH / Carimbo</div>
  </div>
</div>
</div><script>window.onload=()=>window.print()</script></body></html>`

  const iframe = document.createElement('iframe')
  iframe.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0'
  document.body.appendChild(iframe)
  const doc = (iframe.contentWindow?.document || (iframe as any).contentDocument) as Document
  doc.open(); doc.write(html); doc.close()
  const ios = /iPad|iPhone|iPod/.test(navigator.userAgent)
  if (ios) {
    setTimeout(() => { iframe.contentWindow?.focus(); iframe.contentWindow?.print(); setTimeout(() => document.body.removeChild(iframe), 2000) }, 800)
  } else {
    iframe.onload = () => { iframe.contentWindow?.focus(); iframe.contentWindow?.print(); setTimeout(() => document.body.removeChild(iframe), 1000) }
  }
}

export default function PortalValeTransporte() {
  const nav     = useNavigate()
  const session = getPortalSession()

  const [registros,   setRegistros]   = useState<VTRow[]>([])
  const [aceites,     setAceites]     = useState<Record<string, AceiteVT>>({})
  const [loading,     setLoading]     = useState(false)
  const [nomeColab,   setNomeColab]   = useState('')
  const [cpfColab,    setCpfColab]    = useState('')

  // Modal de aceite
  const [modalAceite, setModalAceite] = useState<VTRow | null>(null)
  const [salvando,    setSalvando]    = useState(false)
  const [geo,         setGeo]         = useState<{lat:number;lng:number;accuracy:number}|null>(null)
  const [geoStatus,   setGeoStatus]   = useState<'idle'|'buscando'|'ok'|'negado'>('idle')
  const [fp,          setFp]          = useState('')

  const carregar = useCallback(async () => {
    if (!session) { nav('/portal'); return }
    setLoading(true)
    const { data: colab } = await supabase.from('colaboradores').select('nome,cpf').eq('id', session.colaborador_id).maybeSingle()
    if (colab) { setNomeColab(colab.nome ?? ''); setCpfColab(colab.cpf ?? '') }
    const { data: vts } = await supabase.from('vale_transporte')
      .select('id,competencia,data_inicio,data_fim,dias_trabalhados,valor,valor_empresa,desconto_colaborador,tipo,status,data_pagamento,observacoes')
      .eq('colaborador_id', session.colaborador_id)
      .order('competencia', { ascending: false })
    const lista = vts ?? []
    setRegistros(lista)
    // Buscar aceites existentes
    if (lista.length > 0) {
      const ids = lista.map(v => v.id)
      const { data: ac } = await supabase.from('vt_aceites').select('*').in('vt_id', ids)
      const m: Record<string, AceiteVT> = {}
      for (const a of (ac ?? []) as AceiteVT[]) m[a.vt_id] = a
      setAceites(m)
    }
    setLoading(false)
  }, [session, nav])

  useEffect(() => { carregar() }, [carregar])

  // Pré-calcular fingerprint ao montar
  useEffect(() => {
    getDeviceFingerprint().then(setFp)
  }, [])

  async function solicitarGeo() {
    setGeoStatus('buscando')
    const pos = await getPosicao()
    if (pos) { setGeo(pos); setGeoStatus('ok') }
    else setGeoStatus('negado')
  }

  async function confirmarAceite() {
    if (!modalAceite || !session) return
    setSalvando(true)
    try {
      const ip  = await getIpPublico()
      const now = new Date().toISOString()
      const fingerprint = fp || await getDeviceFingerprint()
      const payload: Record<string, unknown> = {
        vt_id:             modalAceite.id,
        colaborador_id:    session.colaborador_id,
        nome_colaborador:  nomeColab,
        cpf_colaborador:   cpfColab,
        competencia:       modalAceite.competencia,
        aceito_em:         now,
        ip_address:        ip,
        user_agent:        navigator.userAgent.slice(0, 300),
        device_fingerprint:fingerprint,
        plataforma:        getPlataforma(),
        idioma:            navigator.language,
        fuso_horario:      Intl.DateTimeFormat().resolvedOptions().timeZone,
      }
      if (geo) { payload.geo_lat = geo.lat; payload.geo_lng = geo.lng; payload.geo_accuracy = geo.accuracy }

      const { data: inserted, error } = await supabase.from('vt_aceites')
        .upsert(payload, { onConflict: 'vt_id,colaborador_id' })
        .select().single()

      if (!error && inserted) {
        setAceites(prev => ({ ...prev, [modalAceite.id]: inserted as AceiteVT }))
      }
      setModalAceite(null)
      setGeo(null); setGeoStatus('idle')
    } finally { setSalvando(false) }
  }

  if (!session) return null

  const totalPago = registros.filter(r => r.status === 'pago').reduce((s, r) => s + r.valor, 0)
  const totalAceites = Object.keys(aceites).length

  return (
    <PortalLayout>
      <div style={{ padding: '0 0 80px' }}>
        {/* Header */}
        <div style={{ padding: '16px 14px 0', marginBottom: 12 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
            <div style={{ width: 38, height: 38, borderRadius: 10, background: 'linear-gradient(135deg,#7c3aed,#6d28d9)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Bus size={20} color="#fff" />
            </div>
            <div>
              <h1 style={{ fontWeight: 800, fontSize: 18, margin: 0, color: '#0f172a' }}>Vale Transporte</h1>
              <p style={{ fontSize: 11, color: '#64748b', margin: 0 }}>Histórico, aceite digital e comprovantes</p>
            </div>
          </div>

          {!loading && registros.length > 0 && (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 8, marginBottom: 12 }}>
              <div style={{ background: '#f5f3ff', border: '1px solid #ddd6fe', borderRadius: 10, padding: '10px 8px', textAlign: 'center' }}>
                <div style={{ fontSize: 20, fontWeight: 800, color: '#7c3aed' }}>{registros.length}</div>
                <div style={{ fontSize: 9, color: '#7c3aed', fontWeight: 600 }}>PERÍODOS</div>
              </div>
              <div style={{ background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: 10, padding: '10px 8px', textAlign: 'center' }}>
                <div style={{ fontSize: 15, fontWeight: 800, color: '#15803d' }}>{fmtBRL(totalPago)}</div>
                <div style={{ fontSize: 9, color: '#15803d', fontWeight: 600 }}>TOTAL RECEBIDO</div>
              </div>
              <div style={{ background: totalAceites > 0 ? '#f0fdf4' : '#fefce8', border: `1px solid ${totalAceites > 0 ? '#bbf7d0' : '#fde68a'}`, borderRadius: 10, padding: '10px 8px', textAlign: 'center' }}>
                <div style={{ fontSize: 20, fontWeight: 800, color: totalAceites > 0 ? '#15803d' : '#b45309' }}>{totalAceites}</div>
                <div style={{ fontSize: 9, color: totalAceites > 0 ? '#15803d' : '#b45309', fontWeight: 600 }}>ASSINADOS</div>
              </div>
            </div>
          )}
        </div>

        {/* Lista */}
        {loading ? (
          <div style={{ textAlign: 'center', padding: 48, color: '#94a3b8' }}>
            <Loader2 size={24} style={{ margin: '0 auto 8px', display: 'block' }} className="animate-spin"/>
            <div style={{ fontSize: 13 }}>Carregando…</div>
          </div>
        ) : registros.length === 0 ? (
          <div style={{ margin: '0 14px', background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 12, padding: 40, textAlign: 'center', color: '#94a3b8' }}>
            <Bus size={36} style={{ opacity: .25, margin: '0 auto 10px', display: 'block' }} />
            <div style={{ fontWeight: 600 }}>Nenhum VT registrado</div>
          </div>
        ) : (
          <div style={{ padding: '0 14px', display: 'flex', flexDirection: 'column', gap: 10 }}>
            {registros.map(vt => {
              const st    = STATUS_VT[vt.status] ?? { label: vt.status, bg: '#f3f4f6', cor: '#6b7280' }
              const aceite = aceites[vt.id]
              const assinado = !!aceite
              return (
                <div key={vt.id} style={{ background: '#fff', border: `1.5px solid ${assinado ? '#86efac' : '#e2e8f0'}`, borderRadius: 12, overflow: 'hidden', boxShadow: '0 1px 4px rgba(0,0,0,0.05)' }}>
                  <div style={{ height: 3, background: assinado ? '#22c55e' : vt.status === 'pago' ? '#16a34a' : vt.status === 'cancelado' ? '#ef4444' : '#f59e0b' }} />
                  <div style={{ padding: '12px 14px' }}>
                    {/* Linha 1 */}
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                      <div style={{ fontWeight: 800, fontSize: 15, color: '#1e293b' }}>🗓️ {fmtComp(vt.competencia)}</div>
                      <span style={{ background: st.bg, color: st.cor, fontSize: 11, fontWeight: 700, borderRadius: 6, padding: '3px 9px' }}>{st.label}</span>
                    </div>

                    {/* Badge aceite */}
                    {assinado ? (
                      <div style={{ background: '#dcfce7', border: '1px solid #86efac', borderRadius: 8, padding: '6px 10px', marginBottom: 8, display: 'flex', alignItems: 'center', gap: 6 }}>
                        <Shield size={13} color="#15803d"/>
                        <div style={{ flex: 1 }}>
                          <div style={{ fontSize: 11, fontWeight: 800, color: '#15803d' }}>✅ Recibo assinado digitalmente</div>
                          <div style={{ fontSize: 10, color: '#16a34a' }}>{new Date(aceite.aceito_em).toLocaleString('pt-BR')} · IP: {aceite.ip_address} · {aceite.plataforma}</div>
                          {aceite.geo_lat && <div style={{ fontSize: 9, color: '#16a34a' }}>📍 GPS: {aceite.geo_lat.toFixed(5)}, {aceite.geo_lng?.toFixed(5)}</div>}
                        </div>
                      </div>
                    ) : (
                      <div style={{ background: '#fef9c3', border: '1px solid #fde68a', borderRadius: 8, padding: '6px 10px', marginBottom: 8, display: 'flex', alignItems: 'center', gap: 6 }}>
                        <Shield size={13} color="#b45309"/>
                        <div style={{ fontSize: 11, color: '#b45309', fontWeight: 600 }}>⚠️ Recibo pendente de assinatura</div>
                      </div>
                    )}

                    {/* Período */}
                    {vt.data_inicio && <div style={{ fontSize: 11, color: '#64748b', marginBottom: 8 }}>📅 {fmtData(vt.data_inicio)} → {fmtData(vt.data_fim)}</div>}

                    {/* Grid valores */}
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 6, marginBottom: 10 }}>
                      <div style={{ background: '#f8fafc', borderRadius: 8, padding: '8px 8px', textAlign: 'center' }}>
                        <div style={{ fontSize: 9, color: '#94a3b8', fontWeight: 600 }}>DIAS</div>
                        <div style={{ fontSize: 16, fontWeight: 800, color: '#1d4ed8' }}>{vt.dias_trabalhados}</div>
                      </div>
                      <div style={{ background: '#f0fdf4', borderRadius: 8, padding: '8px 8px', textAlign: 'center' }}>
                        <div style={{ fontSize: 9, color: '#15803d', fontWeight: 600 }}>VT PAGO</div>
                        <div style={{ fontSize: 14, fontWeight: 900, color: '#15803d' }}>{fmtBRL(vt.valor)}</div>
                      </div>
                      <div style={{ background: '#faf5ff', borderRadius: 8, padding: '8px 8px', textAlign: 'center' }}>
                        <div style={{ fontSize: 9, color: '#7c3aed', fontWeight: 600 }}>FORMA</div>
                        <div style={{ fontSize: 11, fontWeight: 800, color: '#7c3aed', textTransform: 'uppercase' }}>{vt.tipo ?? 'dinheiro'}</div>
                      </div>
                    </div>

                    {/* Botões */}
                    <div style={{ display: 'flex', gap: 8 }}>
                      {!assinado && (
                        <button onClick={() => { setModalAceite(vt); setGeo(null); setGeoStatus('idle') }}
                          style={{ flex: 1, height: 42, borderRadius: 9, border: 'none', background: 'linear-gradient(135deg,#15803d,#16a34a)', color: '#fff', fontWeight: 800, fontSize: 13, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 7, boxShadow: '0 2px 8px rgba(21,128,61,0.3)' }}>
                          <CheckCircle2 size={15}/> Assinar Recibo
                        </button>
                      )}
                      <button onClick={() => gerarReciboPdf(vt, nomeColab, cpfColab, aceite)}
                        style={{ flex: assinado ? 1 : 0, minWidth: 44, height: 42, borderRadius: 9, border: '1.5px solid #7c3aed', background: '#f5f3ff', color: '#7c3aed', fontWeight: 700, fontSize: 13, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
                        <FileText size={15}/>{assinado ? ' Baixar Comprovante' : ''}
                      </button>
                    </div>
                  </div>
                </div>
              )
            })}

            <div style={{ background: '#fffbeb', border: '1px solid #fde68a', borderRadius: 10, padding: '12px 14px', fontSize: 11, color: '#92400e', lineHeight: 1.6 }}>
              ⚖️ <strong>Lei 7.418/85:</strong> O vale transporte é pago em dinheiro. O aceite digital com IP, fingerprint do dispositivo e GPS comprova o recebimento.
            </div>
          </div>
        )}
      </div>

      {/* ══ MODAL ACEITE DIGITAL ══════════════════════════════════════════════════ */}
      {modalAceite && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.65)', zIndex: 100, display: 'flex', alignItems: 'flex-end', justifyContent: 'center' }}
          onClick={e => { if (e.target === e.currentTarget && !salvando) setModalAceite(null) }}>
          <div style={{ background: '#fff', borderRadius: '20px 20px 0 0', width: '100%', maxWidth: 480, maxHeight: '92dvh', overflowY: 'auto', paddingBottom: 'env(safe-area-inset-bottom, 20px)' }}>

            {/* Header */}
            <div style={{ background: 'linear-gradient(135deg,#15803d,#059669)', padding: '18px 20px 14px', borderRadius: '20px 20px 0 0' }}>
              <div style={{ fontWeight: 900, fontSize: 17, color: '#fff', display: 'flex', alignItems: 'center', gap: 8 }}>
                <Shield size={20} color="#fff"/> Assinar Recibo Digitalmente
              </div>
              <div style={{ color: '#bbf7d0', fontSize: 12, marginTop: 3 }}>VT de {fmtComp(modalAceite.competencia)} · {fmtBRL(modalAceite.valor)}</div>
            </div>

            <div style={{ padding: '18px 20px', display: 'flex', flexDirection: 'column', gap: 14 }}>

              {/* Declaração */}
              <div style={{ background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: 10, padding: '12px 14px' }}>
                <div style={{ fontWeight: 800, fontSize: 13, color: '#14532d', marginBottom: 6 }}>📋 Declaração</div>
                <div style={{ fontSize: 12, color: '#374151', lineHeight: 1.7 }}>
                  Eu, <strong>{nomeColab}</strong>, declaro que recebi o vale transporte referente ao período de{' '}
                  <strong>{fmtData(modalAceite.data_inicio)} a {fmtData(modalAceite.data_fim)}</strong> no valor de{' '}
                  <strong>{fmtBRL(modalAceite.valor)}</strong>, pago em{' '}
                  <strong>{(modalAceite.tipo ?? 'dinheiro').toUpperCase()}</strong>.
                </div>
              </div>

              {/* Evidências coletadas */}
              <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 10, padding: '12px 14px' }}>
                <div style={{ fontWeight: 700, fontSize: 11, color: '#374151', marginBottom: 8, textTransform: 'uppercase', letterSpacing: '.04em' }}>🔒 Evidências Digitais</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6, fontSize: 11 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span style={{ color: '#6b7280' }}>Dispositivo</span>
                    <span style={{ fontWeight: 700, color: '#1e293b' }}>{getPlataforma()}</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span style={{ color: '#6b7280' }}>Device ID</span>
                    <span style={{ fontWeight: 700, color: '#7c3aed', fontFamily: 'monospace' }}>{fp || '…'}</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span style={{ color: '#6b7280' }}>Fuso horário</span>
                    <span style={{ fontWeight: 700, color: '#1e293b' }}>{Intl.DateTimeFormat().resolvedOptions().timeZone}</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span style={{ color: '#6b7280' }}>Data/hora</span>
                    <span style={{ fontWeight: 700, color: '#1e293b' }}>{new Date().toLocaleString('pt-BR')}</span>
                  </div>
                </div>
              </div>

              {/* Geolocalização — opcional mas recomendado */}
              <div style={{ background: geoStatus === 'ok' ? '#f0fdf4' : '#fffbeb', border: `1px solid ${geoStatus === 'ok' ? '#86efac' : '#fde68a'}`, borderRadius: 10, padding: '12px 14px' }}>
                <div style={{ fontWeight: 700, fontSize: 11, color: '#374151', marginBottom: 8, textTransform: 'uppercase', letterSpacing: '.04em' }}>📍 Localização GPS (recomendado)</div>
                {geoStatus === 'idle' && (
                  <button onClick={solicitarGeo}
                    style={{ width: '100%', height: 38, borderRadius: 8, border: '1.5px solid #d97706', background: '#fffbeb', color: '#b45309', fontWeight: 700, fontSize: 12, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
                    <MapPin size={14}/> Compartilhar localização (opcional)
                  </button>
                )}
                {geoStatus === 'buscando' && (
                  <div style={{ textAlign: 'center', color: '#b45309', fontSize: 12, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
                    <Loader2 size={14} className="animate-spin"/> Obtendo GPS…
                  </div>
                )}
                {geoStatus === 'ok' && geo && (
                  <div style={{ fontSize: 11, color: '#15803d', fontWeight: 600 }}>
                    ✅ GPS obtido: {geo.lat.toFixed(5)}, {geo.lng.toFixed(5)} (±{Math.round(geo.accuracy)}m)
                  </div>
                )}
                {geoStatus === 'negado' && (
                  <div style={{ fontSize: 11, color: '#b45309' }}>⚠️ GPS não disponível — assinatura prosseguirá sem localização</div>
                )}
              </div>

              {/* Botões */}
              <div style={{ display: 'flex', gap: 10 }}>
                <button onClick={() => { setModalAceite(null); setGeo(null); setGeoStatus('idle') }} disabled={salvando}
                  style={{ flex: 1, height: 48, borderRadius: 12, border: '2px solid #e2e8f0', background: '#f8fafc', color: '#374151', fontWeight: 700, fontSize: 13, cursor: salvando ? 'not-allowed' : 'pointer' }}>
                  Cancelar
                </button>
                <button onClick={confirmarAceite} disabled={salvando}
                  style={{ flex: 2, height: 48, borderRadius: 12, border: 'none', background: salvando ? '#94a3b8' : 'linear-gradient(135deg,#15803d,#16a34a)', color: '#fff', fontWeight: 800, fontSize: 14, cursor: salvando ? 'not-allowed' : 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
                  {salvando ? <><Loader2 size={16} className="animate-spin"/>Registrando…</> : <><Shield size={16}/>✅ Confirmar Aceite</>}
                </button>
              </div>

              <div style={{ fontSize: 10, color: '#9ca3af', textAlign: 'center', lineHeight: 1.5 }}>
                Ao confirmar, seu IP, device ID e localização (se fornecida) serão registrados como prova jurídica do recebimento.
              </div>
            </div>
          </div>
        </div>
      )}
    </PortalLayout>
  )
}
