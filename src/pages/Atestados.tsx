import React, { useEffect, useState, useCallback, useMemo } from 'react'
import { toast } from 'sonner'
import { Plus, Search, Pencil, Trash2, FileText, CalendarDays } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import type { Atestado, Colaborador } from '@/lib/supabase'
import { formatDate, cn } from '@/lib/utils'
import { PageHeader, EmptyState, LoadingSkeleton } from '@/components/Shared'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Switch } from '@/components/ui/switch'
import { Badge } from '@/components/ui/badge'
import { traduzirErro } from '@/lib/erros'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'

// ─── tipos ───────────────────────────────────────────────────────────────────

type AtestadoRow = Atestado & {
  colaboradores: Pick<Colaborador, 'nome' | 'chapa'> | null
}

type FormData = {
  colaborador_id: string
  tipo: Atestado['tipo'] | ''
  data: string
  com_afastamento: boolean
  dias_afastamento: string
  cid: string
  medico: string
  descricao: string
  observacoes: string
}

const EMPTY_FORM: FormData = {
  colaborador_id: '',
  tipo: '',
  data: '',
  com_afastamento: false,
  dias_afastamento: '0',
  cid: '',
  medico: '',
  descricao: '',
  observacoes: '',
}

const TIPO_LABELS: Record<string, string> = {
  medico: 'Médico',
  comparecimento: 'Comparecimento',
  declaracao: 'Declaração',
}

const TIPO_COLORS: Record<string, string> = {
  medico: 'bg-blue-100 text-blue-800',
  comparecimento: 'bg-purple-100 text-purple-800',
  declaracao: 'bg-gray-100 text-gray-700',
}

function TipoBadge({ tipo }: { tipo: string | null }) {
  if (!tipo) return <span className="text-muted-foreground text-xs">—</span>
  return (
    <span
      className={cn(
        'inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium',
        TIPO_COLORS[tipo] ?? 'bg-gray-100 text-gray-600',
      )}
    >
      {TIPO_LABELS[tipo] ?? tipo}
    </span>
  )
}

// ─── componente principal ─────────────────────────────────────────────────────

