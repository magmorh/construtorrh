import React from 'react'
import { NavLink, useNavigate } from 'react-router-dom'
import { ClipboardList, AlertTriangle, Home, LogOut, UserPlus } from 'lucide-react'
import { clearPortalSession, getPortalSession } from '@/hooks/usePortalAuth'

interface PortalLayoutProps { children: React.ReactNode }

export default function PortalLayout({ children }: PortalLayoutProps) {
  const nav = useNavigate()
  const user = getPortalSession()

  function sair() {
    clearPortalSession()
    nav('/portal')
  }

  const navItems = [
    { to: '/portal/home',        icon: <Home size={22} />,          label: 'Início' },
    { to: '/portal/ponto',       icon: <ClipboardList size={22} />, label: 'Ponto' },
    { to: '/portal/ocorrencias', icon: <AlertTriangle size={22} />, label: 'Ocorrências' },
    { to: '/portal/solicitacoes',icon: <UserPlus size={22} />,      label: 'Solicitar' },
  ]

  return (
    <div style={{
      minHeight: '100dvh', background: '#f1f5f9',
      display: 'flex', flexDirection: 'column', fontFamily: 'sans-serif',
      maxWidth: 480, margin: '0 auto', position: 'relative',
    }}>
      {/* Top Bar */}
      <div style={{
        background: 'linear-gradient(135deg, #1e3a5f, #2d6a4f)',
        padding: '12px 16px 10px',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        position: 'sticky', top: 0, zIndex: 50,
      }}>
        <div>
          <div style={{ color: '#fff', fontWeight: 800, fontSize: 16 }}>🏗️ Portal da Obra</div>
          <div style={{ color: 'rgba(255,255,255,0.7)', fontSize: 11 }}>{user?.nome ?? user?.login}</div>
        </div>
        <button onClick={sair} style={{
          background: 'rgba(255,255,255,0.15)', border: 'none', borderRadius: 8,
          padding: '8px 12px', cursor: 'pointer', color: '#fff',
          display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, fontWeight: 600,
        }}>
          <LogOut size={15} /> Sair
        </button>
      </div>

      {/* Content */}
      <div style={{ flex: 1, overflowY: 'auto', paddingBottom: 72 }}>
        {children}
      </div>

      {/* Bottom Navigation */}
      <nav style={{
        position: 'fixed', bottom: 0, left: '50%', transform: 'translateX(-50%)',
        width: '100%', maxWidth: 480, background: '#fff',
        borderTop: '1px solid #e5e7eb', display: 'flex',
        boxShadow: '0 -4px 20px rgba(0,0,0,0.1)', zIndex: 50,
      }}>
        {navItems.map(item => (
          <NavLink key={item.to} to={item.to}
            style={({ isActive }) => ({
              flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center',
              justifyContent: 'center', padding: '10px 4px 8px', textDecoration: 'none',
              color: isActive ? '#1e3a5f' : '#9ca3af',
              borderTop: isActive ? '2px solid #1e3a5f' : '2px solid transparent',
              fontWeight: isActive ? 700 : 500, transition: 'all 0.15s',
            })}>
            {item.icon}
            <span style={{ fontSize: 10, marginTop: 3 }}>{item.label}</span>
          </NavLink>
        ))}
      </nav>
    </div>
  )
}
