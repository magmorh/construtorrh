import React, { useState, useEffect, useCallback } from 'react'
import { NavLink, useNavigate } from 'react-router-dom'
import { cn } from '@/lib/utils'
import { useAuth } from '@/hooks/useAuth'
import { useProfile, ROLE_PERMISSIONS } from '@/hooks/useProfile'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { ErrorBoundary } from '@/components/ErrorBoundary'
import { supabase } from '@/lib/supabase'
import {
  LayoutDashboard, Users, Building2, Shield,
  AlertTriangle, FileText, Clock, DollarSign, Award,
  Calculator, Bus, BarChart3, Settings, LogOut, Menu,
  HardHat, ChevronLeft, ChevronRight, UserCog,
  ClipboardList, Lock, CalendarDays, Briefcase, Wallet,
  Smartphone, Inbox, Scale, MessageSquare, X,
} from 'lucide-react'

// ── grupos de navegação ───────────────────────────────────────────────────────
const NAV_GROUPS = [
  {
    label: 'Principal',
    color: '#6366f1',
    items: [
      { to: '/',               label: 'Dashboard',      icon: LayoutDashboard, color: '#6366f1' },
      { to: '/solicitacoes',   label: 'Solicitações',   icon: Inbox,           color: '#ef4444', badge: true },
      { to: '/mensagens',      label: 'Mensagens',      icon: MessageSquare,   color: '#7c3aed', msgBadge: true },
    ],
  },
  {
    label: 'Cadastros',
    color: '#0ea5e9',
    items: [
      { to: '/colaboradores',  label: 'Colaboradores',  icon: Users,           color: '#0ea5e9' },
      { to: '/obras',          label: 'Obras',          icon: Building2,       color: '#14b8a6' },
      { to: '/playbooks',      label: 'Playbooks',      icon: ClipboardList,   color: '#8b5cf6' },
      { to: '/feriados',       label: 'Feriados',       icon: CalendarDays,    color: '#f59e0b' },
    ],
  },
  {
    label: 'Saúde & Seg.',
    color: '#ef4444',
    items: [
      { to: '/epis',           label: 'EPIs',           icon: Shield,          color: '#ef4444' },
      { to: '/ocorrencias',    label: 'Ocorrências',    icon: AlertTriangle,   color: '#f97316' },
      { to: '/documentos',     label: 'Documentos',     icon: FileText,        color: '#64748b' },
    ],
  },
  {
    label: 'Financeiro',
    color: '#10b981',
    items: [
      { to: '/ponto',            label: 'Ponto',              icon: Clock,        color: '#0ea5e9' },
      { to: '/vt',               label: 'Vale Transporte',    icon: Bus,          color: '#06b6d4' },
      { to: '/adiantamentos',    label: 'Adiantamentos',      icon: Wallet,       color: '#10b981' },
      { to: '/premios',          label: 'Prêmios',            icon: Award,        color: '#f59e0b' },
      { to: '/fechamento-ponto', label: 'Fechamento',         icon: Lock,         color: '#f97316', fechBadge: true },
      { to: '/pagamentos',       label: 'Pagamentos',         icon: DollarSign,   color: '#22c55e' },
      { to: '/encargos',         label: 'Encargos',           icon: Briefcase,    color: '#8b5cf6' },
      { to: '/provisoes',        label: 'Provisões Rescisão', icon: Calculator,   color: '#ec4899' },
    ],
  },
  {
    label: 'Jurídico',
    color: '#64748b',
    items: [
      { to: '/juridico', label: 'Jurídico', icon: Scale, color: '#64748b' },
    ],
  },
  {
    label: 'Sistema',
    color: '#475569',
    items: [
      { to: '/relatorios',     label: 'Relatórios',      icon: BarChart3,  color: '#6366f1' },
      { to: '/usuarios',       label: 'Usuários',         icon: UserCog,   color: '#0ea5e9', adminOnly: true },
      { to: '/portal-admin',   label: 'Portal da Obra',   icon: Smartphone, color: '#10b981', adminOnly: true },
      { to: '/configuracoes',  label: 'Configurações',    icon: Settings,  color: '#64748b' },
    ],
  },
]

interface LayoutProps { children: React.ReactNode }

