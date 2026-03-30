import React, { useState, useEffect, useCallback, useRef } from 'react'
import { NavLink, useNavigate, useLocation } from 'react-router-dom'
import { cn } from '@/lib/utils'
import { useAuth } from '@/hooks/useAuth'
import { useProfile, ROLE_PERMISSIONS } from '@/hooks/useProfile'
import { ErrorBoundary } from '@/components/ErrorBoundary'
import { supabase } from '@/lib/supabase'
import {
  LayoutDashboard, Users, Building2, Shield,
  AlertTriangle, FileText, Clock, DollarSign, Award,
  Calculator, Bus, BarChart3, Settings, LogOut, Menu,
  HardHat, ChevronLeft, ChevronRight, UserCog,
  ClipboardList, Lock, CalendarDays, Briefcase, Wallet,
  Smartphone, Inbox, Scale, MessageSquare, X,
  Search, Bell, ChevronDown,
  LayoutGrid, FolderKanban, HeartPulse, Banknote, Gavel, Cog,
  BookOpen, CreditCard, Layers, ClipboardCheck, ShoppingBasket,
} from 'lucide-react'

// ─── Cor principal da sidebar ───────────────────────────────────────────────
const SIDEBAR_BG    = '#0d3f56'
const SIDEBAR_HOVER = '#0a3347'
const SIDEBAR_W     = 62   // largura fixa (somente ícones de grupo)

// ─── Mapa de títulos de páginas ─────────────────────────────────────────────
const PAGE_TITLES: Record<string, { label: string; icon: React.ElementType; color: string }> = {
  '/':                  { label: 'Dashboard',          icon: LayoutDashboard, color: '#6366f1' },
  '/solicitacoes':      { label: 'Solicitações',        icon: Inbox,           color: '#ef4444' },
  '/mensagens':         { label: 'Mensagens',           icon: MessageSquare,   color: '#7c3aed' },
  '/colaboradores':     { label: 'Colaboradores',       icon: Users,           color: '#0ea5e9' },
  '/obras':             { label: 'Obras',               icon: Building2,       color: '#14b8a6' },
  '/playbooks':         { label: 'Playbooks',           icon: ClipboardList,   color: '#8b5cf6' },
  '/feriados':          { label: 'Feriados',            icon: CalendarDays,    color: '#f59e0b' },
  '/epis':              { label: 'EPIs',                icon: Shield,          color: '#ef4444' },
  '/ocorrencias':       { label: 'Ocorrências',         icon: AlertTriangle,   color: '#f97316' },
  '/documentos':        { label: 'Documentos',          icon: FileText,        color: '#64748b' },
  '/ponto':             { label: 'Ponto',               icon: Clock,           color: '#0ea5e9' },
  '/vt':               { label: 'Vale Transporte',     icon: Bus,            color: '#06b6d4' },
  '/cesta-basica':     { label: 'Cesta Básica',        icon: ShoppingBasket, color: '#f59e0b' },
  '/adiantamentos':     { label: 'Adiantamentos',       icon: Wallet,          color: '#10b981' },
  '/premios':           { label: 'Prêmios',             icon: Award,           color: '#f59e0b' },
  '/fechamento-ponto':  { label: 'Fechamento de Ponto', icon: Lock,            color: '#f97316' },
  '/pagamentos':        { label: 'Pagamentos',          icon: DollarSign,      color: '#22c55e' },
  '/encargos':          { label: 'Encargos',            icon: Briefcase,       color: '#8b5cf6' },
  '/provisoes':         { label: 'Provisões Rescisão',  icon: Calculator,      color: '#ec4899' },
  '/juridico':          { label: 'Jurídico',            icon: Scale,           color: '#64748b' },
  '/relatorios':        { label: 'Relatórios',          icon: BarChart3,       color: '#6366f1' },
  '/usuarios':          { label: 'Usuários',            icon: UserCog,         color: '#0ea5e9' },
  '/portal-admin':      { label: 'Portal da Obra',      icon: Smartphone,      color: '#10b981' },
  '/configuracoes':     { label: 'Configurações',       icon: Settings,        color: '#64748b' },
}

