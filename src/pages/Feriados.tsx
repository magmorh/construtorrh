import React, { useEffect, useState, useCallback } from 'react'
import { toast } from 'sonner'
import { Plus, Pencil, Trash2, Calendar, Search } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { PageHeader, LoadingSkeleton, EmptyState } from '@/components/Shared'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog'
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table'
import { useProfile } from '@/hooks/useProfile'
import { traduzirErro } from '@/lib/erros'

interface Feriado {
  id: string
  data: string
  nome: string
  tipo: 'nacional' | 'estadual' | 'municipal' | 'facultativo'
  recorrente: boolean
  ativo: boolean
}

const TIPO_LABEL: Record<string, { label: string; cor: string; bg: string }> = {
  nacional:    { label: 'Nacional',    cor: '#15803d', bg: 'rgba(22,163,74,0.1)' },
  estadual:    { label: 'Estadual',    cor: '#2563eb', bg: 'rgba(37,99,235,0.1)' },
  municipal:   { label: 'Municipal',   cor: '#7c3aed', bg: 'rgba(124,58,237,0.1)' },
  facultativo: { label: 'Facultativo', cor: '#b45309', bg: 'rgba(180,83,9,0.1)' },
}

const EMPTY: Omit<Feriado, 'id'> = {
  data: '', nome: '', tipo: 'nacional', recorrente: true, ativo: true,
}

const DOW = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb']

function fmtData(iso: string) {
  if (!iso) return '—'
  const [y, m, d] = iso.split('-')
  const dow = new Date(iso + 'T12:00:00').getDay()
  return `${d}/${m}/${y} (${DOW[dow]})`
}

