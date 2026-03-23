import React, { useEffect, useState, useCallback } from 'react'
import { toast } from 'sonner'
import { Plus, Pencil, Trash2, BookOpen, Search, Tag, Building2, ChevronRight } from 'lucide-react'
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

interface Obra {
  id: string
  nome: string
  codigo: string | null
  status: string | null
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

  // dados
  const [obras, setObras]       = useState<Obra[]>([])
  const [itensMap, setItensMap] = useState<Record<string, PlaybookItem[]>>({})
  const [loading, setLoading]   = useState(true)

  // seleção
  const [obraSel, setObraSel]     = useState<Obra | null>(null)
  const [searchObra, setSearchObra] = useState('')

  // mapa item_id → tem produção vinculada
  const [itensComProd, setItensComProd] = useState<Set<string>>(new Set())

  // modal item
  const [modal, setModal]             = useState(false)
  const [editItem, setEditItem]       = useState<PlaybookItem | null>(null)
  const [form, setForm]               = useState(ITEM_EMPTY())
  const [saving, setSaving]           = useState(false)
  const [deleteTarget, setDeleteTarget] = useState<PlaybookItem | null>(null)

  // ── Fetch ──────────────────────────────────────────────────────────────────
  const fetchData = useCallback(async () => {
    setLoading(true)
    const [{ data: obrasRaw }, { data: itensRaw }, { data: prodRaw }] = await Promise.all([
      supabase.from('obras').select('id, nome, codigo, status').order('nome'),
      supabase.from('playbook_itens').select('*').order('categoria').order('descricao'),
      supabase.from('ponto_producao').select('playbook_item_id'),
    ])
    const mapa: Record<string, PlaybookItem[]> = {}
    ;(itensRaw ?? []).forEach((i: any) => {
      if (!mapa[i.obra_id]) mapa[i.obra_id] = []
      mapa[i.obra_id].push(i as PlaybookItem)
    })
    // Itens que já têm produção lançada — não podem ser excluídos
    const comProd = new Set<string>(
      (prodRaw ?? []).map((p: any) => p.playbook_item_id as string).filter(Boolean)
    )
    setObras((obrasRaw ?? []) as Obra[])
    setItensMap(mapa)
    setItensComProd(comProd)
    setLoading(false)
  }, [])

  useEffect(() => { fetchData() }, [fetchData])

  // ── Modal helpers ──────────────────────────────────────────────────────────
  function openNew() {
    if (!obraSel) return
    setEditItem(null)
    setForm(ITEM_EMPTY())
    setModal(true)
  }

  function openEdit(item: PlaybookItem) {
    setEditItem(item)
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
    if (!obraSel) return
    if (!form.descricao.trim()) { toast.error('Informe a descrição'); return }
    if (form.preco_unitario <= 0) { toast.error('Informe o preço unitário'); return }
    setSaving(true)
    const payload = { obra_id: obraSel.id, ...form }
    const { error } = editItem
      ? await supabase.from('playbook_itens').update(payload).eq('id', editItem.id)
      : await supabase.from('playbook_itens').insert(payload)
    setSaving(false)
    if (error) { toast.error('Erro: ' + error.message); return }
    toast.success(editItem ? 'Serviço atualizado!' : 'Serviço criado!')
    setModal(false)
    fetchData()
  }

  // ── Excluir ────────────────────────────────────────────────────────────────
  async function handleDelete() {
    if (!deleteTarget) return
    // Verificação server-side: produção lançada vinculada?
    const { data: prodVinc } = await supabase
      .from('ponto_producao')
      .select('id')
      .eq('playbook_item_id', deleteTarget.id)
      .limit(1)
    if ((prodVinc?.length ?? 0) > 0) {
      toast.error('Não é possível excluir: há produção lançada vinculada a este serviço.')
      setDeleteTarget(null)
      return
    }
    const { error } = await supabase.from('playbook_itens').delete().eq('id', deleteTarget.id)
    if (error) { toast.error('Erro: ' + error.message); return }
    toast.success('Serviço excluído!')
    setDeleteTarget(null)
    fetchData()
  }

