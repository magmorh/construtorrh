import React, { useEffect, useState, useCallback } from 'react'
import { toast } from 'sonner'
import { Plus, Pencil, Trash2, BookOpen, ChevronDown, ChevronRight, Search, Tag, Package } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { formatCurrency } from '@/lib/utils'
import { PageHeader, EmptyState, LoadingSkeleton } from '@/components/Shared'
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

// ─── Tipos ────────────────────────────────────────────────────────────────────

interface PlaybookItem {
  id: string
  obra_id: string
  descricao: string
  unidade: string
  preco_unitario: number
  categoria: string | null
  ativo: boolean
}

interface ObraComItens {
  id: string
  nome: string
  codigo: string | null
  itens: PlaybookItem[]
  aberta: boolean
}

const UNIDADES = ['m²', 'm³', 'm', 'un', 'pç', 'kg', 't', 'h', 'verba', 'outro']
const CATEGORIAS = [
  'Alvenaria', 'Argamassa', 'Concretagem', 'Revestimento',
  'Pintura', 'Instalações', 'Estrutura', 'Cobertura', 'Esquadrias', 'Outros',
]

const ITEM_EMPTY = (): Omit<PlaybookItem, 'id' | 'obra_id'> => ({
  descricao: '', unidade: 'm²', preco_unitario: 0, categoria: null, ativo: true,
})

// ─── Componente ───────────────────────────────────────────────────────────────

