import React, { useEffect, useState, useCallback } from 'react'
import { toast } from 'sonner'
import { Plus, Search, Pencil, Trash2, AlertTriangle } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import type { Acidente, Colaborador, Obra } from '@/lib/supabase'
import { formatDate, cn } from '@/lib/utils'
import { PageHeader, BadgeStatus, EmptyState, LoadingSkeleton } from '@/components/Shared'
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

type AcidenteRow = Acidente & {
  colaboradores: Pick<Colaborador, 'nome' | 'chapa'> | null
  obras: Pick<Obra, 'nome'> | null
}

type FormData = {
  colaborador_id: string
  obra_id: string
  data_ocorrencia: string
  hora_acidente: string
  tipo: Acidente['tipo'] | ''
  gravidade: Acidente['gravidade'] | ''
  descricao: string
  local_acidente: string

  cat_emitida: boolean
  status: Acidente['status']
  observacoes: string
}

const EMPTY_FORM: FormData = {
  colaborador_id: '',
  obra_id: '',
  data_ocorrencia: '',
  hora_acidente: '',
  tipo: '',
  gravidade: '',
  descricao: '',
  local_acidente: '',

  cat_emitida: false,
  status: 'em_investigacao',
  observacoes: '',
}

// ─── badges de gravidade ──────────────────────────────────────────────────────

const GRAVIDADE_COLORS: Record<string, string> = {
  leve: 'bg-emerald-100 text-emerald-800',
  moderado: 'bg-yellow-100 text-yellow-800',
  grave: 'bg-orange-100 text-orange-800',
  fatal: 'bg-red-100 text-red-800',
}

const GRAVIDADE_LABELS: Record<string, string> = {
  leve: 'Leve',
  moderado: 'Moderado',
  grave: 'Grave',
  fatal: 'Fatal',
}

const TIPO_LABELS: Record<string, string> = {
  tipico: 'Típico',
  trajeto: 'Trajeto',
  doenca_ocupacional: 'Doença Ocupacional',
}

function GravBadge({ gravidade }: { gravidade: string | null }) {
  if (!gravidade) return <span className="text-muted-foreground text-xs">—</span>
  return (
    <span
      className={cn(
        'inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium',
        GRAVIDADE_COLORS[gravidade] ?? 'bg-gray-100 text-gray-600',
      )}
    >
      {GRAVIDADE_LABELS[gravidade] ?? gravidade}
    </span>
  )
}

// ─── componente principal ─────────────────────────────────────────────────────