// ─── Grupos de navegação (flyout) ────────────────────────────────────────────
const NAV_GROUPS = [
  {
    id:    'dashboard',
    label: 'Dashboard',
    icon:  LayoutDashboard,
    items: [
      { to: '/', label: 'Dashboard', icon: LayoutDashboard, color: '#818cf8', badge: 'sol' as const },
    ],
  },
  {
    id:    'principal',
    label: 'Principal',
    icon:  LayoutGrid,
    items: [
      { to: '/solicitacoes', label: 'Solicitações', icon: Inbox,           color: '#f87171', badge: 'sol' as const },
      { to: '/mensagens',    label: 'Mensagens',    icon: MessageSquare,   color: '#a78bfa', badge: 'msg' as const },
      { to: '/relatorios',   label: 'Relatórios',   icon: BarChart3,       color: '#818cf8' },
    ],
  },
  {
    id:    'cadastros',
    label: 'Cadastros',
    icon:  FolderKanban,
    items: [
      { to: '/colaboradores', label: 'Colaboradores', icon: Users,        color: '#38bdf8' },
      { to: '/obras',         label: 'Obras',         icon: Building2,    color: '#2dd4bf' },
      { to: '/playbooks',     label: 'Playbooks',     icon: ClipboardList,color: '#a78bfa' },
      { to: '/feriados',      label: 'Feriados',      icon: CalendarDays, color: '#fbbf24' },
    ],
  },
  {
    id:    'saude',
    label: 'Saúde & Seg.',
    icon:  HeartPulse,
    items: [
      { to: '/epis',       label: 'EPIs',       icon: Shield,        color: '#f87171' },
      { to: '/ocorrencias',label: 'Ocorrências',icon: AlertTriangle, color: '#fb923c' },
      { to: '/documentos', label: 'Documentos', icon: FileText,      color: '#94a3b8' },
    ],
  },
  {
    id:    'lancamentos',
    label: 'Lançamentos',
    icon:  Layers,
    items: [
      { to: '/ponto',         label: 'Ponto',          icon: Clock,   color: '#38bdf8' },
      { to: '/vt',            label: 'Vale Transporte', icon: Bus,             color: '#22d3ee' },
      { to: '/cesta-basica',  label: 'Cesta Básica',    icon: ShoppingBasket,  color: '#f59e0b' },
      { to: '/adiantamentos', label: 'Adiantamentos',   icon: Wallet,          color: '#34d399' },
      { to: '/premios',       label: 'Prêmios',        icon: Award,   color: '#fbbf24' },
    ],
  },
  {
    id:    'fechamento',
    label: 'Fechamento',
    icon:  ClipboardCheck,
    items: [
      { to: '/fechamento-ponto', label: 'Fechamento de Ponto', icon: Lock, color: '#fb923c', badge: 'fech' as const },
    ],
  },
  {
    id:    'pagamentos',
    label: 'Pagamentos',
    icon:  CreditCard,
    items: [
      { to: '/pagamentos', label: 'Pagamentos', icon: DollarSign, color: '#4ade80' },
    ],
  },
  {
    id:    'encargos',
    label: 'Encargos',
    icon:  Briefcase,
    items: [
      { to: '/encargos',  label: 'Encargos',           icon: Briefcase,  color: '#a78bfa' },
      { to: '/provisoes', label: 'Provisões Rescisão', icon: Calculator, color: '#f472b6' },
    ],
  },
  {
    id:    'juridico',
    label: 'Jurídico',
    icon:  Gavel,
    items: [
      { to: '/juridico', label: 'Jurídico', icon: Scale, color: '#94a3b8' },
    ],
  },
  {
    id:    'sistema',
    label: 'Sistema',
    icon:  Cog,
    items: [
      { to: '/usuarios',      label: 'Usuários',      icon: UserCog,    color: '#38bdf8', adminOnly: true },
      { to: '/portal-admin',  label: 'Portal da Obra',icon: Smartphone, color: '#34d399', adminOnly: true },
      { to: '/configuracoes', label: 'Configurações', icon: Settings,   color: '#94a3b8' },
    ],
  },
]

// ─── Busca rápida ─────────────────────────────────────────────────────────────
const SEARCH_PAGES = NAV_GROUPS.flatMap(g => g.items).map(i => ({ label: i.label, to: i.to, icon: i.icon }))

interface LayoutProps { children: React.ReactNode }