export default function Feriados() {
  const { permissions: { canCreate, canEdit, canDelete } } = useProfile()

  const [rows, setRows]       = useState<Feriado[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch]   = useState('')
  const [anoFiltro, setAnoFiltro] = useState(String(new Date().getFullYear()))

  const [modal, setModal]   = useState(false)
  const [editId, setEditId] = useState<string | null>(null)
  const [form, setForm]     = useState<Omit<Feriado, 'id'>>(EMPTY)
  const [saving, setSaving] = useState(false)

  const [deleteId, setDeleteId]   = useState<string | null>(null)
  const [deleting, setDeleting]   = useState(false)

  // ── Fetch ──────────────────────────────────────────────────────────────────
  const fetchData = useCallback(async () => {
    setLoading(true)
    const { data } = await supabase
      .from('feriados')
      .select('*')
      .gte('data', `${anoFiltro}-01-01`)
      .lte('data', `${anoFiltro}-12-31`)
      .order('data')
    setRows((data ?? []) as Feriado[])
    setLoading(false)
  }, [anoFiltro])

  useEffect(() => { fetchData() }, [fetchData])

  // ── Helpers ────────────────────────────────────────────────────────────────
  function openNew() {
    setEditId(null)
    setForm({ ...EMPTY, data: `${anoFiltro}-` })
    setModal(true)
  }

  function openEdit(f: Feriado) {
    setEditId(f.id)
    setForm({ data: f.data, nome: f.nome, tipo: f.tipo, recorrente: f.recorrente, ativo: f.ativo })
    setModal(true)
  }

  // ── Salvar ─────────────────────────────────────────────────────────────────
  async function handleSave() {
    if (!form.data) { toast.error('Informe a data'); return }
    if (!form.nome.trim()) { toast.error('Informe o nome do feriado'); return }
    setSaving(true)
    const { error } = editId
      ? await supabase.from('feriados').update(form).eq('id', editId)
      : await supabase.from('feriados').insert(form)
    setSaving(false)
    if (error) { toast.error(traduzirErro(error.message)); return }
    toast.success(editId ? 'Feriado atualizado!' : 'Feriado criado!')
    setModal(false)
    fetchData()
  }

  // ── Excluir ────────────────────────────────────────────────────────────────
  async function handleDelete() {
    if (!deleteId) return
    setDeleting(true)
    const { error } = await supabase.from('feriados').delete().eq('id', deleteId)
    setDeleting(false)
    setDeleteId(null)
    if (error) { toast.error(traduzirErro(error.message)); return }
    toast.success('Feriado excluído!')
    fetchData()
  }

  // ── Filtro ─────────────────────────────────────────────────────────────────
  const filtered = rows.filter(f =>
    !search ||
    f.nome.toLowerCase().includes(search.toLowerCase()) ||
    f.data.includes(search)
  )

  const anos = ['2024', '2025', '2026', '2027']

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div className="page-root">
      <PageHeader
        title="Feriados"
        subtitle={`${rows.length} feriado${rows.length !== 1 ? 's' : ''} em ${anoFiltro}`}
        action={canCreate ? (
          <Button onClick={openNew} size="sm" className="gap-1">
            <Plus size={14} /> Novo Feriado
          </Button>
        ) : undefined}
      />

      {/* Filtros */}
      <div style={{ display: 'flex', gap: 10, marginBottom: 16, flexWrap: 'wrap' }}>
        <div style={{ position: 'relative', flex: 1, minWidth: 220 }}>
          <Search size={14} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--muted-foreground)', pointerEvents: 'none' }} />
          <Input style={{ paddingLeft: 32 }} placeholder="Buscar por nome ou data…" value={search} onChange={e => setSearch(e.target.value)} />
        </div>
        <Select value={anoFiltro} onValueChange={setAnoFiltro}>
          <SelectTrigger style={{ width: 120 }}><SelectValue /></SelectTrigger>
          <SelectContent>
            {anos.map(a => <SelectItem key={a} value={a}>{a}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      {loading ? <LoadingSkeleton rows={6} /> : filtered.length === 0 ? (
        <EmptyState icon={<Calendar size={28} />} title="Nenhum feriado" description="Clique em '+ Novo Feriado' para cadastrar." />
      ) : (
        <div style={{ border: '1px solid var(--border)', borderRadius: 10, overflow: 'hidden' }}>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead style={{ width: 150 }}>Data</TableHead>
                <TableHead>Nome</TableHead>
                <TableHead style={{ width: 120, textAlign: 'center' }}>Tipo</TableHead>
                <TableHead style={{ width: 100, textAlign: 'center' }}>Recorrente</TableHead>
                <TableHead style={{ width: 80, textAlign: 'center' }}>Status</TableHead>
                <TableHead style={{ width: 80, textAlign: 'right' }}>Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((f, idx) => {
                const t = TIPO_LABEL[f.tipo] ?? TIPO_LABEL.nacional
                const dow = new Date(f.data + 'T12:00:00').getDay()
                const isDomingo = dow === 0
                return (
                  <TableRow key={f.id} style={{ background: idx % 2 === 0 ? 'transparent' : 'var(--muted)/20' }}>
                    <TableCell>
                      <span style={{ fontFamily: 'monospace', fontWeight: 600, fontSize: 13 }}>{fmtData(f.data)}</span>
                      {isDomingo && <span style={{ marginLeft: 6, fontSize: 10, color: '#9ca3af' }}>Dom</span>}
                    </TableCell>
                    <TableCell style={{ fontWeight: 500 }}>{f.nome}</TableCell>
                    <TableCell style={{ textAlign: 'center' }}>
                      <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 999, background: t.bg, color: t.cor, fontWeight: 600 }}>
                        {t.label}
                      </span>
                    </TableCell>
                    <TableCell style={{ textAlign: 'center' }}>
                      <span style={{
                        fontSize: 11, padding: '2px 8px', borderRadius: 999, fontWeight: 600,
                        background: f.recorrente ? 'rgba(37,99,235,0.1)' : 'var(--muted)',
                        color: f.recorrente ? '#2563eb' : 'var(--muted-foreground)',
                      }}>
                        {f.recorrente ? '↻ Todo ano' : 'Único'}
                      </span>
                    </TableCell>
                    <TableCell style={{ textAlign: 'center' }}>
                      <span style={{
                        fontSize: 11, padding: '2px 8px', borderRadius: 999, fontWeight: 600,
                        background: f.ativo ? 'rgba(22,163,74,0.1)' : 'rgba(220,38,38,0.08)',
                        color: f.ativo ? '#15803d' : '#dc2626',
                      }}>
                        {f.ativo ? 'Ativo' : 'Inativo'}
                      </span>
                    </TableCell>
                    <TableCell style={{ textAlign: 'right' }}>
                      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 2 }}>
                        {canEdit && (
                          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => openEdit(f)}>
                            <Pencil size={14} />
                          </Button>
                        )}
                        {canDelete && (
                          <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive hover:text-destructive" onClick={() => setDeleteId(f.id)}>
                            <Trash2 size={14} />
                          </Button>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                )
              })}
            </TableBody>
          </Table>
        </div>
      )}

      {/* ── Modal Novo / Editar ── */}
      <Dialog open={modal} onOpenChange={setModal}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Calendar size={16} style={{ color: 'var(--primary)' }} />
              {editId ? 'Editar Feriado' : 'Novo Feriado'}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="flex flex-col gap-1">
              <Label className="text-xs text-muted-foreground">Data *</Label>
              <Input type="date" value={form.data} onChange={e => setForm(p => ({ ...p, data: e.target.value }))} />
            </div>
            <div className="flex flex-col gap-1">
              <Label className="text-xs text-muted-foreground">Nome do Feriado *</Label>
              <Input value={form.nome} onChange={e => setForm(p => ({ ...p, nome: e.target.value }))} placeholder="Ex.: Dia do Trabalhador" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="flex flex-col gap-1">
                <Label className="text-xs text-muted-foreground">Tipo</Label>
                <Select value={form.tipo} onValueChange={v => setForm(p => ({ ...p, tipo: v as Feriado['tipo'] }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="nacional">Nacional</SelectItem>
                    <SelectItem value="estadual">Estadual</SelectItem>
                    <SelectItem value="municipal">Municipal</SelectItem>
                    <SelectItem value="facultativo">Facultativo</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="flex flex-col gap-1">
                <Label className="text-xs text-muted-foreground">Recorrência</Label>
                <Select value={String(form.recorrente)} onValueChange={v => setForm(p => ({ ...p, recorrente: v === 'true' }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="true">↻ Todo ano</SelectItem>
                    <SelectItem value="false">Único (este ano)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => setForm(p => ({ ...p, ativo: !p.ativo }))}
                className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${form.ativo ? 'bg-primary' : 'bg-muted-foreground/30'}`}
              >
                <span className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${form.ativo ? 'translate-x-6' : 'translate-x-1'}`} />
              </button>
              <Label className="text-sm cursor-pointer" onClick={() => setForm(p => ({ ...p, ativo: !p.ativo }))}>
                {form.ativo ? 'Ativo' : 'Inativo'}
              </Label>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setModal(false)}>Cancelar</Button>
            <Button disabled={saving} onClick={handleSave}>{saving ? 'Salvando…' : editId ? 'Salvar' : 'Criar'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── AlertDialog Excluir ── */}
      <AlertDialog open={!!deleteId} onOpenChange={open => !open && setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir feriado?</AlertDialogTitle>
            <AlertDialogDescription>
              O feriado <strong>"{rows.find(r => r.id === deleteId)?.nome}"</strong> será removido. Esta ação afeta o cálculo de DSR do ponto.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Cancelar</AlertDialogCancel>
            <AlertDialogAction disabled={deleting} onClick={handleDelete} style={{ background: '#dc2626', color: '#fff' }}>
              {deleting ? 'Excluindo…' : 'Excluir'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
