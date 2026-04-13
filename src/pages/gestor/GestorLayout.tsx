import React, { useState, useEffect, useCallback, useMemo, memo } from 'react'
import { NavLink, useNavigate, useLocation } from 'react-router-dom'
import {
  LayoutDashboard, Users, CloudRain, AlertTriangle,
  FileText, LogOut, Menu, X, Clock, HardHat,
  Activity, ShieldAlert, BarChart3, Thermometer, Wrench,
} from 'lucide-react'
import { useAuth } from '@/hooks/useAuth'
import { supabase } from '@/lib/supabase'
import { getGestorSession, clearGestorSession } from '@/hooks/useGestorAuth'

interface GestorLayoutProps { children: React.ReactNode }

const ROUTE_LABELS: Record<string, string> = {
  '/gestor':              'Dashboard',
  '/gestor/presenca':     'Presença',
  '/gestor/producao':     'Produção',
  '/gestor/atestados':    'Atestados',
  '/gestor/acidentes':    'Acidentes',
  '/gestor/meteorologia': 'Meteorologia',
  '/gestor/relatorios':   'Relatórios',
}

const navItems = [
  { to: '/gestor',              icon: LayoutDashboard, label: 'Dashboard',    color: '#818cf8', bg: '#eef2ff' },
  { to: '/gestor/presenca',     icon: Users,           label: 'Presença',     color: '#38bdf8', bg: '#e0f7ff' },
  { to: '/gestor/producao',     icon: BarChart3,       label: 'Produção',     color: '#fbbf24', bg: '#fffbeb' },
  { to: '/gestor/atestados',    icon: FileText,        label: 'Atestados',    color: '#a78bfa', bg: '#f5f3ff' },
  { to: '/gestor/acidentes',    icon: ShieldAlert,     label: 'Acidentes',    color: '#f87171', bg: '#fef2f2' },
  { to: '/gestor/meteorologia', icon: CloudRain,    label: 'Meteorologia', color: '#34d399', bg: '#f0fdf4' },
  { to: '/gestor/equipamentos',  icon: Wrench,       label: 'Equipamentos', color: '#b45309', bg: '#fffbeb' },
  { to: '/gestor/relatorios',    icon: Activity,     label: 'Relatórios',   color: '#94a3b8', bg: '#f8fafc' },
]

const RelogioTopbar = memo(function RelogioTopbar() {
  const [hora, setHora] = useState(() =>
    new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
  )
  useEffect(() => {
    const ti = setInterval(() => {
      setHora(new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }))
    }, 30_000)
    return () => clearInterval(ti)
  }, [])
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 4,
      background: 'rgba(255,255,255,0.12)', border: '1px solid rgba(255,255,255,0.20)',
      borderRadius: 8, padding: '4px 9px',
    }}>
      <Clock size={10} color="rgba(255,255,255,0.70)" />
      <span style={{ fontSize: 11, fontWeight: 700, color: '#fff', whiteSpace: 'nowrap' }}>{hora}</span>
    </div>
  )
})