export function Layout({ children }: LayoutProps) {
  const [mobileOpen, setMobileOpen]   = useState(false)
  const [openGroup,  setOpenGroup]    = useState<string | null>(null)
  const [searchOpen, setSearchOpen]   = useState(false)
  const [searchQ,    setSearchQ]      = useState('')
  const [showNotif,  setShowNotif]    = useState(false)

  // Refs para flyout e notificações
  const flyoutTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const searchRef   = useRef<HTMLInputElement>(null)
  const notifRef    = useRef<HTMLDivElement>(null)

  const { user, signOut }   = useAuth()
  const { profile }         = useProfile()
  const navigate            = useNavigate()
  const location            = useLocation()

  const [solicitacoesPendentes, setSolicitacoesPendentes] = useState(0)
  const [fechamentosPendentes,  setFechamentosPendentes]  = useState(0)
  const [mensagensNaoLidas,     setMensagensNaoLidas]     = useState(0)

  // ── Fetches de badges ─────────────────────────────────────────────────────
  const fetchFechamentos = useCallback(async () => {
    const { count } = await supabase.from('ponto_lancamentos')
      .select('id', { count:'exact', head:true }).eq('status','aguardando_aprovacao')
    setFechamentosPendentes(count ?? 0)
  }, [])

  const fetchSolicitacoes = useCallback(async () => {
    const [cad, ocor, epi, doc] = await Promise.all([
      supabase.from('portal_solicitacoes').select('id',{count:'exact',head:true}).eq('tipo','novo_colaborador').eq('status','pendente'),
      supabase.from('portal_ocorrencias').select('id',{count:'exact',head:true}).is('sincronizado_em',null),
      supabase.from('portal_epi_solicitacoes').select('id',{count:'exact',head:true}).eq('status','pendente'),
      supabase.from('portal_documentos').select('id',{count:'exact',head:true}).eq('status','pendente'),
    ])
    setSolicitacoesPendentes((cad.count??0)+(ocor.count??0)+(epi.count??0)+(doc.count??0))
  }, [])

  const fetchMensagens = useCallback(async () => {
    const { count } = await supabase.from('portal_mensagens')
      .select('id',{count:'exact',head:true}).eq('remetente','obra').eq('lida',false)
    setMensagensNaoLidas(count ?? 0)
  }, [])

  useEffect(() => { fetchFechamentos();  const t = setInterval(fetchFechamentos,  60_000); return () => clearInterval(t) }, [fetchFechamentos])
  useEffect(() => { fetchSolicitacoes(); const t = setInterval(fetchSolicitacoes, 60_000); return () => clearInterval(t) }, [fetchSolicitacoes])
  useEffect(() => { fetchMensagens();    const t = setInterval(fetchMensagens,    30_000); return () => clearInterval(t) }, [fetchMensagens])

  // ── Fechar notif ao clicar fora ───────────────────────────────────────────
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (notifRef.current && !notifRef.current.contains(e.target as Node)) setShowNotif(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  // ── Ctrl+K para busca ─────────────────────────────────────────────────────
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'k') { e.preventDefault(); setSearchOpen(true); setTimeout(() => searchRef.current?.focus(), 50) }
      if (e.key === 'Escape') { setSearchOpen(false); setSearchQ('') }
    }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [])

  // ── Flyout hover handlers ─────────────────────────────────────────────────
  function handleGroupEnter(id: string) {
    if (flyoutTimer.current) clearTimeout(flyoutTimer.current)
    setOpenGroup(id)
  }
  function handleGroupLeave() {
    flyoutTimer.current = setTimeout(() => setOpenGroup(null), 120)
  }
  function handleFlyoutEnter() {
    if (flyoutTimer.current) clearTimeout(flyoutTimer.current)
  }
  function handleFlyoutLeave() {
    flyoutTimer.current = setTimeout(() => setOpenGroup(null), 120)
  }

  const handleSignOut = async () => { await signOut(); navigate('/login') }

  const userLogin = profile?.nome || user?.email?.split('@')[0] || 'usuário'
  const initials  = userLogin.split(' ').map((n: string) => n[0]).slice(0, 2).join('').toUpperCase()
  const role      = profile?.role ?? 'visualizador'
  const roleMeta  = ROLE_PERMISSIONS[role]

  // Página atual
  const pathKey    = '/' + location.pathname.split('/').filter(Boolean)[0]
  const pageMeta   = PAGE_TITLES[location.pathname] ?? PAGE_TITLES[pathKey] ?? { label: 'ConstrutorRH', icon: HardHat, color: '#6366f1' }
  const PageIcon   = pageMeta.icon
  const totalNotif = solicitacoesPendentes + fechamentosPendentes + mensagensNaoLidas

  // Grupo ativo (para destacar o ícone do grupo na sidebar)
  const activeGroupId = NAV_GROUPS.find(g => g.items.some(i => {
    if (i.to === '/') return location.pathname === '/'
    return location.pathname.startsWith(i.to)
  }))?.id ?? null

  // Badge count por tipo
  function getBadgeCount(badge?: string) {
    if (badge === 'sol')  return solicitacoesPendentes
    if (badge === 'msg')  return mensagensNaoLidas
    if (badge === 'fech') return fechamentosPendentes
    return 0
  }

  // Badge color por tipo
  function getBadgeColor(badge?: string) {
    if (badge === 'msg')  return '#a78bfa'
    if (badge === 'fech') return '#fb923c'
    return '#f87171'
  }

  // Badge total por grupo
  function getGroupBadge(groupId: string) {
    if (groupId === 'principal')  return solicitacoesPendentes + mensagensNaoLidas
    if (groupId === 'fechamento') return fechamentosPendentes
    return 0
  }

  // Busca filtrada
  const searchResults = SEARCH_PAGES.filter(p =>
    p.label.toLowerCase().includes(searchQ.toLowerCase())
  ).slice(0, 8)

  return (
    <div style={{ display:'flex', height:'100vh', overflow:'hidden', background:'#f0f2f5' }}>

      {/* overlay mobile */}
      {mobileOpen && (
        <div onClick={() => setMobileOpen(false)}
          style={{ position:'fixed', inset:0, zIndex:40, background:'rgba(0,0,0,0.55)', backdropFilter:'blur(3px)' }} />
      )}

      {/* ═══════════════════════════════════════════════
          SIDEBAR — ultra-compacta com flyout
      ═══════════════════════════════════════════════ */}
      <aside
        style={{
          width: SIDEBAR_W, minWidth: SIDEBAR_W, maxWidth: SIDEBAR_W,
          display:'flex', flexDirection:'column',
          background: SIDEBAR_BG,
          flexShrink:0, zIndex:50,
          boxShadow:'3px 0 16px rgba(0,0,0,0.18)',
          position:'relative',
        }}
        className={cn(
          'max-lg:!fixed max-lg:inset-y-0 max-lg:left-0',
          mobileOpen ? 'max-lg:translate-x-0' : 'max-lg:-translate-x-full',
          'transition-transform lg:transition-none',
        )}
      >
        {/* Logo */}
        <div style={{
          height:58, flexShrink:0,
          display:'flex', alignItems:'center', justifyContent:'center',
          borderBottom:`1px solid rgba(255,255,255,0.08)`,
          background:'rgba(0,0,0,0.15)',
        }}>
          <div style={{
            width:34, height:34, borderRadius:10,
            background:'rgba(255,255,255,0.15)',
            display:'flex', alignItems:'center', justifyContent:'center',
            border:'1.5px solid rgba(255,255,255,0.25)',
          }}>
            <HardHat size={16} color="#fff" strokeWidth={2.2}/>
          </div>
        </div>

        {/* Grupos de navegação */}
        <nav style={{ flex:1, display:'flex', flexDirection:'column', padding:'8px 0', gap:2, overflowY:'auto', overflowX:'visible' }}
          className="sidebar-scroll">
          {NAV_GROUPS.map(group => {
            const GroupIcon    = group.icon
            const isActive     = activeGroupId === group.id
            const isOpen       = openGroup === group.id
            const groupBadge   = getGroupBadge(group.id)

            // Filtra itens do grupo conforme permissões
            const visibleItems = group.items.filter((item: any) => {
              if (item.adminOnly && user?.email !== 'magmodrive@gmail.com') return false
              const isFinanceiro = ['/ponto','/vt','/adiantamentos','/premios','/fechamento-ponto','/pagamentos','/encargos','/provisoes','/relatorios'].includes(item.to)
              if (isFinanceiro && !roleMeta.canViewFinanceiro) return false
              return true
            })

            // ── Grupo com item único → navega direto, sem flyout ──────────────
            const isSingleItem = visibleItems.length === 1

            return (
              <div key={group.id} style={{ position:'relative' }}
                onMouseEnter={() => { if (!isSingleItem) handleGroupEnter(group.id) }}
                onMouseLeave={() => { if (!isSingleItem) handleGroupLeave() }}
              >
                {/* Botão do grupo */}
                {isSingleItem ? (
                  /* Grupos com 1 item → NavLink direto */
                  <NavLink
                    to={visibleItems[0].to}
                    end={visibleItems[0].to === '/'}
                    title={visibleItems[0].label}
                    style={{ textDecoration:'none', display:'block' }}
                  >
                    {({ isActive: isLinkActive }) => (
                      <div style={{
                        width:'100%', height:48,
                        display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', gap:3,
                        background: isLinkActive ? 'rgba(255,255,255,0.15)' : 'transparent',
                        cursor:'pointer', position:'relative', transition:'background 0.15s',
                        borderLeft: isLinkActive ? '3px solid rgba(255,255,255,0.80)' : '3px solid transparent',
                      }}
                        onMouseEnter={e => { if (!isLinkActive) (e.currentTarget as HTMLElement).style.background='rgba(255,255,255,0.07)' }}
                        onMouseLeave={e => { if (!isLinkActive) (e.currentTarget as HTMLElement).style.background='transparent' }}
                      >
                        <GroupIcon size={18} color={isLinkActive ? '#fff' : 'rgba(255,255,255,0.55)'} strokeWidth={isLinkActive ? 2.3 : 1.8}/>
                        <span style={{ fontSize:8, fontWeight:700, color: isLinkActive ? '#fff' : 'rgba(255,255,255,0.40)', letterSpacing:'0.03em', lineHeight:1, userSelect:'none' }}>
                          {group.label.length > 8 ? group.label.slice(0,8) : group.label}
                        </span>
                        {groupBadge > 0 && (
                          <span style={{ position:'absolute', top:6, right:6, background:'#f87171', color:'#fff', borderRadius:8, fontSize:7, fontWeight:800, padding:'0 3px', minWidth:13, textAlign:'center', lineHeight:'13px', boxShadow:`0 0 0 1.5px ${SIDEBAR_BG}` }}>
                            {groupBadge > 99 ? '99+' : groupBadge}
                          </span>
                        )}
                      </div>
                    )}
                  </NavLink>
                ) : (
                  /* Grupos com múltiplos itens → abre flyout */
                  <button
                    title={group.label}
                    style={{
                      width:'100%', height:48,
                      display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', gap:3,
                      background: isActive ? 'rgba(255,255,255,0.15)' : isOpen ? 'rgba(255,255,255,0.10)' : 'transparent',
                      border:'none', cursor:'pointer', position:'relative',
                      transition:'background 0.15s',
                      borderLeft: isActive ? '3px solid rgba(255,255,255,0.80)' : '3px solid transparent',
                    }}
                  >
                    <GroupIcon size={18} color={isActive ? '#fff' : 'rgba(255,255,255,0.55)'} strokeWidth={isActive ? 2.3 : 1.8}/>
                    <span style={{ fontSize:8, fontWeight:700, color: isActive ? '#fff' : 'rgba(255,255,255,0.40)', letterSpacing:'0.03em', lineHeight:1, userSelect:'none' }}>
                      {group.id === 'saude' ? 'Saúde' : group.label}
                    </span>
                    {groupBadge > 0 && (
                      <span style={{ position:'absolute', top:6, right:6, background:'#f87171', color:'#fff', borderRadius:8, fontSize:7, fontWeight:800, padding:'0 3px', minWidth:13, textAlign:'center', lineHeight:'13px', boxShadow:`0 0 0 1.5px ${SIDEBAR_BG}` }}>
                        {groupBadge > 99 ? '99+' : groupBadge}
                      </span>
                    )}
                  </button>
                )}

                {/* ── Flyout submenu (só para grupos com múltiplos itens) ── */}
                {!isSingleItem && isOpen && (
                  <div
                    onMouseEnter={handleFlyoutEnter}
                    onMouseLeave={handleFlyoutLeave}
                    style={{
                      position:'fixed',
                      left: SIDEBAR_W,
                      top:0,
                      height:'100vh',
                      width:220,
                      background:'#fff',
                      borderRight:'1px solid #e4e8f0',
                      boxShadow:'4px 0 24px rgba(0,0,0,0.12)',
                      zIndex:200,
                      display:'flex', flexDirection:'column',
                      paddingTop:8,
                      opacity: 1,
                      pointerEvents: 'auto',
                      transition:'opacity 0.14s ease',
                    }}
                  >
                    {/* Cabeçalho do flyout */}
                    <div style={{
                      padding:'10px 16px 8px',
                      display:'flex', alignItems:'center', gap:8,
                      borderBottom:'1px solid #f1f5f9',
                      marginBottom:4,
                    }}>
                      <div style={{ width:28, height:28, borderRadius:8, background:`${SIDEBAR_BG}18`, display:'flex', alignItems:'center', justifyContent:'center' }}>
                        <GroupIcon size={14} color={SIDEBAR_BG} strokeWidth={2}/>
                      </div>
                      <span style={{ fontSize:12, fontWeight:800, color:'#1e293b', letterSpacing:'0.01em' }}>{group.label}</span>
                    </div>

                    {/* Itens do flyout */}
                    <div style={{ flex:1, overflowY:'auto', padding:'4px 8px' }} className="sidebar-scroll">
                      {visibleItems.map((item: any) => {
                        const ItemIcon   = item.icon
                        const badgeCount = getBadgeCount(item.badge)
                        const badgeColor = getBadgeColor(item.badge)
                        const isItemActive = item.to === '/'
                          ? location.pathname === '/'
                          : location.pathname.startsWith(item.to)

                        return (
                          <NavLink
                            key={item.to}
                            to={item.to}
                            end={item.to === '/'}
                            onClick={() => { setOpenGroup(null); setMobileOpen(false) }}
                            style={{ textDecoration:'none' }}
                          >
                            {() => (
                              <div style={{
                                display:'flex', alignItems:'center', gap:10,
                                padding:'8px 10px', borderRadius:8, marginBottom:1,
                                background: isItemActive ? `${SIDEBAR_BG}14` : 'transparent',
                                transition:'background 0.12s',
                                cursor:'pointer',
                              }}
                                onMouseEnter={e => { if (!isItemActive) (e.currentTarget as HTMLElement).style.background = '#f1f5f9' }}
                                onMouseLeave={e => { if (!isItemActive) (e.currentTarget as HTMLElement).style.background = 'transparent' }}
                              >
                                {/* Ícone do item */}
                                <div style={{
                                  width:30, height:30, borderRadius:8, flexShrink:0,
                                  background: isItemActive ? `${item.color}20` : '#f8fafc',
                                  display:'flex', alignItems:'center', justifyContent:'center',
                                  border: isItemActive ? `1px solid ${item.color}35` : '1px solid #f1f5f9',
                                }}>
                                  <ItemIcon size={14} color={isItemActive ? item.color : '#94a3b8'} strokeWidth={isItemActive ? 2.2 : 1.8}/>
                                </div>

                                {/* Label */}
                                <span style={{
                                  flex:1, fontSize:13, fontWeight: isItemActive ? 700 : 500,
                                  color: isItemActive ? '#1e293b' : '#475569',
                                  overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap',
                                }}>
                                  {item.label}
                                </span>

                                {/* Badge */}
                                {badgeCount > 0 && (
                                  <span style={{
                                    background: badgeColor, color:'#fff',
                                    borderRadius:10, padding:'1px 6px',
                                    fontSize:10, fontWeight:800, minWidth:18, textAlign:'center',
                                    flexShrink:0,
                                  }}>
                                    {badgeCount > 99 ? '99+' : badgeCount}
                                  </span>
                                )}

                                {/* Seta ativa */}
                                {isItemActive && (
                                  <ChevronRight size={12} color={item.color}/>
                                )}
                              </div>
                            )}
                          </NavLink>
                        )
                      })}
                    </div>
                  </div>
                )}
              </div>
            )
          })}
        </nav>

        {/* Footer — avatar + sair */}
        <div style={{ borderTop:`1px solid rgba(255,255,255,0.08)`, flexShrink:0, padding:'8px 0' }}>
          {/* Avatar */}
          <div style={{ display:'flex', justifyContent:'center', marginBottom:4 }}>
            <div title={userLogin} style={{
              width:32, height:32, borderRadius:9,
              background:'rgba(255,255,255,0.15)',
              display:'flex', alignItems:'center', justifyContent:'center',
              fontSize:12, fontWeight:800, color:'#fff',
              border:'1.5px solid rgba(255,255,255,0.22)',
              cursor:'default',
            }}>
              {initials}
            </div>
          </div>
          {/* Sair */}
          <button onClick={handleSignOut} title="Sair da conta"
            style={{
              display:'flex', alignItems:'center', justifyContent:'center',
              width:'100%', padding:'8px 0',
              background:'none', border:'none', cursor:'pointer',
              color:'rgba(255,255,255,0.32)', transition:'all 0.15s',
            }}
            onMouseEnter={e => { const el = e.currentTarget as HTMLElement; el.style.color='#fca5a5'; el.style.background='rgba(239,68,68,0.15)' }}
            onMouseLeave={e => { const el = e.currentTarget as HTMLElement; el.style.color='rgba(255,255,255,0.32)'; el.style.background='' }}
          >
            <LogOut size={15}/>
          </button>
        </div>
      </aside>

      {/* ═══════════════════════════════════════════════
          ÁREA PRINCIPAL
      ═══════════════════════════════════════════════ */}
      <div style={{ flex:1, display:'flex', flexDirection:'column', minWidth:0, overflow:'hidden' }}>

        {/* ── HEADER ──────────────────────────────────────────────────── */}
        <header style={{
          height:58, flexShrink:0,
          display:'flex', alignItems:'center',
          padding:'0 20px', gap:12,
          background:'#fff',
          borderBottom:'1px solid #e4e8f0',
          boxShadow:'0 1px 6px rgba(0,0,0,0.06)',
          zIndex:30,
        }}>
          {/* Menu mobile */}
          <button onClick={() => setMobileOpen(true)} className="lg:hidden"
            style={{ width:34, height:34, display:'flex', alignItems:'center', justifyContent:'center', borderRadius:8, border:'1px solid #e4e8f0', background:'transparent', color:'#94a3b8', cursor:'pointer', flexShrink:0 }}>
            <Menu size={16}/>
          </button>

          {/* Título da página */}
          <div style={{ display:'flex', alignItems:'center', gap:8, minWidth:0 }}>
            <div style={{
              width:30, height:30, borderRadius:8, flexShrink:0,
              background:`${pageMeta.color}18`,
              display:'flex', alignItems:'center', justifyContent:'center',
            }}>
              <PageIcon size={15} color={pageMeta.color} strokeWidth={2.2}/>
            </div>
            <h1 style={{ fontSize:15, fontWeight:700, color:'#1e293b', whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis', margin:0 }}>
              {pageMeta.label}
            </h1>
          </div>

          {/* Busca global */}
          <div style={{ flex:1, maxWidth:340, position:'relative' }}>
            <button
              onClick={() => { setSearchOpen(true); setTimeout(() => searchRef.current?.focus(), 50) }}
              style={{
                width:'100%', height:34, display:'flex', alignItems:'center', gap:8,
                padding:'0 12px', borderRadius:8, border:'1px solid #e4e8f0',
                background:'#f8fafc', cursor:'text',
                color:'#94a3b8', fontSize:12, transition:'all 0.15s',
              }}
              onMouseEnter={e => { const el = e.currentTarget as HTMLElement; el.style.borderColor=SIDEBAR_BG; el.style.boxShadow=`0 0 0 3px ${SIDEBAR_BG}14` }}
              onMouseLeave={e => { const el = e.currentTarget as HTMLElement; el.style.borderColor='#e4e8f0'; el.style.boxShadow='none' }}
            >
              <Search size={13} color="#94a3b8"/>
              <span style={{ flex:1 }}>Buscar páginas…</span>
              <span style={{ fontSize:10, fontWeight:600, background:'#e4e8f0', borderRadius:4, padding:'1px 5px', color:'#64748b' }}>Ctrl K</span>
            </button>
          </div>

          <div style={{ flex:1 }}/>

          {/* Notificações */}
          <div style={{ position:'relative' }} ref={notifRef}>
            <button onClick={() => setShowNotif(v => !v)}
              style={{
                width:36, height:36, display:'flex', alignItems:'center', justifyContent:'center',
                borderRadius:9, border:'1px solid #e4e8f0',
                background: showNotif ? '#f1f5f9' : 'transparent',
                cursor:'pointer', position:'relative', transition:'all 0.15s', color:'#64748b',
              }}
              onMouseEnter={e => { const el = e.currentTarget as HTMLElement; el.style.background='#f1f5f9'; el.style.borderColor='#cbd5e1' }}
              onMouseLeave={e => { if (!showNotif) { const el = e.currentTarget as HTMLElement; el.style.background='transparent'; el.style.borderColor='#e4e8f0' }}}
            >
              <Bell size={16}/>
              {totalNotif > 0 && (
                <span style={{
                  position:'absolute', top:-4, right:-4,
                  background:'#ef4444', color:'#fff',
                  borderRadius:10, fontSize:8, fontWeight:800,
                  padding:'0 4px', minWidth:14, textAlign:'center', lineHeight:'14px',
                  boxShadow:'0 0 0 2px #fff',
                }}>
                  {totalNotif > 99 ? '99+' : totalNotif}
                </span>
              )}
            </button>

            {/* Dropdown notificações */}
            {showNotif && (
              <div style={{
                position:'absolute', top:'calc(100% + 8px)', right:0,
                width:290, background:'#fff',
                border:'1px solid #e4e8f0', borderRadius:12,
                boxShadow:'0 8px 30px rgba(0,0,0,0.12)', zIndex:200, overflow:'hidden',
              }}>
                <div style={{ padding:'12px 16px', borderBottom:'1px solid #f1f5f9', display:'flex', alignItems:'center', justifyContent:'space-between' }}>
                  <span style={{ fontSize:13, fontWeight:700, color:'#1e293b' }}>Notificações</span>
                  {totalNotif > 0 && <span style={{ background:'#fef2f2', color:'#ef4444', borderRadius:10, padding:'1px 8px', fontSize:10, fontWeight:800 }}>{totalNotif} pendente{totalNotif > 1 ? 's' : ''}</span>}
                </div>
                {totalNotif === 0 ? (
                  <div style={{ padding:'24px 16px', textAlign:'center', color:'#94a3b8', fontSize:12 }}>✅ Nenhuma notificação pendente</div>
                ) : (
                  <div>
                    {solicitacoesPendentes > 0 && (
                      <button onClick={() => { navigate('/solicitacoes'); setShowNotif(false) }}
                        style={{ width:'100%', textAlign:'left', padding:'10px 16px', border:'none', background:'transparent', cursor:'pointer', display:'flex', alignItems:'center', gap:10, borderBottom:'1px solid #f8fafc' }}
                        onMouseEnter={e => (e.currentTarget.style.background='#fef9f9')}
                        onMouseLeave={e => (e.currentTarget.style.background='transparent')}
                      >
                        <div style={{ width:32, height:32, borderRadius:8, background:'#fef2f2', display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 }}>
                          <Inbox size={14} color="#ef4444"/>
                        </div>
                        <div>
                          <div style={{ fontSize:12, fontWeight:700, color:'#1e293b' }}>{solicitacoesPendentes} solicitação(ões)</div>
                          <div style={{ fontSize:11, color:'#94a3b8' }}>Aguardando aprovação</div>
                        </div>
                      </button>
                    )}
                    {fechamentosPendentes > 0 && (
                      <button onClick={() => { navigate('/fechamento-ponto'); setShowNotif(false) }}
                        style={{ width:'100%', textAlign:'left', padding:'10px 16px', border:'none', background:'transparent', cursor:'pointer', display:'flex', alignItems:'center', gap:10, borderBottom:'1px solid #f8fafc' }}
                        onMouseEnter={e => (e.currentTarget.style.background='#fffcf9')}
                        onMouseLeave={e => (e.currentTarget.style.background='transparent')}
                      >
                        <div style={{ width:32, height:32, borderRadius:8, background:'#fff7ed', display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 }}>
                          <Lock size={14} color="#f97316"/>
                        </div>
                        <div>
                          <div style={{ fontSize:12, fontWeight:700, color:'#1e293b' }}>{fechamentosPendentes} lançamento(s)</div>
                          <div style={{ fontSize:11, color:'#94a3b8' }}>Aguardando fechamento</div>
                        </div>
                      </button>
                    )}
                    {mensagensNaoLidas > 0 && (
                      <button onClick={() => { navigate('/mensagens'); setShowNotif(false) }}
                        style={{ width:'100%', textAlign:'left', padding:'10px 16px', border:'none', background:'transparent', cursor:'pointer', display:'flex', alignItems:'center', gap:10 }}
                        onMouseEnter={e => (e.currentTarget.style.background='#fdfbff')}
                        onMouseLeave={e => (e.currentTarget.style.background='transparent')}
                      >
                        <div style={{ width:32, height:32, borderRadius:8, background:'#f5f3ff', display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 }}>
                          <MessageSquare size={14} color="#7c3aed"/>
                        </div>
                        <div>
                          <div style={{ fontSize:12, fontWeight:700, color:'#1e293b' }}>{mensagensNaoLidas} mensagem(ns)</div>
                          <div style={{ fontSize:11, color:'#94a3b8' }}>Do portal da obra</div>
                        </div>
                      </button>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Avatar + nome */}
          <button style={{
            display:'flex', alignItems:'center', gap:8, padding:'5px 10px',
            borderRadius:9, border:'1px solid #e4e8f0',
            background:'transparent', cursor:'pointer', transition:'all 0.15s',
          }}
            onMouseEnter={e => { const el = e.currentTarget as HTMLElement; el.style.background='#f1f5f9'; el.style.borderColor='#cbd5e1' }}
            onMouseLeave={e => { const el = e.currentTarget as HTMLElement; el.style.background='transparent'; el.style.borderColor='#e4e8f0' }}
          >
            <div style={{
              width:28, height:28, borderRadius:7, flexShrink:0,
              background:`linear-gradient(135deg, ${SIDEBAR_BG} 0%, #0a3347 100%)`,
              display:'flex', alignItems:'center', justifyContent:'center',
              fontSize:11, fontWeight:800, color:'#fff',
            }}>
              {initials}
            </div>
            <div style={{ textAlign:'left' }} className="hidden lg:block">
              <div style={{ fontSize:12, fontWeight:700, color:'#1e293b', whiteSpace:'nowrap', maxWidth:110, overflow:'hidden', textOverflow:'ellipsis' }}>{userLogin}</div>
              <div style={{ fontSize:10, color:'#94a3b8', whiteSpace:'nowrap' }}>{roleMeta.label}</div>
            </div>
            <ChevronDown size={12} color="#94a3b8" className="hidden lg:block"/>
          </button>
        </header>

        {/* ── CONTENT ─────────────────────────────────────────────────── */}
        <main style={{ flex:1, overflowY:'auto', padding:0, background:'#f0f2f5' }}>
          <ErrorBoundary>
            {children}
          </ErrorBoundary>
        </main>
      </div>

      {/* ══════════════════════════════════════════
          MODAL BUSCA GLOBAL
      ══════════════════════════════════════════ */}
      {searchOpen && (
        <div style={{ position:'fixed', inset:0, zIndex:300, display:'flex', alignItems:'flex-start', justifyContent:'center', paddingTop:80 }}
          onClick={e => { if (e.target === e.currentTarget) { setSearchOpen(false); setSearchQ('') } }}
        >
          <div style={{ position:'absolute', inset:0, background:'rgba(15,23,42,0.45)', backdropFilter:'blur(4px)' }}
            onClick={() => { setSearchOpen(false); setSearchQ('') }}
          />
          <div style={{
            position:'relative', width:'100%', maxWidth:520,
            background:'#fff', borderRadius:16, overflow:'hidden',
            boxShadow:'0 25px 60px rgba(0,0,0,0.22)', border:'1px solid #e4e8f0',
          }}>
            <div style={{ display:'flex', alignItems:'center', gap:10, padding:'14px 18px', borderBottom:'1px solid #f1f5f9' }}>
              <Search size={16} color={SIDEBAR_BG}/>
              <input ref={searchRef} value={searchQ} onChange={e => setSearchQ(e.target.value)}
                placeholder="Buscar página…"
                style={{ flex:1, border:'none', outline:'none', fontSize:15, fontWeight:500, color:'#1e293b', background:'transparent' }}
              />
              <button onClick={() => { setSearchOpen(false); setSearchQ('') }}
                style={{ background:'#f1f5f9', border:'none', borderRadius:6, padding:'3px 8px', fontSize:11, fontWeight:600, color:'#64748b', cursor:'pointer' }}>
                ESC
              </button>
            </div>
            <div style={{ maxHeight:360, overflowY:'auto' }}>
              {searchResults.length === 0 ? (
                <div style={{ padding:'24px 18px', textAlign:'center', color:'#94a3b8', fontSize:13 }}>Nenhuma página encontrada</div>
              ) : searchResults.map(r => (
                <button key={r.to}
                  onClick={() => { navigate(r.to); setSearchOpen(false); setSearchQ('') }}
                  style={{ width:'100%', textAlign:'left', padding:'11px 18px', border:'none', background:'transparent', cursor:'pointer', display:'flex', alignItems:'center', gap:12, borderBottom:'1px solid #f8fafc', transition:'background 0.1s' }}
                  onMouseEnter={e => (e.currentTarget.style.background = `${SIDEBAR_BG}0d`)}
                  onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                >
                  <div style={{ width:32, height:32, borderRadius:9, background:`${SIDEBAR_BG}12`, display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 }}>
                    <r.icon size={15} color={SIDEBAR_BG} strokeWidth={2}/>
                  </div>
                  <span style={{ fontSize:13, fontWeight:600, color:'#1e293b' }}>{r.label}</span>
                  <span style={{ marginLeft:'auto', fontSize:11, color:'#94a3b8' }}>↵</span>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      <style>{`
        .sidebar-scroll::-webkit-scrollbar { width:3px; }
        .sidebar-scroll::-webkit-scrollbar-track { background:transparent; }
        .sidebar-scroll::-webkit-scrollbar-thumb { background:rgba(255,255,255,0.15); border-radius:4px; }
        .sidebar-scroll::-webkit-scrollbar-thumb:hover { background:rgba(255,255,255,0.28); }
      `}</style>
    </div>
  )
}
