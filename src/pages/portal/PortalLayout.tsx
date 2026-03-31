import React, { useState, useEffect } from 'react'
import { NavLink, useNavigate, useLocation } from 'react-router-dom'
import {
  ClipboardList, AlertTriangle, Home, LogOut,
  HardHat, ShieldCheck, FileImage,
  BookOpen, MessageSquare, FolderOpen,
  WifiOff, UserPlus, Building2, ChevronRight, Clock, Menu, X,
} from 'lucide-react'
import { clearPortalSession, getPortalSession } from '@/hooks/usePortalAuth'

interface PortalLayoutProps { children: React.ReactNode }

const ROUTE_LABELS: Record<string, string> = {
  '/portal/home':        'Início',
  '/portal/ponto':       'Ponto',
  '/portal/ocorrencias': 'Ocorrências',
  '/portal/solicitacoes':'Cadastro',
  '/portal/producao':    'Fichas de Produção',
  '/portal/epis':        'EPIs',
  '/portal/documentos':  'Documentos',
  '/portal/playbook':    'Playbook',
  '/portal/mensagens':   'Mensagens',
  '/portal/projetos':    'Projetos',
}

// ── Menu de navegação — SEM Lançamentos ──────────────────────────────────────
const navItems = [
  { to: '/portal/home',         icon: Home,          label: 'Início',          color: '#818cf8', bg: '#eef2ff' },
  { to: '/portal/ponto',        icon: ClipboardList, label: 'Ponto',           color: '#38bdf8', bg: '#e0f7ff' },
  { to: '/portal/ocorrencias',  icon: AlertTriangle, label: 'Ocorrências',     color: '#fb923c', bg: '#fff4ed' },
  { to: '/portal/producao',     icon: HardHat,       label: 'Fichas',          color: '#fbbf24', bg: '#fffbeb' },
  { to: '/portal/solicitacoes', icon: UserPlus,      label: 'Cadastro',        color: '#a78bfa', bg: '#f5f3ff' },
  { to: '/portal/epis',         icon: ShieldCheck,   label: 'EPIs',            color: '#f87171', bg: '#fef2f2' },
  { to: '/portal/documentos',   icon: FileImage,     label: 'Docs',            color: '#60a5fa', bg: '#eff6ff' },
  { to: '/portal/mensagens',    icon: MessageSquare, label: 'Mensagens',       color: '#a78bfa', bg: '#f5f3ff' },
  { to: '/portal/playbook',     icon: BookOpen,      label: 'Playbook',        color: '#34d399', bg: '#f0fdf4' },
  { to: '/portal/projetos',     icon: FolderOpen,    label: 'Projetos',        color: '#94a3b8', bg: '#f8fafc' },
]