  // ── Derivados ──────────────────────────────────────────────────────────────
  const obrasFiltradas = obras.filter(o => {
    const q = searchObra.toLowerCase()
    return !q || o.nome.toLowerCase().includes(q) || (o.codigo ?? '').toLowerCase().includes(q)
  })

  const itensObra    = obraSel ? (itensMap[obraSel.id] ?? []) : []
  const totalObra    = itensObra.reduce((s, i) => s + i.preco_unitario, 0)
  const totalGlobal  = Object.values(itensMap).flat().length

  // agrupar itens por categoria
  const itensPorCat = itensObra.reduce<Record<string, PlaybookItem[]>>((acc, i) => {
    const cat = i.categoria ?? 'Sem categoria'
    if (!acc[cat]) acc[cat] = []
    acc[cat].push(i)
    return acc
  }, {})

  // ─────────────────────────────────────────────────────────────────────────
  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>

      <PageHeader
        title="Playbooks de Produção"
        subtitle={`${totalGlobal} serviço${totalGlobal !== 1 ? 's' : ''} em ${obras.length} obra${obras.length !== 1 ? 's' : ''}`}
        action={undefined}
      />

      {loading ? (
        <LoadingSkeleton rows={5} />
      ) : obras.length === 0 ? (
        <EmptyState
          icon={<BookOpen size={28} />}
          title="Nenhuma obra cadastrada"
          description="Cadastre obras primeiro em Cadastros → Obras."
        />
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: '280px 1fr', gap: 16, alignItems: 'start' }}>

          {/* ══ COLUNA ESQUERDA — lista de obras ══════════════════════════════ */}
          <div style={{ border: '1px solid var(--border)', borderRadius: 10, background: 'var(--card)', overflow: 'hidden' }}>

            {/* Header + busca */}
            <div style={{ padding: '12px 14px', borderBottom: '1px solid var(--border)', background: 'var(--muted)' }}>
              <p style={{ margin: '0 0 8px', fontSize: 13, fontWeight: 600, color: 'var(--foreground)', display: 'flex', alignItems: 'center', gap: 6 }}>
                <Building2 size={13} style={{ color: 'var(--primary)' }} /> Obras
              </p>
              <div style={{ position: 'relative' }}>
                <Search size={13} style={{ position: 'absolute', left: 9, top: '50%', transform: 'translateY(-50%)', color: 'var(--muted-foreground)', pointerEvents: 'none' }} />
                <Input style={{ paddingLeft: 28, height: 30, fontSize: 12 }} placeholder="Filtrar obras…" value={searchObra} onChange={e => setSearchObra(e.target.value)} />
              </div>
            </div>

