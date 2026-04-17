import React, { useEffect, useState, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '@/lib/supabase'
import { getPortalSession } from '@/hooks/usePortalAuth'
import PortalLayout from './PortalLayout'
import { Bus, Download, FileText } from 'lucide-react'

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

const STATUS_VT: Record<string, { label: string; bg: string; cor: string }> = {
  pago:               { label: '✅ Pago',             bg: '#dcfce7', cor: '#15803d' },
  aguardando_pagamento:{ label: '⏳ Aguardando',       bg: '#fef3c7', cor: '#b45309' },
  cancelado:          { label: '❌ Cancelado',         bg: '#fee2e2', cor: '#dc2626' },
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
  const meses = ['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez']
  return `${meses[parseInt(m) - 1]}/${y}`
}

function gerarReciboPdf(vt: VTRow, nomeColab: string, cpfColab: string) {
  const status = STATUS_VT[vt.status]?.label ?? vt.status
  const periodo = vt.data_inicio && vt.data_fim
    ? `${fmtData(vt.data_inicio)} a ${fmtData(vt.data_fim)}`
    : fmtComp(vt.competencia)
  const html = `<!DOCTYPE html><html lang="pt-BR"><head><meta charset="UTF-8">
<style>
*{margin:0;padding:0;box-sizing:border-box}
body{font-family:'Segoe UI',Arial,sans-serif;font-size:12px;color:#111;background:#fff}
@page{size:A5 landscape;margin:0}
.page{width:148mm;min-height:105mm;padding:10mm;background:#fff}
</style></head><body><div class="page">

<!-- Header -->
<div style="background:#1e3a5f;padding:10px 14px;border-radius:8px;display:flex;justify-content:space-between;align-items:center;margin-bottom:12px">
  <div>
    <div style="color:#fff;font-size:15px;font-weight:800">🚌 Recibo de Vale Transporte</div>
    <div style="color:rgba(255,255,255,.7);font-size:10px;margin-top:2px">Comprovante de pagamento em dinheiro</div>
  </div>
  <div style="text-align:right">
    <div style="color:#93c5fd;font-size:11px;font-weight:700">${fmtComp(vt.competencia)}</div>
    <div style="color:rgba(255,255,255,.6);font-size:9px">${status}</div>
  </div>
</div>

<!-- Dados colaborador -->
<div style="background:#f0f4f8;border-radius:8px;padding:10px 14px;margin-bottom:10px">
  <div style="display:grid;grid-template-columns:2fr 1fr 1fr;gap:8px">
    <div><div style="font-size:8px;text-transform:uppercase;color:#6b7280;font-weight:700;margin-bottom:2px">Colaborador</div><div style="font-size:13px;font-weight:800">${nomeColab}</div></div>
    <div><div style="font-size:8px;text-transform:uppercase;color:#6b7280;font-weight:700;margin-bottom:2px">CPF</div><div style="font-size:11px">${cpfColab || '—'}</div></div>
    <div><div style="font-size:8px;text-transform:uppercase;color:#6b7280;font-weight:700;margin-bottom:2px">Competência</div><div style="font-size:11px;font-weight:700">${fmtComp(vt.competencia)}</div></div>
  </div>
</div>

<!-- Tabela de valores -->
<table style="width:100%;border-collapse:collapse;border-radius:8px;overflow:hidden;border:1px solid #e2e8f0;margin-bottom:10px">
  <thead><tr style="background:#1a56a0">
    <th style="padding:7px 10px;color:#fff;font-size:9px;font-weight:700;text-align:left">PERÍODO</th>
    <th style="padding:7px 10px;color:#fff;font-size:9px;font-weight:700;text-align:center">DIAS TRAB.</th>
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
    <td style="padding:8px 10px;text-align:center;font-weight:700;color:#7c3aed;font-size:11px">${(vt.tipo ?? 'dinheiro').toUpperCase()}</td>
    <td style="padding:8px 10px;text-align:center;font-weight:600">${fmtData(vt.data_pagamento)}</td>
  </tr></tbody>
</table>

<!-- Aviso legal -->
<div style="background:#fffbeb;border:1px solid #fde68a;border-radius:6px;padding:8px 12px;margin-bottom:12px;font-size:10px;color:#92400e">
  ⚖️ <strong>Declaração:</strong> O(a) colaborador(a) acima identificado(a) declara ter recebido o vale transporte referente ao período indicado, 
  pago em <strong>${(vt.tipo ?? 'dinheiro').toUpperCase()}</strong>, conforme previsto na legislação trabalhista (Lei 7.418/85 e Decreto 95.247/87).
</div>

<!-- Assinaturas -->
<div style="display:grid;grid-template-columns:1fr 1fr;gap:30px;margin-top:8px">
  <div style="border-top:1.5px solid #1a56a0;padding-top:6px;text-align:center">
    <div style="font-size:10px;color:#374151;font-weight:600">${nomeColab.toUpperCase()}</div>
    <div style="font-size:9px;color:#9ca3af">Colaborador(a) — Assinatura / Impressão Digital</div>
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

  const [registros, setRegistros] = useState<VTRow[]>([])
  const [loading,   setLoading]   = useState(false)
  const [nomeColab, setNomeColab] = useState('')
  const [cpfColab,  setCpfColab]  = useState('')

  const carregar = useCallback(async () => {
    if (!session) { nav('/portal'); return }
    setLoading(true)

    // Buscar dados do colaborador
    const { data: colab } = await supabase
      .from('colaboradores')
      .select('nome, cpf')
      .eq('id', session.colaborador_id)
      .maybeSingle()
    if (colab) { setNomeColab(colab.nome ?? ''); setCpfColab(colab.cpf ?? '') }

    // Buscar VTs
    const { data } = await supabase
      .from('vale_transporte')
      .select('id,competencia,data_inicio,data_fim,dias_trabalhados,valor,valor_empresa,desconto_colaborador,tipo,status,data_pagamento,observacoes')
      .eq('colaborador_id', session.colaborador_id)
      .order('competencia', { ascending: false })
    setRegistros(data ?? [])
    setLoading(false)
  }, [session, nav])

  useEffect(() => { carregar() }, [carregar])

  if (!session) return null

  const totalPago = registros.filter(r => r.status === 'pago').reduce((s, r) => s + r.valor, 0)

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
              <p style={{ fontSize: 11, color: '#64748b', margin: 0 }}>Histórico de recebimentos por período</p>
            </div>
          </div>

          {/* Cards de resumo */}
          {!loading && registros.length > 0 && (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 12 }}>
              <div style={{ background: '#f5f3ff', border: '1px solid #ddd6fe', borderRadius: 10, padding: '10px 14px', textAlign: 'center' }}>
                <div style={{ fontSize: 20, fontWeight: 800, color: '#7c3aed' }}>{registros.length}</div>
                <div style={{ fontSize: 10, color: '#7c3aed', fontWeight: 600 }}>Períodos</div>
              </div>
              <div style={{ background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: 10, padding: '10px 14px', textAlign: 'center' }}>
                <div style={{ fontSize: 17, fontWeight: 800, color: '#15803d' }}>{fmtBRL(totalPago)}</div>
                <div style={{ fontSize: 10, color: '#15803d', fontWeight: 600 }}>Total Recebido</div>
              </div>
            </div>
          )}
        </div>

        {/* Conteúdo */}
        {loading ? (
          <div style={{ textAlign: 'center', padding: 48, color: '#94a3b8', fontSize: 13 }}>
            Carregando histórico…
          </div>
        ) : registros.length === 0 ? (
          <div style={{ margin: '0 14px', background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 12, padding: 40, textAlign: 'center', color: '#94a3b8' }}>
            <Bus size={36} style={{ opacity: .25, margin: '0 auto 10px', display: 'block' }} />
            <div style={{ fontWeight: 600 }}>Nenhum VT registrado</div>
            <div style={{ fontSize: 12, marginTop: 4 }}>Os vales transporte recebidos aparecerão aqui.</div>
          </div>
        ) : (
          <div style={{ padding: '0 14px', display: 'flex', flexDirection: 'column', gap: 10 }}>
            {registros.map(vt => {
              const st = STATUS_VT[vt.status] ?? { label: vt.status, bg: '#f3f4f6', cor: '#6b7280' }
              return (
                <div key={vt.id} style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 12, overflow: 'hidden', boxShadow: '0 1px 4px rgba(0,0,0,0.05)' }}>
                  {/* Topo colorido */}
                  <div style={{ height: 3, background: vt.status === 'pago' ? '#22c55e' : vt.status === 'cancelado' ? '#ef4444' : '#f59e0b' }} />
                  <div style={{ padding: '12px 14px' }}>
                    {/* Linha 1: competência + status */}
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                      <div style={{ fontWeight: 800, fontSize: 15, color: '#1e293b' }}>
                        🗓️ {fmtComp(vt.competencia)}
                      </div>
                      <span style={{ background: st.bg, color: st.cor, fontSize: 11, fontWeight: 700, borderRadius: 6, padding: '3px 9px' }}>
                        {st.label}
                      </span>
                    </div>

                    {/* Período */}
                    {(vt.data_inicio || vt.data_fim) && (
                      <div style={{ fontSize: 11, color: '#64748b', marginBottom: 8 }}>
                        📅 {fmtData(vt.data_inicio)} → {fmtData(vt.data_fim)}
                      </div>
                    )}

                    {/* Grid de valores */}
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 6, marginBottom: 10 }}>
                      <div style={{ background: '#f8fafc', borderRadius: 8, padding: '8px 10px', textAlign: 'center' }}>
                        <div style={{ fontSize: 10, color: '#94a3b8', fontWeight: 600, marginBottom: 2 }}>DIAS</div>
                        <div style={{ fontSize: 16, fontWeight: 800, color: '#1d4ed8' }}>{vt.dias_trabalhados}</div>
                      </div>
                      <div style={{ background: '#f0fdf4', borderRadius: 8, padding: '8px 10px', textAlign: 'center' }}>
                        <div style={{ fontSize: 10, color: '#15803d', fontWeight: 600, marginBottom: 2 }}>VT PAGO</div>
                        <div style={{ fontSize: 14, fontWeight: 900, color: '#15803d' }}>{fmtBRL(vt.valor)}</div>
                      </div>
                      <div style={{ background: '#faf5ff', borderRadius: 8, padding: '8px 10px', textAlign: 'center' }}>
                        <div style={{ fontSize: 10, color: '#7c3aed', fontWeight: 600, marginBottom: 2 }}>FORMA</div>
                        <div style={{ fontSize: 11, fontWeight: 800, color: '#7c3aed', textTransform: 'uppercase' }}>{vt.tipo ?? 'dinheiro'}</div>
                      </div>
                    </div>

                    {/* Detalhes adicionais */}
                    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 10 }}>
                      {vt.valor_empresa > 0 && (
                        <span style={{ fontSize: 10, background: '#eff6ff', color: '#1d4ed8', borderRadius: 5, padding: '2px 8px', fontWeight: 600 }}>
                          Empresa: {fmtBRL(vt.valor_empresa)}
                        </span>
                      )}
                      {vt.desconto_colaborador && vt.desconto_colaborador > 0 && (
                        <span style={{ fontSize: 10, background: '#fef2f2', color: '#dc2626', borderRadius: 5, padding: '2px 8px', fontWeight: 600 }}>
                          Desc. colab: −{fmtBRL(vt.desconto_colaborador)}
                        </span>
                      )}
                      {vt.data_pagamento && (
                        <span style={{ fontSize: 10, background: '#f0fdf4', color: '#15803d', borderRadius: 5, padding: '2px 8px', fontWeight: 600 }}>
                          Pago em: {fmtData(vt.data_pagamento)}
                        </span>
                      )}
                    </div>

                    {/* Botão baixar recibo */}
                    <button
                      onClick={() => gerarReciboPdf(vt, nomeColab, cpfColab)}
                      style={{ width: '100%', height: 40, borderRadius: 9, border: '1.5px solid #7c3aed', background: '#f5f3ff', color: '#7c3aed', fontWeight: 700, fontSize: 13, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 7 }}
                    >
                      <FileText size={15} /> Baixar Recibo / Comprovante
                    </button>
                  </div>
                </div>
              )
            })}

            {/* Nota legal */}
            <div style={{ background: '#fffbeb', border: '1px solid #fde68a', borderRadius: 10, padding: '12px 14px', margin: '4px 0 0', fontSize: 11, color: '#92400e', lineHeight: 1.6 }}>
              ⚖️ <strong>Informação legal:</strong> O vale transporte é pago em dinheiro conforme acordado. 
              O recibo gerado serve como comprovante de pagamento nos termos da Lei 7.418/85.
            </div>
          </div>
        )}
      </div>
    </PortalLayout>
  )
}
