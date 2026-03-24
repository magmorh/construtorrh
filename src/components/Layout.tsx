import React, { useState } from 'react'
import { NavLink, useNavigate } from 'react-router-dom'
import { cn } from '@/lib/utils'
import { useAuth } from '@/hooks/useAuth'
import { useProfile, ROLE_PERMISSIONS } from '@/hooks/useProfile'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { ErrorBoundary } from '@/components/ErrorBoundary'
import {
  LayoutDashboard, Users, Building2, Shield,
  AlertTriangle, FileText, Clock, DollarSign, Award,
  Calculator, Bus, BarChart3, Settings, LogOut, Menu,
  HardHat, ChevronLeft, ChevronRight, UserCog,
  ClipboardList, Lock, CalendarDays, Briefcase, Wallet, Smartphone } from 'lucide-react'

// ── grupos de navegação ───────────────────────────────────────────────────────
const NAV_GROUPS = [
  {
    label: 'Principal',
    items: [
      { to: '/',               label: 'Dashboard',      icon: LayoutDashboard },
    ],
  },
  {
    label: 'Cadastros',
    items: [
      { to: '/colaboradores',  label: 'Colaboradores',  icon: Users },
      { to: '/obras',          label: 'Obras',          icon: Building2 },
      { to: '/playbooks',      label: 'Playbooks',      icon: ClipboardList },
      { to: '/feriados',       label: 'Feriados',       icon: CalendarDays },
    ],
  },
  {
    label: 'Saúde & Seg.',
    items: [
      { to: '/epis',           label: 'EPIs',           icon: Shield },
      { to: '/ocorrencias',    label: 'Ocorrências',    icon: AlertTriangle },
      { to: '/documentos',     label: 'Documentos',     icon: FileText },
    ],
  },
  {
    label: 'Financeiro',
    items: [
      { to: '/ponto',            label: 'Ponto',            icon: Clock },
      { to: '/vt',               label: 'Vale Transporte',  icon: Bus },
      { to: '/adiantamentos',    label: 'Adiantamentos',    icon: Wallet },
      { to: '/premios',          label: 'Prêmios',          icon: Award },
      { to: '/fechamento-ponto', label: 'Fechamento',       icon: Lock },
      { to: '/pagamentos',       label: 'Pagamentos',       icon: DollarSign },
      { to: '/encargos',         label: 'Encargos',         icon: Briefcase },
      { to: '/provisoes',        label: 'Provisões FGTS',   icon: Calculator },
    ],
  },
  {
    label: 'Sistema',
    items: [
      { to: '/relatorios',     label: 'Relatórios',      icon: BarChart3 },
      { to: '/usuarios',       label: 'Usuários',        icon: UserCog,  adminOnly: true },
      { to: '/portal-admin',   label: 'Portal da Obra',  icon: Smartphone, adminOnly: true },
      { to: '/configuracoes',  label: 'Configurações',    icon: Settings },
    ],
  },
]

interface LayoutProps { children: React.ReactNode }

