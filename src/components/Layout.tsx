import React, { useState } from 'react'
import { NavLink, useNavigate } from 'react-router-dom'
import { cn } from '@/lib/utils'
import { useAuth } from '@/hooks/useAuth'
import { Button } from '@/components/ui/button'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import { Separator } from '@/components/ui/separator'
import {
  LayoutDashboard, Users, Building2, Briefcase, Shield,
  AlertTriangle, FileText, Clock, DollarSign, Award,
  Calculator, Bus, BarChart3, Settings, LogOut, Menu,
  HardHat, ChevronLeft, ChevronRight, FileWarning
} from 'lucide-react'

// ── Grupos de navegação ────────────────────────────────────────────────────────
const NAV_GROUPS = [
  {
    label: 'Principal',
    items: [
      { to: '/', label: 'Dashboard', icon: LayoutDashboard },
    ],
  },
  {
    label: 'Cadastros',
    items: [
      { to: '/colaboradores', label: 'Colaboradores', icon: Users },
      { to: '/obras',          label: 'Obras',         icon: Building2 },
      { to: '/funcoes',        label: 'Funções',        icon: Briefcase },
    ],
  },
  {
    label: 'Saúde & Segurança',
    items: [
      { to: '/epis',       label: 'EPIs',        icon: Shield },
      { to: '/acidentes',  label: 'Acidentes',   icon: AlertTriangle },
      { to: '/atestados',  label: 'Atestados',   icon: FileWarning },
      { to: '/documentos', label: 'Documentos',  icon: FileText },
    ],
  },
  {
    label: 'Financeiro',
    items: [
      { to: '/ponto',      label: 'Ponto',          icon: Clock },
      { to: '/pagamentos', label: 'Pagamentos',      icon: DollarSign },
      { to: '/premios',    label: 'Prêmios',         icon: Award },
      { to: '/vt',         label: 'Vale Transporte', icon: Bus },
      { to: '/provisoes',  label: 'Provisões FGTS',  icon: Calculator },
    ],
  },
  {
    label: 'Sistema',
    items: [
      { to: '/relatorios',   label: 'Relatórios',   icon: BarChart3 },
      { to: '/configuracoes', label: 'Configurações', icon: Settings },
    ],
  },
]

interface LayoutProps { children: React.ReactNode }