export default function PortalLayout({ children }: PortalLayoutProps) {
  const nav      = useNavigate()
  const location = useLocation()
  const user     = getPortalSession()
  const [online,      setOnline]      = useState(navigator.onLine)
  const [now,         setNow]         = useState(new Date())
  const [sidebarOpen, setSidebarOpen] = useState(false)

  useEffect(() => {
    const on  = () => setOnline(true)
    const off = () => setOnline(false)
    window.addEventListener('online',  on)
    window.addEventListener('offline', off)
    const ti = setInterval(() => setNow(new Date()), 30_000)
    return () => {
      window.removeEventListener('online', on)
      window.removeEventListener('offline', off)
      clearInterval(ti)
    }
  }, [])

  // Fecha sidebar ao navegar (mobile)
  useEffect(() => { setSidebarOpen(false) }, [location.pathname])

  function sair() { clearPortalSession(); nav('/portal') }

  const paginaAtual = ROUTE_LABELS[location.pathname] ?? 'Portal'
  const itemAtivo   = navItems.find(i => location.pathname.startsWith(i.to) && (i.to !== '/portal/home' || location.pathname === '/portal/home'))
  const corAtiva    = itemAtivo?.color ?? '#818cf8'
  const hora = now.toLocaleTimeString('pt-BR', { hour:'2-digit', minute:'2-digit' })
  const data = now.toLocaleDateString('pt-BR', { weekday:'short', day:'2-digit', month:'short' })

  return (
    <div style={{ minHeight:'100dvh', background:'#f0f2f5', fontFamily:"'Inter','Segoe UI',sans-serif", display:'flex', flexDirection:'column' }}>
      <style>{`
        /* ─── TOP BAR ─── */
        .portal-topbar {
          background:linear-gradient(135deg,#1565C0 0%,#0D47A1 60%,#0a3880 100%);
          padding:0 14px; height:56px;
          display:flex; align-items:center; justify-content:space-between;
          position:sticky; top:0; z-index:200;
          box-shadow:0 2px 16px rgba(13,71,161,0.30);
          gap:10;
        }
        /* ─── LAYOUT BODY ─── */
        .portal-body { display:flex; flex:1; overflow:hidden; height:calc(100dvh - 56px); }

        /* ─── SIDEBAR desktop (sempre visível) ─── */
        .portal-sidebar {
          display:none;
          width:210px; flex-shrink:0;
          background:#fff;
          border-right:1.5px solid #e8edf3;
          overflow-y:auto;
          height:100%;
        }
        /* ─── SIDEBAR MOBILE (drawer) ─── */
        .portal-sidebar-drawer {
          position:fixed;
          top:56px; left:0;
          width:230px;
          height:calc(100dvh - 56px);
          background:#fff;
          border-right:1.5px solid #e8edf3;
          z-index:190;
          overflow-y:auto;
          box-shadow:4px 0 30px rgba(0,0,0,0.18);
          transform:translateX(-100%);
          transition:transform 0.22s cubic-bezier(.4,0,.2,1);
        }
        .portal-sidebar-drawer.open { transform:translateX(0); }
        .portal-sidebar-overlay {
          display:none;
          position:fixed; inset:56px 0 0 0;
          background:rgba(0,0,0,0.40);
          z-index:189;
        }
        .portal-sidebar-overlay.open { display:block; }

        /* ─── MAIN ─── */
        /* Sem padding-bottom extra — não há mais bottom nav */
        .portal-main { flex:1; overflow-y:auto; min-width:0; padding-bottom:24px; }

        /* ─── HAMBURGER — só no mobile ─── */
        .portal-hamburger { display:flex; }

        /* ─── BREAKPOINTS ─── */
        @media (min-width:640px) {
          .portal-sidebar { display:flex; flex-direction:column; }
          .portal-hamburger { display:none; }
          .portal-sidebar-drawer { display:none !important; }
          .portal-sidebar-overlay { display:none !important; }
        }
        @media (min-width:1024px) {
          .portal-sidebar { width:220px; }
        }

        @keyframes pulse-green {
          0%,100% { box-shadow:0 0 0 2px rgba(74,222,128,0.35); }
          50%      { box-shadow:0 0 0 5px rgba(74,222,128,0.10); }
        }
      `}</style>

      {/* ══ TOP BAR ═══════════════════════════════════════════════════ */}
      <div className="portal-topbar">
        {/* Hamburger (mobile) */}
        <button className="portal-hamburger" onClick={() => setSidebarOpen(v => !v)}
          style={{ background:'rgba(255,255,255,0.12)', border:'1px solid rgba(255,255,255,0.18)', borderRadius:8, padding:'6px 9px', cursor:'pointer', color:'#fff', alignItems:'center', gap:4 }}>
          {sidebarOpen ? <X size={16}/> : <Menu size={16}/>}
        </button>

        {/* Logo + obra */}
        <div style={{ display:'flex', alignItems:'center', gap:10, minWidth:0, flex:1 }}>
          <div style={{ width:34, height:34, borderRadius:10, flexShrink:0, background:'rgba(255,255,255,0.18)', display:'flex', alignItems:'center', justifyContent:'center', border:'1.5px solid rgba(255,255,255,0.28)' }}>
            <HardHat size={16} color="#fff" strokeWidth={2.2}/>
          </div>
          <div style={{ minWidth:0 }}>
            <div style={{ color:'#fff', fontWeight:800, fontSize:13, lineHeight:1.2, letterSpacing:'-0.01em', whiteSpace:'nowrap' }}>Portal da Obra</div>
            <div style={{ display:'flex', alignItems:'center', gap:5, marginTop:2 }}>
              <div style={{ width:6, height:6, borderRadius:'50%', background: online ? '#4ade80' : '#f87171', boxShadow: online ? '0 0 0 2px rgba(74,222,128,0.35)' : '0 0 0 2px rgba(248,113,113,0.35)', flexShrink:0, animation: online ? 'pulse-green 2s infinite' : 'none' }}/>
              <div style={{ color:'rgba(255,255,255,0.60)', fontSize:10, fontWeight:600, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap', maxWidth:180 }}>
                {user?.login ?? user?.nome ?? 'Encarregado'}
              </div>
            </div>
          </div>
        </div>

        {/* Direita */}
        <div style={{ display:'flex', alignItems:'center', gap:6, flexShrink:0 }}>
          {!online && (
            <div style={{ display:'flex', alignItems:'center', gap:4, background:'rgba(239,68,68,0.22)', border:'1px solid rgba(239,68,68,0.40)', borderRadius:7, padding:'3px 7px', fontSize:9.5, fontWeight:700, color:'#fca5a5' }}>
              <WifiOff size={10}/> Offline
            </div>
          )}
          <div style={{ display:'flex', alignItems:'center', gap:4, background:'rgba(255,255,255,0.12)', border:'1px solid rgba(255,255,255,0.18)', borderRadius:8, padding:'4px 9px' }}>
            <Clock size={10} color="rgba(255,255,255,0.70)"/>
            <span style={{ fontSize:11, fontWeight:700, color:'#fff', whiteSpace:'nowrap' }}>{hora}</span>
          </div>
          <div style={{ display:'flex', alignItems:'center', gap:4, background:`${corAtiva}25`, border:`1px solid ${corAtiva}45`, borderRadius:8, padding:'4px 9px', fontSize:10.5, fontWeight:700, color:'#fff', whiteSpace:'nowrap' }}>
            <div style={{ width:5, height:5, borderRadius:'50%', background:corAtiva, flexShrink:0 }}/>
            {paginaAtual}
          </div>
          <button onClick={sair}
            style={{ background:'rgba(239,68,68,0.14)', border:'1px solid rgba(239,68,68,0.28)', borderRadius:8, padding:'6px 9px', cursor:'pointer', color:'#fca5a5', display:'flex', alignItems:'center', gap:3, fontSize:10.5, fontWeight:700 }}
          >
            <LogOut size={12}/> Sair
          </button>
        </div>
      </div>

      {/* ── Colaborador strip ────────────────────────────────────────── */}
      {user?.nome && (
        <div style={{ background:'#fff', padding:'6px 14px', display:'flex', alignItems:'center', gap:8, borderBottom:'1px solid #e8edf3', boxShadow:'0 1px 4px rgba(0,0,0,0.04)', zIndex:195, position:'sticky', top:56 }}>
          <div style={{ width:26, height:26, borderRadius:8, flexShrink:0, background:'linear-gradient(135deg,#1565C0 0%,#0D47A1 100%)', display:'flex', alignItems:'center', justifyContent:'center', fontSize:10, fontWeight:800, color:'#fff' }}>
            {user.nome.charAt(0).toUpperCase()}
          </div>
          <div style={{ fontSize:12, fontWeight:700, color:'#1e293b', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{user.nome}</div>
          <span style={{ marginLeft:'auto', fontSize:10, color:'#94a3b8', fontWeight:500, whiteSpace:'nowrap' }}>{data}</span>
        </div>
      )}

      {/* ══ BODY ═══════════════════════════════════════════════════════ */}
      <div className="portal-body">

        {/* SIDEBAR — desktop (sempre visível) */}
        <aside className="portal-sidebar">
          <SidebarContent navItems={navItems} location={location} onClick={() => {}} />
        </aside>

        {/* SIDEBAR DRAWER — mobile */}
        <div className={`portal-sidebar-overlay${sidebarOpen ? ' open' : ''}`} onClick={() => setSidebarOpen(false)} />
        <aside className={`portal-sidebar-drawer${sidebarOpen ? ' open' : ''}`}>
          <SidebarContent navItems={navItems} location={location} onClick={() => setSidebarOpen(false)} />
        </aside>

        {/* MAIN CONTENT */}
        <main className="portal-main">
          {children}
        </main>
      </div>
      {/* ── Sem bottom nav — menu está na lateral ── */}
    </div>
  )
}

// ── Componente do conteúdo da sidebar ────────────────────────────────────────
function SidebarContent({ navItems, location, onClick }: { navItems: any[], location: any, onClick: () => void }) {
  return (
    <div style={{ paddingTop:8, paddingBottom:24 }}>
      {navItems.map((item: any) => {
        const isActive = location.pathname.startsWith(item.to) && (item.to !== '/portal/home' || location.pathname === '/portal/home')
        return (
          <NavLink key={item.to} to={item.to} end={item.to === '/portal/home'}
            onClick={onClick}
            style={({ isActive: a }) => ({
              display:'flex', alignItems:'center', gap:10,
              padding:'10px 16px',
              textDecoration:'none',
              color: a ? item.color : '#64748b',
              fontWeight: a ? 700 : 600,
              fontSize:13,
              background: a ? `${item.bg}` : 'transparent',
              borderLeft: a ? `3px solid ${item.color}` : '3px solid transparent',
              transition:'all 0.15s',
            })}
          >
            {({ isActive: a }) => (<>
              <div style={{ width:32, height:32, borderRadius:9, background: a ? item.bg : '#f1f5f9', display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0, transition:'all 0.15s' }}>
                <item.icon size={16} strokeWidth={a ? 2.5 : 1.8} color={a ? item.color : '#94a3b8'} />
              </div>
              <span style={{ overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{item.label}</span>
            </>)}
          </NavLink>
        )
      })}
    </div>
  )
}