export default function GestorLayout({ children }: GestorLayoutProps) {
  const navigate = useNavigate()
  const location = useLocation()
  const { user } = useAuth()
  const gestorSession = getGestorSession()

  // Redireciona para login se não tiver sessão do gestor E não for usuário admin logado
  React.useEffect(() => {
    if (!gestorSession && !user) {
      navigate('/gestor-login')
    }
  }, [gestorSession, user, navigate])
  const [menuOpen, setMenuOpen] = useState(false)
  const [alertas, setAlertas] = useState(0)

  const pageTitle = useMemo(() => {
    const base = location.pathname.replace(/\/$/, '') || '/gestor'
    return ROUTE_LABELS[base] ?? 'Gestor'
  }, [location.pathname])

  const fetchAlertas = useCallback(async () => {
    const hoje = new Date().toISOString().slice(0, 10)
    const [{ count: acidentes }, { count: atestados }] = await Promise.all([
      supabase.from('acidentes').select('id', { count: 'exact', head: true })
        .gte('data_ocorrencia', hoje),
      supabase.from('atestados').select('id', { count: 'exact', head: true })
        .gte('data', hoje),
    ])
    setAlertas((acidentes ?? 0) + (atestados ?? 0))
  }, [])

  useEffect(() => { fetchAlertas() }, [fetchAlertas])

  const dataHoje = new Date().toLocaleDateString('pt-BR', {
    weekday: 'short', day: '2-digit', month: 'short'
  })

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', background: '#f0f4f8', fontFamily: 'var(--font-sans, system-ui, sans-serif)' }}>
      {/* ── Topbar ── */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '0 16px', height: 52, flexShrink: 0,
        background: 'linear-gradient(135deg, #0f172a 0%, #1e3a5f 60%, #1a4731 100%)',
        boxShadow: '0 2px 8px rgba(0,0,0,0.25)',
      }}>
        {/* Left: logo + title */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <button
            onClick={() => setMenuOpen(p => !p)}
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#fff', padding: 4, display: 'flex', borderRadius: 6 }}
          >
            {menuOpen ? <X size={20} /> : <Menu size={20} />}
          </button>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <div style={{
              width: 28, height: 28, borderRadius: 7,
              background: 'linear-gradient(135deg,#fbbf24,#f59e0b)',
              display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
            }}>
              <HardHat size={15} color="#fff" />
            </div>
            <div>
              <div style={{ color: 'rgba(255,255,255,0.55)', fontSize: 9, fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase' }}>Portal do</div>
              <div style={{ color: '#fff', fontWeight: 800, fontSize: 13, lineHeight: 1 }}>Gestor</div>
            </div>
          </div>
          <div style={{
            background: 'rgba(255,255,255,.08)', border: '1px solid rgba(255,255,255,.12)',
            borderRadius: 6, padding: '3px 10px', fontSize: 11, color: 'rgba(255,255,255,0.75)', marginLeft: 4,
          }}>
            {pageTitle}
          </div>
        </div>

        {/* Right */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.60)', display: 'flex', alignItems: 'center', gap: 4 }}>
            📅 {dataHoje}
          </div>
          <RelogioTopbar />
          {alertas > 0 && (
            <div style={{
              background: '#dc2626', color: '#fff', borderRadius: 20,
              padding: '2px 8px', fontSize: 11, fontWeight: 700,
              display: 'flex', alignItems: 'center', gap: 4,
            }}>
              <AlertTriangle size={11} /> {alertas} alerta{alertas > 1 ? 's' : ''}
            </div>
          )}
          <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.60)', maxWidth: 120, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {user?.email}
          </div>
          <button
            onClick={() => {
              clearGestorSession()
              if (user) navigate('/')
              else navigate('/gestor-login')
            }}
            title="Sair do portal do gestor"
            style={{
              display: 'flex', alignItems: 'center', gap: 4,
              padding: '4px 10px', borderRadius: 7, border: 'none',
              background: 'rgba(255,255,255,0.12)', color: '#fff',
              cursor: 'pointer', fontSize: 11, fontWeight: 600,
            }}
          >
            <LogOut size={12} /> Sair
          </button>
        </div>
      </div>

      <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
        {/* ── Sidebar ── */}
        <div style={{
          width: menuOpen ? 200 : 60,
          background: '#0f172a',
          flexShrink: 0,
          transition: 'width 200ms ease',
          overflow: 'hidden',
          display: 'flex', flexDirection: 'column',
          borderRight: '1px solid rgba(255,255,255,0.06)',
        }}>
          <div style={{ flex: 1, padding: '8px 6px', display: 'flex', flexDirection: 'column', gap: 2 }}>
            {navItems.map(item => {
              const Icon = item.icon
              const isActive = location.pathname === item.to || (item.to !== '/gestor' && location.pathname.startsWith(item.to))
              return (
                <NavLink
                  key={item.to}
                  to={item.to}
                  onClick={() => setMenuOpen(false)}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 10,
                    padding: '9px 10px', borderRadius: 9, textDecoration: 'none',
                    background: isActive ? item.bg.replace(')', ', 0.15)').replace('rgb', 'rgba') : 'transparent',
                    transition: 'background 150ms',
                    overflow: 'hidden', whiteSpace: 'nowrap',
                  }}
                >
                  <div style={{
                    flexShrink: 0, width: 28, height: 28, borderRadius: 8,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    background: isActive ? item.bg : 'rgba(255,255,255,0.06)',
                  }}>
                    <Icon size={15} color={isActive ? item.color : 'rgba(255,255,255,0.55)'} />
                  </div>
                  {menuOpen && (
                    <span style={{
                      fontSize: 12, fontWeight: isActive ? 700 : 500,
                      color: isActive ? '#fff' : 'rgba(255,255,255,0.60)',
                    }}>
                      {item.label}
                    </span>
                  )}
                </NavLink>
              )
            })}
          </div>

          {/* Bottom: volta ao sistema */}
          <div style={{ padding: '8px 6px', borderTop: '1px solid rgba(255,255,255,0.06)' }}>
            <button
              onClick={() => navigate('/')}
              style={{
                display: 'flex', alignItems: 'center', gap: 10,
                width: '100%', padding: '9px 10px', borderRadius: 9,
                border: 'none', background: 'transparent', cursor: 'pointer',
                overflow: 'hidden', whiteSpace: 'nowrap',
              }}
            >
              <div style={{ flexShrink: 0, width: 28, height: 28, borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(255,255,255,0.06)' }}>
                <LogOut size={15} color="rgba(255,255,255,0.55)" />
              </div>
              {menuOpen && <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.55)' }}>Sistema</span>}
            </button>
          </div>
        </div>

        {/* ── Conteúdo ── */}
        <div style={{ flex: 1, overflowY: 'auto', padding: 20 }}>
          {children}
        </div>
      </div>
    </div>
  )
}