export function Layout({ children }: LayoutProps) {
  const [collapsed, setCollapsed] = useState(false)
  const [mobileOpen, setMobileOpen] = useState(false)
  const { user, signOut } = useAuth()
  const { profile } = useProfile()
  const navigate = useNavigate()

  const handleSignOut = async () => { await signOut(); navigate('/login') }
  const userLogin  = profile?.nome || user?.email?.split('@')[0] || 'usuário'
  const userEmail  = user?.email ?? ''
  const initials   = userLogin.slice(0, 2).toUpperCase()
  const role       = profile?.role ?? 'visualizador'
  const roleMeta   = ROLE_PERMISSIONS[role]

  const W = collapsed ? 60 : 224

  return (
    <div style={{ display: 'flex', height: '100vh', overflow: 'hidden' }}>

      {/* overlay mobile */}
      {mobileOpen && (
        <div onClick={() => setMobileOpen(false)}
          style={{ position: 'fixed', inset: 0, zIndex: 40, background: 'rgba(0,0,0,0.55)' }} />
      )}

      {/* SIDEBAR */}
      <aside style={{
        width: W, minWidth: W, maxWidth: W,
        display: 'flex', flexDirection: 'column',
        background: '#0f1729',
        borderRight: '1px solid rgba(255,255,255,0.07)',
        transition: 'width 200ms, min-width 200ms, max-width 200ms',
        flexShrink: 0, zIndex: 50,
      }}
        className={cn(
          'max-lg:!fixed max-lg:inset-y-0 max-lg:left-0',
          mobileOpen ? 'max-lg:translate-x-0' : 'max-lg:-translate-x-full',
          'transition-transform lg:transition-none',
        )}
      >
        {/* logo */}
        <div style={{
          height: 56, flexShrink: 0, display: 'flex', alignItems: 'center',
          padding: collapsed ? '0 14px' : '0 16px', gap: 10,
          borderBottom: '1px solid rgba(255,255,255,0.07)',
        }}>
          <div style={{
            width: 32, height: 32, minWidth: 32, borderRadius: 8, background: '#3b82f6',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <HardHat size={16} color="#fff" />
          </div>
          {!collapsed && (
            <div style={{ overflow: 'hidden' }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: '#f1f5f9', whiteSpace: 'nowrap' }}>ConstrutorRH</div>
              <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.35)', whiteSpace: 'nowrap' }}>Gestão de RH</div>
            </div>
          )}
        </div>

        {/* nav */}
        <nav style={{ flex: 1, overflowY: 'auto', overflowX: 'hidden', padding: '10px 0' }}>
          {NAV_GROUPS.map((group, gi) => (
            <div key={gi}>
              {gi > 0 && (
                <div style={{ margin: collapsed ? '6px 12px' : '4px 12px 2px', borderTop: '1px solid rgba(255,255,255,0.06)' }} />
              )}
              {!collapsed && (
                <div style={{ padding: '6px 16px 3px', fontSize: 9.5, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.09em', color: 'rgba(255,255,255,0.28)', userSelect: 'none' }}>
                  {group.label}
                </div>
              )}
              {group.items.map(({ to, label, icon: Icon, adminOnly }) => {
                // Esconde item adminOnly para não-admins
                if (adminOnly && role !== 'admin') return null
                // Esconde Financeiro para role=obra
                const isFinanceiro = ['/ponto','/vt','/adiantamentos','/premios','/fechamento-ponto','/pagamentos','/encargos','/provisoes'].includes(to)
                if (isFinanceiro && !roleMeta.canViewFinanceiro) return null

                return (
                  <NavLink key={to} to={to} end={to === '/'} title={collapsed ? label : undefined}
                    onClick={() => setMobileOpen(false)} style={{ textDecoration: 'none' }}
                    className={({ isActive }) => cn('nav-item', isActive ? 'nav-item--active' : 'nav-item--default')}
                  >
                    <span className="nav-icon"><Icon size={15} /></span>
                    {!collapsed && <span className="nav-label">{label}</span>}
                  </NavLink>
                )
              })}
            </div>
          ))}
        </nav>

        {/* footer com role badge */}
        <div style={{ borderTop: '1px solid rgba(255,255,255,0.07)', flexShrink: 0 }}>
          {!collapsed && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 14px' }}>
              <Avatar style={{ width: 28, height: 28, flexShrink: 0 }}>
                <AvatarFallback style={{ fontSize: 10, fontWeight: 700, background: '#1e3a5f', color: '#93c5fd' }}>
                  {initials}
                </AvatarFallback>
              </Avatar>
              <div style={{ minWidth: 0, flex: 1 }}>
                <div style={{ fontSize: 11, fontWeight: 600, color: 'rgba(255,255,255,0.8)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {userLogin}
                </div>
                <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.30)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {userEmail}
                </div>
                {/* Role badge */}
                <span style={{
                  display: 'inline-block', marginTop: 3,
                  padding: '1px 7px', borderRadius: 10, fontSize: 9, fontWeight: 700,
                  background: roleMeta.bg, color: roleMeta.color, letterSpacing: '0.04em',
                }}>
                  {roleMeta.label}
                </span>
              </div>
            </div>
          )}
          {collapsed && (
            <div style={{ display: 'flex', justifyContent: 'center', padding: '8px 0' }}>
              <div style={{ width: 8, height: 8, borderRadius: '50%', background: roleMeta.color }} title={roleMeta.label} />
            </div>
          )}

          <button onClick={handleSignOut} title="Sair"
            style={{
              display: 'flex', alignItems: 'center',
              gap: collapsed ? 0 : 8,
              justifyContent: collapsed ? 'center' : 'flex-start',
              width: '100%', padding: collapsed ? '12px 0' : '9px 14px',
              fontSize: 12, fontWeight: 500, color: 'rgba(255,255,255,0.38)',
              background: 'none', border: 'none', cursor: 'pointer',
            }}
            onMouseEnter={e => { (e.currentTarget as HTMLElement).style.color = '#f87171'; (e.currentTarget as HTMLElement).style.background = 'rgba(239,68,68,0.1)' }}
            onMouseLeave={e => { (e.currentTarget as HTMLElement).style.color = ''; (e.currentTarget as HTMLElement).style.background = '' }}
          >
            <LogOut size={14} />
            {!collapsed && <span>Sair</span>}
          </button>
        </div>
      </aside>

      {/* MAIN */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0, overflow: 'hidden' }}>
        <header style={{
          height: 56, flexShrink: 0, display: 'flex', alignItems: 'center',
          padding: '0 16px', gap: 8, background: 'var(--card)', borderBottom: '1px solid var(--border)',
        }}>
          <button onClick={() => setCollapsed(v => !v)} title={collapsed ? 'Expandir' : 'Recolher'}
            className="hidden lg:flex"
            style={{ width: 32, height: 32, display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: 6, border: 'none', background: 'transparent', color: 'var(--muted-foreground)', cursor: 'pointer' }}
            onMouseEnter={e => (e.currentTarget.style.background = 'var(--muted)')}
            onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
          >
            {collapsed ? <ChevronRight size={16} /> : <ChevronLeft size={16} />}
          </button>
          <button onClick={() => setMobileOpen(true)} className="lg:hidden"
            style={{ width: 32, height: 32, display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: 6, border: 'none', background: 'transparent', color: 'var(--muted-foreground)', cursor: 'pointer' }}>
            <Menu size={16} />
          </button>
          <div style={{ flex: 1 }} />
          {/* Role badge no topbar */}
          <span style={{ padding: '3px 10px', borderRadius: 10, fontSize: 11, fontWeight: 700, background: roleMeta.bg, color: roleMeta.color }}>
            {roleMeta.label}
          </span>
          <Avatar style={{ width: 32, height: 32 }}>
            <AvatarFallback style={{ fontSize: 11, fontWeight: 700, background: 'var(--primary)', color: 'var(--primary-foreground)' }}>
              {initials}
            </AvatarFallback>
          </Avatar>
        </header>

        <main style={{ flex: 1, overflowY: 'auto', padding: 24 }}>
          <ErrorBoundary>
            {children}
          </ErrorBoundary>
        </main>
      </div>

      <style>{`
        .nav-item { display:flex; flex-direction:row; align-items:center; margin:1px 8px; padding:7px 10px; border-radius:6px; font-size:13px; font-weight:500; text-decoration:none; gap:10px; white-space:nowrap; overflow:hidden; transition:background 120ms,color 120ms; color:rgba(255,255,255,0.55); }
        .nav-item:hover { background:rgba(255,255,255,0.07); color:rgba(255,255,255,0.90); }
        .nav-item--active { background:#1d4ed8 !important; color:#fff !important; }
        .nav-item--active:hover { background:#1d4ed8 !important; }
        .nav-icon { display:inline-flex; align-items:center; justify-content:center; width:16px; height:16px; min-width:16px; flex-shrink:0; }
        .nav-label { overflow:hidden; text-overflow:ellipsis; white-space:nowrap; line-height:1; }
      `}</style>
    </div>
  )
}