export default function Acidentes() {
  const [acidentes, setAcidentes] = useState<AcidenteRow[]>([])
  const [colaboradores, setColaboradores] = useState<Colaborador[]>([])
  const [obras, setObras] = useState<Obra[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  // filtros
  const [search, setSearch] = useState('')
  const [filterTipo, setFilterTipo] = useState<string>('todos')
  const [filterGravidade, setFilterGravidade] = useState<string>('todos')
  const [filterStatus, setFilterStatus] = useState<string>('todos')

  // modal
  const [modalOpen, setModalOpen] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [form, setForm] = useState<FormData>(EMPTY_FORM)

  // exclusão
  const [deleteId, setDeleteId] = useState<string | null>(null)

  // ── carregamento ────────────────────────────────────────────────────────────

  const fetchData = useCallback(async () => {
    setLoading(true)
    const [{ data: ac }, { data: col }, { data: ob }] = await Promise.all([
      supabase
        .from('acidentes')
        .select('*, colaboradores(nome,chapa), obras(nome)')
        .order('data_ocorrencia', { ascending: false }),
      supabase.from('colaboradores').select('*').eq('status', 'ativo').order('nome'),
      supabase.from('obras').select('*').order('nome'),
    ])
    if (ac) setAcidentes(ac as AcidenteRow[])
    if (col) setColaboradores(col as Colaborador[])
    if (ob) setObras(ob as Obra[])
    setLoading(false)
  }, [])

  useEffect(() => { fetchData() }, [fetchData])

  // ── filtros ─────────────────────────────────────────────────────────────────

  const filtered = acidentes.filter((a) => {
    const termo = search.toLowerCase()
    const matchSearch =
      !termo ||
      (a.colaboradores?.nome ?? '').toLowerCase().includes(termo) ||
      a.descricao.toLowerCase().includes(termo)
    const matchTipo = filterTipo === 'todos' || a.tipo === filterTipo
    const matchGrav = filterGravidade === 'todos' || a.gravidade === filterGravidade
    const matchStatus = filterStatus === 'todos' || a.status === filterStatus
    return matchSearch && matchTipo && matchGrav && matchStatus
  })

  // ── modal helpers ───────────────────────────────────────────────────────────

  function openCreate() {
    setEditingId(null)
    setForm(EMPTY_FORM)
    setModalOpen(true)
  }

  function openEdit(a: AcidenteRow) {
    setEditingId(a.id)
    setForm({
      colaborador_id: a.colaborador_id ?? '',
      obra_id: a.obra_id ?? '',
      data_ocorrencia: a.data_ocorrencia,
      hora_acidente: a.hora_acidente ?? '',
      tipo: a.tipo ?? '',
      gravidade: a.gravidade ?? '',
      descricao: a.descricao,
      local_acidente: a.local_acidente ?? '',

      cat_emitida: a.cat_emitida,
      status: a.status,
      observacoes: a.observacoes ?? '',
    })
    setModalOpen(true)
  }

  function setF<K extends keyof FormData>(key: K, value: FormData[K]) {
    setForm((prev) => ({ ...prev, [key]: value }))
  }

  // ── salvar ──────────────────────────────────────────────────────────────────

  async function handleSave() {
    if (!form.data_ocorrencia || !form.descricao) {
      toast.error('Preencha os campos obrigatórios (data e descrição).')
      return
    }
    setSaving(true)

    const payload: Partial<Acidente> = {
      colaborador_id: form.colaborador_id || null,
      obra_id: form.obra_id || null,
      data_ocorrencia: form.data_ocorrencia,
      hora_acidente: form.hora_acidente || null,
      tipo: (form.tipo as Acidente['tipo']) || null,
      gravidade: (form.gravidade as Acidente['gravidade']) || null,
      descricao: form.descricao,
      local_acidente: form.local_acidente || null,

      cat_emitida: form.cat_emitida,
      status: form.status,
      observacoes: form.observacoes || null,
    }

    const { error } = editingId
      ? await supabase.from('acidentes').update(payload).eq('id', editingId)
      : await supabase.from('acidentes').insert(payload)

    setSaving(false)
    if (error) {
      toast.error('Erro ao salvar acidente: ' + error.message)
      return
    }
    toast.success(editingId ? 'Acidente atualizado!' : 'Acidente registrado!')
    setModalOpen(false)
    fetchData()
  }

  // ── excluir ─────────────────────────────────────────────────────────────────

  async function handleDelete() {
    if (!deleteId) return
    const { error } = await supabase.from('acidentes').delete().eq('id', deleteId)
    if (error) {
      toast.error('Erro ao excluir: ' + error.message)
    } else {
      toast.success('Acidente excluído.')
      fetchData()
    }
    setDeleteId(null)
  }

  // ── render ──────────────────────────────────────────────────────────────────

  return (
    <div className="page-root">
      <PageHeader
        title="Acidentes de Trabalho"
        subtitle={`${filtered.length} registro(s)`}
        action={
          <Button onClick={openCreate} size="sm">
            <Plus className="w-4 h-4 mr-1" /> Novo Acidente
          </Button>
        }
      />

      {/* filtros */}
      <div className="flex flex-wrap gap-3 mb-5">
        <div className="relative flex-1 min-w-48">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="Buscar colaborador ou descrição…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
        <Select value={filterTipo} onValueChange={setFilterTipo}>
          <SelectTrigger className="w-48">
            <SelectValue placeholder="Tipo" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="todos">Todos os tipos</SelectItem>
            <SelectItem value="tipico">Típico</SelectItem>
            <SelectItem value="trajeto">Trajeto</SelectItem>
            <SelectItem value="doenca_ocupacional">Doença Ocupacional</SelectItem>
          </SelectContent>
        </Select>
        <Select value={filterGravidade} onValueChange={setFilterGravidade}>
          <SelectTrigger className="w-44">
            <SelectValue placeholder="Gravidade" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="todos">Todas as gravidades</SelectItem>
            <SelectItem value="leve">Leve</SelectItem>
            <SelectItem value="moderado">Moderado</SelectItem>
            <SelectItem value="grave">Grave</SelectItem>
            <SelectItem value="fatal">Fatal</SelectItem>
          </SelectContent>
        </Select>
        <Select value={filterStatus} onValueChange={setFilterStatus}>
          <SelectTrigger className="w-44">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="todos">Todos os status</SelectItem>
            <SelectItem value="em_investigacao">Em Investigação</SelectItem>
            <SelectItem value="concluido">Concluído</SelectItem>
            <SelectItem value="arquivado">Arquivado</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* tabela */}
      {loading ? (
        <LoadingSkeleton />
      ) : filtered.length === 0 ? (
        <EmptyState
          icon={<AlertTriangle className="w-8 h-8" />}
          title="Nenhum acidente encontrado"
          description="Ajuste os filtros ou registre um novo acidente."
        />
      ) : (
        <div className="border rounded-lg overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/40">
                <TableHead>Colaborador</TableHead>
                <TableHead>Obra</TableHead>
                <TableHead>Data</TableHead>
                <TableHead>Tipo</TableHead>
                <TableHead>Gravidade</TableHead>
                <TableHead className="text-center">Afastamento</TableHead>
                <TableHead className="text-center">CAT</TableHead>
                <TableHead>Status</TableHead>
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
                  <TableCell className="text-sm">{a.obras?.nome ?? '—'}</TableCell>
                  <TableCell className="text-sm whitespace-nowrap">{formatDate(a.data_ocorrencia)}</TableCell>
                  <TableCell className="text-sm">{a.tipo ? TIPO_LABELS[a.tipo] : '—'}</TableCell>
                  <TableCell><GravBadge gravidade={a.gravidade} /></TableCell>
                  <TableCell className="text-center">
                    <span className="text-muted-foreground text-xs">—</span>
                  </TableCell>
                  <TableCell className="text-center">
                    <Badge variant={a.cat_emitida ? 'default' : 'outline'} className="text-xs">
                      {a.cat_emitida ? 'Sim' : 'Não'}
                    </Badge>
                  </TableCell>
                  <TableCell><BadgeStatus status={a.status} /></TableCell>
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
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingId ? 'Editar Acidente' : 'Registrar Acidente'}</DialogTitle>
          </DialogHeader>

          <div className="grid grid-cols-2 gap-4 py-2">
            {/* colaborador */}
            <div className="space-y-1.5">
              <Label>Colaborador</Label>
              <Select value={form.colaborador_id} onValueChange={(v) => setF('colaborador_id', v)}>
                <SelectTrigger>
                  <SelectValue placeholder="Selecione…" />
                </SelectTrigger>
                <SelectContent>
                  {colaboradores.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.nome}{c.chapa ? ` — #${c.chapa}` : ''}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* obra */}
            <div className="space-y-1.5">
              <Label>Obra</Label>
              <Select value={form.obra_id} onValueChange={(v) => setF('obra_id', v)}>
                <SelectTrigger>
                  <SelectValue placeholder="Selecione…" />
                </SelectTrigger>
                <SelectContent>
                  {obras.map((o) => (
                    <SelectItem key={o.id} value={o.id}>{o.nome}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* data */}
            <div className="space-y-1.5">
              <Label>Data do Acidente <span className="text-destructive">*</span></Label>
              <Input
                type="date"
                value={form.data_ocorrencia}
                onChange={(e) => setF('data_ocorrencia', e.target.value)}
              />
            </div>

            {/* hora */}
            <div className="space-y-1.5">
              <Label>Hora do Acidente</Label>
              <Input
                type="time"
                value={form.hora_acidente}
                onChange={(e) => setF('hora_acidente', e.target.value)}
              />
            </div>

            {/* tipo */}
            <div className="space-y-1.5">
              <Label>Tipo</Label>
              <Select
                value={form.tipo ?? ''}
                onValueChange={(v) => setF('tipo', v as Acidente['tipo'])}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Selecione…" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="tipico">Típico</SelectItem>
                  <SelectItem value="trajeto">Trajeto</SelectItem>
                  <SelectItem value="doenca_ocupacional">Doença Ocupacional</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* gravidade */}
            <div className="space-y-1.5">
              <Label>Gravidade</Label>
              <Select
                value={form.gravidade ?? ''}
                onValueChange={(v) => setF('gravidade', v as Acidente['gravidade'])}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Selecione…" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="leve">Leve</SelectItem>
                  <SelectItem value="moderado">Moderado</SelectItem>
                  <SelectItem value="grave">Grave</SelectItem>
                  <SelectItem value="fatal">Fatal</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* local */}
            <div className="col-span-2 space-y-1.5">
              <Label>Local do Acidente</Label>
              <Input
                value={form.local_acidente}
                onChange={(e) => setF('local_acidente', e.target.value)}
                placeholder="Descreva o local…"
              />
            </div>

            {/* descrição */}
            <div className="col-span-2 space-y-1.5">
              <Label>Descrição <span className="text-destructive">*</span></Label>
              <Textarea
                value={form.descricao}
                onChange={(e) => setF('descricao', e.target.value)}
                placeholder="Descreva o acidente…"
                rows={3}
              />
            </div>



            {/* CAT switch */}
            <div className="flex items-center gap-3">
              <Switch
                checked={form.cat_emitida}
                onCheckedChange={(v) => setF('cat_emitida', v)}
              />
              <Label className="cursor-pointer">CAT Emitida</Label>
            </div>

            {/* status */}
            <div className="space-y-1.5">
              <Label>Status</Label>
              <Select
                value={form.status}
                onValueChange={(v) => setF('status', v as Acidente['status'])}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="em_investigacao">Em Investigação</SelectItem>
                  <SelectItem value="concluido">Concluído</SelectItem>
                  <SelectItem value="arquivado">Arquivado</SelectItem>
                </SelectContent>
              </Select>
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
              Esta ação não pode ser desfeita. O registro de acidente será excluído permanentemente.
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