export default function Atestados() {
  const [atestados, setAtestados] = useState<AtestadoRow[]>([])
  const [colaboradores, setColaboradores] = useState<Colaborador[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  // filtros
  const [search, setSearch] = useState('')
  const [filterTipo, setFilterTipo] = useState<string>('todos')
  const [filterMes, setFilterMes] = useState<string>('')   // formato "yyyy-MM"

  // modal
  const [modalOpen, setModalOpen] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [form, setForm] = useState<FormData>(EMPTY_FORM)
  const [colSearch, setColSearch] = useState('')

  // exclusão
  const [deleteId, setDeleteId] = useState<string | null>(null)

  // ── carregamento ────────────────────────────────────────────────────────────

  const fetchData = useCallback(async () => {
    setLoading(true)
    const [{ data: at }, { data: col }] = await Promise.all([
      supabase
        .from('atestados')
        .select('*, colaboradores(nome,chapa)')
        .order('data', { ascending: false }),
      supabase.from('colaboradores').select('*').eq('status', 'ativo').order('nome'),
    ])
    if (at) setAtestados(at as AtestadoRow[])
    if (col) setColaboradores(col as Colaborador[])
    setLoading(false)
  }, [])

  useEffect(() => { fetchData() }, [fetchData])

  // ── filtros + totalizadores ─────────────────────────────────────────────────

  const filtered = useMemo(() => {
    return atestados.filter((a) => {
      const termo = search.toLowerCase()
      const matchSearch =
        !termo || (a.colaboradores?.nome ?? '').toLowerCase().includes(termo)
      const matchTipo = filterTipo === 'todos' || a.tipo === filterTipo
      const matchMes = !filterMes || a.data.startsWith(filterMes)
      return matchSearch && matchTipo && matchMes
    })
  }, [atestados, search, filterTipo, filterMes])

  const totalDiasMes = useMemo(() => {
    return filtered
      .filter((a) => a.com_afastamento)
      .reduce((sum, a) => sum + (a.dias_afastamento ?? 0), 0)
  }, [filtered])

  // ── modal helpers ───────────────────────────────────────────────────────────

  function openCreate() {
    setEditingId(null)
    setForm(EMPTY_FORM)
    setColSearch('')
    setModalOpen(true)
  }

  function openEdit(a: AtestadoRow) {
    setEditingId(a.id)
    setForm({
      colaborador_id: a.colaborador_id,
      tipo: a.tipo ?? '',
      data: a.data,
      com_afastamento: a.com_afastamento,
      dias_afastamento: String(a.dias_afastamento ?? 0),
      cid: a.cid ?? '',
      medico: a.medico ?? '',
      descricao: a.descricao ?? '',
      observacoes: a.observacoes ?? '',
    })
    setColSearch('')
    setModalOpen(true)
  }

  function setF<K extends keyof FormData>(key: K, value: FormData[K]) {
    setForm((prev) => ({ ...prev, [key]: value }))
  }

  const colsFiltrados = useMemo(
    () =>
      colSearch.trim()
        ? colaboradores.filter((c) =>
            c.nome.toLowerCase().includes(colSearch.toLowerCase()) ||
            (c.chapa ?? '').toLowerCase().includes(colSearch.toLowerCase()),
          )
        : colaboradores,
    [colaboradores, colSearch],
  )

  // ── salvar ──────────────────────────────────────────────────────────────────

  async function handleSave() {
    if (!form.colaborador_id || !form.data) {
      toast.error('Preencha os campos obrigatórios (colaborador e data).')
      return
    }
    setSaving(true)

    const payload: Partial<Atestado> = {
      colaborador_id: form.colaborador_id,
      tipo: (form.tipo as Atestado['tipo']) || null,
      data: form.data,
      com_afastamento: form.com_afastamento,
      dias_afastamento: form.com_afastamento ? Number(form.dias_afastamento) : 0,
      cid: form.cid || null,
      medico: form.medico || null,
      descricao: form.descricao || null,
      observacoes: form.observacoes || null,
    }

    const { error } = editingId
      ? await supabase.from('atestados').update(payload).eq('id', editingId)
      : await supabase.from('atestados').insert(payload)

    setSaving(false)
    if (error) {
      toast.error('Erro ao salvar atestado: ' + error.message)
      return
    }
    toast.success(editingId ? 'Atestado atualizado!' : 'Atestado registrado!')
    setModalOpen(false)
    fetchData()
  }

  // ── excluir ─────────────────────────────────────────────────────────────────

  async function handleDelete() {
    if (!deleteId) return
    const { error } = await supabase.from('atestados').delete().eq('id', deleteId)
    if (error) {
      toast.error('Erro ao excluir: ' + error.message)
    } else {
      toast.success('Atestado excluído.')
      fetchData()
    }
    setDeleteId(null)
  }

  // ── render ──────────────────────────────────────────────────────────────────

  return (
    <div className="page-root">
      <PageHeader
        title="Atestados Médicos"
        subtitle={`${filtered.length} registro(s)`}
        action={
          <Button onClick={openCreate} size="sm">
            <Plus className="w-4 h-4 mr-1" /> Novo Atestado
          </Button>
        }
      />

      {/* indicador de dias */}
      {(filterMes || search) && totalDiasMes > 0 && (
        <div className="mb-4 flex items-center gap-2 p-3 bg-orange-50 border border-orange-200 rounded-lg text-sm text-orange-800">
          <CalendarDays className="w-4 h-4 flex-shrink-0" />
          <span>
            Total de <strong>{totalDiasMes}</strong> dia(s) de afastamento no período filtrado.
          </span>
        </div>
      )}

      {/* filtros */}
      <div className="flex flex-wrap gap-3 mb-5">
        <div className="relative flex-1 min-w-48">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="Buscar colaborador…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
        <Select value={filterTipo} onValueChange={setFilterTipo}>
          <SelectTrigger className="w-44">
            <SelectValue placeholder="Tipo" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="todos">Todos os tipos</SelectItem>
            <SelectItem value="medico">Médico</SelectItem>
            <SelectItem value="comparecimento">Comparecimento</SelectItem>
            <SelectItem value="declaracao">Declaração</SelectItem>
          </SelectContent>
        </Select>
        <div className="space-y-0">
          <Input
            type="month"
            value={filterMes}
            onChange={(e) => setFilterMes(e.target.value)}
            className="w-44"
            title="Filtrar por mês/ano"
          />
        </div>
      </div>

      {/* tabela */}
      {loading ? (
        <LoadingSkeleton />
      ) : filtered.length === 0 ? (
        <EmptyState
          icon={<FileText className="w-8 h-8" />}
          title="Nenhum atestado encontrado"
          description="Ajuste os filtros ou registre um novo atestado."
        />
      ) : (
        <div className="border rounded-lg overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/40">
                <TableHead>Colaborador</TableHead>
                <TableHead>Data</TableHead>
                <TableHead>Tipo</TableHead>
                <TableHead className="text-center">Dias Afastamento</TableHead>
                <TableHead>CID</TableHead>
                <TableHead>Médico</TableHead>
                <TableHead>Observações</TableHead>
                <TableHead className="text-right">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((a) => (
                <TableRow key={a.id} className="hover:bg-muted/30">
                  <TableCell>
                    <div className="font-medium text-sm">{a.colaboradores?.nome ?? '—'}</div>
                    {a.colaboradores?.chapa && (
                      <div className="text-xs text-muted-foreground">#{a.colaboradores.chapa}</div>
                    )}
                  </TableCell>
                  <TableCell className="text-sm whitespace-nowrap">{formatDate(a.data)}</TableCell>
                  <TableCell><TipoBadge tipo={a.tipo} /></TableCell>
                  <TableCell className="text-center">
                    {a.com_afastamento ? (
                      <Badge variant="destructive" className="text-xs">
                        {a.dias_afastamento}d
                      </Badge>
                    ) : (
                      <span className="text-xs text-muted-foreground">—</span>
                    )}
                  </TableCell>
                  <TableCell className="text-sm font-mono">{a.cid ?? '—'}</TableCell>
                  <TableCell className="text-sm">{a.medico ?? '—'}</TableCell>
                  <TableCell className="text-sm max-w-xs truncate text-muted-foreground">
                    {a.observacoes ?? '—'}
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-1">
                      <Button variant="ghost" size="icon" onClick={() => openEdit(a)}>
                        <Pencil className="w-4 h-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="text-destructive hover:text-destructive"
                        onClick={() => setDeleteId(a.id)}
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      {/* ── modal criar/editar ── */}
      <Dialog open={modalOpen} onOpenChange={setModalOpen}>
        <DialogContent className="max-w-xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingId ? 'Editar Atestado' : 'Registrar Atestado'}</DialogTitle>
          </DialogHeader>

          <div className="grid grid-cols-2 gap-4 py-2">
            {/* busca de colaborador */}
            <div className="col-span-2 space-y-1.5">
              <Label>Colaborador <span className="text-destructive">*</span></Label>
              <Input
                placeholder="Buscar por nome ou chapa…"
                value={colSearch}
                onChange={(e) => setColSearch(e.target.value)}
                className="mb-1"
              />
              <Select
                value={form.colaborador_id}
                onValueChange={(v) => setF('colaborador_id', v)}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Selecione o colaborador…" />
                </SelectTrigger>
                <SelectContent>
                  {colsFiltrados.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.nome}{c.chapa ? ` — #${c.chapa}` : ''}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* tipo */}
            <div className="space-y-1.5">
              <Label>Tipo</Label>
              <Select
                value={form.tipo ?? ''}
                onValueChange={(v) => setF('tipo', v as Atestado['tipo'])}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Selecione…" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="medico">Médico</SelectItem>
                  <SelectItem value="comparecimento">Comparecimento</SelectItem>
                  <SelectItem value="declaracao">Declaração</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* data */}
            <div className="space-y-1.5">
              <Label>Data <span className="text-destructive">*</span></Label>
              <Input
                type="date"
                value={form.data}
                onChange={(e) => setF('data', e.target.value)}
              />
            </div>

            {/* afastamento switch */}
            <div className="col-span-2 flex items-center gap-3">
              <Switch
                checked={form.com_afastamento}
                onCheckedChange={(v) => setF('com_afastamento', v)}
              />
              <Label className="cursor-pointer">Com afastamento</Label>
            </div>

            {/* dias */}
            {form.com_afastamento && (
              <div className="space-y-1.5">
                <Label>Dias de Afastamento</Label>
                <Input
                  type="number"
                  min={0}
                  value={form.dias_afastamento}
                  onChange={(e) => setF('dias_afastamento', e.target.value)}
                />
              </div>
            )}

            {/* CID */}
            <div className="space-y-1.5">
              <Label>CID</Label>
              <Input
                value={form.cid}
                onChange={(e) => setF('cid', e.target.value)}
                placeholder="ex: J11"
              />
            </div>

            {/* médico */}
            <div className="col-span-2 space-y-1.5">
              <Label>Médico</Label>
              <Input
                value={form.medico}
                onChange={(e) => setF('medico', e.target.value)}
                placeholder="Nome do médico…"
              />
            </div>

            {/* descrição */}
            <div className="col-span-2 space-y-1.5">
              <Label>Descrição</Label>
              <Textarea
                value={form.descricao}
                onChange={(e) => setF('descricao', e.target.value)}
                rows={2}
                placeholder="Descrição do atestado…"
              />
            </div>

            {/* observações */}
            <div className="col-span-2 space-y-1.5">
              <Label>Observações</Label>
              <Textarea
                value={form.observacoes}
                onChange={(e) => setF('observacoes', e.target.value)}
                rows={2}
                placeholder="Observações adicionais…"
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setModalOpen(false)} disabled={saving}>
              Cancelar
            </Button>
            <Button onClick={handleSave} disabled={saving}>
              {saving ? 'Salvando…' : editingId ? 'Atualizar' : 'Registrar'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── alert dialog exclusão ── */}
      <AlertDialog open={!!deleteId} onOpenChange={(o) => { if (!o) setDeleteId(null) }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Confirmar exclusão</AlertDialogTitle>
            <AlertDialogDescription>
              Esta ação não pode ser desfeita. O atestado será excluído permanentemente.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