export function Layout({ children }: LayoutProps) {
  const [collapsed, setCollapsed] = useState(false)
  const [mobileOpen, setMobileOpen] = useState(false)
  const { user, signOut } = useAuth()
  const navigate = useNavigate()

  const handleSignOut = async () => {
    await signOut()
    navigate('/login')
  }

  const initials = user?.email
    ? user.email.split('@')[0].slice(0, 2).toUpperCase()
    : 'RH'

  return (
    <TooltipProvider delayDuration={200}>
      <div className="flex h-screen bg-background overflow-hidden">

        {/* ── Overlay mobile ── */}
        {mobileOpen && (
          <div
            className="fixed inset-0 z-40 bg-black/60 lg:hidden"
            onClick={() => setMobileOpen(false)}
          />
        )}

        {/* ── SIDEBAR ─────────────────────────────────────────────────────────── */}
        <aside
          className={cn(
            'fixed lg:relative inset-y-0 left-0 z-50 flex flex-col',
            'bg-sidebar text-sidebar-foreground',
            'transition-[width] duration-200 ease-in-out',
            'border-r border-sidebar-border',
            collapsed ? 'w-[60px]' : 'w-[220px]',
            mobileOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0',
          )}
        >
          {/* Logo */}
          <div className={cn(
            'flex items-center gap-2.5 h-14 border-b border-sidebar-border px-4 flex-shrink-0',
            collapsed && 'justify-center px-0',
          )}>
            <div className="w-8 h-8 bg-sidebar-primary rounded-lg flex items-center justify-center flex-shrink-0">
              <HardHat className="w-4 h-4 text-sidebar-primary-foreground" />
            </div>
            {!collapsed && (
              <div className="min-w-0">
                <p className="text-sm font-bold text-sidebar-foreground leading-tight">ConstrutorRH</p>
                <p className="text-[10px] text-sidebar-foreground/40 leading-tight">Gestão de RH</p>
              </div>
            )}
          </div>

          {/* Navegação */}
          <nav className="flex-1 overflow-y-auto overflow-x-hidden py-3 scroll-smooth">
            {NAV_GROUPS.map((group, gi) => (
              <div key={gi} className={cn('mb-1', !collapsed && 'mb-2')}>
                {/* Label do grupo — só quando expandido */}
                {!collapsed && (
                  <p className="px-4 pt-2 pb-1 text-[10px] font-semibold uppercase tracking-widest text-sidebar-foreground/35 select-none">
                    {group.label}
                  </p>
                )}
                {collapsed && gi > 0 && (
                  <div className="mx-3 my-1 border-t border-sidebar-border/40" />
                )}

                {group.items.map(({ to, label, icon: Icon }) => (
                  <Tooltip key={to}>
                    <TooltipTrigger asChild>
                      <NavLink
                        to={to}
                        end={to === '/'}
                        onClick={() => setMobileOpen(false)}
                        className={({ isActive }) =>
                          cn(
                            'flex items-center gap-2.5 mx-2 px-2 py-2 rounded-md text-[13px] font-medium',
                            'transition-colors duration-100 select-none',
                            collapsed && 'justify-center mx-1 px-0',
                            isActive
                              ? 'bg-sidebar-primary text-sidebar-primary-foreground'
                              : 'text-sidebar-foreground/65 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground',
                          )
                        }
                      >
                        <Icon className="w-4 h-4 flex-shrink-0" />
                        {!collapsed && (
                          <span className="truncate">{label}</span>
                        )}
                      </NavLink>
                    </TooltipTrigger>
                    {collapsed && (
                      <TooltipContent side="right" className="text-xs">{label}</TooltipContent>
                    )}
                  </Tooltip>
                ))}
              </div>
            ))}
          </nav>

          {/* Footer — usuário + logout */}
          <div className="border-t border-sidebar-border flex-shrink-0">
            {!collapsed && (
              <div className="flex items-center gap-2 px-4 py-2.5">
                <Avatar className="h-7 w-7 flex-shrink-0">
                  <AvatarFallback className="text-[10px] font-bold bg-sidebar-accent text-sidebar-accent-foreground">
                    {initials}
                  </AvatarFallback>
                </Avatar>
                <div className="min-w-0 flex-1">
                  <p className="text-[11px] font-medium text-sidebar-foreground/80 truncate leading-tight">
                    {user?.email?.split('@')[0]}
                  </p>
                  <p className="text-[10px] text-sidebar-foreground/40 truncate leading-tight">
                    {user?.email?.split('@')[1]}
                  </p>
                </div>
              </div>
            )}
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  onClick={handleSignOut}
                  className={cn(
                    'w-full flex items-center gap-2 px-4 py-2.5',
                    'text-[12px] font-medium text-sidebar-foreground/50',
                    'hover:text-red-400 hover:bg-red-900/15 transition-colors',
                    collapsed && 'justify-center px-0 py-3',
                  )}
                >
                  <LogOut className="w-4 h-4 flex-shrink-0" />
                  {!collapsed && <span>Sair</span>}
                </button>
              </TooltipTrigger>
              {collapsed && <TooltipContent side="right">Sair</TooltipContent>}
            </Tooltip>
          </div>
        </aside>

        {/* ── MAIN ────────────────────────────────────────────────────────────── */}
        <div className="flex-1 flex flex-col min-w-0 overflow-hidden">

          {/* Topbar */}
          <header className="h-14 bg-card border-b border-border flex items-center gap-2 px-4 flex-shrink-0">
            {/* Toggle sidebar — desktop */}
            <Button
              variant="ghost"
              size="icon"
              className="hidden lg:flex h-8 w-8 text-muted-foreground hover:text-foreground"
              onClick={() => setCollapsed(v => !v)}
              aria-label={collapsed ? 'Expandir menu' : 'Recolher menu'}
            >
              {collapsed
                ? <ChevronRight className="w-4 h-4" />
                : <ChevronLeft  className="w-4 h-4" />}
            </Button>

            {/* Toggle sidebar — mobile */}
            <Button
              variant="ghost"
              size="icon"
              className="lg:hidden h-8 w-8 text-muted-foreground"
              onClick={() => setMobileOpen(true)}
            >
              <Menu className="w-4 h-4" />
            </Button>

            <div className="flex-1" />

            {/* Avatar usuário no topo */}
            <Avatar className="h-8 w-8">
              <AvatarFallback className="text-xs font-bold bg-primary text-primary-foreground">
                {initials}
              </AvatarFallback>
            </Avatar>
          </header>

          {/* Conteúdo */}
          <main className="flex-1 overflow-y-auto p-6">
            {children}
          </main>
        </div>
      </div>
    </TooltipProvider>
  )
}