export default function Playbooks() {
  const { permissions: { canCreate, canEdit, canDelete } } = useProfile()

  const [obras, setObras]       = useState<ObraComItens[]>([])
  const [loading, setLoading]   = useState(true)
  const [busca, setBusca]       = useState('')

  const [modal, setModal]             = useState(false)
  const [editItem, setEditItem]       = useState<PlaybookItem | null>(null)
  const [obraIdModal, setObraIdModal] = useState('')
  const [form, setForm]               = useState(ITEM_EMPTY())
  const [saving, setSaving]           = useState(false)
  const [deleteTarget, setDeleteTarget] = useState<PlaybookItem | null>(null)

  // ── Fetch ──────────────────────────────────────────────────────────────────
  const fetchData = useCallback(async () => {
    setLoading(true)
    const [{ data: obrasRaw }, { data: itensRaw }] = await Promise.all([
      supabase.from('obras').select('id, nome, codigo').order('nome'),
      supabase.from('playbook_itens').select('*').order('categoria').order('descricao'),
    ])
    const mapaItens: Record<string, PlaybookItem[]> = {}
    ;(itensRaw ?? []).forEach((i: any) => {
      if (!mapaItens[i.obra_id]) mapaItens[i.obra_id] = []
      mapaItens[i.obra_id].push(i as PlaybookItem)
    })
    setObras((obrasRaw ?? []).map((o: any) => ({
      id: o.id, nome: o.nome, codigo: o.codigo ?? null,
      itens: mapaItens[o.id] ?? [],
      aberta: (mapaItens[o.id] ?? []).length > 0,
    })))
    setLoading(false)
  }, [])

  useEffect(() => { fetchData() }, [fetchData])

  // ── Modal helpers ──────────────────────────────────────────────────────────
  function openNew(obraId: string) {
    setEditItem(null)
    setObraIdModal(obraId)
    setForm(ITEM_EMPTY())
    setModal(true)
  }

  function openEdit(item: PlaybookItem) {
    setEditItem(item)
    setObraIdModal(item.obra_id)
    setForm({
      descricao: item.descricao, unidade: item.unidade,
      preco_unitario: item.preco_unitario,
      categoria: item.categoria, ativo: item.ativo,
    })
    setModal(true)
  }

  function setF<K extends keyof typeof form>(k: K, v: (typeof form)[K]) {
    setForm(p => ({ ...p, [k]: v }))
  }

  // ── Salvar ─────────────────────────────────────────────────────────────────
  async function handleSave() {
    if (!form.descricao.trim()) { toast.error('Informe a descrição'); return }
    if (form.preco_unitario <= 0) { toast.error('Informe o preço unitário'); return }
    setSaving(true)
    const payload = { obra_id: obraIdModal, ...form }
    const { error } = editItem
      ? await supabase.from('playbook_itens').update(payload).eq('id', editItem.id)
      : await supabase.from('playbook_itens').insert(payload)
    setSaving(false)
    if (error) { toast.error('Erro: ' + error.message); return }
    toast.success(editItem ? 'Item atualizado!' : 'Item criado!')
    setModal(false)
    fetchData()
  }

  // ── Excluir ────────────────────────────────────────────────────────────────
  async function handleDelete() {
    if (!deleteTarget) return
    const { error } = await supabase.from('playbook_itens').delete().eq('id', deleteTarget.id)
    if (error) { toast.error('Erro: ' + error.message); return }
    toast.success('Item excluído!')
    setDeleteTarget(null)
    fetchData()
  }

  // ── Toggle obra aberta ─────────────────────────────────────────────────────
  function toggleObra(id: string) {
    setObras(prev => prev.map(o => o.id === id ? { ...o, aberta: !o.aberta } : o))
  }

  // ── Filtro ─────────────────────────────────────────────────────────────────
  const obrasFiltradas = obras.filter(o => {
    const q = busca.toLowerCase()
    if (!q) return true
    return o.nome.toLowerCase().includes(q) ||
      (o.codigo ?? '').toLowerCase().includes(q) ||
      o.itens.some(i => i.descricao.toLowerCase().includes(q) || (i.categoria ?? '').toLowerCase().includes(q))
  })

  const totalItens = obras.reduce((s, o) => s + o.itens.length, 0)

  // ─────────────────────────────────────────────────────────────────────────
  return (
    <div className="p-6">
      <PageHeader
        title="Playbooks de Produção"
        subtitle={`${totalItens} serviço${totalItens !== 1 ? 's' : ''} cadastrado${totalItens !== 1 ? 's' : ''} em ${obras.length} obra${obras.length !== 1 ? 's' : ''}`}
        action={undefined}
      />

      {/* ── Busca ── */}
      <div className="flex flex-wrap gap-3 mb-6">
        <div className="relative flex-1 min-w-[240px]">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input
            className="pl-9"
            placeholder="Buscar por obra, serviço ou categoria…"
            value={busca}
            onChange={e => setBusca(e.target.value)}
          />
        </div>
      </div>

      {/* ── Conteúdo ── */}
      {loading ? (
        <LoadingSkeleton rows={4} />
      ) : obrasFiltradas.length === 0 ? (
        <EmptyState
          icon={<BookOpen size={28} />}
          title="Nenhuma obra encontrada"
          description="Cadastre obras primeiro e depois configure os serviços de produção de cada uma."
        />
      ) : (
        <div className="space-y-4">
          {obrasFiltradas.map(obra => {
            const totalObra = obra.itens.reduce((s, i) => s + i.preco_unitario, 0)
            return (
              <div
                key={obra.id}
                style={{ border: '1px solid var(--border)', borderRadius: 10, overflow: 'hidden' }}
              >
                {/* ── Cabeçalho da obra ── */}
                <div
                  className="flex items-center gap-3 px-4 py-3 cursor-pointer hover:bg-muted/50 transition-colors"
                  style={{ background: 'var(--muted)' }}
                  onClick={() => toggleObra(obra.id)}
                >
                  {obra.aberta
                    ? <ChevronDown size={16} className="text-muted-foreground flex-shrink-0" />
                    : <ChevronRight size={16} className="text-muted-foreground flex-shrink-0" />
                  }
                  <div
                    className="w-2 h-8 rounded-full flex-shrink-0"
                    style={{ background: obra.itens.length > 0 ? '#16a34a' : '#e2e8f0' }}
                  />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-sm">{obra.nome}</span>
                      {obra.codigo && (
                        <span className="text-xs font-mono text-muted-foreground bg-background px-1.5 py-0.5 rounded border border-border">
                          #{obra.codigo}
                        </span>
                      )}
                    </div>
                    <div className="text-xs text-muted-foreground mt-0.5">
                      {obra.itens.length === 0
                        ? 'Nenhum serviço cadastrado — clique para adicionar'
                        : `${obra.itens.length} serviço${obra.itens.length !== 1 ? 's' : ''}`}
                    </div>
                  </div>

                  {/* Stats rápidas */}
                  {obra.itens.length > 0 && (
                    <div className="flex items-center gap-4 mr-2">
                      {[...new Set(obra.itens.map(i => i.categoria).filter(Boolean))].slice(0, 3).map(cat => (
                        <span
                          key={cat}
                          className="hidden sm:inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full font-medium"
                          style={{ background: '#dbeafe', color: '#1d4ed8' }}
                        >
                          <Tag size={10} /> {cat}
                        </span>
                      ))}
                    </div>
                  )}

                  {/* Ação: adicionar item */}
                  {canCreate && (
                    <Button
                      size="sm"
                      variant="outline"
                      className="gap-1.5 h-8 text-xs"
                      onClick={e => { e.stopPropagation(); openNew(obra.id) }}
                    >
                      <Plus size={13} /> Serviço
                    </Button>
                  )}
                </div>

                {/* ── Tabela de itens ── */}
                {obra.aberta && (
                  obra.itens.length === 0 ? (
                    <div className="px-6 py-8 text-center">
                      <div className="flex flex-col items-center gap-2 text-muted-foreground">
                        <Package size={32} className="opacity-30" />
                        <p className="text-sm">Nenhum serviço cadastrado para esta obra</p>
                        {canCreate && (
                          <Button size="sm" variant="outline" className="gap-1.5 mt-1" onClick={() => openNew(obra.id)}>
                            <Plus size={13} /> Adicionar serviço
                          </Button>
                        )}
                      </div>
                    </div>
                  ) : (
                    <div style={{ borderTop: '1px solid var(--border)' }}>
                      <Table>
                        <TableHeader>
                          <TableRow style={{ background: 'var(--muted)' }}>
                            {['Descrição', 'Categoria', 'Unidade', 'Preço Unitário', 'Status', ''].map((h, i) => (
                              <TableHead
                                key={i}
                                style={{
                                  fontWeight: 700, fontSize: 11,
                                  textTransform: 'uppercase', letterSpacing: '0.05em',
                                  textAlign: i >= 2 ? 'center' : undefined,
                                  width: i === 5 ? 80 : undefined,
                                }}
                              >
                                {h}
                              </TableHead>
                            ))}
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {obra.itens.map(item => (
                            <TableRow key={item.id} className="hover:bg-muted/40">
                              <TableCell>
                                <div className="font-medium text-sm">{item.descricao}</div>
                              </TableCell>
                              <TableCell>
                                {item.categoria ? (
                                  <span
                                    className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full font-medium"
                                    style={{ background: '#dbeafe', color: '#1d4ed8' }}
                                  >
                                    <Tag size={10} /> {item.categoria}
                                  </span>
                                ) : (
                                  <span className="text-muted-foreground text-xs">—</span>
                                )}
                              </TableCell>
                              <TableCell style={{ textAlign: 'center' }}>
                                <span
                                  className="text-xs font-semibold px-2 py-0.5 rounded"
                                  style={{ background: 'var(--muted)', fontFamily: 'monospace' }}
                                >
                                  {item.unidade}
                                </span>
                              </TableCell>
                              <TableCell style={{ textAlign: 'center' }}>
                                <span className="font-bold text-sm" style={{ color: '#15803d' }}>
                                  {formatCurrency(item.preco_unitario)}
                                </span>
                              </TableCell>
                              <TableCell style={{ textAlign: 'center' }}>
                                <span
                                  className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium"
                                  style={item.ativo
                                    ? { background: '#dcfce7', color: '#15803d' }
                                    : { background: '#f1f5f9', color: '#64748b' }}
                                >
                                  {item.ativo ? 'Ativo' : 'Inativo'}
                                </span>
                              </TableCell>
                              <TableCell>
                                <div className="flex gap-1 justify-end">
                                  {canEdit && (
                                    <Button
                                      variant="ghost" size="icon"
                                      style={{ width: 30, height: 30 }}
                                      onClick={() => openEdit(item)}
                                      title="Editar"
                                    >
                                      <Pencil size={13} />
                                    </Button>
                                  )}
                                  {canDelete && (
                                    <Button
                                      variant="ghost" size="icon"
                                      style={{ width: 30, height: 30, color: 'var(--destructive)' }}
                                      onClick={() => setDeleteTarget(item)}
                                      title="Excluir"
                                    >
                                      <Trash2 size={13} />
                                    </Button>
                                  )}
                                </div>
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>

                      {/* Rodapé da obra */}
                      <div
                        className="flex items-center justify-between px-4 py-2 text-xs text-muted-foreground"
                        style={{ borderTop: '1px solid var(--border)', background: 'var(--muted)' }}
                      >
                        <span>{obra.itens.length} serviço{obra.itens.length !== 1 ? 's' : ''}</span>
                        <span className="font-semibold" style={{ color: '#15803d' }}>
                          Ticket médio: {formatCurrency(totalObra / obra.itens.length)}
                        </span>
                      </div>
                    </div>
                  )
                )}
              </div>
            )
          })}
        </div>
      )}

      {/* ═══ MODAL CRIAR / EDITAR ═══ */}
      <Dialog open={modal} onOpenChange={setModal}>
        <DialogContent style={{ maxWidth: 480 }} onPointerDownOutside={e => e.preventDefault()}>
          <DialogHeader>
            <DialogTitle>{editItem ? 'Editar Serviço' : 'Novo Serviço de Produção'}</DialogTitle>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <div>
              <Label>Descrição *</Label>
              <Input
                placeholder="Ex: Alvenaria de bloco cerâmico"
                value={form.descricao}
                onChange={e => setF('descricao', e.target.value)}
                className="mt-1"
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Categoria</Label>
                <Select value={form.categoria ?? 'sem_categoria'} onValueChange={v => setF('categoria', v==='sem_categoria'?null:v)}>
                  <SelectTrigger className="mt-1"><SelectValue placeholder="Selecionar…" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="sem_categoria">— Sem categoria —</SelectItem>
                    {CATEGORIAS.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Unidade *</Label>
                <Select value={form.unidade} onValueChange={v => setF('unidade', v)}>
                  <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {UNIDADES.map(u => <SelectItem key={u} value={u}>{u}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div>
              <Label>Preço Unitário (R$) *</Label>
              <Input
                type="number" min="0" step="0.01" placeholder="0,00"
                value={form.preco_unitario || ''}
                onChange={e => setF('preco_unitario', parseFloat(e.target.value) || 0)}
                className="mt-1"
              />
            </div>

            <div className="flex items-center gap-3 p-3 rounded-lg" style={{ background: 'var(--muted)' }}>
              <button
                type="button"
                onClick={() => setF('ativo', !form.ativo)}
                className="flex items-center gap-2 text-sm font-medium"
              >
                <div
                  className="w-9 h-5 rounded-full relative transition-colors"
                  style={{ background: form.ativo ? '#16a34a' : '#d1d5db' }}
                >
                  <div
                    className="absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform"
                    style={{ transform: form.ativo ? 'translateX(18px)' : 'translateX(2px)' }}
                  />
                </div>
                <span style={{ color: form.ativo ? '#15803d' : 'var(--muted-foreground)' }}>
                  {form.ativo ? 'Ativo' : 'Inativo'}
                </span>
              </button>
              <span className="text-xs text-muted-foreground">
                Itens inativos não aparecem nos lançamentos de produção
              </span>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setModal(false)}>Cancelar</Button>
            <Button onClick={handleSave} disabled={saving} className="gap-2">
              {saving ? '⏳ Salvando…' : editItem ? '✅ Atualizar' : <><Plus size={14} /> Criar Serviço</>}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ═══ CONFIRM EXCLUIR ═══ */}
      <AlertDialog open={!!deleteTarget} onOpenChange={open => !open && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir serviço?</AlertDialogTitle>
            <AlertDialogDescription>
              O serviço <strong>"{deleteTarget?.descricao}"</strong> será removido do playbook da obra.
              Lançamentos de produção já realizados não serão afetados. Esta ação não pode ser desfeita.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              style={{ background: 'var(--destructive)', color: '#fff' }}
            >
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
