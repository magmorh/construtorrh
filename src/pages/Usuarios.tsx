import { useEffect, useState, useCallback } from 'react'
import { supabase } from '@/lib/supabase'
import { useProfile, ROLE_PERMISSIONS, ROLE_DESCRIPTIONS, type Role } from '@/hooks/useProfile'
import { PageHeader } from '@/components/Shared'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table'
import { Pencil, UserPlus, ShieldCheck, ShieldX, Check, X } from 'lucide-react'
import { traduzirErro } from '@/lib/erros'

type UserRow = {
  id: string
  nome: string
  email: string
  role: Role
  ativo: boolean
  created_at: string
}

const ROLES: { value: Role; label: string }[] = [
  { value: 'admin',        label: 'Administrador' },
  { value: 'rh',           label: 'RH' },
  { value: 'obra',         label: 'Obra' },
  { value: 'visualizador', label: 'Visualizador' },
]

function RoleBadge({ role }: { role: Role }) {
  const m = ROLE_PERMISSIONS[role]
  return (
    <span style={{ padding: '3px 10px', borderRadius: 10, fontSize: 11, fontWeight: 700, background: m.bg, color: m.color }}>
      {m.label}
    </span>
  )
}

function PermCell({ ok }: { ok: boolean }) {
  return ok
    ? <span style={{ color: '#16a34a', fontWeight: 700 }}><Check size={14} /></span>
    : <span style={{ color: '#dc2626' }}><X size={14} /></span>
}

