/**
 * ColabSearchSelect — campo de pesquisa de colaboradores com busca em tempo real
 * Padrão adotado da página Ponto e replicado para todas as abas do Portal da Obra.
 *
 * Props:
 *   colabs        — lista de colaboradores disponíveis
 *   value         — ID selecionado ('' = nenhum)
 *   onChange      — callback ao selecionar/limpar
 *   label         — rótulo do campo (default: "COLABORADOR *")
 *   placeholder   — texto padrão da busca
 *   opcional      — se true, mostra opção "Para toda a equipe / obra"
 *   opcionalLabel — texto da opção geral (default: "— Geral / toda a equipe —")
 *   erro          — exibe mensagem de erro abaixo do campo
 *   required      — aplica borda vermelha quando vazio e não-opcional
 */

import React, { useState, useMemo, useRef, useEffect } from 'react'

export interface ColabOption {
  id: string
  nome: string
  chapa?: string
  funcao?: string
}

interface Props {
  colabs: ColabOption[]
  value: string
  onChange: (id: string) => void
  label?: string
  placeholder?: string
  opcional?: boolean
  opcionalLabel?: string
  erro?: string
  required?: boolean
  disabled?: boolean
}

export default function ColabSearchSelect({
  colabs,
  value,
  onChange,
  label = 'COLABORADOR *',
  placeholder = '🔍 Buscar colaborador (nome ou chapa)…',
  opcional = false,
  opcionalLabel = '— Geral / toda a equipe —',
  erro,
  required = false,
  disabled = false,
}: Props) {
  const [busca, setBusca] = useState('')
  const [aberto, setAberto] = useState(false)
  const wrapRef = useRef<HTMLDivElement>(null)

  // Fechar ao clicar fora
  useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) {
        setAberto(false)
      }
    }
    document.addEventListener('mousedown', onClickOutside)
    return () => document.removeEventListener('mousedown', onClickOutside)
  }, [])

  // Filtrar lista pela busca
  const filtrados = useMemo(() => {
    const q = busca.toLowerCase().trim()
    if (!q) return colabs
    return colabs.filter(c =>
      c.nome.toLowerCase().includes(q) ||
      (c.chapa ?? '').toLowerCase().includes(q) ||
      (c.funcao ?? '').toLowerCase().includes(q)
    )
  }, [colabs, busca])

  const selecionado = colabs.find(c => c.id === value)
  const semBorda = opcional || !required
  const bordaErr = required && !value && !opcional ? '#ef4444' : '#e5e7eb'

  function selecionar(id: string) {
    onChange(id)
    setBusca('')
    setAberto(false)
  }

  return (
    <div ref={wrapRef} style={{ position: 'relative' }}>
      {/* Label */}
      <label style={{
        display: 'block', fontSize: 11, fontWeight: 700,
        color: '#374151', textTransform: 'uppercase',
        letterSpacing: '0.05em', marginBottom: 4,
      }}>
        {label}
      </label>

      {/* Campo principal — mostra selecionado ou placeholder */}
      {!aberto ? (
        <button
          type="button"
          disabled={disabled}
          onClick={() => { if (!disabled) setAberto(true) }}
          style={{
            width: '100%', height: 44, borderRadius: 10,
            border: `1.5px solid ${required && !value && !opcional ? bordaErr : '#e5e7eb'}`,
            background: disabled ? '#f9fafb' : '#fff',
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            padding: '0 12px', fontSize: 13, cursor: disabled ? 'not-allowed' : 'pointer',
            color: selecionado ? '#1e293b' : optional ? '#6b7280' : (value === '' && opcional) ? '#6b7280' : '#9ca3af',
            boxSizing: 'border-box', textAlign: 'left',
          }}
        >
          <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }}>
            {selecionado
              ? `${selecionado.nome}${selecionado.chapa ? ` (${selecionado.chapa})` : ''}`
              : opcional
                ? opcionalLabel
                : 'Selecione…'
            }
          </span>
          <span style={{ marginLeft: 8, fontSize: 11, color: '#94a3b8', flexShrink: 0 }}>▼</span>
        </button>
      ) : (
        /* Campo de busca + lista */
        <div style={{
          border: '1.5px solid #3b82f6', borderRadius: 10,
          background: '#fff', boxShadow: '0 4px 20px rgba(0,0,0,0.12)',
          overflow: 'hidden',
        }}>
          {/* Input de busca */}
          <div style={{ position: 'relative', borderBottom: '1px solid #e5e7eb' }}>
            <span style={{
              position: 'absolute', left: 11, top: '50%', transform: 'translateY(-50%)',
              fontSize: 14, pointerEvents: 'none', color: '#94a3b8',
            }}>🔍</span>
            <input
              autoFocus
              type="text"
              value={busca}
              onChange={e => setBusca(e.target.value)}
              placeholder={placeholder}
              style={{
                width: '100%', height: 42, border: 'none', outline: 'none',
                paddingLeft: 34, paddingRight: busca ? 34 : 12,
                fontSize: 13, background: 'transparent', boxSizing: 'border-box',
              }}
            />
            {busca && (
              <button
                type="button"
                onClick={() => setBusca('')}
                style={{
                  position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)',
                  background: 'none', border: 'none', cursor: 'pointer',
                  color: '#9ca3af', fontSize: 14, lineHeight: 1,
                }}
              >✕</button>
            )}
          </div>

          {/* Lista de opções */}
          <div style={{ maxHeight: 220, overflowY: 'auto' }}>
            {/* Opção geral (quando opcional) */}
            {opcional && !busca && (
              <div
                onClick={() => selecionar('')}
                style={{
                  padding: '10px 14px', cursor: 'pointer', fontSize: 13,
                  background: value === '' ? '#eff6ff' : '#fff',
                  color: value === '' ? '#1d4ed8' : '#374151',
                  fontWeight: value === '' ? 700 : 500,
                  borderBottom: '1px solid #f1f5f9',
                }}
              >
                {opcionalLabel}
              </div>
            )}

            {filtrados.length === 0 ? (
              <div style={{ padding: '14px', textAlign: 'center', color: '#9ca3af', fontSize: 12 }}>
                Nenhum colaborador encontrado
              </div>
            ) : (
              filtrados.map(c => {
                const sel = c.id === value
                return (
                  <div
                    key={c.id}
                    onClick={() => selecionar(c.id)}
                    style={{
                      padding: '10px 14px', cursor: 'pointer', fontSize: 13,
                      background: sel ? '#eff6ff' : '#fff',
                      color: sel ? '#1d4ed8' : '#1e293b',
                      fontWeight: sel ? 700 : 400,
                      borderBottom: '1px solid #f8fafc',
                    }}
                  >
                    <span style={{ fontWeight: 600 }}>{c.nome}</span>
                    {c.chapa && (
                      <span style={{ color: '#64748b', fontSize: 11, marginLeft: 6 }}>
                        ({c.chapa})
                      </span>
                    )}
                    {c.funcao && (
                      <span style={{ color: '#94a3b8', fontSize: 11, marginLeft: 6 }}>
                        · {c.funcao}
                      </span>
                    )}
                  </div>
                )
              })
            )}
          </div>
        </div>
      )}

      {/* Erro */}
      {erro && (
        <p style={{ fontSize: 11, color: '#dc2626', marginTop: 4, fontWeight: 600 }}>
          ⚠️ {erro}
        </p>
      )}
    </div>
  )
}
