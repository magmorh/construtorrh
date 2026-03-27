import React, { useState, useEffect } from 'react'
import { NavLink, useNavigate, useLocation } from 'react-router-dom'
import {
  ClipboardList, AlertTriangle, Home, LogOut,
  HardHat, ShieldCheck, FileImage,
  BookOpen, MessageSquare, FolderOpen, CalendarDays,
  WifiOff, UserPlus, Building2, ChevronRight,
} from 'lucide-react'
import { clearPortalSession, getPortalSession } from '@/hooks/usePortalAuth'

interface PortalLayoutProps { children: React.ReactNode }

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

// Todos os itens de navegação em uma única linha com scroll
const navItems = [
  { to: '/portal/home',         icon: Home,          label: 'Início',    color: '#6366f1', bg: '#ede9fe' },
  { to: '/portal/ponto',        icon: ClipboardList, label: 'Ponto',     color: '#0ea5e9', bg: '#e0f2fe' },
  { to: '/portal/ocorrencias',  icon: AlertTriangle, label: 'Ocorrências', color: '#f97316', bg: '#fff7ed' },
  { to: '/portal/producao',     icon: HardHat,       label: 'Produção',  color: '#f59e0b', bg: '#fffbeb' },
  { to: '/portal/lancamentos',  icon: CalendarDays,  label: 'Lançamentos',color: '#14b8a6', bg: '#f0fdfa' },
  { to: '/portal/solicitacoes', icon: UserPlus,      label: 'Cadastro',  color: '#8b5cf6', bg: '#f5f3ff' },
  { to: '/portal/epis',         icon: ShieldCheck,   label: 'EPIs',      color: '#ef4444', bg: '#fef2f2' },
  { to: '/portal/documentos',   icon: FileImage,     label: 'Docs',      color: '#0369a1', bg: '#eff6ff' },
  { to: '/portal/mensagens',    icon: MessageSquare, label: 'Mensagens', color: '#7c3aed', bg: '#f5f3ff' },
  { to: '/portal/playbook',     icon: BookOpen,      label: 'Playbook',  color: '#10b981', bg: '#f0fdf4' },
  { to: '/portal/projetos',     icon: FolderOpen,    label: 'Projetos',  color: '#64748b', bg: '#f8fafc' },
]

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
  // Achar o item ativo para pegar a cor
  const itemAtivo = navItems.find(i => location.pathname.startsWith(i.to) && (i.to !== '/portal/home' || location.pathname === '/portal/home'))
  const corAtiva  = itemAtivo?.color ?? '#6366f1'

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

      {/* ══ TOP BAR ══════════════════════════════════════════════ */}
      <div style={{
        background: 'linear-gradient(135deg, #0c1628 0%, #1a2f50 60%, #0f3d6e 100%)',
        padding: '0 14px',
        height: 58,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        position: 'sticky',
        top: 0,
        zIndex: 50,
        boxShadow: '0 2px 20px rgba(0,0,0,0.35)',
        gap: 10,
      }}>

        {/* Esquerda: logo + info */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
          {/* Logo */}
          <div style={{
            width: 36, height: 36, borderRadius: 11,
            background: 'linear-gradient(135deg, #3b82f6 0%, #1d4ed8 100%)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            boxShadow: '0 3px 10px rgba(59,130,246,0.45)',
            flexShrink: 0,
          }}>
            <HardHat size={17} color="#fff" strokeWidth={2.2} />
          </div>

          {/* Textos */}
          <div style={{ minWidth: 0 }}>
            <div style={{
              color: '#fff', fontWeight: 800, fontSize: 13,
              lineHeight: 1.15, letterSpacing: '-0.01em',
              whiteSpace: 'nowrap',
            }}>
              Portal da Obra
            </div>

            {/* Obra + status online */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginTop: 2 }}>
              <div style={{
                width: 6, height: 6, borderRadius: '50%',
                background: online ? '#4ade80' : '#f87171',
                boxShadow: online
                  ? '0 0 0 2px rgba(74,222,128,0.3)'
                  : '0 0 0 2px rgba(248,113,113,0.3)',
                flexShrink: 0,
                animation: online ? 'pulse-green 2s infinite' : 'none',
              }} />
              {user?.obra_nome ? (
                <div style={{
                  color: 'rgba(255,255,255,0.65)', fontSize: 10.5,
                  fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap', maxWidth: 140,
                }}>
                  {user.obra_nome}
                </div>
              ) : (
                <div style={{ color: 'rgba(255,255,255,0.5)', fontSize: 10 }}>
                  {user?.nome ?? user?.login ?? 'Encarregado'}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Direita: badges + sair */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>

          {/* Offline badge */}
          {!online && (
            <div style={{
              display: 'flex', alignItems: 'center', gap: 4,
              background: 'rgba(239,68,68,0.2)', border: '1px solid rgba(239,68,68,0.4)',
              borderRadius: 7, padding: '3px 7px',
              fontSize: 9.5, fontWeight: 700, color: '#fca5a5',
            }}>
              <WifiOff size={10} /> Offline
            </div>
          )}

          {/* Página atual */}
          <div style={{
            display: 'flex', alignItems: 'center', gap: 4,
            background: `${corAtiva}22`,
            border: `1px solid ${corAtiva}44`,
            borderRadius: 8, padding: '4px 9px',
            fontSize: 10.5, fontWeight: 700,
            color: '#fff',
            whiteSpace: 'nowrap',
          }}>
            <div style={{
              width: 5, height: 5, borderRadius: '50%',
              background: corAtiva,
              flexShrink: 0,
            }} />
            {paginaAtual}
          </div>

          {/* Botão Sair */}
          <button onClick={sair} style={{
            background: 'rgba(239,68,68,0.12)',
            border: '1px solid rgba(239,68,68,0.25)',
            borderRadius: 8, padding: '6px 9px',
            cursor: 'pointer', color: '#fca5a5',
            display: 'flex', alignItems: 'center', gap: 3,
            fontSize: 10.5, fontWeight: 700, transition: 'all 0.15s',
          }}
            onMouseEnter={e => (e.currentTarget.style.background = 'rgba(239,68,68,0.28)')}
            onMouseLeave={e => (e.currentTarget.style.background = 'rgba(239,68,68,0.12)')}
          >
            <LogOut size={12} /> Sair
          </button>
        </div>
      </div>

      {/* ── Colaborador info bar (quando logado) ────────────── */}
      {user?.nome && user?.obra_nome && (
        <div style={{
          background: 'linear-gradient(90deg, #1e3a5f 0%, #0f4c75 100%)',
          padding: '5px 14px',
          display: 'flex', alignItems: 'center', gap: 6,
          borderBottom: '1px solid rgba(255,255,255,0.07)',
        }}>
          <div style={{
            width: 22, height: 22, borderRadius: 7,
            background: `linear-gradient(135deg, ${corAtiva} 0%, ${corAtiva}99 100%)`,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 9, fontWeight: 800, color: '#fff',
            flexShrink: 0,
          }}>
            {user.nome.charAt(0).toUpperCase()}
          </div>
          <div style={{ color: 'rgba(255,255,255,0.75)', fontSize: 10.5, fontWeight: 600 }}>
            {user.nome}
          </div>
          <ChevronRight size={10} color="rgba(255,255,255,0.3)" />
          <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            <Building2 size={10} color="rgba(255,255,255,0.45)" />
            <div style={{
              color: 'rgba(255,255,255,0.55)', fontSize: 10.5,
              overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
              maxWidth: 200,
            }}>
              {user.obra_nome}
            </div>
          </div>
        </div>
      )}

      {/* ══ CONTENT ═══════════════════════════════════════════════ */}
      <div style={{ flex: 1, overflowY: 'auto', paddingBottom: 76 }}>
        {children}
      </div>

      {/* ══ BOTTOM NAV — única linha com scroll ════════════════════ */}
      <nav style={{
        position: 'fixed',
        bottom: 0,
        left: '50%',
        transform: 'translateX(-50%)',
        width: '100%',
        maxWidth: 480,
        background: '#ffffff',
        borderTop: '1.5px solid #e8edf3',
        boxShadow: '0 -4px 24px rgba(0,0,0,0.10)',
        zIndex: 50,
        paddingBottom: 'env(safe-area-inset-bottom)',
        overflowX: 'auto',
      }}>
        <div style={{
          display: 'flex',
          minWidth: 'max-content',
          padding: '0 2px',
        }}>
          {navItems.map(item => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.to === '/portal/home'}
              style={({ isActive }) => ({
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                padding: '8px 0 6px',
                minWidth: 60,
                textDecoration: 'none',
                color: isActive ? item.color : '#94a3b8',
                borderTop: isActive ? `2.5px solid ${item.color}` : '2.5px solid transparent',
                background: isActive ? `${item.color}0d` : 'transparent',
                transition: 'all 0.15s',
                position: 'relative',
                flexShrink: 0,
              })}
            >
              {({ isActive }) => (
                <>
                  <div style={{
                    width: 34, height: 34, borderRadius: 10,
                    background: isActive ? item.bg : 'transparent',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    transition: 'all 0.15s',
                    marginBottom: 2,
                  }}>
                    <item.icon
                      size={isActive ? 19 : 17}
                      strokeWidth={isActive ? 2.5 : 1.8}
                      color={isActive ? item.color : '#94a3b8'}
                    />
                  </div>
                  <span style={{
                    fontSize: 8.5,
                    fontWeight: isActive ? 800 : 500,
                    lineHeight: 1,
                    whiteSpace: 'nowrap',
                    color: isActive ? item.color : '#94a3b8',
                    letterSpacing: isActive ? '0.01em' : '0',
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
        nav::-webkit-scrollbar { display: none; }
        @keyframes pulse-green {
          0%, 100% { box-shadow: 0 0 0 2px rgba(74,222,128,0.3); }
          50%       { box-shadow: 0 0 0 4px rgba(74,222,128,0.15); }
        }
      `}</style>
    </div>
  )
}
