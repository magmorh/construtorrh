import React, { useState, useRef, useEffect } from 'react'
import { ChevronDown, Search, X } from 'lucide-react'

interface Option {
  value: string
  label: string
  sublabel?: string
}

interface SearchableSelectProps {
  options: Option[]
  value: string
  onChange: (value: string) => void
  placeholder?: string
  emptyLabel?: string
  disabled?: boolean
  style?: React.CSSProperties
}

export function SearchableSelect({
  options, value, onChange, placeholder = 'Selecione…',
  emptyLabel, disabled, style,
}: SearchableSelectProps) {
  const [open,  setOpen]  = useState(false)
  const [query, setQuery] = useState('')
  const containerRef = useRef<HTMLDivElement>(null)
  const inputRef     = useRef<HTMLInputElement>(null)

  const norm = (s: string) =>
    s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')

  const filtered = options.filter(o =>
    !query.trim() || norm(o.label).includes(norm(query)) || norm(o.sublabel ?? '').includes(norm(query))
  )

  const selected = options.find(o => o.value === value)

  useEffect(() => {
    if (!open) { setQuery('') }
    if (open) setTimeout(() => inputRef.current?.focus(), 30)
  }, [open])

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  return (
    <div ref={containerRef} style={{ position: 'relative', ...style }}>
      {/* Trigger */}
      <button
        type="button"
        disabled={disabled}
        onClick={() => setOpen(v => !v)}
        style={{
          width: '100%', height: 40, display: 'flex', alignItems: 'center',
          padding: '0 10px', borderRadius: 6,
          border: '1px solid hsl(var(--input))',
          background: disabled ? '#f9fafb' : '#fff',
          cursor: disabled ? 'not-allowed' : 'pointer',
          gap: 6, textAlign: 'left',
          fontSize: 14, color: selected ? '#0f172a' : '#94a3b8',
        }}
      >
        <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {selected
            ? <>{selected.label}{selected.sublabel && <span style={{ color: '#94a3b8', marginLeft: 6, fontSize: 12 }}>{selected.sublabel}</span>}</>
            : placeholder
          }
        </span>
        {selected && !disabled && (
          <span
            onClick={e => { e.stopPropagation(); onChange('') }}
            style={{ color: '#94a3b8', cursor: 'pointer', display: 'flex', alignItems: 'center' }}
          >
            <X size={13}/>
          </span>
        )}
        <ChevronDown size={14} color="#94a3b8" style={{ flexShrink: 0 }}/>
      </button>

      {/* Dropdown */}
      {open && (
        <div style={{
          position: 'absolute', top: 'calc(100% + 4px)', left: 0, right: 0,
          background: '#fff', border: '1px solid #e2e8f0', borderRadius: 8,
          boxShadow: '0 8px 24px rgba(0,0,0,0.13)', zIndex: 500,
          maxHeight: 280, display: 'flex', flexDirection: 'column', overflow: 'hidden',
        }}>
          {/* Search */}
          <div style={{ padding: '8px 8px 4px', borderBottom: '1px solid #f1f5f9', display: 'flex', alignItems: 'center', gap: 6 }}>
            <Search size={13} color="#94a3b8" style={{ flexShrink: 0 }}/>
            <input
              ref={inputRef}
              value={query}
              onChange={e => setQuery(e.target.value)}
              placeholder="Pesquisar…"
              style={{ border: 'none', outline: 'none', flex: 1, fontSize: 13, color: '#1e293b', background: 'transparent' }}
            />
            {query && (
              <button onClick={() => setQuery('')} style={{ border: 'none', background: 'none', cursor: 'pointer', color: '#94a3b8', padding: 0, display: 'flex' }}>
                <X size={12}/>
              </button>
            )}
          </div>

          {/* Options */}
          <div style={{ overflowY: 'auto', flex: 1 }}>
            {emptyLabel && (
              <div
                onClick={() => { onChange(''); setOpen(false) }}
                style={{
                  padding: '9px 12px', cursor: 'pointer', fontSize: 13,
                  color: '#64748b', fontStyle: 'italic',
                  background: !value ? '#f1f5f9' : 'transparent',
                }}
                onMouseEnter={e => (e.currentTarget.style.background = '#f8fafc')}
                onMouseLeave={e => (e.currentTarget.style.background = !value ? '#f1f5f9' : 'transparent')}
              >
                {emptyLabel}
              </div>
            )}
            {filtered.length === 0 && (
              <div style={{ padding: '14px 12px', textAlign: 'center', color: '#94a3b8', fontSize: 13 }}>
                Nenhum resultado
              </div>
            )}
            {filtered.map(o => (
              <div
                key={o.value}
                onClick={() => { onChange(o.value); setOpen(false) }}
                style={{
                  padding: '9px 12px', cursor: 'pointer',
                  background: o.value === value ? '#eff6ff' : 'transparent',
                  display: 'flex', flexDirection: 'column', gap: 1,
                }}
                onMouseEnter={e => { if (o.value !== value) (e.currentTarget as HTMLElement).style.background = '#f8fafc' }}
                onMouseLeave={e => { if (o.value !== value) (e.currentTarget as HTMLElement).style.background = 'transparent' }}
              >
                <span style={{ fontSize: 13, fontWeight: o.value === value ? 700 : 500, color: o.value === value ? '#1d4ed8' : '#1e293b' }}>
                  {o.label}
                </span>
                {o.sublabel && <span style={{ fontSize: 11, color: '#94a3b8' }}>{o.sublabel}</span>}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
