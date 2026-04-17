import React, { useEffect, useState, useCallback, useMemo, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '@/lib/supabase'
import { getPortalSession, refreshPortalSession } from '@/hooks/usePortalAuth'
import PortalLayout from './PortalLayout'
import {
  ClipboardList, AlertTriangle, UserPlus, ShieldCheck,
  HardHat, BookOpen, FolderOpen, FileImage,
  Building2, Clock, Bus,
} from 'lucide-react'

interface ObraInfo { id: string; nome: string; codigo?: string }

export default function PortalHome() {
  const nav = useNavigate()

  const [session, setSession] = useState(() => getPortalSession())
  const [obras,      setObras]      = useState<ObraInfo[]>([])
  const [contadores, setContadores] = useState<Record<string, { ponto: number; ocorr: number }>>({})
  const [loading,    setLoading]    = useState(true)

  const hoje       = useRef(new Date().toISOString().slice(0, 10)).current
  const obrasIdsKey = useMemo(() => (session?.obras_ids ?? []).join(','), [session])

  const fetchData = useCallback(async () => {
    if (!session) { nav('/portal'); return }
    const ids = session.obras_ids
    if (!ids || ids.length === 0) { setLoading(false); return }

    setLoading(true)
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
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [obrasIdsKey])

  useEffect(() => {
    refreshPortalSession(supabase).then(updated => {
      if (updated === null) { nav('/portal'); return }
      if (updated !== session) setSession(updated)
    })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => { fetchData() }, [fetchData])

  if (!session) return null

  const dataHojeFmt = new Date().toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: 'long' })
  const primeiroNome = (session.nome ?? session.login).split(' ')[0]

  const acoesRapidas = [
    { icon: <ClipboardList size={24} />, label: 'Lançar Ponto',   sub: 'Presenças do dia',   to: '/portal/ponto',        cor: '#1d4ed8', bg: '#eff6ff', border: '#bfdbfe' },
    { icon: <AlertTriangle size={24} />, label: 'Ocorrência',     sub: 'Registrar evento',   to: '/portal/ocorrencias',  cor: '#dc2626', bg: '#fef2f2', border: '#fecaca' },
    { icon: <HardHat size={24} />,       label: 'Ficha de Prod.', sub: 'Enviar documento',   to: '/portal/producao',     cor: '#b45309', bg: '#fffbeb', border: '#fde68a' },
    { icon: <UserPlus size={24} />,      label: 'Cadastro',       sub: 'Novo colaborador',   to: '/portal/solicitacoes', cor: '#15803d', bg: '#f0fdf4', border: '#bbf7d0' },
    { icon: <ShieldCheck size={24} />,   label: 'Solicitar EPI',  sub: 'Equipamentos',       to: '/portal/epis',         cor: '#c2410c', bg: '#fff7ed', border: '#fed7aa' },
    { icon: <FileImage size={24} />,     label: 'Documentos',     sub: 'Enviar arquivos',    to: '/portal/documentos',   cor: '#0369a1', bg: '#f0f9ff', border: '#bae6fd' },
    { icon: <BookOpen size={24} />,      label: 'Playbook',       sub: 'Serviços e preços',  to: '/portal/playbook',     cor: '#059669', bg: '#f0fdf4', border: '#a7f3d0' },
    { icon: <FolderOpen size={24} />,    label: 'Projetos',       sub: 'Arquivos da obra',   to: '/portal/projetos',     cor: '#475569', bg: '#f8fafc', border: '#cbd5e1' },
    { icon: <Clock size={24} />,         label: 'Lançamentos',    sub: 'Ponto mensal',       to: '/portal/lancamentos',  cor: '#ea580c', bg: '#fff7ed', border: '#fed7aa' },
    { icon: <Bus size={24} />,           label: 'Vale Transporte', sub: 'Histórico e recibos', to: '/portal/vale-transporte', cor: '#7c3aed', bg: '#f5f3ff', border: '#ddd6fe' },
  ]

  return (
    <PortalLayout>
      {/* Saudação */}
      <div style={{ padding: '18px 16px 10px' }}>
        <div style={{ fontSize: 12, color: '#6b7280', marginBottom: 2, textTransform: 'capitalize' }}>{dataHojeFmt}</div>
        <div style={{ fontSize: 20, fontWeight: 800, color: '#1e3a5f', lineHeight: 1.3 }}>Olá, {primeiroNome}! 👋</div>
        <div style={{ fontSize: 12, color: '#6b7280', marginTop: 2 }}>
          Você tem acesso a <strong>{obras.length}</strong> obra{obras.length !== 1 ? 's' : ''}
        </div>
      </div>

      {/* Obras com contadores */}
      {!loading && obras.length > 0 && (
        <div style={{ padding: '0 16px 10px' }}>
          <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.07em', color: '#9ca3af', marginBottom: 8 }}>
            Obras Ativas
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {obras.map(o => {
              const cnt = contadores[o.id] ?? { ponto: 0, ocorr: 0 }
              return (
                <div key={o.id} style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 12, padding: '10px 14px', display: 'flex', alignItems: 'center', gap: 10 }}>
                  <div style={{ width: 36, height: 36, borderRadius: 10, background: 'linear-gradient(135deg,#1e3a5f,#1d4ed8)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                    <Building2 size={16} color="#fff" />
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 700, fontSize: 13, color: '#111', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{o.nome}</div>
                    {o.codigo && <div style={{ fontSize: 10, color: '#9ca3af' }}>{o.codigo}</div>}
                  </div>
                  <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
                    {cnt.ponto > 0 && <span style={{ background: '#dcfce7', color: '#15803d', borderRadius: 6, padding: '2px 7px', fontSize: 10, fontWeight: 700 }}>✓ {cnt.ponto}</span>}
                    {cnt.ocorr > 0 && <span style={{ background: '#fee2e2', color: '#dc2626', borderRadius: 6, padding: '2px 7px', fontSize: 10, fontWeight: 700 }}>⚠ {cnt.ocorr}</span>}
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* Menu rápido */}
      <div style={{ padding: '4px 16px 32px' }}>
        <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.07em', color: '#9ca3af', marginBottom: 10 }}>
          Menu Rápido
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8 }}>
          {acoesRapidas.map(a => (
            <button key={a.to} onClick={() => nav(a.to)} style={{
              background: a.bg, border: `1.5px solid ${a.border}`, borderRadius: 14,
              padding: '14px 10px', cursor: 'pointer', display: 'flex',
              flexDirection: 'column', alignItems: 'center', gap: 6,
              boxShadow: '0 1px 4px rgba(0,0,0,0.06)', WebkitTapHighlightColor: 'transparent',
            }}
              onTouchStart={e => { e.currentTarget.style.transform = 'scale(0.95)'; e.currentTarget.style.boxShadow = '0 2px 8px rgba(0,0,0,0.12)' }}
              onTouchEnd={e => { e.currentTarget.style.transform = 'scale(1)'; e.currentTarget.style.boxShadow = '0 1px 4px rgba(0,0,0,0.06)' }}
            >
              <div style={{ color: a.cor }}>{a.icon}</div>
              <div>
                <div style={{ fontWeight: 700, fontSize: 11, color: '#1e293b', textAlign: 'center', lineHeight: 1.3 }}>{a.label}</div>
                <div style={{ fontSize: 9, color: '#6b7280', textAlign: 'center', marginTop: 2, lineHeight: 1.3 }}>{a.sub}</div>
              </div>
            </button>
          ))}
        </div>
      </div>
    </PortalLayout>
  )
}
