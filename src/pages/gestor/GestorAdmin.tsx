import React, { useEffect, useState, useCallback } from 'react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/hooks/useAuth'
import { useNavigate } from 'react-router-dom'
import { Layout } from '@/components/Layout'
import {
  Plus, Pencil, Trash2, Eye, EyeOff, Copy, Check,
  Loader2, Users, Building2, Key, BarChart3, ExternalLink, ShieldCheck,
} from 'lucide-react'
import { toast } from 'sonner'

async function sha256(msg: string) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(msg))
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('')
}

interface GestorUser {
  id: string; login: string; nome: string | null
  obras_ids: string[]; ativo: boolean; nivel: string; created_at: string
}
interface Obra { id: string; nome: string; codigo?: string }

const EMPTY_FORM = { login: '', nome: '', senha: '', obras_ids: [] as string[], ativo: true, nivel: 'gestor' }
const MASTER_EMAIL = 'magmodrive@gmail.com'

export default function GestorAdmin() {
  const { user } = useAuth()
  const nav = useNavigate()

  // Só o master pode acessar
  useEffect(() => {
    if (user && user.email !== MASTER_EMAIL) nav('/')
  }, [user, nav])

  const [gestores, setGestores] = useState<GestorUser[]>([])
  const [obras, setObras]       = useState<Obra[]>([])
  const [loading, setLoading]   = useState(true)
  const [saving, setSaving]     = useState(false)
  const [modal, setModal]       = useState(false)
  const [editId, setEditId]     = useState<string | null>(null)
  const [form, setForm]         = useState({ ...EMPTY_FORM })
  const [showSenha, setShowSenha] = useState(false)
  const [deleteId, setDeleteId] = useState<string | null>(null)
  const [copiado, setCopiado]   = useState<string | null>(null)
  const [expandId, setExpandId] = useState<string | null>(null)

  const gestorUrl = `${window.location.origin}${window.location.pathname}#/gestor-login`

  const fetchData = useCallback(async () => {
    setLoading(true)
    const [{ data: gs }, { data: ob }] = await Promise.all([
      supabase.from('gestor_usuarios').select('*').order('nome'),
      supabase.from('obras').select('id,nome,codigo').order('nome'),
    ])
    setGestores((gs ?? []) as GestorUser[])
    setObras((ob ?? []) as Obra[])
    setLoading(false)
  }, [])

  useEffect(() => { fetchData() }, [fetchData])

  function openNew() {
    setEditId(null); setForm({ ...EMPTY_FORM }); setShowSenha(false); setModal(true)
  }
  function openEdit(g: GestorUser) {
    setEditId(g.id)
    setForm({ login: g.login, nome: g.nome ?? '', senha: '', obras_ids: g.obras_ids ?? [], ativo: g.ativo, nivel: g.nivel ?? 'gestor' })
    setShowSenha(false); setModal(true)
  }

  async function handleSave() {
    if (!form.login.trim()) { toast.error('Informe o código de acesso'); return }
    if (!editId && !form.senha.trim()) { toast.error('Informe a senha inicial'); return }
    setSaving(true)
    try {
      if (editId) {
        const upd: any = { login: form.login.trim().toLowerCase(), nome: form.nome || null, obras_ids: form.obras_ids, ativo: form.ativo, nivel: form.nivel }
        if (form.senha.trim()) upd.senha_hash = await sha256(form.senha.trim())
        const { error } = await supabase.from('gestor_usuarios').update(upd).eq('id', editId)
        if (error) { toast.error('Erro: ' + error.message); return }
        toast.success('Gestor atualizado!')
      } else {
        const hash = await sha256(form.senha.trim())
        const { error } = await supabase.from('gestor_usuarios').insert({
          login: form.login.trim().toLowerCase(),
          nome: form.nome || null,
          senha_hash: hash,
          obras_ids: form.obras_ids,
          ativo: form.ativo,
          nivel: form.nivel,
        })
        if (error) { toast.error('Erro: ' + error.message); return }
        toast.success('Gestor criado!')
      }
      setModal(false); fetchData()
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete() {
    if (!deleteId) return
    const { error } = await supabase.from('gestor_usuarios').delete().eq('id', deleteId)
    if (error) { toast.error('Erro: ' + error.message); return }
    toast.success('Gestor removido'); setDeleteId(null); fetchData()
  }

  function toggleObra(obraId: string) {
    setForm(f => ({
      ...f, obras_ids: f.obras_ids.includes(obraId)
        ? f.obras_ids.filter(id => id !== obraId)
        : [...f.obras_ids, obraId],
    }))
  }

  function copiarLink() {
    navigator.clipboard.writeText(gestorUrl)
    setCopiado('link')
    setTimeout(() => setCopiado(null), 2000)
    toast.success('Link copiado!')
  }

  if (user?.email !== MASTER_EMAIL) return null

  return (
    <div className="page-root">
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 24, flexWrap: 'wrap', gap: 12 }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 800, margin: 0, display: 'flex', alignItems: 'center', gap: 10 }}>
            <BarChart3 size={22} color="#f59e0b" /> Portal do Gestor
          </h1>
          <p style={{ color: 'var(--muted-foreground)', fontSize: 13, margin: '4px 0 0' }}>
            Gerencie acessos dos gestores ao painel gerencial
          </p>
        </div>
        <button onClick={openNew} style={{
          display: 'flex', alignItems: 'center', gap: 7, padding: '9px 18px',
          borderRadius: 10, border: 'none', background: 'var(--primary)', color: '#fff',
          fontWeight: 700, fontSize: 13, cursor: 'pointer',
        }}>
          <Plus size={15} /> Novo Gestor
        </button>
      </div>

      {/* Link do portal */}
      <div style={{
        background: 'linear-gradient(135deg, #0f172a, #1e3a5f)',
        borderRadius: 14, padding: '16px 20px', marginBottom: 20,
        display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <ExternalLink size={18} color="#fbbf24" />
          <div>
            <div style={{ color: 'rgba(255,255,255,0.6)', fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.07em' }}>
              Link de Acesso do Gestor
            </div>
            <div style={{ color: '#fff', fontFamily: 'monospace', fontSize: 13, marginTop: 2 }}>
              {gestorUrl}
            </div>
          </div>
        </div>
        <button onClick={copiarLink} style={{
          display: 'flex', alignItems: 'center', gap: 7, padding: '8px 16px',
          borderRadius: 9, border: '1px solid rgba(255,255,255,0.3)',
          background: 'rgba(255,255,255,0.1)', color: '#fff', cursor: 'pointer',
          fontWeight: 700, fontSize: 12,
        }}>
          {copiado === 'link' ? <><Check size={14} /> Copiado!</> : <><Copy size={14} /> Copiar Link</>}
        </button>
      </div>

      {/* KPIs */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12, marginBottom: 24 }}>
        {[
          { icon: <Users size={18} />, val: gestores.filter(g => g.ativo).length, label: 'Gestores ativos', cor: '#16a34a', bg: '#f0fdf4' },
          { icon: <Building2 size={18} />, val: obras.length, label: 'Obras no sistema', cor: '#2563eb', bg: '#eff6ff' },
          { icon: <ShieldCheck size={18} />, val: gestores.length, label: 'Total de acessos', cor: '#7c3aed', bg: '#f5f3ff' },
        ].map(k => (
          <div key={k.label} style={{ background: k.bg, border: `1px solid ${k.cor}22`, borderRadius: 12, padding: '14px 18px', display: 'flex', alignItems: 'center', gap: 12 }}>
            <div style={{ width: 36, height: 36, borderRadius: 9, background: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 1px 4px rgba(0,0,0,0.08)' }}>
              {React.cloneElement(k.icon, { color: k.cor } as any)}
            </div>
            <div>
              <div style={{ fontSize: 22, fontWeight: 800, color: k.cor, lineHeight: 1 }}>{k.val}</div>
              <div style={{ fontSize: 11, color: '#64748b', fontWeight: 600 }}>{k.label}</div>
            </div>
          </div>
        ))}
      </div>

      {/* Lista */}
      {loading ? (
        <div style={{ textAlign: 'center', padding: 48 }}><Loader2 size={24} style={{ animation: 'spin 1s linear infinite' }} /></div>
      ) : gestores.length === 0 ? (
        <div style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 14, padding: 48, textAlign: 'center', color: 'var(--muted-foreground)' }}>
          <div style={{ fontSize: 40, marginBottom: 10 }}>👤</div>
          <div style={{ fontWeight: 700, fontSize: 16 }}>Nenhum gestor cadastrado</div>
          <div style={{ fontSize: 13, marginTop: 4 }}>Clique em "Novo Gestor" para criar o primeiro acesso.</div>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {gestores.map(g => {
            const obrasGestor = obras.filter(o => g.obras_ids?.includes(o.id))
            const expanded = expandId === g.id
            return (
              <div key={g.id} style={{
                background: 'var(--card)', border: '1px solid var(--border)',
                borderRadius: 14, overflow: 'hidden',
                boxShadow: '0 1px 4px rgba(0,0,0,0.05)',
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '14px 18px' }}>
                  {/* Avatar */}
                  <div style={{
                    width: 44, height: 44, borderRadius: '50%', flexShrink: 0,
                    background: g.ativo
                      ? 'linear-gradient(135deg, #0f172a, #1e3a5f)'
                      : 'linear-gradient(135deg, #94a3b8, #64748b)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: 15, fontWeight: 800, color: '#fff',
                  }}>
                    {(g.nome ?? g.login).slice(0, 2).toUpperCase()}
                  </div>

                  {/* Info */}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                      <span style={{ fontWeight: 700, fontSize: 15 }}>{g.nome ?? '—'}</span>
                      <span style={{
                        fontFamily: 'monospace', fontSize: 12, fontWeight: 700,
                        background: '#f1f5f9', color: '#475569', borderRadius: 6, padding: '2px 8px',
                      }}>@{g.login}</span>
                      <span style={{
                        fontSize: 11, fontWeight: 700, borderRadius: 20, padding: '2px 9px',
                        background: g.ativo ? '#dcfce7' : '#fee2e2',
                        color: g.ativo ? '#15803d' : '#dc2626',
                      }}>{g.ativo ? 'Ativo' : 'Inativo'}</span>
                      <span style={{
                        fontSize: 11, fontWeight: 700, borderRadius: 20, padding: '2px 9px',
                        background: g.nivel === 'master' ? '#fef3c7' : '#eff6ff',
                        color: g.nivel === 'master' ? '#b45309' : '#2563eb',
                      }}>
                        {g.nivel === 'master' ? '⭐ Master' : '👤 Gestor'}
                      </span>
                    </div>
                    <div style={{ fontSize: 12, color: 'var(--muted-foreground)', marginTop: 4, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                      {g.obras_ids?.length === 0
                        ? <span style={{ color: '#16a34a', fontWeight: 600 }}>🏗️ Acesso a todas as obras</span>
                        : obrasGestor.slice(0, 3).map(o => (
                          <span key={o.id} style={{ background: 'var(--muted)', borderRadius: 5, padding: '1px 7px' }}>
                            🏗️ {o.nome}
                          </span>
                        ))
                      }
                      {obrasGestor.length > 3 && (
                        <button onClick={() => setExpandId(expanded ? null : g.id)}
                          style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--primary)', fontSize: 12, fontWeight: 700 }}>
                          +{obrasGestor.length - 3} mais
                        </button>
                      )}
                    </div>
                    {expanded && obrasGestor.length > 3 && (
                      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 6 }}>
                        {obrasGestor.slice(3).map(o => (
                          <span key={o.id} style={{ background: 'var(--muted)', borderRadius: 5, padding: '2px 8px', fontSize: 12 }}>
                            🏗️ {o.nome}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Ações */}
                  <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
                    <button onClick={() => openEdit(g)} title="Editar"
                      style={{ width: 34, height: 34, borderRadius: 8, border: '1px solid var(--border)', background: 'var(--muted)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      <Pencil size={14} />
                    </button>
                    <button onClick={() => setDeleteId(g.id)} title="Remover"
                      style={{ width: 34, height: 34, borderRadius: 8, border: '1px solid #fecaca', background: '#fef2f2', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      <Trash2 size={14} color="#dc2626" />
                    </button>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* ════ MODAL NOVO / EDITAR ════ */}
      {modal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 200, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
          <div style={{ background: 'var(--background)', borderRadius: 16, width: '100%', maxWidth: 520, maxHeight: '92vh', overflow: 'auto', boxShadow: '0 20px 60px rgba(0,0,0,0.3)' }}>
            {/* Header modal */}
            <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div style={{ fontWeight: 800, fontSize: 16, display: 'flex', alignItems: 'center', gap: 8 }}>
                <BarChart3 size={16} color="#f59e0b" />
                {editId ? 'Editar Gestor' : 'Novo Gestor'}
              </div>
              <button onClick={() => setModal(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 18, color: 'var(--muted-foreground)' }}>✕</button>
            </div>

            {/* Corpo */}
            <div style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: 16 }}>

              {/* Código + Nome */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div>
                  <label style={{ fontSize: 12, fontWeight: 700, display: 'block', marginBottom: 5, color: 'var(--foreground)' }}>
                    Código de Acesso *
                  </label>
                  <input
                    value={form.login} onChange={e => setForm(f => ({ ...f, login: e.target.value.toLowerCase() }))}
                    placeholder="Ex.: gest-001"
                    style={{ width: '100%', border: '1px solid var(--border)', borderRadius: 9, padding: '9px 12px', fontSize: 13, fontFamily: 'monospace', fontWeight: 700, boxSizing: 'border-box', background: 'var(--input)', color: 'var(--foreground)' }}
                  />
                  <span style={{ fontSize: 10, color: 'var(--muted-foreground)' }}>Minúsculas e hifens apenas</span>
                </div>
                <div>
                  <label style={{ fontSize: 12, fontWeight: 700, display: 'block', marginBottom: 5, color: 'var(--foreground)' }}>Nome do Gestor</label>
                  <input
                    value={form.nome} onChange={e => setForm(f => ({ ...f, nome: e.target.value }))}
                    placeholder="Ex.: Carlos Silva"
                    style={{ width: '100%', border: '1px solid var(--border)', borderRadius: 9, padding: '9px 12px', fontSize: 13, boxSizing: 'border-box', background: 'var(--input)', color: 'var(--foreground)' }}
                  />
                </div>
              </div>

              {/* Senha */}
              <div>
                <label style={{ fontSize: 12, fontWeight: 700, display: 'block', marginBottom: 5, color: 'var(--foreground)' }}>
                  {editId ? 'Nova Senha (deixe em branco para não alterar)' : 'Senha *'}
                </label>
                <div style={{ position: 'relative' }}>
                  <input
                    type={showSenha ? 'text' : 'password'}
                    value={form.senha} onChange={e => setForm(f => ({ ...f, senha: e.target.value }))}
                    placeholder={editId ? '••••••••' : 'Mínimo 6 caracteres'}
                    style={{ width: '100%', border: '1px solid var(--border)', borderRadius: 9, padding: '9px 44px 9px 12px', fontSize: 13, boxSizing: 'border-box', background: 'var(--input)', color: 'var(--foreground)' }}
                  />
                  <button type="button" onClick={() => setShowSenha(p => !p)}
                    style={{ position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--muted-foreground)' }}>
                    {showSenha ? <EyeOff size={16} /> : <Eye size={16} />}
                  </button>
                </div>
              </div>

              {/* Nível */}
              <div>
                <label style={{ fontSize: 12, fontWeight: 700, display: 'block', marginBottom: 8, color: 'var(--foreground)' }}>Nível de Acesso</label>
                <div style={{ display: 'flex', gap: 8 }}>
                  {[{ v: 'gestor', label: '👤 Gestor', desc: 'Acesso padrão ao portal' }, { v: 'master', label: '⭐ Gestor Master', desc: 'Acesso a todas as obras' }].map(n => (
                    <button key={n.v} type="button" onClick={() => setForm(f => ({ ...f, nivel: n.v }))}
                      style={{ flex: 1, padding: '10px 12px', borderRadius: 10, border: `2px solid ${form.nivel === n.v ? (n.v === 'master' ? '#f59e0b' : 'var(--primary)') : 'var(--border)'}`, background: form.nivel === n.v ? (n.v === 'master' ? '#fffbeb' : 'rgba(37,99,235,0.06)') : 'var(--card)', cursor: 'pointer', textAlign: 'center' }}>
                      <div style={{ fontWeight: 700, fontSize: 13 }}>{n.label}</div>
                      <div style={{ fontSize: 10, color: 'var(--muted-foreground)', marginTop: 2 }}>{n.desc}</div>
                    </button>
                  ))}
                </div>
              </div>

              {/* Status */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <button type="button" onClick={() => setForm(f => ({ ...f, ativo: !f.ativo }))}
                  style={{ position: 'relative', width: 44, height: 24, borderRadius: 12, border: 'none', cursor: 'pointer', background: form.ativo ? 'var(--primary)' : 'rgba(0,0,0,0.15)', flexShrink: 0 }}>
                  <span style={{ position: 'absolute', top: 3, left: form.ativo ? 22 : 3, width: 18, height: 18, borderRadius: '50%', background: '#fff', transition: 'left 150ms' }} />
                </button>
                <span style={{ fontSize: 13, fontWeight: 600 }}>{form.ativo ? '✅ Acesso ativo' : '🔴 Acesso inativo'}</span>
              </div>

              {/* Obras */}
              <div>
                <label style={{ fontSize: 12, fontWeight: 700, display: 'block', marginBottom: 8, color: 'var(--foreground)' }}>
                  Obras com Acesso
                  <span style={{ fontWeight: 400, color: 'var(--muted-foreground)', marginLeft: 6 }}>
                    ({form.obras_ids.length === 0 ? 'todas' : `${form.obras_ids.length} selecionada${form.obras_ids.length !== 1 ? 's' : ''}`})
                  </span>
                </label>
                <div style={{ fontSize: 11, color: 'var(--muted-foreground)', marginBottom: 8 }}>
                  💡 Deixe vazio para acesso a todas as obras
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6, maxHeight: 200, overflowY: 'auto' }}>
                  {obras.map(o => {
                    const sel = form.obras_ids.includes(o.id)
                    return (
                      <button key={o.id} type="button" onClick={() => toggleObra(o.id)}
                        style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 10px', borderRadius: 8, border: `1px solid ${sel ? 'var(--primary)' : 'var(--border)'}`, background: sel ? 'rgba(37,99,235,0.06)' : 'var(--card)', cursor: 'pointer', textAlign: 'left' }}>
                        <div style={{ width: 16, height: 16, borderRadius: 4, border: `2px solid ${sel ? 'var(--primary)' : 'var(--border)'}`, background: sel ? 'var(--primary)' : 'transparent', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                          {sel && <Check size={10} color="#fff" />}
                        </div>
                        <span style={{ fontSize: 12, fontWeight: sel ? 700 : 400, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {o.codigo ? `[${o.codigo}] ` : ''}{o.nome}
                        </span>
                      </button>
                    )
                  })}
                </div>
              </div>
            </div>

            {/* Footer modal */}
            <div style={{ padding: '12px 20px', borderTop: '1px solid var(--border)', display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
              <button onClick={() => setModal(false)} style={{ padding: '9px 18px', borderRadius: 9, border: '1px solid var(--border)', background: 'var(--card)', cursor: 'pointer', fontWeight: 600, fontSize: 13 }}>
                Cancelar
              </button>
              <button onClick={handleSave} disabled={saving}
                style={{ padding: '9px 20px', borderRadius: 9, border: 'none', background: saving ? '#94a3b8' : 'var(--primary)', color: '#fff', fontWeight: 700, fontSize: 13, cursor: saving ? 'not-allowed' : 'pointer', display: 'flex', alignItems: 'center', gap: 6 }}>
                {saving ? <><Loader2 size={14} style={{ animation: 'spin 1s linear infinite' }} /> Salvando…</> : editId ? 'Salvar' : 'Criar Gestor'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ════ CONFIRM DELETE ════ */}
      {deleteId && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 300, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
          <div style={{ background: 'var(--background)', borderRadius: 14, padding: 28, maxWidth: 380, width: '100%', textAlign: 'center', boxShadow: '0 20px 60px rgba(0,0,0,0.3)' }}>
            <div style={{ fontSize: 40, marginBottom: 12 }}>🗑️</div>
            <div style={{ fontWeight: 800, fontSize: 17, marginBottom: 8 }}>Remover acesso?</div>
            <div style={{ fontSize: 13, color: 'var(--muted-foreground)', marginBottom: 20 }}>
              O gestor perderá acesso ao portal imediatamente.
            </div>
            <div style={{ display: 'flex', gap: 10, justifyContent: 'center' }}>
              <button onClick={() => setDeleteId(null)} style={{ padding: '9px 20px', borderRadius: 9, border: '1px solid var(--border)', background: 'var(--card)', cursor: 'pointer', fontWeight: 600 }}>Cancelar</button>
              <button onClick={handleDelete} style={{ padding: '9px 20px', borderRadius: 9, border: 'none', background: '#dc2626', color: '#fff', fontWeight: 700, cursor: 'pointer' }}>Remover</button>
            </div>
          </div>
        </div>
      )}

      <style>{`@keyframes spin { from{transform:rotate(0deg)} to{transform:rotate(360deg)} }`}</style>
    </div>
  )
}