export default function Usuarios() {
  const { profile: myProfile, isAdmin } = useProfile()
  const [users,   setUsers]   = useState<UserRow[]>([])
  const [loading, setLoading] = useState(true)

  // modal convidar
  const [inviteOpen,  setInviteOpen]  = useState(false)
  const [inviteEmail, setInviteEmail] = useState('')
  const [inviteNome,  setInviteNome]  = useState('')
  const [inviteRole,  setInviteRole]  = useState<Role>('rh')
  const [invitePwd,   setInvitePwd]   = useState('')
  const [saving,      setSaving]      = useState(false)

  // modal editar role
  const [editUser,    setEditUser]    = useState<UserRow | null>(null)
  const [editRole,    setEditRole]    = useState<Role>('rh')
  const [editNome,    setEditNome]    = useState('')
  const [editAtivo,   setEditAtivo]   = useState(true)
  const [editSaving,  setEditSaving]  = useState(false)

  const fetchUsers = useCallback(async () => {
    setLoading(true)
    const { data, error } = await supabase
      .from('profiles')
      .select('id, nome, email, role, ativo, created_at')
      .order('created_at')
    if (error) toast.error('Erro ao carregar usuários: ' + error.message)
    else setUsers((data as UserRow[]) ?? [])
    setLoading(false)
  }, [])

  useEffect(() => { fetchUsers() }, [fetchUsers])

  // ── Convidar (cria auth user + profile) ──────────────────────────────────
  async function handleInvite() {
    if (!inviteEmail.trim()) { toast.error('E-mail obrigatório'); return }
    if (!invitePwd || invitePwd.length < 6) { toast.error('Senha mínimo 6 caracteres'); return }
    setSaving(true)

    // ── Cria o usuário via signUp (sem Admin API — funciona no frontend) ────
    const nome = inviteNome.trim() || inviteEmail.split('@')[0]
    const { data: signData, error: signErr } = await supabase.auth.signUp({
      email: inviteEmail.trim(),
      password: invitePwd,
      options: {
        data: { nome },
        // emailRedirectTo não é necessário para fluxo interno
      },
    })

    if (signErr) {
      toast.error('Erro ao criar usuário: ' + signErr.message)
      setSaving(false)
      return
    }

    const uid = signData.user?.id
    if (!uid) {
      toast.error('Erro: ID do usuário não retornado')
      setSaving(false)
      return
    }

    // ── Cria o perfil com a role escolhida ──────────────────────────────────
    const { error: profErr } = await supabase.from('profiles').upsert({
      id: uid,
      nome,
      email: inviteEmail.trim(),
      role: inviteRole,
      ativo: true,
    })

    setSaving(false)
    if (profErr) {
      toast.error('Usuário criado mas erro no perfil: ' + profErr.message)
      return
    }

    toast.success(`Usuário ${nome} criado com sucesso!`)
    setInviteOpen(false)
    setInviteEmail(''); setInviteNome(''); setInvitePwd(''); setInviteRole('rh')
    fetchUsers()
  }

  // ── Editar role/nome/ativo ────────────────────────────────────────────────
  async function handleEditSave() {
    if (!editUser) return
    setEditSaving(true)
    const { error } = await supabase.from('profiles').update({
      nome: editNome, role: editRole, ativo: editAtivo,
    }).eq('id', editUser.id)
    setEditSaving(false)
    if (error) { toast.error(traduzirErro(error.message)); return }
    toast.success('Usuário atualizado!')
    setEditUser(null)
    fetchUsers()
  }

  function openEdit(u: UserRow) {
    setEditUser(u)
    setEditRole(u.role)
    setEditNome(u.nome)
    setEditAtivo(u.ativo)
  }

  if (!isAdmin) {
    return (
      <div style={{ padding: 40, textAlign: 'center' }}>
        <ShieldX size={48} color="#dc2626" style={{ margin: '0 auto 12px' }} />
        <p style={{ fontSize: 16, fontWeight: 600 }}>Acesso restrito</p>
        <p style={{ color: '#6b7280', fontSize: 13 }}>Apenas administradores podem gerenciar usuários.</p>
      </div>
    )
  }

  return (
    <div className="page-root">
      <PageHeader
        title="Usuários"
        subtitle="Gerencie quem acessa o sistema e quais permissões cada um tem"
        action={
          <Button onClick={() => setInviteOpen(true)}>
            <UserPlus size={14} style={{ marginRight: 6 }} /> Novo Usuário
          </Button>
        }
      />

      {/* Cards de permissões por role */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 12 }}>
        {(Object.entries(ROLE_PERMISSIONS) as [Role, typeof ROLE_PERMISSIONS[Role]][]).map(([role, meta]) => (
          <div key={role} style={{ borderRadius: 10, border: '1px solid var(--border)', padding: '14px 16px', background: 'var(--card)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
              <ShieldCheck size={16} color={meta.color} />
              <span style={{ fontWeight: 700, fontSize: 13, color: meta.color }}>{meta.label}</span>
            </div>
            {ROLE_DESCRIPTIONS[role].map((d, i) => (
              <div key={i} style={{ fontSize: 11, color: '#64748b', display: 'flex', alignItems: 'center', gap: 6, marginBottom: 3 }}>
                <span style={{ color: meta.color }}>•</span> {d}
              </div>
            ))}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 4, marginTop: 10, paddingTop: 10, borderTop: '1px solid var(--border)' }}>
              {[
                { label: 'Criar',   ok: meta.canCreate },
                { label: 'Editar',  ok: meta.canEdit },
                { label: 'Excluir', ok: meta.canDelete },
                { label: 'Financ.', ok: meta.canViewFinanceiro },
              ].map(({ label, ok }) => (
                <div key={label} style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 10, color: '#64748b' }}>
                  <PermCell ok={ok} /> {label}
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>

      {/* Tabela de usuários */}
      {loading ? (
        <div style={{ textAlign: 'center', color: '#94a3b8', padding: 40 }}>Carregando…</div>
      ) : (
        <div style={{ borderRadius: 10, border: '1px solid var(--border)', overflow: 'hidden' }}>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Usuário</TableHead>
                <TableHead>E-mail</TableHead>
                <TableHead>Nível</TableHead>
                <TableHead style={{ textAlign: 'center' }}>Criar</TableHead>
                <TableHead style={{ textAlign: 'center' }}>Editar</TableHead>
                <TableHead style={{ textAlign: 'center' }}>Excluir</TableHead>
                <TableHead style={{ textAlign: 'center' }}>Financ.</TableHead>
                <TableHead style={{ textAlign: 'center' }}>Status</TableHead>
                <TableHead style={{ textAlign: 'right' }}>Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {users.map(u => {
                const perm = ROLE_PERMISSIONS[u.role]
                const isMe = u.id === myProfile?.id
                return (
                  <TableRow key={u.id} style={{ opacity: u.ativo ? 1 : 0.5 }}>
                    <TableCell>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <div style={{
                          width: 32, height: 32, borderRadius: '50%', flexShrink: 0,
                          background: perm.bg, color: perm.color,
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                          fontSize: 11, fontWeight: 700,
                        }}>
                          {u.nome.slice(0, 2).toUpperCase()}
                        </div>
                        <div>
                          <div style={{ fontWeight: 600, fontSize: 13 }}>{u.nome}</div>
                          {isMe && <div style={{ fontSize: 10, color: '#6366f1', fontWeight: 600 }}>você</div>}
                        </div>
                      </div>
                    </TableCell>
                    <TableCell style={{ fontSize: 12, color: '#64748b' }}>{u.email}</TableCell>
                    <TableCell><RoleBadge role={u.role} /></TableCell>
                    <TableCell style={{ textAlign: 'center' }}><PermCell ok={perm.canCreate} /></TableCell>
                    <TableCell style={{ textAlign: 'center' }}><PermCell ok={perm.canEdit} /></TableCell>
                    <TableCell style={{ textAlign: 'center' }}><PermCell ok={perm.canDelete} /></TableCell>
                    <TableCell style={{ textAlign: 'center' }}><PermCell ok={perm.canViewFinanceiro} /></TableCell>
                    <TableCell style={{ textAlign: 'center' }}>
                      {u.ativo
                        ? <span style={{ background: '#f0fdf4', color: '#16a34a', padding: '2px 8px', borderRadius: 6, fontSize: 11, fontWeight: 600 }}>Ativo</span>
                        : <span style={{ background: '#fef2f2', color: '#dc2626', padding: '2px 8px', borderRadius: 6, fontSize: 11, fontWeight: 600 }}>Inativo</span>}
                    </TableCell>
                    <TableCell style={{ textAlign: 'right' }}>
                      <Button variant="outline" size="sm" onClick={() => openEdit(u)}>
                        <Pencil size={13} />
                      </Button>
                    </TableCell>
                  </TableRow>
                )
              })}
              {users.length === 0 && (
                <TableRow>
                  <TableCell colSpan={9} style={{ textAlign: 'center', color: '#94a3b8', padding: 32 }}>
                    Nenhum usuário cadastrado. Execute o SQL e recarregue.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
      )}

      {/* Modal: Novo usuário */}
      <Dialog open={inviteOpen} onOpenChange={setInviteOpen}>
        <DialogContent style={{ maxWidth: 480 }}
          onPointerDownOutside={e => e.preventDefault()} onEscapeKeyDown={e => e.preventDefault()}>
          <DialogHeader><DialogTitle>Novo Usuário</DialogTitle></DialogHeader>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14, padding: '8px 0' }}>
            {/* Aviso sobre confirmação de e-mail */}
            <div style={{
              background: '#fffbeb', border: '1px solid #fcd34d', borderRadius: 7,
              padding: '8px 12px', fontSize: 12, color: '#92400e', display: 'flex', gap: 8, alignItems: 'flex-start',
            }}>
              <span style={{ fontSize: 15 }}>💡</span>
              <span>
                O usuário receberá um e-mail de confirmação do Supabase. Enquanto não confirmar,
                o login ficará disponível somente se a confirmação de e-mail estiver desativada
                nas configurações do projeto.
              </span>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              <Label>Nome</Label>
              <Input value={inviteNome} onChange={e => setInviteNome(e.target.value)} placeholder="Nome do usuário" />
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              <Label>E-mail *</Label>
              <Input type="email" value={inviteEmail} onChange={e => setInviteEmail(e.target.value)} placeholder="usuario@empresa.com" />
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              <Label>Senha temporária *</Label>
              <Input type="password" value={invitePwd} onChange={e => setInvitePwd(e.target.value)} placeholder="Mínimo 6 caracteres" />
              <span style={{ fontSize: 11, color: '#94a3b8' }}>O usuário pode alterar a senha após o primeiro acesso.</span>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              <Label>Nível de acesso *</Label>
              <Select value={inviteRole} onValueChange={v => setInviteRole(v as Role)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {ROLES.map(r => (
                    <SelectItem key={r.value} value={r.value}>
                      <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <span style={{ padding: '1px 8px', borderRadius: 8, fontSize: 10, fontWeight: 700, background: ROLE_PERMISSIONS[r.value].bg, color: ROLE_PERMISSIONS[r.value].color }}>
                          {r.label}
                        </span>
                        <span style={{ fontSize: 12, color: '#64748b' }}>{ROLE_DESCRIPTIONS[r.value][0]}</span>
                      </span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {/* Info do role selecionado */}
              <div style={{ padding: '8px 12px', borderRadius: 8, background: ROLE_PERMISSIONS[inviteRole].bg, marginTop: 4 }}>
                {ROLE_DESCRIPTIONS[inviteRole].map((d, i) => (
                  <div key={i} style={{ fontSize: 11, color: ROLE_PERMISSIONS[inviteRole].color, marginBottom: 2 }}>• {d}</div>
                ))}
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setInviteOpen(false)}>Cancelar</Button>
            <Button onClick={handleInvite} disabled={saving}>{saving ? 'Criando…' : 'Criar Usuário'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Modal: Editar role */}
      <Dialog open={!!editUser} onOpenChange={o => { if (!o) setEditUser(null) }}>
        <DialogContent style={{ maxWidth: 420 }}
          onPointerDownOutside={e => e.preventDefault()} onEscapeKeyDown={e => e.preventDefault()}>
          <DialogHeader><DialogTitle>Editar Usuário</DialogTitle></DialogHeader>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14, padding: '8px 0' }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              <Label>Nome</Label>
              <Input value={editNome} onChange={e => setEditNome(e.target.value)} />
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              <Label>Nível de acesso</Label>
              <Select value={editRole} onValueChange={v => setEditRole(v as Role)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {ROLES.map(r => <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>)}
                </SelectContent>
              </Select>
              <div style={{ padding: '8px 12px', borderRadius: 8, background: ROLE_PERMISSIONS[editRole].bg, marginTop: 4 }}>
                {ROLE_DESCRIPTIONS[editRole].map((d, i) => (
                  <div key={i} style={{ fontSize: 11, color: ROLE_PERMISSIONS[editRole].color, marginBottom: 2 }}>• {d}</div>
                ))}
              </div>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <input type="checkbox" id="editAtivo" checked={editAtivo} onChange={e => setEditAtivo(e.target.checked)} />
              <label htmlFor="editAtivo" style={{ fontSize: 13, cursor: 'pointer' }}>Usuário ativo</label>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditUser(null)}>Cancelar</Button>
            <Button onClick={handleEditSave} disabled={editSaving}>{editSaving ? 'Salvando…' : 'Salvar'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
