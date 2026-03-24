import React, { useEffect, useState, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '@/lib/supabase'
import { getPortalSession } from '@/hooks/usePortalAuth'
import PortalLayout from './PortalLayout'
import { ClipboardList, AlertTriangle, UserPlus, ChevronRight, Building2 } from 'lucide-react'

interface ObraInfo { id: string; nome: string; codigo?: string }

export default function PortalHome() {
  const nav     = useNavigate()
  const session = getPortalSession()
  const [obras,   setObras]   = useState<ObraInfo[]>([])
  const [contadores, setContadores] = useState<Record<string, { ponto: number; ocorr: number }>>({})
  const [loading, setLoading] = useState(true)
  const hoje = new Date().toISOString().slice(0, 10)

  const fetchData = useCallback(async () => {
    if (!session) { nav('/portal'); return }
    setLoading(true)
    const ids = session.obras_ids
    if (!ids || ids.length === 0) { setLoading(false); return }

    const [{ data: obsData }, { data: pontosHoje }, { data: ocorrHoje }] = await Promise.all([
      supabase.from('obras').select('id,nome,codigo').in('id', ids).order('nome'),
      supabase.from('portal_ponto_diario').select('obra_id').in('obra_id', ids).eq('data', hoje),
      supabase.from('portal_ocorrencias').select('obra_id').in('obra_id', ids).eq('data', hoje),
    ])

    if (obsData) setObras(obsData)

    const cnt: Record<string, { ponto: number; ocorr: number }> = {}
    ids.forEach(id => { cnt[id] = { ponto: 0, ocorr: 0 } })
    pontosHoje?.forEach((r: any) => { if (cnt[r.obra_id]) cnt[r.obra_id].ponto++ })
    ocorrHoje?.forEach( (r: any) => { if (cnt[r.obra_id]) cnt[r.obra_id].ocorr++ })
    setContadores(cnt)
    setLoading(false)
  }, [session, hoje, nav])

  useEffect(() => { fetchData() }, [fetchData])

  if (!session) return null

  const dataHojeFmt = new Date().toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: 'long' })

  return (
    <PortalLayout>
      <div style={{ padding: '20px 16px 8px' }}>
        <div style={{ fontSize: 13, color: '#6b7280', marginBottom: 2, textTransform: 'capitalize' }}>{dataHojeFmt}</div>
        <div style={{ fontSize: 22, fontWeight: 800, color: '#1e3a5f', marginBottom: 4 }}>
          Olá, {(session.nome ?? session.login).split(' ')[0]}! 👋
        </div>
        <div style={{ fontSize: 13, color: '#6b7280' }}>
          Você tem acesso a <strong>{obras.length}</strong> obra{obras.length !== 1 ? 's' : ''}
        </div>
      </div>

      {/* Atalhos rápidos */}
      <div style={{ padding: '12px 16px' }}>
        <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.07em', color: '#9ca3af', marginBottom: 10 }}>
          Ações Rápidas
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
          {[
            { icon: <ClipboardList size={26} color="#1e3a5f" />, label: 'Lançar Ponto', sub: 'Presenças do dia', to: '/portal/ponto', bg: '#eff6ff', border: '#bfdbfe' },
            { icon: <AlertTriangle size={26} color="#dc2626" />, label: 'Ocorrência', sub: 'Registrar evento', to: '/portal/ocorrencias', bg: '#fef2f2', border: '#fecaca' },
            { icon: <UserPlus size={26} color="#15803d" />, label: 'Solicitar Colaborador', sub: 'Novo funcionário', to: '/portal/solicitacoes', bg: '#f0fdf4', border: '#bbf7d0' },
          ].map(a => (
            <div key={a.to} onClick={() => nav(a.to)}
              style={{
                background: a.bg, border: `1px solid ${a.border}`, borderRadius: 14,
                padding: '16px 14px', cursor: 'pointer', display: 'flex', flexDirection: 'column',
                gap: 8, boxShadow: '0 1px 4px rgba(0,0,0,0.06)', transition: 'transform 0.1s',
              }}
              onTouchStart={e => (e.currentTarget.style.transform = 'scale(0.97)')}
              onTouchEnd={e => (e.currentTarget.style.transform = 'scale(1)')}>
              {a.icon}
              <div>
                <div style={{ fontWeight: 700, fontSize: 13, color: '#111' }}>{a.label}</div>
                <div style={{ fontSize: 11, color: '#6b7280' }}>{a.sub}</div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Obras */}
      <div style={{ padding: '8px 16px 16px' }}>
        <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.07em', color: '#9ca3af', marginBottom: 10 }}>
          Suas Obras
        </div>
        {loading ? (
          <div style={{ textAlign: 'center', color: '#9ca3af', padding: 24 }}>Carregando…</div>
        ) : obras.length === 0 ? (
          <div style={{ background: '#fff', borderRadius: 12, padding: 24, textAlign: 'center', color: '#9ca3af' }}>
            Nenhuma obra vinculada ao seu acesso
          </div>
        ) : obras.map(o => {
          const cnt = contadores[o.id] ?? { ponto: 0, ocorr: 0 }
          return (
            <div key={o.id} onClick={() => nav(`/portal/ponto?obra=${o.id}`)}
              style={{
                background: '#fff', borderRadius: 12, border: '1px solid #e5e7eb',
                padding: '14px 16px', marginBottom: 8, cursor: 'pointer',
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                boxShadow: '0 1px 4px rgba(0,0,0,0.06)',
              }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <div style={{
                  width: 40, height: 40, background: 'linear-gradient(135deg,#1e3a5f,#2d6a4f)',
                  borderRadius: 10, display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}>
                  <Building2 size={20} color="#fff" />
                </div>
                <div>
                  <div style={{ fontWeight: 700, fontSize: 14, color: '#111' }}>{o.nome}</div>
                  {o.codigo && <div style={{ fontSize: 11, color: '#9ca3af' }}>Cód: {o.codigo}</div>}
                  <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
                    <span style={{ fontSize: 10, background: cnt.ponto > 0 ? '#dbeafe' : '#f3f4f6', color: cnt.ponto > 0 ? '#1d4ed8' : '#6b7280', borderRadius: 4, padding: '1px 6px', fontWeight: 600 }}>
                      📋 {cnt.ponto} ponto{cnt.ponto !== 1 ? 's' : ''} hoje
                    </span>
                    {cnt.ocorr > 0 && (
                      <span style={{ fontSize: 10, background: '#fee2e2', color: '#dc2626', borderRadius: 4, padding: '1px 6px', fontWeight: 600 }}>
                        ⚠ {cnt.ocorr} ocorrência{cnt.ocorr !== 1 ? 's' : ''}
                      </span>
                    )}
                  </div>
                </div>
              </div>
              <ChevronRight size={18} color="#9ca3af" />
            </div>
          )
        })}
      </div>
    </PortalLayout>
  )
}
