import React, { useEffect, useState, useCallback } from 'react'
import { supabase } from '@/lib/supabase'
import { Plus, Trash2, Eye, EyeOff, Edit2, Copy, Check, Loader2, ExternalLink, Users, Building2, Key } from 'lucide-react'

// SHA-256 via Web Crypto
async function sha256(msg: string) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(msg))
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('')
}

interface PortalUser {
  id: string; login: string; nome: string | null
  obras_ids: string[]; ativo: boolean; criado_em: string
}
interface Obra { id: string; nome: string; codigo?: string }

const EMPTY_FORM = { login: '', nome: '', senha: '', obras_ids: [] as string[], ativo: true }

export default function PortalAdmin() {
  const [usuarios, setUsuarios] = useState<PortalUser[]>([])
  const [obras, setObras]       = useState<Obra[]>([])
  const [loading, setLoading]   = useState(true)
  const [saving, setSaving]     = useState(false)
  const [modalOpen, setModalOpen] = useState(false)
  const [editId, setEditId]       = useState<string | null>(null)
  const [form, setForm]           = useState({ ...EMPTY_FORM })
  const [showSenha, setShowSenha] = useState(false)
  const [deleteId, setDeleteId]   = useState<string | null>(null)
  const [copiado, setCopiado]     = useState<string | null>(null)
  const [expandedId, setExpandedId] = useState<string | null>(null)

  const portalUrl = `${window.location.origin}${window.location.pathname}#/portal`

  const fetchData = useCallback(async () => {
    setLoading(true)
    const [{ data: us }, { data: ob }] = await Promise.all([
      supabase.from('portal_usuarios').select('*').order('nome'),
      supabase.from('obras').select('id,nome,codigo').order('nome'),
    ])
    if (us) setUsuarios(us as PortalUser[])
    if (ob) setObras(ob as Obra[])
    setLoading(false)
  }, [])

  useEffect(() => { fetchData() }, [fetchData])

  function openNew() {
    setEditId(null); setForm({ ...EMPTY_FORM }); setModalOpen(true)
  }

  function openEdit(u: PortalUser) {
    setEditId(u.id)
    setForm({ login: u.login, nome: u.nome ?? '', senha: '', obras_ids: u.obras_ids ?? [], ativo: u.ativo })
    setModalOpen(true)
  }

  async function handleSave() {
    if (!form.login.trim()) return
    setSaving(true)
    try {
      if (editId) {
        const upd: any = {
          login: form.login.trim().toLowerCase(),
          nome: form.nome.trim() || null,
          obras_ids: form.obras_ids,
          ativo: form.ativo,
          atualizado_em: new Date().toISOString(),
        }
        if (form.senha.trim()) upd.senha_hash = await sha256(form.senha.trim())
        await supabase.from('portal_usuarios').update(upd).eq('id', editId)
      } else {
        if (!form.senha.trim()) { setSaving(false); return }
        const hash = await sha256(form.senha.trim())
        await supabase.from('portal_usuarios').insert({
          login: form.login.trim().toLowerCase(),
          nome: form.nome.trim() || null,
          senha_hash: hash,
          obras_ids: form.obras_ids,
          ativo: form.ativo,
        })
      }
      setModalOpen(false); fetchData()
    } finally { setSaving(false) }
  }

  async function handleDelete(id: string) {
    await supabase.from('portal_usuarios').delete().eq('id', id)
    setDeleteId(null); fetchData()
  }

  function copiarLink() {
    navigator.clipboard.writeText(portalUrl)
    setCopiado('link'); setTimeout(() => setCopiado(null), 2000)
  }

  function toggleObra(obraId: string) {
    setForm(f => ({
      ...f, obras_ids: f.obras_ids.includes(obraId)
        ? f.obras_ids.filter(id => id !== obraId)
        : [...f.obras_ids, obraId]
    }))
  }

  return (
    <div className="page-root">
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
        <div>
          <h2 style={{ fontSize: 20, fontWeight: 800, margin: 0, display: 'flex', alignItems: 'center', gap: 8 }}>
            🏗️ Portal da Obra
          </h2>
          <p style={{ fontSize: 13, color: 'var(--muted-foreground)', margin: '4px 0 0' }}>
            Gerencie acessos externos para encarregados e responsáveis de obra
          </p>
        </div>
        <button onClick={openNew}
          style={{ background: 'var(--primary)', color: '#fff', border: 'none', borderRadius: 8, height: 38, padding: '0 16px', fontSize: 13, fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6 }}>
          <Plus size={15} /> Novo Usuário
        </button>
      </div>

      {/* Link do portal */}
      <div style={{ background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: 12, padding: '14px 18px', marginBottom: 20, display: 'flex', alignItems: 'center', gap: 12 }}>
        <ExternalLink size={18} style={{ color: '#1d4ed8', flexShrink: 0 }} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontWeight: 700, fontSize: 13, color: '#1d4ed8', marginBottom: 2 }}>Link do Portal Externo</div>
          <div style={{ fontSize: 12, color: '#374151', fontFamily: 'monospace', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{portalUrl}</div>
        </div>
        <button onClick={copiarLink}
          style={{ background: '#1d4ed8', color: '#fff', border: 'none', borderRadius: 8, height: 34, padding: '0 14px', cursor: 'pointer', fontSize: 12, fontWeight: 700, display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
          {copiado === 'link' ? <><Check size={13} /> Copiado!</> : <><Copy size={13} /> Copiar Link</>}
        </button>
      </div>

      {/* Cards resumo */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 12, marginBottom: 20 }}>
        {[
          { icon: <Users size={18} />, label: 'Usuários ativos', value: usuarios.filter(u => u.ativo).length, cor: '#15803d', bg: '#dcfce7' },
          { icon: <Building2 size={18} />, label: 'Obras no sistema', value: obras.length, cor: '#1d4ed8', bg: '#dbeafe' },
          { icon: <Key size={18} />, label: 'Total de acessos', value: usuarios.length, cor: '#7c3aed', bg: '#ede9fe' },
        ].map((s, i) => (
          <div key={i} style={{ background: s.bg, borderRadius: 10, padding: '12px 16px', display: 'flex', alignItems: 'center', gap: 12 }}>
            <span style={{ color: s.cor }}>{s.icon}</span>
            <div>
              <div style={{ fontWeight: 800, fontSize: 22, color: s.cor }}>{s.value}</div>
              <div style={{ fontSize: 11, color: s.cor, fontWeight: 600 }}>{s.label}</div>
            </div>
          </div>
        ))}
      </div>

      {/* Tabela de usuários */}
      {loading ? (
        <div style={{ textAlign: 'center', padding: 40, color: 'var(--muted-foreground)' }}>Carregando…</div>
      ) : usuarios.length === 0 ? (
        <div style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 12, padding: 40, textAlign: 'center', color: 'var(--muted-foreground)' }}>
          Nenhum usuário do portal cadastrado. Clique em "Novo Usuário" para começar.
        </div>
      ) : (
        <div style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 12, overflow: 'hidden' }}>
          {usuarios.map((u, i) => {
            const isExpanded = expandedId === u.id
            const obrasDele = obras.filter(o => u.obras_ids?.includes(o.id))
            return (
              <div key={u.id} style={{ borderTop: i > 0 ? '1px solid var(--border)' : 'none' }}>
                {/* Linha principal */}
                <div style={{ display: 'flex', alignItems: 'center', padding: '12px 16px', gap: 12 }}>
                  <div style={{
                    width: 38, height: 38, borderRadius: '50%', flexShrink: 0,
                    background: u.ativo ? 'linear-gradient(135deg,#1e3a5f,#2d6a4f)' : 'var(--muted)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    color: u.ativo ? '#fff' : 'var(--muted-foreground)', fontWeight: 800, fontSize: 14,
                  }}>
                    {(u.nome ?? u.login).slice(0, 2).toUpperCase()}
                  </div>

                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                      <span style={{ fontWeight: 700, fontSize: 14 }}>{u.nome ?? '(sem nome)'}</span>
                      <span style={{ fontSize: 11, background: 'var(--muted)', borderRadius: 4, padding: '1px 6px', fontFamily: 'monospace', fontWeight: 600 }}>@{u.login}</span>
                      <span style={{
                        fontSize: 10, borderRadius: 4, padding: '2px 6px', fontWeight: 700,
                        background: u.ativo ? '#dcfce7' : '#fee2e2', color: u.ativo ? '#15803d' : '#dc2626',
                      }}>{u.ativo ? 'Ativo' : 'Inativo'}</span>
                    </div>
                    <div style={{ marginTop: 3, display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                      {obrasDele.length === 0 ? (
                        <span style={{ fontSize: 11, color: '#f59e0b', fontWeight: 600 }}>⚠ Sem obras vinculadas</span>
                      ) : obrasDele.slice(0, 3).map(o => (
                        <span key={o.id} style={{ fontSize: 10, background: '#eff6ff', color: '#1d4ed8', borderRadius: 4, padding: '1px 6px', fontWeight: 600 }}>
                          🏗️ {o.nome}
                        </span>
                      ))}
                      {obrasDele.length > 3 && (
                        <span style={{ fontSize: 10, color: 'var(--muted-foreground)' }}>+{obrasDele.length - 3} mais</span>
                      )}
                    </div>
                  </div>

                  <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
                    <button onClick={() => setExpandedId(isExpanded ? null : u.id)}
                      style={{ height: 30, padding: '0 10px', background: 'var(--muted)', border: 'none', borderRadius: 6, cursor: 'pointer', fontSize: 11, fontWeight: 600, color: 'var(--muted-foreground)' }}>
                      {isExpanded ? 'Fechar' : 'Detalhes'}
                    </button>
                    <button onClick={() => openEdit(u)}
                      style={{ height: 30, width: 30, background: '#eff6ff', border: 'none', borderRadius: 6, cursor: 'pointer', color: '#1d4ed8', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      <Edit2 size={13} />
                    </button>
                    <button onClick={() => setDeleteId(u.id)}
                      style={{ height: 30, width: 30, background: '#fef2f2', border: 'none', borderRadius: 6, cursor: 'pointer', color: '#dc2626', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      <Trash2 size={13} />
                    </button>
                  </div>
                </div>

                {/* Detalhes expandidos */}
                {isExpanded && (
                  <div style={{ padding: '0 16px 14px', borderTop: '1px solid var(--border)', background: 'var(--muted)' }}>
                    <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--muted-foreground)', margin: '10px 0 6px' }}>
                      Obras com acesso ({obrasDele.length})
                    </div>
                    {obrasDele.length === 0 ? (
                      <span style={{ fontSize: 12, color: '#f59e0b' }}>Nenhuma obra vinculada</span>
                    ) : (
                      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                        {obrasDele.map(o => (
                          <span key={o.id} style={{ fontSize: 12, background: '#dbeafe', color: '#1d4ed8', borderRadius: 6, padding: '4px 10px', fontWeight: 600 }}>
                            🏗️ {o.nome} {o.codigo ? `(${o.codigo})` : ''}
                          </span>
                        ))}
                      </div>
                    )}
                    <div style={{ fontSize: 11, color: 'var(--muted-foreground)', marginTop: 8 }}>
                      Criado em {new Date(u.criado_em).toLocaleDateString('pt-BR')}
                    </div>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}

      {/* MODAL criar/editar */}
      {modalOpen && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 200, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
          <div style={{ background: 'var(--background)', borderRadius: 16, width: '100%', maxWidth: 520, maxHeight: '92vh', overflow: 'hidden', display: 'flex', flexDirection: 'column', boxShadow: '0 20px 60px rgba(0,0,0,0.3)' }}>
            <div style={{ padding: '20px 24px 16px', borderBottom: '1px solid var(--border)', fontWeight: 800, fontSize: 17 }}>
              {editId ? 'Editar Usuário do Portal' : 'Novo Usuário do Portal'}
            </div>
            <div style={{ padding: '20px 24px', overflowY: 'auto', flex: 1, display: 'flex', flexDirection: 'column', gap: 16 }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div>
                  <label style={{ fontSize: 12, fontWeight: 700, display: 'block', marginBottom: 6, color: 'var(--muted-foreground)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>ID / Login *</label>
                  <input value={form.login} onChange={e => setForm(f => ({ ...f, login: e.target.value.toLowerCase() }))}
                    placeholder="ex: obra01" autoCapitalize="none"
                    style={{ width: '100%', height: 40, border: '1px solid var(--border)', borderRadius: 8, padding: '0 12px', fontSize: 14, boxSizing: 'border-box', background: 'var(--input)', color: 'var(--foreground)' }} />
                  <div style={{ fontSize: 10, color: 'var(--muted-foreground)', marginTop: 4 }}>Apenas letras minúsculas, números e hífen</div>
                </div>
                <div>
                  <label style={{ fontSize: 12, fontWeight: 700, display: 'block', marginBottom: 6, color: 'var(--muted-foreground)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Nome</label>
                  <input value={form.nome} onChange={e => setForm(f => ({ ...f, nome: e.target.value }))}
                    placeholder="Nome do encarregado"
                    style={{ width: '100%', height: 40, border: '1px solid var(--border)', borderRadius: 8, padding: '0 12px', fontSize: 14, boxSizing: 'border-box', background: 'var(--input)', color: 'var(--foreground)' }} />
                </div>
              </div>

              <div>
                <label style={{ fontSize: 12, fontWeight: 700, display: 'block', marginBottom: 6, color: 'var(--muted-foreground)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                  {editId ? 'Nova Senha (deixe em branco para manter)' : 'Senha *'}
                </label>
                <div style={{ position: 'relative' }}>
                  <input
                    type={showSenha ? 'text' : 'password'}
                    value={form.senha} onChange={e => setForm(f => ({ ...f, senha: e.target.value }))}
                    placeholder={editId ? '••••••• (manter atual)' : 'Defina uma senha'}
                    style={{ width: '100%', height: 40, border: '1px solid var(--border)', borderRadius: 8, padding: '0 40px 0 12px', fontSize: 14, boxSizing: 'border-box', background: 'var(--input)', color: 'var(--foreground)' }} />
                  <button type="button" onClick={() => setShowSenha(s => !s)}
                    style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--muted-foreground)' }}>
                    {showSenha ? <EyeOff size={16} /> : <Eye size={16} />}
                  </button>
                </div>
              </div>

              {/* Obras */}
              <div>
                <label style={{ fontSize: 12, fontWeight: 700, display: 'block', marginBottom: 8, color: 'var(--muted-foreground)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                  Obras com Acesso ({form.obras_ids.length} selecionada{form.obras_ids.length !== 1 ? 's' : ''})
                </label>
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', maxHeight: 180, overflowY: 'auto', padding: 2 }}>
                  {obras.map(o => {
                    const sel = form.obras_ids.includes(o.id)
                    return (
                      <button key={o.id} type="button" onClick={() => toggleObra(o.id)}
                        style={{
                          padding: '6px 12px', borderRadius: 8, fontSize: 12, fontWeight: 600, cursor: 'pointer', border: `2px solid ${sel ? '#1d4ed8' : 'var(--border)'}`,
                          background: sel ? '#eff6ff' : 'var(--card)', color: sel ? '#1d4ed8' : 'var(--muted-foreground)',
                        }}>
                        {sel ? '✓ ' : ''}{o.nome}
                      </button>
                    )
                  })}
                </div>
              </div>

              <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: 13, fontWeight: 600 }}>
                <input type="checkbox" checked={form.ativo} onChange={e => setForm(f => ({ ...f, ativo: e.target.checked }))}
                  style={{ width: 16, height: 16, accentColor: 'var(--primary)' }} />
                Usuário ativo (pode acessar o portal)
              </label>
            </div>
            <div style={{ padding: '14px 24px', borderTop: '1px solid var(--border)', display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
              <button onClick={() => setModalOpen(false)} style={{ height: 38, padding: '0 16px', background: 'var(--muted)', border: 'none', borderRadius: 8, cursor: 'pointer', fontWeight: 600, fontSize: 13, color: 'var(--foreground)' }}>
                Cancelar
              </button>
              <button onClick={handleSave} disabled={saving}
                style={{ height: 38, padding: '0 20px', background: saving ? '#94a3b8' : 'var(--primary)', color: '#fff', border: 'none', borderRadius: 8, cursor: saving ? 'not-allowed' : 'pointer', fontWeight: 700, fontSize: 13, display: 'flex', alignItems: 'center', gap: 6 }}>
                {saving ? <><Loader2 size={14} className="animate-spin" /> Salvando…</> : 'Salvar'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Confirmação delete */}
      {deleteId && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 300, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
          <div style={{ background: 'var(--background)', borderRadius: 14, padding: '24px', width: '100%', maxWidth: 380, textAlign: 'center' }}>
            <div style={{ fontSize: 36, marginBottom: 12 }}>⚠️</div>
            <div style={{ fontWeight: 800, fontSize: 16, marginBottom: 8 }}>Excluir usuário?</div>
            <div style={{ fontSize: 13, color: 'var(--muted-foreground)', marginBottom: 20 }}>
              Este usuário perderá o acesso ao portal imediatamente.
            </div>
            <div style={{ display: 'flex', gap: 10, justifyContent: 'center' }}>
              <button onClick={() => setDeleteId(null)} style={{ height: 40, padding: '0 20px', background: 'var(--muted)', border: 'none', borderRadius: 8, cursor: 'pointer', fontWeight: 600 }}>Cancelar</button>
              <button onClick={() => handleDelete(deleteId)} style={{ height: 40, padding: '0 20px', background: '#dc2626', color: '#fff', border: 'none', borderRadius: 8, cursor: 'pointer', fontWeight: 700 }}>Excluir</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
