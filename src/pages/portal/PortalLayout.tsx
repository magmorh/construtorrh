import React from 'react'
import { NavLink, useNavigate } from 'react-router-dom'
import {
  ClipboardList, AlertTriangle, Home, LogOut, UserPlus,
  HardHat, ShieldCheck, FileImage, ChevronRight,
} from 'lucide-react'
import { clearPortalSession, getPortalSession } from '@/hooks/usePortalAuth'

interface PortalLayoutProps { children: React.ReactNode }

export default function PortalLayout({ children }: PortalLayoutProps) {
  const nav  = useNavigate()
  const user = getPortalSession()

  function sair() {
    clearPortalSession()
    nav('/portal')
  }

  const navItems = [
    { to: '/portal/home',        icon: Home,          label: 'Início',   color: '#6366f1' },
    { to: '/portal/ponto',       icon: ClipboardList, label: 'Ponto',    color: '#0ea5e9' },
    { to: '/portal/ocorrencias', icon: AlertTriangle, label: 'Ocorr.',   color: '#f97316' },
    { to: '/portal/solicitacoes',icon: UserPlus,      label: 'Cadastro', color: '#8b5cf6' },
    { to: '/portal/epis',        icon: ShieldCheck,   label: 'EPIs',     color: '#ef4444' },
    { to: '/portal/documentos',  icon: FileImage,     label: 'Docs',     color: '#14b8a6' },
    { to: '/portal/producao',    icon: HardHat,       label: 'Prod.',    color: '#f59e0b' },
  ]

  return (
    <div style={{
      minHeight: '100dvh',
      background: '#f1f5f9',
      display: 'flex',
      flexDirection: 'column',
      fontFamily: "'Inter', 'Segoe UI', sans-serif",
      maxWidth: 480,
      margin: '0 auto',
      position: 'relative',
    }}>

      {/* ── Top Bar ─────────────────────────────────────── */}
      <div style={{
        background: 'linear-gradient(135deg, #1e3a5f 0%, #1a5276 60%, #2d6a4f 100%)',
        padding: '0 16px',
        height: 56,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        position: 'sticky',
        top: 0,
        zIndex: 50,
        boxShadow: '0 2px 12px rgba(0,0,0,0.2)',
      }}>
        {/* Logo + info */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{
            width: 36, height: 36, borderRadius: 10,
            background: 'rgba(255,255,255,0.15)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 18,
          }}>🏗️</div>
          <div>
            <div style={{ color: '#fff', fontWeight: 800, fontSize: 14, lineHeight: 1.2 }}>Portal da Obra</div>
            <div style={{ color: 'rgba(255,255,255,0.65)', fontSize: 11, lineHeight: 1.2 }}>
              {user?.nome ?? user?.login ?? 'Encarregado'}
            </div>
          </div>
        </div>

        {/* Sair */}
        <button onClick={sair} style={{
          background: 'rgba(255,255,255,0.12)',
          border: '1px solid rgba(255,255,255,0.2)',
          borderRadius: 8,
          padding: '7px 12px',
          cursor: 'pointer',
          color: '#fff',
          display: 'flex',
          alignItems: 'center',
          gap: 5,
          fontSize: 12,
          fontWeight: 600,
          transition: 'background 0.15s',
        }}>
          <LogOut size={14} /> Sair
        </button>
      </div>

      {/* ── Content ─────────────────────────────────────── */}
      <div style={{ flex: 1, overflowY: 'auto', paddingBottom: 76 }}>
        {children}
      </div>

      {/* ── Bottom Navigation ────────────────────────────── */}
      <nav style={{
        position: 'fixed',
        bottom: 0,
        left: '50%',
        transform: 'translateX(-50%)',
        width: '100%',
        maxWidth: 480,
        background: '#ffffff',
        borderTop: '1px solid #e5e7eb',
        display: 'flex',
        boxShadow: '0 -4px 24px rgba(0,0,0,0.08)',
        zIndex: 50,
        paddingBottom: 'env(safe-area-inset-bottom)',
      }}>
        {navItems.map(item => (
          <NavLink
            key={item.to}
            to={item.to}
            style={({ isActive }) => ({
              flex: 1,
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              padding: '8px 2px 7px',
              textDecoration: 'none',
              color: isActive ? item.color : '#9ca3af',
              borderTop: isActive ? `2px solid ${item.color}` : '2px solid transparent',
              background: isActive ? `${item.color}08` : 'transparent',
              transition: 'all 0.15s',
              position: 'relative',
            })}
          >
            {({ isActive }) => (
              <>
                <item.icon size={isActive ? 22 : 20} strokeWidth={isActive ? 2.2 : 1.8} />
                <span style={{
                  fontSize: 9,
                  marginTop: 3,
                  fontWeight: isActive ? 700 : 500,
                  letterSpacing: isActive ? 0.3 : 0,
                  lineHeight: 1,
                }}>
                  {item.label}
                </span>
              </>
            )}
          </NavLink>
        ))}
      </nav>
    </div>
  )
}
