import React, { useState, useEffect, useCallback } from 'react'
import { NavLink, useNavigate, useLocation } from 'react-router-dom'
import {
  ClipboardList, AlertTriangle, Home, LogOut, UserPlus,
  HardHat, ShieldCheck, FileImage, ChevronRight,
  BookOpen, MessageSquare, FolderOpen, CalendarDays,
  Bell, Wifi, WifiOff,
} from 'lucide-react'
import { clearPortalSession, getPortalSession } from '@/hooks/usePortalAuth'

interface PortalLayoutProps { children: React.ReactNode }

// Rótulos das rotas para o breadcrumb
const ROUTE_LABELS: Record<string, string> = {
  '/portal/home':        'Início',
  '/portal/ponto':       'Ponto',
  '/portal/ocorrencias': 'Ocorrências',
  '/portal/solicitacoes':'Cadastro',
  '/portal/producao':    'Produção',
  '/portal/epis':        'EPIs',
  '/portal/documentos':  'Documentos',
  '/portal/playbook':    'Playbook',
  '/portal/mensagens':   'Mensagens',
  '/portal/projetos':    'Projetos',
  '/portal/lancamentos': 'Lançamentos',
}

export default function PortalLayout({ children }: PortalLayoutProps) {
  const nav      = useNavigate()
  const location = useLocation()
  const user     = getPortalSession()
  const [online, setOnline] = useState(navigator.onLine)

  useEffect(() => {
    const on  = () => setOnline(true)
    const off = () => setOnline(false)
    window.addEventListener('online',  on)
    window.addEventListener('offline', off)
    return () => { window.removeEventListener('online', on); window.removeEventListener('offline', off) }
  }, [])

  function sair() {
    clearPortalSession()
    nav('/portal')
  }

  const paginaAtual = ROUTE_LABELS[location.pathname] ?? 'Portal'

  // Linha 1 — navegação principal
  const navMain = [
    { to: '/portal/home',         icon: Home,          label: 'Início',   color: '#6366f1', bg: '#ede9fe' },
    { to: '/portal/ponto',        icon: ClipboardList, label: 'Ponto',    color: '#0ea5e9', bg: '#e0f2fe' },
    { to: '/portal/ocorrencias',  icon: AlertTriangle, label: 'Ocorr.',   color: '#f97316', bg: '#fff7ed' },
    { to: '/portal/solicitacoes', icon: UserPlus,      label: 'Cadastro', color: '#8b5cf6', bg: '#f5f3ff' },
    { to: '/portal/producao',     icon: HardHat,       label: 'Prod.',    color: '#f59e0b', bg: '#fffbeb' },
  ]

  // Linha 2 — navegação extra
  const navExtra = [
    { to: '/portal/epis',         icon: ShieldCheck,   label: 'EPIs',      color: '#ef4444' },
    { to: '/portal/documentos',   icon: FileImage,     label: 'Docs',      color: '#14b8a6' },
    { to: '/portal/playbook',     icon: BookOpen,      label: 'Playbook',  color: '#10b981' },
    { to: '/portal/mensagens',    icon: MessageSquare, label: 'Msg.',      color: '#7c3aed' },
    { to: '/portal/projetos',     icon: FolderOpen,    label: 'Projetos',  color: '#0369a1' },
    { to: '/portal/lancamentos',  icon: CalendarDays,  label: 'Lanç.',     color: '#f59e0b' },
  ]

  return (
    <div style={{
      minHeight: '100dvh',
      background: '#f0f4f8',
      display: 'flex',
      flexDirection: 'column',
      fontFamily: "'Inter', 'Segoe UI', sans-serif",
      maxWidth: 480,
      margin: '0 auto',
      position: 'relative',
    }}>

      {/* ══════════════════════════════════════════
          TOP BAR
      ══════════════════════════════════════════ */}
      <div style={{
        background: 'linear-gradient(135deg, #0c1628 0%, #1e3a5f 50%, #0f4c75 100%)',
        padding: '0 16px',
        height: 60,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        position: 'sticky',
        top: 0,
        zIndex: 50,
        boxShadow: '0 2px 16px rgba(0,0,0,0.25)',
      }}>

        {/* Logo + Info */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 11 }}>
          {/* Ícone */}
          <div style={{
            width: 38, height: 38, borderRadius: 12,
            background: 'linear-gradient(135deg, #3b82f6 0%, #1d4ed8 100%)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            boxShadow: '0 4px 12px rgba(59,130,246,0.5)',
            flexShrink: 0,
          }}>
            <HardHat size={18} color="#fff" strokeWidth={2} />
          </div>

          {/* Textos */}
          <div>
            <div style={{
              color: '#fff', fontWeight: 800, fontSize: 14,
              lineHeight: 1.2, letterSpacing: '-0.01em',
            }}>
              Portal da Obra
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginTop: 1 }}>
              <div style={{
                width: 6, height: 6, borderRadius: '50%',
                background: online ? '#4ade80' : '#f87171',
                boxShadow: online ? '0 0 6px #4ade80' : '0 0 6px #f87171',
                flexShrink: 0,
              }} />
              <div style={{ color: 'rgba(255,255,255,0.6)', fontSize: 11, lineHeight: 1 }}>
                {user?.nome ?? user?.login ?? 'Encarregado'}
              </div>
            </div>
          </div>
        </div>

        {/* Ações direita */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {/* Status online */}
          {!online && (
            <div style={{
              display: 'flex', alignItems: 'center', gap: 4,
              background: 'rgba(239,68,68,0.2)', border: '1px solid rgba(239,68,68,0.4)',
              borderRadius: 8, padding: '4px 8px',
              fontSize: 10, fontWeight: 700, color: '#fca5a5',
            }}>
              <WifiOff size={11} /> Offline
            </div>
          )}

          {/* Página atual (breadcrumb) */}
          <div style={{
            background: 'rgba(255,255,255,0.1)',
            border: '1px solid rgba(255,255,255,0.15)',
            borderRadius: 8, padding: '5px 10px',
            fontSize: 11, fontWeight: 600, color: 'rgba(255,255,255,0.9)',
          }}>
            {paginaAtual}
          </div>

          {/* Botão Sair */}
          <button onClick={sair} style={{
            background: 'rgba(239,68,68,0.15)',
            border: '1px solid rgba(239,68,68,0.3)',
            borderRadius: 8,
            padding: '7px 10px',
            cursor: 'pointer',
            color: '#fca5a5',
            display: 'flex',
            alignItems: 'center',
            gap: 4,
            fontSize: 11,
            fontWeight: 700,
            transition: 'all 0.15s',
          }}
            onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = 'rgba(239,68,68,0.28)' }}
            onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'rgba(239,68,68,0.15)' }}
          >
            <LogOut size={13} /> Sair
          </button>
        </div>
      </div>

      {/* ══════════════════════════════════════════
          CONTENT
      ══════════════════════════════════════════ */}
      <div style={{ flex: 1, overflowY: 'auto', paddingBottom: 120 }}>
        {children}
      </div>

      {/* ══════════════════════════════════════════
          BOTTOM NAVIGATION
      ══════════════════════════════════════════ */}
      <nav style={{
        position: 'fixed',
        bottom: 0,
        left: '50%',
        transform: 'translateX(-50%)',
        width: '100%',
        maxWidth: 480,
        background: '#ffffff',
        borderTop: '1px solid #e2e8f0',
        boxShadow: '0 -4px 32px rgba(0,0,0,0.10)',
        zIndex: 50,
        paddingBottom: 'env(safe-area-inset-bottom)',
      }}>

        {/* ── Linha 1: principal ─────────────────────── */}
        <div style={{
          display: 'flex',
          borderBottom: '1px solid #f1f5f9',
          background: '#fff',
        }}>
          {navMain.map(item => (
            <NavLink key={item.to} to={item.to} end={item.to === '/portal/home'}
              style={({ isActive }) => ({
                flex: 1,
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                padding: '9px 2px 7px',
                textDecoration: 'none',
                color: isActive ? item.color : '#94a3b8',
                borderTop: isActive ? `2.5px solid ${item.color}` : '2.5px solid transparent',
                background: isActive ? `${item.color}0d` : 'transparent',
                transition: 'all 0.15s',
                position: 'relative',
              })}>
              {({ isActive }) => (
                <>
                  {/* Ícone com fundo quando ativo */}
                  <div style={{
                    width: 36, height: 36,
                    borderRadius: 10,
                    background: isActive ? item.bg : 'transparent',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    transition: 'all 0.15s',
                    marginBottom: 2,
                  }}>
                    <item.icon
                      size={isActive ? 20 : 18}
                      strokeWidth={isActive ? 2.4 : 1.8}
                      color={isActive ? item.color : '#94a3b8'}
                    />
                  </div>
                  <span style={{
                    fontSize: 9,
                    fontWeight: isActive ? 800 : 500,
                    lineHeight: 1,
                    letterSpacing: isActive ? '0.01em' : '0',
                    color: isActive ? item.color : '#94a3b8',
                  }}>
                    {item.label}
                  </span>
                </>
              )}
            </NavLink>
          ))}
        </div>

        {/* ── Linha 2: extras com scroll ──────────────── */}
        <div style={{
          display: 'flex',
          overflowX: 'auto',
          scrollbarWidth: 'none',
          background: '#fafbfc',
          padding: '0 4px',
        }}>
          {navExtra.map(item => (
            <NavLink key={item.to} to={item.to}
              style={({ isActive }) => ({
                flex: '0 0 auto',
                minWidth: 60,
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                padding: '7px 6px 6px',
                textDecoration: 'none',
                color: isActive ? item.color : '#94a3b8',
                borderTop: isActive ? `2px solid ${item.color}` : '2px solid transparent',
                background: isActive ? `${item.color}0a` : 'transparent',
                transition: 'all 0.15s',
              })}>
              {({ isActive }) => (
                <>
                  <item.icon
                    size={isActive ? 16 : 14}
                    strokeWidth={isActive ? 2.3 : 1.7}
                    color={isActive ? item.color : '#94a3b8'}
                  />
                  <span style={{
                    fontSize: 8,
                    marginTop: 3,
                    fontWeight: isActive ? 800 : 500,
                    lineHeight: 1,
                    whiteSpace: 'nowrap',
                    color: isActive ? item.color : '#94a3b8',
                    letterSpacing: '0.01em',
                  }}>
                    {item.label}
                  </span>
                </>
              )}
            </NavLink>
          ))}
        </div>
      </nav>

      <style>{`
        /* hide scrollbar linha 2 */
        nav div::-webkit-scrollbar { display: none; }
      `}</style>
    </div>
  )
}