            {/* Lista */}
            <div style={{ maxHeight: 560, overflowY: 'auto' }}>
              {obrasFiltradas.length === 0 ? (
                <div style={{ padding: 20, textAlign: 'center', color: 'var(--muted-foreground)', fontSize: 13 }}>Nenhuma obra encontrada</div>
              ) : obrasFiltradas.map(obra => {
                const qtd = (itensMap[obra.id] ?? []).length
                const isSel = obraSel?.id === obra.id
                return (
                  <button
                    key={obra.id}
                    type="button"
                    onClick={() => setObraSel(obra)}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 10, width: '100%',
                      padding: '11px 14px', border: 'none', cursor: 'pointer', textAlign: 'left',
                      borderLeft: isSel ? '3px solid var(--primary)' : '3px solid transparent',
                      background: isSel ? 'rgba(37,99,235,0.06)' : 'transparent',
                      borderBottom: '1px solid var(--border)', transition: 'all 0.12s',
                    }}
                  >
                    {/* Avatar sigla */}
                    <div style={{
                      width: 34, height: 34, borderRadius: 8, flexShrink: 0, display: 'flex',
                      alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 700,
                      background: isSel ? 'var(--primary)' : 'var(--muted)',
                      color: isSel ? '#fff' : 'var(--muted-foreground)',
                    }}>
                      {obra.codigo
                        ? obra.codigo.slice(0, 3).toUpperCase()
                        : obra.nome.substring(0, 2).toUpperCase()}
                    </div>

                    {/* Nome + badge qtd */}
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <p style={{
                        margin: 0, fontSize: 13, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                        fontWeight: isSel ? 600 : 400,
                        color: isSel ? 'var(--primary)' : 'var(--foreground)',
                      }}>{obra.nome}</p>
                      <span style={{
                        display: 'inline-block', marginTop: 2, fontSize: 11, padding: '1px 6px', borderRadius: 999,
                        background: qtd > 0 ? 'rgba(22,163,74,0.12)' : 'var(--muted)',
                        color: qtd > 0 ? '#15803d' : 'var(--muted-foreground)', fontWeight: 500,
                      }}>
                        {qtd} serviço{qtd !== 1 ? 's' : ''}
                      </span>
                    </div>

                    <ChevronRight size={13} style={{ color: isSel ? 'var(--primary)' : 'var(--border)', flexShrink: 0 }} />
                  </button>
                )
              })}
            </div>
          </div>

          {/* ══ COLUNA DIREITA — serviços da obra ════════════════════════════ */}
          {!obraSel ? (
            <div style={{
              display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
              padding: 60, border: '2px dashed var(--border)', borderRadius: 10,
              color: 'var(--muted-foreground)', gap: 10,
            }}>
              <BookOpen size={38} style={{ opacity: 0.25 }} />
              <p style={{ margin: 0, fontSize: 15, fontWeight: 500 }}>Nenhuma obra selecionada</p>
              <p style={{ margin: 0, fontSize: 13 }}>← Selecione uma obra para ver os serviços</p>
            </div>
          ) : (
            <div style={{ border: '1px solid var(--border)', borderRadius: 10, background: 'var(--card)', overflow: 'hidden' }}>

              {/* Header da obra selecionada */}
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 16px', background: 'var(--muted)', borderBottom: '1px solid var(--border)' }}>
                <div>
                  <div style={{ fontWeight: 700, fontSize: 15, color: 'var(--foreground)' }}>
                    {obraSel.nome}
                    {obraSel.codigo && (
                      <span style={{ marginLeft: 8, fontSize: 11, padding: '2px 7px', borderRadius: 999, background: 'rgba(37,99,235,0.1)', color: 'var(--primary)', fontFamily: 'monospace' }}>
                        {obraSel.codigo}
                      </span>
                    )}
                  </div>
                  <div style={{ fontSize: 12, color: 'var(--muted-foreground)', marginTop: 2 }}>
                    {itensObra.length} serviço{itensObra.length !== 1 ? 's' : ''}
                    {totalObra > 0 && <span style={{ marginLeft: 10, color: '#b45309' }}>· Ticket médio: {formatCurrency(totalObra / itensObra.length)}/serviço</span>}
                  </div>
                </div>
                {canCreate && (
                  <Button size="sm" onClick={openNew} style={{ gap: 6 }}>
                    <Plus size={14} /> Novo Serviço
                  </Button>
                )}
              </div>

              {/* Tabela de serviços vazia */}
              {itensObra.length === 0 ? (
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '48px 24px', gap: 10, color: 'var(--muted-foreground)' }}>
                  <Tag size={32} style={{ opacity: 0.2 }} />
                  <p style={{ margin: 0, fontWeight: 500 }}>Nenhum serviço cadastrado</p>
                  <p style={{ margin: 0, fontSize: 13 }}>Clique em "Novo Serviço" para começar</p>
                </div>
              ) : (
                <>
                  {/* Serviços agrupados por categoria */}
                  {Object.entries(itensPorCat).sort(([a],[b])=>a.localeCompare(b)).map(([cat, itens]) => (
                    <div key={cat}>
                      {/* Separador de categoria */}
                      <div style={{
                        display: 'flex', alignItems: 'center', gap: 8,
                        padding: '6px 16px', background: 'rgba(37,99,235,0.04)',
                        borderBottom: '1px solid var(--border)', borderTop: '1px solid var(--border)',
                      }}>
                        <Tag size={11} style={{ color: 'var(--primary)' }} />
                        <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--primary)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>{cat}</span>
                        <span style={{ fontSize: 11, color: 'var(--muted-foreground)', marginLeft: 4 }}>({itens.length})</span>
                      </div>

                      <Table>
                        <TableHeader>
                          <TableRow style={{ background: 'var(--muted)/30' }}>
                            <TableHead style={{ width: 36 }} />
                            <TableHead>Descrição</TableHead>
                            <TableHead style={{ width: 80, textAlign: 'center' }}>Unidade</TableHead>
                            <TableHead style={{ width: 120, textAlign: 'right' }}>Preço Unit.</TableHead>
                            <TableHead style={{ width: 80, textAlign: 'center' }}>Status</TableHead>
                            <TableHead style={{ width: 80, textAlign: 'right' }}>Ações</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {itens.map((item, idx) => (
                            <TableRow key={item.id} style={{ background: idx % 2 === 0 ? 'transparent' : 'var(--muted)/20' }}>
                              {/* Número */}
                              <TableCell style={{ textAlign: 'center', color: 'var(--muted-foreground)', fontSize: 11, fontFamily: 'monospace' }}>
                                {String(idx + 1).padStart(2, '0')}
                              </TableCell>

                              {/* Descrição */}
                              <TableCell>
                                <span style={{ fontWeight: 500, fontSize: 13 }}>{item.descricao}</span>
                              </TableCell>

                              {/* Unidade */}
                              <TableCell style={{ textAlign: 'center' }}>
                                <span style={{ fontSize: 12, padding: '2px 8px', borderRadius: 4, background: 'var(--muted)', fontFamily: 'monospace', fontWeight: 600 }}>
                                  {item.unidade}
                                </span>
                              </TableCell>

                              {/* Preço */}
                              <TableCell style={{ textAlign: 'right' }}>
                                <span style={{ fontWeight: 700, fontSize: 14, color: '#15803d' }}>
                                  {formatCurrency(item.preco_unitario)}
                                </span>
                              </TableCell>

                              {/* Status */}
                              <TableCell style={{ textAlign: 'center' }}>
                                <span style={{
                                  fontSize: 11, padding: '2px 8px', borderRadius: 999,
                                  background: item.ativo ? 'rgba(22,163,74,0.1)' : 'rgba(220,38,38,0.1)',
                                  color: item.ativo ? '#15803d' : '#dc2626', fontWeight: 600,
                                }}>
                                  {item.ativo ? 'Ativo' : 'Inativo'}
                                </span>
                              </TableCell>

                              {/* Ações */}
                              <TableCell style={{ textAlign: 'right' }}>
                                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 2 }}>
                                  {canEdit && (
                                    <Button variant="ghost" size="icon" style={{ width: 30, height: 30 }} onClick={() => openEdit(item)}>
                                      <Pencil size={13} />
                                    </Button>
                                  )}
                                  {canDelete && (
                                    itensComProd.has(item.id) ? (
                                      <span title="Não pode excluir: há produção lançada vinculada a este serviço" style={{ display: 'inline-flex', cursor: 'not-allowed' }}>
                                        <Button variant="ghost" size="icon" disabled tabIndex={-1}
                                          style={{ width: 30, height: 30, opacity: 0.25, pointerEvents: 'none', color: '#9ca3af' }}>
                                          <Trash2 size={13} />
                                        </Button>
                                      </span>
                                    ) : (
                                      <Button variant="ghost" size="icon" style={{ width: 30, height: 30, color: '#dc2626' }}
                                        title="Excluir serviço"
                                        onClick={() => setDeleteTarget(item)}>
                                        <Trash2 size={13} />
                                      </Button>
                                    )
                                  )}
                                </div>
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                  ))}

                  {/* Rodapé total */}
                  <div style={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'center', gap: 16, padding: '10px 16px', borderTop: '2px solid var(--border)', background: 'var(--muted)' }}>
                    <span style={{ fontSize: 12, color: 'var(--muted-foreground)' }}>{itensObra.length} serviços cadastrados</span>
                    <span style={{ fontSize: 13, fontWeight: 700, color: '#15803d' }}>
                      Total tabela: {formatCurrency(totalObra)}
                    </span>
                  </div>
                </>
              )}
            </div>
          )}
        </div>
      )}

      {/* ══ Modal Novo / Editar Serviço ═══════════════════════════════════════ */}
      <Dialog open={modal} onOpenChange={setModal}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <Tag size={16} style={{ color: 'var(--primary)' }} />
              {editItem ? 'Editar Serviço' : 'Novo Serviço'}
              {obraSel && <span style={{ fontSize: 12, fontWeight: 400, color: 'var(--muted-foreground)', marginLeft: 4 }}>— {obraSel.nome}</span>}
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4 py-2">
            {/* Descrição */}
            <div className="flex flex-col gap-1">
              <Label className="text-xs text-muted-foreground">Descrição *</Label>
              <Input value={form.descricao} onChange={e => setF('descricao', e.target.value)} placeholder="Ex.: Reboco externo, Concretagem laje…" />
            </div>

            {/* Categoria + Unidade */}
            <div className="grid grid-cols-2 gap-3">
              <div className="flex flex-col gap-1">
                <Label className="text-xs text-muted-foreground">Categoria</Label>
                <Select value={form.categoria ?? 'sem_categoria'} onValueChange={v => setF('categoria', v === 'sem_categoria' ? null : v)}>
                  <SelectTrigger><SelectValue placeholder="Selecione…" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="sem_categoria">— Sem categoria —</SelectItem>
                    {CATEGORIAS.map(cat => <SelectItem key={cat} value={cat}>{cat}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="flex flex-col gap-1">
                <Label className="text-xs text-muted-foreground">Unidade *</Label>
                <Select value={form.unidade} onValueChange={v => setF('unidade', v)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {UNIDADES.map(u => <SelectItem key={u} value={u}>{u}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Preço */}
            <div className="flex flex-col gap-1">
              <Label className="text-xs text-muted-foreground">Preço Unitário (R$) *</Label>
              <Input
                type="number" step="0.01" min="0"
                value={form.preco_unitario || ''}
                onChange={e => setF('preco_unitario', parseFloat(e.target.value) || 0)}
                placeholder="0,00"
              />
            </div>

            {/* Status */}
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => setF('ativo', !form.ativo)}
                className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${form.ativo ? 'bg-primary' : 'bg-muted-foreground/30'}`}
              >
                <span className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${form.ativo ? 'translate-x-6' : 'translate-x-1'}`} />
              </button>
              <Label className="text-sm cursor-pointer" onClick={() => setF('ativo', !form.ativo)}>
                {form.ativo ? 'Ativo' : 'Inativo'}
              </Label>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setModal(false)}>Cancelar</Button>
            <Button disabled={saving} onClick={handleSave}>{saving ? 'Salvando…' : editItem ? 'Salvar' : 'Criar'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ══ AlertDialog Excluir ═══════════════════════════════════════════════ */}
      <AlertDialog open={!!deleteTarget} onOpenChange={open => !open && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir serviço?</AlertDialogTitle>
            <AlertDialogDescription>
              O serviço <strong>"{deleteTarget?.descricao}"</strong> será removido permanentemente do playbook desta obra.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} style={{ background: '#dc2626', color: '#fff' }}>
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

    </div>
  )
}
