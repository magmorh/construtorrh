import React from 'react'
import { cn, STATUS_COLORS, STATUS_LABELS } from '@/lib/utils'

interface BadgeStatusProps {
  status: string
  className?: string
}

export function BadgeStatus({ status, className }: BadgeStatusProps) {
  const color = STATUS_COLORS[status as keyof typeof STATUS_COLORS] ?? 'bg-gray-100 text-gray-600'
  const label = STATUS_LABELS[status] ?? status
  return (
    <span className={cn('inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium', color, className)}>
      {label}
    </span>
  )
}

// ─── PageWrapper — container raiz padronizado ────────────────────────────────
interface PageWrapperProps {
  children: React.ReactNode
  className?: string
  style?: React.CSSProperties
}

export function PageWrapper({ children, className, style }: PageWrapperProps) {
  return (
    <div className={cn('page-root', className)} style={style}>
      {children}
    </div>
  )
}

// ─── PageHeader — cabeçalho de página padronizado ─────────────────────────────
interface PageHeaderProps {
  title: string
  subtitle?: string
  action?: React.ReactNode
  icon?: React.ReactNode
}

export function PageHeader({ title, subtitle, action, icon }: PageHeaderProps) {
  return (
    <div className="page-header">
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
        {icon && (
          <div style={{
            width: 40, height: 40, borderRadius: 10,
            background: 'var(--primary)', display: 'flex',
            alignItems: 'center', justifyContent: 'center',
            color: '#fff', flexShrink: 0, marginTop: 2,
          }}>
            {icon}
          </div>
        )}
        <div>
          <h1 className="page-title">{title}</h1>
          {subtitle && <p className="page-subtitle">{subtitle}</p>}
        </div>
      </div>
      {action && <div style={{ flexShrink: 0 }}>{action}</div>}
    </div>
  )
}

interface StatCardProps {
  title: string
  value: string | number
  subtitle?: string
  icon: React.ReactNode
  color?: string
}

export function StatCard({ title, value, subtitle, icon, color = 'bg-primary' }: StatCardProps) {
  return (
    <div className="bg-card rounded-lg border border-border p-5 flex items-start gap-4">
      <div className={cn('w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0', color)}>
        {icon}
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">{title}</p>
        <p className="text-2xl font-bold text-foreground mt-0.5">{value}</p>
        {subtitle && <p className="text-xs text-muted-foreground mt-0.5">{subtitle}</p>}
      </div>
    </div>
  )
}

interface EmptyStateProps {
  icon: React.ReactNode
  title: string
  description?: string
  action?: React.ReactNode
}

export function EmptyState({ icon, title, description, action }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-center">
      <div className="w-14 h-14 bg-muted rounded-full flex items-center justify-center mb-4 text-muted-foreground">
        {icon}
      </div>
      <p className="text-sm font-medium text-foreground">{title}</p>
      {description && <p className="text-xs text-muted-foreground mt-1 max-w-xs">{description}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  )
}

export function LoadingSkeleton({ rows = 5 }: { rows?: number }) {
  return (
    <div className="space-y-3">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="h-12 bg-muted rounded animate-pulse" />
      ))}
    </div>
  )
}

// ─── SummaryCard — card padrão de resumo/total (design unificado) ─────────────
export interface SummaryCardProps {
  sigla: string
  label: string
  value: string
  sub?: string
  color: string
  bg: string
  onClick?: () => void
}

export function SummaryCard({ sigla, label, value, sub, color, bg, onClick }: SummaryCardProps) {
  return (
    <div
      onClick={onClick}
      style={{
        background: 'var(--card)',
        border: '1px solid var(--border)',
        borderRadius: 12,
        padding: '14px 16px',
        display: 'flex',
        alignItems: 'flex-start',
        gap: 12,
        cursor: onClick ? 'pointer' : 'default',
        transition: 'box-shadow 120ms',
      }}
      onMouseEnter={e => { if (onClick) (e.currentTarget as HTMLElement).style.boxShadow = '0 2px 12px rgba(0,0,0,0.10)' }}
      onMouseLeave={e => { if (onClick) (e.currentTarget as HTMLElement).style.boxShadow = '' }}
    >
      <div style={{
        width: 36, height: 36, minWidth: 36, borderRadius: 8,
        background: bg, display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontSize: 11, fontWeight: 800, color: '#fff', letterSpacing: '0.02em',
      }}>
        {sigla}
      </div>
      <div style={{ minWidth: 0 }}>
        <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--muted-foreground)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 3 }}>
          {label}
        </div>
        <div style={{ fontSize: 18, fontWeight: 800, color, lineHeight: 1.1 }}>
          {value}
        </div>
        {sub && (
          <div style={{ fontSize: 10, color: 'var(--muted-foreground)', marginTop: 3 }}>
            {sub}
          </div>
        )}
      </div>
    </div>
  )
}