export function Layout({ children }: LayoutProps) {
  const [collapsed, setCollapsed]   = useState(false)
  const [mobileOpen, setMobileOpen] = useState(false)
  const { user, signOut } = useAuth()
  const { profile } = useProfile()
  const navigate = useNavigate()
  const [solicitacoesPendentes, setSolicitacoesPendentes] = useState(0)
  const [fechamentosPendentes,  setFechamentosPendentes]  = useState(0)
  const [mensagensNaoLidas,     setMensagensNaoLidas]     = useState(0)

  const fetchFechamentosPendentes = useCallback(async () => {
    const { count } = await supabase.from('ponto_lancamentos')
      .select('id', { count: 'exact', head: true })
      .eq('status', 'aguardando_aprovacao')
    setFechamentosPendentes(count ?? 0)
  }, [])

  useEffect(() => {
    fetchFechamentosPendentes()
    const t = setInterval(fetchFechamentosPendentes, 60_000)
    return () => clearInterval(t)
  }, [fetchFechamentosPendentes])

  const fetchSolicitacoesPendentes = useCallback(async () => {
    const [cad, ocor, epi, doc] = await Promise.all([
      supabase.from('portal_solicitacoes').select('id', { count:'exact', head:true }).eq('tipo','novo_colaborador').eq('status','pendente'),
      supabase.from('portal_ocorrencias').select('id', { count:'exact', head:true }).is('sincronizado_em', null),
      supabase.from('portal_epi_solicitacoes').select('id', { count:'exact', head:true }).eq('status','pendente'),
      supabase.from('portal_documentos').select('id', { count:'exact', head:true }).eq('status','pendente'),
    ])
    setSolicitacoesPendentes((cad.count??0)+(ocor.count??0)+(epi.count??0)+(doc.count??0))
  }, [])

  const fetchMensagensNaoLidas = useCallback(async () => {
    const { count } = await supabase.from('portal_mensagens')
      .select('id', { count:'exact', head:true })
      .eq('remetente','obra').eq('lida', false)
    setMensagensNaoLidas(count ?? 0)
  }, [])

  useEffect(() => { fetchSolicitacoesPendentes(); const t = setInterval(fetchSolicitacoesPendentes, 60_000); return () => clearInterval(t) }, [fetchSolicitacoesPendentes])
  useEffect(() => { fetchMensagensNaoLidas(); const t = setInterval(fetchMensagensNaoLidas, 30_000); return () => clearInterval(t) }, [fetchMensagensNaoLidas])

  const handleSignOut = async () => { await signOut(); navigate('/login') }
  const userLogin  = profile?.nome || user?.email?.split('@')[0] || 'usuário'
  const userEmail  = user?.email ?? ''
  const initials   = userLogin.slice(0, 2).toUpperCase()
  const role       = profile?.role ?? 'visualizador'
  const roleMeta   = ROLE_PERMISSIONS[role]

  const W = collapsed ? 64 : 232

  return (
    <div style={{ display: 'flex', height: '100vh', overflow: 'hidden', background: 'var(--background)' }}>

      {/* overlay mobile */}
      {mobileOpen && (
        <div onClick={() => setMobileOpen(false)}
          style={{ position: 'fixed', inset: 0, zIndex: 40, background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(2px)' }} />
      )}

      {/* ═══════════════════════════════════════════
          SIDEBAR
      ═══════════════════════════════════════════ */}
      <aside style={{
        width: W, minWidth: W, maxWidth: W,
        display: 'flex', flexDirection: 'column',
        background: '#0c1628',
        borderRight: '1px solid rgba(255,255,255,0.06)',
        transition: 'width 220ms cubic-bezier(0.4,0,0.2,1), min-width 220ms cubic-bezier(0.4,0,0.2,1), max-width 220ms cubic-bezier(0.4,0,0.2,1)',
        flexShrink: 0, zIndex: 50,
        boxShadow: '4px 0 24px rgba(0,0,0,0.15)',
      }}
        className={cn(
          'max-lg:!fixed max-lg:inset-y-0 max-lg:left-0',
          mobileOpen ? 'max-lg:translate-x-0' : 'max-lg:-translate-x-full',
          'transition-transform lg:transition-none',
        )}
      >
        {/* ── Logo ─────────────────────────────────────── */}
        <div style={{
          height: 60, flexShrink: 0, display: 'flex', alignItems: 'center',
          padding: collapsed ? '0 16px' : '0 18px', gap: 11,
          borderBottom: '1px solid rgba(255,255,255,0.05)',
          background: 'linear-gradient(135deg, rgba(59,130,246,0.15) 0%, transparent 100%)',
        }}>
          <div style={{
            width: 34, height: 34, minWidth: 34, borderRadius: 10,
            background: 'linear-gradient(135deg, #3b82f6 0%, #1d4ed8 100%)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            boxShadow: '0 4px 12px rgba(59,130,246,0.4)',
            flexShrink: 0,
          }}>
            <HardHat size={17} color="#fff" />
          </div>
          {!collapsed && (
            <div style={{ overflow: 'hidden', transition: 'opacity 180ms' }}>
              <div style={{ fontSize: 14, fontWeight: 800, color: '#f1f5f9', whiteSpace: 'nowrap', letterSpacing: '-0.01em' }}>ConstrutorRH</div>
              <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.32)', whiteSpace: 'nowrap', letterSpacing: '0.03em' }}>GESTÃO DE RH</div>
            </div>
          )}
        </div>

        {/* ── Nav ─────────────────────────────────────── */}
        <nav style={{ flex: 1, overflowY: 'auto', overflowX: 'hidden', padding: '8px 0 4px' }}
          className="sidebar-scroll">
          {NAV_GROUPS.map((group, gi) => (
            <div key={gi} style={{ marginBottom: 2 }}>
              {gi > 0 && (
                <div style={{ margin: collapsed ? '4px 12px' : '4px 14px 0', borderTop: '1px solid rgba(255,255,255,0.05)' }} />
              )}
              {!collapsed && (
                <div style={{
                  padding: '8px 18px 4px',
                  fontSize: 9.5, fontWeight: 800, textTransform: 'uppercase',
                  letterSpacing: '0.1em', color: 'rgba(255,255,255,0.22)',
                  userSelect: 'none', display: 'flex', alignItems: 'center', gap: 6,
                }}>
                  <span style={{ width: 12, height: 1.5, background: group.color, borderRadius: 2, opacity: 0.7, display: 'inline-block' }} />
                  {group.label}
                </div>
              )}
              {group.items.map((item: any) => {
                const { to, label, icon: Icon, adminOnly, badge: hasBadge, fechBadge, msgBadge, color } = item
                if (adminOnly && user?.email !== 'magmodrive@gmail.com') return null
                const isFinanceiro = ['/ponto','/vt','/adiantamentos','/premios','/fechamento-ponto','/pagamentos','/encargos','/provisoes'].includes(to)
                if (isFinanceiro && !roleMeta.canViewFinanceiro) return null
                const badgeCount = hasBadge ? solicitacoesPendentes : (fechBadge ? fechamentosPendentes : (msgBadge ? mensagensNaoLidas : 0))
                const badgeColor = fechBadge ? '#f97316' : (msgBadge ? '#7c3aed' : '#ef4444')

                return (
                  <NavLink key={to} to={to} end={to === '/'} title={collapsed ? label : undefined}
                    onClick={() => setMobileOpen(false)} style={{ textDecoration: 'none' }}
                    className={({ isActive }) => cn('nav-item-v2', isActive ? 'nav-item-v2--active' : 'nav-item-v2--default')}
                  >
                    {({ isActive }) => (
                      <>
                        {/* Ícone com cor individual */}
                        <span className="nav-icon-v2" style={{
                          background: isActive ? `${color}22` : 'transparent',
                          color: isActive ? color : 'rgba(255,255,255,0.45)',
                          transition: 'all 0.15s',
                          position: 'relative',
                        }}>
                          <Icon size={15} strokeWidth={isActive ? 2.2 : 1.8} />
                          {collapsed && badgeCount > 0 && (
                            <span style={{
                              position: 'absolute', top: -3, right: -3,
                              background: badgeColor, color: '#fff',
                              borderRadius: 10, fontSize: 7, fontWeight: 800,
                              padding: '0 3px', minWidth: 12, textAlign: 'center', lineHeight: '12px',
                              boxShadow: '0 0 0 1.5px #0c1628',
                            }}>
                              {badgeCount > 99 ? '99+' : badgeCount}
                            </span>
                          )}
                        </span>

                        {!collapsed && (
                          <span className="nav-label-v2" style={{ color: isActive ? '#f1f5f9' : 'rgba(255,255,255,0.55)', flex: 1 }}>
                            {label}
                          </span>
                        )}

                        {/* Badge inline */}
                        {!collapsed && badgeCount > 0 && (
                          <span style={{
                            background: badgeColor, color: '#fff',
                            borderRadius: 10, padding: '1px 6px',
                            fontSize: 10, fontWeight: 800,
                            minWidth: 18, textAlign: 'center',
                            boxShadow: `0 2px 6px ${badgeColor}55`,
                          }}>
                            {badgeCount > 99 ? '99+' : badgeCount}
                          </span>
                        )}

                        {/* Indicador ativo */}
                        {isActive && (
                          <span style={{
                            position: 'absolute', right: 0, top: '50%', transform: 'translateY(-50%)',
                            width: 3, height: 18, borderRadius: '2px 0 0 2px',
                            background: color,
                          }} />
                        )}
                      </>
                    )}
                  </NavLink>
                )
              })}
            </div>
          ))}
        </nav>

        {/* ── Footer ─────────────────────────────────────── */}
        <div style={{ borderTop: '1px solid rgba(255,255,255,0.05)', flexShrink: 0 }}>
          {!collapsed && (
            <div style={{
              display: 'flex', alignItems: 'center', gap: 10,
              padding: '12px 16px', borderBottom: '1px solid rgba(255,255,255,0.04)',
            }}>
              <Avatar style={{ width: 32, height: 32, flexShrink: 0 }}>
                <AvatarFallback style={{
                  fontSize: 11, fontWeight: 800,
                  background: 'linear-gradient(135deg, #1e3a5f 0%, #1d4ed8 100%)',
                  color: '#93c5fd',
                }}>
                  {initials}
                </AvatarFallback>
              </Avatar>
              <div style={{ minWidth: 0, flex: 1 }}>
                <div style={{ fontSize: 12, fontWeight: 700, color: 'rgba(255,255,255,0.85)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {userLogin}
                </div>
                <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.28)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {userEmail}
                </div>
                <span style={{
                  display: 'inline-block', marginTop: 2,
                  padding: '1px 7px', borderRadius: 10,
                  fontSize: 9, fontWeight: 800,
                  background: roleMeta.bg, color: roleMeta.color,
                  letterSpacing: '0.05em',
                }}>
                  {roleMeta.label}
                </span>
              </div>
            </div>
          )}

          {collapsed && (
            <div style={{ display: 'flex', justifyContent: 'center', padding: '8px 0 4px' }}>
              <Avatar style={{ width: 30, height: 30 }}>
                <AvatarFallback style={{
                  fontSize: 10, fontWeight: 800,
                  background: 'linear-gradient(135deg, #1e3a5f 0%, #1d4ed8 100%)',
                  color: '#93c5fd',
                }}>
                  {initials}
                </AvatarFallback>
              </Avatar>
            </div>
          )}

          <button onClick={handleSignOut} title="Sair"
            style={{
              display: 'flex', alignItems: 'center',
              gap: collapsed ? 0 : 8,
              justifyContent: collapsed ? 'center' : 'flex-start',
              width: '100%', padding: collapsed ? '10px 0' : '9px 16px',
              fontSize: 12, fontWeight: 600,
              color: 'rgba(255,255,255,0.30)',
              background: 'none', border: 'none', cursor: 'pointer',
              transition: 'all 0.15s',
            }}
            onMouseEnter={e => {
              const el = e.currentTarget as HTMLElement
              el.style.color = '#f87171'
              el.style.background = 'rgba(239,68,68,0.08)'
            }}
            onMouseLeave={e => {
              const el = e.currentTarget as HTMLElement
              el.style.color = 'rgba(255,255,255,0.30)'
              el.style.background = ''
            }}
          >
            <LogOut size={14} />
            {!collapsed && <span>Sair da conta</span>}
          </button>
        </div>
      </aside>

      {/* ═══════════════════════════════════════════
          MAIN AREA
      ═══════════════════════════════════════════ */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0, overflow: 'hidden' }}>

        {/* ── Header ─────────────────────────────────────── */}
        <header style={{
          height: 60, flexShrink: 0,
          display: 'flex', alignItems: 'center',
          padding: '0 20px', gap: 10,
          background: 'var(--card)',
          borderBottom: '1px solid var(--border)',
          boxShadow: '0 1px 4px rgba(0,0,0,0.04)',
        }}>
          {/* Toggle sidebar — desktop */}
          <button onClick={() => setCollapsed(v => !v)} title={collapsed ? 'Expandir menu' : 'Recolher menu'}
            className="hidden lg:flex"
            style={{
              width: 34, height: 34,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              borderRadius: 8, border: '1px solid var(--border)',
              background: 'transparent', color: 'var(--muted-foreground)',
              cursor: 'pointer', transition: 'all 0.15s',
            }}
            onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = 'var(--muted)'; (e.currentTarget as HTMLElement).style.borderColor = 'var(--ring)' }}
            onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'transparent'; (e.currentTarget as HTMLElement).style.borderColor = 'var(--border)' }}
          >
            {collapsed ? <ChevronRight size={15} /> : <ChevronLeft size={15} />}
          </button>

          {/* Toggle sidebar — mobile */}
          <button onClick={() => setMobileOpen(true)} className="lg:hidden"
            style={{
              width: 34, height: 34,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              borderRadius: 8, border: '1px solid var(--border)',
              background: 'transparent', color: 'var(--muted-foreground)', cursor: 'pointer',
            }}>
            <Menu size={16} />
          </button>

          {/* Fechar mobile (aparece só quando aberto) */}
          {mobileOpen && (
            <button onClick={() => setMobileOpen(false)} className="lg:hidden"
              style={{
                width: 34, height: 34,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                borderRadius: 8, border: '1px solid var(--border)',
                background: 'transparent', color: 'var(--muted-foreground)', cursor: 'pointer',
              }}>
              <X size={16} />
            </button>
          )}

          <div style={{ flex: 1 }} />

          {/* Role badge */}
          <span style={{
            padding: '4px 12px', borderRadius: 20, fontSize: 11, fontWeight: 700,
            background: roleMeta.bg, color: roleMeta.color,
            border: `1px solid ${roleMeta.color}30`,
            letterSpacing: '0.03em',
          }}>
            {roleMeta.label}
          </span>

          {/* Avatar */}
          <Avatar style={{ width: 34, height: 34, cursor: 'default' }}>
            <AvatarFallback style={{
              fontSize: 12, fontWeight: 800,
              background: 'linear-gradient(135deg, #1e3a5f 0%, #2563eb 100%)',
              color: '#bfdbfe',
            }}>
              {initials}
            </AvatarFallback>
          </Avatar>
        </header>

        {/* ── Main content ─────────────────────────────────────── */}
        <main style={{ flex: 1, overflowY: 'auto', padding: '20px 24px', background: 'var(--background)' }}>
          <ErrorBoundary>
            {children}
          </ErrorBoundary>
        </main>
      </div>

      <style>{`
        /* Scrollbar sidebar */
        .sidebar-scroll::-webkit-scrollbar { width: 3px; }
        .sidebar-scroll::-webkit-scrollbar-track { background: transparent; }
        .sidebar-scroll::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.1); border-radius: 4px; }
        .sidebar-scroll::-webkit-scrollbar-thumb:hover { background: rgba(255,255,255,0.2); }

        /* Nav item base */
        .nav-item-v2 {
          display: flex;
          flex-direction: row;
          align-items: center;
          position: relative;
          margin: 1px 8px;
          padding: 7px 8px;
          border-radius: 8px;
          font-size: 12.5px;
          font-weight: 500;
          text-decoration: none;
          gap: 9px;
          white-space: nowrap;
          overflow: hidden;
          transition: background 140ms ease, color 140ms ease;
          cursor: pointer;
        }
        .nav-item-v2--default:hover {
          background: rgba(255,255,255,0.05);
        }
        .nav-item-v2--default:hover .nav-icon-v2 {
          color: rgba(255,255,255,0.75) !important;
        }
        .nav-item-v2--active {
          background: rgba(255,255,255,0.06);
        }

        /* Ícone */
        .nav-icon-v2 {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          width: 28px;
          height: 28px;
          min-width: 28px;
          border-radius: 7px;
          flex-shrink: 0;
          transition: all 0.15s;
        }

        /* Label */
        .nav-label-v2 {
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
          line-height: 1;
          font-size: 12.5px;
          transition: color 0.15s;
        }
      `}</style>
    </div>
  )
}
